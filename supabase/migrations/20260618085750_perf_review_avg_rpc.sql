-- Phase 37 복원 — 원장 version 20260618085750에서 추출, 프로덕션 그대로 재현 (개선 금지: D-03)


-- 리뷰 평균 집계 RPC (앱 레이어 풀스캔 대신 DB 집계)
CREATE OR REPLACE FUNCTION public.get_complex_review_avg(p_complex_id UUID)
RETURNS FLOAT LANGUAGE sql STABLE AS $$
  SELECT AVG(rating)::FLOAT FROM public.complex_reviews WHERE complex_id = p_complex_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_complex_review_avg TO anon, authenticated;
