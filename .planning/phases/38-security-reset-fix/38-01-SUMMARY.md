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
    - supabase/migrations/20260518000002_manual_aliases.sql (where exists 가드 추가 — 사용자 승인)
    - supabase/migrations/20260731000003_fix_increment_view_count_security.sql (git mv → 20260731000005_*, 타임스탬프 충돌 해소 — 사용자 승인)

key-decisions:
  - "Task 3(db reset 실측) 1차 실패는 20260518000002_manual_aliases.sql의 FK 위반 — 임의 수정하지 않고 중단·보고 후 사용자 승인 받아 where exists 가드 추가 (insert 값 불변)"
  - "타임스탬프 충돌(20260731000003 중복) 해소는 상대 파일을 20260731000005로 git mv + repair — 우리 파일은 이미 push돼 원장에 기록됐고, 상대 수정도 이미 프로덕션 적용됨(prosecdef=true)"
  - "Task 3 2차 실패: 20260520000002_db_quality_fixes.sql이 동일 버그 클래스(하드코딩 complex_id → complex_aliases FK 위반). 승인 범위 밖으로 판단해 재차 중단·보고"
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

---

## 사용자 승인 조치 2건 (1차 중단 후) — ✅ 완료

### 승인 1 — `manual_aliases.sql`에 `where exists` 가드 추가 (커밋 `9e60462`)

insert를 `insert ... select ... from (values ...) where exists (select 1 from public.complexes c where c.id = v.complex_id)` 형태로 감쌌다. 대상 단지가 존재할 때만 삽입한다.

**🔴 insert 대상·값 불변 확인 (`git show HEAD~:file` 대조):** 11행의 `complex_id` / `source` / `alias_name` / `confidence`가 **전부 동일**. 첫 행에 붙은 `::uuid`·`::text`·`::numeric` 캐스트는 `VALUES` 서브쿼리의 타입 추론에 필요한 것으로 **값 자체는 바뀌지 않았다.**

```
$ git diff --numstat supabase/migrations/20260518000002_manual_aliases.sql
14      2       (2줄 삭제는 `values` → `select ... from (values` 구문 변환 + 닫는 괄호 추가분)
```

프로덕션에는 8개 단지가 모두 존재하므로 **동작 불변**이고, 이 마이그레이션은 이미 적용돼 재실행되지 않으므로 `db push` 대상이 아니며 원장도 건드리지 않는다 — **로컬 `db reset` 재현성에만 영향**을 준다.

### 승인 2 — 타임스탬프 충돌 해소 (커밋 `1bd65dd`)

`20260731000003_fix_increment_view_count_security.sql` → `20260731000005_fix_increment_view_count_security.sql` (`git mv`, **rename 100% / 0 insertions·0 deletions — 내용 무수정**) 후
`npx supabase migration repair --status applied 20260731000005` 실행:

```
Repaired migration history: [20260731000005] => applied
```

**경위:** 다른 세션의 커밋 `df16071`이 `increment_view_count()`의 SECURITY INVOKER→DEFINER 수정을 `20260731000003`으로 추가했는데, Wave 0의 `20260731000003_ad_images_bucket_policies.sql`과 겹쳤다. 우리 파일은 Wave 0에서 이미 push돼 원장에 그 버전으로 기록됐으므로 옮길 수 있는 건 상대 파일이다. `20260731000004`는 이 Phase의 DROP 마이그레이션이 점유하므로 `000005`를 썼다.

**`db push`가 아니라 `repair`가 정확한 이유:** 그 수정은 **이미 프로덕션에 적용돼 있음이 실측 확인**됐다(`increment_view_count` → `prosecdef = true`, `proconfig = search_path=""`). 그대로 뒀다면 CLI가 `000003`을 "이미 적용됨"으로 보아 상대 파일이 **영구히 추적 불가** 상태가 됐을 것이다.

---

## Task 3 재실행 (2차) — ⚠️ **다시 블로킹, 동일 버그 클래스 2번째 파일**

`manual_aliases` 가드 적용 후 `npm run db:reset` 재실행. **`20260518000002`는 통과**했고 체인이 2일치 더 전진했으나, **`20260520000002_db_quality_fixes.sql`에서 동일한 FK 위반**으로 중단:

```
Applying migration 20260518000002_manual_aliases.sql...      ← ✅ 가드 적용 후 통과
Applying migration 20260519000001_recent_complex_sales_rpc.sql...
Applying migration 20260519000002_fix_towol_coordinates.sql...
Applying migration 20260519000003_get_hagwon_grade_rpc.sql...
Applying migration 20260519000004_transactions_umd_nm.sql...
Applying migration 20260519000005_match_complex_by_admin_dong_stage.sql...
Applying migration 20260519000006_add_rankings_data_source.sql...
Applying migration 20260520000001_extend_complex_status_enum.sql...
Applying migration 20260520000002_db_quality_fixes.sql...
ERROR: insert or update on table "complex_aliases" violates foreign key constraint "complex_aliases_complex_id_fkey" (SQLSTATE 23503)
Key (complex_id)=(7f5d84d2-365b-42ec-9825-001a4df4b3aa) is not present in table "complexes".
At statement: 6
-- 4개 단지 이름 alias → 대표 단지
INSERT INTO complex_aliases (id, complex_id, source, alias_name, confidence)
VALUES
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '토월성원아파트',   1.0),
  ...
```

**완전히 동일한 버그 클래스다** — 하드코딩된 `complex_id`로 `complex_aliases`에 INSERT하는데 `seed.sql`이 `complexes`를 시딩하지 않아 FK 위반. 승인 1의 근거("새 환경에 없는 단지의 별칭은 어차피 무의미하다")가 그대로 적용된다.

### 🔎 전수 조사 — 이 버그 클래스의 정확한 범위 (조사만, 수정 없음)

`supabase/migrations/` 전체에서 하드코딩 UUID를 포함한 INSERT를 전수 조사했다:

```
$ grep -ril "insert into complex_aliases\|insert into public.complex_aliases" supabase/migrations/
supabase/migrations/20260518000002_manual_aliases.sql      ← ✅ 승인 1로 해소됨
supabase/migrations/20260520000002_db_quality_fixes.sql    ← 🔴 남은 1건 (INSERT 3개)
```

하드코딩 UUID INSERT가 있는 파일은 **저장소 전체에서 이 2개뿐**이며, 대상 테이블도 `complex_aliases` 하나뿐이다. 즉 **남은 것은 `20260520000002` 한 파일의 INSERT 3개**(63행·82행·101행)가 전부다.

같은 파일의 `UPDATE`/`DELETE`문(1·2·3·4번 블록)은 `WHERE id IN (...)` / `WHERE complex_id IN (...)` 형태라 **빈 테이블에서 0행 매칭 no-op**으로 안전하게 통과한다 — 가드가 필요한 것은 INSERT 3개뿐이다.

⚠️ **단, 이 조사는 `complex_aliases` FK 클래스만 보장한다.** `20260520000002` 이후 구간(`20260521`~`20260731`, 약 100개 파일)은 아직 실행되지 않았으므로 **다른 종류의 hollow dependency가 더 있을 가능성은 배제하지 못했다.** `db reset`이 끝까지 가봐야 확정된다.

### 재차 중단한 근거

오케스트레이터의 명시적 지시 — **"또 다른 사전 결함에서 막히면 다시 멈추고 보고하라 (임의로 고치지 마라 — 이번처럼)"**. 승인 1과 같은 버그 클래스이고 근거도 그대로 적용되지만, **승인 범위는 `20260518000002` 한 파일이었으므로** 다른 파일로 확장하지 않고 보고한다.

## Task 4: [BLOCKING] `npm run db:push`로 DROP 마이그레이션 프로덕션 적용 — ❌ **미착수**

Task 3의 `db reset` 전체 체인 검증이 완료되지 않은 상태에서 프로덕션 변경(Task 4)을 진행하지 않았다. Task 4의 사전 조건인 "Task 3 db reset 결과" 확인이 미검증 상태이므로, 사용자 결정 없이 임의로 진행하지 않는다.

**`recommend_hagwons` 프로덕션 상태는 Wave 0 이후 변경 없음** — 여전히 오버로드 2개 공존(구버전 + 신버전). HARD-03의 프로덕션 적용은 대기 중이다.

## 🔴 `db reset`은 2026-05-18부터 약 2.5개월간 깨져 있었다 — O-3는 유일한 원인이 아니었다

이번 실측으로 드러난 가장 중요한 사실이다.

`20260518000002_manual_aliases.sql`은 **2026-05-18**에 추가됐고, 그 시점부터 `supabase db reset`은 **항상** 이 지점에서 실패해 왔다. 즉 오늘(2026-07-31)까지 **약 2.5개월간 아무도 로컬 리셋을 끝까지 실행하지 못하는 상태**였고, 그 사실이 발견되지 않은 이유는 `migration list`·`db push --dry-run`이 **파일을 실행하지 않기 때문**이다.

### Phase 37 O-3 gap의 종결 여부

`37-VERIFICATION.md`의 O-3(=HARD-02: `blog_*` 컬럼 hollow dependency로 `db reset` 실패)에 대해 이번 Phase가 확정한 것과 못한 것을 구분한다:

| 항목 | 상태 |
|---|---|
| O-3가 지목한 결함(`blog_*` 컬럼 미생성 + v2 슬롯 순서)의 **파일 수준 수정** | ✅ 완료 (`20260619000003` 신규 + `000005` 이동 + repair 2건) |
| O-3가 **`db reset` 실패의 유일한 원인이라는 전제** | ❌ **반증됨.** 더 앞선 `20260518000002`(2일 앞이 아니라 **1개월 앞**)가 먼저 걸린다 |
| O-3 수정이 실제로 `db reset`을 통과시키는지 **실행 검증** | 🔴 **미검증** — 체인이 아직 `20260619` 구간에 도달하지 못했다 |

**따라서 O-3 gap은 아직 종결되지 않았다.** Phase 37이 "db reset이 blog 컬럼 때문에 실패한다"고 진단한 것은 정적 분석으로는 타당했으나, **실행해 보면 그보다 훨씬 앞에서 다른 이유로 먼저 죽는다.** O-3 수정의 유효성은 `20260520000002`까지 넘긴 뒤에야 실증할 수 있다.

이것이 "실행하지 않는 검증(`migration list` / `--dry-run`)"의 한계를 보여주는 두 번째 사례다 — Phase 37이 `gaps_found`를 받은 바로 그 이유이며, 이번엔 그 gap 자체의 전제가 불완전했음이 드러났다.

## Files Created/Modified

- `supabase/migrations/20260619000003_add_hagwon_blog_fields.sql` — blog_snippet/blog_tags 컬럼 복원 DDL (신규)
- `supabase/migrations/20260619000005_recommend_hagwon_candidates_v2.sql` — v2 함수 (git mv, 내용 무변경)
- `supabase/migrations/20260731000004_drop_recommend_hagwons_legacy_overload.sql` — 구버전 오버로드 DROP (신규, 프로덕션 미적용)
- `supabase/migrations/20260518000002_manual_aliases.sql` — `where exists` 가드 추가 (사용자 승인, insert 값 불변)
- `supabase/migrations/20260731000005_fix_increment_view_count_security.sql` — 타임스탬프 충돌 해소 (git mv, 내용 무변경, 사용자 승인)
- `CLAUDE.md` — RLS TO절 규약 + CONCURRENTLY repair 규약 2건 추가 (7줄 추가, 0줄 삭제)
- `.planning/phases/38-security-reset-fix/deferred-items.md` — 범위 밖 발견 기록 (신규)

## Decisions Made

- Task 3의 db reset 실패가 이번 plan 변경분(HARD-02/03/04)이 아니라 2026-05-18부터 존재하던 `manual_aliases.sql`↔`seed.sql` hollow dependency임을 확인 — 임의 수정하지 않고 사용자 보고 → 승인 후 가드 적용
- 타임스탬프 충돌은 상대 파일 rename + `repair`로 해소 (우리 파일은 이미 원장 기록됨, 상대 수정도 이미 프로덕션 적용됨)
- 2차 실패(`20260520000002`, 동일 버그 클래스)는 승인 범위 밖이므로 재차 중단·보고 — 전수 조사로 남은 범위가 INSERT 3개뿐임을 확정해 첨부
- Task 4(프로덕션 push)는 Task 3의 미검증 상태를 이유로 착수하지 않음
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

`supabase db reset`을 **이 저장소에서 처음으로 실제 실행**한 결과, 2026-05-18부터 누적된 hollow dependency 2건(`manual_aliases.sql`·`db_quality_fixes.sql` ↔ 시딩되지 않는 `complexes`)이 드러났다. `37-VERIFICATION.md`의 missing 3번("db reset을 실측 실행해 전체 체인이 끝까지 성공하는지 확인")이 요구한 그 실측이며, 결과적으로 Phase 37·38 어느 쪽 책임도 아닌 **더 오래되고 더 앞선 gap**이 O-3보다 먼저 걸린다는 사실이 확인됐다.

## Next Phase Readiness

**차단됨.** 재개 조건:

1. **`20260520000002_db_quality_fixes.sql`의 INSERT 3개에 동일한 `where exists` 가드 적용 승인** (승인 1과 동일 패턴·동일 근거). 전수 조사 결과 이것이 `complex_aliases` FK 클래스의 **마지막 잔여분**이다
2. → Task 3 3차 재실행. `20260521`~`20260731` 구간(미실행 ~100개 파일)에서 **다른 종류**의 hollow dependency가 더 나올 가능성은 배제하지 못했다
3. → 전 구간 성공 시 Task 4 checkpoint(`db push --dry-run` → 승인 → `db push`) 진행

로컬 Supabase 스택은 기동 상태로 남겨뒀다 (`npx supabase status`로 확인, 필요 시 `npx supabase stop`).

⚠️ **현 시점 HARD-02 판정: 미검증.** `db reset`이 전 구간 성공하지 못했으므로 "통과"로 기록하지 않는다.

---
*Phase: 38-security-reset-fix*
*Status: 일시정지 — Task 3 블로킹, 사용자 결정 대기*
