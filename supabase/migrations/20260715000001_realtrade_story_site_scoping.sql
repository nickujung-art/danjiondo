-- 실거래이야기(realtrade-story)가 danjiondo와 같은 Supabase 프로젝트를 공유하면서
-- favorites/ad_campaigns가 두 사이트 간에 섞여 보이는 문제를 막기 위한 site_id 분리.
-- 조건부 가격알림(전고점 대비 하락률)에 필요한 컬럼도 함께 추가.
-- 참고: .planning/vision/02-realtrade-story.md §9(0단계), §10(항목2·3)

-- ── favorites: site_id 분리 ──
alter table public.favorites
  add column site_id text not null default 'danjiondo';

alter table public.favorites
  add constraint favorites_site_id_check check (site_id in ('danjiondo', 'realtrade-story'));

-- 기존엔 (user_id, complex_id) 단독 unique라 한 유저가 danjiondo에서 즐겨찾기한 단지를
-- realtrade-story에서 다시 즐겨찾기하면 충돌했음 — site_id를 묶어 사이트별로 독립되게 함
alter table public.favorites
  drop constraint favorites_user_id_complex_id_key;

alter table public.favorites
  add constraint favorites_user_id_complex_id_site_id_key unique (user_id, complex_id, site_id);

create index favorites_site_id_idx on public.favorites (site_id);

-- ── favorites: 조건부 가격알림 — 전고점 대비 하락률 조건 + 평형(면적타입) 단위 스코프 ──
-- price_alert_threshold(절대가)는 기존 컬럼 재사용. 하락률 조건만 신규.
alter table public.favorites
  add column area_type_id uuid references public.complex_area_types(id) on delete set null;

alter table public.favorites
  add column price_drop_rate_threshold numeric;

alter table public.favorites
  add constraint favorites_price_drop_rate_threshold_check
  check (price_drop_rate_threshold is null or (price_drop_rate_threshold > 0 and price_drop_rate_threshold <= 100));

comment on column public.favorites.price_drop_rate_threshold is
  '전고점 대비 하락률(%) 알림 조건. 전고점은 알림 체크 시점에 실거래 이력에서 매번 재계산 — 스냅샷 저장 안 함';

-- ── ad_campaigns: site_id 분리 ──
alter table public.ad_campaigns
  add column site_id text not null default 'danjiondo';

alter table public.ad_campaigns
  add constraint ad_campaigns_site_id_check check (site_id in ('danjiondo', 'realtrade-story'));

create index ad_campaigns_site_id_idx on public.ad_campaigns (site_id);
