---
phase: 34-db-2
plan: "02"
subsystem: ui
tags: [region-labels, sgg-code, static-map, invest, cardnews, ads, presale]

requires:
  - phase: 34-db-2
    provides: "34-00 — regions 테이블에 부산 16개 구·군 시딩 완료 (is_active=true), 34-01 — 하드코딩 재스윕으로 이 plan의 파일 목록 확정 + 범위 밖 갭 3건 발견"
provides:
  - "정적 SGG_LABEL/SGG_OPTIONS/REGION_OPTIONS 라벨 맵 10개 파일에 부산 16개 구 항목 추가 (Phase 33의 33-05 패턴 재사용)"
  - "34-01이 발견한 범위 밖 갭 3건(gap-analysis/invest/invest-region) 동일 세션에서 보완 — 코드값 노출 회귀 제거"
affects: [34-04, 34-09]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/components/admin/AdCreateForm.tsx
    - src/components/admin/AdEditForm.tsx
    - src/components/admin/cardnews/BuilderOptionsPanel.tsx
    - src/components/invest/PredictionSection.tsx
    - src/components/presale/EnrichedPresaleCard.tsx
    - src/app/api/admin/cardnews/data/route.ts
    - src/app/api/invest/prediction-commentary/route.ts
    - src/app/gap-analysis/page.tsx
    - src/app/invest/page.tsx
    - "src/app/invest/region/[sggCode]/page.tsx"

key-decisions:
  - "부산 16개 구 라벨은 '부산' 접두사 없이 구명만 사용 — PredictionSection.tsx 등 대부분 파일이 이미 '창원'/'김해' 외 지역은 접두사 없이 표기하는 기존 관례를 그대로 따름(예: '중구', '해운대구'), city 접두사 불일치 없음"
  - "prediction-commentary route의 ALLOWED_SGG 입력 검증 allowlist는 수정하지 않음 — 이미 regions 동적 조회(activeSggCodes) 기반이라 부산이 자동 포함되며, 이번 작업은 응답 표시용 정적 SGG_LABEL 라벨 맵에만 국한"

patterns-established: []

requirements-completed: [REGION-14]

duration: ~25min
completed: 2026-07-09
---

# Phase 34 Plan 02: 부산 지역 라벨 정적 맵 10개 파일 보강 Summary

**정적 SGG_LABEL/SGG_OPTIONS/REGION_OPTIONS 라벨 맵을 가진 10개 파일(계획된 7개 + 34-01이 발견한 범위 밖 갭 3개)에 부산 16개 구 라벨을 기계적으로 추가, 예측·분양·광고·카드뉴스·갭투자·투자분석 화면에서 부산 데이터가 코드값 대신 실제 구 이름으로 노출됨**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2/2 완료 (+ 오케스트레이터 지시 추가 범위 1건)
- **Files modified:** 10

## Accomplishments
- Task 1: 컴포넌트 5개 파일(AdCreateForm/AdEditForm/BuilderOptionsPanel/PredictionSection/EnrichedPresaleCard)의 SGG_LABEL·SGG_OPTIONS·REGION_OPTIONS에 부산 16개 구 항목 추가
- Task 2: 데이터 라우트 2개 파일(cardnews/data/route.ts, prediction-commentary/route.ts)의 SGG_LABEL에 부산 16개 구 항목 추가, prediction-commentary의 동적 ALLOWED_SGG allowlist는 그대로 유지 확인
- 추가 범위: 34-01 executor가 재스윕 중 발견했으나 34-02-PLAN.md 파일 목록에는 없던 gap-analysis/page.tsx, invest/page.tsx, invest/region/[sggCode]/page.tsx 3개 파일도 동일 버그 클래스로 판단해 이번 실행에 포함 — 오케스트레이터 지시에 따름(아래 "Deviations from Plan" 참고)
- 총 10개 파일 모두 `npm run lint`(ESLint + tsc --noEmit) 통과, 레이아웃/JSX 구조 변경 없음(순수 데이터 배열 추가)

## Task Commits

1. **Task 1: 컴포넌트 5개 파일에 부산 16개 구 라벨 추가** - `c3427f7` (feat)
2. **Task 2: 데이터 라우트 2개 파일에 부산 16개 구 라벨 추가** - `cc049cb` (feat)
3. **추가 범위: gap-analysis/invest/invest-region 3개 파일 SGG_LABEL 보완** - `6d02125` (fix)

