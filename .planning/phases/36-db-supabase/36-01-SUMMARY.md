---
phase: 36-db-supabase
plan: "01"
subsystem: database
tags: [supabase, changbuletter, content-schema, migration-drift, types]

requires: [36-00]
provides:
  - public.contents (21컬럼) + 인덱스 3개 — 창부레터 콘텐츠 본체
  - public.content_complexes / content_votes / content_bookmarks — 단지 연결·투표·북마크
  - public.subscribers (9컬럼) + subscribers_send_idx — 뉴스레터 더블 옵트인
  - src/types/database.ts 갱신 (4,180행 → 4,394행) — 창부레터가 import할 타입 계약
affects: [36-02]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - supabase/migrations/20260730000002_cbl_content_schema.sql
  modified:
    - src/types/database.ts

key-decisions:
  - "적용 경로가 `npm run db:push`가 아니라 `execute_sql`(단일 트랜잭션) + `migration repair --status applied 20260730000002`였다. Wave 0에서 확인된 마이그레이션 원장 drift(`36-00-SUMMARY.md`) 때문에 db:push가 `LegacyDbPushMissingLocalError`로 거부되는 상태다. 파일명과 같은 버전을 repair로 기록해 신규 drift를 만들지 않았다"
  - "MCP `apply_migration`을 쓰지 않았다 — 그것이 자기 타임스탬프를 버전으로 기록해 현재의 drift를 만든 원인이다"
  - "D-03 DDL을 컬럼 추가·제거·타입 변경 없이 그대로 적용했다. 창부레터 저장소 `docs/adr/ADR-002-content-schema.md`와 일치 유지가 목적"
  - "`contents.updated_at`에 `set_updated_at()` 트리거를 추가하지 않았다. 저장소 관행이지만 D-03에 없어 앱 레이어에서 갱신한다"
  - "인덱스에 `CONCURRENTLY`를 쓰지 않았다 — 신규 생성 테이블이라 락 대상 행이 0"
  - "타입 재생성은 Supabase CLI(`supabase gen types typescript`) 경로를 사용했다. MCP 폴백 불필요"

patterns-established: []

requirements-completed: [CBL-03, CBL-04, CBL-05]

duration: ~35min
completed: 2026-07-30
---

# Phase 36-01: 창부레터 콘텐츠 스키마 5개 테이블 생성 Summary

**테이블 5개 + 인덱스 4개 프로덕션 적용 완료. 라이브 스키마가 D-03 DDL과 전 항목 일치. `src/types/database.ts` 갱신 완료. 다만 이 Wave 종료 시점에 RLS가 없다 — 36-02를 즉시 이어서 실행해야 한다.**

## 적용 경로 — `npm run db:push` 대신 `execute_sql` + `repair`

Wave 0(`36-00-SUMMARY.md`)에서 마이그레이션 원장 drift가 확인됐고 `db:push`가 실제로
실패한다. 로컬 파일이 "pending"으로 표시되지만 전부 이미 적용돼 있고, 반대로 remote 전용
18개 버전이 로컬 파일과 매칭되지 않아 CLI가 `LegacyDbPushMissingLocalError`로 push를
거부한다. 원인은 6/18 이후 스키마가 파일명이 아니라 **적용 시각을 버전으로 기록하는
경로**(MCP `apply_migration` 또는 대시보드 SQL 에디터)로 들어왔기 때문이다.

따라서 Wave 0과 동일 경로를 사용했다:

1. `supabase/migrations/20260730000002_cbl_content_schema.sql` 작성 + 커밋 (`8a63447`)
2. blocking checkpoint에서 사용자 승인 (파일 전문 + FK 락 고지 + `complexes` 기준 행수 4,285 제시)
3. Supabase MCP `execute_sql`(project_id `auoravdadyzvuoxunogh`)로 **단일 트랜잭션**
   (`begin; … commit;`) 적용
4. `npx supabase migration repair --status applied 20260730000002` → 원장 기록
   (`Repaired migration history: [20260730000002] => applied`)

`npm run db:push`와 MCP `apply_migration`은 사용하지 않았다. 파일명과 같은 버전을 원장에
기록했으므로 **신규 drift가 발생하지 않았다.**

## 라이브 검증 결과 — D-03 DDL 대조

### 컬럼 수 (기대 21/2/4/3/9)

