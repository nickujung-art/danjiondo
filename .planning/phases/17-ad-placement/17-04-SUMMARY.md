---
phase: 17-ad-placement
plan: 04
status: complete (with deviation)
---

# 17-04 SUMMARY: In-Feed Ads (Search Panel + Complex Detail)

## Completed

### Search Side Panel

**`src/app/map/page.tsx`**
- Added `getActiveAds('in_feed', supabase).catch(() => [])` to `Promise.all` (5th element)
- Passes `inFeedAds` to `<SidePanel>`

**`src/components/search/SidePanel.tsx`**
- Added `inFeedAds?: AdCampaign[]` prop; passes to `<ComplexList>`

**`src/components/search/ComplexList.tsx`**
- Added `inFeedAds?: AdCampaign[]` prop
- Uses `React.Fragment` with key to wrap each item
- Injects `<AdBanner>` after index 4 (5th result) when `inFeedAds[0]` exists
- Guard: no ad shown when `complexes.length ≤ 5` or `inFeedAds` empty

### Complex Detail Page (`src/app/complexes/[id]/page.tsx`)

**Deviation from plan:** Instead of fetching `in_feed` ads server-side with "이 지역 관련 광고" section, the implementation uses a client-side `SidebarAdsSection` component that fetches `sidebar` ads from `/api/ads/sidebar`.

- `<SidebarAdsSection sggCode={complex.sgg_code} />` renders below the main content
- Fetches `sidebar` placement ads (not `in_feed`) via `/api/ads/sidebar?sgg_code={code}`
- Shows all matching ads (not limited to 2)
- No "이 지역 관련 광고" heading — ads render directly via `<AdBanner>`

**Why:** The `SidebarAdsSection` pattern was already in place when Phase 17 was executed. Rather than add a parallel `in_feed` section, the sidebar API was reused to avoid duplicate ad inventory management.

## Ad Placements Active Per Surface

| Surface | Placement | Source |
|---------|-----------|--------|
| `/map` canvas | `map_popup` | SSR via `getActiveAds('map_popup')` |
| MapSidePanel (complex selected) | `sidebar` | Client fetch `/api/ads/sidebar?sgg_code=` |
| Search results panel | `in_feed` | SSR via `getActiveAds('in_feed')` |
| Complex detail page | `sidebar` | Client fetch via `SidebarAdsSection` |

## Revalidate
`complexes/[id]/page.tsx` — kept at `revalidate = 86400` (24h). Ad freshness handled by `SidebarAdsSection` client-side fetch which is always live.
