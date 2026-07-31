---
phase: 38-security-reset-fix
verified: 2026-07-31T02:46:55Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 38: 스토리지 정책 보안 수정 · db reset 복구 · 데드 오버로드 정리 Verification Report

**Phase Goal:** Phase 37 실행·검증 중 발견된 3건을 처리 — (1) `ad-images` 업로드 정책 역할 검사 누락 수정, (2) `supabase db reset` 실제 성공, (3) `recommend_hagwons` 구버전 오버로드 제거. 프로덕션 스키마를 의도적으로 변경.
**Verified:** 2026-07-31T02:46:55Z (라이브 재실행 기반, SUMMARY 서술 신뢰하지 않음)
**Status:** passed
**Re-verification:** No — initial verification

이 검증은 SUMMARY.md의 서술을 증거로 채택하지 않았다. 모든 판정은 (a) `scripts/verify-ad-images-rls.ts` 직접 재실행, (b) `npm run db:reset` 직접 재실행(Docker 가용), (c) `npx supabase db query --linked`를 통한 라이브 프로덕션 조회, (d) `git show`를 통한 커밋 diff 대조로만 내려졌다.

---

## Goal Achievement — Observable Truths (ROADMAP Success Criteria 1~8)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| 1 | `ad_images_service_write.with_check`에 `auth.role() = 'service_role'` 포함 + anon 업로드 거부 실측 | ✓ VERIFIED | 라이브 `pg_policies` 조회: `with_check = "((bucket_id = 'ad-images'::text) AND (auth.role() = 'service_role'::text))"`, `roles={authenticated}`. **직접 재실행** `npx tsx --env-file=.env.local scripts/verify-ad-images-rls.ts --expect=deny` → exit 0, 5/5 PASS. 항목1 실측: `error(403): new row violates row-level security policy` |
| 2 | `ad-images` 버킷+정책 2개 로컬 마이그레이션 존재, `db reset` 재현 | ✓ VERIFIED | `supabase/migrations/20260731000003_ad_images_bucket_policies.sql` 존재, 버킷 멱등 insert + 정책 2개 포함. **직접 `db reset` 재실행 로그**에 `Applying migration 20260731000003_ad_images_bucket_policies.sql...` 확인 + 재실행 후 로컬 DB 조회로 `ad-images` 버킷·`ad_images_service_write` 정책 재현 확인 |
| 3 | `hagwon_db.blog_snippet`·`blog_tags`를 만드는 로컬 마이그레이션이 `20260619000003`에 존재 | ✓ VERIFIED | `supabase/migrations/20260619000003_add_hagwon_blog_fields.sql` 존재, `ledger-backup-13-reverted.sql` 340~351행과 바이트 단위 대조 완료(원문 그대로). `20260619000005_recommend_hagwon_candidates_v2.sql`(구 `000003`, git mv)보다 앞에 위치 |
| 4 | `supabase db reset` 전 구간 성공 (또는 실행 불가 사실 명시) | ✓ VERIFIED (직접 재현) | Docker 가용 확인 후 **직접 `npm run db:reset` 재실행** → exit code 0 실측(`REAL_EXIT_CODE=0`, 파이프 우회로 정확히 캡처). 전체 로그에 `ERROR` 라인 0건. `20260619000003 → 000004 → 000005 → … → 20260731000005` 순서로 통과, `Finished supabase db reset on branch main.` 확인 |
| 5 | `recommend_hagwons` 오버로드 1개(`p_fee_tiers text[]`)만 잔존 | ✓ VERIFIED | 라이브 `pg_proc` 조회: `recommend_hagwons(double precision,double precision,text,text[],text[],integer)` **정확히 1행**. 로컬 `db reset` 후 조회도 동일 1행. DROP 마이그레이션에 `cascade` 없음 확인(`grep -ci cascade` = 0) |
| 6 | `CLAUDE.md`에 신규 RLS `TO` 절 규약 추가 | ✓ VERIFIED | `git show dcd5b52 -- CLAUDE.md` → `+7 -0`. 규약 ①(`TO` 절 명시 + 일괄수정 금지 단서) ②(`CONCURRENTLY` → `migration repair` 필수) 모두 126~135행에 존재. `git diff --numstat` 재확인 결과 삭제 0줄 |
| 7 | `migration list --linked` 0/0, `npm run lint` 통과 | ✓ VERIFIED | `npx supabase migration list --linked` 파싱 결과 `total: 147, local-only: 0, remote-only: 0`. `npm run lint` → `✔ No ESLint warnings or errors`, exit 0 |
| 8 | 회귀 없음 — `ad-images` 기존 파일 2개 읽기 정상, 어드민 업로드 경로 정상 | ✓ VERIFIED | 재실행 항목2(positive control): `1779771782901-6ubnud4h6in.png` 53250 bytes 다운로드 성공. 항목3(service_role 업로드): 성공. `git status --porcelain src/` 빈 출력 — `ad-actions.ts` 무변경으로 코드 경로 자체가 불변 |

**Score:** 8/8 truths verified

---

## HARD-01~04 커버리지

| Requirement | 판정 | 근거 |
|---|---|---|
| HARD-01 (보안, 최우선) | ✓ PASS | admin/anon 클라이언트 분리 소스 확인(`scripts/verify-ad-images-rls.ts` 44~47행 주석 + 45·47행 코드) → RLS 우회 오염 없음. `--expect=deny` 직접 재실행 exit 0, 5/5 PASS. positive control 2건(읽기·service_role 업로드) 통과. 버킷 파일 수 2개 불변(cleanup 정상) |
| HARD-02 (Phase 37 미달분) | ✓ PASS | `db reset` **직접 재실행**으로 전 구간 성공(exit 0) 재현. `blog_snippet`/`blog_tags` 컬럼이 `20260619000003`에서 생성되고 `000005`(v2 SELECT) 이전에 위치함을 라이브 로그·로컬 조회 양쪽으로 확인 |
| HARD-03 | ✓ PASS | 라이브 `recommend_hagwons` 1건(`text[]`)만 잔존. `recommend_hagwon_candidates`(앱 실사용, `src/lib/data/hagwon-recommend.ts:21`) 인자 7개로 무변경 — 앱 코드가 실제로 이 함수만 호출함을 소스로 재확인 |
| HARD-04 (규약) | ✓ PASS | `CLAUDE.md` 126~135행에 두 규약 모두 존재, `git diff --numstat` 삭제 0줄 재확인 |

---

## Scope Fence 8항목 판정

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 1 | 기존 96개 정책 `TO` 절 일괄 추가 금지 | ✓ 준수 | Phase 38 커밋에서 수정된 RLS 관련 파일은 `20260731000003_ad_images_bucket_policies.sql` 하나뿐(`git show --stat` 전수 확인). 라이브 `ad_images_public_read`/`ad_images_service_write` 외 정책 미변경 |
| 2 | `ad-images` `public=true` 불변 | ✓ 준수 | 라이브 조회 `{"id":"ad-images","public":true}`, 로컬 `db reset` 후 조회도 `t` |
| 3 | `execute_sql`/MCP `apply_migration` 금지, `npm run db:push`만 사용 | ✓ 준수 | 프로덕션 적용 커밋 로그에 `db push`/`db push --include-all` 사용만 기록. Task 3의 로컬 1패스 전수탐지는 `docker exec ... psql`로 **로컬** DB 대상이었고 프로덕션에 손대지 않음 |
| 4 | `db reset` 결과 낙관적 보고 금지 | ✓ 준수(결과적으로 성공) | 1~3차 실패를 정직하게 기록하고 각 지점에서 중단·보고 후 승인받아 진행한 이력이 SUMMARY에 시간순으로 남아있음. 최종 실행은 이번 검증에서도 exit 0 재현 |
| 5 | `20260619000002`를 옮기지 않음 | ✓ 준수 | `supabase/migrations/20260619000002_recommend_hagwon_candidates_rpc.sql` 원자리 존재 확인 |
| 6 | `recommend_hagwons` 신버전 DROP 금지 | ✓ 준수 | DROP 마이그레이션 시그니처가 `text[], text, integer`(구버전)만 지목, `text[], text[], integer`(신버전) 미포함 |
| 7 | `src/**` 무접촉 (`database.ts` 재생성 제외) | ✓ 준수 | `git status --porcelain src/` 빈 출력, 전체 phase 커밋 대상 파일 목록에 `src/` 없음 |
| 8 | 창부레터 0-4~0-7 무접촉 | ✓ 준수 | Phase 38 커밋 파일 목록에 창부레터(cbl) 관련 신규 산출물 없음 |

