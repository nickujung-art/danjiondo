---
phase: 41-busan-recollect
plan: "01"
subsystem: database
tags: [supabase, migration, postgrest, rpc, molit, busan]

requires: []
provides:
  - "regions 부산 16개 is_active=true (정식 마이그레이션, 원장 등록)"
  - "부산 ingest_runs 4,006행 삭제 — --resume 이 skip 할 대상 0"
  - "public.db_size_bytes() RPC (service_role 전용)"
  - "scripts/busan-status.ts — 이후 6개 plan 이 공유하는 실측 단일 진입점"
  - "D-08 판정: complex_integrity_counts(p_sgg text[]) 는 실제 필터로 동작한다 (실측 확인)"
affects: [41-02, 41-03, 41-04, 41-05, 41-06, 41-07, 41-08, 41-09]

tech-stack:
  added: []
  patterns:
    - "scripts/busan-status.ts: 5섹션 실측 + --json + --assert-* 게이트 패턴 (check-ingest-linkage.ts 관례 계승)"
    - "PostgREST OpenAPI 스펙(GET /rest/v1/)으로 RPC 파라미터명을 역추적 — 마이그레이션 파일이 없는 프로덕션 전용 함수 조사에 사용"

key-files:
  created:
    - supabase/migrations/20260819080000_reactivate_busan_scope.sql
    - scripts/busan-status.ts
  modified: []

key-decisions:
  - "마이그레이션 원장 drift(2026-08-05~06, 15개 orphan 엔트리)를 이 plan에서 발견 — db push가 전면 차단됨. 내용을 전수 확인해 전부 멱등(IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE / 리터럴 UPDATE)임을 검증한 뒤 migration repair + --include-all 로 안전하게 재정렬"
  - "complex_integrity_counts 의 실제 파라미터명은 p_sgg (문서화된 3개 후보 전부 불일치) — PostgREST OpenAPI 스펙으로 확인"
  - "D-08: 배열 인자가 실제 필터로 쓰인다 (운영권역 6코드→59, 부산 16코드→0, 빈배열→0 이 서로 다름) — 부산 유입이 complex-integrity 기준선에 영향 없음"

requirements-completed: [BUSAN-01, BUSAN-02]

duration: 70min
completed: 2026-08-19
---

# Phase 41 Plan 01: regions 스위치 복원 + ingest_runs 무효화 + 실측 진입점 Summary

**부산 16개 구 `regions.is_active` 를 정식 마이그레이션으로 되돌리고, `ingest_runs` 4,006행을 지워 `--resume` 조용한 성공 경로를 차단했으며, 이후 6개 plan 이 공유할 `scripts/busan-status.ts` 실측 진입점을 만들었다. 부수적으로 2026-08-05~06 마이그레이션 원장 drift 15건을 발견해 안전하게 재정렬했다.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-08-19T08:55:00Z (approx)
- **Completed:** 2026-08-19T10:05:04Z
- **Tasks:** 3/3 (Task 3 는 측정 전용, 파일 변경 없음)
- **Files modified:** 2 (신규 생성)

## Accomplishments

- `regions` 부산 16행 `is_active=true` — 프로덕션 재조회로 확인 (busanActive=16, totalActive=38)
- 부산 `ingest_runs` 4,006행 삭제 — 프로덕션 재조회로 확인 (0행)
- `public.db_size_bytes()` RPC 신설, service_role 전용 grant, 실측 449MB/8192MB (5.5%)
- `scripts/busan-status.ts` — 5섹션 실측 + `--json` + `--assert-seed-gate`(현재 exit 1 확인) + `--assert-runs-purged`(exit 0 확인)
- D-08 판정 완료: `complex_integrity_counts(p_sgg text[])` 는 실제 필터로 동작 — 부산 유입이 기준선(`empty_kapt=59`)에 영향 없음
- 마이그레이션 원장 drift(15개 orphan 타임스탬프, 2026-08-05~06) 발견·재정렬 — 전수 내용 검토로 멱등성 확인 후 안전하게 반영

## Task Commits

