-- Phase 17: Ad placement expansion
-- Adds map_popup to placement constraint + targeting columns

-- 1. Drop old placement check constraint
ALTER TABLE ad_campaigns
  DROP CONSTRAINT IF EXISTS ad_campaigns_placement_check;

-- 2. Re-add with map_popup included
ALTER TABLE ad_campaigns
  ADD CONSTRAINT ad_campaigns_placement_check
    CHECK (placement IN ('banner_top','sidebar','in_feed','map_popup'));

-- 3. Region targeting column (sidebar + in_feed; NULL = show everywhere)
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS target_sgg_code text;

-- 4. Map overlay position (map_popup only; NULL for other placements)
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS target_lat  double precision,
  ADD COLUMN IF NOT EXISTS target_lng  double precision;

-- 5. Index for active sidebar ads by region
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_sgg_code
  ON ad_campaigns (target_sgg_code)
  WHERE status = 'approved' AND target_sgg_code IS NOT NULL;
