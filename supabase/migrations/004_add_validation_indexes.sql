-- Index for validation queries: find stale/unverified opportunities
-- Used by validate_urls.py batch script and staleness sorting
CREATE INDEX IF NOT EXISTS idx_opportunities_stale
  ON opportunities (last_verified ASC NULLS FIRST)
  WHERE is_active = true;

-- Index for filtering expired opportunities
CREATE INDEX IF NOT EXISTS idx_opportunities_expired
  ON opportunities (is_expired, is_active)
  WHERE is_active = true;
