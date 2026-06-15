# Phase 09 — 단지 상세 UX 고도화 ✅ 완료 (2026-05)

## 구현 내용
- UX-01 실거래가 그래프: 월세 탭 제거(매매/전세만), 기간 필터 nuqs(`?period=1y|3y|5y|all`, 기본 3년)
  - IQR×1.5 이상치 투명 점(opacity=0.4) 구분, 평균선은 정상 거래만 포함
  - 신규 RPC `complex_transactions_for_chart` (cancel/superseded 필터 하드코딩)
- UX-02 평형 칩: 전용면적(㎡) 기준, nuqs `?area=N`, 기본값=최다거래 평형
  - `extractAreaGroups()` + `filterByArea()` — 그래프·목록 동시 필터
- UX-03 시설 카드: 주차 "세대당 N.N대 (총 N면)", 엘리베이터 "동당 N대 (총 N대, N동)"
  - `facility_kapt.building_count` 컬럼 추가 (마이그레이션 `20260514000001`)
- UX-04 관리비 계절별: 상세 13개 항목 제거 → 하절기(6~9월)/동절기(10~3월) 월평균
  - 4개월 미만 데이터 시 FallbackTotalsView("최근 단지 합계") 표시

## 새 DB 아티팩트
- 마이그레이션 `20260514000001`: `facility_kapt.building_count integer`
- 마이그레이션 `20260514000002`: `complex_transactions_for_chart` RPC

## 특이사항 / 유지보수
- ISR `revalidate=86400` 유지 — `page.tsx`에 `searchParams` prop 추가 금지 (ISR 파괴됨)
  - nuqs 필터는 클라이언트 사이드 — 서버 fetch는 전체 데이터, 클라이언트에서 slice
- IQR guard: `points.length < 4` (원안 `< 2`에서 코드 리뷰 후 수정됨)
- `building_count` null 단지는 엘리베이터 항목 단순 숫자만 표시 (정상 fallback)
- 검증 점수: 5/5 (human_needed — URL 동작·시각 렌더링은 브라우저 확인 필요)
