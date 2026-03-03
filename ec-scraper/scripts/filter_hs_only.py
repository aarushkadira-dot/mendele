#!/usr/bin/env python3
"""
filter_hs_only.py — Remove opportunities that are NOT relevant to high school students.

Strategy:
  KEEP if:
    - grade_levels contains 9, 10, 11, or 12 (explicit HS signal)
    - title/description/requirements contains "high school", "grades 9-12", "teen", "youth",
      "secondary school", "k-12", "grade 9", "grade 10", "grade 11", "grade 12"
    - No college/adult-only language found
    - grade_levels is empty AND no language either way (give benefit of the doubt)

  REMOVE if:
    - Explicitly targets college/grad/professional WITHOUT also mentioning HS
    - Contains strong adult/professional-only indicators

Usage:
    python3 ec-scraper/scripts/filter_hs_only.py --dry-run
    python3 ec-scraper/scripts/filter_hs_only.py
"""

import os
import re
import sys
import argparse
from supabase import create_client

# ─── Config ──────────────────────────────────────────────────────────────────

SUPABASE_URL = None
SUPABASE_KEY = None

# Load from .env.local — check multiple possible locations
_script_dir = os.path.dirname(os.path.abspath(__file__))
_env_candidates = [
    os.path.join(_script_dir, "../../.env.local"),
    os.path.join(os.getcwd(), ".env.local"),
    os.path.expanduser("~/.env.local"),
]
for _env_path in _env_candidates:
    if os.path.exists(_env_path):
        with open(_env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        break

SUPABASE_URL = (
    os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or os.environ.get("SUPABASE_URL")
)
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
)

# ─── High School POSITIVE signals ────────────────────────────────────────────
# If ANY of these match → KEEP (it's HS relevant)

HS_POSITIVE_PATTERNS = [
    # Explicit grade mentions
    r'\bhigh school\b',
    r'\bhigh-school\b',
    r'\bgrade[s]?\s*(9|10|11|12)\b',
    r'\b(9th|10th|11th|12th)\s+grade\b',
    r'\bgrades?\s+9[-–]12\b',
    r'\bgrades?\s+9\s+through\s+12\b',
    r'\bk[-–]12\b',
    r'\bsecondary school\b',
    r'\bsecondary education\b',
    r'\bsecondary student\b',
    # Age-based HS indicators (14-18 year olds)
    r'\b(14|15|16|17|18)[- ]year[- ]old\b',
    r'\bages?\s+(14|15|16|17|18)\b',
    r'\bteen\b',
    r'\bteenager\b',
    r'\byouth\b',
    r'\bjunior\s+high\b',
    r'\bpre[- ]college\b',
    r'\bprecollege\b',
    r'\brising\s+(freshman|sophomore|junior|senior)\b',
    r'\brising\s+(9th|10th|11th|12th)\b',
    r'\bhs\s+student\b',
    r'\bhigh\s+schooler\b',
    r'\bhigh\s+school\s+student\b',
    r'\bhigh\s+school\s+junior\b',
    r'\bhigh\s+school\s+senior\b',
    r'\bjunior\s+or\s+senior\b',
    r'\bfreshman\s+or\s+sophomore\b',
    # Program types that are typically HS
    r'\bsummer\s+camp\b',
    r'\bsummer\s+academy\b',
    r'\bsummer\s+institute\b',
    r'\bsummer\s+seminar\b',
    r'\bsummer\s+scholars?\b',
    # Explicitly says "students" in a HS context
    r'\bstudent\s+researcher\b',  # common HS phrase
]

HS_POSITIVE_COMPILED = [re.compile(p, re.IGNORECASE) for p in HS_POSITIVE_PATTERNS]

# ─── College/Adult-ONLY NEGATIVE signals ─────────────────────────────────────
# These must be EXPLICIT college/adult eligibility requirements — not just mentions.
# "faculty" alone is fine (students work WITH faculty). Need stronger phrasing.
# If ANY of these match AND NO positive HS signal → REMOVE

