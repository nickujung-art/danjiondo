-- ============================================================
-- 창부레터 공유 스키마 0단계 0-3: 콘텐츠 스키마 5개 테이블
-- 원본: .planning/vision/BRIEF.md §25-1
-- 창부레터 저장소 docs/adr/ADR-002-content-schema.md 와 동일 내용 (일치 필수)
-- RLS는 후속 마이그레이션 20260730000003_cbl_content_rls.sql 에서 적용됨
-- ============================================================

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
