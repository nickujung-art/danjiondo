-- ad_campaigns.placement 제약에 realtrade-story 지면 3종을 기록한다 (2026-08-26)
--
-- ── 이건 새 변경이 아니라 **원장 복원**이다 ────────────────────────────────
-- realtrade-story 가 광고를 등록하려다 거절당했고:
--
--     new row for relation "ad_campaigns" violates check constraint
--     "ad_campaigns_placement_check"
--
-- 급해서 Supabase SQL Editor 로 먼저 제약을 확장했다. 그래서 **실물에는 반영됐지만
-- 마이그레이션 원장에는 없다.** 그대로 두면 `db reset` 시 이 값들이 사라져
-- realtrade-story 광고 적재가 통째로 깨진다.
--
-- 이 저장소가 이미 겪은 drift 유형이다(선례: 20260728120000·20260731000001 —
-- CONCURRENTLY 인덱스를 별도 경로로 적용하고 repair 를 빠뜨린 건).
--
-- ── 🔴 추측으로 쓰지 않았다 ────────────────────────────────────────────────
-- 빠뜨린 값이 있으면 그 지면의 광고가 통째로 막힌다. `supabase db dump --linked` 로
-- 실물 정의를 받아 **그대로** 옮겼다. 2026-08-26 시점 실측:
--
--   CHECK ((placement = ANY (ARRAY[
--     'banner_top', 'sidebar', 'in_feed', 'map_popup',
--     'complex_detail_presale_banner', 'complex_detail_agent_block', 'home_feed_banner'
--   ])))
--
-- ── 왜 이름을 danjiondo 쪽에 맞추지 않았나 (realtrade-story 판단) ──────────
-- `banner_top`·`sidebar` 는 danjiondo 레이아웃의 이름이라 realtrade-story 화면에서는
-- 뜻이 통하지 않는다(그쪽엔 사이드바가 없다). 지면 이름이 자리를 설명하지 못하면
-- 광고주에게 무엇을 파는지 설명할 때부터 어긋난다.
-- `getActiveAds` 가 site_id 로 거르므로(20260826, src/lib/data/ads.ts) 두 사이트의
-- 값이 한 테이블에 섞여도 서로 간섭하지 않는다.
--
-- 🔴 danjiondo 기존 4값을 빼지 않는다. 그 값을 쓰는 행이 9건 남아 있고, 빼면 그
--    행들이 이후 UPDATE 에서 거절된다(CHECK 는 UPDATE 시에도 재평가된다).
--
-- 근거 문서: realtrade-story/.planning/data-quality/HANDOFF-bds-20260826-placement-check.md
--            bds/.planning/vision/06-ads-events-handoff.md §6

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_placement_check;

alter table public.ad_campaigns
  add constraint ad_campaigns_placement_check
  check (placement in (
    -- danjiondo — 지우지 않는다
    'banner_top',
    'sidebar',
    'in_feed',
    'map_popup',
    -- realtrade-story
    'complex_detail_presale_banner',
    'complex_detail_agent_block',
    'home_feed_banner'
  ));

-- ── [적용 후 검증] ─────────────────────────────────────────────────────────
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'ad_campaigns_placement_check';
-- 7개 값이 모두 보여야 한다. 지면을 새로 추가할 때는 이 파일에 값을 더하는
-- 마이그레이션을 남긴다 — SQL Editor 로 끝내면 같은 drift 가 반복된다.
