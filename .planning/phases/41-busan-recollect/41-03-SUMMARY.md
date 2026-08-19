---
phase: 41-busan-recollect
plan: "03"
subsystem: database
tags: [supabase, kapt, seed, busan, postgrest-pagination]

requires:
  - phase: 41-01
    provides: "regions 부산 16개 is_active=true + ingest_runs 4,006행 삭제 + scripts/busan-status.ts 실측 진입점"
  - phase: 41-02
    provides: "src/lib/data/backfill-args.ts 의 parseSggCodes (--sgg= 검증·분해)"
provides:
  - "scripts/seed-complexes.ts --sgg= 지역 한정 시딩 (전체 재시딩의 built_year 리셋 부작용 회피)"
  - "부산 16개 구 complexes Golden Record 1,467건 시딩 완료, 16개 구 전부 1행 이상"
  - "부산 si/gu/household_count/built_year K-apt 보강, 잔여 null 11건(0.75%)이 Phase 34 와 동일한 KAPT API 데이터 갭으로 확정"
  - "경남 22개 지역 built_year 무회귀 실증 (166건 null 전후 불변 + updated_at 타임스탬프 대조)"
  - "scripts/busan-status.ts 의 complexes 조회 PostgREST 1,000행 캡 버그 수정 (.range() 페이지네이션)"
affects: [41-04, 41-05, 41-06, 41-07, 41-08, 41-09]

tech-stack:
  added: []
  patterns:
    - "--sgg= 지역 한정 인자를 backfill-realprice.ts 의 parseSggCodes 패턴과 동일하게 seed-complexes.ts 에도 적용 (검증 로직 재사용, 자체 파싱 신설 금지)"
    - "PostgREST 는 .select() 에 명시적 .range() 가 없으면 최대 1,000행만 반환한다 — 1,000행을 넘길 가능성이 있는 조회는 반드시 .range() 페이지네이션으로 전량을 끌어온다"

key-files:
  created: []
  modified:
    - scripts/seed-complexes.ts
    - scripts/busan-status.ts

key-decisions:
  - "seedComplex() 자체는 수정하지 않는다 — --sgg 로 사정거리를 좁히는 것이 이 plan 의 대응이며, built_year 무조건 덮어쓰기 자체를 고치는 것은 운영권역 2,035건에 영향이 가는 별도 범위다"
  - "KAPT_API_KEY 등 3개 환경변수를 셸에서 .env.local 값으로 명시적 export 후 실행 — loadEnvConfig() 가 이미 설정된 값을 덮어쓰지 않는 특성을 이용해 .env.production.local 우선순위 함정을 원천 회피(Phase 34 가 겪은 것과 동일 클래스)"
  - "busan-status.ts 의 complexes 조회가 PostgREST 1,000행 캡에 걸려 부산 시딩량(1,467)의 뒤쪽 5개 구를 0으로 잘못 보고하는 것을 이번 실행에서 실측으로 발견 — .range() 페이지네이션으로 즉시 수정(Rule 3, 이 plan 의 acceptance 판정 자체가 이 스크립트에 의존하므로 blocking). ingest_runs 조회에도 동일 패턴이 잠재하나 현재 0행이라 재현 불가 — deferred-items.md 로 41-05 에 인계"
  - "경남 built_year 무회귀는 카운트 전후 비교(166→166, 불변)와 updated_at 최댓값 타임스탬프 대조(시딩 실행 시각 이전) 두 축으로 실증 — 시딩 자체(seed-complexes.ts)는 gyeongnam 행을 전혀 건드리지 않았음을 확인. kapt-enrich.ts 는 지역 필터가 없어 경남의 잔여 null 도 함께 시도하며(계획서에 문서화된 동작) 이 과정에서 gyeongnam updated_at 이 갱신됐지만 null→null(데이터 갭)이라 카운트는 불변— 이는 리셋이 아니라 무해한 재시도"

requirements-completed: [BUSAN-04]

duration: ~40min
completed: 2026-08-19
---

# Phase 41 Plan 03: 부산 K-apt Golden Record 재시딩 Summary

**`seed-complexes.ts`에 `--sgg=` 지역 한정 옵션을 추가해 부산 16개 구 K-apt 단지 1,467건을 재시딩하고(경남 22개 지역 `built_year` 무회귀 실증 완료), `kapt-enrich.ts`를 3회 반복 dispatch해 si/built_year 보강을 11건(0.75%) 잔여로 수렴시켰다 — 이 11건은 Phase 34가 특정한 것과 동일한 KAPT API 데이터 갭임을 이름 단위로 재확인했다. 부수적으로 `busan-status.ts`의 PostgREST 1,000행 캡 버그를 발견·수정했다.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-19T10:06:00Z (approx, 41-01 완료 직후)
- **Completed:** 2026-08-19T10:46:40Z
- **Tasks:** 2/2
- **Files modified:** 2 (`scripts/seed-complexes.ts`, `scripts/busan-status.ts`)

