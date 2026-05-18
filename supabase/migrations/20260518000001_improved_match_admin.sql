-- match_complex_by_admin 개선: 3방향 유사도 + 양방향 LIKE unique fallback
-- 개선 사항:
--   1. word_similarity 양방향 추가 (query→DB, DB→query)
--   2. 양방향 LIKE unique fallback: 짧은 이름이 긴 이름의 부분 문자열인 경우 처리
--   3. LIKE 최소 길이 2 (한글 2음절 — 예: '럭키', '우성', '풍림')
--   예) '럭키' → '반림럭키', '월산마을1단지부영' → '월산마을1단지부영13차'

create or replace function public.match_complex_by_admin(
  p_sgg_code        text,
  p_name_normalized text,
  p_min_similarity  numeric default 0.5
)
returns table (
  id             uuid,
  canonical_name text,
  trgm_sim       numeric
)
language plpgsql
stable
as $$
declare
  v_count int;
  v_id    uuid;
  v_name  text;
begin
  -- 1단계: 3방향 유사도 >= threshold
  --   (a) set-level trigram similarity (양방향 동일)
  --   (b) word_similarity(query, db): query가 DB 이름에 포함되는 정도
  --   (c) word_similarity(db, query): DB 이름이 query에 포함되는 정도
  return query
    select
      c.id,
      c.canonical_name,
      greatest(
        similarity(c.name_normalized, p_name_normalized),
        word_similarity(p_name_normalized, c.name_normalized),
        word_similarity(c.name_normalized, p_name_normalized)
      )::numeric as trgm_sim
    from public.complexes c
    where
      c.sgg_code = p_sgg_code
      and c.status != 'demolished'
      and greatest(
        similarity(c.name_normalized, p_name_normalized),
        word_similarity(p_name_normalized, c.name_normalized),
        word_similarity(c.name_normalized, p_name_normalized)
      ) >= p_min_similarity
    order by trgm_sim desc
    limit 1;

  if found then
    return;
  end if;

  -- 2단계: 양방향 LIKE unique fallback (한글 2음절 이상)
  --   조건: sgg_code 내 유일 매칭 단지일 때만 반환
  --   반환 신뢰도: 0.90
  --     - matchByAdminCode 기본 ADMIN_CONFIDENCE_CAP=0.85 시: 큐 적재
  --     - link-transactions confidenceCap=0.9 시: 자동 연결
  if length(p_name_normalized) >= 2 then
    select count(*), min(c.id::text)::uuid, min(c.canonical_name)
    into v_count, v_id, v_name
    from public.complexes c
    where
      c.sgg_code = p_sgg_code
      and c.status != 'demolished'
      and (
        -- (1) query가 DB 이름에 부분 문자열 (예: '럭키' in '반림럭키')
        c.name_normalized like '%' || p_name_normalized || '%'
        -- (2) DB 이름이 query에 부분 문자열 (예: '월산마을1단지부영' in '월산마을1단지부영13차')
        or (length(c.name_normalized) >= 4
            and p_name_normalized like '%' || c.name_normalized || '%')
      );

    if v_count = 1 then
      return query select v_id, v_name, 0.90::numeric;
    end if;
  end if;
end;
$$;
