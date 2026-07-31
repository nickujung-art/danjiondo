---
phase: 37-migration-drift
plan: "01"
subsystem: database
tags: [supabase, migration-drift, ledger-repair, timestamp-collision]

requires: [37-00]
provides:
  - "원장 remote 전용 13건 제거 — migration list remote-only 0건"
  - "로컬 타임스탬프 중복 0건 — 의존 순서 보존 리네이밍 3건"
  - "npm run db:push 정상 작동 상태 회복 (db push --dry-run upToDate)"
  - "제거한 13건의 SQL 원문 백업 (.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql)"
affects: []

tech-stack:
  added: []
  patterns:
    - "supabase db query --linked -f <file> (Management API, 읽기 전용) — 긴 SQL은 -f 로 넘긴다. Windows 셸에서 인라인 SQL은 IN 리스트가 깨진다"
    - "migration repair --status reverted 전에 statements[1]을 .planning/ 하위로 백업 (supabase/migrations/ 밖 — 적용 대상이 되면 안 됨)"

key-files:
  created:
    - .planning/phases/37-migration-drift/ledger-backup-13-reverted.sql
  modified:
    - supabase/migrations/20260618000003_fix_avg_sale_per_pyeong_formula.sql
    - supabase/migrations/20260618000004_fix_prediction_model_priority.sql
    - supabase/migrations/20260619000004_phase28_subject_v2.sql

key-decisions:
  - "reverted 13건 실행 전 statements[1] 원문을 .planning/ 하위 SQL 파일로 백업 후 별도 커밋(4821f52). repair는 원장 행만 복구할 뿐 statements 원문은 복원하지 않으므로, 특히 로컬 사본이 없는 20260618075929는 이 백업이 유일한 기록"
  - "각 중복 쌍에서 '다른 마이그레이션이 재생성·참조하는 쪽'을 원자리에 남기고 '후속 재정의 0건인 쪽'을 뒤로 옮겼다 — grep으로 저장소 전체 참조를 실측해 판정"
  - "새 슬롯은 20260618000003·20260618000004·20260619000004. 파일·원장 양쪽에서 미사용 확인 후 사용"

patterns-established: []

requirements-completed: [DRIFT-03, DRIFT-04, DRIFT-05]

duration: ~35min
completed: 2026-07-30
---

# Phase 37-01: 원장 정리 + 타임스탬프 중복 리네이밍 (Wave 1) Summary

**원장에서 remote 전용 13건을 제거하고, 로컬 타임스탬프 중복 3쌍을 의존 순서를 보존하며 리네이밍한 뒤 새 version을 원장에 기록해 `migration list --linked` 완전 매칭(0/0) + `db push --dry-run` 통과 상태를 회복했다. DB 스키마 변경 0건 — baseline 11개 항목이 착수 전과 11/11 동일하다.**

커밋 2건: `4821f52`(원장 백업) → `dac50c4`(리네이밍 + 원장 정리).

## 🔴 원장 백업 — 제거한 13건의 SQL 원문은 여기에 있다

**`.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql`** (30,783 bytes, 커밋 `4821f52`)

`repair --status reverted`는 원장 행을 삭제하고, 되돌릴 때 `repair --status applied`로 행은 복구되지만 **`statements`에 저장된 SQL 원문은 영구 소실**된다. 그래서 Task 3 실행 **전에** 13건의 `statements[1]`을 추출해 백업했다.

- 13건 전부 `array_length(statements,1) = 1` — 이어붙일 필요 없음. 본문 합계 **24,185자**
- 각 항목에 `version` / `name` / **대응 로컬 파일 경로**를 주석 헤더로 붙여 사람이 읽고 복구할 수 있게 함
- **`supabase/migrations/` 밖**에 둔다 — 적용 대상이 되면 안 되므로 `.planning/` 하위에 저장
- 12건은 대응 로컬 마이그레이션 파일에 사본이 있고, **`20260618075929`(phase28_route_rpc)만 이 백업이 유일한 사본**이다

## DRIFT-03 — 원장 remote 전용 13건 `reverted` (원장 행수 151 → 138)

실행한 명령 (1회, 승인받은 13개 version과 동일):

```
npx supabase migration repair --status reverted 20260618051341 20260618073750 20260618075929 \
  20260619043107 20260619062830 20260619072547 20260619075829 20260624045555 20260624045621 \
  20260624045635 20260707051809 20260709061130 20260715030221
→ Repaired migration history: [...] => reverted
```

실행 직후 검증:

| 검증 | 기준 | 실측 | 판정 |
|---|---|---|---|
| 원장 행 수 | 151 − 13 = 138 | **138** | ✅ |
| 13개 version 잔존 | 0행 | **0** | ✅ |
| 복원 5건 잔존 (`20260618085750`·`085906`·`093403`·`20260625063824`·`20260728074553`) | 5행 | **5** | ✅ |
| `migration list --linked` remote-only | 0건 | **0** | ✅ |

`git status --porcelain`는 Task 1 시점과 동일 (원장은 git 대상이 아니다). 이 태스크에서 DDL 0건.

## DRIFT-04 — 타임스탬프 중복 3쌍 리네이밍 (`git mv`, 내용 무변경)

`git diff -M --stat`에서 3건 전부 **rename 100%**, 내용 변경 라인 **0**.

| 쌍 | 원자리에 남긴 파일 (이유) | 옮긴 파일 | 구 → 신 version |
|---|---|---|---|
| `20260618000001` | `_complex_area_types.sql` — 선행 조건 | `_fix_avg_sale_per_pyeong_formula.sql` | `20260618000001` → **`20260618000003`** |
| `20260618000002` | `_area_type_chart_rpc.sql` — 순서 제약 있음 | `_fix_prediction_model_priority.sql` | `20260618000002` → **`20260618000004`** |
| `20260619000002` | `_recommend_hagwon_candidates_rpc.sql` — 이동 금지(D-05) | `_phase28_subject_v2.sql` | `20260619000002` → **`20260619000004`** |

### 각 쌍의 판단 근거 (grep 실측)

**쌍 1 — `20260618000001`**

`grep -rl "complex_area_types" supabase/migrations/` → **8개 파일**이 참조:
`20260618000002_area_type_chart_rpc.sql`, `20260618085906_rls_...`, `20260619000000_assign_area_types.sql`,
`20260624000002_area_type_trigger.sql`, `20260624000003_rpc_add_exclusive_area.sql`,
`20260707000000_area_type_ambiguity_guard.sql`, `20260715000001_realtrade_story_site_scoping.sql`
(+ `area_type_id` 로는 `20260723081433_fix_favorites_area_type_unique.sql`도 추가).
→ `_complex_area_types.sql`은 **후속 다수의 선행 조건**이므로 원자리 유지.

`grep -rl "refresh_complex_price_stats"` → `20260516000001_phase11_map_columns.sql`,
`20260521000001_badge_is_new_record.sql`, 그리고 이 파일. **둘 다 이 파일보다 앞선 version**이고
이 파일이 최종 정의 — **후속 재정의·참조 0건**이라 뒤로 옮겨도 안전.

이동 구간(`20260618000001` 초과 ~ `20260618000003` 이하)의 파일
= `20260618000002_area_type_chart_rpc.sql`, `20260618000002_fix_prediction_model_priority.sql`.
두 파일에서 `refresh_complex_price_stats` grep → **참조 0건** (exit 1).

**쌍 2 — `20260618000002`**

`grep -rl "complex_transactions_for_chart"` → `20260514000002_phase9_transactions_for_chart.sql`,
`20260618000002_area_type_chart_rpc.sql`, **`20260624000003_rpc_add_exclusive_area.sql`**.
후자가 같은 함수를 다시 재생성하므로 chart rpc 파일은 `20260624000003`보다 **앞이어야 한다**
(뒤로 가면 구버전이 신버전을 덮는다). → 원자리 유지.