## Accomplishments

- `scripts/seed-complexes.ts`가 `--sgg=` 를 받도록 수정 — `parseSggCodes`(41-02) 재사용, 없으면 기존 전체 지역 동작 유지. `seedComplex()` 자체는 무변경(`git diff src/lib/data/complex-matching.ts` 공백 확인)
- 부산 16개 구 K-apt 시딩 1,467건 완료(1건도 실패 없음), 16개 구 전부 1행 이상(최소 26110=11건, 최대 26350=200건)
- `kapt-enrich-once.yml` 3회 dispatch로 si/built_year 보강: 1,467(null) → 478 → 11 → 11(수렴 확인). 잔여 11건의 단지명이 Phase 34(34-03-SUMMARY.md)가 특정한 11건과 **정확히 일치**(공항마을 리베르하임·명지행복주택·광안KCC스위첸하버뷰·광안경동리인·광안비치올리브씨아파트·기장포스코더샵아파트·당리삼창아파트·부산연산행복주택·연산예서두레라움·솔내음파미유·장산마을)
- 경남 22개 지역 `built_year is null` 카운트가 시딩 전후 166건으로 불변 — 무회귀 실증
- `busan-status.ts`의 `complexes` 조회가 PostgREST 1,000행 캡에 걸려 있던 것을 발견·수정(`.range()` 페이지네이션) — 수정 전 `complexes_busan_total=1000`·26440~26710 4개 구 0으로 오보고되던 것을 1,467건/16개 구 전부 정상 보고로 정정

## Task Commits

1. **Task 1: seed-complexes.ts 에 --sgg= 지역 한정 추가** - `746bc3b` (feat)
2. **Task 2 실행 중 발견 버그 수정: busan-status.ts PostgREST 1,000행 캡** - `d4a7563` (fix)
3. **Task 2: 부산 16개 구 K-apt 재시딩 + kapt-enrich 보강 실행** - 커밋 없음(plan 명시: "파일: 없음, 스크립트·워크플로 실행" — DB 상태 변경만 발생, 실측값은 본 SUMMARY 에 기록)

**Plan metadata commit:** (오케스트레이터가 wave 종료 후 생성 — 이 executor 는 STATE.md/ROADMAP.md 를 갱신하지 않는다)

## Files Created/Modified

- `scripts/seed-complexes.ts` — `--sgg=` 지역 한정 옵션 추가(`parseSggCodes` 재사용), 사용법 주석에 `built_year` 덮어쓰기 부작용·Bootstrap 모드 경고 추가. `getSggCodes()`가 `undefined` 시 기존 `regions.is_active=true` 전체 조회로 폴백
- `scripts/busan-status.ts` — `complexes` 조회를 `.range()` 페이지네이션으로 전환해 PostgREST 1,000행 캡 제거

## KAPT_API_KEY 출처 + 프리플라이트 결과

`.env.local`의 값을 셸에서 `KAPT_API_KEY`·`NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 3개로 명시적 `export` 한 뒤 실행했다(`loadEnvConfig()`는 이미 설정된 환경변수를 덮어쓰지 않으므로, `.env.production.local`이 우선 로드되는 함정을 원천 차단). `.env.local`의 `KAPT_API_KEY` 셸 상 길이는 64자.

프리플라이트(`--sgg=26110` 단일 지역)에서:
```
대상 지역: 26110

📍 26110 단지 목록 조회 중...
  → 11건 수신
  ✓ 11건 upsert 완료

