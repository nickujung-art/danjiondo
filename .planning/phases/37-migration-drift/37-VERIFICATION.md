---
phase: 37-migration-drift
verified: 2026-07-31T00:00:00Z
status: gaps_found
score: 6/7 must-haves verified (roadmap Success Criteria 1-6 pass; goal-derived truth "db reset reproduces production" fails)
overrides_applied: 0
gaps:
  - truth: "supabase db reset이 프로덕션을 재현한다 (Phase Goal 첫 절)"
    status: failed
    reason: >
      20260619000003_recommend_hagwon_candidates_v2.sql (LANGUAGE sql)이 h.blog_tags / h.blog_snippet
      컬럼을 SELECT하지만, 그 컬럼을 생성하는 ADD COLUMN DDL이 로컬 마이그레이션 어디에도 없다
      (저장소 전체 grep 0건, hagwon_db CREATE TABLE 정의에도 없음). PostgreSQL은 LANGUAGE sql 함수를
      CREATE 시점에 파싱·컬럼 해석하므로 `db reset`은 이 파일에서 "column h.blog_tags does not exist"
      류 에러로 실패한다. 프로덕션은 해당 컬럼이 실존해(라이브 조회로 재확인: 2개 컬럼 존재) 정상
      작동하므로 운영 영향은 없지만, 이 Phase의 명시적 목표("db reset이 프로덕션을 재현") 자체가
      달성되지 않았다.
    artifacts:
      - path: "supabase/migrations/20260619000003_recommend_hagwon_candidates_v2.sql"
        issue: "h.blog_tags(27,44행)/h.blog_snippet(28,45행)을 참조하지만 이 컬럼을 만드는 선행 마이그레이션이 없음"
      - path: ".planning/phases/37-migration-drift/37-CONTEXT.md"
        issue: "D-04 표가 remote version 20260619043107(add_hagwon_blog_fields, 실제 ADD COLUMN DDL)을 로컬 20260619000003_..._v2.sql(실제로는 SELECT만 하고 컬럼을 만들지 않음)에 중복으로 잘못 대응시켜, Wave 1이 그 DDL을 복원 없이 reverted 처리하게 만들었다. 근거: 파일 안에서 'blog_snippet' 문자열이 grep된 것을 DDL 존재로 오인한 얕은 검증"
    missing:
      - "ledger-backup-13-reverted.sql의 20260619043107 블록(ALTER TABLE public.hagwon_db ADD COLUMN blog_snippet/blog_tags, 346행 부근)을 20260619000003(현재 v2 파일 슬롯) 앞의 새 마이그레이션 파일로 복원"
      - "그 새 version을 npx supabase migration repair --status applied로 원장에 기록"
      - "복원 후 로컬(Docker 기동 가능 환경)에서 supabase db reset을 실측 실행해 전체 체인이 끝까지 성공하는지 확인 — 이 Phase/이번 검증 모두 db reset을 실제로 실행하지 못했다(Docker 미가동)는 한계가 있음"
deferred:
  - truth: "recommend_hagwons 오버로드 2개 정리 (O-1)"
    addressed_in: "별도 Phase (미배정)"
    evidence: "37-CONTEXT.md <observations> O-1 — 앱 코드 확인 선행 필요, 이 Phase 착수 전부터 알려진 범위 밖 항목. 라이브 재확인: 오버로드 2개 그대로 공존, Phase 37이 손대지 않음"
  - truth: "TO 절 누락 정책 하드닝 (O-2)"
    addressed_in: "별도 Phase (미배정)"
    evidence: "37-CONTEXT.md D-03/<observations> O-2 — 프로덕션·로컬 동시 변경 필요, 충실 재현이 이 Phase의 목적이라 의도적으로 범위 밖. 라이브 재확인: 복원 파일 전부 TO 절 없음 그대로"
---

# Phase 37: 마이그레이션 원장·저장소 정합성 회복 Verification Report

**Phase Goal:** 프로덕션에만 존재하는 스키마 객체를 로컬 마이그레이션 파일로 복원하고, 원장의
중복·구버전 기록을 정리하고, 로컬 타임스탬프 중복을 리네이밍해 **`supabase db reset`이
프로덕션을 재현하고 `npm run db:push`가 정상 작동하는 상태**를 회복한다. **스키마 변경 0.**

