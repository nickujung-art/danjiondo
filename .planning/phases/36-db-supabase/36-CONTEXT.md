# Phase 36: 창부레터 DB 기반 구축 — 공유 Supabase 콘텐츠 스키마 - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning
**Source:** 2차 전수감사(`.planning/vision/BRIEF.md` §25) 확정 결정 + 핸드오프 ADR 이관

> ⚠️ **설계는 이미 잠겨 있다(LOCKED).** 이 Phase는 설계 단계가 없다. 아래
> `<decisions>`의 DDL을 **그대로** 마이그레이션으로 옮기는 작업이다. 스키마를
> 재설계하거나 필드를 추가·제거하면 안 된다 — 두 차례 전수감사를 거쳐 확정된
> 값이고, 별도 저장소(창부레터)의 ADR과 반드시 일치해야 한다.

<domain>
## Phase Boundary

창부레터(콘텐츠 미디어 사이트)는 별도 저장소 `C:\Users\jung\coding\changbuletter`로
핸드오프 완료됐다(커밋 `ec57a19`). 그런데 세 저장소(`bds` / `realtrade-story` /
창부레터)가 **하나의 Supabase 프로젝트 `auoravdadyzvuoxunogh`를 공유**하므로,
창부레터가 필요한 스키마도 이 저장소(`bds`)의 `supabase/migrations/`에 들어간다.
즉 **창부레터 개발이 bds 작업에 블로킹된 상태**이며, 이 Phase가 그 블로커를 푼다.

**이 Phase가 하는 일** (창부레터 0단계 중 0-1~0-3):
1. `site_id` CHECK 제약 2건에 `'changbuletter'` 추가 — 현재 제약에 막혀 insert 자체가 실패
2. `profiles.role` CHECK 제약에 `'cbl_editor'` 추가 — 권한 격리용 신규 role
3. 콘텐츠 스키마 5개 테이블 생성: `contents`, `content_complexes`, `content_votes`,
   `content_bookmarks`, `subscribers` + 인덱스
4. 신규 테이블 5개 RLS 정책 + `anon`/`authenticated` 권한 검증

**이 Phase가 하지 않는 일** (별도 Phase로 defer — 창부레터 0단계 0-4~0-7):
- **0-4** 카드뉴스 슬라이드 데이터를 Supabase에 저장하는 파이프라인 단계 추가
  (`card-news/` 수정 — 성격이 다르고 소급 적재 판단이 필요)
- **0-5** `complex_rankings.rank_type`에 `'price_change'` 추가 + 등락률 배치 계산
  (`molit-daily` 타임아웃 이력 때문에 배치 배치 위치 설계 판단 필요)
- **0-6** 카드 템플릿 2곳 리브랜딩 + `card-templates.ts` 비율 1080→1350
  (실제 발행되는 인스타 결과물이 바뀌므로 창부레터 오픈 시점과 맞춰야 함 — 사용자 결정 대기)
- **0-7** `refresh_complex_price_stats()` 배치 소유권 이전 검토
- 애플리케이션 코드 변경 일체 (bds UI·API·크론·어드민에 손대지 않음)
- `20260430000009_rls.sql:151-153` `ad_events` 정책의 `TO` 절 누락 버그 수정 (별건)
- 창부레터 앱 개발 (별도 저장소)

</domain>

<decisions>
## Implementation Decisions

### D-01: `site_id` CHECK 제약 — 대상은 2건

`20260715000001_realtrade_story_site_scoping.sql`에서 확인된 제약:

| 제약명 | 테이블 | 현재 값 |
|--------|--------|---------|
| `favorites_site_id_check` | `favorites` | `check (site_id in ('danjiondo', 'realtrade-story'))` |
| `ad_campaigns_site_id_check` | `ad_campaigns` | `check (site_id in ('danjiondo', 'realtrade-story'))` |

둘 다 `'changbuletter'`를 추가한다. `DROP CONSTRAINT` → `ADD CONSTRAINT` 순서이며
**짧은 ACCESS EXCLUSIVE 락**이 걸린다(둘 다 작은 테이블이라 실무상 무해하지만
계획에 명시할 것).