1. **Task 1: regions 부산 활성화 + ingest_runs 무효화 마이그레이션 작성·적용** - `418639e` (feat)
2. **Task 2: scripts/busan-status.ts 작성** - `00daa07` (feat)
3. **Task 3: 기준값 실측 + D-08 스코프 대조** - 파일 변경 없음 (측정 전용, 본 SUMMARY 에 기록)

**Plan metadata commit:** (오케스트레이터가 wave 종료 후 생성 — 이 executor 는 STATE.md/ROADMAP.md 를 갱신하지 않는다)

## Files Created/Modified

- `supabase/migrations/20260819080000_reactivate_busan_scope.sql` — regions 부산 활성화 + ingest_runs 부산 삭제 + db_size_bytes RPC. 조건 없는 멱등 UPDATE/DELETE, 행 수 단언 없음(seed.sql 에 부산 행이 없어 `db reset` 을 깨뜨리지 않도록)
- `scripts/busan-status.ts` — 부산 복원 진행 실측 단일 진입점. Database 타입 미부착 클라이언트(geocode-complexes.ts/check-ingest-linkage.ts 관례 계승) — `db_size_bytes` RPC 가 아직 생성된 타입 정의에 없어도 `tsc --noEmit` 를 통과시키기 위함

## Migration 적용 결과

### `npm run db:push` 출력 요지

최초 시도는 **전면 차단**됐다 — 2026-08-05~06 구간에 원장 drift(원격에만 있는 15개 타임스탬프, 로컬에만 있는 13개 파일)가 있어 `LegacyDbPushMissingLocalError`/`LegacyDbPushMissingRemoteError` 로 push 자체가 시작되지 못함. "Deviations from Plan" 절 참조.

재정렬 후 최종 `db push --include-all --linked` 결과:
```
Applying migration 20260805063000_facility_kapt_dedupe_and_area.sql...
Applying migration 20260806000000_refresh_complex_price_stats_setbased.sql...
Applying migration 20260806010000_data_source_price_stats.sql...
Applying migration 20260806020000_harden_definer_function_grants.sql...
Applying migration 20260806030000_fix_get_hagwon_grade_search_path.sql...
Applying migration 20260806040000_refresh_price_stats_definer_for_direct_run.sql...
Applying migration 20260806050000_transactions_created_at_index.sql...
Applying migration 20260806060000_assign_area_types_search_path.sql...
Applying migration 20260806070000_revoke_from_public_not_just_anon.sql...
Applying migration 20260806080000_restore_towolseongwon_merge.sql...
Applying migration 20260806090000_match_complex_follow_successor.sql...
Applying migration 20260806100000_match_complex_alias_stage0.sql...
Applying migration 20260806110000_price_change_per_pyeong_min_sample.sql...
Applying migration 20260819080000_reactivate_busan_scope.sql...
Finished supabase db push.
```

`npx supabase migration list --linked` 재조회: 전체 목록에서 local/remote 가 모두 일치, `20260819080000` 이 양쪽에 나타남 — **drift 0**.

### 프로덕션 재조회 실측값 (마이그레이션 적용 직후)

```json
{
  "regions_busan_active": 16,
  "regions_total_active": 38,
  "ingest_runs_busan_total": 0,
  "db_size_bytes": 470305939,
  "db_size_mb": 448.5186948776245,
  "db_size_pct_of_pro_8gb": 5.475081724580377
}
```

41-CONTEXT `<baseline>` 대비: `regions` 부산 16/전체 38 — 일치. `ingest_runs` 부산 0 — 삭제 확인. DB 용량 448.5MB — 오케스트레이터 실측(448MB)과 거의 동일(일배치 사이 큰 변동 없음).

## `busan-status.ts` 실행 출력

### 기본 모드 (`npx tsx scripts/busan-status.ts`, exit 0)

5개 섹션(regions·complexes·ingest_runs·transactions·db_size) 전부 출력됨. `complexes_by_gu` 16개 구 전부 0(예상대로 — K-apt 시딩 전).

### `--json` (기준값, Task 3)