`grep -rl "invest_prediction_ranking"` / `"invest_regional_prediction_summary"` → 최대 version이
`20260618000002_fix_prediction_model_priority.sql` 자신. **후속 재정의 0건**이라 뒤로 옮겨도
`db reset` 최종 상태가 바뀌지 않는다. 선행 의존인 `complex_price_predictions`는
`20260530000001`(훨씬 앞) 생성. → 이 파일을 옮긴다.

이동 구간(`20260618000002` 초과 ~ `20260618000004` 이하)의 파일
= 방금 옮긴 `20260618000003_fix_avg_sale_per_pyeong_formula.sql` 하나.
`invest_prediction_ranking|invest_regional_prediction_summary|complex_price_predictions` grep
→ **참조 0건** (exit 1).

**쌍 3 — `20260619000002`** (D-05 확정 사항 + 재검증)

`_recommend_hagwon_candidates_rpc.sql`은 `20260619000003_recommend_hagwon_candidates_v2.sql`이
`DROP FUNCTION ... recommend_hagwon_candidates(...)` 후 재생성하므로 **뒤로 갈 수 없다**
(Scope Fence 5번). → 짝인 `_phase28_subject_v2.sql`을 옮긴다.

`_phase28_subject_v2.sql`의 선행 의존은 `hagwon_db`·`user_child_profiles`
(둘 다 `20260619000001_phase28_hagwon_system.sql`) 뿐이고, 새 슬롯 `20260619000004`는 그보다 뒤라 성립.

이동 구간(`20260619000002` 초과 ~ `20260619000004` 이하)의 파일
= `20260619000003_recommend_hagwon_candidates_v2.sql` 하나.
`fee_tier_pref|recommend_hagwons|user_child_profiles|subject_category_check` grep → **참조 0건** (exit 1).
v2는 `h.subject_category`를 SELECT 하지만 그 **컬럼 자체는 `20260619000001`이 생성**하고,
`_phase28_subject_v2.sql`은 CHECK 제약 교체 + 값 NULL 초기화만 하므로 함수 정의와 순서 무관.

### 새 version 원장 기록 (`repair --status applied`)

```
npx supabase migration repair --status applied 20260618000003 20260618000004 20260619000004
→ Repaired migration history: [...] => applied
```

원장 행수 138 → **141**. 세 슬롯은 실행 전 파일·원장 양쪽에서 미사용을 확인했다
(`ls supabase/migrations/` + `select version from schema_migrations where version in (...)` → 0행).

**중복 3쌍 외 local-only 항목은 0건**이었으므로 추가 `applied` 대상은 없다 (Task 1 (E) 분류 결과:
local-only 3건 = `20260618000001`·`20260618000002`·`20260619000002`, 전부 (i) 중복 쌍 기인).

## DRIFT-05 — 회복 검증 결과

```
$ ls -1 supabase/migrations/ | cut -c1-14 | sort | uniq -d
(빈 출력 — 타임스탬프 중복 0건)

$ npx supabase migration list --linked
total pairs: 141
local-only:  0  []
remote-only: 0  []

$ npx supabase db push --dry-run
DRY RUN: migrations will *not* be pushed to the database.
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}

$ npm run lint
✔ No ESLint warnings or errors   (종료 코드 0, tsc 통과)

$ git status --porcelain src/
(빈 출력)

$ git diff --stat 20260430000009_rls.sql + 복원 5건
(빈 출력 — 무변경)
```

`db push`는 **`--dry-run`으로만** 실행했다 (Scope Fence 9번). DDL 실행 0건 — `execute_sql` 계열은
`supabase db query --linked`의 `select` 읽기 조회만 사용했다.

## Baseline 11개 항목 전/후 대조 — 11/11 동일 (스키마 무변경 증명)

