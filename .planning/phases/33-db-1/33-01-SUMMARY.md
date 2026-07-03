---
phase: 33-db-1
plan: "01"
subsystem: invest-gap-analysis
tags: [invest, gap-analysis, regions, kosis, refactor]

# Dependency graph
requires: ["33-00"]
provides:
  - "/invest, /invest/region/[sggCode], /gap-analysis 3개 페이지의 sgg_code 검증이 regions 테이블 기반 동적 조회로 전환됨"
  - "scripts/seed-kosis-population.ts --sgg CLI 오버라이드 + regions is_active=true 동적 기본값 지원"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "invest.ts/gap-analysis.ts 데이터 레이어 + 두 RSC 페이지: getActiveSggCodes(supabase) 호출 후 결과 배열로 allowlist 검증"
    - "SGG_LABEL 정적 Record에 경남 16개 라벨 기계적 추가 (UI 구조 변경 없음, CONTEXT.md 2026-07-03 결정 계승)"

key-files:
  created: []
  modified:
    - src/lib/data/invest.ts
    - src/app/invest/page.tsx
    - src/app/invest/region/[sggCode]/page.tsx
    - src/lib/data/gap-analysis.ts
    - src/app/gap-analysis/page.tsx
    - scripts/seed-kosis-population.ts

key-decisions:
  - "gap-analysis.ts의 getGapRankings: filter.sggCode가 있을 때만 getActiveSggCodes(supabase)를 호출하도록 조건부 배치 — plan 명세보다 약간 최적화(불필요한 regions 쿼리 회피), 동작은 동일"
  - "seed-kosis-population.ts는 REST fetch 스타일 유지, server-only/@/ 경로 별칭 미사용 (scripts/ tsconfig exclude 원칙 계승)"

requirements-completed: [REGION-02, REGION-10]

# Metrics
duration: ~20min
completed: 2026-07-03
---

# Phase 33 Plan 01: /invest·/gap-analysis 동적 지역 필터 전환 + 인구 시딩 스크립트 확장 Summary

**`/invest`, `/invest/region/[sggCode]`, `/gap-analysis` 3개 페이지와 데이터 레이어의 `ALLOWED_SGG_CODES` 6개 하드코딩 배열을 `getActiveSggCodes()` 동적 조회로 교체하고, `scripts/seed-kosis-population.ts`에 `--sgg` CLI 오버라이드 + regions 동적 기본값을 추가했다.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3/3 완료
- **Files modified:** 6

## Accomplishments

- `src/lib/data/invest.ts`에서 `ALLOWED_SGG_CODES` 정적 export 제거
- `src/app/invest/page.tsx`, `src/app/invest/region/[sggCode]/page.tsx`: `getActiveSggCodes(supabase)` 동적 조회로 sgg_code 검증 전환, `REGION_OPTIONS`를 컴포넌트 내부 로컬 변수로 재정의, `SGG_LABEL`에 경남 16개 라벨 기계적 추가
- `src/lib/data/gap-analysis.ts`: `getGapRankings` 내부 allowlist를 `getActiveSggCodes()` 동적 조회로 전환 (defense-in-depth 유지, Decisions Log 2026-05-28 패턴 계승)
- `src/app/gap-analysis/page.tsx`: 동일한 동적 조회 패턴 적용 + `SGG_LABEL` 16개 라벨 추가
- `scripts/seed-kosis-population.ts`: 6개 하드코딩 `SGG_CODES` 배열 제거 → `--sgg=` CLI 오버라이드 + `regions.is_active=true` 동적 기본값(경남 22개) 패턴 적용 (`backfill-realprice.ts`와 동일 패턴, REST fetch 스타일 유지)
- 실제 실행 검증: `--sgg=48170,48250` 오버라이드로 2개 지역만 대상 처리 확인, 인자 없이 실행 시 22개 지역 전체 대상 확인 — KOSIS 인구 데이터 220건이 `region_population_cache`에 실제로 upsert됨 (경남 신규 16개 지역 인구 통계 사전 적재 완료, 부수 효과)

## Task Commits

Each task was committed atomically:

1. **Task 1: /invest 페이지 동적 지역 필터 전환** - `9d4807f` (refactor)
2. **Task 2: /gap-analysis 페이지 동적 지역 필터 전환** - 코드는 커밋 `4c92bea`에 포함됨 (아래 "Deviations" 참고 — 동시 실행 중이던 오케스트레이터 프로세스가 33-00 plan 마무리 docs 커밋을 생성하며 이 작업의 스테이징 영역을 함께 커밋함)
3. **Task 3: seed-kosis-population.ts --sgg CLI 오버라이드 + regions 동적 기본값** - `b6ef8b6` (refactor)

## Files Created/Modified

- `src/lib/data/invest.ts` - `ALLOWED_SGG_CODES` 제거, `ALLOWED_AREA_BUCKETS`는 유지
- `src/app/invest/page.tsx` - `getActiveSggCodes` import·호출, `REGION_OPTIONS` 로컬 변수화, `SGG_LABEL` 16개 추가
- `src/app/invest/region/[sggCode]/page.tsx` - `getActiveSggCodes` 기반 `notFound()` 검증, `SGG_LABEL` 16개 추가 (`generateMetadata`는 변경 없음, static fallback 유지)
- `src/lib/data/gap-analysis.ts` - `getGapRankings` allowlist 동적화
- `src/app/gap-analysis/page.tsx` - 동일 패턴, `SGG_LABEL` 16개 추가
- `scripts/seed-kosis-population.ts` - `getSggCodes()` 함수 신규, `fetchFromKosis(sggCodes)` 파라미터화, `main()` 갱신

