---
phase: 17-ad-placement
plan: 02
status: complete
---

# 17-02 SUMMARY: Map Popup Ad Component

## Completed

### New Component (`src/components/map/AdMapPopup.tsx`)
- `'use client'` component wrapping `CustomOverlayMap` from `react-kakao-maps-sdk`
- Props: `{ ad: AdCampaign & { target_lat: number; target_lng: number } }`
- Starts expanded; auto-collapses to orange "AD" pin after 5 seconds
- Collapsed pin is clickable to re-expand (resets 5-second timer)
- Expanded card: image thumbnail, title, advertiser_name, orange "광고" badge
- Click fires `/api/ads/events` (event_type: 'click') + opens `link_url` in new tab
- Impression event fired once on mount
- Positioned with `xAnchor={0.5} yAnchor={1.0}` (pin tip at coordinate)

### `src/components/map/KakaoMap.tsx`
- Added `mapPopupAds?: AdCampaign[]` to Props interface
- Renders `<AdMapPopup>` for each ad with non-null lat/lng
- Type-narrowed with `as AdCampaign & { target_lat: number; target_lng: number }`

### `src/components/map/MapView.tsx`
- Added `mapPopupAds?: AdCampaign[]` to Props interface
- Passes `mapPopupAds` to `<KakaoMap>`

### `src/app/map/page.tsx`
- Added `getActiveAds('map_popup', supabase).catch(() => [])` to `Promise.all`
- Passes `mapPopupAds` to `<MapView>`

## Deviations
None. All plan requirements met.
