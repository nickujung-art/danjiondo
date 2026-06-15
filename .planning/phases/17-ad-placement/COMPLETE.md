# Phase 17 — 광고 지면 확장 ✅ 완료 (2026-05)

## 구현 내용
- DB: `ad_campaigns`에 `map_popup` placement 추가, `target_sgg_code` / `target_lat` / `target_lng` 컬럼 신설
- `getActiveAds()` 시그니처 확장: `sggCode?` 옵션 파라미터, `map_popup` lat/lng null 필터
- `AdMapPopup` 컴포넌트: 카카오맵 위 `CustomOverlayMap` 팝업, 5초 후 자동 축소(주황 "AD" 핀)
- `/api/ads/sidebar?sgg_code=` API Route: `createReadonlyClient` + `getActiveAds('sidebar', ...)`
- `MapSidePanel`: 단지 선택 시 sgg_code로 sidebar 광고 client-side fetch
- 검색 패널(`ComplexList`): in_feed 광고 5번째 결과 뒤 삽입 (SSR via map/page.tsx)
- 단지 상세: `SidebarAdsSection` 클라이언트 컴포넌트로 sidebar 광고 표시

## 지면별 광고 출처 요약
| 지면 | Placement | 방식 |
|------|-----------|------|
| `/map` 캔버스 | `map_popup` | SSR |
| 지도 사이드패널 (단지 선택 시) | `sidebar` | Client fetch |
| 검색 결과 목록 5번째 뒤 | `in_feed` | SSR |
| 단지 상세 페이지 | `sidebar` | Client fetch (SidebarAdsSection) |

## 특이사항 / 유지보수
- 단지 상세의 in_feed 섹션은 Phase 18에서 공인중개사 섹션으로 교체됨 (SidebarAdsSection은 sidebar 재사용)
- `AdCreateForm`에서 placement 선택 시 조건부로 sgg_code / lat / lng 입력 필드 표시
- 핵심 파일: `src/components/map/AdMapPopup.tsx`, `src/app/api/ads/sidebar/route.ts`
