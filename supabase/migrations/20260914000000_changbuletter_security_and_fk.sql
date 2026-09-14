-- 창부레터 인계장 2026-09-14: 항목 1·2·3 + 데이터 ⑤

-- 1. subscribers anon INSERT 정책 제거 (봇 우회 차단)
DROP POLICY IF EXISTS "subscribers: anon subscribe" ON public.subscribers;

-- 2. confirmed_at CHECK 제약 (정보통신망법 수신동의 증명)
ALTER TABLE public.subscribers
  ADD CONSTRAINT subscribers_confirmed_at_required
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL);

-- 3. content_complexes FK를 CASCADE → RESTRICT (재시딩 시 기사 연결 보호)
ALTER TABLE public.content_complexes
  DROP CONSTRAINT content_complexes_complex_id_fkey,
  ADD CONSTRAINT content_complexes_complex_id_fkey
    FOREIGN KEY (complex_id) REFERENCES public.complexes(id) ON DELETE RESTRICT;

-- ⑤ 메트로시티2단지 floors_above 48 → 55 (실거래 55층 확인, 언론 55층·195.7m)
UPDATE complexes
SET floors_above = 55
WHERE id = '19c0ac13-9c33-45f9-adc5-bc32a733fa1f'
  AND floors_above = 48;
