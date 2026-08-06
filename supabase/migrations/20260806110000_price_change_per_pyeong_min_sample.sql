-- price_change_30d: 평당가 기준 + 최소 표본 3건 (2026-08-06)
--
-- [문제 — 랭킹 상위가 전부 통계 아티팩트였다]
-- 변동률 랭킹 1위가 `신포삼익 ▲84.6%` 였다. 실제 데이터는 이랬다.
--
--   최근 30일   1건, 평균 142㎡
--   직전 30일   1건, 평균  84㎡
--
-- 가격이 오른 게 아니라 **더 큰 평형이 팔린 것**이다. 상위권이 전부 이런 식이었다:
--   원창호수마을 ▲81.2%(85㎡ vs 62㎡), 신추산 ▲80.0%(60㎡ vs 40㎡),
--   해강그린 ▲77.8%(84㎡ vs 58㎡), 광남백조 ▼66.7%(70㎡ vs 83㎡)
--
-- 원인 두 가지가 겹쳤다.
--   (1) **평균 절대가**를 비교했다. 같은 단지라도 평형이 다르면 가격이 다르므로,
--       어느 평형이 팔렸느냐(mix shift)가 그대로 '변동률'로 둔갑한다.
--   (2) **최소 표본 기준이 없었다.** 각 창에 1건씩만 있어도 랭킹에 올랐다.
--
-- CLAUDE.md(realtrade-story) ADR-005 가 "급등락을 오인시키는 표기 금지"라고 못 박은
-- 지점이다. 화면 문구("최근 30일 변동률 기준이에요")는 정확했지만 **숫자 자체가**
-- 오해를 만들고 있었다.
--
-- [수정]
--   * 평균 절대가 → **평당가(price ÷ 평)** 비교. 평형 구성 변화를 정규화한다.
--   * 두 창 **각각 3건 이상**일 때만 계산. 미달이면 NULL(부재→숨김).
--
-- [효과 — 적용 전 측정]
--   현재  269곳 표시, ±30% 초과 27곳, 최대 ▲84.6%
--   개선   87곳 표시, ±30% 초과  0곳, 최대  17.0%
--
-- 표시 단지가 269→87 로 줄지만(-68%) 남는 숫자는 전부 믿을 수 있다. 지금은 상위
-- 10위권이 사실상 전부 노이즈라, 짧고 정확한 쪽이 낫다는 판단이다.
--
-- [범위] danjiondo 는 폐기 예정이라 공유 필드 호환성은 고려하지 않는다(2026-08-06 확정).
-- numeric(5,4) 범위: 17% = 0.1700 으로 여유가 충분하다.

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
      -- 최근 1년 평당가(만원/평)
      avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
        WHERE t.area_m2 > 0 AND t.deal_date >= CURRENT_DATE - INTERVAL '1 year'
      )::integer AS avg_pp,
      count(*) FILTER (
        WHERE t.deal_date >= CURRENT_DATE - INTERVAL '30 days'
      )::integer AS cnt_30d,
      -- 30일 변동률: **평당가** 기준, 두 창 각각 3건 이상일 때만.
      -- 평균 절대가로 재면 평형 구성 변화가 변동률로 둔갑한다(위 주석 참고).
      CASE
        WHEN count(*) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days') < 3
          OR count(*) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                 AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') < 3
        THEN NULL
        WHEN COALESCE(avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
               WHERE t.area_m2 > 0
                 AND t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                 AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days'), 0) = 0
        THEN NULL
        ELSE round((
          ( avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
              WHERE t.area_m2 > 0 AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days')
          - avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
              WHERE t.area_m2 > 0
                AND t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days') )
          / avg(t.price / NULLIF(t.area_m2 / 3.3058, 0)) FILTER (
              WHERE t.area_m2 > 0
                AND t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
                AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days')
        )::numeric, 4)
      END AS chg,
      -- 신고가 배지: 최근 30일 ㎡당 최고가가 그 이전 전 기간 최고가의 1.03배 초과
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
