# 단지온도 (danjiondo)

창원·김해 실거래가 + 카페 커뮤니티 통합 부동산 사이트.

## 스택
Next.js 15 App Router · TypeScript strict · Tailwind 3.4 · Supabase (Postgres+PostGIS+RLS) · Supabase Auth (Naver OAuth + Email OTP) · Serwist PWA · Recharts · react-kakao-maps-sdk · Vitest + Playwright · Vercel Hobby + GitHub Actions CI

## 아키텍처 규칙
- **CRITICAL** 외부 API (국토부·카카오·학교알리미·K-apt) → `src/services/` 어댑터 전용. 컴포넌트·라우트 직접 호출 금지
- **CRITICAL** Supabase 쿼리 → 서버 컴포넌트·API Route 전용. `src/lib/supabase/client.ts`는 실시간 구독 전용
- **CRITICAL** 사용자 데이터 테이블은 RLS 정책 필수. `supabase/migrations/`에 포함
- **CRITICAL** `complexes`가 Golden Record. 단지명 단독 매칭 금지 — 항상 좌표+이름 복합 매칭. 별칭은 `complex_aliases`에 누적
- **CRITICAL** 광고 쿼리: `now() BETWEEN starts_at AND ends_at AND status='approved'` 필수
- 거래 조회: `WHERE cancel_date IS NULL AND superseded_by IS NULL` 필수 (취소·정정 제외)
- Server Action 우선 (폼·mutation). REST Route는 외부 노출 필요 시만
- 디렉토리: 컴포넌트 `src/components/` · 도메인 `src/lib/` · 어댑터 `src/services/` · 타입 `src/types/`

## 개발
- TDD: 테스트 먼저 작성 후 구현
- 커밋: `feat(scope): 설명` / `fix:` / `refactor:` / `docs:` / `chore:`
- Cron: 일배치 Vercel Cron (04:00 KST), 알림 워커 GitHub Actions `*/5 * * * *` (Vercel Hobby 1일 1회 한도 때문), cron endpoint는 `CRON_SECRET` 헤더 검증 필수

## 명령어
```
npm run dev      # localhost:3000
npm run build    # 프로덕션 빌드
npm run lint     # ESLint + tsc
npm run test     # Vitest
npm run test:e2e # Playwright
npm run db:push  # 마이그레이션 적용
```

## UI 규칙
- 금지: backdrop-blur · gradient-text · glow 애니메이션 · "Powered by AI" 배지 · 보라/인디고 브랜드색 · gradient orb
- 애니메이션은 compositor 속성만 (`transform` · `opacity` · `clip-path`). `width/height/top/margin` 등 layout 속성 애니메이션 금지
- Semantic HTML 우선 (`<header>`, `<main>`, `<section aria-labelledby>` 등). 의미없는 div 스택 금지
