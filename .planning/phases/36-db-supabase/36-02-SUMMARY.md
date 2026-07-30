---
phase: 36-db-supabase
plan: "02"
subsystem: database
tags: [supabase, changbuletter, rls, security, anon-verification, migration-drift]

requires: [36-00, 36-01]
provides:
  - 신규 5개 테이블 RLS 활성화 (relrowsecurity=true) — contents / content_complexes / content_votes / content_bookmarks / subscribers
  - RLS 정책 7개 (전부 TO 절 명시 — roles가 {public}인 정책 0건)
  - subscribers SELECT 정책 미생성 → anon 이메일 목록 덤프·존재 여부 오라클 차단 (실측 확인)
  - scripts/verify-cbl-rls.ts — anon 역할 실측 권한 검증 스크립트 (10항목, 재실행 가능)
  - 창부레터 저장소가 실데이터를 적재해도 안전한 상태 (0단계 0-1~0-3 완료)
affects: []

tech-stack:
  added: []
  patterns:
    - "RLS 정책에 `to` 절 명시 — 저장소 기존 관행(TO 절 생략) 이탈. PostgreSQL 기본값 `to public`이 anon 노출을 유발하기 때문"
    - "anon 역할 실측 검증 스크립트 — service_role/anon 클라이언트 2개 분리 + positive control + finally cleanup"

key-files:
  created:
    - supabase/migrations/20260730000003_cbl_content_rls.sql
    - scripts/verify-cbl-rls.ts
  modified: []

key-decisions:
  - "테이블 레벨 `grant`/`revoke` 구문을 넣지 않았다(D-04 그대로). 초기 계획에 있었으나 plan-checker BLOCKER로 제거된 항목(커밋 ee62402). 근거: 선례 없음(`complexes`가 명시적 GRANT 없이 RLS만으로 공개 읽기 제공, 20260430000009_rls.sql:62-63) + 창부레터 ADR-003과의 드리프트 방지. 따라서 차단은 전적으로 RLS가 담당하며, 실측(Task 3)만이 증거다"
  - "적용 경로가 `npm run db:push`가 아니라 `execute_sql`(단일 트랜잭션) + `migration repair --status applied 20260730000003`이었다 — Wave 0·1과 동일. 마이그레이션 원장 drift로 CLI가 push를 거부한다"
  - "MCP `apply_migration`을 쓰지 않았다 — 자기 타임스탬프를 버전으로 기록해 현재의 drift를 만든 원인"
  - "`subscribers`에 SELECT 정책을 만들지 않았다(D-05③). 이메일 보호의 유일한 방어선이며 Task 3 항목 5가 실측 증거"
  - "`contents`에 `using (true)`를 쓰지 않고 `status='published' and published_at <= now()`로 DB 레벨 강제(D-05②)"
  - "애플리케이션 코드 무변경 — `git status --porcelain src/` 빈 출력. RLS는 생성 타입에 영향이 없어 `src/types/database.ts` 재생성 불필요(36-01에서 이미 갱신)"

patterns-established:
  - "RLS 마이그레이션의 모든 `create policy`에 `to` 절을 명시한다. `ad_events` 선례는 버그이므로 복사하지 않는다"
  - "RLS 검증은 anon 키 클라이언트로 실측한다. service_role로 검증하면 RLS가 우회돼 전부 통과로 보인다"
  - "차단 검증에는 positive control을 반드시 동반한다. 0행이 차단 증거인지 연결 오류 증거인지 구분할 유일한 방법"

requirements-completed: [CBL-06, CBL-07]

duration: ~30min
completed: 2026-07-30
---

# Phase 36-02: 창부레터 신규 5개 테이블 RLS 적용 + anon 실측 검증 Summary

**RLS 정책 7개 프로덕션 적용 완료. `anon` 역할 실측 검증 10항목 전부 PASS(차단 7 + positive control 3). fixture 잔여 0건, `complexes` 4,285행 불변. Phase 36 전체(0단계 0-1~0-3) 완료 — 창부레터가 실데이터를 적재해도 안전한 상태.**

이 Wave 착수 시점에 프로덕션에는 **RLS 없는 테이블 5개**(정책 0건)가 존재했다(36-01이 DDL만 담당). 테이블이 전부 비어 있어 유출될 데이터는 없었으나, 이 Wave가 그 창을 닫았다.

## 적용 경로 — `npm run db:push` 대신 `execute_sql` + `repair`

Wave 0(`36-00-SUMMARY.md`)에서 확인된 마이그레이션 원장 drift 때문에 `db:push`가 `LegacyDbPushMissingLocalError`로 거부된다. 로컬 파일이 "pending"으로 표시되지만 전부 적용돼 있고, 반대로 remote 전용 18개 버전이 로컬 파일과 매칭되지 않는다. 원인은 6/18 이후 스키마가 파일명이 아니라 **적용 시각을 버전으로 기록하는 경로**(MCP `apply_migration` 또는 대시보드 SQL 에디터)로 들어왔기 때문이다.

Wave 0·1과 동일 경로를 사용했다:

1. `supabase/migrations/20260730000003_cbl_content_rls.sql` 작성 + 커밋 (`840dbda`)
2. blocking checkpoint에서 사용자 승인 (파일 전문 + `grant`/`revoke` 0건 확인 + 정책 7개 요약표 + 영향 고지)
3. Supabase MCP `execute_sql`(project_id `auoravdadyzvuoxunogh`)로 **단일 트랜잭션**(`begin; … commit;`) 적용
4. `npx supabase migration repair --status applied 20260730000003`
   → `Repaired migration history: [20260730000003] => applied`

파일명과 같은 버전을 원장에 기록했으므로 **신규 drift가 발생하지 않았다.** `supabase_migrations.schema_migrations` where `version='20260730000003'` → 1행 확인.

## 라이브 검증 — RLS 활성화

```
content_bookmarks  relrowsecurity = true
content_complexes  relrowsecurity = true
content_votes      relrowsecurity = true
contents           relrowsecurity = true
subscribers        relrowsecurity = true
```

5/5. (Wave 1 종료 시점에는 5/5 모두 `false`였다.)

## 라이브 검증 — `pg_policies` 7행 원본 출력 (`roles` 포함)

```
select tablename, policyname, cmd, roles::text as roles, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('contents','content_complexes','content_votes','content_bookmarks','subscribers')
order by tablename, policyname;
```

| tablename | policyname | cmd | roles | qual | with_check |
|---|---|---|---|---|---|
| `content_bookmarks` | `content_bookmarks: own` | ALL | `{authenticated}` | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| `content_complexes` | `content_complexes: editor write` | ALL | `{authenticated}` | `(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['cbl_editor'::text, 'superadmin'::text])))))` | `null` |
| `content_complexes` | `content_complexes: public read` | SELECT | `{anon,authenticated}` | `(EXISTS ( SELECT 1 FROM contents c WHERE ((c.id = content_complexes.content_id) AND (c.status = 'published'::text) AND (c.published_at <= now()))))` | `null` |
| `content_votes` | `content_votes: own` | ALL | `{authenticated}` | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| `contents` | `contents: editor all` | ALL | `{authenticated}` | `(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['cbl_editor'::text, 'superadmin'::text])))))` | `null` |
| `contents` | `contents: public read published` | SELECT | `{anon,authenticated}` | `((status = 'published'::text) AND (published_at <= now()))` | `null` |
| `subscribers` | `subscribers: anon subscribe` | INSERT | `{anon,authenticated}` | `null` | `((site_id = 'changbuletter'::text) AND (status = 'pending'::text))` |

**게이트 판정**

| 항목 | 기대 | 실측 | 판정 |
|---|---|---|---|
| 정책 행수 | 7 (contents 2 / content_complexes 2 / content_votes 1 / content_bookmarks 1 / subscribers 1) | **7** | ✅ |
| `roles = '{public}'`인 행 | 0 | **0** | ✅ (T-36-02-04 — `ad_events` TO 절 누락 버그 미재현) |
| `subscribers`에 `cmd='SELECT'` | 0 | **0** | ✅ (D-05③ — 이메일 보호의 단독 방어선) |
| `contents: public read published`의 `qual` | `published` + `now()` 포함, `true` 아님 | `((status = 'published'::text) AND (published_at <= now()))` | ✅ |
| `subscribers: anon subscribe`의 `with_check` | `changbuletter` + `pending` 포함 | `((site_id = 'changbuletter'::text) AND (status = 'pending'::text))` | ✅ |
| 마이그레이션 파일의 `grant`/`revoke` | 0건 | **0건** | ✅ |

## `has_table_privilege` 진단 결과 (합격 기준 아님 — 기록용)

`grant`/`revoke`를 쓰지 않았으므로 테이블 레벨 권한은 Supabase 기본값 그대로다. 기대값을 걸지 않고 기록한다:

| 조회 | 결과 |
|---|---|
| `has_table_privilege('anon','public.subscribers','select')` | **true** |
| `has_table_privilege('anon','public.subscribers','insert')` | true |
| `has_table_privilege('anon','public.contents','select')` | true |
| `has_table_privilege('anon','public.contents','insert')` | true |

즉 **테이블 권한 레벨에서는 anon이 전부 열려 있고, 차단은 전적으로 RLS 정책이 담당한다.** 이는 `complexes`(`20260430000009_rls.sql:62-63`)가 명시적 GRANT 없이 RLS 정책만으로 공개 읽기를 제공하며 프로덕션에서 정상 동작하는 것과 같은 구조다. 따라서 `subscribers` SELECT 차단과 `contents` INSERT 차단은 **권한 레벨로는 확인할 수 없고 anon 실측만이 증거**다 — 아래 항목 5·10이 그 실측이다.

## `scripts/verify-cbl-rls.ts` 실행 결과 — 10항목

실행: `npx tsx --env-file=.env.local scripts/verify-cbl-rls.ts` → **exit 0**

클라이언트 2개를 분리했다. `admin`(`SUPABASE_SERVICE_ROLE_KEY`)은 fixture 생성·정리 전용, `anon`(`NEXT_PUBLIC_SUPABASE_ANON_KEY`)이 검증 주체다. service_role로 검증하면 RLS가 우회돼 전부 통과로 보이므로 혼용하지 않았다.

```
🔗 연결 대상: https://auoravdadyzvuoxunogh.supabase.co
📐 complexes 행수 (before): 4285
📦 fixture 생성 완료 (contents 4건 + content_complexes 2건 + subscribers seed 1건)
```

| # | 항목 | 기대 | 실측 | 판정 |
|---|------|------|------|------|
| 1 | anon `contents` SELECT (draft) | 0행 | 0행 | ✅ |
| 2 | anon `contents` SELECT (scheduled) | 0행 | 0행 | ✅ |
| 3 | anon `contents` SELECT (published + `published_at` 미래) | 0행 | 0행 | ✅ |
| 4 | anon `contents` SELECT (published + 과거) **[positive control]** | 1행 | 1행 | ✅ |
| 5 | anon `subscribers` SELECT 차단 (이메일 목록 덤프) | 0행 또는 42501 | 0행 | ✅ |
| 6 | anon `subscribers` INSERT (`status='pending'`) | 성공 | 성공 | ✅ |
| 7 | anon `subscribers` INSERT (`status='confirmed'`) 거부 | 42501 | error(42501) | ✅ |
| 8 | anon `content_complexes` SELECT (draft 연결) | 0행 | 0행 | ✅ |
| 9 | anon `content_complexes` SELECT (published 연결) **[positive control]** | 1행 | 1행 | ✅ |
| 10 | anon `contents` INSERT 거부 (T-36-02-05 위조 삽입) | 42501 | error(42501) | ✅ |

**결과: 10/10 PASS — 최종 판정 PASS (차단 7 + positive control 3)**

해석 포인트:

- **항목 5**가 `subscribers` 이메일 보호의 유일한 실측 증거다. seed 구독자(`zz-cbl-verify-seed@example.invalid`, `status='confirmed'`)를 실제로 만들어 "숨길 대상이 존재하는 상태"에서 검증했고, anon SELECT는 **0행**을 반환했다(seed 유출 없음). 권한 회수를 하지 않았으므로 Postgres는 에러가 아니라 0행을 반환하는 것이 정상 결과다 — SELECT 정책 부재가 RLS 차단으로 작동함을 확인.
- **항목 7**은 `23505`(unique 위반)가 아니라 `42501`(RLS 위반)로 거부됐다. 항목 6과 다른 이메일을 쓴 이유가 이 구분이며, 더블 옵트인 우회(T-36-02-07)가 DB 레벨에서 막힘을 확인.
- **항목 10**은 T-36-02-05(anon 위조 삽입)의 실측이다. `has_table_privilege('anon','public.contents','insert')=true`인데도 `42501`로 거부된다 — anon에 적용되는 INSERT 정책이 없어 RLS가 차단한다.
- **positive control 3건**(항목 4·9 + 항목 5의 embedded seed)이 통과했으므로 차단 항목의 0행은 연결·권한 오류가 아니라 실제 차단 증거다.

### cleanup 결과

```
🧹 cleanup (service_role)   ← try/finally의 finally에서 무조건 실행
  contents 잔여: 0건
  subscribers 잔여: 0건
  content_complexes 전체: 0건 (FK cascade 확인)
  complexes 행수: 4285 (Golden Record — 스크립트 전후 불변)
```

fixture는 전부 `zz-cbl-verify-` 접두어를 사용했고, `contents` 삭제 시 FK cascade로 `content_complexes` 연결 행도 함께 삭제됐다. **프로덕션 DB 잔여물 0건.** `complexes` 4,285 → 4,285 불변.

## 기존 테이블 무접촉 확인 — `ad_events` 상태 기록

`ad_events` 정책은 이 Phase에서 **건드리지 않았다**(범위 밖 — `36-CONTEXT.md` `<deferred>`). 마이그레이션 파일에 `ad_events` 문자열 0건.

🟡 **다만 라이브 상태가 plan의 기대값과 다르다.** plan Task 2 acceptance criteria는 `ad_events` 정책의 `roles`가 여전히 `{public}`일 것으로 기대했으나, 실측 결과:

```
tablename  | policyname                      | cmd    | roles           | with_check
ad_events  | ad_events: authenticated insert | INSERT | {authenticated} | (auth.uid() IS NOT NULL)
```

**즉 프로덕션의 `ad_events` `TO` 절 누락 버그는 이미 수정된 상태다.** 로컬 파일 `20260430000009_rls.sql:151-153`은 여전히 `to` 절 없이 `with check (true)`이므로, 이 수정은 **저장소에 파일이 없는 remote 전용 마이그레이션**(`36-00-SUMMARY.md`가 기록한 6건 중 `20260728074553 realtrade_story_ads_admin` — `ad_campaigns`/`ad_events` RLS를 다룸)이 적용한 것으로 보인다.

→ **로컬 파일과 프로덕션이 갈라진 또 하나의 증거**다. `supabase db reset` 시 이 수정이 재현되지 않고 버그 버전으로 되돌아간다. `36-00-SUMMARY.md`의 "저장소에 없는 프로덕션 스키마 6건" 후속 작업에 이 사실을 포함해야 한다. **이 Phase에서는 수정하지 않았다**(범위 밖).

## 검증 (lint / test / 범위)

| 검증 | 결과 |
|---|---|
| `npm run lint` (ESLint + `tsc --noEmit`) | **exit 0** — `✔ No ESLint warnings or errors` |
| `npm run test` (Vitest) | 17 파일 / 35 테스트 실패 — **Wave 1 기록과 완전 동일한 사전 존재 실패**(`36-01-SUMMARY.md` 참조). 전부 라이브 Supabase에 붙는 DB 통합 테스트(`sitemap`·`schema.integration`·`favorites`·`profile`·`reviews`·`complex-*`)이며 신규 5개 테이블을 참조하지 않는다. 이 Wave는 `src/**`를 전혀 수정하지 않았으므로(아래) RLS로 인한 회귀가 아니다 |
| `git status --porcelain src/` | **빈 출력** — 애플리케이션 코드 무변경 |
| `git diff --quiet src/app/admin/layout.tsx` | **exit 0** — 권한 격리 유지(T-36-02-08) |
| `card-news/`·`src/lib/cardnews/`·`complex_rankings` | 무접촉 |

