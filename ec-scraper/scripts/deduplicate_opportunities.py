"""Remove duplicate opportunities from Supabase.

Finds opportunities with the same title (case-insensitive) or same URL,
keeps the best one (most recently verified, or most complete data), and
deactivates the rest.

Usage:
    python scripts/deduplicate_opportunities.py --dry-run   # Preview
    python scripts/deduplicate_opportunities.py              # Actually deactivate dupes
"""

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)

from supabase import create_client


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local")
        sys.exit(1)
    return create_client(url, key)


def score_opportunity(opp: dict) -> int:
    """Score an opportunity — higher = better quality, should be kept."""
    score = 0

    # Prefer verified over unverified
    if opp.get("last_verified"):
        score += 50

    # Prefer ones with real URLs
    url = opp.get("url") or ""
    if url and url.startswith("http"):
        score += 20

    # Prefer ones with descriptions
    desc = opp.get("description") or ""
    if len(desc) > 50:
        score += 15

    # Prefer ones with deadlines
    if opp.get("deadline"):
        score += 10

    # Prefer ones with application URLs
    if opp.get("application_url"):
        score += 10

    # Prefer ones with skills
    skills = opp.get("skills") or []
    if len(skills) > 0:
        score += 5

    # Prefer ones with company/org
    company = opp.get("company") or ""
    if company and company.lower() not in ("unknown", ""):
        score += 5

    # Prefer more recently created
    created = opp.get("created_at") or ""
    if created:
        score += 1  # tiny tiebreaker

    return score


def fetch_all_active(supabase) -> list[dict]:
    """Fetch all active opportunities in batches (Supabase has 1000-row default limit)."""
    all_opps = []
    offset = 0
    batch_size = 1000

    while True:
        resp = (
            supabase.table("opportunities")
            .select("id, title, url, application_url, company, description, deadline, skills, last_verified, created_at")
            .eq("is_active", True)
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_opps.extend(batch)

        if len(batch) < batch_size:
            break
        offset += batch_size

    return all_opps


def find_duplicates(opportunities: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Find duplicate groups by title (case-insensitive).

    Returns: list of (keeper, [duplicates_to_remove])
    """
    # Group by normalized title
    title_groups = defaultdict(list)
    for opp in opportunities:
        title = (opp.get("title") or "").strip().lower()
        if not title or title in ("unknown", ""):
            continue
        title_groups[title].append(opp)

    # Also group by URL (catch same opportunity with different titles)
    url_groups = defaultdict(list)
    for opp in opportunities:
        url = (opp.get("url") or "").strip().lower().rstrip("/")
        if not url or not url.startswith("http"):
            continue
        url_groups[url].append(opp)

    # Merge: collect all IDs that are duplicates
    seen_ids = set()
    duplicate_sets = []

    # Process title-based duplicates
    for title, group in title_groups.items():
        if len(group) <= 1:
            continue

        # Score each, keep the best
        scored = sorted(group, key=score_opportunity, reverse=True)
        keeper = scored[0]
        dupes = scored[1:]

        if keeper["id"] not in seen_ids:
            seen_ids.add(keeper["id"])
            dupe_ids = [d["id"] for d in dupes if d["id"] not in seen_ids]
            seen_ids.update(dupe_ids)
            if dupe_ids:
                actual_dupes = [d for d in dupes if d["id"] in dupe_ids]
                duplicate_sets.append((keeper, actual_dupes))

    # Process URL-based duplicates (for any not caught by title)
    for url, group in url_groups.items():
        if len(group) <= 1:
            continue

        # Filter out already-handled ones
        remaining = [o for o in group if o["id"] not in seen_ids]
        if len(remaining) <= 1:
            # Check if we have unhandled dupes mixed with handled ones
            unhandled = [o for o in group if o["id"] not in seen_ids]
            if not unhandled:
                continue
            # Keep the first unhandled one, mark rest as dupes
            remaining = group

        scored = sorted(remaining, key=score_opportunity, reverse=True)
        keeper = scored[0]
        dupes = [d for d in scored[1:] if d["id"] not in seen_ids]

        if dupes:
            seen_ids.add(keeper["id"])
            for d in dupes:
                seen_ids.add(d["id"])
            duplicate_sets.append((keeper, dupes))

    return duplicate_sets


def main():
    parser = argparse.ArgumentParser(description="Remove duplicate opportunities from Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating database")
    args = parser.parse_args()

    supabase = get_supabase()

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Fetching all active opportunities...")
    opportunities = fetch_all_active(supabase)
    print(f"  Found {len(opportunities)} active opportunities")

    print(f"\nFinding duplicates...")
    duplicate_sets = find_duplicates(opportunities)

    total_dupes = sum(len(dupes) for _, dupes in duplicate_sets)
    print(f"  Found {len(duplicate_sets)} duplicate groups ({total_dupes} duplicates to remove)")

    if not duplicate_sets:
        print("\n  No duplicates found! Database is clean.")
        return

    # Show first 30 duplicate groups
    print(f"\nDuplicate groups (showing first 30):")
    for i, (keeper, dupes) in enumerate(duplicate_sets[:30]):
        title = (keeper.get("title") or "Unknown")[:60]
        print(f"\n  [{i+1}] KEEP: {title}")
        print(f"       URL: {(keeper.get('url') or 'no url')[:70]}")
        print(f"       Score: {score_opportunity(keeper)}")
        for d in dupes:
            d_title = (d.get("title") or "Unknown")[:60]
            print(f"    REMOVE: {d_title}")
            print(f"       URL: {(d.get('url') or 'no url')[:70]}")
            print(f"       Score: {score_opportunity(d)}")

    if len(duplicate_sets) > 30:
        print(f"\n  ... and {len(duplicate_sets) - 30} more groups")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Total active:     {len(opportunities)}")
    print(f"  Duplicates found: {total_dupes}")
    print(f"  After cleanup:    {len(opportunities) - total_dupes}")
    print(f"{'='*60}")

    if not args.dry_run:
        print(f"\nDeactivating {total_dupes} duplicate opportunities...")
        from datetime import datetime
        now = datetime.utcnow().isoformat()

        # Collect all IDs to deactivate
        all_dupe_ids = []
        for _, dupes in duplicate_sets:
            all_dupe_ids.extend(d["id"] for d in dupes)

        # Batch update (100 at a time)
        for i in range(0, len(all_dupe_ids), 100):
            batch = all_dupe_ids[i : i + 100]
            supabase.table("opportunities").update(
                {"is_active": False, "updated_at": now}
            ).in_("id", batch).execute()
            print(f"  Deactivated batch {i//100 + 1} ({len(batch)} items)")

        print(f"\n  Done! {total_dupes} duplicates deactivated.")
    else:
        print(f"\n[DRY RUN] Would deactivate {total_dupes} duplicates")

    print("\nDone!")


if __name__ == "__main__":
    main()