COLLEGE_ONLY_PATTERNS = [
    # Explicit enrollment requirement — must be in college/university
    r'\bcurrently\s+enrolled\s+in\s+(a\s+)?college\b',
    r'\bcurrently\s+enrolled\s+in\s+(a\s+)?university\b',
    r'\bmust\s+be\s+(a\s+)?college\s+student\b',
    r'\bmust\s+be\s+(an?\s+)?undergraduate\s+student\b',
    r'\bcollege\s+student[s]?\s+only\b',
    r'\bfor\s+(current|enrolled)\s+college\s+students?\b',
    r'\bundergraduate\s+student[s]?\s+only\b',
    r'\bgraduate\s+student[s]?\s+only\b',
    r'\bopen\s+to\s+(all\s+)?undergraduate\s+(and\s+graduate\s+)?students?\b',
    r'\bopen\s+to\s+undergraduate\s+and\s+graduate[- ]level\s+candidates\b',
    # PhD / Postdoc / Masters explicit programs
    r'\bphd\s+student[s]?\b',
    r'\bdoctoral\s+student[s]?\b',
    r'\bpostdoc(?:toral)?\b',
    r'\bpost[-\s]doc(?:toral)?\b',
    r'\bmaster[s]?\s+student[s]?\b',
    r'\bmba\s+student[s]?\b',
    r'\blaw\s+student[s]?\s+(only|program|internship)\b',
    r'\blaw\s+school\s+(student|program|internship)\b',
    r'\bmedical\s+school\s+(student|program|admission)\b',
    r'\bmedical\s+student[s]?\s+(only|internship|program)\b',
    # Professional-only (must have work experience) — must be eligibility language, not mentor language
    r'\bfor\s+working\s+professional[s]?\b',
    r'\bopen\s+to\s+working\s+professional[s]?\b',
    r'\bworking\s+professional[s]?\s+(?:only|can apply|are eligible)\b',
    r'\bindustry\s+professional[s]?\s+(?:only|can apply|are eligible|apply)\b',
    r'\bfor\s+industry\s+professional[s]?\b',
    r'\b[2-9]\+\s+years?\s+of\s+(work\s+)?experience\s+required\b',
    r'\bminimum\s+[2-9]\s+years?\s+of\s+experience\b',
    # Explicit degree REQUIRED (not just helpful)
    r'\bbachelor[\'s]*s?\s+degree\s+required\b',
    r'\bmasters?\s+degree\s+required\b',
    r'\b(b\.s\.|b\.a\.|m\.s\.|m\.a\.|ph\.d\.)\s+required\b',
]

COLLEGE_ONLY_COMPILED = [re.compile(p, re.IGNORECASE) for p in COLLEGE_ONLY_PATTERNS]

# ─── TITLE-level hard exclusions ─────────────────────────────────────────────
# These in the TITLE alone are almost always adult/professional postings

TITLE_EXCLUSION_PATTERNS = [
    # Explicit postdoc/PhD job postings
    r'\bpostdoc(?:toral)?\b',
    r'\bphd\s+(position|internship|fellowship|candidate)\b',
    r'\bdoctoral\s+(position|internship|fellowship|candidate)\b',
    r'\bfaculty\s+position\b',
    r'\bfaculty\s+member\b',
    # Job titles that signal professional roles
    r'\bjob\s+(opening|posting|offer)\b',
    r'\bfull[- ]time\s+(job|position|role|employee)\b',
    r'\bpart[- ]time\s+(job|position|role)\b',
    r'\bstaff\s+position\b',
    # Professional-level engineering/science roles (Senior X / Junior X job titles)
    r'\bsenior\s+(software\s+)?(engineer|developer|manager|analyst|scientist|researcher|architect)\b',
    r'\bjunior\s+(software\s+)?(engineer|developer|manager|analyst|architect)\b',
    r'\blead\s+(engineer|developer|scientist|researcher)\b',
    # Medical professional roles
    r'\bmd[-/]phd\b',
    r'\bundergraduate\s+research\s+(?:intern|internship|assistant)\s+(?:program|position)\b',
    # Explicit college-only in title
    r'\bcollege\s+student[s]?\s+internship\b',
    r'\bundergraduate\s+internship\b',
    r'\bgraduate\s+internship\b',
    # Clearly adult professional programs
    r'\bcurrent\s+phd\b',
    r'\bcurrent\s+doctoral\b',
]

TITLE_EXCLUSION_COMPILED = [re.compile(p, re.IGNORECASE) for p in TITLE_EXCLUSION_PATTERNS]

FETCH_COUNT = 500

def has_hs_grade_levels(grade_levels: list) -> bool:
    """Returns True if grade_levels array includes any HS grade (9-12)."""
    if not grade_levels:
        return False
    hs_grades = {9, 10, 11, 12}
    return bool(hs_grades.intersection(set(grade_levels)))

def has_college_grade_levels(grade_levels: list) -> bool:
    """Returns True if grade_levels only has college-level indicators (13, 14 etc)."""
    if not grade_levels:
        return False
    hs_grades = {9, 10, 11, 12}
    # Has grades but NONE are HS grades
    return len(grade_levels) > 0 and not hs_grades.intersection(set(grade_levels))

def has_positive_hs_signal(text: str) -> bool:
    """Returns True if text contains explicit high school relevance signals."""
    for pattern in HS_POSITIVE_COMPILED:
        if pattern.search(text):
            return True
    return False

