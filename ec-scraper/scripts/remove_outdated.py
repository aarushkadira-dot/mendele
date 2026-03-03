"""Remove outdated opportunities from Supabase.

Finds opportunities that reference past years (2023, 2024, 2025) in their
title or description and marks them as inactive. Also catches expired
deadlines.

Usage:
    python scripts/remove_outdated.py --dry-run   # Preview
    python scripts/remove_outdated.py              # Actually deactivate
"""

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)

from supabase import create_client

CURRENT_YEAR = 2026

# Past years to flag in titles
PAST_YEARS = ["2020", "2021", "2022", "2023", "2024", "2025"]

# Patterns that indicate a specific past-year program (not just a mention)
OUTDATED_TITLE_PATTERNS = [
    re.compile(rf"\b(20(?:2[0-5]))\b"),  # Any year 2020-2025 in title
]

# Words that, combined with a past year, strongly indicate outdated
PROGRAM_WORDS = [
    "summer", "spring", "fall", "winter",
    "program", "camp", "competition", "challenge",
    "fellowship", "internship", "scholarship",
    "cohort", "class of", "batch",
    "application", "deadline",
    "conference", "symposium", "hackathon",
]


def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local")
        sys.exit(1)
    return create_client(url, key)


def fetch_all_active(supabase) -> list[dict]:
    """Fetch all active opportunities in batches."""
    all_opps = []
    offset = 0
    batch_size = 1000

    while True:
        resp = (
            supabase.table("opportunities")
            .select("id, title, description, deadline, url, company, created_at")
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


def is_outdated(opp: dict) -> tuple[bool, str]:
    """Check if an opportunity is outdated. Returns (is_outdated, reason)."""
    title = (opp.get("title") or "").lower()
    desc = (opp.get("description") or "").lower()
    deadline = opp.get("deadline")

    # 1. Check for past years in the TITLE (strongest signal)
    for pattern in OUTDATED_TITLE_PATTERNS:
        match = pattern.search(title)
        if match:
            year = match.group(1)
            return True, f"title contains past year '{year}'"

    # 2. Check for expired deadlines
    if deadline:
        try:
            deadline_date = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            if deadline_date.year < CURRENT_YEAR:
                return True, f"deadline expired: {deadline[:10]}"
        except (ValueError, TypeError):
            pass

    # 3. Check description for past year + program word combo
    for year in PAST_YEARS:
        if year in desc:
            # Only flag if a program-related word is near the year
            # Find all positions of the year in desc
            idx = 0
            while True:
                idx = desc.find(year, idx)
                if idx == -1:
                    break
                # Check surrounding 80 chars for program words
                context = desc[max(0, idx - 40):idx + len(year) + 40]
                for word in PROGRAM_WORDS:
                    if word in context:
                        return True, f"description mentions '{year}' near '{word}'"
                idx += len(year)

    return False, ""


def main():
    parser = argparse.ArgumentParser(description="Remove outdated opportunities from Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating database")
    args = parser.parse_args()

    supabase = get_supabase()

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Fetching all active opportunities...")
    opportunities = fetch_all_active(supabase)
    print(f"  Found {len(opportunities)} active opportunities")

    print(f"\nScanning for outdated programs (current year: {CURRENT_YEAR})...")

    outdated = []
    for opp in opportunities:
        is_old, reason = is_outdated(opp)
        if is_old:
            outdated.append((opp, reason))

    print(f"  Found {len(outdated)} outdated opportunities")

    if not outdated:
        print("\n  No outdated opportunities found! Everything looks current.")
        return

    # Group by reason type
    by_title_year = [o for o in outdated if "title contains" in o[1]]
    by_deadline = [o for o in outdated if "deadline expired" in o[1]]
    by_desc = [o for o in outdated if "description mentions" in o[1]]

    print(f"\n  Breakdown:")
    print(f"    Past year in title:       {len(by_title_year)}")
    print(f"    Expired deadline:         {len(by_deadline)}")
    print(f"    Past year in description: {len(by_desc)}")

    # Show examples
    print(f"\nExamples (first 40):")
    for opp, reason in outdated[:40]:
        title = (opp.get("title") or "Unknown")[:65]
        print(f"  {title:<65} [{reason}]")

    if len(outdated) > 40:
        print(f"  ... and {len(outdated) - 40} more")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Active before:  {len(opportunities)}")
    print(f"  Outdated found: {len(outdated)}")
    print(f"  Active after:   {len(opportunities) - len(outdated)}")
    print(f"{'='*60}")

    if not args.dry_run:
        print(f"\nDeactivating {len(outdated)} outdated opportunities...")
        now = datetime.utcnow().isoformat()

        all_ids = [opp["id"] for opp, _ in outdated]

        for i in range(0, len(all_ids), 100):
            batch = all_ids[i : i + 100]
            supabase.table("opportunities").update(
                {"is_active": False, "is_expired": True, "updated_at": now}
            ).in_("id", batch).execute()
            print(f"  Deactivated batch {i // 100 + 1} ({len(batch)} items)")

        print(f"\n  Done! {len(outdated)} outdated opportunities deactivated.")
    else:
        print(f"\n[DRY RUN] Would deactivate {len(outdated)} outdated opportunities")

    print("\nDone!")


if __name__ == "__main__":
    main()