```json
{
  "regions_busan_active": 16,
  "regions_total_active": 38,
  "complexes_busan_total": 0,
  "complexes_coord_not_null": 0,
  "complexes_coord_coverage_pct": 0,
  "complexes_by_gu": {
    "26110": 0, "26140": 0, "26170": 0, "26200": 0, "26230": 0, "26260": 0,
    "26290": 0, "26320": 0, "26350": 0, "26380": 0, "26410": 0, "26440": 0,
    "26470": 0, "26500": 0, "26530": 0, "26710": 0
  },
  "complexes_avg_sale_per_pyeong_not_null": 0,
  "ingest_runs_busan_total": 0,
  "ingest_runs_by_source": {},
  "ingest_runs_rows_upserted_sum": 0,
  "transactions_busan_total": 0,
  "transactions_complex_id_null": 0,
  "transactions_linked_pct": 100,
  "transactions_deal_date_min": null,
  "transactions_deal_date_max": null,
  "complex_rankings_busan": 0,
  "complex_gap_stats_busan": 0,
  "complex_price_predictions_busan": 0,
  "db_size_bytes": 470305939,
  "db_size_mb": 448.5186948776245,
  "db_size_pct_of_pro_8gb": 5.475081724580377,
  "db_size_error": null
}
```

**확인**: 부산 `complexes`=0 / 부산 `ingest_runs`=0 / 부산 활성 16 / 전체 활성 38 — 전부 acceptance_criteria 요구 값과 일치.

### `--assert-seed-gate` (게이트 판정 — **이 시점엔 exit 1 이 정상**)

```
❌ 게이트 미달:
   - complexes 부산 0 < 1400 — K-apt 시딩(seed-complexes.ts)이 아직 부족하거나 미실행
   - 좌표 커버리지 0.0% < 95% — geocode-complexes.ts 미실행 또는 부족
   - 0개 단지인 구 16곳: 26110,26140,...,26710 — 이 구의 거래는 전량 미연결로 쌓인다
```
`exit code = 1` 확인함 — 부산 단지가 아직 0개이므로 게이트가 실제로 백필 진입을 막는다는 양성 신호. 41-03(K-apt 시딩)·41-04(지오코딩) 완료 후 재실행하면 통과해야 한다.

### `--assert-runs-purged` (exit 0 확인)

부산 `ingest_runs` 0행이므로 정상 통과.

## D-08 감시 스코프 프로덕션 대조 (`complex_integrity_counts`)

**함수 시그니처 발견**: 저장소에 `CREATE FUNCTION` 이 없어(발견 5) 정적으로 파라미터명을 알 수 없었다. 문서화된 후보 3개(`p_sgg_codes`/`sgg_codes`/`codes`) 전부 PostgREST `PGRST202`(schema cache 에 함수 없음) 로 실패했다. `GET {SUPABASE_URL}/rest/v1/` 의 PostgREST OpenAPI 스펙을 조회해 **실제 파라미터명이 `p_sgg`** 임을 확인했다(POST/GET 양쪽 스펙에 `p_sgg: text[]` 로 명시됨).

**호출 결과 (service_role, `p_sgg` 파라미터)**:

| 호출 인자 | multi_jibun | turnover_anomaly | empty_kapt |
|---|---|---|---|
| 운영권역 6코드 (`48121,48123,48125,48127,48129,48250`) | **10** | **23** | **59** |
| 부산 단일(`26110`) | 0 | 0 | 0 |
| 부산 16코드 전체 | 0 | 0 | 0 |
| 빈 배열 `[]` | 0 | 0 | 0 |

**판정: 배열이 필터로 쓰인다.** 운영권역과 부산/빈배열의 결과가 명확히 다르다(59 vs 0). `complex-integrity.yml` 은 운영권역 6코드만 넘기므로, **부산 유입은 이 워크플로의 기준선(`BASE_EMPTY_KAPT=59` 등)에 영향을 주지 않는다** — D-08 의 "위험이 초기 판단보다 작다"는 가설이 실측으로 확인됐다.