⚠️ **착수 시 재확인 필수**: 위 2건은 마이그레이션 파일 기준이다. 이후 다른
마이그레이션에서 `site_id` 컬럼·제약이 추가됐을 수 있으므로
`grep -rn "site_id" supabase/migrations/`로 전수 재확인한다.

### D-02: `profiles.role` — `'cbl_editor'` 신규 값, `admin` 재사용 금지

`20260430000005_users.sql:8-9`의 인라인 CHECK (자동 생성 제약명 `profiles_role_check`):

```sql
role text not null default 'user'
  check (role in ('user', 'admin', 'superadmin', 'advertiser'))
```

→ `'cbl_editor'` 추가.

🔴 **`admin`을 재사용하면 안 되는 이유**: `src/app/admin/layout.tsx:25`가
`role in ('admin','superadmin')`으로 게이트한다. 공유 `profiles` 테이블에서
창부레터 편집자에게 `admin`을 부여하면 **bds 어드민 콘솔 전체 권한(광고 승인·
회원 관리·GPS 승인·공인중개사 관리)이 즉시 열린다.**

**`admin/layout.tsx`는 이 Phase에서 수정하지 않는다** — 손대지 않는 것이 곧
권한 격리다. 창부레터 어드민은 자체 게이트에서 `role in ('cbl_editor','superadmin')`을
검사한다(창부레터 저장소 소관).

### D-03: 신규 테이블 5개 DDL — 그대로 적용

원본: `.planning/vision/BRIEF.md` §25-1 (동일 내용이 창부레터
`docs/adr/ADR-002-content-schema.md`에도 있음)

```sql
-- 콘텐츠 본체
create table public.contents (
  id            uuid primary key default gen_random_uuid(),
  site_id       text not null default 'changbuletter',
  slug          text not null unique,
  type          text not null check (type in ('card_news', 'article')),
  category      text not null,          -- 랭킹 / 동네분석 / 분양뉴스 / 기획 …
  region_tags   text[] not null default '{}',   -- 의창구, 중동, 내외동 …
  title         text not null,
  excerpt       text,                   -- 목록·OG 요약문
  body          jsonb,                  -- article: Tiptap JSON / card_news: 슬라이드 배열
  cover_image   text,                   -- 썸네일 URL (Cloudflare R2)
  read_minutes  int,                    -- 읽는 시간
  status        text not null default 'draft'
                check (status in ('draft', 'scheduled', 'published')),
  scheduled_at  timestamptz,            -- 예약 발행 시각
  published_at  timestamptz,
  cafe_post_url text,                   -- 있으면 "카페에서 이어보기" 버튼 노출
  is_featured   boolean not null default false,  -- true면 홈 lead 슬롯
  -- VS 투표
  vote_question text,
  vote_left     text,
  vote_right    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index contents_feed_idx
  on public.contents (published_at desc)
  where status = 'published';
create index contents_region_tags_idx
  on public.contents using gin (region_tags);   -- 지역 추천 (&& 교집합)
create index contents_category_idx
  on public.contents (category, published_at desc)
  where status = 'published';

-- 콘텐츠 ↔ 단지 (다대다) — "관련 단지" 섹션
create table public.content_complexes (
  content_id uuid not null references public.contents(id) on delete cascade,
  complex_id uuid not null references public.complexes(id) on delete cascade,
  primary key (content_id, complex_id)
);

-- VS 투표 응답
create table public.content_votes (
  content_id uuid not null references public.contents(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  choice     text not null check (choice in ('left', 'right')),
  created_at timestamptz not null default now(),
  primary key (content_id, user_id)
);

-- 콘텐츠 북마크 (favorites는 complex_id 기반이라 재사용 불가)
create table public.content_bookmarks (
  content_id uuid not null references public.contents(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, user_id)
);

-- 뉴스레터 구독자 (더블 옵트인)
create table public.subscribers (
  id              uuid primary key default gen_random_uuid(),
  site_id         text not null default 'changbuletter',
  email           text not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  confirm_token   text not null default encode(gen_random_bytes(24), 'hex'),
  requested_at    timestamptz not null default now(),  -- 신청 시각
  confirmed_at    timestamptz,                         -- 동의 완료 시각 (법적 근거)
  unsubscribed_at timestamptz,
  source          text,                                -- home_cta / article_cta …
  unique (site_id, email)
);
create index subscribers_send_idx
  on public.subscribers (site_id) where status = 'confirmed';
```