## Files Created/Modified
- `src/components/invest/PredictionSection.tsx` - SGG_LABEL에 부산 16개 구 추가 (지역별 예측 방향 카드 라벨)
- `src/components/presale/EnrichedPresaleCard.tsx` - SGG_LABEL에 부산 16개 구 추가 (분양 카드 지역 배지)
- `src/components/admin/AdCreateForm.tsx` - SGG_OPTIONS 배열에 부산 16개 구 추가 (광고 지역 타겟팅 드롭다운)
- `src/components/admin/AdEditForm.tsx` - SGG_OPTIONS 배열에 부산 16개 구 추가 (광고 수정 지역 타겟팅 드롭다운)
- `src/components/admin/cardnews/BuilderOptionsPanel.tsx` - REGION_OPTIONS 배열에 부산 16개 구 추가 (카드뉴스 빌더 지역 선택 버튼)
- `src/app/api/admin/cardnews/data/route.ts` - SGG_LABEL(라인 387~)에 부산 16개 구 추가 (카드뉴스 데이터 조회 라벨)
- `src/app/api/invest/prediction-commentary/route.ts` - SGG_LABEL(라인 32~)에 부산 16개 구 추가, ALLOWED_SGG는 무변경
- `src/app/gap-analysis/page.tsx` - SGG_LABEL에 부산 16개 구 추가 (갭투자 분석 지역 필터 탭)
- `src/app/invest/page.tsx` - SGG_LABEL에 부산 16개 구 추가 (투자 분석 지역 필터 탭)
- `src/app/invest/region/[sggCode]/page.tsx` - SGG_LABEL에 부산 16개 구 추가 (지역 상세 페이지 제목·메타데이터 라벨)

## Decisions Made
- 부산 16개 구 라벨은 "부산" 접두사 없이 구명만 표기 — 코드베이스 기존 관례(창원만 "창원 OO구" 접두사, 그 외 지역은 접두사 없음)를 그대로 따라 일관성 유지
- prediction-commentary route의 동적 allowlist(ALLOWED_SGG)는 수정 대상이 아님 — 이미 regions 테이블 기반으로 부산을 자동 포함하므로 이번 작업은 순수 표시용 라벨 맵에만 국한

## Deviations from Plan

### Auto-fixed Issues

**1. [오케스트레이터 지시 — 34-01 발견 갭 반영] gap-analysis/invest/invest-region 3개 파일의 SGG_LABEL 부산 라벨 누락 보완**
- **Found during:** 34-01 실행 중(재스윕 Pass 3a), 오케스트레이터가 34-02 실행 프롬프트에서 명시적으로 지시
- **Issue:** `src/app/gap-analysis/page.tsx`, `src/app/invest/page.tsx`, `src/app/invest/region/[sggCode]/page.tsx` 3개 파일에도 34-02-PLAN.md가 다루는 것과 동일한 "정적 SGG_LABEL 지역 라벨 맵" 버그 클래스가 존재했으나, 34-02-PLAN.md의 `files_modified`(7개) 목록에는 포함되지 않았음. `SGG_LABEL[code] ?? code` fallback 덕분에 크래시는 없었지만, 부산 지역 필터 드롭다운·페이지 제목·메타데이터에 구 이름 대신 코드값(`26350` 등)이 그대로 노출되는 문제였음
- **Fix:** 3개 파일의 SGG_LABEL 정적 맵에 Task 1/2와 동일한 부산 16개 구 항목(접두사 없는 구명)을 각 파일의 기존 코드 뒤(`'48890': '합천군'` 다음)에 추가. 레이아웃/JSX 변경 없음
- **Files modified:** src/app/gap-analysis/page.tsx, src/app/invest/page.tsx, src/app/invest/region/[sggCode]/page.tsx
- **Verification:** `grep -c "해운대구"` 3개 파일 각 1건 확인, `npm run lint`(ESLint + tsc --noEmit) 통과
- **Committed in:** `6d02125` (별도 fix 커밋, Task 1/2 커밋과 분리)

---

**Total deviations:** 1 auto-fixed (오케스트레이터가 34-01 SUMMARY.md의 명시적 갭 보고를 근거로 지시한 범위 확장, 임의 scope creep 아님)
**Impact on plan:** 34-02가 원래 목표한 "정적 지역 라벨 맵에 부산을 노출시킨다"는 목적을 10개 파일 전체(계획된 7개 + 갭 3개)에 걸쳐 완전하게 달성. 34-02-PLAN.md 자체의 결함이 아니라 34-01 executor가 declared scope 밖이라 처리하지 않고 명시적으로 이관한 사항을 34-02 실행 시점에 흡수한 것.

## Issues Encountered
None - 두 계획된 태스크와 추가 범위 모두 첫 시도에 acceptance_criteria·lint 통과.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 정적 지역 라벨 맵 계열의 하드코딩은 이번 plan으로 저장소 전체에서 완전히 해소됨(34-01의 3-pass 재스윕 + 34-02의 10개 파일 처리) — 34-04(school_ranking RPC 회귀 테스트) 진행에 영향 없음
- 34-03(KAPT Golden Record 시딩)·34-05(좌표 지오코딩) 착수에 이 plan의 변경사항이 미치는 영향 없음 — 순수 UI 표시 레이어 작업
- REGION-14 요구사항 완료 처리 대상

---
*Phase: 34-db-2*
*Completed: 2026-07-09*
