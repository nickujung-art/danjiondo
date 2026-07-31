---
phase: 38-security-reset-fix
plan: 01
subsystem: database
tags: [supabase, postgres, migration, rls, rpc, hagwon]

requires:
  - phase: 38-security-reset-fix (Wave 0 / 38-00)
    provides: "ad_images_service_write RLS 수정 + 원장 0/0 baseline"
provides:
  - "HARD-02: hagwon_db.blog_snippet/blog_tags 컬럼 DDL 로컬 복원 + v2 함수 슬롯 재배치 (커밋 완료, 원장 repair 완료)"
  - "HARD-03: recommend_hagwons 구버전 오버로드 DROP 마이그레이션 작성 (커밋 완료, **프로덕션 미적용**)"
  - "HARD-04: CLAUDE.md RLS TO절 + CONCURRENTLY repair 규약 2건 추가 (커밋 완료)"
  - "PAUSED: supabase db reset 전체 체인 검증 — Phase 38 범위 밖의 사전 결함으로 미완료. 사용자 결정 대기"
affects: [38-security-reset-fix, future phases touching hagwon_db/recommend_hagwons, db-reset CI 자동화]

tech-stack:
  added: []
  patterns:
    - "마이그레이션 슬롯 재배치는 git mv (rename) + migration repair --status applied 쌍으로 처리"
    - "DROP FUNCTION은 인자 타입 전체 명시 — 오버로드 모호성 에러 회피"

key-files:
  created:
    - supabase/migrations/20260619000003_add_hagwon_blog_fields.sql
    - supabase/migrations/20260731000004_drop_recommend_hagwons_legacy_overload.sql
    - .planning/phases/38-security-reset-fix/deferred-items.md
  modified:
    - CLAUDE.md
    - supabase/migrations/20260619000003_recommend_hagwon_candidates_v2.sql (git mv → 20260619000005_recommend_hagwon_candidates_v2.sql)

key-decisions:
  - "Task 3(db reset 실측)이 20260518000002_manual_aliases.sql에서 실패 — Phase 38 범위 밖의 사전 존재 hollow dependency(seed.sql이 complexes를 시딩하지 않는데 manual_aliases가 하드코딩 complex_id 8건을 참조)로 판단, 임의 수정하지 않고 중단·보고"
  - "Task 4(프로덕션 db push)는 미착수 — Task 3의 db reset 전체 체인 검증이 완료되지 않은 상태에서 진행하지 않음. 사용자 결정 필요"
  - "src/types/database.ts 재생성 안 함 — recommend_hagwons 호출부 0건이라 타입 영향 없음(plan 확정 사항 그대로 적용)"

requirements-completed: []

duration: 진행중(일시정지)
completed: 미완료 — 2026-07-31 (Task 1·2만 완료, Task 3 블로킹, Task 4 미착수)
---

# Phase 38 Plan 01: db reset 재현성 복구 · 데드 오버로드 정리 · RLS 규약 Summary — **일시정지 (사용자 결정 필요)**

**HARD-02 슬롯 재배치·HARD-03 DROP 마이그레이션·HARD-04 CLAUDE.md 규약까지는 커밋 완료했으나, 계획의 유일한 HARD-02 합격 기준인 `supabase db reset` 전체 체인 실행이 Phase 38 범위 밖의 사전 결함(hollow dependency)에 막혀 완료하지 못했다. Task 4(프로덕션 DROP 적용)는 착수하지 않았다.**

⚠️ **이 SUMMARY는 계획을 낙관적으로 "통과"로 보고하지 않는다.** Scope Fence 4번 및 Task 3 action의 명시적 지시("실패 원인이 이 Phase 범위 밖의 다른 마이그레이션이라면... 중단하고 사용자에게 보고한다")를 따라, DB reset 실행 결과를 있는 그대로 기록하고 다음 단계 결정을 요청한다.

## Performance

- **Tasks 완료:** 2/4 (Task 1, Task 2 완료 및 커밋 / Task 3 블로킹 / Task 4 미착수)
- **커밋 수:** 4건 (Task 1: 2건 — 파일 누락 정정 포함 / Task 2: 1건 / deferred-items: 미커밋, 이 커밋에 포함 예정)

## Task 1: HARD-02 — v2 슬롯 이동 + add_hagwon_blog_fields 복원 + 원장 repair — ✅ 완료

`_recommend_hagwon_candidates_v2.sql`을 `git mv`로 `20260619000003` → `20260619000005`로 이동(내용 무변경, rename 100%). `20260619000003_add_hagwon_blog_fields.sql`을 신규 생성해 `ledger-backup-13-reverted.sql` 340~351행 원문(`ADD COLUMN IF NOT EXISTS blog_snippet`·`blog_tags` + `COMMENT ON COLUMN` 2줄)을 그대로 복원했다.

**원장 repair 결과:**
```
$ npx supabase migration repair --status applied 20260619000003
Repaired migration history: [20260619000003] => applied

$ npx supabase migration repair --status applied 20260619000005
Repaired migration history: [20260619000005] => applied
```

**repair 후 `migration list --linked`:** local/remote 모든 항목 쌍을 이루며 `20260619000003`·`20260619000005` 모두 로컬/리모트 양쪽에 기록됨 (당시 기준 0/0).

### 커밋
| 커밋 | 내용 |
|---|---|
| `e40c5a1` | v2 파일 슬롯 이동(git mv) — bash pathspec 오타로 신규 파일 누락 |
| `5b8796d` | 누락된 `20260619000003_add_hagwon_blog_fields.sql` 추가 정정 |

## Task 2: HARD-03 DROP 마이그레이션 + HARD-04 CLAUDE.md 규약 2건 — ✅ 완료

**DROP 마이그레이션** (`20260731000004_drop_recommend_hagwons_legacy_overload.sql`):
```sql
DROP FUNCTION IF EXISTS public.recommend_hagwons(
  double precision, double precision, text, text[], text, integer
);
```
- 5번째 인자 `text` (구버전)만 명시, 신버전(`text[]`)은 대상 아님
- cascade 미사용 (`grep -ci cascade` → 0)
- 검증: `grep -v '^--' <file> | grep -c "text\[\], text, integer"` → **1**, `text\[\], text\[\], integer` → **0**

**CLAUDE.md 규약 2건** (`## 아키텍처 규칙` 섹션, RLS 필수 줄 바로 아래 삽입):

```
- **CRITICAL** 신규 RLS 정책은 `TO` 절을 명시한다 (`TO anon, authenticated` · `TO authenticated` 등)
  - 생략 시 `TO public`이 되어 anon까지 포함된다
  - 쓰기 정책(INSERT/UPDATE/DELETE)은 `auth.role() = 'service_role'` · `auth.uid()` · `profiles.role` 검사 중 하나를 반드시 갖는다
  - 단서: 기존 정책의 일괄 수정은 범위 밖 (Phase 38 D-04 — 읽기 정책의 `TO public`은 공개 읽기 의도와 일치, 쓰기 정책은 전수 확인 결과 제한 조건 보유)
- **CRITICAL** `CREATE INDEX CONCURRENTLY`는 `npm run db:push`로 적용 불가하다 (`CONCURRENTLY`는 트랜잭션 블록에서 실행 불가한데 Supabase CLI가 마이그레이션을 트랜잭션으로 감싼다)
  - 별도 경로로 적용한 뒤 `npx supabase migration repair --status applied <version>`을 반드시 실행해 원장에 기록한다
  - 누락하면 마이그레이션 원장 drift가 된다 (선례: `20260728120000`·`20260731000001`)
```

**`git diff --numstat CLAUDE.md`:**
```
7       0       CLAUDE.md
```
7줄 추가, **0줄 삭제** — 재구성 없이 순수 추가만 확인됨 (요구사항: 4~10줄 추가 / 0줄 삭제, 충족).

**lint:** `npm run lint` → `✔ No ESLint warnings or errors`, `tsc --noEmit` exit 0
**`git status --porcelain src/`:** 빈 출력 (앱 코드 무변경)

### 커밋
| 커밋 | 내용 |
|---|---|
| `dcd5b52` | HARD-03 DROP 마이그레이션 + HARD-04 CLAUDE.md 규약 2건 |

## Task 3: HARD-02 합격 기준 — `supabase db reset` 실제 실행 — ⚠️ **블로킹, 미완료**

### Docker/Supabase 스택 기동 — 성공

```
$ docker info
Client: Version 29.4.1 ... (정상)

$ npx supabase start
{"DB_URL":"postgresql://postgres:postgres@127.0.0.1:54322/postgres", ...}
```

### `npm run db:reset` 실행 결과 — **실패, exit 1**

전체 마이그레이션 체인 중 `20260430000001`부터 `20260518000001`까지 (Phase 33 이전, HARD-02/03/04와 무관한 구간) 순차 적용에 성공한 뒤, **`20260518000002_manual_aliases.sql`에서 FK 위반으로 중단**:

```
Applying migration 20260518000002_manual_aliases.sql...
ERROR: insert or update on table "complex_aliases" violates foreign key constraint "complex_aliases_complex_id_fkey" (SQLSTATE 23503)
Key (complex_id)=(4bbc672a-e82c-4c2c-8c27-79638de38c17) is not present in table "complexes".
At statement: 1
-- 수동 매핑 삽입 (국토부 표기명 → DB 정규 단지)
insert into public.complex_aliases (complex_id, source, alias_name, confidence)
values
  ('4bbc672a-e82c-4c2c-8c27-79638de38c17', 'manual_match', '마린애시앙부영', 0.95),
  ...
Try rerunning the command with --debug to troubleshoot the error.
```

**원인 분석 (Phase 38 범위 밖 확인됨):**
- `supabase/seed.sql`은 `regions`·`data_sources`만 시딩하고 `complexes`는 전혀 시딩하지 않는다 (파일 전체 19줄 확인)
- `20260518000002_manual_aliases.sql`(2026-05-18 작성, Phase 33 이전)은 프로덕션에만 존재하는 8개 `complex_id` UUID를 하드코딩해 참조한다
- 완전히 새로운 로컬 리셋에서는 `complexes`가 비어 있어 이 FK가 항상 위반된다 — **HARD-02/03/04의 이번 변경과 무관한 사전 존재 결함**이며, `20260619000003`(add_hagwon_blog_fields)·`20260619000005`(v2)·`20260731000004`(DROP)에 도달하기도 전에 발생했다

**HARD-02 판정: 🔴 미검증.** `supabase db reset`이 전 구간 성공하지 못했다. 실패 지점이 이번 plan의 변경분보다 훨씬 앞선 무관한 마이그레이션이므로, HARD-02 자체(`20260619000003`/`20260619000005` 순서 문제)가 원인인지는 **아직 확인할 수 없었다** — 이 결함을 넘지 못하면 우리 변경분까지 체인이 도달하지 않는다.

**Task 3 action의 명시적 지시("실패 원인이 이 Phase 범위 밖의 다른 마이그레이션이라면(예: 다른 hollow dependency), 임의로 고치지 말고 중단하고 사용자에게 보고한다 — 새 gap이며 범위 확대 확인이 필요하다")에 따라 여기서 중단했다.**

로컬 Supabase 스택은 계속 기동 상태로 남겨뒀다(재시작 시간 절약 목적) — `npx supabase status`로 확인 가능, 필요 시 `npx supabase stop`.

### 재실행/해결 경로 (사용자 결정 필요)

1. **(a) 범위 확대** — `supabase/seed.sql`에 `manual_aliases.sql`이 참조하는 최소 8개 `complexes` row를 추가해 로컬 시딩 커버리지를 확보. Phase 38 Scope Fence 밖이므로 사용자 승인 필요
2. **(b) 별도 phase/이슈로 분리** — 이 결함을 Phase 38에서 다루지 않고 별도 gap으로 기록, HARD-02는 "우리 변경분만 개별 검증"(전체 db reset이 아닌 부분 체인 재현)으로 판정 범위를 좁히는 방안 — plan 재정의 필요
3. **(c) `manual_aliases.sql` 자체를 방어적으로 수정**(`where exists` 가드 추가) — Phase 37의 "충실 재현" 원칙과 충돌 가능성 검토 필요

**세부 내용:** `.planning/phases/38-security-reset-fix/deferred-items.md` 항목 1

### 부가 발견 — 미상 마이그레이션 파일 (Phase 38과 무관, 조치 없음)

`migration list --linked` 재확인 중 `supabase/migrations/20260731000003_fix_increment_view_count_security.sql`이 untracked 상태로 발견됐다. 이 세션에서 생성하지 않았으며 `increment_view_count()` RLS 우회 버그 수정(realtrade-story 언급)으로 Phase 38과 무관하다. 기존 `20260731000003_ad_images_bucket_policies.sql`(Wave 0, 이미 원장 applied)과 **타임스탬프 충돌**이 있다 — 동시 작업 중인 다른 세션/에이전트의 산출물로 추정된다. **건드리지 않았다.** 세부 내용은 `deferred-items.md` 항목 2.

## Task 4: [BLOCKING] `npm run db:push`로 DROP 마이그레이션 프로덕션 적용 — ❌ **미착수**

Task 3의 `db reset` 전체 체인 검증이 완료되지 않은 상태에서 프로덕션 변경(Task 4)을 진행하지 않았다. Task 4의 사전 조건인 "Task 3 db reset 결과" 확인이 미검증 상태이므로, 사용자 결정 없이 임의로 진행하지 않는다.

**`recommend_hagwons` 프로덕션 상태는 Wave 0 이후 변경 없음** — 여전히 오버로드 2개 공존(구버전 + 신버전). HARD-03의 프로덕션 적용은 대기 중이다.

## Files Created/Modified