def has_college_only_signal(text: str) -> bool:
    """Returns True if text contains college/adult-only signals."""
    for pattern in COLLEGE_ONLY_COMPILED:
        if pattern.search(text):
            return True
    return False

def has_title_exclusion(title: str) -> bool:
    """Returns True if title alone indicates this is an adult/professional posting."""
    for pattern in TITLE_EXCLUSION_COMPILED:
        if pattern.search(title):
            return True
    return False

def should_remove(opp: dict) -> tuple[bool, str]:
    """
    Decide whether an opportunity should be removed.
    Returns (should_remove: bool, reason: str)
    """
    title = opp.get("title") or ""
    description = opp.get("description") or ""
    requirements = opp.get("requirements") or ""
    grade_levels = opp.get("grade_levels") or []

    # Combined text for analysis (title gets higher weight by being checked separately)
    full_text = f"{title} {description} {requirements}"

    # ── FAST KEEPS ──

    # If grade_levels explicitly includes HS grades → keep
    if has_hs_grade_levels(grade_levels):
        return False, ""

    # If title/text has explicit HS signals → keep
    if has_positive_hs_signal(title):
        return False, ""

    if has_positive_hs_signal(full_text):
        return False, ""

    # ── HARD REMOVALS ──

    # Title-level professional indicators → remove regardless
    if has_title_exclusion(title):
        return True, f"professional/adult job title pattern in: '{title[:80]}'"

    # grade_levels has college-only grades → remove (but only if no HS text)
    if has_college_grade_levels(grade_levels):
        return True, f"grade_levels={grade_levels} (no HS grades)"

    # Strong college-only signals in text AND no HS signals → remove
    if has_college_only_signal(full_text) and not has_positive_hs_signal(full_text):
        # Double check: find the specific matching pattern for the reason
        for pattern in COLLEGE_ONLY_COMPILED:
            m = pattern.search(full_text)
            if m:
                return True, f"college/adult-only signal: '{m.group(0)}'"

    # Default: keep (benefit of the doubt)
    return False, ""


def run(dry_run: bool = True):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.local")
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"{'[DRY RUN] ' if dry_run else ''}Fetching all active opportunities...")

    # Paginate through all opportunities
    all_opps = []
    offset = 0
    while True:
        resp = (
            client.table("opportunities")
            .select("id, title, description, requirements, grade_levels, type, category")
            .eq("is_active", True)
            .neq("title", "Unknown")
            .neq("title", "")
            .range(offset, offset + FETCH_COUNT - 1)
            .execute()
        )
        batch = resp.data or []
        all_opps.extend(batch)
        if len(batch) < FETCH_COUNT:
            break
        offset += FETCH_COUNT

    print(f"  Found {len(all_opps)} active opportunities\n")

    # Classify each opportunity
    to_remove = []
    kept = 0

    for opp in all_opps:
        remove, reason = should_remove(opp)
        if remove:
            to_remove.append((opp["id"], opp["title"], reason))
        else:
            kept += 1

    print(f"Scanning for non-HS opportunities...")
    print(f"  Will keep:   {kept}")
    print(f"  Will remove: {len(to_remove)}")
    print()

    if to_remove:
        print(f"Examples to remove (first 50):")
        for opp_id, title, reason in to_remove[:50]:
            print(f"  ✗ {title[:65]:<65} [{reason}]")
        if len(to_remove) > 50:
            print(f"  ... and {len(to_remove) - 50} more")

    print()
    print("=" * 60)
    print(f"Summary:")
    print(f"  Active before:  {len(all_opps)}")
    print(f"  Non-HS found:   {len(to_remove)}")
    print(f"  Active after:   {kept}")
    print("=" * 60)

    if dry_run:
        print(f"\n[DRY RUN] Would deactivate {len(to_remove)} non-HS opportunities")
        print("\nDone!")
        return

    if len(to_remove) == 0:
        print("\nNothing to remove. Done!")
        return

    # Deactivate in batches of 100
    ids_to_remove = [r[0] for r in to_remove]
    batch_size = 100
    total_removed = 0

    print(f"\nDeactivating {len(ids_to_remove)} non-HS opportunities...")
    for i in range(0, len(ids_to_remove), batch_size):
        batch = ids_to_remove[i:i + batch_size]
        client.table("opportunities").update({
            "is_active": False,
            "is_expired": True,
        }).in_("id", batch).execute()
        total_removed += len(batch)
        print(f"  Deactivated batch {i // batch_size + 1} ({len(batch)} items)")

    print(f"\n  Done! {total_removed} non-HS opportunities deactivated.")
    print("\nDone!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Filter opportunities to high-school-relevant only")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