**필드 결정 근거** (변경 요청이 들어와도 이 근거를 먼저 확인할 것):

| 필드 | 왜 |
|------|-----|
| `category` + `region_tags` **분리** | `tag` 하나로 "랭킹"이면서 동시에 "의창구"일 수 없다. 지역 추천 알고리즘이 `region_tags && $1`을 질의 |
| `region_tags text[]` (정규화 안 함) | 월 수 건 규모라 GIN 인덱스로 충분. 조인 테이블 2개 추가 비용 대비 이득 없음 (YAGNI) |
| `status` 3값 + `scheduled_at` | 임시저장·예약발행이 창부레터 MVP 필수 |
| `cafe_post_url` nullable | `null`이면 "카페에서 이어보기" 버튼 미노출 — 모든 글에 카페 원문이 있는 건 아님 |
| `is_featured` (placement enum 아님) | 4슬롯 enum은 슬롯이 비거나 중복될 때 폴백 로직 필요. lead 하나만 수동 지정, 나머지는 자동 배치 |
| `requested_at` / `confirmed_at` 분리 | 더블 옵트인의 법적 근거는 `confirmed_at`(정보통신망법 수신동의 증명). 신청만 하고 미확인인 상태를 구분해야 "이미 구독 중" 분기가 성립 |
| `confirm_token` DB 기본값 | 앱에서 만들면 생성 누락 시 **확인 불가 레코드**가 남음 |

### D-04: RLS 정책 — 모든 정책에 `TO` 절 명시

원본: `.planning/vision/BRIEF.md` §25-6 (창부레터 `docs/adr/ADR-003`)

```sql
alter table public.contents enable row level security;

-- 발행된 것만 공개 읽기 (draft·scheduled는 anon에 절대 안 보임)
create policy "contents: public read published"
  on public.contents for select
  to anon, authenticated
  using (status = 'published' and published_at <= now());

-- 편집자 전체 접근
create policy "contents: editor all"
  on public.contents for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('cbl_editor', 'superadmin')
    )
  );

alter table public.subscribers enable row level security;

-- 구독 신청: anon INSERT만. SELECT 정책이 없으므로 목록 조회 불가
create policy "subscribers: anon subscribe"
  on public.subscribers for insert
  to anon, authenticated
  with check (site_id = 'changbuletter' and status = 'pending');

-- 북마크 / 투표: 본인 것만
alter table public.content_bookmarks enable row level security;
create policy "content_bookmarks: own"
  on public.content_bookmarks for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.content_votes enable row level security;
create policy "content_votes: own"
  on public.content_votes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 관련 단지 연결: 연결된 콘텐츠가 발행 상태일 때만 공개
alter table public.content_complexes enable row level security;
create policy "content_complexes: public read"
  on public.content_complexes for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.contents c
      where c.id = content_id
        and c.status = 'published' and c.published_at <= now()
    )
  );
create policy "content_complexes: editor write"
  on public.content_complexes for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('cbl_editor', 'superadmin')
    )
  );
```

### D-05: 저장소 기존 RLS 관행을 따르지 않는 지점 2건 — 의도된 이탈

이 Phase는 저장소의 기존 패턴을 의도적으로 두 군데 어긴다. 리뷰에서 "일관성 위반"으로
지적되지 않도록 근거를 남긴다.

**① `TO` 절을 반드시 명시한다**

🔴 저장소의 유일한 anon-insert 선례 `20260430000009_rls.sql:151-153`은 **버그**다:

```sql
create policy "ad_events: authenticated insert"
  on public.ad_events for insert
  with check (true);          -- ← TO 절 없음
```

PostgreSQL 기본값은 `TO public`이므로 정책 이름은 "authenticated"인데 **실제로는
`anon`에도 적용된다.** 이 패턴을 복사하면 안 된다. (그 버그 자체의 수정은 이 Phase
범위 밖 — 별건 처리)