- `supabase/migrations/20260619000003_add_hagwon_blog_fields.sql` — blog_snippet/blog_tags 컬럼 복원 DDL (신규)
- `supabase/migrations/20260619000005_recommend_hagwon_candidates_v2.sql` — v2 함수 (git mv, 내용 무변경)
- `supabase/migrations/20260731000004_drop_recommend_hagwons_legacy_overload.sql` — 구버전 오버로드 DROP (신규, 프로덕션 미적용)
- `CLAUDE.md` — RLS TO절 규약 + CONCURRENTLY repair 규약 2건 추가 (7줄 추가, 0줄 삭제)
- `.planning/phases/38-security-reset-fix/deferred-items.md` — 범위 밖 발견 2건 기록 (신규)

## Decisions Made

- Task 3의 db reset 실패가 이번 plan 변경분(HARD-02/03/04)이 아니라 Phase 33 이전부터 존재하던 `manual_aliases.sql`↔`seed.sql` hollow dependency임을 확인 — 임의 수정하지 않고 사용자 보고로 전환
- Task 4(프로덕션 push)는 Task 3의 미검증 상태를 이유로 착수하지 않음 — plan의 blocking checkpoint 이전에 이미 상위 태스크가 블로킹됨
- src/types/database.ts 재생성 없음 — recommend_hagwons 호출부 0건이라 무영향 (plan 확정 사항)

## Deviations from Plan

### 계획 실행 중단 (Rule 4류 — 범위 확대 필요, 사용자 확인 대기)

**1. [Task 3 action 명시 지시 — 범위 밖 실패] `db reset`이 Phase 33 이전 마이그레이션에서 실패**
- **Found during:** Task 3
- **Issue:** `20260518000002_manual_aliases.sql`이 로컬에 없는 `complexes` row를 참조해 FK 위반. `supabase/seed.sql`이 `complexes`를 시딩하지 않는 사전 결함
- **조치:** 수정하지 않음 (Task 3 action의 명시적 "중단·보고" 지시 준수). `deferred-items.md`에 근본 원인·해결 후보 3안 기록
- **Files:** 수정 없음 (조사만)
- **커밋:** 없음 (SUMMARY + deferred-items.md만 이번 커밋에 포함)

**2. [Rule 3 예외 — bash pathspec 오타로 인한 커밋 누락 정정]**
- **Found during:** Task 1 커밋 직후
- **Issue:** `git add` 명령에 오타 경로가 섞여 `20260619000003_add_hagwon_blog_fields.sql`이 첫 커밋(`e40c5a1`)에서 누락됨
- **Fix:** 후속 커밋(`5b8796d`)으로 파일 추가 정정
- **Files:** `supabase/migrations/20260619000003_add_hagwon_blog_fields.sql`
- **커밋:** `5b8796d`

---

**Total deviations:** 2 (1건 계획 중단 후 보고, 1건 실행 실수 정정)
**Impact on plan:** HARD-02의 "db reset 전체 성공" 기준은 이번 plan 변경분과 무관한 사전 결함으로 미충족. HARD-03·HARD-04는 파일/문서 수준에서 완료됐으나 HARD-03의 프로덕션 적용(Task 4)은 대기 중.

## Issues Encountered

`supabase db reset`이 Phase 33 이전부터 존재했을 것으로 추정되는 hollow dependency(`manual_aliases.sql` ↔ 시딩되지 않는 `complexes`)로 처음으로 실측 실행 중 발견됐다. 37-VERIFICATION.md의 missing 3번("db reset을 실측 실행해 전체 체인이 끝까지 성공하는지 확인")이 지적한 그 실측을 이번에 처음 수행했고, 결과적으로 Phase 37·38 어느 쪽 책임도 아닌 더 오래된 gap이 드러났다.

## Next Phase Readiness

**차단됨.** 다음 중 하나가 결정돼야 재개 가능:
1. `seed.sql`에 최소 complexes row 추가(범위 확대 승인) → Task 3 재실행 → Task 4 진행
2. 이 hollow dependency를 별도 gap/phase로 분리하고 HARD-02 판정 범위를 재정의 → plan 수정 후 재개
3. `manual_aliases.sql` 방어적 수정 승인 → Task 3 재실행 → Task 4 진행

어느 경로든 **Task 3 재실행 후 통과해야 Task 4(프로덕션 DROP 적용)를 진행할 수 있다.** 로컬 Supabase 스택은 기동 상태로 남겨뒀다 (`npx supabase status`로 확인, 필요 시 `npx supabase stop`).

---
*Phase: 38-security-reset-fix*
*Status: 일시정지 — Task 3 블로킹, 사용자 결정 대기*