| 테이블 | 기대 | 실측 | 판정 |
|---|---|---|---|
| `contents` | 21 | **21** | ✅ |
| `content_complexes` | 2 | **2** | ✅ |
| `content_votes` | 4 | **4** | ✅ |
| `content_bookmarks` | 3 | **3** | ✅ |
| `subscribers` | 9 | **9** | ✅ |

### 기본값·타입

| 대상 | 기대 | 실측 (`column_default` / `udt_name`) | 판정 |
|---|---|---|---|
| `contents.site_id` | `'changbuletter'` | `'changbuletter'::text` | ✅ |
| `contents.status` | `'draft'` | `'draft'::text` | ✅ |
| `contents.is_featured` | `false` | `false` | ✅ |
| `contents.region_tags` | `text[]`, `'{}'` | `_text` / `'{}'::text[]` (`data_type=ARRAY`) | ✅ |
| `contents.id` | `gen_random_uuid()` | `gen_random_uuid()` | ✅ |
| `contents.created_at`·`updated_at` | `now()` | `now()` | ✅ |
| `subscribers.site_id` | `'changbuletter'` | `'changbuletter'::text` | ✅ |
| `subscribers.status` | `'pending'` | `'pending'::text` | ✅ |
| `subscribers.confirm_token` | `encode(gen_random_bytes(24),'hex')` | `encode(gen_random_bytes(24), 'hex'::text)` | ✅ |
| `subscribers.requested_at` | `now()` | `now()` | ✅ |

### CHECK 제약 4건

| 제약명 | 정의 | 판정 |
|---|---|---|
| `contents_type_check` | `CHECK ((type = ANY (ARRAY['card_news','article'])))` | ✅ |
| `contents_status_check` | `CHECK ((status = ANY (ARRAY['draft','scheduled','published'])))` | ✅ |
| `subscribers_status_check` | `CHECK ((status = ANY (ARRAY['pending','confirmed','unsubscribed','bounced'])))` | ✅ 4값 전부 |
| `content_votes_choice_check` | `CHECK ((choice = ANY (ARRAY['left','right'])))` | ✅ |

### unique / PK

| 대상 | 정의 | 판정 |
|---|---|---|
| `contents_slug_key` | `UNIQUE (slug)` | ✅ |
| `subscribers_site_id_email_key` | `UNIQUE (site_id, email)` | ✅ |
| `content_complexes_pkey` | `PRIMARY KEY (content_id, complex_id)` | ✅ 복합 |
| `content_votes_pkey` | `PRIMARY KEY (content_id, user_id)` | ✅ 복합 |
| `content_bookmarks_pkey` | `PRIMARY KEY (content_id, user_id)` | ✅ 복합 |
| `contents_pkey` / `subscribers_pkey` | `PRIMARY KEY (id)` | ✅ |

### FK `on delete cascade` 5건 (`confdeltype='c'` 전부)

| FK | 참조 | confdeltype |
|---|---|---|
| `content_complexes_content_id_fkey` | `contents(id)` | `c` ✅ |
| `content_complexes_complex_id_fkey` | `complexes(id)` — **Golden Record** | `c` ✅ |
| `content_votes_content_id_fkey` | `contents(id)` | `c` ✅ |
| `content_votes_user_id_fkey` | `auth.users(id)` | `c` ✅ |
| `content_bookmarks_content_id_fkey` | `contents(id)` | `c` ✅ |
| `content_bookmarks_user_id_fkey` | `auth.users(id)` | `c` ✅ |

(FK 총 6건 — cascade 6/6)

### 인덱스 4개 + WHERE 절

| 인덱스 | `indexdef` | 판정 |
|---|---|---|
| `contents_feed_idx` | `USING btree (published_at DESC) WHERE (status = 'published'::text)` | ✅ 부분 |
| `contents_region_tags_idx` | `USING gin (region_tags)` | ✅ GIN |
| `contents_category_idx` | `USING btree (category, published_at DESC) WHERE (status = 'published'::text)` | ✅ 부분 |
| `subscribers_send_idx` | `USING btree (site_id) WHERE (status = 'confirmed'::text)` | ✅ 부분 |

### RLS 상태 (이 Wave는 미적용이 정상)

