-- refresh_complex_price_stats() 집합 기반 재작성 (2026-08-06)
--
-- ============================================================
-- 증상
-- ============================================================
-- complexes의 파생 4컬럼(avg_sale_per_pyeong / price_change_30d / tx_count_30d /
-- is_new_record_30d)이 2026-07-09 이후 4주간 갱신되지 않았다.
-- 이 함수는 WHERE status='active' 전체에 updated_at=now()를 찍으므로 updated_at
-- 분포가 곧 마지막 성공 시각인데, 2026-07-09에 2,718곳이 몰려 있었다.
--
-- 사용자 영향: 랭킹 변동률·즐겨찾기 배지(price_change_30d), 지역 내 백분위·평당가
-- 랭킹·지도 핀(avg_sale_per_pyeong)이 4주 낡은 값이었다. price_change_30d는 정의상
-- 30일 롤링이라 갱신이 멈추면 틀린 게 아니라 의미가 없어진다.
--
-- ============================================================
-- 원인 — RLS가 아니라 statement timeout
-- ============================================================
-- 처음에 RLS를 의심했으나 **틀렸다**. 이 함수가 SECURITY DEFINER가 아니고
-- complexes에 UPDATE 정책이 0개인 것은 사실이지만, 크론(/api/cron/daily)은
-- createSupabaseAdminClient() = service_role을 쓰고 service_role은 rolbypassrls=true다.
-- 실제로 service_role로 시험하면 complexes 4,205행이 정상 갱신된다.
-- increment_view_count가 걸렸던 함정(F-01-28)과 겉모습이 같아 오진하기 쉬우니 남겨둔다.
--
-- 진짜 원인:
--   * PostgREST는 authenticator로 접속한 뒤 SET ROLE 하므로 세션의
--     statement_timeout=8s가 그대로 적용된다.
--   * 상관 서브쿼리 구현이 활성 단지마다 transactions를 4번씩 조회해 **실측 41.5초**.
--   * 8초에 중단되고 route.ts:306의 catch가 errors 배열에 담아 넘긴다. 에러가 표면에
--     드러나지 않아 4주간 아무도 몰랐다(data_sources.daily-batch = 'partial').
--   * 2026-07-09까지 동작한 이유는 데이터가 작았기 때문이다. 거래가 쌓이며 8초를
--     넘었고, 넘는 순간부터 조용히 아무 일도 하지 않게 됐다.
--
-- 함수 단위 `SET statement_timeout`은 해결책이 아니다 — 이미 걸린 타이머를 재무장하지
-- 않는다는 것을 실험으로 확인했다(세션 2s + 함수 60s + pg_sleep(5) → 여전히 57014).
--
-- ============================================================
-- 이 마이그레이션이 하는 일
-- ============================================================
-- 단지별 상관 서브쿼리(4,205 × 4회) 대신 transactions를 complex_id로 한 번만 집계한다.
-- 계산 정의(창·필터·반올림·1.03 배수)는 20260618000003과 동일하며, 적용 후 4,205곳
-- 전 컬럼을 원본 공식과 대조해 **차이 0건**을 확인했다.
--
-- ============================================================
-- 이것만으로는 부족하다 — 남은 과제
-- ============================================================
-- 재작성 후에도 전체 실행은 8초 아래로 내려가지 않는다(실측):
--   * 1년치 3개 지표 집계        0.12초
--   * complexes 4,205행 UPDATE   약 8초   ← 인덱스 14개 + Free 티어 IO
--   * 전체 이력 집계(신고가 판정) 13.4초  ← 매매 549,186행, 전고점은 전 기간이 필요
--   * 400곳 배치                 10.6초  ← 선형보다 나쁘고 편차가 크다
-- 즉 **쿼리 최적화만으로 8초를 보장할 수 없다.** 근본 해결은 둘 중 하나다.
--   (A) PostgREST를 우회 — GitHub Actions에서 DB 직결로 호출(쓰기 가능 롤 + 시크릿 필요)
--   (B) Supabase Pro 전환(OPS-04, 이미 런칭 게이트) — IO 여유 확보
-- 그때까지는 이 함수를 psql/MCP 등 타임아웃이 없는 경로에서 수동 호출해야 한다.
--
-- 그리고 무엇을 하든 **실패를 조용히 넘기지 않는 것**이 먼저다. 이번에 4주를 놓친
-- 이유는 성능이 아니라 침묵이었다 — route.ts에서 이 단계의 에러를
-- data_sources.error_message에 남기면 다음번엔 하루 만에 드러난다.
--
-- CRITICAL(CLAUDE.md): cancel_date IS NULL AND superseded_by IS NULL 유지.
-- price_change_30d는 numeric(5,4) 비율(0.1050 = +10.5%), avg_sale_per_pyeong은 만원/평 정수.
-- avg_sale_per_pyeong에 /10000을 다시 넣지 말 것 — 20260618000003이 고친 정수 나눗셈
-- 버그다(4153/10000 = 0). 이번 작업 중에 실수로 되살렸다가 2,757곳이 오염돼 되돌렸다.

CREATE OR REPLACE FUNCTION public.refresh_complex_price_stats()
RETURNS void
LANGUAGE sql
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
      -- 최근 1년 평당가(만원/평). ::integer 캐스트는 avg 결과에만 건다.
      avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
        WHERE t.area_m2 > 0 AND t.deal_date >= CURRENT_DATE - INTERVAL '1 year'
      )::integer AS avg_pp,
      count(*) FILTER (
        WHERE t.deal_date >= CURRENT_DATE - INTERVAL '30 days'
      )::integer AS cnt_30d,
      -- 최근 30일 평균 vs 직전 30일(60~30일 전) 평균. 기준 구간이 비면 NULL —
      -- 0으로 두면 "변동 없음"으로 읽혀 ADR-005가 금지하는 오독을 만든다.
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
      -- 신고가 배지: 최근 30일 ㎡당 최고가가 그 이전 전 기간 최고가의 1.03배 초과.
      -- 전고점은 1년으로 자를 수 없어 아래 LEFT JOIN에 날짜 하한을 두지 않는다.
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
    -- LEFT JOIN이어야 한다. INNER로 바꾸면 거래가 없는 단지가 UPDATE 대상에서 빠져
    -- 예전 값이 그대로 남는다(원본은 상관 서브쿼리라 NULL/false로 덮어썼다).
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

COMMENT ON FUNCTION public.refresh_complex_price_stats() IS
  '단지 가격 파생값 배치 집계(avg_sale_per_pyeong/price_change_30d/tx_count_30d/is_new_record_30d). '
  '집합 기반 — 상관 서브쿼리 버전은 41초가 걸려 PostgREST 8초 타임아웃에 조용히 걸렸다(2026-08-06). '
  '재작성 후에도 8초를 밑돌지는 못하므로 타임아웃 없는 경로에서 호출해야 한다.';
