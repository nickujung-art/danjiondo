---
phase: 37-migration-drift
plan: "00"
subsystem: database
tags: [supabase, migration-drift, ledger-restore, rls]

requires: []
provides:
  - "프로덕션 전용 스키마 5건이 remote 버전 파일명으로 supabase/migrations/에 복원됨 (원장과 바이트 일치)"
  - "Wave 1이 원장 13건을 reverted 처리하기 전 필요한 유일 기록 확보 완료"
  - "baseline 11개 항목 착수 시 실측값 — Wave 1 종료 시 대조 기준"
affects: [37-01]

tech-stack:
  added: []
  patterns:
    - "supabase db query --linked (Management API 경유, DB 비밀번호 불필요) — 읽기 전용 조회 전용"

key-files:
  created:
    - supabase/migrations/20260618085750_perf_review_avg_rpc.sql
    - supabase/migrations/20260618085906_rls_regional_income_area_types_ad_events.sql
    - supabase/migrations/20260618093403_fix_security_definer_search_path_v2.sql
    - supabase/migrations/20260625063824_cardnews_payloads_storage_policies.sql
    - supabase/migrations/20260728074553_realtrade_story_ads_admin.sql
  modified: []

key-decisions:
  - "`supabase db query --linked`(Management API)로 baseline·원장 조회 수행 — DB 비밀번호 프롬프트 없이 읽기 전용 조회 가능. execute_sql MCP 툴 미사용(세션에 노출 안 됨)"
  - "복원 파일 헤더는 계획대로 2줄 고정, 3줄부터 D-02 본문을 문자 그대로 삽입. 원장 statements[1]이 앞에 leading \\n을 포함하는 경우(예: perf_review_avg_rpc) 그 결과 파일에 빈 줄이 하나 더 생기지만, 이는 원장 원문을 그대로 보존한 결과이며 byte_parity_note의 '불일치 시 원장을 정답으로 채택' 원칙에 부합 — 5/5 md5 일치로 검증 완료"
  - "CONTEXT D-02의 SQL 원문과 원장 원문 사이 차이 0건 — 5개 파일 모두 CONTEXT에 기재된 코드블록과 원장 값이 문자 단위로 동일했다"

patterns-established: []

requirements-completed: [DRIFT-01, DRIFT-02]

duration: ~25min
completed: 2026-07-30
---

# Phase 37-00: 마이그레이션 원장 5건 로컬 복원 (Wave 0) Summary

**프로덕션에만 존재하던 스키마 객체 5건(`get_complex_review_avg` RPC, `regional_income`/`complex_area_types` RLS + `ad_events` 정책 수정본, SECURITY DEFINER `search_path` 하드닝, `cardnews-payloads` 스토리지 정책, `site_admin_roles` 테이블+RLS)을 원장 `statements[1]` 원문 그대로 로컬 마이그레이션 파일 5개로 복원. DB 스키마 변경 0건, 개선 0건 — 충실 재현.**

## DRIFT-01 · DRIFT-02 완료 — 복원 5건 md5 대조 결과

| version | 파일 | 원장 len | 원장 md5(rtrim) | 로컬 파일 md5(tail -n +3) | 일치 |
|---|---|---|---|---|---|
| `20260618085750` | `perf_review_avg_rpc.sql` | 328 | `b5a00d7ef655987e15cfd340502b53f8` | `b5a00d7ef655987e15cfd340502b53f8` | ✅ |
| `20260618085906` | `rls_regional_income_area_types_ad_events.sql` | 663 | `3108efb7877ef4c3eea1e9f3ad2037b7` | `3108efb7877ef4c3eea1e9f3ad2037b7` | ✅ |
| `20260618093403` | `fix_security_definer_search_path_v2.sql` | 433 | `42ed3b12c1dbf60a7e9a067624e47ad8` | `42ed3b12c1dbf60a7e9a067624e47ad8` | ✅ |
| `20260625063824` | `cardnews_payloads_storage_policies.sql` | 574 | `2b7983cee39ec0c310e63d64cdaa0913` | `2b7983cee39ec0c310e63d64cdaa0913` | ✅ |
| `20260728074553` | `realtrade_story_ads_admin.sql` | 3000 | `8d4ed093c35846a7e6530206259100bd` | `8d4ed093c35846a7e6530206259100bd` | ✅ |

5/5 일치, 불일치 0건. `array_length(statements,1)`은 5건 전부 `1` — 이어붙일 필요 없음.
CONTEXT D-02 코드블록과 원장 원문 사이 **차이 0건**(모두 D-02 인용이 원장 그대로였다).

**개선 여부 검증**(grep 기반, D-03 준수 확인):
- `cardnews_payloads_storage_policies.sql`, `realtrade_story_ads_admin.sql`: `TO authenticated` 0건
- `rls_regional_income_area_types_ad_events.sql`: `USING (true)` 2건 (regional_income·complex_area_types), `TO authenticated` 1건(`ad_events` 정책 고유, D-02 원문 그대로)
- `20260430000009_rls.sql`: `git diff --stat` 빈 출력 — 무변경 확인

## Baseline 11개 항목 — 착수 시 실측값 (Wave 1 종료 시 대조 기준)

`supabase db query --linked`(Management API, 읽기 전용)로 실측. CONTEXT `<baseline>` 표와 **전부 일치**.

| # | 항목 | 실측값 | CONTEXT 기대값 | 일치 |
|---|---|---|---|---|
| 1 | `site_admin_roles` 행수 / 정책 수 | 1 / 1 | 1 / 1 | ✅ |
| 2 | `get_complex_review_avg` 함수 존재 | 1 | 1 | ✅ |
| 3 | `regional_income` RLS / 정책 수 | `true` / 1 | `true` / 1 | ✅ |
| 4 | `cardnews-payloads` 스토리지 정책 수 | 3 | 3 | ✅ |
| 5 | `check_gps_proximity` proconfig | `["search_path=\"\""]` | `search_path=""` 포함 | ✅ |
| 6 | `recommend_hagwon_candidates` 함수 수 / max args | 1 / 7 | 1 / 7 | ✅ |
| 7 | `ad_events` 정책 roles / with_check | `{authenticated}` / `(auth.uid() IS NOT NULL)` | 동일 | ✅ |
| 8 | `complexes` 행수 | 4285 | 4285 | ✅ |
| 9 | `hagwon_db` 행수 | 4601 | 4601 | ✅ |
| 10 | `complex_area_types` 행수 | 3472 | 3472 | ✅ |
| 11 | 창부레터 테이블 5개 RLS/정책/행수 | 전부 `true` / 정책 합계 7 / 각 0행 | 동일 | ✅ |

불일치 0건 — Phase 착수 전제 확인, 스키마 변경 없이 진행.

## `migration list --linked` — remote-only 18→13, local-only 3건 (Wave 1 입력)

복원 5건 커밋 후 재조회 결과:

- **복원 5건**: local·remote 양쪽에 매칭 확인 (`repair` 불필요 — D-01 파일명 전략대로 자동 매칭)
- **remote-only 13건** (D-04 표와 완전 일치, 차집합 0):
  `20260618051341`, `20260618073750`, `20260618075929`, `20260619043107`, `20260619062830`,
  `20260619072547`, `20260619075829`, `20260624045555`, `20260624045621`, `20260624045635`,
  `20260707051809`, `20260709061130`, `20260715030221`
  → 중복 12건 + 덮인 구버전 1건(`20260618075929`). Wave 1이 `reverted` 처리할 대상.
- **local-only 3건** (baseline과 동일, 신규 발생 없음): `20260618000001`(중복 쌍 2번째),
  `20260618000002`(중복 쌍 2번째), `20260619000002`(중복 쌍 2번째) — 전부 D-05 타임스탬프
  중복 3쌍의 두 번째 파일. Wave 1의 리네이밍 대상.

## `db reset` 순서 성립 확인

복원 파일이 참조하는 선행 객체 9종 전부 해당 복원 파일 version보다 **앞선** 마이그레이션에서 생성됨을 grep으로 확인:

| 참조 객체 | 생성 파일 | version |
|---|---|---|
| `complex_reviews` | `20260430000016_reviews.sql` | 20260430000016 |
| `regional_income` | `20260602000001_regional_income.sql` | 20260602000001 |
| `complex_area_types` | `20260618000001_complex_area_types.sql` | 20260618000001 |
| `ad_events`/`ad_campaigns` | `20260430000007_ads.sql` | 20260430000007 |
| `check_gps_proximity`/`new_listings` | `20260507000004_phase4_tables.sql` | 20260507000004 |
| `get_recent_complex_sales` | `20260519000001_recent_complex_sales_rpc.sql` | 20260519000001 |
| `get_hagwon_grade` | `20260519000003_get_hagwon_grade_rpc.sql` | 20260519000003 |
| `get_schools_for_point` | `20260526000002_ai_chat_school_chunk.sql` | 20260526000002 |
| `presale_discoveries` | `20260530000002_presale_discoveries.sql` | 20260530000002 |

전부 최소 복원 대상 version(`20260618085750`)보다 작음 — `db reset` 순서 성립.

## 하드닝 후보 (고치지 않고 기록만 — O-2 보강)

복원 5건 전부에서 확인된 `TO` 절 누락 정책 (D-03 준수, 그대로 커밋됨):

- `regional_income: public read`, `complex_area_types: public read` — `USING (true)` + `TO` 절 없음
- `site_admin_roles`, `ad_campaigns`(realtrade-story 정책 3개), `presale_discoveries`, `new_listings` — `TO` 절 없음
- `cardnews-payloads` 정책 3개 — `TO` 절 없음

전부 프로덕션 현재 상태의 충실 재현. `auth.uid()`/`auth.role()` 조건이 `anon`을 실질 차단하고 있어 즉각적 위험은 낮음. 하드닝은 O-2로 별도 Phase에서 프로덕션·로컬 동시 변경 예정.

## Wave 1 착수 전제 — 복원 5개 파일 커밋 완료

**커밋 SHA: `4e70a7e`** — `fix(37): 프로덕션 전용 마이그레이션 5건 로컬 복원 (DRIFT-01, DRIFT-02)`

포함 파일 5개(전부 `supabase/migrations/`), `src/` 경로 0건. Wave 1 첫 게이트가 이 커밋 존재를 전제로 진행 가능.

## Deviations from Plan

None - plan executed exactly as written. Task 1의 baseline 실측·원장 추출은 `execute_sql` MCP 대신 `supabase db query --linked` CLI로 수행했으나(D-07 Claude's Discretion 범위 내 — "검증 조회를 MCP execute_sql / supabase db query 중 무엇으로 할지"), 둘 다 읽기 전용이며 결과는 동일하다.

## 검증 명령 실행 결과

```
npx supabase migration list --linked  → 복원 5건 매칭, remote-only 13, local-only 3
npm run lint                          → 종료 코드 0 (ESLint 통과, tsc 통과)
git status --porcelain src/           → (빈 출력)
git diff --stat supabase/migrations/20260430000009_rls.sql → (빈 출력)
git log -1 --name-only                → 마이그레이션 5개 파일만, src/ 0건
```

## Self-Check: PASSED

- FOUND: supabase/migrations/20260618085750_perf_review_avg_rpc.sql
- FOUND: supabase/migrations/20260618085906_rls_regional_income_area_types_ad_events.sql
- FOUND: supabase/migrations/20260618093403_fix_security_definer_search_path_v2.sql
- FOUND: supabase/migrations/20260625063824_cardnews_payloads_storage_policies.sql
- FOUND: supabase/migrations/20260728074553_realtrade_story_ads_admin.sql
- FOUND commit: 4e70a7e
