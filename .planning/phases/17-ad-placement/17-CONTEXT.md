# Phase 17 — Ad Placement Expansion

## Goal

Extend the ad system from its current 3 placements (`banner_top`, `sidebar`, `in_feed`) to 5
placements by adding:
- `map_popup` — floating overlay on the Kakao Map canvas at an advertiser-supplied lat/lng
- Region-matched `sidebar` — existing placement type, but now filtered by `sgg_code` when a complex is selected
- `in_feed` — existing placement type, now actually rendered in search results (SidePanel) and complex detail page bottom

## Scope

### In Scope
- DB migration: add `map_popup` to placement check constraint, add `target_sgg_code`, `target_lat`, `target_lng` columns
- Update `getActiveAds()` to accept optional `sggCode` filter
- Update `database.ts` types to reflect new columns
- `AdMapPopup` component using `CustomOverlayMap` (same pattern as `PresalePin`)
- `GET /api/ads/sidebar?sgg_code=` route for client-side sidebar fetch
- Integrate sidebar ad into `MapSidePanel` below complex info
- In-feed ads in `ComplexList` / `SidePanel` (after 5th result)
- In-feed ads in `src/app/complexes/[id]/page.tsx` bottom section
- Update `AdCreateForm` + `createAdCampaign` to accept new fields

### Out of Scope
- Impression/click analytics dashboards for new placements (existing `/api/ads/events` already handles this)
- Advertiser self-service portal
- A/B testing between ad variants
- Map popup clustering (show 1 popup at a time)
- Budget pacing / frequency capping

## DB Changes

```sql
-- New column on placement check constraint
ALTER TABLE ad_campaigns
  DROP CONSTRAINT ad_campaigns_placement_check,
  ADD CONSTRAINT ad_campaigns_placement_check
    CHECK (placement IN ('banner_top','sidebar','in_feed','map_popup'));

-- Region targeting (sidebar / in_feed)
ALTER TABLE ad_campaigns
  ADD COLUMN target_sgg_code text;           -- null = show everywhere

-- Map popup position
ALTER TABLE ad_campaigns
  ADD COLUMN target_lat  double precision,   -- required for map_popup
  ADD COLUMN target_lng  double precision;   -- required for map_popup
```

## Architecture Decisions

- `MapSidePanel` is a `'use client'` component → uses `fetch('/api/ads/sidebar?sgg_code=...')` to load ads
- `AdMapPopup` is a `'use client'` component (requires `CustomOverlayMap` from react-kakao-maps-sdk)
- Map popup ads are fetched server-side in `map/page.tsx` alongside complexes/presalePins, passed as prop through `MapView` → `KakaoMap`
- In-feed ads for `SidePanel` are fetched server-side in `map/page.tsx`, passed as `inFeedAds` prop
- Complex detail in-feed ads are fetched server-side in `complexes/[id]/page.tsx` (already calls `getActiveAds`)
- CRITICAL: All `getActiveAds` calls MUST keep `now() BETWEEN starts_at AND ends_at AND status='approved'` invariant

## Wave Structure

| Wave | Plan | Description |
|------|------|-------------|
| 1 | 17-01 | DB migration + `getActiveAds` update + `database.ts` types + `createAdCampaign` update |
| 2 | 17-02 | `AdMapPopup` component + map page wiring |
| 2 | 17-03 | `/api/ads/sidebar` route + `MapSidePanel` integration |
| 3 | 17-04 | In-feed ads in `SidePanel` + complex detail page |

Plans 17-02 and 17-03 can run in parallel (no shared files). Plan 17-04 depends on 17-01 only.