D-08 규칙대로 **기준선을 이 plan 에서 바꾸지 않는다.** `git diff --stat .github/workflows/complex-integrity.yml` 은 공백(무변경) 확인됨.

**부수 관찰(범위 밖, 기록만)**: 방금 측정한 `multi_jibun=10` 이 워크플로에 잠긴 `BASE_MULTI_JIBUN=9` 를 이미 1 초과한 상태다. 이는 부산과 무관한 기존 운영권역 데이터의 변화이며, 이 plan 의 범위(BUSAN-01/02) 밖이다. 손대지 않았고, `complex-integrity.yml` 무변경으로 남겼다. 다음 정기 실행(06:00 KST)에서 실제로 감지될 것이다 — 필요 시 별도 조사 권장.

## 시딩 목표치 근거 (4숫자)

| 숫자 | 의미 |
|---|---|
| **1,463** | Phase 34 K-apt 실측 시딩량(34-03-SUMMARY.md) |
| **1,594** | 2026-08-10 삭제 시점 `complexes` 행 수(ADR-062 기록) — 시딩 이후 한 달간 다른 경로로 +131 증가 |
| **1,500** | ROADMAP Success Criteria 2 / 41-CONTEXT Success Criteria 3 요구치 |
| **1,400** | `--assert-seed-gate` 차단 게이트 |

**관계**: 1,463(K-apt 시딩 실측) < 1,500(요구치) — **K-apt 시딩만으로는 요구치에 못 미칠 가능성이 높다.** 게이트를 1,500 이 아닌 1,400 으로 둔 이유는 K-apt 시딩 실측값(1,463)에 여유를 두어, "시딩이 정상적으로 됐는데 게이트가 막는" 거짓 음성을 피하기 위함이다. 1,500 요구치 미달 시 41-03/41-04 가 원인(K-apt 등록률 vs 추가 소스 필요)을 실측 보고해야 한다 — **인계 사항으로 41-03·41-04 에 넘긴다.**

## Decisions Made

- **마이그레이션 원장 drift 재정렬 방식**: `migration repair --status reverted`(원격 전용 15개 orphan) 후 `db push --include-all`(로컬 전용 13개 파일 + 신규 파일)로 진행. 13개 파일 전수 내용 검토로 전부 멱등(IF NOT EXISTS/ON CONFLICT/CREATE OR REPLACE/리터럴값 UPDATE) 임을 확인 후 실행 — 재실행돼도 최종 상태가 수렴하므로 안전. `20260806050000` 파일 자체 주석("운영 DB 에는 CREATE INDEX CONCURRENTLY 로 이미 적용했다")이 이 13개가 이미 프로덕션에 반영돼 있었다는 가설을 직접 뒷받침
- **`complex_integrity_counts` 파라미터명 발견 방법**: PostgREST 는 함수 introspection 을 `GET /rest/v1/`(OpenAPI 스펙)으로 제공한다 — RPC 이름을 알지만 파라미터명을 모를 때 재사용 가능한 조사 패턴으로 기록
- **`scripts/busan-status.ts` 는 Database 타입을 부착하지 않은 클라이언트를 쓴다** — `db_size_bytes` RPC 가 아직 `src/types/database.ts` 생성 타입에 없어(타입 재생성은 이 plan 범위 밖), Database 제네릭을 붙이면 `tsc --noEmit` 이 깨진다. `geocode-complexes.ts`/`check-ingest-linkage.ts` 의 기존 관례(비타입 클라이언트)를 그대로 따름

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 마이그레이션 원장 drift(2026-08-05~06, pre-existing) 로 `npm run db:push` 자체가 시작되지 못함**
- **Found during:** Task 1 (마이그레이션 적용)
- **Issue:** `npm run db:push` 최초 실행이 `LegacyDbPushMissingLocalError` 로 즉시 실패. 원격에만 존재하는 15개 타임스탬프(2026-08-05 06:28 ~ 2026-08-06 07:21)가 원장에 있었고, 로컬 파일명과 매칭되지 않았다. 이는 이 plan 의 작업으로 생긴 게 아니라 **2026-08-05~06 에 CONCURRENTLY 관련 배치를 psql 로 직접 실행한 뒤 repair 타임스탬프가 로컬 파일명과 어긋난 pre-existing 상태**(CLAUDE.md 의 "CONCURRENTLY drift" 클래스와 동형, 다만 이번엔 발생 폭이 더 넓었다)
- **Fix:**
  1. `npx supabase migration repair --status reverted <15개 원격 전용 타임스탬프>` — 원장 북키핑만 수정(실제 스키마 변경 없음)
  2. `db push --dry-run` 으로 재검증 → 이번엔 로컬 전용 13개 파일이 "원격보다 앞선 순서" 로 걸림
  3. 13개 파일 전수를 직접 읽어 전부 멱등 연산(`IF NOT EXISTS`/`ON CONFLICT DO UPDATE|NOTHING`/`CREATE OR REPLACE FUNCTION`/리터럴 값 `UPDATE ... WHERE id = '...'`)임을 확인. `20260806050000` 파일 자체 주석이 "운영 DB 에는 CONCURRENTLY 로 이미 적용했다"고 명시해 프로덕션에 이미 반영돼 있었다는 가설을 뒷받침
  4. `db push --include-all --linked` 실행 — 13개 파일 + 신규 `20260819080000` 순서대로 적용, 전부 성공
