"""Batch URL validation for opportunities in Supabase.

Checks all active opportunity URLs via HEAD requests and marks dead ones
as is_active=false. Run this periodically to keep the database clean.

Usage:
    python scripts/validate_urls.py                     # Validate first 500 unverified
    python scripts/validate_urls.py --batch-size 2000   # Validate 2000
    python scripts/validate_urls.py --max-age-days 7    # Re-validate anything older than 7 days
    python scripts/validate_urls.py --dry-run            # Preview without updating DB
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

# Load env from project root
env_path = Path(__file__).parent.parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)

from supabase import create_client

try:
    import aiohttp
except ImportError:
    print("ERROR: aiohttp is required. Install with: pip install aiohttp")
    sys.exit(1)

# ── Configuration ──────────────────────────────────────────────
CONCURRENT_CONNECTIONS = 30
REQUEST_TIMEOUT = 10  # seconds per URL (edu/org sites can be slow)
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# URLs matching these patterns are guaranteed dead — skip validation
KNOWN_DEAD_PATTERNS = [
    "example.com",
    "placeholder",
    "localhost",
    "127.0.0.1",
]


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local")
        sys.exit(1)
    return create_client(url, key)


async def validate_url(session: aiohttp.ClientSession, url: str) -> dict:
    """Check if a URL is alive via HEAD request, falling back to GET."""
    if not url or not url.startswith("http"):
        return {"alive": False, "status": 0, "error": "invalid_url"}

    # Check known-dead patterns
    url_lower = url.lower()
    for pattern in KNOWN_DEAD_PATTERNS:
        if pattern in url_lower:
            return {"alive": False, "status": 404, "error": f"known_dead:{pattern}"}

    try:
        timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)

        # Try HEAD first (cheapest)
        async with session.head(url, allow_redirects=True, timeout=timeout) as resp:
            if resp.status < 400:
                return {"alive": True, "status": resp.status, "final_url": str(resp.url)}

            # Some servers reject HEAD — try GET with Range header
            if resp.status in (405, 403):
                async with session.get(
                    url,
                    allow_redirects=True,
                    timeout=timeout,
                    headers={"Range": "bytes=0-0"},
                ) as get_resp:
                    alive = get_resp.status < 400 or get_resp.status == 206
                    return {"alive": alive, "status": get_resp.status, "final_url": str(get_resp.url)}

            return {"alive": False, "status": resp.status}

    except asyncio.TimeoutError:
        return {"alive": False, "status": 0, "error": "timeout"}
    except aiohttp.ClientError as e:
        return {"alive": False, "status": 0, "error": str(e)[:100]}
    except Exception as e:
        return {"alive": False, "status": 0, "error": str(e)[:100]}


async def validate_batch(opportunities: list[dict]) -> list[tuple[dict, dict]]:
    """Validate a batch of opportunities concurrently."""
    connector = aiohttp.TCPConnector(limit=CONCURRENT_CONNECTIONS, ssl=False)
    headers = {"User-Agent": USER_AGENT}

    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        tasks = []
        for opp in opportunities:
            url = opp.get("url") or opp.get("application_url") or ""
            tasks.append(validate_url(session, url))

        results = await asyncio.gather(*tasks, return_exceptions=True)

    paired = []
    for opp, result in zip(opportunities, results):
        if isinstance(result, Exception):
            result = {"alive": False, "status": 0, "error": str(result)[:100]}
        paired.append((opp, result))

    return paired


def fetch_opportunities(supabase, batch_size: int, max_age_days: int | None) -> list[dict]:
    """Fetch active opportunities that need validation, paginating past Supabase 1000-row limit."""
    all_opps = []
    offset = 0
    page_size = 1000  # Supabase max per request

    while len(all_opps) < batch_size:
        fetch_count = min(page_size, batch_size - len(all_opps))

        query = (
            supabase.table("opportunities")
            .select("id, url, application_url, title, company, last_verified")
            .eq("is_active", True)
            .order("last_verified", desc=False, nullsfirst=True)
        )

        if max_age_days is not None:
            cutoff = (datetime.utcnow() - timedelta(days=max_age_days)).isoformat()
            query = query.or_(f"last_verified.is.null,last_verified.lt.{cutoff}")

        response = query.range(offset, offset + fetch_count - 1).execute()
        batch = response.data or []
        all_opps.extend(batch)

        if len(batch) < fetch_count:
            break  # No more rows
        offset += fetch_count

    return all_opps


def classify_result(result: dict) -> str:
    """Classify a validation result as 'alive', 'dead', or 'uncertain'."""
    if result["alive"]:
        return "alive"

    error = result.get("error", "")
    status = result.get("status", 0)

    # Definite dead: 404, 410 Gone, invalid URL, known-dead patterns
    if status in (404, 410) or error == "invalid_url" or error.startswith("known_dead:"):
        return "dead"

    # Timeouts and connection errors are uncertain — don't kill them
    if error in ("timeout",) or status == 0:
        return "uncertain"

    # 403 Forbidden could be bot-blocking — uncertain
    if status == 403:
        return "uncertain"

    # Other 4xx/5xx — likely dead
    if status >= 400:
        return "dead"

    return "uncertain"


def update_results(supabase, paired: list[tuple[dict, dict]], dry_run: bool):
    """Update Supabase with validation results."""
    now = datetime.utcnow().isoformat()
    alive_ids = []
    dead_ids = []

    for opp, result in paired:
        classification = classify_result(result)
        if classification == "alive":
            alive_ids.append(opp["id"])
        elif classification == "dead":
            dead_ids.append(opp["id"])
        # "uncertain" — leave as-is, don't update

    if dry_run:
        return

    # Batch update alive opportunities (update last_verified)
    for i in range(0, len(alive_ids), 100):
        batch = alive_ids[i : i + 100]
        supabase.table("opportunities").update(
            {"last_verified": now, "updated_at": now}
        ).in_("id", batch).execute()

    # Batch update dead opportunities (mark inactive)
    for i in range(0, len(dead_ids), 100):
        batch = dead_ids[i : i + 100]
        supabase.table("opportunities").update(
            {"is_active": False, "is_expired": True, "last_verified": now, "updated_at": now}
        ).in_("id", batch).execute()


def main():
    parser = argparse.ArgumentParser(description="Validate opportunity URLs in Supabase")
    parser.add_argument("--batch-size", type=int, default=500, help="Number of URLs to validate (default: 500)")
    parser.add_argument("--max-age-days", type=int, default=None, help="Only validate URLs verified more than N days ago (default: all unverified)")
    parser.add_argument("--dry-run", action="store_true", help="Preview results without updating database")
    args = parser.parse_args()

    supabase = get_supabase()

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Fetching up to {args.batch_size} opportunities to validate...")
    opportunities = fetch_opportunities(supabase, args.batch_size, args.max_age_days)
    print(f"  Found {len(opportunities)} opportunities to check")

    if not opportunities:
        print("  Nothing to validate!")
        return

    never_verified = sum(1 for o in opportunities if not o.get("last_verified"))
    print(f"  {never_verified} never verified, {len(opportunities) - never_verified} need re-verification")

    print(f"\nValidating URLs ({CONCURRENT_CONNECTIONS} concurrent connections, {REQUEST_TIMEOUT}s timeout)...")
    paired = asyncio.run(validate_batch(opportunities))

    # Classify results
    alive = [(opp, r) for opp, r in paired if classify_result(r) == "alive"]
    dead = [(opp, r) for opp, r in paired if classify_result(r) == "dead"]
    uncertain = [(opp, r) for opp, r in paired if classify_result(r) == "uncertain"]

    print(f"\n{'='*60}")
    print(f"Results:")
    print(f"  Alive (verified):     {len(alive)}")
    print(f"  Dead (will remove):   {len(dead)}")
    print(f"  Uncertain (skipped):  {len(uncertain)} (timeouts/403s — left as-is)")
    print(f"{'='*60}")

    if dead:
        print(f"\nDead URLs (first 30):")
        for opp, result in dead[:30]:
            status = result.get("status", "?")
            error = result.get("error", "")
            title = (opp.get("title") or "Unknown")[:50]
            url = (opp.get("url") or opp.get("application_url") or "no url")[:60]
            print(f"  [{status:>3}] {title:<50} {url}")
            if error:
                print(f"         Error: {error}")

    if not args.dry_run:
        print(f"\nUpdating database...")
        update_results(supabase, paired, dry_run=False)
        print(f"  Marked {len(alive)} as verified")
        print(f"  Marked {len(dead)} as inactive/expired")
        print(f"  Skipped {len(uncertain)} uncertain URLs")
    else:
        print(f"\n[DRY RUN] Would mark {len(alive)} as verified, {len(dead)} as inactive, skip {len(uncertain)}")

    print("\nDone!")


if __name__ == "__main__":
    main()