✅ 총 11건 upsert 완료
```
`🔧 Bootstrap 모드` 문구가 나타나지 않았다 — API 모드로 정상 실행됨을 확인한 뒤 나머지 15개 구를 진행했다. 전체 실행(16개 구) 로그에서도 이 문구는 한 번도 나타나지 않았다.

## 시딩 실측 보고

### `npx tsx scripts/busan-status.ts --json` (최종, `busan-status.ts` 수정 반영 후)

```json
{
  "regions_busan_active": 16,
  "regions_total_active": 38,
  "complexes_busan_total": 1467,
  "complexes_coord_not_null": 0,
  "complexes_coord_coverage_pct": 0,
  "complexes_by_gu": {
    "26110": 11, "26140": 42, "26170": 27, "26200": 43, "26230": 171,
    "26260": 127, "26290": 101, "26320": 114, "26350": 200, "26380": 142,
    "26410": 87, "26440": 52, "26470": 106, "26500": 64, "26530": 98, "26710": 82
  },
  "complexes_avg_sale_per_pyeong_not_null": 0,
  "ingest_runs_busan_total": 0,
  "ingest_runs_by_source": {},
  "ingest_runs_rows_upserted_sum": 0,
  "transactions_busan_total": 0,
  "transactions_complex_id_null": 0,
  "transactions_linked_pct": null,
  "transactions_deal_date_min": null,
  "transactions_deal_date_max": null,
  "complex_rankings_busan": 0,
  "complex_gap_stats_busan": 0,
  "complex_price_predictions_busan": 0,
  "db_size_bytes": 470666387,
  "db_size_mb": 448.8624448776245,
  "db_size_pct_of_pro_8gb": 5.479277891572565,
  "db_size_error": null
}
```

16개 구 breakdown 전부 1행 이상(최소 11건, `complexes == 0` 인 구 0개) — acceptance criteria 충족.

### 4숫자 대조

| 값 | 의미 |
|---|---|
| **1,467** | 이번 실측(부산 K-apt 시딩) |
| **1,463** | Phase 34 K-apt 실측 시딩량 |
| **1,594** | 2026-08-10 삭제 시점 `complexes` 행 수 |
| **1,500** | ROADMAP·41-CONTEXT 요구치 |
| **1,400** | `--assert-seed-gate` 차단 게이트 |

**관계**: 1,467 ≈ 1,463(Phase 34 실측)과 거의 일치(+4, K-apt 목록 API가 시간 경과에 따라 소폭 변동하는 것으로 설명 가능한 범위) → **K-apt 원본 데이터가 안정적임을 재확인.** 1,467 < 1,594(삭제 시점)이며 41-CONTEXT가 이미 설명한 대로 그 차이(131건)는 시딩 이후 한 달간 다른 경로(일배치 매칭·큐 승인 등)로 얹힌 값이라 K-apt 시딩 단계에서는 재현되지 않는 것이 정상이다. 1,467 < 1,500(요구치) — 41-01-SUMMARY가 이미 예견한 대로 K-apt 시딩만으로는 1,500에 못 미쳤다(원인: K-apt 등록 단지 자체가 1,463~1,467건이며 요구치 1,500은 추가 소스 없이는 K-apt 단독으로 도달 불가능한 수치로 보인다 — 41-04 이후로 인계). 1,467 ≥ 1,400(게이트 임계) → **complexes 카운트 서브 게이트는 통과.**

### K-apt 보강 수렴 경로

`kapt-enrich-once.yml` (60분 timeout, 로컬 10분 Bash 한계 회피) dispatch 3회:

| 회차 | run id | 결과 | 부산 `si`/`built_year` null |
|---|---|---|---|
| 시딩 직후 | - | - | 1,467 |
| 1 | 32242068929 | failure(exit 1, 정상 — 잔여 있음) | 478 |
| 2 | 32242695947 | failure(exit 1) | 11 |
| 3 | 32243155589 | failure(exit 1) | 11 (연속 2회 동일 — 수렴 확인) |

`kapt-enrich.ts`는 잔여 실패(`failCount > 0`)가 있으면 설계상 `exit 1`을 반환한다(재실행 유도) — 워크플로 "failure" 표시는 예상된 동작이며 버그가 아니다.

잔여 11건 목록(sgg_code, kapt_code):
```
솔내음파미유            26230  A61409006
장산마을                26350  A61275002
당리삼창아파트           26380  A10027449
공항마을 리베르하임      26440  A10024210
명지행복주택            26440  A10023943
연산예서두레라움         26470  A10023232
부산연산행복주택         26470  A10023561
광안KCC스위첸하버뷰      26500  A10023958
광안경동리인            26500  A10023518
광안비치올리브씨아파트   26500  A10023802
기장포스코더샵아파트     26710  A10023411
```
Phase 34(34-03-SUMMARY.md "Issues Encountered")가 특정한 11건과 **단지명·구 전부 일치** — 동일한 KAPT `fetchKaptBasicInfo` 데이터 갭이며 재실행으로 해결되지 않음이 재확인됨(2회 연속 11건 동일).

`scripts/seed-failures.csv` — 이번 세션 실행으로 갱신되지 않았다(파일이 2026-04-30 16:19 mtime 그대로, `git status`에도 변경 없음). 16개 구 모두 실패 0건이었음을 의미한다.

## 경남 22개 지역 built_year 무회귀 실증

| 시점 | 경남(`48%`) `built_year is null` 카운트 | 경남 `updated_at` 최댓값 |
|---|---|---|
| 시딩 직후(부산 16개 구 시딩 완료 후) | **166** | 2026-08-19T09:58:22Z (세션 시작 이전) |
| kapt-enrich 3회 dispatch 후(최종) | **166** (불변) | 2026-08-19T10:31:49Z |

**해석**: 카운트가 166 → 166으로 불변 — Phase 34 종료 시점의 잔여 177(11 busan + 166 gyeongnam)과 정확히 일치하는 166이 gyeongnam 몫이었고, 이번 세션에서도 그대로다. 시딩 직후 측정한 `updated_at` 최댓값(09:58:22Z)이 이번 세션의 첫 시딩 명령 실행 시각(약 10:12Z 이후)보다 앞선다 — `seed-complexes.ts`(`--sgg=26xxx`)가 gyeongnam(`48%`) 행을 **단 한 건도 쓰지 않았음**을 타임스탬프로 직접 증명한다. `kapt-enrich.ts`는 지역 필터가 없어(plan에 문서화된 대로) gyeongnam의 잔여 null 166건도 함께 재시도하며 이 과정에서 `updated_at`이 10:31:49Z로 갱신됐지만, 카운트 자체는 166 → 166 그대로다(대상이 이미 `built_year IS NULL`인 행만이라 null→null 재시도이며 리셋이 아니다). 코드 경로상으로도 `built_year`를 non-null → null 로 되돌릴 수 있는 것은 `seedComplex()`(UPDATE 무조건 덮어쓰기) 뿐인데, 그 함수가 gyeongnam sgg_code로 호출된 적이 이번 세션에 전혀 없다(`--sgg` 인자가 busan 코드로만 한정됨).

## `--assert-seed-gate` 판정

```
npx tsx scripts/busan-status.ts --assert-seed-gate
❌ 게이트 미달:
   - 좌표 커버리지 0.0% < 95% — geocode-complexes.ts 미실행 또는 부족