**Verified:** 2026-07-31
**Status:** gaps_found
**Re-verification:** No — initial verification

## 결론 요약 (TL;DR)

이 Phase가 명시한 **ROADMAP Success Criteria 6개는 전부 실측으로 확인됐다** (아래 표).
그러나 **Phase Goal 원문의 첫 절 — "`supabase db reset`이 프로덕션을 재현한다" — 은 달성되지
않았다.** Wave 1이 발견해 SUMMARY와 ROADMAP에 이미 기록한 **O-3**
(`hagwon_db.blog_tags`/`blog_snippet` `ADD COLUMN` DDL 로컬 부재)를 라이브 DB 조회와 정적 분석으로
독립 재확인한 결과, 이는 사실이며 **`db reset`을 실제로 실패시키는 결함**이다.

O-3는 O-1·O-2처럼 "처음부터 범위 밖으로 명시된 관찰"이 아니라, **이 Phase 자신의 CONTEXT
문서(D-04 표)가 저지른 분류 오류의 직접적 결과**다 — `20260619043107 add_hagwon_blog_fields`를
`20260619000003_..._v2.sql`의 "중복"으로 잘못 대응시켜, 실제로는 컬럼을 만들지 않는 파일이
컬럼을 만드는 원장 기록을 대신하는 것으로 오분류됐다. 그 결과 DDL이 복원 없이 `reverted`
처리됐다.

**판정:** ROADMAP Success Criteria 체크리스트 통과만으로 `passed`를 주지 않는다. Goal 원문의
핵심 조건이 검증 가능한 방식으로 실패했으므로 `status: gaps_found`로 판정한다. 복구 비용은
낮다(백업에 DDL 원문 보존, 파일 1개 추가 + repair 1회면 해결) — 이는 Phase 실패라기보다
**즉시 닫아야 할 잔여 gap**의 성격이다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | 프로덕션 전용 5건이 remote 버전 파일명으로 로컬에 존재하고 원장과 바이트 일치 | ✓ VERIFIED | 라이브 `md5(rtrim(statements[1],E'\n'))` 5건과 로컬 `tail -n +3 \| md5sum` 5건 독립 재계산 — 5/5 완전 일치 (b5a00d7e.../3108efb7.../42ed3b12.../2b7983ce.../8d4ed093...) |
| 2 | 복원 중 개선(TO 절 추가·using(true) 변경) 없음 | ✓ VERIFIED | `grep -c "TO authenticated"` cardnews=0, realtrade=0; rls파일 `USING (true)`=2, `TO authenticated`=1(ad_events 고유, D-02 원문). `20260430000009_rls.sql` 최초 커밋(9242830) 이후 무변경 |
| 3 | remote 전용 13건이 원장에서 reverted 처리되고 복원 5건은 applied 유지 | ⚠️ SATISFIED-WITH-DEFECT | 실행 자체는 SUMMARY 기록대로였음. 그러나 13건 분류 근거(D-04)에 결함이 있었고, 그 결함이 O-3를 낳음 (아래 참조) |
| 4 | 로컬 타임스탬프 중복 0건, 리네이밍 3건이 순수 rename(내용 무변경)이고 의존 순서 보존 | ✓ VERIFIED | `ls \| cut -c1-14 \| sort \| uniq -d` 빈 출력. `git show --stat -M dac50c4` 3건 모두 `similarity index 100%`. `diff <(git show 4821f52:...) <(현재파일)` 3건 모두 exit 0(무변경). `_recommend_hagwon_candidates_rpc.sql`은 파일명 그대로 `20260619000002`에 잔존(이동 안 됨) 확인 |
| 5 | `migration list --linked` local-only 0, remote-only 0 / `db push --dry-run` 통과 | ✓ VERIFIED (Phase 완료 시점 기준) | SUMMARY 캡처값 재현 가능 확인. **단, 지금 재실행하면 local-only 2건**(`20260731000001`, `20260731000002`) — Phase 37 완료 이후(2026-07-31, 커밋 `fcebcaa`)의 별개 작업(`transactions` 인덱스+RPC)이 원인이며 Phase 37의 회귀가 아님. 상세는 "회귀 아님" 절 참고 |
| 6 | 스키마 무변경 — baseline 11개 항목 전후 동일 | ✓ VERIFIED | 라이브 `db query --linked`로 11개 항목 전부 독립 재조회 — SUMMARY·CONTEXT 값과 완전 일치 (아래 표) |
| 7 | **`supabase db reset`이 프로덕션을 재현한다 (Goal 원문 핵심 조건)** | ✗ FAILED | O-3. `20260619000003_recommend_hagwon_candidates_v2.sql`이 `LANGUAGE sql`로 `h.blog_tags`/`h.blog_snippet`을 SELECT하나, 그 컬럼을 만드는 DDL이 로컬 어디에도 없음(저장소 전체 grep 0건). Postgres는 SQL 함수 본문을 CREATE 시점에 파싱·컬럼 해석하므로 `db reset`은 이 지점에서 실패한다. 라이브 조회로 프로덕션엔 컬럼 2개 존재 확인 — 운영 영향은 없으나 재현성 목표는 실패 |

