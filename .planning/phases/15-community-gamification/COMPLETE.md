# Phase 15 — 커뮤니티 & 게이미피케이션 ✅ 완료 (2026-05)

## 구현 내용
- 5단계 등급 DB: `bronze/silver/gold/platinum/diamond` CHECK 제약 (기존 3단계에서 확장)
- 포인트 배점: 후기 +50, 댓글 +10, 즐겨찾기 +5, 일일 로그인 +1
- DB 트리거: `award_review_points` / `award_comment_points` / `award_favorite_points`(user_favorites INSERT)
- `award_daily_login_points(uuid) RETURNS boolean` — SECURITY DEFINER, KST 기준 당일 중복 방지, anon REVOKE
- `dailyLoginAction` Server Action (`src/actions/daily-login.ts`) — RPC 호출, 세션당 1회
- `TierBadge.tsx` — 텍스트 약어(B/S/G/P/D), 이모지 없음, 금속 계열 색상
- `cafe_articles` 테이블 + RLS (SELECT public, INSERT service_role only), `naver_article_id TEXT UNIQUE`
- `src/services/naver-cafe.ts` — Naver Search API cafearticle 어댑터
- `/api/cron/cafe-articles` 크론 (04:30 KST = `30 19 * * *`), 250개 단지 제한
- 단지 상세 페이지에 "관련 카페 글" 섹션 추가 (`getCafeArticlesByComplex`)
- `/compare?ids=...` 페이지 — Recharts 멀티라인 차트, 세대수/준공연도/학군/관리비 비교표
- `CompareAddButton` — 단지 상세 하단 "비교에 추가" (nuqs `ids` 파라미터)
- 마이그레이션: `supabase/migrations/20260522000001_phase15_tier_extension.sql`

## 특이사항 / 유지보수
- **주의**: `CompareFloatingBar.tsx`는 구현됐으나 검증 시점에 어느 페이지에도 마운트되지 않음 (orphaned). `src/app/complexes/[id]/page.tsx` 또는 root layout에 추가 필요
- `award_daily_login_points()`는 `add_activity_points()` 체인을 호출하지 않고 직접 INSERT/UPDATE — `auth.uid() NULL` 체인 문제 회피
- `compare.ts`의 관리비 계산: `common_cost_total + individual_cost_total + long_term_repair_monthly` (cost_per_unit 아님)
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 환경변수 필요
- cafe_articles 크론은 기존 daily cron(`04:00 KST`)과 별도 endpoint (`/api/cron/cafe-articles`)
- 등급 임계값: silver 100, gold 500, platinum 2000, diamond 5000
