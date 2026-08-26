-- realtrade-story 가 service-role 키 없이 광고 이벤트를 적재할 수 있게 한다 (2026-08-26)
--
-- ── 왜 RPC 인가 ────────────────────────────────────────────────────────────
-- ad_events 의 INSERT 정책은 `TO authenticated WITH CHECK (auth.uid() is not null)`
-- 이다(20260618085906). 광고는 비로그인 방문자에게도 노출되므로 anon 으로는
-- 42501 로 막힌다 — 실측으로 재현했다:
--
--   anon INSERT → 42501 new row violates row-level security policy for "ad_events"
--   anon SELECT → 에러 없이 0행 (ad_events 에는 SELECT 정책이 아예 없다)
--
-- realtrade-story 에는 service-role 키가 없고 앞으로도 두지 않는다. 그 저장소의
-- RISKS.md SEC-01 이 **"service-role 키가 없어 Postgres RLS 가 유일한 강제 계층"**
-- 을 다른 보안 판정의 전제로 쓰고 있어서, 광고 이벤트 하나 때문에 그 전제를 깨지 않는다.
-- 그래서 노출면이 좁은 SECURITY DEFINER 함수 하나만 연다.
--
-- 대안이었던 "anon 에게 ad_events INSERT 정책을 연다" 는 택하지 않았다 —
-- RLS 정책으로는 event_type 허용목록·캠페인 소속·ip_hash 형식을 함께 강제하기 어렵고,
-- 열어 준 뒤에는 컬럼 단위 제한이 사실상 불가능하다. 이 함수는 컬럼 4개를 고정 형태로
-- 넣는 일만 하므로 훨씬 좁다. (같은 판단의 선례: 20260731000005 increment_view_count)
--
-- ── 🔴 SECURITY DEFINER + search_path = '' + 전 객체 스키마 수식 ───────────
-- 셋을 함께 지킨다. 하나라도 빠지면 이 저장소가 이미 세 번 당한 함정에 다시 걸린다:
--   increment_view_count  SECURITY INVOKER 라 RLS 에 막혀 **0행·무에러**로 조용히 실패
--   get_hagwon_grade      search_path='' 인데 테이블 미수식 → 호출 즉시 relation 없음
--   match_complex_by_admin search_path='' + pg_trgm 미수식 → 함수가 통째로 죽음
--
-- ── 설계 판단 ──────────────────────────────────────────────────────────────
-- ① returns uuid (요청서의 void 에서 바꿨다)
--    요청서가 지목한 실패 유형이 정확히 **"에러도 없고 행도 안 늘어난다"** 이다.
--    void 를 돌려주면 호출부가 성공과 무행위를 구분할 수 없다. 삽입된 id 를 돌려주면
--    `data` 가 null 인 순간 곧바로 이상이라는 뜻이 된다 — 구분을 타입으로 만든다.
--
-- ② 캠페인 소속(site_id)을 여기서도 검사한다 ← 요청서 대비 유일한 기능 추가
--    요청서는 "site_id 확인은 호출자가 한다" 고 했다. 그 검사 자체는 옳지만
--    **anon 키는 브라우저 번들에 그대로 실려 공개**라, 라우트를 거치지 않고 이 RPC 를
--    직접 부르면 그 검사는 통째로 우회된다. 그러면 danjiondo 캠페인 9건에
--    임의의 노출·클릭을 꽂을 수 있고, 그건 정산 데이터다.
--    호출자가 이미 쓰는 것과 **같은 술어**를 DB 에 둘 뿐이라 정상 트래픽의 동작은
--    똑같고, 우회만 불가능해진다.
--    🔶 realtrade-story 가 danjiondo 캠페인을 대신 노출할 일이 생기면 여기를 고쳐야 한다.
--
-- ③ status·기간은 검사하지 않는다 (의도적)
--    이벤트 로그는 **실제로 일어난 일**을 적는 자리다. 서빙 쿼리가 이미
--    status='approved' AND now() between starts_at and ends_at 를 강제한다(CLAUDE.md).
--    여기서 또 막으면 만료 직후 도착한 정상 클릭이나 관리자가 방금 일시정지한
--    캠페인의 잔여 노출이 에러가 된다. 집계 단계에서 거르는 편이 정확하다.
--
-- ④ ip_hash 는 형식만 검사한다
--    호출자가 "원본 IP 는 어디에도 저장하지 않는다" 를 규약으로 삼고 있으므로,
--    그 규약을 **구조로** 만든다. 해시 인코딩(hex·base64)을 가정하지 않고
--    "주소처럼 생긴 것" 만 거부한다 — IPv4 점4분할, 그리고 콜론 포함(IPv6·host:port).
--    hex/base64/base64url 에는 콜론이 없으므로 정상 해시는 절대 걸리지 않는다.
--    길이 상한 128 은 저장소 남용 방지다.
--
-- ⑤ is_anomaly 는 항상 false (요청서 그대로)
--    요청 시점 판정은 과거 이력 조회를 광고 1회마다 왕복시킨다. 사후 집계가 맞다.
--    🔶 다만 bds 자신의 /api/ads/events 는 click 에 한해 일별 한도로 is_anomaly 를
--       세팅한다. 두 사이트 이벤트를 한 리포트에서 볼 때 이 축의 커버리지가
--       비대칭이라는 점을 알고 봐야 한다.
--
-- ── 🔴 레이트리밋을 이 함수 안에 넣지 않은 이유 ────────────────────────────
-- 넣어도 의미가 없다. ip_hash 를 **호출자가 준다.** (campaign_id, ip_hash) 당 분당 N건
-- 같은 제한을 걸어도 공격자는 ip_hash 만 바꾸면 그만이다. 비용만 늘고 방어력은 0 이다.
-- 실효 방어는 ⑴ 호출자 라우트의 IP 기준 제한(정직한 클라이언트 보호) ⑵ 사후 이상탐지
-- 두 층이며, 그건 이 함수의 책임 밖이다.
-- 참고로 노출면 자체는 새로 생기는 게 아니다 — bds 의 /api/ads/events 도 인증 없는
-- 공개 POST 라 같은 남용이 이미 가능하다. 이 RPC 는 그 면을 danjiondo 캠페인에
-- 닿지 않도록 ②로 좁혀 둔 형태다.

