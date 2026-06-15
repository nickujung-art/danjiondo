# Phase 11 — 지도 고도화 ✅ 완료 (2026-05)

## 구현 내용
- DB: `complexes`에 컬럼 4개 추가 — `avg_sale_per_pyeong`, `view_count`, `price_change_30d`, `tx_count_30d`
- DB 함수 2개: `increment_view_count(uuid)` (RPC, anon GRANT), `refresh_complex_price_stats()` (배치)
- 마이그레이션: `supabase/migrations/20260516000001_phase11_map_columns.sql`
- `ComplexMarker` — `MapMarker` → `CustomOverlayMap` + SVG로 전환
- `ClusterMarker` — 클릭 시 `getLeaves(Infinity)` + `map.setBounds()` 줌인
- `MapSidePanel` — PC 우측 슬라이드인(360px fixed) + 모바일 바텀 시트(60vh). `role="dialog"`
- API Route: `GET /api/complexes/[id]/map-panel` (`createReadonlyClient()` 경유)
- `ViewCountTracker` (client) — `sessionStorage` 기반 세션당 1회 제한, Server Action 호출
- Daily cron(`/api/cron/daily`)에 `refresh_complex_price_stats()` 호출 추가
- `badge-logic.ts` + `determineBadge()` — 10종 배지 우선순위 로직 (Phase 12에서 3종으로 단순화됨)

## 특이사항 / 유지보수
- `actions.ts`에서 `(supabase as any).rpc('increment_view_count', ...)` — DB 타입 스냅샷 미포함으로 any 캐스트; 타입 재생성 후 제거 가능
- `avg_sale_per_pyeong` 집계: 최근 1년 매매, 단위 만원/평 (integer)
- `price_change_30d` 저장 형식: numeric(5,4) 비율 (0.1050 = +10.5%)
- 모든 거래 집계에 `cancel_date IS NULL AND superseded_by IS NULL` 필수 (CLAUDE.md)
- `useMap()` hook은 `Map` 컴포넌트 tree 내부에서만 동작 — `MapSidePanel`은 외부에 위치하므로 사용 불가
- `maxZoom: 12` (supercluster) 유지 필수 — 초과 시 수백 개 `CustomOverlayMap` 동시 렌더링 위험