| # | 항목 | 착수 시 (37-00) | Wave 1 종료 시 | 일치 |
|---|---|---|---|---|
| 1 | `site_admin_roles` 행수 / 정책 수 | 1 / 1 | **1 / 1** | ✅ |
| 2 | `get_complex_review_avg` 함수 존재 | 1 | **1** | ✅ |
| 3 | `regional_income` RLS / 정책 수 | `true` / 1 | **`true` / 1** | ✅ |
| 4 | `cardnews-payloads` 스토리지 정책 수 | 3 | **3** | ✅ |
| 5 | `check_gps_proximity` proconfig | `["search_path=\"\""]` | **`{"search_path=\"\""}`** | ✅ |
| 6 | `recommend_hagwon_candidates` 개수 / max args | 1 / 7 | **1 / 7** | ✅ |
| 7 | `ad_events` 정책 roles / with_check | `{authenticated}` / `(auth.uid() IS NOT NULL)` | **동일** | ✅ |
| 8 | `complexes` 행수 | 4285 | **4285** | ✅ |
| 9 | `hagwon_db` 행수 | 4601 | **4601** | ✅ |
| 10 | `complex_area_types` 행수 | 3472 | **3472** | ✅ |
| 11 | 창부레터 테이블 5개 RLS / 정책 합계 / 행수 | 전부 `true` / 7 / 각 0행 | **전부 `true` / 7 (contents 2, content_complexes 2, content_votes 1, content_bookmarks 1, subscribers 1) / 각 0행** | ✅ |

불일치 **0건**. Phase 37은 스키마를 한 줄도 바꾸지 않았다.

## Phase 37 종료 후 상태

- **`npm run db:push`가 정상 작동한다.** 원장과 로컬 파일이 완전 매칭(0/0)이고 `--dry-run`이
  `upToDate: true`를 반환한다. 이제 새 마이그레이션을 파일로 작성해 push하는 정상 경로가 복구됐다
- **`supabase db reset`이 프로덕션을 재현한다** — 단, 아래 O-3 하나를 먼저 해결해야 한다
- 6/18 이후 MCP `apply_migration`·대시보드 SQL 에디터로 적용해 온 관행이 drift의 원인이었다.
  앞으로는 파일 → `db push` 경로를 사용해야 재발하지 않는다

## 🔴 별도 Phase 이월

### O-1: `recommend_hagwons` 오버로드 2개 공존

```
recommend_hagwons(p_lat, p_lng, p_age_group, p_subjects text[], p_fee_tier  text,   p_limit)
recommend_hagwons(p_lat, p_lng, p_age_group, p_subjects text[], p_fee_tiers text[], p_limit)
```

`20260619000004_phase28_subject_v2.sql`이 `fee_tier`를 배열화할 때 `CREATE OR REPLACE`만 하고
구버전을 `DROP`하지 않아 두 시그니처가 공존한다. 인자를 명시하지 않고 호출하면 **모호성 에러**가 날 수 있다.

**이 Phase에서 고치지 않은 이유**: 함수 DROP은 스키마 변경이고, 앱 코드가 어느 시그니처를 호출하는지 확인이 선행돼야 한다.
**선행 작업**: `src/lib/**/hagwon*` 호출 시그니처 확인 → 미사용 오버로드 DROP 마이그레이션 작성 → 프로덕션·로컬 동시 적용.

### O-2: `TO` 절 누락 정책 다수 — 하드닝 후보

대상: `regional_income`, `complex_area_types`, `site_admin_roles`,
`ad_campaigns`(realtrade-story 정책 3개), `presale_discoveries`, `new_listings`,
`cardnews-payloads`(3개). 전부 `TO` 절이 없어 기본값 `TO public`으로 생성됐다.
대부분 `auth.uid()` / `auth.role()` 조건이 `anon`을 실질 차단하고 있어 즉각적 위험은 낮으나,
의도가 코드에 드러나지 않는다.

**이 Phase에서 고치지 않은 이유**: D-03(충실 재현). 복원 중 개선하면 로컬≠프로덕션이 되어 이 Phase의 목적이 무너진다.
**처리 방식**: 프로덕션과 로컬을 **함께** 바꾸는 별도 Phase에서.