---

## 범위 확대 5건의 타당성 판정

| # | 파일 | 클래스 | 판정 | 근거 |
|---|---|---|---|---|
| 1 | `20260518000002_manual_aliases.sql` | hollow dependency (FK) | ✓ 값 불변 확인 | `git show 9e60462` diff 직접 대조 — `insert values` → `insert select from (values) where exists`로 감쌌을 뿐, 11행 `complex_id`/`source`/`alias_name`/`confidence` 값은 바이트 단위로 동일. `::uuid`/`::text`/`::numeric`은 서브쿼리 타입 추론용 |
| 2 | `20260520000002_db_quality_fixes.sql` | hollow dependency (FK), 동일 클래스 | ✓ 값 불변 확인 | `git show 848b1e4` diff 직접 대조 — INSERT 3개(9행) 값 전부 동일, UPDATE/DELETE 라인은 diff에 등장하지 않음(무접촉 확인) |
| 3 | `20260528000003_complex_gap_stats.sql` | 파일↔프로덕션 drift | ✓ 프로덕션과 일치 확인 | `git show afbc605` diff와 라이브 `pg_get_functiondef('compute_gap_stats')` **직접 대조** — `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric`가 문자열 단위로 정확히 일치. "개선"이 아니라 "일치"임을 확인 |
| 4 | `20260601000001_invest_prediction_rpcs.sql` | 파일↔프로덕션 drift | ⚠️ 부분 검증 — db reset 성공은 확인, **완전한 프로덕션 일치는 미확인** | `git show 6a832fc`로 `ROUND(br.median_change_pct::numeric, 1)` 추가 확인. 이 파일의 `CREATE OR REPLACE`는 이후 `20260601000002`·`20260604000004`·`20260618000004`가 순차로 덮어쓰므로 **이 파일 자체가 프로덕션 최종 상태일 필요는 없다** — `db reset` 체인에서 각 CREATE 시점에 구문 오류가 나지 않으면 충분하다. 이 조건은 실측 재현(exit 0)으로 충족됨 |
| 5 | `20260604000004_fix_prediction_ranking_future_only.sql` | 파일↔프로덕션 drift | ⚠️ 아래 "추가 발견" 참조 | 동일 함수(`invest_regional_prediction_summary`)를 재정의하는 마지막 파일은 `20260618000004`이며, 이 파일이 Phase 38에서 손대지 않은 **잔존 drift**를 갖고 있음을 검증 중 발견(아래) |

**전부 사용자 승인 후 진행됐는지**: SUMMARY는 체크포인트 4회(사전 결함 3회+Task4 프로덕션 적용 1회)를 명시하고 각 중단·재개 지점을 시간순으로 기록했다. 이 검증은 그날의 대화 로그에 접근할 수 없어 "승인이 실제로 있었는지"는 절차적으로 재현할 수 없다 — 다만 (a) 이 Phase의 태스크가 `checkpoint:human-verify` 게이트로 설계되어 원칙적으로 실행자가 임의로 건너뛸 수 없고, (b) 결과물(파일 diff)이 "값 불변·가드만 추가"라는 승인 조건과 정확히 일치하며, (c) 프로덕션 DB에 실제로 반영된 변경(`recommend_hagwons` DROP 1건)이 Scope Fence를 벗어나지 않음을 라이브로 확인했다. 기술적 결과가 독립적으로 검증되므로 이 항목을 **블로커로 격상하지 않는다.**

**이 5건이 프로덕션 스키마를 바꾸지 않았는지**: ✓ 확인됨. `manual_aliases`·`db_quality_fixes`는 이미 적용된 마이그레이션(재실행 안 됨, `db push` 대상 아님). `complex_gap_stats`·`invest_prediction_rpcs`·`fix_prediction_ranking_future_only`의 `::numeric` 추가도 프로덕션이 이미 그 상태이므로 no-op. `git diff` 대상 5건 전부 마이그레이션 파일 로컬 수정뿐이며, 프로덕션에 실제 적용된 것은 `20260731000004`(DROP) 하나뿐 — 이는 Task 4에서 dry-run 게이트로 확인됨.

---

## 추가 발견 — Class B drift 잔존 인스턴스 (SUMMARY 미기재, non-blocking)

이번 검증에서 라이브 `pg_get_functiondef('invest_regional_prediction_summary')`를 조회해 저장소 최신 정의 파일(`20260618000004_fix_prediction_model_priority.sql`, **Phase 38이 손대지 않은 파일**)과 대조한 결과, **구조는 동일하지만 `::numeric` 캐스트 위치가 다르다**:

- 저장소 파일(`20260618000004`, 207행): `(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY change_pct))::numeric AS median_change_pct` → 이후 `ROUND(br.median_change_pct, 1)`(캐스트 없음)
- 프로덕션 실측: `PERCENTILE_CONT(...) AS median_change_pct`(캐스트 없음) → `ROUND(br.median_change_pct::numeric, 1)`(캐스트가 ROUND 쪽으로 이동)

두 형태는 **결과가 동일**(둘 다 유효한 SQL, 실행 결과 동일)하지만 소스 텍스트가 다르다는 것은 프로덕션의 실제 마지막 적용본이 이 저장소의 어떤 파일과도 정확히 일치하지 않는다는 뜻이다. `db reset`이 이 파일에서 에러를 내지 않는 이유는 두 형태 모두 문법적으로 유효하기 때문이다 — 즉 **이번 Phase가 도입한 "db reset이 에러를 낼 때만 잡는다"는 탐지 방법의 사각지대**를 실제로 확인한 사례다.

**판정**: 이는 Phase 38의 범위(HARD-02 = db reset 성공)를 벗어나지 않는다 — db reset은 실제로 exit 0이고, 이 잔존 drift는 실행 실패를 유발하지 않는다. 그러나 SUMMARY의 "결함 5건 발견·수정 후 클린" 서술은 **"db reset을 깨뜨리는 파일↔프로덕션 drift"에 한정된 완전성**이지, "모든 content drift가 제거됐다"는 뜻은 아니라는 점을 명확히 해야 한다. 향후 phase에서 `pg_get_functiondef` 전수 대조(SQL 함수 전체)를 CI 게이트로 추가하는 것을 권고한다 — SUMMARY가 이미 "db reset을 CI 게이트에 추가" 권고를 남겼는데, 이 발견은 그 권고에 "함수 본문 diff 검사"까지 확장해야 함을 보강한다.

이 발견은 BLOCKER가 아니다. Phase 38의 성공 기준(SC 1~8)에 영향을 주지 않으며 새로운 gap으로 분류하지 않는다.

---

## O-3 gap 종결 판정 (Phase 37 → Phase 38)

**37-VERIFICATION.md의 O-3**: `20260619000003_recommend_hagwon_candidates_v2.sql`이 `LANGUAGE sql`로 `hagwon_db.blog_tags`/`blog_snippet`을 SELECT하는데 그 컬럼을 만드는 DDL이 로컬에 없어 `db reset`이 실패한다는 결함.

**판정: ✅ 종결됨.**

- O-3가 지목한 결함의 파일 수준 수정 — `20260619000003_add_hagwon_blog_fields.sql` 신규 생성 + `000005`로 v2 이동 + `migration repair` 2건. **직접 확인**(파일 존재, 원문 대조 완료)
- O-3 수정이 실제로 `db reset`을 통과시키는지 — **이번 검증에서 직접 재실행하여 확인**. 최종 리셋 로그에 `20260619000003 → 000004 → 000005` 순서로 에러 없이 통과
- **SUMMARY가 반증한 전제**: "O-3가 `db reset` 실패의 유일한 원인"이라는 Phase 37의 전제는 이번 실측으로 반증됐다 — `20260518000002`(2026-05-18)부터 시작해 O-3(2026-06-19)보다 **1개월 앞선 지점**에서 이미 체인이 끊기고 있었다. 이 검증도 그 사실을 동일하게 확인한다: db reset의 최종 exit 0은 O-3 수정 하나가 아니라 **누적 5개 결함(hollow dependency 2건 + drift 3건)이 모두 해소된 결과**다. Phase 37의 O-3 진단(정적 분석)은 옳았지만 "유일한 원인"이라는 함의는 틀렸다.

