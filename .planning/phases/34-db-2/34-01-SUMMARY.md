---
phase: 34-db-2
plan: "01"
subsystem: database
tags: [regions, grep-sweep, enrichment, admin-dashboard, dynamic-region-filter]

requires:
  - phase: 34-db-2
    provides: "34-00 — regions 테이블에 부산 16개 구·군 시딩 완료 (is_active=true), 38개 활성 지역"
provides:
  - "3-pass grep 재스윕 결과 분류표 (Phase 33 종료 후 신규 하드코딩 재발 여부 감사)"
  - "admin/region-expansion 대시보드 NEW_CODES=부산16/OLD_CODES=경남22 부산 추적 기준 전환"
  - "collect-school-stats.ts / fetch-sports-facilities.ts regions 동적 조회 전환 (부산 자동 포함)"
affects: [34-02, 34-04, 34-07, 34-09]

tech-stack:
  added: []
  patterns:
    - "enrichment 스크립트 내 인라인 loadTargetRegions()/loadAddressKeywords() 헬퍼 — scripts/seed-complexes.ts:32-39 검증된 패턴 재사용"

key-files:
  created: []
  modified:
    - src/app/admin/region-expansion/page.tsx
    - scripts/collect-school-stats.ts
    - scripts/fetch-sports-facilities.ts

key-decisions:
  - "gap-analysis/page.tsx, invest/page.tsx, invest/region/[sggCode]/page.tsx의 SGG_LABEL 정적 맵은 34-02와 동일한 '정적 라벨 맵' 버그 클래스이나 34-02-PLAN.md의 파일 목록(7개)에 포함되지 않은 것으로 확인됨 — files_modified 범위 밖이라 이 plan에서는 수정하지 않고 (c) 분류 + 명시적 갭으로 기록. 34-02 실행 전 이 3개 파일 추가 여부를 오케스트레이터가 확인 필요"
  - "rankings-page.ts의 CHAMPION_REGIONS/REGION_TABS(창원 5구+김해 6개 고정)는 '구별 대장단지' UI를 위한 의도적 curated set으로 판단, 버그 아님으로 분류 (d) — CONTEXT.md 프론트엔드 UI 구조 동결 제약과도 일치"
  - "sgis.ts의 CHANGWON_GU_CODES/GIMHAE_CODE, reb.ts의 SGG_TO_REB_CLS, worker/cafe-ingest/route.ts의 SGG_CODE_MAP은 각각 미사용 dead export / R-ONE 가격지수(명시적 defer) / naver-cafe 지역 다중화(명시적 defer) 사유로 (d) 분류, 미수정"

patterns-established: []

requirements-completed: [REGION-13]

duration: ~50min
completed: 2026-07-09
---

# Phase 34-01: 하드코딩 지역 배열 재스윕 + admin 대시보드 부산 전환 Summary

**3-pass grep 재스윕으로 Phase 33 종료 후 재발한 하드코딩 2건(admin 대시보드 NEW_CODES/OLD_CODES, enrichment 스크립트 2개) 확인·전환, 신규 UI 라벨 갭 3건 발견**

## Performance

- **Duration:** ~50min
- **Tasks:** 2/2 완료
- **Files modified:** 3

## Accomplishments
- 3-pass grep 재스윕(표준 변수명 + Phase 33 사각지대 변수명 + 리터럴 sgg_code 값) 실행, 전체 결과를 분류표로 기록
- `admin/region-expansion/page.tsx`의 `NEW_CODES`/`OLD_CODES`를 부산 추적 기준(NEW_CODES=부산16, OLD_CODES=경남22)으로 전환, 헤더/메타/WAVE_PLANS/체크포인트 카드를 Phase 34 기준으로 갱신
- `collect-school-stats.ts`의 `GYEONGNAM_SGG` 정적 배열(22개)과 `SIDO_CODE='48'` 하드코딩을 `regions.is_active=true` 동적 조회(`loadTargetRegions()`)로 전환, sidoCode는 각 지역 sggCode 앞 2자리로 유도
- `fetch-sports-facilities.ts`의 `ADDRESS_KEYWORDS` 정적 배열(18개)을 `regions.si` 동적 조회(`loadAddressKeywords()`)로 전환
- 재스윕 과정에서 34-02 범위 밖의 UI 라벨 갭 3개 파일(gap-analysis/page.tsx, invest/page.tsx, invest/region/[sggCode]/page.tsx) 발견 — 34-02 실행 전 확인 필요 항목으로 기록

