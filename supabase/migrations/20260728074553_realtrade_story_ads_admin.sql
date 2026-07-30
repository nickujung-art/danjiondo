-- Phase 37 복원 — 원장 version 20260728074553에서 추출, 프로덕션 그대로 재현 (개선 금지: D-03)

-- Phase 4 (realtrade-story): site_admin_roles table + RLS policies for ad_campaigns,
-- presale_discoveries, new_listings, and the new realtrade-story-ad-images Storage bucket.
-- Applies to shared Supabase project auoravdadyzvuoxunogh (danjiondo + realtrade-story).

create table public.site_admin_roles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  site_id     text not null check (site_id in ('danjiondo', 'realtrade-story')),
  role        text not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (user_id, site_id)
);

alter table public.site_admin_roles enable row level security;

-- Owner-only self-check — deliberately NO insert/update/delete policy for `authenticated`;
-- role grants happen only via service_role/SQL editor, never from the client.
create policy "site_admin_roles: owner read"
  on public.site_admin_roles for select
  using (auth.uid() = user_id);

-- ── ad_campaigns: realtrade-story site-admin write/read-all ──
create policy "ad_campaigns: realtrade-story admin insert"
  on public.ad_campaigns for insert
  with check (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );

create policy "ad_campaigns: realtrade-story admin update"
  on public.ad_campaigns for update
  using (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );

create policy "ad_campaigns: realtrade-story admin read all"
  on public.ad_campaigns for select
  using (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );

-- ── presale_discoveries: extend admin gate to site_admin_roles ──
create policy "presale_discoveries: realtrade-story site admin all"
  on public.presale_discoveries for all
  using (
    exists (select 1 from public.site_admin_roles
            where user_id = auth.uid() and site_id = 'realtrade-story')
  );

-- ── new_listings: realtrade-story admin insert (D-14 — full-parity confirm write) ──
create policy "new_listings: realtrade-story admin insert"
  on public.new_listings for insert
  with check (
    exists (select 1 from public.site_admin_roles
            where user_id = auth.uid() and site_id = 'realtrade-story')
  );

-- ── NEW Storage bucket for ad creatives, following the gps-docs precedent exactly ──
insert into storage.buckets (id, name, public)
values ('realtrade-story-ad-images', 'realtrade-story-ad-images', true)
on conflict (id) do nothing;

create policy "realtrade-story-ad-images: site admin upload"
  on storage.objects for insert
  with check (
    bucket_id = 'realtrade-story-ad-images'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );
