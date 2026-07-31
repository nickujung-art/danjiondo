# Phase 39 / Plan 00 — SUMMARY

**Phase:** 39-onconflict-constraint-fix
**Plan:** 00 (Wave 0)
**Requirements:** F-01, F-03
**Status:** ⚠️ **부분 완료 — Task 3에서 중단 (blocking 체크포인트 + 동시 실행 오염)**
**Date:** 2026-07-31

---

## 요약

- **Task 1 (F-01)** — ✅ 완료. `facility_kapt` onConflict 정정이 PostgREST 프로브·raw EXPLAIN
  **양쪽에서 실측 증명**됐고, 구값이 실패함을 같은 실행에서 대조로 남겼다. 프로덕션 데이터 무변경.
- **Task 2 (F-03)** — ✅ 코드·테스트 완료 / ⚠️ **회귀 판정 무효**.
  헬퍼·단위테스트·라우트 배선·lint 전부 통과했으나, **`git stash` 베이스라인 실측이
  동시 실행 중인 다른 에이전트 때문에 무효가 됐다** (아래 §블로커).
- **Task 3** — 🔴 **미실행.** `checkpoint:human-verify` + `gate="blocking"` 이고, 추가로
  아래 블로커가 겹쳐 사용자 판단이 필요하다. 프로덕션 K-apt 1건 쓰기를 수행하지 않았다.
- **`git push` 실행 0건.** 배포 없음.

---

## 🔴 블로커 — 같은 체크아웃에서 다른 에이전트가 동시 작업 중

이 plan을 실행하는 동안 **같은 작업 디렉토리(`C:\Users\jung\coding\bds`, main 브랜치)에서
다른 프로세스가 커밋 3건을 만들었다.** 그 커밋들이 **내가 작성 중이던 미커밋 파일을 그대로
쓸어담았다.**

| 커밋 | 시각 | 내용 | 내 파일 포함 여부 |
|---|---|---|---|
| `f29d012` | 16:35:24 | `fix(cron): K-apt upsert 제약 불일치 수정 + 학교알리미 정기 수집 신설` | 세션 시작 시 이미 워킹트리에 있던 `daily/route.ts` F-01 수정 + `src/__tests__/facility-kapt-upsert.test.ts` + **마이그레이션 1건** + GitHub 워크플로 |
| `3d99660` | 16:39:55 | `fix(cron): new_listings MOLIT 적재를 부분 인덱스에 맞게 조회 후 분기로 교체 (Phase 39 F-03)` | 🔴 **내가 방금 만든 `new-listings-molit.ts`(87줄)·`new-listings-molit.test.ts`(150줄)·`verify-onconflict-probe.ts`(168줄)·라우트 배선 전부** |
| `72f9564` | 16:43:35 | `fix(favorites): upsert 제약 불일치 + site_id 누락 동시 수정 (Phase 39 F-02)` | F-02 — **이 plan(Wave 0)의 범위가 아니다.** 39-01 담당 |

### 결과 1 — 회귀 베이스라인이 무효다

Task 2 (4)의 절차를 지시대로 실행했고 `git stash push -u -- src/ scripts/` 직후
`git status --porcelain src/ scripts/`가 **빈 출력**이었다. 그러나 **그 빈 출력은 신규 파일이
stash됐다는 증거가 아니었다** — 그 시점에 다른 에이전트가 이미 내 파일을 커밋해버려서
워킹트리가 깨끗했던 것이다. 실제로 stash에 담긴 것은 내 파일이 아니라
**다른 에이전트가 편집 중이던 `src/lib/auth/favorite-actions.ts` 1개뿐**이었다.

```
$ git stash show --include-untracked --name-only stash@{0}
src/lib/auth/favorite-actions.ts        ← 내 파일이 아니다
```

즉 **(B) 실행은 내 변경이 그대로 있는 상태에서 돌았다.** 베이스라인이 아니다.

### 결과 2 — 총계 비교가 무의미함이 오히려 실증됐다

(A)와 (B)는 **코드가 동일한 상태**에서 돌았는데도 결과가 달랐다:

| 실행 | 의도 | Test Files | Tests | 실패 테스트 수 |
|---|---|---|---|---|
| (A) 변경 포함 | 변경 포함 | 6 failed / 96 passed (102) | **17 failed** / 637 passed (654) | 17 |
| (B) "베이스라인" | 실제로는 **변경 포함 (무효)** | 7 failed / 95 passed (102) | **18 failed** / 636 passed (654) | 18 |

**실패 테스트 이름 집합 비교** (ANSI 제거 후 `FAIL` 행 정렬 비교):

- (B)에만 있고 (A)에 없음 — **1건**:
  `src/__tests__/kakao-channel.test.ts > kakao-channel sendAlimtalk > deliver.ts에 kakao 분기 추가: deliverKakaoChannelNotifications 함수 존재`
- (A)에만 있고 (B)에 없음 — **0건**

동일 코드에서 실패가 1건 늘었으므로 이 1건은 **회귀가 아니라 flaky**다. 이것이
`error-notes.md` #001이 말한 "총계 비교는 무의미하다"의 재확인이다 — 다만 이번엔
stash 자체가 무효였으므로 **회귀 여부를 이 plan의 방법으로는 판정하지 못했다.**

### 결과 3 — 계획 대비 사실관계 차이

| 항목 | 계획이 말한 값 | 실측 |
|---|---|---|
| 테스트 베이스라인 | 35 failed / 497 passed / 66 skipped (598) | **17~18 failed / 636~637 passed / 0 skipped (654)** |
| `daily/route.ts:355` 상태 | `onConflict: 'complex_id'` (미수정) | 세션 시작 시점에 **이미 수정된 채 미커밋 상태**로 존재 |
| Wave 0 마이그레이션 | **0건** | `f29d012`가 `20260731073356_school_alimi_cadence_annual.sql`을 **커밋·운영 적용 완료** (다른 에이전트, 범위 밖) |

`TEST_SUPABASE_SKEY`가 `.env.local`에 없다 → `describe.skipIf(!SKEY)` 통합 테스트가
"skip"이 아니라 **placeholder 키로 실행되어 실패**하는 것으로 보인다. 계획서의
`66 skipped`는 이 환경에서 재현되지 않는다.

### 결과 4 — 남아 있는 stash 1건 (사용자 확인 필요)

내가 만든 `stash@{0}` (`gsd-39-00-baseline`)에는 **다른 에이전트의 `favorite-actions.ts`
작업 스냅샷**이 들어 있다. 내용을 확인한 결과 `72f9564`가 커밋한 버전과 **주석 한 단어만
다른 구버전**이라 실질 손실은 없다. 그러나 남의 작업물이므로 **pop도 drop도 하지 않고
그대로 두었다.** 처리는 사용자 판단.

```
stash@{0}: On main: gsd-39-00-baseline          ← 내가 만듦, 남의 파일 1개 들어 있음
stash@{1}: WIP on main: 3a07dcd fix(security)…  ← 세션 시작 전부터 있던 것
```

---

## Task 1 (F-01) — 실측 결과

### 프로브 결과표 (`scripts/verify-onconflict-probe.ts`)

```
$ npx tsx --env-file=.env.local scripts/verify-onconflict-probe.ts --only=facility_kapt
🔗 연결 대상: https://auoravdadyzvuoxunogh.supabase.co
🎯 프로브 대상: 2건 (--only=facility_kapt)

✅ [1] facility_kapt (complex_id,data_month) — 기대: OK / 실측: OK(23503)
      ↳ insert or update on table "facility_kapt" violates foreign key constraint
        "facility_kapt_complex_id_fkey"
✅ [2] facility_kapt (complex_id) — 기대: BROKEN / 실측: BROKEN(42P10)
      ↳ there is no unique or exclusion constraint matching the ON CONFLICT specification

📊 결과: 2/2 PASS
```

| # | 대상 (onConflict) | 기대 | 실측 | 코드 | 판정 |
|---|---|---|---|---|---|
| 1 | `facility_kapt (complex_id,data_month)` | OK | OK | `23503` | ✅ |
| 2 | `facility_kapt (complex_id)` | BROKEN | BROKEN | `42P10` | ✅ |

**이 두 줄의 대조가 F-01의 증거다.** exit 0.

### raw EXPLAIN 2회 (교차 확인)

**(1) 수정값 — 성공 플랜.** 중재 인덱스 이름이 그대로 찍혔다:

```
$ npx supabase db query --linked "explain insert into public.facility_kapt
  (complex_id, kapt_code, data_month) values
  ('00000000-0000-0000-0000-000000000000','ZZ','1900-01-01')
  on conflict (complex_id, data_month) do nothing"

Insert on facility_kapt  (cost=0.00..0.02 rows=0 width=0)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: facility_kapt_complex_id_data_month_key
  ->  Result  (cost=0.00..0.02 rows=1 width=196)
```

**(2) 구값 — 42P10.**

```
$ … on conflict (complex_id) do nothing"
ERROR:  42P10: there is no unique or exclusion constraint matching
        the ON CONFLICT specification
```

### 데이터 무변경 증거

- 프로브 실행 중 "에러 없음" 케이스 **0건** (2건 모두 에러 → 문장 전체 롤백)
- 사후 확인:

```
$ npx supabase db query --linked "select count(*) as probe_rows from public.facility_kapt
  where kapt_code in ('ZZ-PROBE','ZZ') or data_month = '1900-01-01'"
probe_rows: 0
```

### Task 1 acceptance 대조

| 기준 | 결과 |
|---|---|
| `grep -c "onConflict: 'complex_id,data_month'"` == 1 | ✅ 1 |
| `grep -c "onConflict: 'complex_id' }"` == 0 | ✅ 0 |
| 프로브 스크립트에 `42P10`·`23503`·`randomUUID` 포함 | ✅ 4 / 4 / 6회 |
| 프로브 OK(23503) vs BROKEN(42P10) 대조 기록 | ✅ |
| "에러 없음" 0건 | ✅ |
| raw EXPLAIN 2회 확보 | ✅ |
| `npx tsc --noEmit` exit 0 | ✅ |
| `git status --porcelain supabase/` 빈 출력 | ⚠️ `M supabase/.temp/cli-latest` **1건** — 세션 시작 전부터 있던 CLI 버전 캐시이며 마이그레이션이 아니다. `supabase/migrations/`에 **내가 추가한 파일 0건** |

---

## Task 2 (F-03) — 실측 결과

### TDD 순서

1. **RED** — `new-listings-molit.test.ts` 먼저 작성 → 실행 시
   `Failed to resolve import "./new-listings-molit"` 로 수집 실패 (exit 1) 확인
2. **GREEN** — `new-listings-molit.ts` 구현 → **5 passed / 0 skipped**, exit 0