**② `contents`에 `using (true)`를 쓰지 않는다**

저장소에는 `using (true)`로 열고 앱 레이어에서 필터하는 관행이 있다
(예: `data_sources: public read`). `contents`에 그걸 적용하면 **draft·예약발행
콘텐츠 유출이 앱 코드 실수 하나에 달린다.** 발행 상태를 DB 레벨에서 강제한다.

**③ `subscribers`에 SELECT 정책을 만들지 않는다**

이메일 목록 덤프 방지. 그리고 `anon`이 임의 이메일의 구독 여부를 확인할 수 있으면
**이메일 존재 여부 오라클**이 된다. 구독 중복 판정("이미 구독 중이에요")은 창부레터
Server Action(`service_role`)에서만 수행한다 — 창부레터 저장소 소관이지만, 그쪽이
그렇게 만들 수 있도록 여기서 SELECT를 닫아둔다.

### D-06: 마이그레이션 분할 — Wave 경계와 일치

| Wave | 마이그레이션 | 내용 |
|------|-------------|------|
| 0 | `*_cbl_site_id_role_check.sql` | `site_id` CHECK 2건 + `profiles.role` CHECK 1건 |
| 1 | `*_cbl_content_schema.sql` | 테이블 5개 + 인덱스 4개 |
| 2 | `*_cbl_content_rls.sql` | RLS 정책 전체 |

Wave 0이 선행이어야 하는 이유: `contents.site_id` 기본값이 `'changbuletter'`이고
RLS 정책이 `role='cbl_editor'`를 참조한다. 순서를 어기면 제약 위반으로 실패한다.

인덱스는 **`CONCURRENTLY` 불필요** — 신규 생성 테이블이라 락 대상 행이 없다.
(참고: `20260728120000_transactions_dealtype_date_idx.sql`은 운영 중 테이블이라
`CONCURRENTLY`를 썼다. 여기는 상황이 다르다.)

### D-07: Claude's Discretion

- 마이그레이션 파일명 타임스탬프 접두어는 저장소 관행(`YYYYMMDDHHMMSS_`) 따름
- `src/types/database.ts` 생성 타입 갱신 방법(`supabase gen types` 또는 MCP
  `generate_typescript_types`) 선택은 planner 재량. **단 갱신은 필수** — 안 하면
  창부레터가 타입 없이 개발해야 함
- 권한 검증 테스트의 구현 방식(Vitest 통합 테스트 vs SQL 스크립트) 선택은 planner
  재량. 단 검증 항목은 Success Criteria 4번을 전부 커버해야 함
- `region_tags` 초기 시드 태그 목록은 이 Phase 범위 밖 (창부레터 어드민 UI 소관)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 설계 원본 (이 저장소 안 — 크로스 저장소 읽기 불필요)

| 파일 | 섹션 | 내용 |
|------|------|------|
| `.planning/vision/BRIEF.md` | **§25-1** | `contents` 외 5개 테이블 최종 DDL + 필드 결정 근거 |
| `.planning/vision/BRIEF.md` | **§25-6** | RLS 정책 전문 + `TO` 절 원칙 |
| `.planning/vision/BRIEF.md` | **§25-7** | 0단계 선행 작업 0-1~0-7 전체 목록 (이 Phase는 0-1~0-3) |
| `.planning/vision/BRIEF.md` | §25-0 | 2차 전수감사가 찾은 오류 11건 (왜 이 스키마가 이렇게 됐는지) |

### 기존 코드 — 반드시 읽을 것

| 파일:줄 | 왜 |
|---------|-----|
| `supabase/migrations/20260715000001_realtrade_story_site_scoping.sql:11,43` | 확장할 `site_id` CHECK 제약 2건의 정확한 제약명·현재 값 |
| `supabase/migrations/20260430000005_users.sql:8-9` | `profiles.role` 인라인 CHECK (제약명은 자동 생성 `profiles_role_check`) |
| `supabase/migrations/20260430000009_rls.sql:151-153` | 🔴 **`TO` 절 누락 버그.** 베끼지 말 것 — 반례로만 참고 |
| `supabase/migrations/20260430000009_rls.sql` (전체) | 저장소 RLS 작성 관행 (제약명 컨벤션·`exists` 서브쿼리 패턴) |
| `src/app/admin/layout.tsx:25` | `role in ('admin','superadmin')` 게이트 — **수정하지 않는다**(권한 격리의 핵심) |
| `supabase/migrations/20260728120000_transactions_dealtype_date_idx.sql` | 운영 중 테이블 인덱스에 `CONCURRENTLY`를 쓴 선례 (이 Phase는 신규 테이블이라 불필요) |

