---
phase: 33-db-1
plan: "05"
subsystem: ui
tags: [sgg-label, ui-labels, gyeongnam-expansion, mechanical-data-change]

# Dependency graph
requires: ["33-00"]
provides:
  - "PredictionSection.tsx, prediction-commentary/route.ts, EnrichedPresaleCard.tsx, api/admin/cardnews/data/route.ts의 SGG_LABEL Record 22개 항목(기존 6 + 신규 16)"
  - "AdCreateForm.tsx, AdEditForm.tsx의 SGG_OPTIONS 배열 22개 항목"
  - "BuilderOptionsPanel.tsx의 REGION_OPTIONS 배열에 경남 16개 시군구 단독 옵션 추가"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "정적 SGG_LABEL/SGG_OPTIONS/REGION_OPTIONS 맵에 신규 지역 라벨을 기계적으로 추가 — 레이아웃/구조 변경 없이 순수 데이터 항목 추가만 수행"

key-files:
  created: []
  modified:
    - src/components/invest/PredictionSection.tsx
    - src/app/api/invest/prediction-commentary/route.ts
    - src/components/presale/EnrichedPresaleCard.tsx
    - src/app/api/admin/cardnews/data/route.ts
    - src/components/admin/AdCreateForm.tsx
    - src/components/admin/AdEditForm.tsx
    - src/components/admin/cardnews/BuilderOptionsPanel.tsx

key-decisions:
  - "prediction-commentary/route.ts의 ALLOWED_SGG 입력 검증 allowlist는 plan 범위 밖이므로 건드리지 않음 — SGG_LABEL 객체만 수정. 결과적으로 신규 16개 지역에 대한 AI 코멘터리 생성 요청은 여전히 400으로 거부되지만(기존 allowlist가 6개로 유지), 이는 이 plan의 명시적 범위(SGG_LABEL 라벨 추가만) 밖이며 별도 회귀가 아님 — 기존 동작 그대로 유지"
  - "각 파일의 기존 라벨 스타일(전체명 vs 축약형)을 그대로 따름 — 신규 시/군은 이미 독립 단위라 '창원' 류 접두사 불필요, interfaces 블록 명세와 100% 동일하게 삽입"

requirements-completed: [REGION-06]

# Metrics
duration: ~15min
completed: 2026-07-03
---

# Phase 33 Plan 05: UI SGG_LABEL 정적 맵 라벨 추가 (경남 16개 신규 시군구) Summary

**AI 예측·분양·광고 등록·카드뉴스 빌더 UI 7개 파일의 정적 SGG_LABEL/SGG_OPTIONS/REGION_OPTIONS 맵에 경남 신규 16개 시군구 라벨을 기계적으로 추가했다. 레이아웃·구조는 일절 변경하지 않았다(재기획 회의 진행 중 UI 동결 원칙 준수).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03 (33-00 완료 직후)
- **Completed:** 2026-07-03
- **Tasks:** 2/2 완료
- **Files modified:** 7

## Accomplishments

- `PredictionSection.tsx`, `prediction-commentary/route.ts`, `EnrichedPresaleCard.tsx`, `api/admin/cardnews/data/route.ts`의 `SGG_LABEL` Record가 각각 22개 키(기존 6 + 신규 16)를 가지도록 확장
- `AdCreateForm.tsx`, `AdEditForm.tsx`의 `SGG_OPTIONS` 배열이 22개 `{code, label}` 항목을 가지도록 확장 — 어드민 광고 등록/수정 폼에서 신규 시군구 타겟팅 선택 가능
- `BuilderOptionsPanel.tsx`의 `REGION_OPTIONS` 배열에 경남 16개 신규 시군구를 김해시와 동일한 패턴(그룹핑 없는 단독 옵션)으로 추가 — 카드뉴스 빌더 지역 선택기에서 신규 지역 선택 가능
- 7개 파일 모두 `interfaces` 블록에 명세된 라벨 텍스트를 문자 그대로 사용 — 자체 판단으로 라벨 문구를 변형하지 않음
- `npx tsc --noEmit` 전체 통과 (에러 0건)

## Task Commits

Each task was committed atomically:

1. **Task 1: SGG_LABEL Record 4개 파일 라벨 추가** - `ffe6725` (feat)
2. **Task 2: SGG_OPTIONS/REGION_OPTIONS 배열 3개 파일 라벨 추가** - `c0a6d31` (feat)

## Files Created/Modified

- `src/components/invest/PredictionSection.tsx` - SGG_LABEL 6→22개 (창원 접두사 스타일 유지)
- `src/app/api/invest/prediction-commentary/route.ts` - SGG_LABEL 6→22개 (동일 스타일, ALLOWED_SGG allowlist는 미변경)
- `src/components/presale/EnrichedPresaleCard.tsx` - SGG_LABEL 6→22개
- `src/app/api/admin/cardnews/data/route.ts` - SGG_LABEL 6→22개 (축약형 스타일 유지, 구별 챔피언 subtitle에 사용)
- `src/components/admin/AdCreateForm.tsx` - SGG_OPTIONS 6→22개 `{code, label}` 항목
- `src/components/admin/AdEditForm.tsx` - SGG_OPTIONS 6→22개 `{code, label}` 항목
- `src/components/admin/cardnews/BuilderOptionsPanel.tsx` - REGION_OPTIONS에 경남 16개 시군구 단독 옵션 추가 (기존 "창원 전체" 그룹핑 등은 미변경)

## Decisions Made

- `prediction-commentary/route.ts`의 `ALLOWED_SGG` 입력 검증 allowlist(보안 목적, T-22-03-01)는 plan 범위(SGG_LABEL 객체)에 명시적으로 포함되지 않아 수정하지 않음. 결과적으로 신규 16개 지역에 대한 AI 코멘터리 생성 API 호출은 여전히 400으로 거부됨(기존 동작 그대로 유지) — 이는 회귀가 아니라 plan이 정의한 범위를 정확히 지킨 것.
- 각 파일의 기존 라벨 스타일(전체명 "창원 의창구" vs 축약형 "의창구")을 그대로 유지하며 신규 항목을 삽입 — interfaces 블록 명세와 100% 동일한 텍스트 사용, 별도 판단 개입 없음

## Deviations from Plan

None - plan executed exactly as written. 7개 파일 모두 지정된 위치(마지막 기존 항목 바로 다음)에 지정된 텍스트를 그대로 삽입했으며, 레이아웃/구조/컴포넌트 계층 변경은 전혀 없었다.

## Known Stubs

None.

## Threat Flags

None — 이 plan은 신규 네트워크 엔드포인트, 인증 경로, 파일 접근 패턴, 스키마 변경을 도입하지 않았다. plan의 `<threat_model>`이 명시한 T-33-08(정보 노출, accept 처리)만 해당되며 이번 변경으로 새로운 신뢰 경계는 발생하지 않았다.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI 레이어의 SGG_LABEL/SGG_OPTIONS/REGION_OPTIONS 맵이 경남 전체 22개 시군구를 표시 가능한 상태로 확정됨
- Wave 1의 다른 plan들(33-01~33-04, 33-06, 33-09, 33-10)과 독립적으로 완료됨 (33-00만 의존)
- 블로커 없음

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 7 modified files verified present on disk with expected content; both task commit hashes (`ffe6725`, `c0a6d31`) verified in `git log --oneline --all`. `npx tsc --noEmit --pretty false` returned zero output (no errors). `npm run lint` showed only 5 pre-existing errors in files unrelated to this plan (already documented in 33-00's deferred-items.md).
