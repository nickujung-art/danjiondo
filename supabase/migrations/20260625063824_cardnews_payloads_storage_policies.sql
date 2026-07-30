-- Phase 37 복원 — 원장 version 20260625063824에서 추출, 프로덕션 그대로 재현 (개선 금지: D-03)

-- cardnews-payloads 버킷 RLS 정책
-- 공개 읽기: GitHub Actions가 payload URL로 다운로드 가능
CREATE POLICY "cardnews-payloads public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'cardnews-payloads');

-- 서비스 롤만 업로드/삭제 가능 (어드민 API Route → SUPABASE_SERVICE_ROLE_KEY 사용)
CREATE POLICY "cardnews-payloads service insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'cardnews-payloads' AND auth.role() = 'service_role');

CREATE POLICY "cardnews-payloads service delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'cardnews-payloads' AND auth.role() = 'service_role');