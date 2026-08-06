-- match_complex_by_admin: 별칭(complex_aliases) 우선 조회를 0단계로 추가 (2026-08-06)
--
-- [문제 — 진단이 바뀌었다]
-- 마린애시앙부영 143건이 미연결로 쌓인 원인을 처음에는 "RPC 호출 실패가 매칭 없음과
-- 구분되지 않아서"로 봤다(그 결함도 실재해 daf8970 에서 고쳤다). **그런데 그게 주원인이
-- 아니었다.**
--
--   raw name  마린애시앙부영
--   complex   월영마린애시앙
--   trigram   0.375        (임계 0.9)
--   LIKE      양방향 모두 불성립
--
-- **이 이름은 애초에 매칭되지 않는다.** 과거 2,492건이 연결돼 있던 건 2026-05-20
-- 수동 재매칭 마이그레이션의 결과였지 RPC 가 잡아낸 게 아니다. 즉 이 단지는 **매일
-- 새 거래가 들어올 때마다 미연결로 떨어진다.** 사람이 주기적으로 수동 재매칭을 하지
-- 않으면 계속 벌어지는 구조였다.
--
-- 같은 부류가 더 있다 — `성원2차`↔`남양성원2차아파트`, `럭키`↔`반림럭키`,
-- `주공3`↔`구산주공3단지`처럼 접두·접미가 붙거나 빠지면 trigram 이 무너진다.
--
-- [해결]
-- `complex_aliases` 테이블이 이미 있는데(121건/100단지) **RPC 가 전혀 참조하지 않았다.**
-- 2026-05-20 에 토월성원 별칭 8건을 넣어둔 것도 그대로 사장돼 있었다.
-- 별칭 정확 일치를 **0단계**로 두어 trigram 보다 먼저 보게 한다.
--
--   * 정확 일치만 본다(부분 일치 금지). 별칭은 사람이 넣는 확정 정보이므로
--     퍼지 매칭을 얹으면 신뢰도가 떨어진다.
--   * sgg_code 로 한 번 더 좁힌다. 동명이인 단지가 시군구를 넘어 존재하기 때문이다
--     (대동다숲 = 거제/마산, 일동미라주 = 김해/부산 — 2026-08-06 확인).
--   * successor 를 따라간다(20260806090000 과 동일 규칙).
--   * 신뢰도 1.0 으로 반환한다 — 호출부가 min_similarity 로 재확인해도 통과한다.
--
-- [운영] 이제 미연결이 반복되는 이름은 **complex_aliases 에 한 줄 넣으면 끝난다.**
-- 수동 UPDATE 로 거래를 옮기는 방식(수명이 짧다 — 새 거래에는 적용되지 않는다)을
-- 별칭 등록으로 대체할 수 있다.

CREATE OR REPLACE FUNCTION public.match_complex_by_admin(
  p_sgg_code text,
  p_name_normalized text,
  p_min_similarity numeric DEFAULT 0.9,
  p_umd_nm text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, canonical_name text, trgm_sim numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INT;
  v_id    UUID;
  v_name  TEXT;
BEGIN
  -- 0단계: 별칭 정확 일치 (사람이 확정한 정보 — trigram 보다 먼저 본다)
  RETURN QUERY
    SELECT COALESCE(c.successor_id, c.id), c.canonical_name, 1.0::NUMERIC
    FROM public.complex_aliases a
    JOIN public.complexes c ON c.id = a.complex_id
    WHERE public.name_normalize_sql(a.alias_name) = p_name_normalized
      AND c.sgg_code = p_sgg_code
      AND c.status != 'demolished'
    ORDER BY a.confidence DESC NULLS LAST
    LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- 1단계: 3방향 trigram 유사도 >= threshold (동 필터 없음 — 기존 매칭 회귀 방지)
  RETURN QUERY
    SELECT
      COALESCE(c.successor_id, c.id),
      c.canonical_name,
      GREATEST(
        similarity(c.name_normalized, p_name_normalized),
        word_similarity(p_name_normalized, c.name_normalized),
        word_similarity(c.name_normalized, p_name_normalized)
      )::NUMERIC AS trgm_sim
    FROM public.complexes c
    WHERE
      c.sgg_code = p_sgg_code
      AND c.status != 'demolished'
      AND GREATEST(
        similarity(c.name_normalized, p_name_normalized),
        word_similarity(p_name_normalized, c.name_normalized),
        word_similarity(c.name_normalized, p_name_normalized)
      ) >= p_min_similarity
    ORDER BY trgm_sim DESC
    LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- 2단계: 양방향 LIKE unique fallback (동 필터 없음, 한글 2음절 이상)
  IF length(p_name_normalized) >= 2 THEN
    SELECT COUNT(*), MIN(COALESCE(c.successor_id, c.id)::TEXT)::UUID, MIN(c.canonical_name)
    INTO v_count, v_id, v_name
    FROM public.complexes c
    WHERE
      c.sgg_code = p_sgg_code
      AND c.status != 'demolished'
      AND (
        c.name_normalized LIKE '%' || p_name_normalized || '%'
        OR (length(c.name_normalized) >= 4
            AND p_name_normalized LIKE '%' || c.name_normalized || '%')
      );

    IF v_count = 1 THEN
      RETURN QUERY SELECT v_id, v_name, 0.90::NUMERIC;
      RETURN;
    END IF;
  END IF;

  -- 3단계: 동 필터 + LIKE unique (2단계에서 여러 단지 매칭 시 동으로 유일 확정)
  IF p_umd_nm IS NOT NULL AND length(p_name_normalized) >= 2 THEN
    SELECT COUNT(*), MIN(COALESCE(c.successor_id, c.id)::TEXT)::UUID, MIN(c.canonical_name)
    INTO v_count, v_id, v_name
    FROM public.complexes c
    WHERE
      c.sgg_code = p_sgg_code
      AND c.status != 'demolished'
      AND c.dong = p_umd_nm
      AND (
        c.name_normalized LIKE '%' || p_name_normalized || '%'
        OR (length(c.name_normalized) >= 4
            AND p_name_normalized LIKE '%' || c.name_normalized || '%')
      );

    IF v_count = 1 THEN
      RETURN QUERY SELECT v_id, v_name, 0.90::NUMERIC;
    END IF;
  END IF;
END;
$function$;

-- 반복 미연결이 확인된 이름을 별칭으로 등록한다.
-- 전부 2026-08-06 조사에서 지번·평형·층수·준공연도로 확정한 쌍이다.
INSERT INTO public.complex_aliases (id, complex_id, source, alias_name, confidence)
SELECT gen_random_uuid(), c.id, 'manual', v.alias, 1.0
FROM (VALUES
  ('마린애시앙부영',   '월영마린애시앙'),
  ('마산가포부영아파트','마산가포 사랑으로 부영아파트'),
  ('성원2차',          '남양성원2차아파트'),
  ('덕산타운1',        '대방덕산타운'),
  ('덕산타운2',        '대방덕산2차타운아파트'),
  ('구산3주공',        '구산주공3단지'),
  ('구산제2주공',      '구산주공2단지')
) AS v(alias, target)
JOIN public.complexes c ON c.canonical_name = v.target
ON CONFLICT (complex_id, source, alias_name) DO NOTHING;