## 3-Pass Grep 재스윕 결과 분류표

**Pass 1 — 표준 변수명** (`ALLOWED_SGG_CODES|ACTIVE_SGG_CODES|TARGET_SGG|VALID_SGG_CODES|LAWD_CODES|offiSggCodes`)

| 파일 | 내용 | 분류 |
|---|---|---|
| `src/lib/data/regions.ts:11` | 헬퍼 함수가 대체한 과거 패턴명을 나열하는 docstring 주석 | (a) 이미 동적화 완료 — 주석일 뿐 코드 아님 |

**Pass 2 — Phase 33 사각지대 변수명** (`CHANGWON_GU_MAP|SGG_TO_ADDR|GYEONGNAM_SGG|ADDRESS_KEYWORDS|NEW_CODES|OLD_CODES`)

| 파일 | 내용 | 분류 |
|---|---|---|
| `src/app/admin/region-expansion/page.tsx` | `NEW_CODES`/`OLD_CODES` 경남 고정 배열 | **(b) 이 plan Task 1에서 처리 — 완료** |
| `scripts/collect-school-stats.ts` | `GYEONGNAM_SGG` 정적 배열 | **(b) 이 plan Task 2에서 처리 — 완료** |
| `scripts/fetch-sports-facilities.ts` | `ADDRESS_KEYWORDS` 정적 배열 | **(b) 이 plan Task 2에서 처리 — 완료** |
| `src/lib/data/realprice-officetel.ts:128`, `src/lib/data/regions.ts:44` | `SGG_TO_ADDR`/`CHANGWON_GU_MAP` 등 과거 패턴명을 언급하는 주석 | (a) 이미 동적화 완료 — 주석일 뿐 |
| `src/services/molit-unsold.ts:71`, `src/services/molit-unsold.test.ts:43` | `CHANGWON_GU_MAP` 언급 주석/테스트명 (실제 로직은 regions 동적 역매칭) | (a) 이미 동적화 완료 |

**Pass 3a — 경남 리터럴 코드값** (`'481[0-9][0-9]'|'482[0-9][0-9]'`, 창원5구+김해 6개 재확인용)

