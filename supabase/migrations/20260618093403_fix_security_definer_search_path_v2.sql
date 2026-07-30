-- Phase 37 복원 — 원장 version 20260618093403에서 추출, 프로덕션 그대로 재현 (개선 금지: D-03)


-- SECURITY DEFINER 함수 schema injection 방지 (search_path = '' 고정)
ALTER FUNCTION public.check_gps_proximity(uuid, double precision, double precision, integer) SET search_path = '';
ALTER FUNCTION public.get_hagwon_grade(uuid) SET search_path = '';
ALTER FUNCTION public.get_recent_complex_sales(uuid[], date) SET search_path = '';
ALTER FUNCTION public.get_schools_for_point(double precision, double precision) SET search_path = '';