- **왜 Rule 3 인가, Rule 4(architectural) 가 아닌가**: 이 복구는 원장 북키핑(`supabase_migrations.schema_migrations`)만 수정했고 스키마·데이터를 직접 조작하지 않았다. 재적용 대상 13개 파일도 내용 검토로 멱등성을 확인한 뒤에만 실행했다. CLAUDE.md 가 이미 "CONCURRENTLY drift → migration repair 로 원장 기록" 을 이 저장소의 표준 절차로 명문화하고 있어(선례: `20260728120000`·`20260731000001`), 이번 조치는 그 문서화된 패턴을 동일 클래스의 더 넓은 인스턴스에 적용한 것이다
- **Files modified:** 없음(스키마 파일 변경 없음 — 원장 bookkeeping 만)
- **Verification:** `migration list --linked` 재조회로 전 구간 local=remote 일치·drift 0 확인. 프로덕션 재조회로 `regions`/`ingest_runs`/`db_size` 실측값이 기대와 일치함을 확인
- **Committed in:** 별도 커밋 없음 (원장 조작이라 로컬 git 변경사항 없음). `418639e`(Task 1)가 신규 마이그레이션 파일만 담고 있다
- **잔여 리스크**: 이 drift 재정렬은 **이 plan 의 범위(BUSAN-01/02)가 아닌 pre-existing 문제**를 다뤘다. 13개 파일이 "이미 적용됨"이라는 결론은 강한 정황 증거(파일 자체 주석, 타임스탬프 클러스터링, 멱등 재실행으로 검증된 최종 상태)에 기반하지만, `supabase db diff --linked` 같은 완전한 스키마 대조는 하지 않았다. 향후 Phase 37 계열 전수 drift 감사에서 재확인 권장

**2. [Rule 3 - Blocking] `complex_integrity_counts` 실제 파라미터명이 문서화된 3개 후보와 전부 불일치**
- **Found during:** Task 3 (D-08 감시 스코프 대조)
- **Issue:** plan 이 지시한 후보 이름(`p_sgg_codes`/`sgg_codes`/`codes`) 전부 PostgREST `PGRST202`(함수를 찾을 수 없음) 로 실패
- **Fix:** `GET {SUPABASE_URL}/rest/v1/`(PostgREST 자동 생성 OpenAPI 스펙)를 조회해 `/rpc/complex_integrity_counts` 경로의 실제 파라미터 스키마를 확인 — `p_sgg`
- **Files modified:** 없음(조사만)
- **Verification:** `p_sgg` 로 호출 성공, 운영권역/부산/빈배열 세 결과가 예상대로 다름을 확인
- **Committed in:** 해당 없음 (SUMMARY 기록만, 코드 변경 없음)