EXIT=1
```

**exit 1이며, 41-04로 그대로 넘기지 않고 있는 그대로 보고한다.** 게이트의 3개 서브 조건 중 2개(`complexes >= 1400`, `0개 단지인 구 0곳`)는 이미 통과했고, 나머지 1개(좌표 커버리지 ≥ 95%)만 미달이다. `complexes_coord_not_null=0`인 이유는 K-apt 단지목록 API가 좌표를 제공하지 않기 때문(34-03-PLAN.md가 이미 문서화)이며, 좌표는 41-04(카카오 지오코딩)의 산출물이다. 41-01-SUMMARY의 "Next Phase Readiness"도 "41-03·41-04 완료 후 재실행하면 통과해야 한다"고 명시해, 이 게이트가 원래 두 plan의 합작 산출물을 판정하도록 설계되었음을 확인한다. 이 plan(41-03) 단독으로는 게이트가 통과할 수 없는 구조이며, 41-04가 좌표를 채운 뒤 재실행해 판정해야 한다.

## Decisions Made

- `--sgg` 검증을 `parseSggCodes`(41-02 산출물) 재사용으로 처리 — 자체 파싱 로직을 신설하지 않음
- `KAPT_API_KEY` 등 3개 환경변수 명시적 export로 `.env.production.local` 우선순위 함정 회피(Phase 34 선례와 동일 워크어라운드)
- `busan-status.ts`의 PostgREST 1,000행 캡 버그를 발견 즉시 수정(Rule 3) — 이 plan의 acceptance 판정 자체가 이 스크립트의 정확성에 의존하므로 blocking으로 판단. `ingest_runs` 조회의 동일 잠재 결함은 현재 0행이라 재현 불가해 손대지 않고 `deferred-items.md`로 41-05에 인계

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `busan-status.ts`의 `complexes` 조회가 PostgREST 1,000행 캡에 걸려 시딩 결과를 오보고**
- **Found during:** Task 2 (부산 16개 구 시딩 후 `busan-status.ts --json` 검증)
- **Issue:** `collectMetrics()`의 `complexes` select가 `.range()` 없이 `.in('sgg_code', BUSAN_SGG_CODES)`만 걸어, PostgREST 기본 페이지 크기(1,000행)에서 잘렸다. 부산 시딩량이 1,467건으로 1,000을 넘어서면서 `complexes_busan_total=1000`·`26440`~`26710` 4개 구가 0으로 보고되는 조용한 절단이 관측됐다(카운트 쿼리로 검증한 실제값은 1,467/16개 구 전부 1건 이상)
- **Fix:** `.range(page*1000, page*1000+999)` 페이지네이션 루프로 전량을 끌어오도록 변경
- **Files modified:** `scripts/busan-status.ts`
- **Verification:** 수정 후 `--json` 재실행 결과 `complexes_busan_total=1467`, 16개 구 전부 실제 count 쿼리와 일치(26110=11 ~ 26350=200)
- **Committed in:** `d4a7563`

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, 이 plan 의 검증 도구 자체의 정확성 문제)
**Impact on plan:** `seed-complexes.ts`의 시딩 로직 자체와는 무관하며, 측정 도구(41-01 산출물)의 버그였다. 수정 없이는 이 plan의 acceptance criteria(16개 구 전부 1행 이상)를 정확히 판정할 수 없었으므로 blocking으로 처리했다. 41-04 이후 계획들도 동일 도구를 사용하므로 조기에 발견·수정한 것이 후속 plan들의 신뢰도를 높인다.

## Issues Encountered

- `kapt-enrich-once.yml`이 매 회 "failure"로 표시된다 — `kapt-enrich.ts`가 잔여 실패(`failCount > 0`)를 exit 1로 반환하도록 설계돼 있어(재실행 유도 목적) 정상 동작이다. 2회 연속 동일 잔여(11건)로 수렴을 확인해 이 실패가 "재실행하면 해결되는 일시적 오류"가 아니라 KAPT API 자체의 데이터 갭임을 판정했다.
- 전체 `npx vitest run` 실행 시 `seed-region.test.ts`의 알려진 3건 외에 다른 통합 테스트 파일(예: `favorites.test.ts`, `molit-ingest.test.ts`, `complex-matching-3b.test.ts` 등, 실행마다 파일 집합이 달라짐)도 실패가 관측됐다. 이 두 스크립트(`seed-complexes.ts`, `busan-status.ts`)는 `src/` 어디에서도 import되지 않음을 확인했고(`grep -rl`), 실행마다 실패 파일 집합이 바뀌는 양상은 로컬 Supabase(127.0.0.1:54321) 상태 의존 통합 테스트의 환경적 플레이키니스로 판단된다 — 이 plan의 파일 변경과는 무관. `seed-region.test.ts`만 단독 재실행해 정확히 3건(환경_facts가 명시한 것과 동일 이름)만 실패함을 확인했다.

## User Setup Required

None - 외부 서비스 설정 불필요. `gh workflow run` dispatch는 기존 GitHub Actions secrets(`KAPT_API_KEY` 등)를 그대로 사용했다.

## Rollback

- `scripts/seed-complexes.ts`/`scripts/busan-status.ts` 변경은 순수 추가 기능(옵션 인자, 페이지네이션)이라 기존 무인자 호출 동작을 보존한다 — 되돌리려면 해당 커밋을 revert
- 부산 `complexes` 1,467건은 K-apt API 원본 데이터를 그대로 반영한 것이며, 삭제하려면 `DELETE FROM complexes WHERE sgg_code LIKE '26%'`(단, 41-04 이후 좌표·거래 연결이 쌓이면 연쇄 영향 검토 필요)

## Next Phase Readiness

- BUSAN-04 전반부(K-apt 시딩) 완료 — 부산 16개 구 Golden Record 1,467건, si/built_year 보강 잔여 11건(데이터 갭, Phase 34와 동일)
- `--assert-seed-gate`는 좌표 커버리지 미달로 여전히 exit 1 — **41-04(카카오 지오코딩) 완료 후 재실행해 통과 확인할 것**. 41-05(MOLIT 백필)는 41-04 없이 진입하면 안 된다(D-03 순서 고정, 41-CONTEXT)
- `busan-status.ts`의 `ingest_runs` 조회에 동일한 PostgREST 1,000행 캡이 잠재해 있음 — 41-05가 대량의 `ingest_runs`를 쌓기 전에 동일 페이지네이션 패턴 적용 필요(`.planning/phases/41-busan-recollect/deferred-items.md` 참조)
- 경남 22개 지역 무회귀 실증 완료 — 후속 plan(41-04~09)이 부산을 다루는 동안 경남 데이터를 건드리지 않는 패턴(`--sgg` 지역 한정)의 선례로 참고 가능

---
*Phase: 41-busan-recollect*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: scripts/seed-complexes.ts
- FOUND: scripts/busan-status.ts
- FOUND: .planning/phases/41-busan-recollect/41-03-SUMMARY.md
- FOUND: .planning/phases/41-busan-recollect/deferred-items.md
- FOUND commit: 746bc3b (Task 1)
- FOUND commit: d4a7563 (busan-status.ts fix)
