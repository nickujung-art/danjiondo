-- ad_campaigns: realtrade-story 사이트 관리자에게 DELETE 정책 부여
--
-- [왜 필요한가 — 삭제가 "성공"을 보고하면서 아무것도 안 지우고 있었다]
-- 20260728074553 이 realtrade-story 관리자용 ad_campaigns 정책을 만들 때 insert/update/select
-- 셋만 넣고 delete 를 빠뜨렸다. 그런데 realtrade-story 어드민 화면에는 삭제 버튼이 있다.
--
-- RLS 는 매칭되는 정책이 없으면 기본 거부인데, **거부된 DELETE 는 에러가 아니라 0행 결과**로
-- 끝난다. 그래서 앱의 `deleteAdCampaign()` 은 `error` 가 null 인 걸 보고 성공으로 처리했고,
-- 관리자는 광고를 지웠다고 믿는데 광고는 그대로 게재됐다. 만료·부적절 광고를 방치하게 되는
-- 실질 위험이 있었다(2026-08-10 라이브 확인: INSERT 2 / SELECT 3 / UPDATE 2 / DELETE 0).
--
-- 앱 쪽은 이미 방어했다 — `.select('id')` 로 실제 삭제 행을 확인해 0행이면 실패로 보고한다
-- (realtrade-story 커밋 809973c). 그래서 지금은 "권한이 없어 처리하지 못했어요"로 정직하게
-- 실패하는 상태이고, 이 마이그레이션이 실제로 지울 수 있게 만든다.
--
-- [범위]
-- 기존 세 정책과 **완전히 같은 조건**을 쓴다: site_id 가 realtrade-story 이고, 호출자가
-- 그 사이트의 site_admin_roles 에 있을 것. danjiondo 행은 site_id 조건에서 걸러지므로
-- 이 정책으로는 건드릴 수 없다(공유 DB 이므로 이 점이 중요하다).
--
-- advertiser(광고주) 에게는 삭제를 주지 않는다. 승인·게재 이력이 남아야 하는 데이터라
-- 광고주 셀프 삭제는 별도 논의가 필요하고, 지금 고치려는 문제도 아니다.

create policy "ad_campaigns: realtrade-story admin delete"
  on public.ad_campaigns for delete
  using (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );
