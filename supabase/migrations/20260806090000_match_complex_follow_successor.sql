-- match_complex_by_admin: 병합된 단지는 successor 로 넘긴다 (2026-08-06)
--
-- [문제]
-- 이 RPC 는 `c.status != 'demolished'` 만 걸렀다. 그래서 `merged` 로 정리한 중복 레코드가
-- **여전히 매칭 대상**이었고, 새로 적재되는 거래가 다시 그리로 흘러들어간다.
-- 즉 오늘 정리한 병합들(토월성원 3건, 덕산타운 2건, STX칸 2건, 팔판마을 2건, 1차동원 등)이
-- **내일 일배치부터 소리 없이 무너진다.** 병합이 화면에서만 유효하고 적재 경로에는
-- 반영되지 않는 구조였다.
--
-- [왜 단순 제외가 아니라 successor 인가]
-- `merged` 를 그냥 빼면 `덕산타운1차` 같은 원본 이름이 매칭될 곳을 잃는다. 정식 단지
-- (`대방덕산타운`)는 이름이 달라서 잡히지 않기 때문이다. 그러면 거래가 미연결로 쌓여
-- **문제가 형태만 바꾼다.**
--
-- 병합의 의미는 "이 이름은 이제 저 단지를 가리킨다"이므로, 매칭은 그대로 두고
-- **반환하는 id 만 successor 로 바꾼다**. 이게 alias 를 별도로 관리하지 않고도
-- 이름 변화를 흡수하는 가장 단순한 방법이다.
--
-- [변경 범위]
-- 3단계 모두 `COALESCE(c.successor_id, c.id)` 로 반환한다. 매칭 조건 자체는 손대지 않아
-- 기존 매칭률에 회귀가 없다. successor_id 가 NULL 인 절대다수는 동작이 완전히 동일하다.
--
-- [한계] successor 체인은 1단계만 따라간다. 병합된 단지를 또 병합하면 끝까지 못 간다.
-- 지금은 그런 사례가 없고, 생기면 병합 시 successor 를 최종 대표로 직접 지정하면 된다.

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