| 파일 | 내용 | 분류 |
|---|---|---|
| `src/app/admin/region-expansion/page.tsx` | OLD_CODES/NEW_CODES | (b) 위와 동일, 처리 완료 |
| `src/app/api/admin/cardnews/data/route.ts`, `src/app/api/invest/prediction-commentary/route.ts`, `src/components/admin/AdCreateForm.tsx`, `src/components/admin/AdEditForm.tsx`, `src/components/admin/cardnews/BuilderOptionsPanel.tsx`, `src/components/invest/PredictionSection.tsx`, `src/components/presale/EnrichedPresaleCard.tsx` | `SGG_LABEL`/`{code,label}` 정적 라벨 맵 (7개 파일, 34-02-PLAN.md files_modified와 정확히 일치) | **(c) 34-02에서 처리 예정** |
| `src/app/gap-analysis/page.tsx`, `src/app/invest/page.tsx`, `src/app/invest/region/[sggCode]/page.tsx` | `SGG_LABEL` 정적 라벨 맵 — 이미 경남 22개 전체 보유, 부산 16개만 누락. fallback이 `SGG_LABEL[code] ?? code`라 크래시는 없으나 라벨이 코드값으로 표시됨 | **⚠ (c)에 준하는 신규 발견 — 34-02와 동일 버그 클래스이나 34-02-PLAN.md 파일 목록에 미포함. 이 plan(files_modified 범위: admin/region-expansion·collect-school-stats·fetch-sports-facilities)의 declared scope 밖이라 직접 수정하지 않음. 34-02 실행 시 반드시 재확인 필요 — 아래 "Next Phase Readiness" 참고** |
| `src/app/api/worker/cafe-ingest/route.ts` | `SGG_CODE_MAP`(창원·김해 5구) | (d) naver-cafe.ts 지역별 다중화와 동일 계열, CONTEXT.md에서 명시적으로 defer됨 |
| `src/lib/data/rankings-page.ts` | `CHAMPION_REGIONS`/`REGION_TABS` (창원5구+김해 6개 고정) | (d) "구별 대장단지"용 의도적 curated set(주석에 "6개 sub-region" 명시) — 22/38개 전체로 자동 확장하도록 설계된 필터가 아님. 프론트엔드 UI 구조 동결 제약과도 일치, 버그 아님 |
| `src/services/reb.ts` | `SGG_TO_REB_CLS`(R-ONE 가격지수 CLS_ID 매핑, 창원·김해) | (d) CONTEXT.md Deferred Ideas — 부산 R-ONE 가격지수는 미분양과 동일하게 명시적 defer |
| `src/services/sgis.ts` | `CHANGWON_GU_CODES`/`GIMHAE_CODE` | (d) 저장소 전체에서 정의부 외 참조처 없음(dead export) — 프로덕션 경로 아님 |
| `scripts/collect-district-stats.ts` | 창원 5개 구 전용 `TARGETS` 배열 (분기 1회 수동 실행, 인구·세대현황) | (d) 명시적으로 "창원시 5개 구" 범위로 설계된 레거시 수동 스크립트, 자동 파이프라인 아님. 부산 인구통계는 admin 대시보드상 `region_population_cache`(다른 소스, 완료 표시)로 별도 처리됨 |
| `scripts/enrich-officetel-bldrgst.ts` | `SGG_LABEL`(6개, 콘솔 로그용) | (d) 오피스텔 건축물대장 1회성 보강 스크립트의 로그 라벨, 자동 파이프라인 아님 |
| `scripts/fix-coord-duplicates.ts` | `.in('sgg_code', [...])` 좌표 중복 재지오코딩 대상 코드 | (d) 특정 시점 1회성 ad-hoc 수정 스크립트, 반복 실행 대상 아님 |
| `scripts/seed-complexes.ts` | KAPT API 미가용 시 폴백 샘플 데이터(K4812100001 등) | (d) 지역 필터가 아닌 fallback fixture 데이터 |
| `scripts/seed.ts` | regions 시딩 소스 자체 | (a) 이 배열이 곧 regions 테이블의 근원 데이터 — 하드코딩이 아니라 올바른 설계 |
| `*.test.ts` (complex-search, complexes-map, seed-region, molit-ingest 등 다수) | 테스트 픽스처의 `'48121'` 등 리터럴 | (d) 프로덕션 경로 아님, 테스트 데이터 |

**Pass 3b — 부산 리터럴 코드값** (`'26[0-9][0-9][0-9]'`, 시딩 후 신규 유입 확인용)

| 파일 | 내용 | 분류 |
|---|---|---|
| `scripts/seed.ts` | 부산 16개 구 regions 시딩 원본 데이터 (34-00에서 추가됨) | (a) 정상 — 시딩 소스 |
| `src/__tests__/seed-region.test.ts` | 부산 16개 sgg_code assertion (34-00에서 추가됨) | (a) 정상 — 회귀 테스트 |

## Task Commits

1. **Task 1: 저장소 전체 하드코딩 지역 배열 재스윕 + admin 대시보드 부산 추적 전환** - `0c1a38c` (feat)
2. **Task 2: enrichment 스크립트 region 배열 → regions 동적 조회 전환** - `1b65d8b` (refactor)

