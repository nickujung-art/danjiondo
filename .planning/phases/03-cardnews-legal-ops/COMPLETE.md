# Phase 03 — 카드뉴스·법적·운영 ✅ 완료 (2026-05)

## 구현 내용
- SHARE-03/04: `/api/cardnews/generate` — 1080x1080 PNG ImageResponse (Satori CSS-flex, Pretendard TTF), `/admin/cardnews` 1-click download
- LEGAL-01: `/consent` 페이지 — `terms_agreed_at` NULL 시 auth callback에서 리다이렉트
- LEGAL-02/03/05: `/legal/terms`, `/legal/privacy`, `/legal/ad-policy` 정적 페이지 + 시맨틱 Footer
- LEGAL-04: 계정 탈퇴 — `profiles.deleted_at` soft delete (30일 grace), 일배치 cron에서 hard delete
- ADMIN-01~04: 회원 관리 `/admin/members`, 광고 검수 `/admin/ads`, 신고 큐 `/admin/reports` (SLA 배지), `/admin/status` 모니터링
- A11Y-01~03: axe-core WCAG 2.0 A/AA CI gate (critical=0), 키보드 탐색, 시맨틱 랜드마크 (`<main>`, `<footer>`)
- DB 마이그레이션: `profiles.{deleted_at, terms_agreed_at, suspended_at}`, `reports` 테이블 + enum 2종 + RLS 3정책

## 특이사항 / 유지보수
- Recharts는 Satori 미지원 → 카드뉴스는 CSS flex bar chart 직접 구현 (`CardnewsLayout.tsx`)
- `SlaUtils.ts` 고아 코드 — `admin/reports/page.tsx`는 자체 `getSlaState` 복사본 사용 (SlaUtils 미import)
- map page: Supabase 연결 실패 시 500 → `.catch(() => [])` 빈 배열 폴백 (A11Y 수정 시 추가)
- `e2e/global-setup.ts`: Supabase 미가동 시 throw 대신 warn+return (A11Y 테스트 DB 없이 실행 가능)
- Playwright CI: `process.env.CI` 분기 — CI는 `npm run start`, 로컬은 `npm run dev`
