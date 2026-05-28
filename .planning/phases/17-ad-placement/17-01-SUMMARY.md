---
phase: 17-ad-placement
plan: 01
status: complete
---

# 17-01 SUMMARY: DB Schema + Data Layer

## Completed

### Migration
- **File:** `supabase/migrations/20260527000001_phase17_ad_placement_columns.sql`
- Added `map_popup` to `ad_campaigns_placement_check` constraint
- Added `target_sgg_code text` column
- Added `target_lat double precision`, `target_lng double precision` columns
- Added index `idx_ad_campaigns_sgg_code` on `(target_sgg_code) WHERE status='approved' AND target_sgg_code IS NOT NULL`

### TypeScript Types (`src/types/database.ts`)
- `target_sgg_code: string | null` in Row; `target_sgg_code?: string | null` in Insert/Update
- `target_lat: number | null`, `target_lng: number | null` in Row/Insert/Update
- Types regenerated from live Supabase schema (2026-05-28)

### Data Layer (`src/lib/data/ads.ts`)
Updated `getActiveAds` signature:
```typescript
export async function getActiveAds(
  placement: 'banner_top' | 'sidebar' | 'in_feed' | 'map_popup',
  supabase: SupabaseClient<Database>,
  sggCode?: string,
): Promise<AdCampaign[]>
```
- `sggCode` filter: `.or('target_sgg_code.is.null,target_sgg_code.eq.{sggCode}')`
- `map_popup` filter: `.not('target_lat', 'is', null).not('target_lng', 'is', null)`
- CRITICAL invariant maintained: `status='approved'` + `starts_at ≤ now ≤ ends_at`

### Server Action (`src/lib/auth/ad-actions.ts`)
`createAdCampaign` reads and persists `target_sgg_code`, `target_lat`, `target_lng` from formData.

### Admin Form (`src/components/admin/AdCreateForm.tsx`)
- Tracks selected placement in state
- Shows `target_sgg_code` input when `sidebar` or `in_feed` selected
- Shows `target_lat` / `target_lng` inputs when `map_popup` selected

## Deviations
None. All plan requirements met.