```
contents           relrowsecurity=false
content_complexes  relrowsecurity=false
content_votes      relrowsecurity=false
content_bookmarks  relrowsecurity=false
subscribers        relrowsecurity=false
```

### 기존 데이터 무영향

```
public.complexes  4,285행 → 4,285행 (FK 추가 전후 동일)
public.contents        0행 (신규·빈 테이블)
public.subscribers     0행 (신규·빈 테이블)
supabase_migrations.schema_migrations version='20260730000002' → 1행 (원장 기록 확인)
```

**최종 판정: PASS** — D-03 DDL 전 항목 일치.

## 🔴 RLS 미적용 — 36-02 즉시 후속 실행 필요

이 Wave는 DDL만 담당하므로 신규 테이블 5개 모두 `relrowsecurity=false` 상태로 끝난다.
즉 **현재 `anon`이 이 테이블들에 접근 가능한 상태**다. 위험이 아직 실현되지 않은 이유는
테이블이 전부 비어 있기 때문이며(데이터 적재는 창부레터 소관), **데이터가 들어가기 전에
36-02가 반드시 완료되어야 한다.**

특히 다음 두 가지가 36-02 전까지 보호되지 않는다:
- `contents`의 `draft`·`scheduled` 콘텐츠 (T-36-01-01)
- `subscribers.email` PII (T-36-01-02)

## `src/types/database.ts` 갱신

| 항목 | 값 |
|---|---|
| 재생성 경로 | **Supabase CLI** — `npx supabase gen types typescript --project-id auoravdadyzvuoxunogh --schema public` (exit 0, MCP 폴백 불필요) |
| 행수 전 | 4,180 |
| 행수 후 | **4,394** (+214) |
| 신규 테이블 타입 | `contents`·`content_complexes`·`content_votes`·`content_bookmarks`·`subscribers` 각 1건 ✅ |
| 신규 필드명 | `region_tags`·`confirm_token`·`vote_question`·`cafe_post_url`·`is_featured` ✅ |
| 기존 타입 보존 | `complexes`·`transactions`·`profiles`·`favorites`·`ad_campaigns` 각 1건 ✅ |
| 포맷 | 1행 `export type Json =` 유지 ✅ |

`git status --porcelain src/` → `src/types/database.ts` 단일 변경. `admin/layout.tsx` 무변경
(`git diff --quiet` exit 0).

## 검증 (lint / test)

- `npm run lint` (ESLint + `tsc --noEmit`) → **exit 0**, `✔ No ESLint warnings or errors`
- `npm run test` (Vitest) → 17 파일 / 35 테스트 실패. **전부 이 Wave와 무관한 사전 존재
  실패**다. 확인 방법: `git stash push src/types/database.ts`로 타입 변경만 되돌린 뒤
  동일 파일(`sitemap.test.ts`, `schema.integration.test.ts`)을 재실행 → **5 failed / 5
  passed로 결과 완전 동일**. 실패군은 모두 라이브 Supabase에 붙는 DB 통합 테스트
  (`sitemap`·`schema.integration`·`favorites`·`profile`·`reviews`·`complex-*` 등)이며,
  타입 유입으로 인한 컴파일 에러는 0건(`tsc --noEmit` 통과가 근거)이다.
  → **애플리케이션 코드를 수정하지 않았다** (`<scope_fence>` 7번 준수).

## 창부레터 저장소에 전달할 사항

- 테이블 5개 사용 가능: `contents`, `content_complexes`, `content_votes`,
  `content_bookmarks`, `subscribers`
- 갱신된 `src/types/database.ts`(4,394행)를 타입 계약으로 사용 가능
- `contents.updated_at`은 **DB 트리거가 없다** — 앱 레이어(Server Action)에서 갱신할 것
- `subscribers.confirm_token`은 DB 기본값으로 자동 생성된다 — 앱에서 만들지 말 것
- **⚠️ RLS는 아직 없다 (36-02 완료 후 사용).** 실데이터 적재는 36-02 완료 후에 시작할 것
- `role='cbl_editor'` 부여는 `service_role`로 수행 (36-00 결정)

## 커밋

| 커밋 | 내용 |
|---|---|
| `8a63447` | `supabase/migrations/20260730000002_cbl_content_schema.sql` 작성 |
| `c2b7f35` | `src/types/database.ts` 재생성 (4,180 → 4,394행) |
