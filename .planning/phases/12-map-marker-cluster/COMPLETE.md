# Phase 12 — 지도 마커·클러스터 개편 ✅ 완료 (2026-05)

## 구현 내용
- `HouseMarker.tsx` — 집 모양 인라인 SVG 마커 3색: 일반/hot=오렌지(#F97316), 분양=빨강(#EF4444), 신축=민트(#14B8A6)
- hot 배지 = 왕관 SVG (지붕 위 오버레이), `React.memo` 적용
- `badge-logic.ts` 단순화: 10종 → 4종 (`pre_sale` / `new_build` / `hot` / `none`)
- `DongClusterChip.tsx` — 구/동 이름 + 최고 실거래가 사각형 칩, 기존 원형 `ClusterMarker` 완전 교체
- `ComplexMarker` hover 시 툴팁 카드: 단지명, 최근 실거래가/날짜/평형, 세대수·준공연도
- 줌 레벨 3단계 정책 (KakaoMap): `level >= 10` = 구 칩만, `level 7~9` = HouseMarker + 가격, `level <= 6` = HouseMarker + 단지명 + 가격
- Phase 11 의존: `avg_sale_per_pyeong`, `tx_count_30d`, `recent_price` 등 컬럼 활용

## 특이사항 / 유지보수
- `badge-logic.ts`에서 `getPriceColor` 함수 제거됨 — `BadgeMarker.tsx`, `ComplexMarker.tsx`에 로컬 함수로 분산됨
- `@testing-library/react` Phase 12에서 devDependency 추가됨
- `showOnlyCluster >= 10` / `showLabel <= 9` / `showName <= 6` — KakaoMap.tsx 줌 불리언 (Phase 14에서 4단계로 재편됨)
- 툴팁 데이터는 `ComplexMapItem`에서 직접 수신 — 추가 API 호출 없음
- AI 슬롭 금지 준수: backdrop-blur/gradient/glow/이모지 없음, SVG path만 사용
