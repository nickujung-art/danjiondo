-- Phase 30: 신규 ingest 거래 area_type_id 자동 매핑 트리거
-- transactions INSERT 시 ±2㎡ nearest match로 area_type_id 자동 설정
-- assign_area_types()와 동일 로직 (naver_pyeong_no 오름차순 deterministic)

CREATE OR REPLACE FUNCTION public.auto_assign_area_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.area_type_id IS NULL AND NEW.cancel_date IS NULL THEN
    SELECT cat.id INTO NEW.area_type_id
    FROM public.complex_area_types cat
    WHERE cat.complex_id = NEW.complex_id
      AND ABS(cat.exclusive_area_m2 - NEW.area_m2) <= 2.0
    ORDER BY
      ABS(cat.exclusive_area_m2 - NEW.area_m2),
      cat.naver_pyeong_no NULLS LAST,
      cat.id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_area_type ON public.transactions;

CREATE TRIGGER trg_auto_assign_area_type
  BEFORE INSERT OR UPDATE OF area_m2, complex_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_area_type();

COMMENT ON FUNCTION public.auto_assign_area_type IS
  '신규 거래 INSERT 시 complex_area_types와 ±2㎡ nearest match로 area_type_id 자동 설정.';