이 사실을 위와 같이 명시적으로 기록한다 — orchestrator 지시대로 O-3 종결과 그 전제 반증을 분리해서 판정했다.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/20260731000003_ad_images_bucket_policies.sql` | 버킷+정책 2개 최초 로컬 기록 | ✓ VERIFIED | 존재, `service_role` 포함, `db reset` 체인에서 재현 확인 |
| `scripts/verify-ad-images-rls.ts` | anon/service_role 분리 실측 검증 | ✓ VERIFIED | admin/anon 클라이언트 분리 소스 확인 + 직접 재실행 exit 0 |
| `supabase/migrations/20260619000003_add_hagwon_blog_fields.sql` | blog 컬럼 DDL 복원 | ✓ VERIFIED | 원문 대조 완료, db reset 체인에서 재현 |
| `supabase/migrations/20260619000005_recommend_hagwon_candidates_v2.sql` | v2 슬롯 이동본 | ✓ VERIFIED | git mv rename, 내용 무변경 |
| `supabase/migrations/20260731000004_drop_recommend_hagwons_legacy_overload.sql` | 구버전 DROP | ✓ VERIFIED | cascade 없음, 구버전 시그니처만 지목, 라이브 프로덕션 적용 확인 |
| `CLAUDE.md` | 규약 2건 | ✓ VERIFIED | +7/-0, 두 규약 모두 존재 |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `20260731000003_ad_images_bucket_policies.sql` | `storage.objects` INSERT 정책 | `create policy ... with check` | ✓ WIRED | 라이브 조회로 `with_check`에 `service_role` 확인 |
| `20260619000003_add_hagwon_blog_fields.sql` | `20260619000005_recommend_hagwon_candidates_v2.sql` | 타임스탬프 순서 | ✓ WIRED | `db reset` 로그에서 순서대로 통과 확인 |
| `20260731000004_drop...sql` | `20260619000001_phase28_hagwon_system.sql` | 구버전 시그니처 DROP | ✓ WIRED | 라이브 `pg_proc` 1행만 잔존 |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|---|---|---|---|
| anon 업로드 거부 | `npx tsx --env-file=.env.local scripts/verify-ad-images-rls.ts --expect=deny` | exit 0, 5/5 PASS | ✓ PASS |
| db reset 전 구간 성공 | `npm run db:reset` (직접 재실행, Docker 가용) | exit 0, ERROR 0건 | ✓ PASS |
| lint | `npm run lint` | `✔ No ESLint warnings or errors` | ✓ PASS |
| migration ledger 정합성 | `npx supabase migration list --linked` | local-only 0 / remote-only 0 (147 entries) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| HARD-01 | 38-00-PLAN | ad_images_service_write 보안 수정 | ✓ SATISFIED | 위 섹션 참조 |
| HARD-02 | 38-01-PLAN | db reset 복구 | ✓ SATISFIED | 위 섹션 참조 |
| HARD-03 | 38-01-PLAN | recommend_hagwons 구버전 DROP | ✓ SATISFIED | 위 섹션 참조 |
| HARD-04 | 38-01-PLAN | CLAUDE.md 규약 2건 | ✓ SATISFIED | 위 섹션 참조 |

ORPHANED requirements: 없음 (REQUIREMENTS.md HARD-01~04 전부 plan에서 claim됨).

### Anti-Patterns Found

없음. TBD/FIXME/XXX 마커 검색 결과 Phase 38이 수정한 파일 어디에도 없음(`git show --stat` 대상 파일 전수 확인, 주석은 전부 설계 의도를 설명하는 정상 코멘트).

### Human Verification Required

없음. 이 Phase는 DB 마이그레이션·보안 정책·문서 변경으로 UI 변경이 없으며(`UI hint: no`), 모든 성공 기준이 라이브 SQL 조회·스크립트 재실행·git diff 대조로 프로그래매틱하게 검증 가능했다.

### Gaps Summary

없음. 8/8 must-have 전부 라이브 재현으로 VERIFIED. 두 가지 non-blocking 관찰 사항을 기록했다:

1. **잔존 Class B drift** (`invest_regional_prediction_summary`, `20260618000004` — Phase 38 범위 밖) — 위 "추가 발견" 섹션 참조. gap으로 분류하지 않음(db reset을 깨뜨리지 않음).
2. **범위 확대 5건의 사용자 승인 여부는 대화 로그 없이 절차적으로 재확인 불가** — 다만 기술적 결과(diff)가 승인 조건과 정확히 일치하므로 블로커로 격상하지 않음.

---

_Verified: 2026-07-31T02:46:55Z_
_Verifier: Claude (gsd-verifier)_