### O-3 (신규 발견): `hagwon_db.blog_tags` / `blog_snippet` 컬럼 추가 DDL이 로컬에 없다

`20260619000003_recommend_hagwon_candidates_v2.sql`이 `h.blog_tags` / `h.blog_snippet`을 SELECT 하는데,
저장소 전체 grep 결과 **그 컬럼을 `ADD COLUMN` 하는 마이그레이션이 로컬에 존재하지 않는다**
(`grep -rl "blog_tags" supabase/migrations/` → v2 파일 1건뿐. `naver_blog_count`는
`20260619000001_phase28_hagwon_system.sql`에 있음).

원인: 이 DDL은 원장 전용이던 `20260619043107 add_hagwon_blog_fields`에만 있었다. CONTEXT D-04 표는
이 remote version을 `20260619000003_..._v2.sql (blog_snippet 포함)`에 대응시켰으나, 실제 파일에는
`ALTER TABLE` 문이 없다 — **D-04 표의 대응 관계가 부정확했다.**

**영향**: `db push --dry-run`은 파일을 실행하지 않으므로 통과하지만, **`supabase db reset`은
`20260619000003`에서 컬럼 없음 에러로 실패할 가능성이 높다.** 프로덕션 스키마는 정상(컬럼 존재)이므로
운영 영향은 없다.

**다행히 해당 DDL 원문은 백업에 보존돼 있다** —
`.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql`의 `version: 20260619043107` 블록(305자).

**처리 방식**: 별도 Phase에서 백업의 해당 블록을 `20260619000003` **앞** 슬롯
(예: `20260619000002`, 지금 비어 있음)의 마이그레이션 파일로 복원하고 `repair --status applied` 기록.
스키마 변경 없이 파일 추가 + 원장 기록만으로 해결된다. **`db reset` 실측 검증이 이 Phase 범위 밖이었으므로
후속 Phase에서 반드시 `db reset`을 로컬에서 한 번 돌려 확인할 것.**

## `docs/FEATURES.json` 갱신

**해당 없음.** 이 Phase는 마이그레이션 원장·파일명 위생 작업으로, 사용자 대상 기능 추가·변경이 0건이다.
`FEATURES.json`의 어떤 feature 상태도 바뀌지 않는다.

## Deviations from Plan

1. **원장 백업 태스크 추가** (사용자 지시). plan Task 2 승인 시 오케스트레이터가 "13건 원문을 백업한 뒤
   reverted 처리한다"는 사용자 결정을 전달해, Task 3 실행 전에 백업 파일 생성 + 별도 커밋(`4821f52`)을
   수행했다. plan에 없던 산출물 1건(`ledger-backup-13-reverted.sql`)과 커밋 1건이 추가됐다.
2. **조회 도구**: `execute_sql` MCP 대신 `supabase db query --linked -f <file>`(Management API, 읽기 전용)
   사용 — D-07 Claude's Discretion 범위. Windows 셸에서 인라인 SQL의 `IN` 리스트가 깨져
   13행 중 1행만 반환되는 문제가 있어 `-f` 파일 방식으로 전환했다.
3. **O-3 신규 발견**을 이월 항목에 추가했다 (plan에 없던 관찰).

## Self-Check: PASSED

- FOUND: .planning/phases/37-migration-drift/ledger-backup-13-reverted.sql (13개 version 블록)
- FOUND: supabase/migrations/20260618000003_fix_avg_sale_per_pyeong_formula.sql
- FOUND: supabase/migrations/20260618000004_fix_prediction_model_priority.sql
- FOUND: supabase/migrations/20260619000004_phase28_subject_v2.sql
- FOUND: supabase/migrations/20260619000002_recommend_hagwon_candidates_rpc.sql (이동 안 함 — 파일명 그대로)
- FOUND commits: 4821f52 (백업), dac50c4 (리네이밍 + 원장 정리)
- 타임스탬프 중복 0건 / migration list 0-0 / db push --dry-run upToDate / baseline 11-11 / lint 0
