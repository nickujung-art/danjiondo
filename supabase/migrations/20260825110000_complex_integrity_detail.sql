-- 무결성 3축이 **어느 단지 때문인지** 알려주는 함수 (2026-08-25)
--
-- ── 왜 필요한가 ────────────────────────────────────────────────────────────
-- `complex-integrity.yml` 의 규약은 명확하다:
--   "오른 만큼 **개별 단지를 특정해 사유를 적은 뒤에만** 기준선을 올린다"
-- 원인 미조사 오염을 기준선에 흡수하면 영구히 '정상' 이 되고 다시는 경보가 뜨지 않기
-- 때문이다(ADR-063 부류). 옳은 규약이다.
--
-- 그런데 **그 특정을 할 도구가 없었다.** `complex_integrity_counts` 는 숫자 셋만 준다.
-- 어느 단지인지 알려면 운영권역 거래 34만 행을 PostgREST 로 1,000행씩 340번 긁어
-- 애플리케이션에서 집계해야 했다(2026-08-25 실측: 2분 제한에 걸려 실패).
--
-- 그래서 규약이 지켜지기 어려웠다. 2026-08-24 이후 `multi_jibun 7→9`,
-- `empty_kapt 61→62` 가 초과인 채로 **매일 빨간불**이고, 워크플로 자신의 주석이
-- 그 위험을 적어놨다 — "매일 빨간불이라 아무도 안 보게 된다".
--
-- 판정 기준은 `complex_integrity_counts` 와 **글자 그대로 같다.** 이 함수는 그 WHERE 를
-- 공유하되 count 대신 행을 돌려준다. 둘이 어긋나면 안 되므로 정의를 나란히 둔다.
--
-- ── 왜 count 함수를 고쳐 쓰지 않나 ─────────────────────────────────────────
-- 반환 타입을 바꾸면 `CREATE OR REPLACE` 가 안 되고 DROP 이 필요한데, 그 함수는
-- 워크플로가 매일 부른다. 배포 중 잠깐이라도 없으면 감시가 죽는다. 새 함수를 옆에 둔다.

CREATE OR REPLACE FUNCTION public.complex_integrity_detail(p_sgg text[])
RETURNS TABLE(axis text, complex_id uuid, canonical_name text, sgg_code text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH j AS (
    SELECT t.complex_id,
           split_part(t.jibun,'-',1) AS base,
           t.umd_nm,
           count(*) AS cnt
    FROM public.transactions t
    WHERE t.complex_id IS NOT NULL AND t.jibun IS NOT NULL
      AND t.cancel_date IS NULL AND t.superseded_by IS NULL
      AND t.sgg_code = ANY(p_sgg)
    GROUP BY 1,2,3
  ),
  agg AS (
    SELECT complex_id,
           count(DISTINCT base)   AS bases,
           count(DISTINCT umd_nm) AS dongs,
           sum(cnt)               AS total,
           max(cnt)               AS biggest
    FROM j GROUP BY 1
  ),
  tx AS (
    SELECT t.complex_id, count(*) AS n
    FROM public.transactions t
    WHERE t.complex_id IS NOT NULL
      AND t.cancel_date IS NULL AND t.superseded_by IS NULL
      AND t.sgg_code = ANY(p_sgg)
    GROUP BY 1
  )

  -- ① 다중 지번 — 본번이 갈리고 **동까지 다르며** 소수 쪽이 50건 이상
  SELECT 'multi_jibun'::text, c.id, c.canonical_name, c.sgg_code,
         format('본번 %s종 · 동 %s종 · 총 %s건 중 최대 묶음 %s건 → 이탈 %s건',
                a.bases, a.dongs, a.total, a.biggest, a.total - a.biggest)
  FROM agg a
  JOIN public.complexes c ON c.id = a.complex_id
  WHERE a.bases > 1 AND a.dongs > 1 AND (a.total - a.biggest) >= 50

  UNION ALL

  -- ② 회전율 이상 — 거래수 ÷ 세대수 ÷ 10년 > 25%
  SELECT 'turnover_anomaly'::text, c.id, c.canonical_name, c.sgg_code,
         format('거래 %s건 ÷ %s세대 ÷ 10년 = 연 %s%%',
                tx.n, c.household_count,
                round(tx.n::numeric / c.household_count / 10 * 100, 1))
  FROM public.complexes c
  JOIN tx ON tx.complex_id = c.id
  WHERE c.sgg_code = ANY(p_sgg) AND c.status = 'active' AND c.household_count > 0
    AND tx.n >= 100
    AND tx.n::numeric / c.household_count / 10 * 100 > 25

  UNION ALL

  -- ③ K-apt 등록인데 거래 0건
  SELECT 'empty_kapt'::text, c.id, c.canonical_name, c.sgg_code,
         format('kapt_code %s · %s세대 · 거래 0건', c.kapt_code, c.household_count)
  FROM public.complexes c
  WHERE c.sgg_code = ANY(p_sgg) AND c.status = 'active'
    AND c.kapt_code IS NOT NULL AND c.household_count > 0
    AND NOT EXISTS (SELECT 1 FROM tx WHERE tx.complex_id = c.id)

  ORDER BY 1, 4, 3;
$$;

COMMENT ON FUNCTION public.complex_integrity_detail(text[]) IS
  '무결성 3축에 걸린 **개별 단지**를 돌려준다. complex_integrity_counts 와 판정 기준이 '
  '같고 count 대신 행을 준다. 기준선을 올리기 전 원인 특정에 쓴다 — 그 특정을 할 '
  '도구가 없어 규약이 지켜지기 어려웠다(2026-08-25).';

-- 🔴 TO 절을 명시한다 (CLAUDE.md CRITICAL). 읽기 전용 집계이고 단지명·시군구만 담지만,
--    SECURITY DEFINER 이므로 넓게 열지 않는다. 워크플로는 backup_agent 로 접속한다.
REVOKE EXECUTE ON FUNCTION public.complex_integrity_detail(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complex_integrity_detail(text[]) TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_agent') THEN
    GRANT EXECUTE ON FUNCTION public.complex_integrity_detail(text[]) TO backup_agent;
  END IF;
END $$;