## Decisions Made

- `gap-analysis.ts`의 `getGapRankings`: plan 명세는 `if (filter.sggCode && allowedSggCodes.includes(...))` 형태(항상 `getActiveSggCodes` 호출)를 제시했으나, `filter.sggCode`가 없을 때는 `getActiveSggCodes` 호출 자체를 건너뛰도록 조건부 중첩으로 구현 — 불필요한 regions 쿼리를 피하는 사소한 최적화이며 동작·검증 로직은 plan 의도와 동일 (Rule 1 범주 밖의 스타일 개선, 별도 승인 불필요 수준)

## Deviations from Plan

### Task 2 커밋이 별도 커밋으로 남지 않고 33-00 docs 커밋에 흡수됨

- **발견 시점:** Task 2 완료 후 `git commit` 실행
- **현상:** `git add`로 Task 2 파일(`src/lib/data/gap-analysis.ts`, `src/app/gap-analysis/page.tsx`)을 스테이징한 직후, 동시에 실행 중이던 다른 프로세스(33-00 plan을 마무리하는 오케스트레이터)가 `.planning/STATE.md`, `.planning/ROADMAP.md`, `33-00-SUMMARY.md`, `deferred-items.md`를 포함한 `docs(33-00)` 커밋을 생성했고, 이 커밋이 이미 스테이징되어 있던 Task 2 변경분까지 함께 커밋해버림 (커밋 해시 `4c92bea`). 이후 `git commit` 재시도 시 "nothing to commit" 응답.
- **원인:** 이 세션은 순차 실행(worktree 격리 없이 메인 워킹 트리 공유)으로 설계되었으나, Wave 0(33-00) plan의 최종 문서화 커밋이 이 세션의 Task 2 실행과 시간적으로 겹치며 공유 스테이징 영역 경쟁이 발생함.
- **영향 평가:** 코드 내용은 정확함 — `git diff HEAD~1 HEAD -- src/lib/data/gap-analysis.ts src/app/gap-analysis/page.tsx`로 대조한 결과 Task 2에서 의도한 변경사항과 100% 일치. 단, 커밋 메시지가 Task 2 작업을 반영하지 않고(`docs(33-00): ...`), STATE.md/ROADMAP.md와 뒤섞여 커밋됨 — "Do NOT touch STATE.md/ROADMAP.md" 지침을 직접 위반한 것은 아님(내가 stage하거나 commit한 것이 아니라 다른 프로세스가 수행) 이나 결과적으로 같은 커밋에 섞임.
- **조치:** 이력을 되돌리거나 rebase/amend하는 것은 destructive git 금지 규칙에 해당하고 이미 발생한 정상 코드 변경을 되돌릴 실익이 없다고 판단하여 그대로 두고 Task 3으로 진행. 코드 정확성은 self-check에서 재확인함.
- **후속 권고:** 이 phase의 다른 Wave 1 plan을 실행하는 executor들도 동일한 공유 워킹 트리 경쟁 위험이 있음 — 오케스트레이터가 Wave 경계마다 문서 커밋을 생성하는 타이밍과 개별 plan executor의 태스크 커밋 타이밍이 겹치지 않도록 조율 필요.

### 그 외

None — 나머지 태스크는 plan 그대로 실행됨.

## Issues Encountered

- **`scripts/seed-kosis-population.ts --sgg=` 검증 시 `dotenv-cli`의 `--` 구분자 필요성 확인**: plan의 `<verify>` 명령(`npx dotenv-cli -e .env.local npx tsx scripts/seed-kosis-population.ts --sgg=48170,48250`)을 그대로 실행하면 `dotenv-cli`가 `--` 구분자 없이는 뒤따르는 `--sgg=...` 플래그를 하위 명령으로 전달하지 않고 삼켜버려, 스크립트가 인자 없음으로 인식해 regions 테이블 전체(22개)를 대상으로 동작함(코드 버그 아님, `dotenv-cli` 자체 플래그 파싱 동작). `npx dotenv-cli -e .env.local -- npx tsx scripts/seed-kosis-population.ts --sgg=48170,48250`로 `--` 구분자를 추가하자 정상적으로 2개 지역만 대상으로 처리됨을 확인 — 스크립트 코드는 정상. 단, 첫 번째(구분자 없는) 실행 시도가 의도치 않게 KOSIS API를 22개 전체 지역에 대해 호출하고 `region_population_cache`에 220건을 upsert하는 부수 효과가 발생함 — 이는 정확한 데이터이며(경남 신규 16개 지역 인구 통계 사전 적재라는 phase 목표와 부합), 별도 롤백 불필요.

## User Setup Required

None — 외부 서비스 설정 불필요.

## Next Phase Readiness

- `/invest`, `/gap-analysis` 데이터 레이어와 페이지가 regions 테이블 기반 동적 조회로 전환되어, 향후 지역 확장 시 코드 수정 없이 `regions.is_active` 플래그만으로 노출 범위 조절 가능
- `region_population_cache`에 경남 22개 지역 전체 인구 데이터가 이미 적재되어, `/invest/region/[sggCode]` 상세 페이지의 "인구 (KOSIS)" 섹션이 신규 16개 지역에서도 즉시 정상 표시됨
- Task 2 커밋 흡수 이슈(위 Deviations 참고)는 코드 정확성에 영향 없으나, 이후 Wave 1 plan들의 병렬/순차 실행 조율 시 참고 필요

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

All modified files verified present on disk; all three commit hashes (`9d4807f`, `4c92bea`, `b6ef8b6`) verified in `git log`.