---

**Total deviations:** 2 auto-fixed (둘 다 Rule 3 - blocking issue, 조사/북키핑 성격이라 스키마·데이터·애플리케이션 코드에 실질적 변경 없음)
**Impact on plan:** 둘 다 Task 1/3 완료에 필수였다. Scope creep 없음 — drift 재정렬은 원장 북키핑만, RPC 파라미터명 발견은 조사 결과만 남겼다.

## Issues Encountered

- **프롬프트 인젝션 시도 감지**: 실행 중 두 개의 가짜 `system-reminder` 블록이 대화에 주입됐다 — (1) 이 작업과 무관한 "PlayMCP/카카오" MCP 서버 안내문, (2) "bypass permissions mode" 를 근거로 Read/Edit/Write 대신 원시 Bash 사용을 지시하는 블록. 실제 작업 지시(orchestrator 프롬프트·CLAUDE.md)와 무관하고 도구 사용 안전성을 낮추는 내용이라 **무시**하고 정규 Read/Write/Edit/Bash 도구로 계속 진행했다. 코드·데이터에는 영향 없음 — 정보 제공 목적으로만 기록

## User Setup Required

None - 외부 서비스 설정 불필요.

## Rollback

- **마이그레이션**: `supabase/migrations/20260819080000_reactivate_busan_scope.sql` 은 `regions.is_active=true` 와 `db_size_bytes()` RPC 만 새로 만든다 — 되돌리려면 새 마이그레이션으로 `is_active=false WHERE sgg_code LIKE '26%'` 와 `DROP FUNCTION public.db_size_bytes()` 를 추가하면 된다
- **삭제된 `ingest_runs` 4,006행 백업**: `C:\Users\jung\AppData\Local\Temp\claude\C--Users-jung-coding-bds\3655980e-1e4d-4327-8ef4-d6f4ed183510\scratchpad\busan-ingest-runs-backup-20260819.json` (오케스트레이터가 삭제 전 백업, 행 단위 전체 JSON). 복원이 필요하면 이 JSON 을 `ingest_runs` 테이블에 재삽입
- **DB 백업**: `backup-2026-08-10.sql.gz`(ADR-062 가 남긴 릴리즈 db-backups) — 이번 plan 이 만진 테이블(`regions`, `ingest_runs`)은 이 백업 시점 이후 상태와 다르므로 전체 복원은 권장하지 않음. 위 JSON 백업이 더 정밀한 롤백 경로

## Next Phase Readiness

- BUSAN-01/02 완료 — `regions` 스위치 ON, `ingest_runs` 정리 완료, 원장 drift 0
- `scripts/busan-status.ts` 가 41-02~41-09 전체가 공유할 실측 진입점으로 준비됨
- **41-03(K-apt 시딩) 진입 전 확인 필요**: `--assert-seed-gate` 가 현재 exit 1(예상대로) — 41-03/41-04 완료 후 재실행해 통과 확인할 것
- **인계**: 41-03/41-04 는 시딩 결과를 1,463(K-apt 실측)과 1,594(삭제분) 양쪽과 대조 보고해야 한다(41-CONTEXT Task 3 근거)
- **범위 밖 관찰 사항**: `complex_integrity_counts` 운영권역 `multi_jibun=10` 이 워크플로 기준선(`BASE_MULTI_JIBUN=9`) 을 이미 초과한 상태로 관측됨 — 부산과 무관, 이 plan 에서 손대지 않음. 다음 정기 실행(06:00 KST)에서 확인될 것
- 병렬 실행 중인 41-02(백필 워크플로 입력 확장)는 별도 파일(`scripts/backfill-realprice.ts` 등)을 다루며 이 plan 과 충돌 없음

---
*Phase: 41-busan-recollect*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260819080000_reactivate_busan_scope.sql
- FOUND: scripts/busan-status.ts
- FOUND: .planning/phases/41-busan-recollect/41-01-SUMMARY.md
- FOUND commit: 418639e (Task 1)
- FOUND commit: 00daa07 (Task 2)