create or replace function public.record_ad_event(
  p_campaign_id uuid,
  p_event_type  text,
  p_ip_hash     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_site text;
  v_id   uuid;
begin
  -- ① 허용목록. 자유 문자열이면 리포트 집계가 무너진다.
  if p_event_type is null or p_event_type not in ('impression', 'click') then
    raise exception 'invalid event_type: %', coalesce(p_event_type, '(null)')
      using errcode = '22023';
  end if;

  -- ② ip_hash 는 해시여야 한다. 주소처럼 생긴 값은 거부한다(PII 유입 차단).
  if p_ip_hash is not null then
    if length(p_ip_hash) > 128 then
      raise exception 'ip_hash too long: % chars (max 128)', length(p_ip_hash)
        using errcode = '22023';
    end if;
    if p_ip_hash ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' or position(':' in p_ip_hash) > 0 then
      raise exception 'ip_hash must be a hash, not an address'
        using errcode = '22023';
    end if;
  end if;

  -- ③ 캠페인 존재 + 소속 확인.
  --    🔴 "없음" 과 "남의 캠페인" 을 같은 메시지로 돌려준다 — 다르게 답하면
  --       uuid 존재 여부를 알려주는 오라클이 된다.
  select c.site_id into v_site
  from public.ad_campaigns c
  where c.id = p_campaign_id;

  if v_site is distinct from 'realtrade-story' then
    raise exception 'unknown or out-of-scope campaign: %', p_campaign_id
      using errcode = '22023';
  end if;

  insert into public.ad_events (campaign_id, event_type, ip_hash, is_anomaly)
  values (p_campaign_id, p_event_type, p_ip_hash, false)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.record_ad_event(uuid, text, text) is
  'realtrade-story 전용 광고 이벤트 적재. anon 이 service-role 키 없이 부를 수 있는 '
  '유일한 ad_events 쓰기 경로다. site_id=''realtrade-story'' 캠페인만 받으며 '
  '삽입된 ad_events.id 를 돌려준다(무행위와 성공을 구분하려고 void 를 쓰지 않았다).';

-- 🔴 PostgreSQL 은 새 함수의 EXECUTE 를 **PUBLIC 에 기본 부여**한다.
--    grant 만 쓰고 revoke 를 빠뜨리면 지금도, 앞으로 생길 모든 롤도 실행할 수 있다.
--    SECURITY DEFINER 함수에서는 이걸 반드시 되돌린 뒤 필요한 롤에만 준다.
revoke execute on function public.record_ad_event(uuid, text, text) from public;
grant  execute on function public.record_ad_event(uuid, text, text) to anon, authenticated;

-- ── [적용 후 검증] db push 성공은 검증이 아니다 (CLAUDE.md CRITICAL) ────────
-- plpgsql 은 지연 바인딩이라 본문 오류가 실행 시점에야 드러난다. 반드시 호출한다.
--   ⑴ anon 키로 record_ad_event 호출 → 반환 uuid 가 null 이 아니어야 한다
--   ⑵ service role 로 ad_events count 가 정확히 1 늘었는지 확인
--      (anon 은 ad_events SELECT 정책이 없어 카운트를 볼 수 없다)
--   ⑶ danjiondo 캠페인 id 로 호출 → 거부돼야 한다 (②가 살아 있다는 증거)
--   ⑷ event_type='hack', ip_hash='1.2.3.4' → 각각 거부돼야 한다