**Score:** 6/7 truths verified (ROADMAP 명시 6개는 전부 통과, Goal 원문에서 파생한 7번째 truth가 실패)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | O-1 `recommend_hagwons` 오버로드 2개 정리 | 별도 Phase (미배정) | 처음부터 범위 밖으로 명시(CONTEXT `<observations>`). 라이브 재확인: `pg_proc` 조회 결과 두 시그니처(`p_fee_tier text` / `p_fee_tiers text[]`) 그대로 공존, Phase 37이 손대지 않음 |
| 2 | O-2 `TO` 절 누락 정책 하드닝 | 별도 Phase (미배정) | D-03에 의해 의도적으로 범위 밖. 라이브 재확인: 복원 5건·리네이밍 3건 전부 `TO` 절 없이 원문 그대로 |

O-3는 위 두 항목과 달리 **deferred로 분류하지 않았다** — Goal 달성 여부에 직접 영향을 미치고,
원인이 이 Phase 자신의 산출물(D-04)이며, 복구 비용이 낮아 gap으로 유지한다.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/20260618085750_perf_review_avg_rpc.sql` | `get_complex_review_avg` RPC 복원 | ✓ VERIFIED | md5 일치, TO 절 개선 없음 |
| `supabase/migrations/20260618085906_rls_regional_income_area_types_ad_events.sql` | RLS 3정책 복원 | ✓ VERIFIED | md5 일치, `USING (true)` 그대로 |
| `supabase/migrations/20260618093403_fix_security_definer_search_path_v2.sql` | search_path 하드닝 4함수 | ✓ VERIFIED | md5 일치 |
| `supabase/migrations/20260625063824_cardnews_payloads_storage_policies.sql` | 스토리지 정책 3개 | ✓ VERIFIED | md5 일치, TO 절 없음 그대로 |
| `supabase/migrations/20260728074553_realtrade_story_ads_admin.sql` | site_admin_roles+RLS+버킷 | ✓ VERIFIED | md5 일치, TO 절 없음 그대로 |
| `supabase/migrations/20260618000003_fix_avg_sale_per_pyeong_formula.sql` (구 `000001`) | 리네이밍(내용 무변경) | ✓ VERIFIED | R100, diff exit 0 |
| `supabase/migrations/20260618000004_fix_prediction_model_priority.sql` (구 `000002`) | 리네이밍(내용 무변경) | ✓ VERIFIED | R100, diff exit 0 |
| `supabase/migrations/20260619000004_phase28_subject_v2.sql` (구 `000002`) | 리네이밍(내용 무변경) | ✓ VERIFIED | R100, diff exit 0, blog 컬럼 미참조 확인 |
| `supabase/migrations/20260619000002_recommend_hagwon_candidates_rpc.sql` | 이동 금지 — 원자리 유지 | ✓ VERIFIED | 파일명 그대로, `20260619000003` 미만 순서 유지 |
| `.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql` | reverted 13건 원문 백업 | ✓ VERIFIED | 13개 `-- version:` 블록 전부 존재, `20260618075929`·`20260619043107` 포함, `supabase/migrations/` 밖(`.planning/`)에 위치 — 적용 대상 아님 |
| `supabase/migrations/20260619000003_recommend_hagwon_candidates_v2.sql` | (기존 파일, 미수정) | ⚠️ HOLLOW-DEPENDENCY | 파일 자체는 무결하나, 이 파일이 참조하는 컬럼을 만드는 선행 마이그레이션이 존재하지 않아 `db reset` 체인이 끊김(O-3) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `20260618085906_rls_...` | `20260618000001_complex_area_types.sql`(현 위치 유지) | `complex_area_types` 테이블 선행 생성 | ✓ WIRED | 테이블 생성 파일이 이동하지 않고 `20260618000001`에 그대로 남아 RLS 복원 파일(`20260618085906`)보다 앞선 순서 유지 |
| `20260728074553_realtrade_...` | `20260430000007_ads.sql` | `ad_campaigns` 테이블 선행 생성 | ✓ WIRED | version 순서 확인(`20260430...` < `20260728...`) |
| `20260619000002_recommend_hagwon_candidates_rpc.sql` | `20260619000003_..._v2.sql` | rpc 파일 version < v2 version, v2가 DROP·재생성 | ✓ WIRED | rpc 파일 이동하지 않음(D-05 준수), 순서 보존 |
| `20260618000002_area_type_chart_rpc.sql`(현 위치 유지) | `20260624000003_rpc_add_exclusive_area.sql` | `complex_transactions_for_chart` 재생성 순서 | ✓ WIRED | chart rpc 파일이 이동하지 않고 `20260624000003`보다 앞 유지 |
| **`20260619000003_..._v2.sql`** | **(없음 — 끊긴 링크)** | `h.blog_tags`/`h.blog_snippet` 컬럼을 만드는 선행 마이그레이션 | ✗ NOT_WIRED | 링크의 "to" 대상 자체가 로컬에 존재하지 않음. 원장에서만 존재했던 `add_hagwon_blog_fields`(20260619043107)가 reverted되며 대응 없이 소실 — O-3 |

### Data-Flow Trace (Level 4)

해당 없음 — 이 Phase는 UI/데이터 렌더링 산출물이 없는 마이그레이션 위생 작업. `supabase/migrations/`
파일이 원장·`db reset` 체인에 실제로 연결되는지가 Level 4에 준하는 검증이며, 위 Key Link
표에서 다뤘다.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| 5개 복원 파일이 원장과 바이트 일치 | 라이브 md5 쿼리 vs `tail -n +3 \| md5sum` | 5/5 일치 | ✓ PASS |
| 리네이밍 3건이 순수 rename | `git show --stat -M dac50c4` | 3건 모두 `similarity index 100%` | ✓ PASS |
| `migration list --linked` 매칭 | CLI 실행 | Phase 완료 시점 0/0, 현재는 Phase 37과 무관한 후속 커밋(`fcebcaa`)으로 local-only 2 | ✓ PASS (Phase 37 범위 기준) |
| `db push --dry-run` 통과 | CLI 실행 | 현재 재실행 시 `upToDate:false`, `20260731000001/2` 2건 pending (Phase 37 이후 신규 파일) | ✓ PASS (Phase 37 범위 기준, 아래 "회귀 아님" 참고) |
| `db reset`이 O-3 지점에서 실패하는지 | (Docker 미가동으로 실행 불가) | 정적 분석: LANGUAGE sql 함수는 CREATE 시점에 컬럼 존재 검증 — PostgreSQL 표준 동작. 프로덕션에 컬럼 2개 실존(라이브 확인) vs 로컬 ADD COLUMN DDL 0건(grep 확인) | ✗ FAIL (근거는 확보했으나 실측 `db reset` 실행 자체는 이번 검증도 못함 — Docker 로컬 스택 미가동) |
| O-1 오버로드 미해결 상태 유지 확인 | 라이브 `pg_proc` 조회 | 2개 시그니처 공존 그대로 | ✓ PASS (의도된 미변경) |

### Probe Execution

SKIPPED — `scripts/*/tests/probe-*.sh` 관례 경로 및 PLAN/SUMMARY에 명시된 probe 스크립트 없음.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DRIFT-01 | 37-00-PLAN | 프로덕션 전용 5건 복원 | ✓ SATISFIED | 5/5 md5 일치 독립 재확인 |
| DRIFT-02 | 37-00-PLAN | 충실 재현(개선 금지) | ✓ SATISFIED | TO 절/using(true) grep 재확인, 원문 그대로 |
| DRIFT-03 | 37-01-PLAN | 원장 13건 reverted | ⚠️ SATISFIED-WITH-DEFECT | 실행은 계획대로였으나, 대응표(D-04)의 분류 오류로 `add_hagwon_blog_fields`(20260619043107)가 복원 없이 소실됨 → O-3 발생. 원문은 백업에 보존돼 즉시 복구 가능 |
| DRIFT-04 | 37-01-PLAN | 타임스탬프 중복 리네이밍 | ✓ SATISFIED | 3/3 rename, 내용 무변경, 의존 순서 보존 재확인 |
| DRIFT-05 | 37-01-PLAN | 회복 검증(list 0/0, dry-run 통과) | ✓ SATISFIED (Phase 완료 시점 기준) | Phase 37 자체 산출물 기준으로는 통과. 다만 이 검증이 파생시킨 상위 truth("db reset이 프로덕션을 재현")는 DRIFT-05가 검증하지 않는 범위였고, 바로 그 지점에서 Goal이 깨짐 — SC 설계의 구멍 |

**REQUIREMENTS.md 체크박스 상태 불일치 (anti-pattern):** `.planning/REQUIREMENTS.md` 162~166행에서
DRIFT-01·DRIFT-02만 `[x]`로 갱신됐고 DRIFT-03·04·05는 여전히 `[ ]`(미완료 표시)로 남아 있다.
SUMMARY·ROADMAP은 전부 완료로 기록했으나 REQUIREMENTS.md는 갱신되지 않았다 — 문서 위생 결함
(⚠️ WARNING, goal 판정에는 영향 없음).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (없음) | - | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER 0건 | - | 복원·리네이밍 8개 파일 + 백업 파일 전수 grep 결과 0건 |
| `.planning/REQUIREMENTS.md` | 164-166 | DRIFT-03~05 체크박스 미갱신 | ℹ️ INFO | 실제 완료 상태와 문서 불일치. 후속 Phase가 이 목록을 신뢰하면 혼란 가능 |
| `.planning/phases/37-migration-drift/37-CONTEXT.md` | D-04 표, L232 | `20260619043107`↔`20260619000003_..._v2.sql` 대응 오류 | 🛑 근본 원인 | 문자열(`blog_snippet`) grep을 DDL 존재로 오인 — O-3의 직접 원인. CONTEXT는 계획 산출물이라 이 Phase의 "파일 수정"은 아니지만, 원인 규명을 위해 기록 |

### Human Verification Required

없음 — 모든 truth가 CLI/라이브 DB 조회로 프로그래매틱하게 판정 가능했다. 단, **`db reset` 자체의
실측 실행**은 로컬 Docker 스택이 이 환경에 없어 이번 검증에서도 수행하지 못했다(정적 분석 +
PostgreSQL 표준 동작으로 결론을 대체함). 후속 작업자가 Docker 가동 가능한 환경에서
`npx supabase db reset`을 1회 실행해 O-3 수정 후 실제로 끝까지 통과하는지 최종 확인할 것을
권고한다.

## Baseline 11개 항목 — 라이브 재조회 (독립 검증)

| # | 항목 | CONTEXT/SUMMARY 기대값 | 이번 검증 라이브 재조회값 | 일치 |
|---|---|---|---|---|
| 1 | `site_admin_roles` 행수/정책 | 1/1 | 1/1 | ✅ |
| 2 | `get_complex_review_avg` 존재 | 1 | 1 | ✅ |
| 3 | `regional_income` RLS/정책 | true/1 | true/1 | ✅ |
| 4 | `cardnews-payloads` 정책 수 | 3 | 3 | ✅ |
| 5 | `check_gps_proximity` search_path | `search_path=""` | `{"search_path=\"\""}` | ✅ |
| 6 | `recommend_hagwon_candidates` 개수/args | 1/7 | 1/7 | ✅ |
| 7 | `ad_events` 정책 roles/with_check | `{authenticated}`/`(auth.uid() IS NOT NULL)` | 동일 | ✅ |
| 8 | `complexes` 행수 | 4285 | 4285 | ✅ |
| 9 | `hagwon_db` 행수 | 4601 | 4601 | ✅ |
| 10 | `complex_area_types` 행수 | 3472 | 3472 | ✅ |
| 11 | 창부레터 5테이블 RLS/정책/행수 | 전부 true/합계7/각0행 | 전부 true/합계7(2+2+1+1+1)/각0행(미조회, SUMMARY 신뢰) | ✅ |

불일치 0건 — 스키마 변경 0건 재확인.

## 회귀 아님 — Phase 37 이후 신규 pending 마이그레이션 2건

`npx supabase migration list --linked`를 지금 재실행하면 `20260731000001`,
`20260731000002`가 local-only로 나타난다. 이는 커밋 `fcebcaa`(`perf(transactions): add
(complex_id, price) index + historical-max RPC`)로 Phase 37 완료(2026-07-30) **이후**에
추가된 별개 작업이며, `git log`상 Phase 37의 커밋들(`4e70a7e`~`dac50c4`, `bc06c16`) 뒤에 위치한다.
Phase 37이 종료된 시점의 `migration list`/`db push --dry-run`은 SUMMARY가 캡처한 대로 0/0·
`upToDate:true`였음을 커밋 이력으로 재확인했다. 이 2건은 정상적인 다음 개발 사이클의 push
대기 상태이며 drift가 아니다(local-only이지 remote-only가 아님).

## O-3에 대한 명확한 판정과 Phase Goal에 미치는 영향

**판정: O-3는 실재하는 결함이며, `db reset이 프로덕션을 재현한다`는 Goal 절을 직접 무너뜨린다.**

- **재현 경로**: `20260619000003_recommend_hagwon_candidates_v2.sql`(`LANGUAGE sql`)이
  `h.blog_tags`(27,44행)·`h.blog_snippet`(28,45행)을 SELECT. PostgreSQL은 SQL 언어 함수의
  본문을 `CREATE FUNCTION` 시점에 파싱하고 참조 컬럼의 존재를 검증한다(`check_function_bodies`
  기본값 `on`). 해당 컬럼을 만드는 `ALTER TABLE ... ADD COLUMN` 이 로컬 마이그레이션 어디에도
  없다(저장소 전체 grep 0건, `hagwon_db` `CREATE TABLE` 정의에도 없음 — 독립 재확인 완료).
  → `db reset`은 이 파일에서 실패한다.
- **원인**: `37-CONTEXT.md` D-04 표가 원장 `20260619043107 add_hagwon_blog_fields`(실제
  `ALTER TABLE ... ADD COLUMN`)를 로컬 `20260619000003_..._v2.sql`(실제로는 그 컬럼을
  **읽기만** 함)에 "중복"으로 대응시켰다. 문자열 `blog_snippet`이 grep된 것을 DDL 존재로
  오인한 얕은 검증의 결과다. 이 오분류 때문에 Wave 1이 유일 원본을 복원 없이 `reverted`
  처리했다.
- **운영 영향**: 없음. 프로덕션 스키마는 정상(라이브 조회로 컬럼 2개 존재 재확인). 이 phase가
  스키마를 건드리지 않았으므로 현재 서비스는 영향받지 않는다.
- **재현성 영향**: 있음. `supabase db reset`으로 새 환경을 구축하거나 로컬 개발 DB를 초기화하는
  모든 워크플로가 이 지점에서 깨진다 — 이것이 Phase 36에서 시작해 Phase 37이 고치려던 바로 그
  문제의 축소판이다.
- **복구 가능성**: 높음. `.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql`의
  `20260619043107` 블록(346행 부근, 305자)에 DDL 원문이 그대로 보존돼 있다. 파일 1개를
  `20260619000003`(현재 v2 슬롯) **앞** 슬롯에 복원하고 `repair --status applied` 1회만
  실행하면 해결된다. 스키마 변경도 없다(로컬 파일 추가 + 원장 기록뿐).

### O-3 수정 방안 실행 가능성 — 검증됨 (실행은 하지 않음)

오케스트레이터가 제안한 순서(`000001 hagwon_system → 000002 rpc → 000003 add_blog_fields →
000004 subject_v2 → 000005 v2`)를 정적 분석으로 재검증했다:

- `20260619000002_recommend_hagwon_candidates_rpc.sql` — `blog_tags`/`blog_snippet` grep
  **0건** (exit 1). `add_blog_fields`가 이 파일보다 뒤에 와도 무방
- `20260619000004_phase28_subject_v2.sql` — `blog_tags`/`blog_snippet` grep **0건** (exit 1).
  `subject_category`·`fee_tier_pref`·`recommend_hagwons` 재정의만 다루며 `hagwon_db`의 blog
  컬럼과 무관 — `add_blog_fields`보다 앞이든 뒤든 상관없음
- `20260619000003_..._v2.sql`(신 슬롯 `000005`로 이동 예정) — blog 컬럼을 **사용하므로**
  `add_blog_fields`보다 반드시 뒤여야 함 → 제안된 `000003 < 000005` 순서가 이를 충족
- 그 외 놓친 의존: 없음. `add_blog_fields`가 만드는 것은 컬럼 2개(+ `COMMENT ON COLUMN` 2건)뿐이라
  다른 마이그레이션의 선행 조건이 되지 않는다

**결론: 제안된 순서는 성립한다.** 다만 이는 별도 실행 대상이며, 이번 검증에서는 실행하지 않았다
(읽기 전용 검증 원칙 준수).

## Scope Fence 10항목 판정

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 1 | 스키마 변경 금지(DDL 0건) | ✓ 준수 | baseline 11/11 무변경(라이브 재확인), commit 히스토리에 `execute_sql` DDL 흔적 없음(SUMMARY의 select 전용 기록과 일치) |
| 2 | 복원 SQL 수정 금지 | ✓ 준수 | 5/5 md5 완전 일치(독립 재계산) |
| 3 | `20260430000009_rls.sql` 수정 금지 | ✓ 준수 | 최초 커밋(9242830) 이후 이 파일을 건드린 커밋 없음 |
| 4 | DRIFT-03을 DRIFT-01보다 먼저 하지 않기 | ✓ 준수 | 커밋 순서 `4e70a7e`(DRIFT-01/02) → `4821f52`/`dac50c4`(DRIFT-03~05) 확인 |
| 5 | `_recommend_hagwon_candidates_rpc.sql` 이동 금지 | ✓ 준수 | 파일명 `20260619000002_recommend_hagwon_candidates_rpc.sql` 그대로 존재 |
| 6 | `recommend_hagwons` 오버로드 정리 금지 | ✓ 준수 | 라이브 조회 — 오버로드 2개 그대로 공존 |
| 7 | `TO` 절 하드닝 금지 | ✓ 준수 | 복원 5건 전부 `TO` 절 없음 그대로(grep 재확인) |
| 8 | `src/**` 무접촉 | ✓ 준수 | `git status --porcelain src/` 빈 출력, phase 커밋 4건 전부 `supabase/migrations/`·`.planning/`만 포함 |
| 9 | `db:push`를 dry-run 없이 실행 금지 | ✓ 준수 (근거는 SUMMARY 서술에 의존) | 이번 검증에서 실행한 push도 `--dry-run`만. 커밋 로그·SUMMARY상 실제 적용 실행 흔적 없음 |
| 10 | 창부레터 0-4~0-7 무접촉 | ✓ 준수 | phase 커밋에 해당 파일 변경 없음 |

## Gaps Summary

ROADMAP에 명시된 6개 Success Criteria와 DRIFT-01·02·04는 결함 없이 완료됐다. DRIFT-03·05도
계획된 절차대로 실행됐다. 그러나 **Goal 원문의 "db reset이 프로덕션을 재현한다"는 절**은
`20260619043107`(`add_hagwon_blog_fields`)의 잘못된 중복 분류(D-04 표 오류)로 인해 달성되지
않았다. 이는 O-1·O-2처럼 처음부터 범위 밖으로 정의된 관찰이 아니라, 이 Phase 스스로가 만든
결함이며, Success Criteria 설계 자체가 "`db reset` 실측"을 요구하지 않았다는 구조적 허점이
이를 놓치게 했다. 복구는 저비용(백업에서 파일 1개 복원 + repair 1회)이므로 **후속 Phase
전체를 새로 여는 대신, 이 Phase의 마무리 gap으로 즉시 닫는 것을 권고**한다.

---

_Verified: 2026-07-31_
_Verifier: Claude (gsd-verifier)_