```
$ npx vitest run src/lib/data/new-listings-molit.test.ts
 ✓ src/lib/data/new-listings-molit.test.ts (5 tests) 13ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### 파일

| 경로 | 역할 |
|---|---|
| `src/lib/data/new-listings-molit.ts` | `upsertMolitListing(supabase, input)` — select → update\|insert 분기, 모든 단계 에러 반환 |
| `src/lib/data/new-listings-molit.test.ts` | 전용 목 5케이스 (기존 있음/없음/select·insert·update 에러) |
| `src/app/api/cron/daily/route.ts` | 119~136행 → 헬퍼 호출 + `errors.push` 배선, import 1줄 추가 |

### Task 2 acceptance 대조

| 기준 | 결과 |
|---|---|
| `upsertMolitListing` export | ✅ |
| 헬퍼에 `.upsert(` 0건 | ✅ 0 |
| 헬퍼에 `.is('pblanc_no', null)` 존재 | ✅ 1 |
| 단위테스트 exit 0, 5케이스 전부 실행, skip 0 | ✅ 5 passed / 0 skipped |
| `expect(...upsert).not.toHaveBeenCalled()` 포함 | ✅ 5회 (모든 케이스) |
| `src/__tests__/helpers` **import** 안 함 | ✅ import 0건 (문자열은 "쓰지 않는 이유" 주석에만 등장) |
| `onConflict: 'name,region'` 사라짐 | ✅ 0 |
| `onConflict: 'pblanc_no'` 2회 유지 | ✅ 2 (무접촉) |
| `onConflict: 'listing_id,deal_date,area,floor'` 1회 유지 | ✅ 1 (무접촉) |
| `npm run lint` exit 0 | ✅ `✔ No ESLint warnings or errors` + tsc 통과 |
| `git stash` 베이스라인 4숫자 + 실패 이름 집합 비교 | 🔴 **무효** — §블로커 결과 1 |

### F-06 재량 결정 — 23505 재조회 방어를 **넣지 않았다**

근거 (헬퍼 파일 상단 주석에도 동일하게 기록):

1. 이 경로는 Vercel Cron `0 19 * * *` (04:00 KST) **1일 1회 단독 실행**이라 경합 소스가 없다.
2. insert 직전에 **같은 술어**(`name`·`region`·`pblanc_no IS NULL`)로 조회한다.
3. 검증되지 않는 방어 분기를 늘리는 것은 프로젝트 YAGNI 규칙에 어긋난다.
4. 이 결함의 본질적 해결은 방어가 아니라 **에러를 드러내는 것**이다 —
   기존 코드가 `.select('id').single()`의 `data`만 보고 `error`를 확인조차 하지 않아
   16일간 안 보였다. 이제 23505가 나면 `errors[]`에 뜬다.

### 부분 인덱스 유지 (Scope Fence 4)

`new_listings_molit_name_region_idx (name, region) WHERE pblanc_no IS NULL`을
**비부분으로 바꾸지 않았다.** 마이그레이션 0건. 헬퍼가 `.is('pblanc_no', null)`로
인덱스 술어와 동일한 조회 범위를 쓰므로 청약 공고 94행을 건드리지 않는다.

---

## Task 3 — 🔴 미실행

`type="checkpoint:human-verify"` / `gate="blocking"` 이고 plan이 `autonomous: false`다.
추가로 §블로커가 겹쳐 **1~6단계 중 어느 것도 실행하지 않았다.**

- K-apt 실동작 1건 실측 (프로덕션 쓰기) — **미실행**
- 커밋 — **미실행** (내 코드는 다른 에이전트의 `3d99660`·`f29d012`에 이미 들어가 있다)
- `git push` — **실행 0건**

---

## Success Criteria 대조

| # | 기준 | 판정 |
|---|---|---|
| 1 | `facility_kapt` upsert가 `(complex_id, data_month)`를 추론 — 프로브 + raw EXPLAIN 이중 확인 | ✅ 실측 완료 |
| 2 | K-apt 경로가 실제로 당월 행을 쓰고 재실행해도 중복되지 않음 (실측 1건) | 🔴 **미실행** (Task 3) |
| 3 | MOLIT 경로가 upsert 없이 명시적 조회→update\|insert | ✅ |
| 4 | MOLIT 경로의 모든 DB 에러가 `errors[]`에 반영 | ✅ |
| 5 | 부분 인덱스·✅ OK 판정 upsert 지점 무접촉 | ✅ grep 대조 완료 |
| 6 | 테스트 회귀 0건 (`git stash push -u` 실측 대비), `npm run lint` 통과 | ⚠️ lint ✅ / **회귀 판정 무효** |
| 7 | 일배치 최종 확인이 **배포 조건부 미확인 항목**으로 명시 | ✅ 아래 |

### Success Criteria 5 (39-CONTEXT 기준) — **미확인**

**배포 상태: (b) 아직 배포되지 않음.**

`git push`를 실행하지 않았고 이 Phase의 어떤 plan에도 Wave 0 시점의 push는 없다.
04:00 KST 일배치는 **커밋이 아니라 Vercel에 배포된 빌드**를 실행하므로,
`main`에 push되어 프로덕션 배포가 일어나기 전까지 배치는 여전히 **구 코드**를 실행한다.

> 🔴 **오독 방지**: 배포 전까지 04:00 KST 배치는 구 코드(`onConflict: 'complex_id'`)를
> 실행하므로 `data_sources.kapt.last_status`는 계속 실패 상태로 남는 것이 **정상**이다.
> **다음 날 아침 결과가 실패로 나와도 F-01이 틀린 게 아니다.**
> 배포는 39-01 Task 4(사용자 승인 체크포인트)에서 요청한다.

재확인 쿼리 2개 (배포 반영된 배치 이후 실행할 것):

```
npx supabase db query --linked "select source, last_status, last_run_at, consecutive_failures, error_message from public.data_sources where source in ('kapt','daily-batch')"
npx supabase db query --linked "select count(*) from public.facility_kapt where data_month = date_trunc('month', now())::date"
```

기대(배포 반영된 배치 이후): `kapt.last_status = 'success'`, 당월 행 수 증가.

---

## 마이그레이션 원장

`npx supabase migration list --linked` — 전 항목 `local == remote`, **drift 0건**.
가장 최근 `20260731073356` (다른 에이전트가 `f29d012`에서 추가·적용, 이 plan 범위 밖).

---

## 다음에 필요한 결정 (사용자)

1. **동시 실행 정리** — 같은 체크아웃에서 다른 에이전트가 Phase 39를 병렬 실행 중이다.
   F-02(39-01 범위)까지 이미 커밋됐다. 어느 실행을 정본으로 삼을지 정해야 한다.
2. **회귀 판정 재실행** — 유효한 베이스라인을 얻으려면 다른 에이전트가 멈춘 뒤
   Phase 39 이전 커밋(`dde4537`) 대비로 다시 측정해야 한다.
3. **`stash@{0}` 처리** — 남의 작업 스냅샷. pop/drop 판단 필요.
4. **Task 3 승인 여부** — 프로덕션 K-apt 1건 쓰기 + 커밋.
