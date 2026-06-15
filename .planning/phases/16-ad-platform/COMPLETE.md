# Phase 16 — 광고 플랫폼 MVP ✅ 완료 (2026-05)

## 구현 내용
- `AdBannerCarousel` 클라이언트 컴포넌트: 4초 자동 로테이션, 광고 없으면 null 반환
- 홈페이지(`src/app/page.tsx`)에 banner_top 광고 연결 (revalidate=60 유지)
- `/ads` 공개 페이지: 가격 상품 소개 + 문의 폼 (가격은 "문의 후 안내" 방식)
- `submitAdInquiry` Server Action: zod v4 검증 + Resend 이메일 → OPERATOR_EMAIL 발송
- 어드민 광고 관리(`/admin/ads`), 이벤트 API(`/api/ads/events`)는 이 Phase 이전에 완성됨

## 특이사항 / 유지보수
- **zod v4**: 유효성 오류 접근은 `.errors` 아닌 `.issues` (`.error.issues[0]?.message`)
- **필수 환경변수**: `OPERATOR_EMAIL` Vercel 대시보드에 미설정 시 문의 폼 에러 반환
- 광고 쿼리 필수 조건: `now() BETWEEN starts_at AND ends_at AND status='approved'` (CLAUDE.md)
- 핵심 파일: `src/components/ads/AdBannerCarousel.tsx`, `src/lib/auth/ad-inquiry-action.ts`, `src/app/ads/page.tsx`
