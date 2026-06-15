# Phase 01 — 보안·인프라·배포 ✅ 완료 (2026-05)

## 구현 내용
- SEC-01: `/api/ads/events` Rate limiting — Upstash Redis slidingWindow(100, '1m'), 429 + Retry-After
- SEC-02: `createSupabaseAdminClient()` 단일 팩토리 경유 — inline createClient 3곳 교체
- SEC-03: `complexes-map.ts` `.eq('status', 'active')` 필터 추가 (지도 쿼리 보안)
- SEC-04: Sentry 에러 트래킹 — production-only, tracesSampleRate: 0, `withSentryConfig(withSerwist(nextConfig))`
- INFRA-01: `.env.local.example` 정비 (NextAuth 변수 제거, Upstash/Sentry 변수 추가), Vercel 프로덕션 배포
- INFRA-02: GitHub Actions CI 4-job 파이프라인 (lint-typecheck → build → unit-test → e2e)
- INFRA-03: Playwright E2E 5종 (landing/complex-detail/map/search/review) + global-setup/teardown

## 특이사항 / 유지보수
- Upstash Redis: `KV_REST_API_URL`과 `UPSTASH_REDIS_REST_URL` 양쪽 fallback 지원 (Vercel KV 연동 호환)
- E2E global-setup: 프로덕션 Supabase 사용, `admin.createUser()` → storageState.json → teardown 삭제 패턴
- GitHub branch protection 활성화는 GitHub 대시보드에서 수동 설정 필요 (코드로 불가)
- Sentry DSN은 `NEXT_PUBLIC_SENTRY_DSN` 환경변수로 주입 (Vercel에 설정 필요)
