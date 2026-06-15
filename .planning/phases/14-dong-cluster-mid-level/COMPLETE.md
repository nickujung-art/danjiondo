# Phase 14 — 동 클러스터 중간 레벨 ✅ 완료 (2026-05)

## 구현 내용
- `DongClusterChip.tsx` 확장: `DongChip` 인터페이스 추가, `mode='dong'` 분기(동 이름 + N개 단지 + 최고가), 클릭 시 `map.setLevel(6)` + `setCenter`
- `computeDongChips(complexes)` 순수 함수: `${gu}_${dong}` key로 groupBy, 평균 좌표, `maxPrice` 최댓값, `dong=null` → '기타'
- `GuChip` 모드 하위 호환 완전 보존 (`mode` 미전달 시 기존 `setLevel(7)` 동작 유지)
- `KakaoMap.tsx` 줌 레벨 3단계 → 4단계로 재편:
  - `showOnlyGuCluster` (level >= 9): 구 칩만
  - `showDongCluster` (level 7~8): 동 칩 + `pre_sale` 개별 마커만
  - `showAllMarkers` (level <= 6): 전체 개별 마커
- `preSaleComplexes` useMemo: `level 7~8`에서 분양 단지만 개별 마커로 별도 표시
- Vitest 6종 GREEN: `computeDongChips` 그룹화 로직 전체 검증

## 특이사항 / 유지보수
- Phase 12의 `showOnlyCluster` 변수명이 `showOnlyGuCluster`로 교체됨 — KakaoMap 내 참조 확인 필요
- `dong=null` 단지는 '기타' 동 칩으로 묶임 — DB에서 dong 필드 보강 시 자동 반영
- level 7~8에서 `tx_count_30d` 필터 제거됨 (기존에는 level 8에서 거래 있는 단지만 표시했음)
- `displayComplexes`가 `showAllMarkers (level <= 6)`에서만 활성화됨
