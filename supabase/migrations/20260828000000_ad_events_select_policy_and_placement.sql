-- 인계: realtrade-story HANDOFF-bds-20260828-ad-events-select.md
-- 두 건 모두 더하기만 하고 기존 값·권한은 건드리지 않는다.

-- ============================================================
-- 1. ad_events: 사이트 관리자 SELECT 정책
-- ============================================================
-- RLS 가 켜져 있는데 SELECT 정책이 0개라 아무도 읽을 수 없다.
-- site_admin_roles 에 등록된 관리자가 자기 사이트 캠페인의 이벤트를 읽는다.
-- 일반형이라 danjiondo·realtrade-story·changbuletter 모두 같은 규칙.
create policy "ad_events: site admin read"
on public.ad_events for select
to authenticated
using (
  exists (
    select 1
    from public.ad_campaigns c
    join public.site_admin_roles r
      on r.site_id = c.site_id
     and r.user_id = auth.uid()
    where c.id = ad_events.campaign_id
  )
);

-- ============================================================
-- 2. ad_campaigns: placement CHECK 확장 — 신규 2종
-- ============================================================
-- presale_detail_banner  : /presale/[id] 분양 상세
-- region_feed_banner     : /region/[slug] 지역 페이지
alter table public.ad_campaigns drop constraint ad_campaigns_placement_check;
alter table public.ad_campaigns add constraint ad_campaigns_placement_check
  check (placement = any (array[
    -- danjiondo 4종
    'banner_top', 'sidebar', 'in_feed', 'map_popup',
    -- realtrade-story 기존 3종
    'complex_detail_presale_banner', 'complex_detail_agent_block', 'home_feed_banner',
    -- realtrade-story 신설 2종
    'presale_detail_banner', 'region_feed_banner'
  ]::text[]));