## Files Created/Modified
- `src/app/admin/region-expansion/page.tsx` - NEW_CODES=부산16/OLD_CODES=경남22 전환, 헤더/메타/WAVE_PLANS(34-00~34-10)/체크포인트 카드(34-06/34-09) 텍스트 Phase 34 기준 갱신
- `scripts/collect-school-stats.ts` - `GYEONGNAM_SGG`+`SIDO_CODE` 정적 배열 제거 → `loadTargetRegions()`로 regions 동적 조회(sidoCode는 sggCode 앞 2자리로 유도), `callSchoolInfoApi()`에 sidoCode 파라미터 추가
- `scripts/fetch-sports-facilities.ts` - `ADDRESS_KEYWORDS` 정적 배열 제거 → `loadAddressKeywords()`로 regions.si 동적 조회, 기존 `.range()` 페이지네이션 루프는 그대로 유지

## Decisions Made
- gap-analysis/invest/invest-region 3개 파일의 SGG_LABEL 갭은 34-02와 동일 버그 클래스이나 이 plan의 declared files_modified 범위 밖이라 직접 수정하지 않고 명시적으로 기록만 함(scope creep 방지) — 34-02 실행 전 확인 필요
- rankings-page.ts의 CHAMPION_REGIONS/REGION_TABS는 의도적 curated UI 셋(6개 sub-region)으로 판단, 버그 아님으로 분류하고 수정하지 않음
- sgis.ts/reb.ts/worker/cafe-ingest 하드코딩은 각각 dead code / 명시적 defer(R-ONE, naver-cafe) 사유로 미수정

## Deviations from Plan

None - 계획된 대로 정확히 실행됨. Task 1의 acceptance_criteria가 명시한 grep 검증(`Phase 33 완료 후 삭제 예정` 문자열 0건, `'26350'`/`'48890'` 존재)과 Task 2의 grep 검증(`GYEONGNAM_SGG`/`ADDRESS_KEYWORDS` 0건, `is_active` 존재) 모두 통과. lint(tsc 포함) 통과.

## Issues Encountered
- 초기 커밋 후 `grep -c "GYEONGNAM_SGG"` 재확인 시 남아있던 설명 주석 문구("정적 배열(GYEONGNAM_SGG)을 제거")가 acceptance_criteria의 리터럴 문자열 검사에 걸려 1건으로 카운트됨 — 주석 문구를 변수명 언급 없이 재작성하여 0건으로 해결(같은 커밋에 포함)
- scripts/ 디렉터리가 메인 tsconfig.json에서 exclude 처리되어 `npm run lint`의 tsc가 스크립트 파일을 검사하지 않음 — 별도로 `npx tsc --noEmit --skipLibCheck` 스탠드얼론 체크를 수행해 두 스크립트 파일의 타입 오류 없음을 확인

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 34-02(UI 지역 라벨) 실행 전 확인 필요: `src/app/gap-analysis/page.tsx`, `src/app/invest/page.tsx`, `src/app/invest/region/[sggCode]/page.tsx` 3개 파일의 `SGG_LABEL` 맵도 부산 16개 구 라벨이 필요함 (34-02-PLAN.md의 7개 파일 목록에는 미포함) — 오케스트레이터가 34-02 실행 전 이 3개 파일을 plan 범위에 추가할지 결정 필요
- collect-school-stats.ts/fetch-sports-facilities.ts는 코드 전환만 완료, 실제 실행(enrichment)은 34-07(좌표 지오코딩 완료 후)에서 수행 — 두 스크립트 모두 PostgREST 1,000행 캡 대비 페이지네이션 기존 유지 확인됨
- admin/region-expansion 대시보드는 부산 16개 구 기준으로 정상 렌더링 준비 완료(lint/tsc 통과) — 34-03(KAPT 시딩) 이후부터 실제 데이터로 진행률 표시 시작

---
*Phase: 34-db-2*
*Completed: 2026-07-09*