### 참고 — 창부레터 저장소 (읽기 선택)

`C:\Users\jung\coding\changbuletter\docs\adr\ADR-002-content-schema.md`,
`ADR-003-rls-and-data-security.md` — 위 §25-1·§25-6과 **동일 내용**의 이관본.
소비자(창부레터) 관점의 근거와 consequences가 추가돼 있다. 읽지 않아도 이 Phase는
수행 가능하다.

### 프로젝트 규약 (`CLAUDE.md`)

- 사용자 데이터 테이블은 **RLS 정책 필수**, `supabase/migrations/`에 포함
- 거래 조회는 `WHERE cancel_date IS NULL AND superseded_by IS NULL` 필수
  (이 Phase에는 해당 쿼리가 없지만 검증 테스트에서 `transactions`를 건드리면 적용)
- `complexes`가 Golden Record — `content_complexes`가 이를 FK로 참조

</canonical_refs>

<specifics>
## Specific Requirements

- **CBL-01** `site_id` CHECK 제약 2건(`favorites_site_id_check`,
  `ad_campaigns_site_id_check`)에 `'changbuletter'` 추가. 착수 시 grep으로 전수 재확인
- **CBL-02** `profiles_role_check`에 `'cbl_editor'` 추가. `admin/layout.tsx` 미수정
- **CBL-03** `contents` 테이블 + 인덱스 3개 (발행 피드 부분 인덱스, `region_tags` GIN,
  `category` 부분 인덱스)
- **CBL-04** `content_complexes` · `content_votes` · `content_bookmarks` 생성
- **CBL-05** `subscribers` 테이블 + `subscribers_send_idx` 부분 인덱스
- **CBL-06** 신규 테이블 5개 RLS. 모든 정책 `TO` 절 명시. `contents` `using (true)` 금지.
  `subscribers` SELECT 정책 미생성
- **CBL-07** 회귀·보안 검증 (Success Criteria 4번 전 항목)

</specifics>

<deferred>
## Deferred / Out of Scope

| 항목 | 이유 | 어디로 |
|------|------|--------|
| **0-4** 카드뉴스 슬라이드 데이터 DB 저장 | 파이프라인 코드 수정 + 소급 적재 판단 필요 (론칭 시점에 영향) | 후속 Phase |
| **0-5** `rank_type='price_change'` + 등락률 배치 | `molit-daily` 타임아웃 이력 때문에 배치 배치 위치 설계 판단 필요 | 후속 Phase |
| **0-6** 카드 템플릿 리브랜딩 + 비율 1080→1350 | 실제 발행되는 인스타 결과물이 바뀜 — 창부레터 오픈 시점과 맞춰야 함 (**사용자 결정 대기**) | 후속 Phase |
| **0-7** `refresh_complex_price_stats()` 소유권 이전 | 조사 성격 | 후속 Phase |
| `ad_events` `TO` 절 누락 버그 수정 | 기존 버그, 이 Phase의 신규 스키마와 무관 | 별건 |
| bds 애플리케이션 코드 변경 | DB 전용 Phase | — |
| 창부레터 앱 개발 (Next.js·Tiptap·구독 폼) | 별도 저장소 | `changbuletter` |
| `region_tags` 초기 시드 태그 목록 | 어드민 UI 소관 | `changbuletter` |
| 광고 슬롯 `site_id='changbuletter'` 실제 운용 | 창부레터 확장기 (초기 6개월 광고 없음) | 나중에 |

</deferred>

<scope_fence>
## Scope Fence

**절대 하지 말 것**

1. **스키마 재설계 금지.** D-03·D-04의 DDL을 필드 추가·제거·타입 변경 없이 그대로
   적용한다. 창부레터 저장소의 ADR과 불일치하면 두 저장소가 갈라진다
2. **`src/app/admin/layout.tsx` 수정 금지.** 그 파일을 건드리지 않는 것이 권한
   격리의 구현이다
3. **`20260430000009_rls.sql`의 `ad_events` 정책 패턴 복사 금지** — `TO` 절 누락 버그
4. **`contents`에 `using (true)` 금지**
5. **`subscribers`에 SELECT 정책 생성 금지**
6. **기존 테이블의 데이터 변경 금지.** CHECK 제약 확장은 허용 값을 넓히기만 하므로
   기존 행에 영향이 없어야 한다 — 마이그레이션에 `UPDATE`가 들어가면 잘못된 것
7. **애플리케이션 코드 변경 금지** (`src/types/database.ts` 생성 타입 갱신은 예외 —
   필수)
8. **0-4~0-7 작업 금지** — `card-news/`, `src/lib/cardnews/`,
   `complex_rankings` 관련 파일에 손대지 않는다

**프로덕션 DB 주의**

이 마이그레이션은 **운영 중인 서비스 2개(danjiondo·realtrade-story)가 쓰는
프로덕션 DB**에 들어간다. 신규 테이블 생성은 additive라 안전하지만, CHECK 제약
변경은 `DROP` → `ADD`로 짧은 ACCESS EXCLUSIVE 락이 걸린다. 계획에 락 구간을
명시하고, `npm run db:push` 실행 전 사용자에게 알린다.

</scope_fence>

## Success Criteria

1. `site_id='changbuletter'` insert가 `favorites`·`ad_campaigns`에서 성공하고,
   기존 `danjiondo`·`realtrade-story` 행 수가 마이그레이션 전후 동일
2. `profiles.role='cbl_editor'` 설정이 성공하고, 해당 role로는 bds 어드민
   콘솔(`/admin/*`)에 진입 불가 (`admin/layout.tsx` 게이트 미변경으로 자동 충족)
3. 신규 테이블 5개 + 인덱스 4개가 존재하고 D-03의 DDL과 컬럼·제약·기본값이 일치
4. 권한 검증 전 항목 통과:
   - `anon`으로 `draft`·`scheduled` 상태 `contents` 조회 → **0행**
   - `anon`으로 `published`이지만 `published_at > now()` (미래 예약) 조회 → **0행**
   - `anon`으로 `subscribers` SELECT → **거부**
   - `anon`으로 `subscribers` INSERT (`status='pending'`) → **성공**
   - `anon`으로 `subscribers` INSERT (`status='confirmed'`) → **거부**
   - `anon`으로 draft 콘텐츠의 `content_complexes` 조회 → **0행**
5. `npm run lint`(ESLint + tsc) 통과 — `src/types/database.ts` 갱신 포함
6. 기존 테스트 스위트(`npm run test`) 통과 — danjiondo·realtrade-story 회귀 없음

## Risk Summary

| 위험 | 완화 |
|------|------|
| CHECK 제약 `DROP`→`ADD` 사이 짧은 락으로 운영 서비스에 순간 영향 | 대상이 `favorites`·`ad_campaigns`·`profiles`로 전부 작은 테이블. 단일 트랜잭션으로 묶어 락 구간 최소화 |
| 스키마가 창부레터 ADR과 갈라짐 | Scope Fence 1번 — DDL 그대로 적용. 검증에서 컬럼·제약·기본값 일치 확인 |
| `TO` 절 누락(기존 버그 패턴 복사) | Scope Fence 3번 + Success Criteria 4번의 `anon` 거부 테스트가 실측으로 잡아냄 |
| draft 유출 | DB 레벨 강제(`using (true)` 금지) + `anon` 조회 0행 검증 |
| `subscribers` 이메일 목록 노출 | SELECT 정책 미생성 + `anon` SELECT 거부 검증 |
| `src/types/database.ts` 갱신 누락 → 창부레터가 타입 없이 개발 | Success Criteria 5번에 포함 |
| 마이그레이션 순서 위반(Wave 0 없이 Wave 1) | D-06 Wave 경계 = 마이그레이션 경계. 타임스탬프 순서로 강제됨 |
