---
phase: 17-ad-placement
plan: 03
status: complete
---

# 17-03 SUMMARY: Sidebar Ad API + MapSidePanel Integration

## Completed

### API Route (`src/app/api/ads/sidebar/route.ts`)
- `GET /api/ads/sidebar?sgg_code={code}` — returns `{ ads: AdCampaign[] }`
- Uses `createReadonlyClient()` + `getActiveAds('sidebar', supabase, sggCode)`
- `sgg_code` param is optional; omitted = no region filter (global ads only)
- `Cache-Control: no-store` header set
- `export const dynamic = 'force-dynamic'`
- CRITICAL ad safety filter enforced via `getActiveAds`

### `src/components/map/MapSidePanel.tsx`
- `sgg_code` **IS** available in `MapPanelData` — region-matched fetch implemented
- Added `sidebarAd: AdCampaign | null` state
- `useEffect` fires when `panelData` changes: fetches `/api/ads/sidebar?sgg_code={code}`
- `PanelBody` renders `<AdBanner ad={sidebarAd} />` below "단지 상세 보기" link when ad exists
- No ad shown while loading or when fetch returns empty array

## Deviations
None. `sgg_code` was available in `MapPanelData`, so the preferred region-matched path was used.
