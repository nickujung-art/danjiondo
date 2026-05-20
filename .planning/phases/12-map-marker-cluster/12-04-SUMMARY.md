---
phase: 12-map-marker-cluster
plan: "04"
subsystem: map-integration
tags: [KakaoMap, DongClusterChip, ComplexMarker, zoom-policy, cluster-chip, badge-logic]
dependency_graph:
  requires:
    - "12-01: badge-logic.ts BadgeInput 4종(status/built_year/tx_count_30d/p95_tx_count)"
    - "12-02: DongClusterChip.tsx GuChip props"
    - "12-03: ComplexMarker props 확장(si/gu/recentPrice/recentDate/recentAreaM2/builtYear)"
  provides:
    - "KakaoMap: 3단계 줌 레벨 정책 통합 완료"
    - "Phase 12 전체 통합: HouseMarker + DongClusterChip + hover 툴팁 + 줌 정책"
  affects:
    - "MAP-09: 줌 레벨 정책 완성"
tech_stack:
  added: []
  patterns:
    - "showOnlyCluster = mapLevel >= 10: 명시적 변수로 렌더 분기 의도 명확화"
    - "ClusterMarker → DongClusterChip: 구별 최고실거래가 칩으로 교체"
    - "showLabel/showName로 줌 단계별 가격·세부정보 표시 제어"
key_files:
  created: []
  modified:
    - src/components/map/KakaoMap.tsx
decisions:
  - "showOnlyCluster = mapLevel >= 10: 이전 >= 8에서 상향 조정 — 레벨 8-9에서도 개별 마커 표시"
  - "showLabel(<=9): 레벨 7-9에서 가격 라벨 표시, 이하에서도 표시"
  - "showName(<=6): 레벨 6 이하에서 hover tooltip 세부정보(세대수·준공연도) 활성화"
  - "ClusterMarker 완전 제거: DongClusterChip(구 단위 칩)으로 완전 교체"
metrics:
  duration: "15분"
  completed_date: "2026-05-20"
  tasks_completed: 1
  files_changed: 1
---

# Phase 12 Plan 04: KakaoMap 통합 — 3단계 줌 레벨 정책 + DongClusterChip Summary

KakaoMap.tsx의 줌 레벨 정책을 2단계(>=8)에서 3단계(>=10/<=9/<=6)로 개편하고,
showLabel·showName 변수를 추가하여 ComplexMarker 렌더링을 줌 레벨에 따라 제어한다.

## What Was Built

### KakaoMap.tsx 변경 사항

**1. 3단계 줌 레벨 정책 (2단계에서 개편)**

```typescript
// 이전 (2단계)
const showOnlyCluster = mapLevel >= 8

// 이후 (3단계)
const showOnlyCluster = mapLevel >= 10  // level ≥10: 구 단위 칩만
const showLabel       = mapLevel <= 9   // level 7–9 및 ≤6: 가격 라벨 표시
const showName        = mapLevel <= 6   // level ≤6: 세부 정보 (hover tooltip)
```

**2. showLabel/showName을 ComplexMarker 렌더링에 활용**

```typescript
const displayPrice    = showLabel ? (props.recent_price ?? null)       : null
const displayAvg      = showLabel ? (props.avg_sale_per_pyeong ?? null) : null
const detailHousehold = showName  ? (props.household_count ?? null)    : null
const detailBuiltYear = showName  ? (props.built_year ?? null)         : null
```

- `showLabel=false` (level ≥10): 가격 라벨 및 평균 시세 null 전달 → 마커에 가격 미표시
- `showName=false` (level 7-9): hover tooltip에서 세대수·준공연도 숨김

**3. determineBadge 4종 BadgeInput 유지**

```typescript
const badge = determineBadge({
  status:       props.status       ?? 'active',
  built_year:   props.built_year   ?? null,
  tx_count_30d: props.tx_count_30d ?? 0,
  p95_tx_count: p95TxCount,
})
```

**4. DongClusterChip: guChips 렌더 (showOnlyCluster=true 시)**

```typescript
{showOnlyCluster && guChips.map((chip) => (
  <DongClusterChip key={chip.gu} {...chip} />
))}
```

### 수락 기준 검증 결과

| 기준 | 결과 |
|------|------|
| ClusterMarker 제거 | 0건 (완전 제거) |
| DongClusterChip 존재 | 3건 (import + 타입 + 렌더) |
| showOnlyCluster/showName/showLabel 존재 | 16건 |
| p95ViewCount 없음 | 0건 |
| TypeScript 오류 | 없음 (tsc --noEmit 통과) |
| 빌드 실패 | pre-existing (supabaseUrl env 미설정) |
| 테스트 | 17 failed / 45 passed (pre-existing 동일) |

## Deviations from Plan

- `showLabel`/`showName`을 ComplexMarker props로 전달 불가 (ComplexMarker에 해당 props 없음)
  → 대신 `displayPrice`, `displayAvg`, `detailHousehold`, `detailBuiltYear` 계산값으로 간접 적용
  → 줌 레벨별 표시 제어 의도는 동일하게 달성

## Known Stubs

없음.

## Threat Flags

없음 — 신규 trust boundary 없음.

## Self-Check: PASSED

- FOUND: src/components/map/KakaoMap.tsx (DongClusterChip import + 3단계 정책 + 렌더 로직)
- ClusterMarker 참조: 0건 확인
- DongClusterChip 참조: 3건 확인
- TypeScript: 오류 없음 (tsc --noEmit)
