-- match_complex_by_admin에 3단계 추가:
--   기존 1단계(trigram ≥ threshold) + 기존 2단계(LIKE unique 전체) +
--   신규 3단계(LIKE unique + dong 필터) — 동 이름 파라미터는 optional
CREATE OR REPLACE FUNCTION match_complex_by_admin(
  p_sgg_code        TEXT,
  p_name_normalized TEXT,
  p_min_similarity  NUMERIC DEFAULT 0.9,
  p_umd_nm          TEXT    DEFAULT NULL
) RETURNS TABLE(id UUID, canonical_name TEXT, trgm_sim NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
  v_id    UUID;
  v_name  TEXT;
BEGIN
  -- 1단계: 3방향 trigram 유사도 >= threshold (동 필터 없음 — 기존 매칭 회귀 방지)
  RETURN QUERY
    SELECT
      c.id,
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
    SELECT COUNT(*), MIN(c.id::TEXT)::UUID, MIN(c.canonical_name)
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
    SELECT COUNT(*), MIN(c.id::TEXT)::UUID, MIN(c.canonical_name)
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
$$;
