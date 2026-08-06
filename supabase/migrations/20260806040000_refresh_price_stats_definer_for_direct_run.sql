-- refresh_complex_price_stats 를 DB 직결로 돌리기 위한 권한 정리 (2026-08-06)
--
-- [배경]
-- 이 함수는 PostgREST 로 호출되는 한 절대 완주할 수 없다. 실측:
--   * 함수 실행           41~46초 (집합 기반 재작성 후에도 전체 이력 집계 13.4초 + UPDATE 8초)
--   * PostgREST 세션 상한  8초 (authenticator 롤의 statement_timeout)
-- 함수 단위 `SET statement_timeout` 은 이미 걸린 타이머를 재무장하지 않아 소용이 없다
-- (세션 2s + 함수 60s + pg_sleep(5) → 여전히 57014 로 실험 확인).
--
-- 그래서 PostgREST 를 우회해 psql 직결로 돌린다(.github/workflows/refresh-price-stats.yml).
-- 직결에는 statement_timeout 이 걸려 있지 않아 완주한다(backup_agent rolconfig 비어 있음,
-- DB 기본 설정에도 statement_timeout 없음 — 확인함).
--
-- [이 마이그레이션이 하는 일]
-- 직결에 쓸 수 있는 로그인 롤은 backup_agent 하나뿐인데(BACKUP_AGENT_PASSWORD 시크릿이
-- 이미 있고 db-backup.yml 이 쓰고 있다), 이 롤은 pg_read_all_data 멤버라 **읽기만** 된다.
-- complexes UPDATE 권한이 없으므로 SECURITY INVOKER 인 채로는 permission denied 가 난다.
--
-- 함수를 SECURITY DEFINER 로 바꿔 소유자(postgres) 권한으로 실행하게 한다. 그러면
-- 백업 롤에 쓰기 권한을 주지 않고도 이 배치만 돌릴 수 있다.
--
-- [보안 고려]
--   * 본문은 이미 모든 객체를 public. 으로 수식하고 있어 `SET search_path = ''` 를 함께 건다.
--     (수식 없이 DEFINER 를 걸면 search_path 조작으로 권한 상승이 가능하다.)
--   * 기본 EXECUTE 는 PUBLIC 에 열려 있다 — 이 배치는 41초짜리 전체 UPDATE 라 Free 티어에서
--     그대로 DoS 수단이다. PUBLIC·anon·authenticated 에서 회수하고 실제로 돌릴 둘에만 남긴다.
--   * backup_agent 가 이 배치를 트리거할 수 있게 되는 것은 트레이드오프다. 다만 이 함수는
--     멱등한 재계산이라 파괴적이지 않고, 자격증명이 새더라도 할 수 있는 일은 "지표 재계산"뿐이다.
--     쓰기 권한 자체를 백업 롤에 주는 것보다 훨씬 좁다.

CREATE OR REPLACE FUNCTION public.refresh_complex_price_stats()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.complexes c
  SET
    avg_sale_per_pyeong = s.avg_pp,
    price_change_30d    = s.chg,
    tx_count_30d        = COALESCE(s.cnt_30d, 0),
    is_new_record_30d   = s.new_record,
    updated_at          = now()
  FROM (
    SELECT
      c2.id,
      avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
        WHERE t.area_m2 > 0 AND t.deal_date >= CURRENT_DATE - INTERVAL '1 year'
      )::integer AS avg_pp,
      count(*) FILTER (
        WHERE t.deal_date >= CURRENT_DATE - INTERVAL '30 days'
      )::integer AS cnt_30d,
      CASE
        WHEN avg(t.price) FILTER (
               WHERE t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                 AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') IS NULL
          OR avg(t.price) FILTER (
               WHERE t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                 AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') = 0
        THEN NULL
        ELSE round((
          ( avg(t.price) FILTER (WHERE t.deal_date >= CURRENT_DATE - INTERVAL '30 days')
          - avg(t.price) FILTER (WHERE t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                                   AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') )
          / avg(t.price) FILTER (WHERE t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                                   AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days')
        )::numeric, 4)
      END AS chg,
      CASE
        WHEN max(t.price / NULLIF(t.area_m2, 0)) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days') IS NULL THEN false
        WHEN max(t.price / NULLIF(t.area_m2, 0)) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') IS NULL THEN false
        WHEN max(t.price / NULLIF(t.area_m2, 0)) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days')
           > max(t.price / NULLIF(t.area_m2, 0)) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') * 1.03 THEN true
        ELSE false
      END AS new_record
    FROM public.complexes c2
    LEFT JOIN public.transactions t
      ON  t.complex_id    = c2.id
      AND t.deal_type     = 'sale'
      AND t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
    WHERE c2.status = 'active'
    GROUP BY c2.id
  ) s
  WHERE s.id = c.id;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_complex_price_stats() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_complex_price_stats() TO service_role, backup_agent;

COMMENT ON FUNCTION public.refresh_complex_price_stats() IS
  '단지 가격 파생값 배치 집계. PostgREST 8초 타임아웃을 넘길 수 없어 psql 직결로 돌린다 '
  '(.github/workflows/refresh-price-stats.yml). SECURITY DEFINER — backup_agent 가 쓰기 권한 '
  '없이 트리거할 수 있게 하기 위함. EXECUTE 는 service_role·backup_agent 로 제한.';