`scripts/`는 `tsconfig.json`의 `exclude`에 있어 `npm run lint`가 타입체크하지 않는다. `verify-cbl-rls.ts`의 검증은 **실행 성공(exit 0)**으로만 확인된다.

## 후속 판단 근거

> `subscribers` SELECT 차단이 RLS 정책 부재만으로 충분한지 Task 3 항목 5로 실측 확인했다(seed 구독자 존재 상태에서 anon SELECT → 0행, 유출 없음). 부족하다고 판명되면 후속 작업에서 `revoke select ... from anon`을 **D-04 개정 + 창부레터 `ADR-003` 동기화와 함께** 도입한다 — bds 단독 추가는 금지(저장소 간 드리프트).

동일 원칙이 `contents` INSERT 차단(항목 10)에도 적용된다. `has_table_privilege('anon','public.contents','insert')=true`이지만 RLS가 실제로 차단함을 실측했다.

## 창부레터 저장소에 전달할 사항

**사용 가능 (0단계 0-1~0-3 완료)**

- 테이블 5개 + RLS 적용 완료: `contents`, `content_complexes`, `content_votes`, `content_bookmarks`, `subscribers`. **실데이터 적재를 시작해도 안전하다**
- `src/types/database.ts`(4,394행, 36-01 갱신)를 타입 계약으로 사용 가능. RLS는 생성 타입에 영향이 없다
- `site_id='changbuletter'` insert 가능(`favorites`, `ad_campaigns`, `contents`, `subscribers`)

**🔴 앱 구현 시 반드시 지킬 제약**

1. **구독 insert에 `.select()`를 체이닝하지 말 것.** `subscribers`에 SELECT 정책이 없어 RLS가 `returning` 읽기를 차단한다. 체이닝하면 insert 자체는 성공해도 에러가 반환된다(의도된 결과 — D-05③). Task 3 항목 6이 `.select()` 없이 성공함을 실측했다
2. **구독 중복 판정("이미 구독 중이에요")은 `service_role` Server Action에서만 수행.** anon은 `subscribers`를 조회할 수 없다(이메일 존재 여부 오라클 방지)
3. **anon 구독은 `status='pending'`만 가능.** `status='confirmed'`로 직접 insert하면 `42501`로 거부된다(더블 옵트인 강제). 확인 처리는 `service_role`로 `confirmed_at` UPDATE
4. **`confirm_token`은 앱에서 만들지 말 것** — DB 기본값(`encode(gen_random_bytes(24),'hex')`)으로 자동 생성된다. 앱에서 만들면 생성 누락 시 확인 불가 레코드가 남는다
5. **`contents.updated_at`은 DB 트리거가 없다** — 앱 레이어(Server Action)에서 갱신할 것
6. **`role='cbl_editor'` 부여는 `service_role`로 수행** (일반 사용자가 자기 role을 올릴 수 없어야 함). `cbl_editor`는 bds 어드민 콘솔(`/admin/*`)에 진입 불가 — 의도된 격리. 창부레터 어드민은 자체 게이트에서 `role in ('cbl_editor','superadmin')`을 검사
7. **발행 조건은 `status='published' AND published_at <= now()` 둘 다 필요.** `published_at`이 `null`이거나 미래면 anon에 보이지 않는다(예약 발행). 발행 처리 시 `published_at`을 반드시 세팅할 것
8. **`content_complexes` 공개 읽기는 연결된 `contents`가 발행 상태일 때만** 작동한다. draft 콘텐츠의 관련 단지는 anon에 0행

**미착수 (별도 Phase)**

- **0-4** 카드뉴스 슬라이드 데이터 DB 저장 파이프라인
- **0-5** `complex_rankings.rank_type='price_change'` + 등락률 배치
- **0-6** 카드 템플릿 리브랜딩 + 비율 1080→1350 (**사용자 결정 대기**)
- **0-7** `refresh_complex_price_stats()` 배치 소유권 이전 검토

## 커밋

| 커밋 | 내용 |
|---|---|
| `840dbda` | `supabase/migrations/20260730000003_cbl_content_rls.sql` 작성 (정책 7개, grant/revoke 0건) |
| (이 커밋) | `scripts/verify-cbl-rls.ts` + `36-02-SUMMARY.md` |
