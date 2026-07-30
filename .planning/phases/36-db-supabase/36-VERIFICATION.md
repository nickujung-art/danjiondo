---
phase: 36-db-supabase
verified: 2026-07-30T16:45:00Z
status: passed
score: 7/7 must-haves verified (CBL-01~07)
overrides_applied: 0
deferred:
  - truth: "저장소에 없는 프로덕션 스키마 6건 복원 (site_admin_roles, search_path 하드닝 v2, get_complex_review_avg, cardnews-payloads 정책, regional_income RLS, phase28_route_rpc)"
    addressed_in: "후속 Phase (미배정)"
    evidence: "36-00-SUMMARY.md '🔴 후속 작업' 섹션 — Phase 36 범위 밖으로 명시적으로 이월됨"
  - truth: "로컬 마이그레이션 타임스탬프 중복 3쌍 리네이밍 (20260618000001/2, 20260619000002)"
    addressed_in: "후속 Phase (미배정)"
    evidence: "36-00-SUMMARY.md '🟡 후속 작업' 섹션"
  - truth: "ad_events TO 절 누락 버그 수정 (로컬 파일만 버그 버전, 프로덕션은 이미 {authenticated}로 수정됨)"
    addressed_in: "별건 (36-CONTEXT.md deferred 목록)"
    evidence: "36-CONTEXT.md <deferred> '20260430000009_rls.sql:151-153 TO 절 누락 버그 수정 (별건)' + 36-02-SUMMARY.md 라이브 실측으로 이미 수정 상태 확인"
  - truth: "0-4(카드뉴스 DB 저장)·0-5(rank_type 배치)·0-6(카드 템플릿 리브랜딩)·0-7(배치 소유권 이전)"
    addressed_in: "후속 Phase (0-6은 사용자 결정 대기)"
    evidence: "36-CONTEXT.md <deferred> 표 — Phase 경계 밖으로 명시적으로 설계됨"
---

# Phase 36: 창부레터 DB 기반 구축 — 공유 Supabase 콘텐츠 스키마 Verification Report

**Phase Goal:** 창부레터(별도 저장소)가 실데이터로 개발을 시작할 수 있도록, 공유 Supabase
프로젝트(`auoravdadyzvuoxunogh`)에 콘텐츠 스키마 5개 테이블 + RLS를 추가하고
`site_id`·`profiles.role` CHECK 제약을 확장한다. 설계는 ADR에서 확정됐으므로 즉석 설계
없이 DDL을 그대로 적용한다.

**Verified:** 2026-07-30
**Status:** passed
**Re-verification:** No — initial verification

**검증 방법**: 이 보고서의 모든 판정은 SUMMARY.md 텍스트가 아니라 `npx supabase db query
--linked`로 라이브 프로덕션 DB(`auoravdadyzvuoxunogh`)를 직접 조회하고,
`npx tsx --env-file=.env.local scripts/verify-cbl-rls.ts`를 이 세션에서 독립적으로
재실행한 결과다. Supabase MCP `execute_sql` 도구가 이 세션에는 노출되지 않아 동등한
읽기 전용 경로인 Supabase CLI `db query --linked`(Management API 경유)로 대체했다 —
동일하게 라이브 프로덕션에 대한 실측이며, 스키마 변경은 수행하지 않았다(전부 `select`).

---

## Goal Achievement

### Observable Truths (CBL-01~07)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `site_id='changbuletter'`가 `favorites`·`ad_campaigns`에서 CHECK 통과, 기존 행 무변화 (CBL-01) | ✓ VERIFIED | 라이브 `pg_constraint`: `favorites_site_id_check` / `ad_campaigns_site_id_check` 둘 다 `CHECK ((site_id = ANY (ARRAY['danjiondo','realtrade-story','changbuletter'])))`. 행수: `favorites` site_id=`realtrade-story` 4건, `ad_campaigns` site_id=`danjiondo` 9건 — SUMMARY 기록값(4→4, 9→9)과 일치, `changbuletter` 행은 아직 0건(정상 — 창부레터 미착수) |
| 2 | `role='cbl_editor'`가 `profiles`에서 CHECK 통과, `cbl_editor`는 `/admin/*` 진입 불가 (CBL-02) | ✓ VERIFIED | 라이브 `pg_constraint`: `profiles_role_check` = `CHECK ((role = ANY (ARRAY['user','admin','superadmin','advertiser','cbl_editor'])))`. `profiles` role별 행수 5건(admin 1/superadmin 1/user 3, `cbl_editor` 0건 — 아직 미부여, 정상). `src/app/admin/layout.tsx`는 Phase 36 기간(2026-07-30) 커밋 이력에 전혀 등장하지 않음(`git log --oneline -- src/app/admin/layout.tsx` 최신 커밋이 `b1a2d42`, 07-30 이전) |
| 3 | 신규 테이블 5개 + 인덱스 4개가 D-03 DDL과 컬럼·제약·기본값 일치 (CBL-03·04·05) | ✓ VERIFIED | 컬럼 수 라이브 실측 `contents=21 / content_complexes=2 / content_votes=4 / content_bookmarks=3 / subscribers=9` — 전부 D-03과 일치. 기본값(`site_id='changbuletter'`, `status='draft'`/`'pending'`, `is_featured=false`, `region_tags='{}'::text[]`, `confirm_token=encode(gen_random_bytes(24),'hex'::text)`) 전부 확인. CHECK 4건(`type`/`status`/`subscribers.status`/`choice`) 전부 확인. FK 6건 전부 `ON DELETE CASCADE`. 인덱스 4개 `indexdef` 확인 — `contents_feed_idx`/`contents_category_idx` 부분 인덱스(`WHERE status='published'`), `contents_region_tags_idx` `USING gin`, `subscribers_send_idx` 부분 인덱스(`WHERE status='confirmed'`) |
| 4 | `anon`으로 draft·scheduled·미래published `contents` 조회 0행, `subscribers` SELECT 거부, `subscribers` INSERT는 pending만 성공 (CBL-06·07) | ✓ VERIFIED | 라이브 `pg_policies` 7행 확인 — `roles={public}`인 행 0건, `subscribers`에 `cmd='SELECT'` 정책 0건, `contents: public read published`의 `qual`이 `(status='published') AND (published_at<=now())`(`true` 아님). `scripts/verify-cbl-rls.ts`를 이 세션에서 독립 재실행 → **exit 0, 10/10 PASS**(아래 "검증 스크립트 실효성" 참조) |
| 5 | `npm run lint` 통과, `src/types/database.ts` 갱신 포함 | ✓ VERIFIED | `npm run lint` 이 세션에서 재실행 → `✔ No ESLint warnings or errors`, exit 0. `src/types/database.ts`에 `contents:`(974행)·`content_complexes:`(915행)·`content_votes:`(945행)·`content_bookmarks:`(889행)·`subscribers:`(2662행) 전부 존재 확인 |
| 6 | 기존 테스트 스위트 통과 — danjiondo·realtrade-story 회귀 없음 | ✓ VERIFIED (예외 적용) | `npm run test` 이 세션 재실행 → **17 파일 / 35 테스트 실패, 492 통과**. `<known_context>` 항목 1과 정확히 일치하는 카운트 — Wave 1이 `git stash`로 타입 변경만 되돌려 동일 결과(5 failed/5 passed 서브셋)를 실증한 사전 존재 실패군이며, 라이브 Supabase DB 통합 테스트(신규 5개 테이블 미참조)다. Phase 36의 회귀가 아님(사용자 지시에 따라 회귀로 판정하지 않음) |
| 7 | Scope Fence 준수 — 애플리케이션 코드 무변경(타입 예외), `admin/layout.tsx`·`card-news/`·`complex_rankings` 무접촉, 마이그레이션에 데이터 조작·grant/revoke·CONCURRENTLY 없음 | ✓ VERIFIED | 아래 "Scope Fence 판정" 표 참조 |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260730000001_cbl_site_id_role_check.sql` | CHECK 3건 확장 | ✓ VERIFIED | 파일 존재, 라이브 반영 확인(위 truth 1·2) |
| `supabase/migrations/20260730000002_cbl_content_schema.sql` | 테이블 5개 + 인덱스 4개 | ✓ VERIFIED | 파일 존재, 라이브 반영 확인(위 truth 3) |
| `supabase/migrations/20260730000003_cbl_content_rls.sql` | RLS 정책 7개 | ✓ VERIFIED | 파일 존재, 라이브 반영 확인(위 truth 4) |
| `scripts/verify-cbl-rls.ts` | anon 실측 검증 스크립트 | ✓ VERIFIED | 소스 검토 + 이 세션 재실행 exit 0, 10/10 PASS |
| `src/types/database.ts` | 신규 타입 5개 + 기존 타입 보존 | ✓ VERIFIED | grep으로 5개 테이블 타입 라인 확인 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `content_complexes.complex_id` | `public.complexes(id)` | FK `ON DELETE CASCADE` | ✓ WIRED | 라이브 `pg_constraint`: `content_complexes_complex_id_fkey` 확인 |
| `content_votes.user_id` / `content_bookmarks.user_id` | `auth.users(id)` | FK `ON DELETE CASCADE` | ✓ WIRED | 라이브 `pg_constraint` 2건 확인 |
| RLS `editor` 정책 | `public.profiles.role` | `exists` 서브쿼리 `role in ('cbl_editor','superadmin')` | ✓ WIRED | 라이브 `pg_policies.qual`에 정확히 등장(`contents: editor all`, `content_complexes: editor write`) |
| `scripts/verify-cbl-rls.ts` | PostgREST `anon` 역할 | `createClient(url, NEXT_PUBLIC_SUPABASE_ANON_KEY)` | ✓ WIRED | 소스 확인 — `admin`/`anon` 클라이언트 분리, 이 세션 재실행으로 실제 anon 역할 응답 확인 |

---

## DDL 정합성 — 라이브 스키마 vs D-03/D-04 대조

**컬럼 수**: `contents=21`, `content_complexes=2`, `content_votes=4`, `content_bookmarks=3`,
`subscribers=9` — 요구된 전 항목 라이브 실측 일치.

**기본값**: `site_id='changbuletter'`(contents·subscribers), `status='draft'`(contents)/
`'pending'`(subscribers), `is_featured=false`, `region_tags='{}'::text[]`,
`confirm_token=encode(gen_random_bytes(24), 'hex'::text)` — 전부 라이브 `column_default`로
확인.

**CHECK 4건**: `contents_type_check`(`card_news`/`article`), `contents_status_check`
(`draft`/`scheduled`/`published`), `subscribers_status_check`(4값 전부),
`content_votes_choice_check`(`left`/`right`) — 전부 확인.

**`unique (site_id, email)`**: `subscribers_site_id_email_key` — 확인.
**복합 PK 3건**: `content_complexes_pkey`/`content_votes_pkey`/`content_bookmarks_pkey` —
확인. **FK `on delete cascade` 6건**: 전부 `confdeltype`(문자열 `ON DELETE CASCADE`)로
확인.

**인덱스 4개 + WHERE 절**: `contents_feed_idx`(`WHERE status='published'`),
`contents_region_tags_idx`(`USING gin`), `contents_category_idx`(`WHERE status='published'`),
`subscribers_send_idx`(`WHERE status='confirmed'`) — 전부 `indexdef` 원문으로 확인.

**판정: D-03·D-04와 컬럼·제약·기본값·인덱스 전 항목 일치. 창부레터 저장소 ADR과의 드리프트
없음(라이브 실측 기준).**

---

## Scope Fence 판정 (8항목)

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 스키마 재설계 금지 | ✓ 준수 | 위 DDL 정합성 대조에서 전 항목 일치 확인 |
| 2 | `src/app/admin/layout.tsx` 수정 금지 | ✓ 준수 | `git log --oneline -- src/app/admin/layout.tsx` 최신 커밋이 Phase 36 이전(`b1a2d42`). Phase 36 커밋 3건의 `--name-only` 목록에도 등장하지 않음 |
| 3 | `ad_events` 패턴(`TO` 절 누락) 복사 금지 | ✓ 준수 | `20260730000003` 파일에 `ad_events` 문자열 0건(grep 확인). 라이브 정책 7건 전부 `roles`에 `{public}` 없음 |
| 4 | `contents`에 `using (true)` 금지 | ✓ 준수 | 라이브 `pg_policies.qual`(`contents: public read published`) = `(status='published') AND (published_at<=now())` — `true` 아님 |
| 5 | `subscribers`에 SELECT 정책 생성 금지 | ✓ 준수 | 라이브 `pg_policies`에서 `subscribers` 행은 `cmd='INSERT'` 1건뿐 |
| 6 | 기존 테이블 데이터 변경 금지 | ✓ 준수 | 마이그레이션 3개 파일 전체 `grep -viE "^\s*--"` 후 `UPDATE`/`DELETE`/`INSERT` 문 0건. `favorites`/`ad_campaigns`/`profiles` 행수가 SUMMARY 기록값과 라이브 실측이 동일 |
| 7 | 애플리케이션 코드 변경 금지(타입 예외) | ✓ 준수 | Phase 36 커밋 3건의 `--name-only` 합산 결과: `scripts/verify-cbl-rls.ts`, `src/types/database.ts`, 마이그레이션 3개뿐. `src/**` 중 `database.ts` 외 변경 없음 |
| 8 | 0-4~0-7(`card-news/`·`src/lib/cardnews/`·`complex_rankings`) 무접촉 | ✓ 준수 | `git log --since="2026-07-29" --name-only`에 해당 경로 문자열 0건 |

**부가 확인**: 테이블 레벨 `grant`/`revoke` 구문 — 마이그레이션 3개 파일 전체에 0건
(grep 확인, plan-checker가 BLOCKER로 제거한 항목 `ee62402`가 유지됨). 인덱스에
`CONCURRENTLY` — `20260730000002` 파일 및 라이브 `indexdef` 양쪽 0건.

---

## 검증 스크립트(`scripts/verify-cbl-rls.ts`) 실효성 판정

**클라이언트 분리**: 소스 20-41행에서 `admin`(`SUPABASE_SERVICE_ROLE_KEY`, fixture 생성·
정리 전용)과 `anon`(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, 검증 주체)이 명확히 분리된 두 개의
`createClient` 인스턴스로 선언됨. 10개 검증 항목(148-271행) 전부 `anon.from(...)`으로
호출 — `admin` 클라이언트가 검증 쿼리에 섞이지 않음(fixture 생성·cleanup에만 사용).
**RLS 우회 없음 — 검증이 유효하다.**

**차단 7 + positive control 3**: 항목 1·2·3·5·7·8·10이 차단 검증(0행 또는 42501 기대),
항목 4·9가 positive control(1행 기대, "0행이 연결 오류가 아님"을 증명), 항목 5 내부에
seed 구독자(`status='confirmed'`)를 실제로 만들어 "숨길 대상이 존재하는 상태"에서 검증하는
embedded positive control 포함. 항목 7은 `23505`(unique 위반)과 `42501`(RLS 위반)을
명시적으로 구분(213-220행) — 더블 옵트인 우회가 RLS 레벨에서 막힘을 실측.

**전체 실패 처리**: 343행 `if (results.length !== 10 || passed !== 10)`으로 10개 미만이거나
하나라도 실패하면 `process.exitCode = 1` — positive control이 부분 실패해도 조용히
넘어가지 않음.

**cleanup 위치**: 324-333행 `try { ... } catch { ... } finally { await cleanup() }` —
검증 중 예외가 발생해도 `finally`에서 무조건 실행됨.

**이 세션 독립 재실행 결과**: `npx tsx --env-file=.env.local scripts/verify-cbl-rls.ts` →
**exit 0**, 10/10 PASS(차단 7 + positive control 3), cleanup 후 `contents`/`subscribers`
잔여 0건, `content_complexes` 0건, **`complexes` 행수 4285 → 4285 불변**(재실행 전후 —
이 세션에서 직접 확인).

**판정: 검증 스크립트가 실제로 RLS를 검증하고 있으며(서비스 롤 우회 없음), 재실행으로
재현 가능하다. 실효성 있음.**

---

## 적용 경로 변경(`execute_sql` + `migration repair`) 타당성

라이브 `npx supabase migration list --linked` 조회 결과, `20260730000001`/`20260730000002`/
`20260730000003` 전부 `local`과 `remote` 버전이 **파일명과 정확히 동일한 문자열**로
기록됨(`{"local":"20260730000001","remote":"20260730000001", ...}` 등). 이는 SUMMARY가
주장한 "신규 drift 없음"이 정확함을 라이브 원장으로 확인한 것이다 — `apply_migration`
경로(자기 타임스탬프로 기록)를 썼다면 `local`과 `remote` 버전 문자열이 달랐을 것이다.

**판정: 적용 경로 변경이 db:push와 동등한 원장 상태를 만들었다. 신규 drift 없음(라이브 확인).**

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CBL-01 | 36-00 | `site_id` CHECK 2건에 `changbuletter` 추가 | ✓ SATISFIED | 라이브 `pg_constraint` 확인 |
| CBL-02 | 36-00 | `profiles.role` CHECK에 `cbl_editor` 추가, `admin` 재사용 금지 | ✓ SATISFIED | 라이브 `pg_constraint` 확인 + `admin/layout.tsx` 무변경 확인 |
| CBL-03 | 36-01 | `contents` 테이블 + 인덱스 3개 | ✓ SATISFIED | 라이브 컬럼·인덱스 실측 |
| CBL-04 | 36-01 | `content_complexes`·`content_votes`·`content_bookmarks` | ✓ SATISFIED | 라이브 컬럼·FK·PK 실측 |
| CBL-05 | 36-01 | `subscribers` + `subscribers_send_idx` | ✓ SATISFIED | 라이브 컬럼·인덱스·기본값 실측 |
| CBL-06 | 36-02 | 신규 테이블 5개 RLS, `TO` 절 필수, `contents` `using(true)` 금지, `subscribers` SELECT 금지 | ✓ SATISFIED | 라이브 `pg_policies` 7행 실측 |
| CBL-07 | 36-02 | 회귀·보안 검증 | ✓ SATISFIED | 스크립트 이 세션 재실행 10/10 PASS |

**Orphaned requirements**: 없음 — REQUIREMENTS.md의 CBL-01~07 전부 3개 plan의
`requirements` 필드에 매핑됨.

---

## Anti-Patterns Found

없음. 마이그레이션 3개 파일과 `scripts/verify-cbl-rls.ts`를 대상으로 `TBD`/`FIXME`/
`XXX`/`TODO`/`HACK`/`PLACEHOLDER` grep — 0건. `console.log`는 `verify-cbl-rls.ts`에
존재하나 이 파일은 `tsconfig.json` `exclude`에 포함된 독립 검증 스크립트(프로덕션 코드
아님)이며, 진행 상황·결과표 출력 용도로 의도된 설계다(정탐 아님).

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CHECK 제약 3건이 신규 값 허용 | `pg_get_constraintdef` 라이브 조회 | 3건 모두 신규 값 포함 | ✓ PASS |
| 신규 테이블 5개 존재 + 컬럼 수 일치 | `information_schema.columns` count | 21/2/4/3/9 전부 일치 | ✓ PASS |
| RLS 활성화 | `pg_class.relrowsecurity` | 5/5 `true` | ✓ PASS |
| anon 차단 7 + positive control 3 | `verify-cbl-rls.ts` 재실행 | exit 0, 10/10 PASS | ✓ PASS |
| lint 회귀 없음 | `npm run lint` | exit 0 | ✓ PASS |
| test 실패군이 사전 존재임 | `npm run test` | 17파일/35테스트 실패(known_context와 정확히 일치) | ✓ PASS (예외 적용) |

## Probe Execution

이 Phase는 `scripts/*/tests/probe-*.sh` 형식의 전용 probe를 선언하지 않았다.
`scripts/verify-cbl-rls.ts`가 이 Phase의 실질적 probe이며, 위 "검증 스크립트 실효성"
섹션에서 소스 검토 + 재실행으로 다뤘다.

## Human Verification Required

없음 — 이 Phase는 DB 전용(`UI hint: no`)이며 Success Criteria 6개 전부 라이브 SQL·스크립트
재실행으로 프로그래밍적 검증이 가능했다.

---

## 리스크 기록 (결함 아님 — 명시적 설계 결정)

1. **RLS가 단독 방어선이다.** 테이블 레벨 권한(`grant`/`revoke`)을 회수하지 않았다
   (`has_table_privilege('anon','public.subscribers','select')=true`,
   `has_table_privilege('anon','public.contents','insert')=true` — 이 세션에서 재확인).
   D-04 원본 설계이고 `complexes`가 같은 구조로 프로덕션에서 동작하는 선례가 있어 결함으로
   판정하지 않지만, 향후 누군가 실수로 `subscribers` SELECT 정책을 추가하면 이메일 PII가
   즉시 노출된다는 점을 인지해야 한다.
2. **`ad_events` 로컬-프로덕션 드리프트.** 프로덕션은 `roles={authenticated}`로 이미
   수정돼 있으나 로컬 파일 `20260430000009_rls.sql:151-153`은 여전히 버그 버전이다(라이브
   재확인 완료). Phase 36의 결함이 아니며 별건으로 이미 문서화됨.
3. **저장소에 없는 프로덕션 스키마 6건 + 로컬 타임스탬프 중복 3쌍**은 `36-00-SUMMARY.md`에
   기록된 대로 Phase 36 범위 밖 후속 작업이다. 위 frontmatter `deferred:`에 이월 기록.

---

## Gaps Summary

없음. CBL-01~07 전 항목이 라이브 프로덕션 DB 직접 조회와 검증 스크립트 독립 재실행으로
확인됐다. Scope Fence 8항목 전부 준수. 적용 경로 변경(`execute_sql`+`repair`)이 마이그레이션
원장에 신규 drift를 만들지 않았음을 라이브 원장으로 확인했다. `npm run lint` exit 0,
`npm run test`는 사전 존재 실패(17파일/35테스트, 이 세션 재실행으로 카운트 재확인)로
Phase 36의 회귀가 아니다.

---

_Verified: 2026-07-30_
_Verifier: Claude (gsd-verifier)_
