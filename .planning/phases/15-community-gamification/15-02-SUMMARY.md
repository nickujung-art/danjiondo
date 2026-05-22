---
phase: 15-community-gamification
plan: "02"
subsystem: service-layer
tags: [tdd, naver-cafe, member-tier, cafe-articles, cron, server-action]
dependency_graph:
  requires:
    - "15-01: cafe_articles 테이블, award_daily_login_points() DB 함수"
  provides:
    - "searchCafeArticles() Naver cafearticle API 어댑터"
    - "getCafeArticlesByComplex() + ingestCafeArticles() 데이터 계층"
    - "MemberTier 5단계 타입 + getTierLabel/getTierBadgeText/getTierColorClass/getNotificationDelay"
    - "dailyLoginAction Server Action"
    - "/api/cron/cafe-articles cron 엔드포인트"
    - "vercel.json 04:30 KST 스케줄"
  affects:
    - "Wave 3 UI 계층 (15-03)"
    - "CommentSection.tsx (getTierBadge 마이그레이션 완료)"
tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN: 테스트 파일 커밋 후 구현 커밋"
    - "server-only import in services/ + lib/data/"
    - "'use server' Server Action 패턴"
    - "Bearer CRON_SECRET 인증 (daily 패턴 동일)"
    - "upsert onConflict: 'naver_article_id' 중복 방지"
key_files:
  created:
    - src/lib/data/member-tier.test.ts
    - src/services/naver-cafe.test.ts
    - src/lib/data/cafe-articles.test.ts
    - src/lib/data/cafe-articles.ts
    - src/actions/daily-login.ts
    - src/app/api/cron/cafe-articles/route.ts
  modified:
    - src/lib/data/member-tier.ts
    - src/services/naver-cafe.ts
    - vercel.json
    - src/components/reviews/CommentSection.tsx
    - src/__tests__/tierbadge.test.ts
decisions:
  - "MemberTier 5단계 확장: getTierBadge(이모지) 제거 → getTierBadgeText(텍스트 약자) 교체 (D-06 AI 슬롭 금지)"
  - "cafe-articles.ts upsert 카운트: .select('id', count) 타입 오류 → .select('id') + data.length 패턴으로 수정"
  - "TDD RED 커밋(1a0fa14) → GREEN 커밋(be81998) 순서 준수"
metrics:
  duration: "~6분"
  completed: "2026-05-22"
  tasks_completed: 2
  files_changed: 11
---

# Phase 15 Plan 02: 서비스 계층 — Naver cafe adapter + member-tier + cron + daily-login

searchCafeArticles Naver cafearticle API 어댑터, 5단계 MemberTier 서비스, cafe-articles 데이터 계층, 일일 로그인 Server Action, 04:30 KST cafe-articles cron 엔드포인트 구현. TDD RED→GREEN 순서 준수.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| T-15-02 (RED) | 테스트 파일 3개 먼저 작성 | 1a0fa14 | member-tier.test.ts, naver-cafe.test.ts, cafe-articles.test.ts |
| T-15-02 (GREEN) | 구현 파일 3개 작성 | be81998 | member-tier.ts, naver-cafe.ts, cafe-articles.ts |
| T-15-03 | cron + action + vercel.json | 3311f3b | daily-login.ts, cafe-articles/route.ts, vercel.json, + 수정 3개 |

## What Was Built

### T-15-02: 데이터 계층

**src/lib/data/member-tier.ts (전체 재작성)**
- `MemberTier` 타입: `'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'`
- `getTierLabel()`: 한글 라벨 (브론즈/실버/골드/플래티넘/다이아)
- `getTierBadgeText()`: 텍스트 약자 (B/S/G/P/D) — 이모지 없음 (D-06)
- `getTierColorClass()`: Tailwind 클래스 (amber-700/slate-500/yellow-600/sky-600/cyan-600)
- `getNotificationDelay()`: gold 이상 0ms, silver/bronze 1800000ms

**src/services/naver-cafe.ts (확장)**
- `CafeArticleItem` 인터페이스 추가
- `searchCafeArticles(query, size=100)`: HTML 태그 제거 후 `CafeArticleItem[]` 반환
- 기존 `searchCafePosts`, `extractComplexNames` 유지

**src/lib/data/cafe-articles.ts (신규)**
- `getCafeArticlesByComplex(complexId, supabase, limit=5)`: published_at DESC 정렬
- `ingestCafeArticles(complexId, articles, supabase)`: naver_article_id onConflict upsert

### T-15-03: 액션 + cron

**src/actions/daily-login.ts**
- `'use server'` directive
- `supabase.auth.getUser()` 인증 검증 후 검증된 user.id만 RPC에 전달 (T-15-S2-02)
- `award_daily_login_points(p_user_id)` RPC 호출 → boolean 반환

**src/app/api/cron/cafe-articles/route.ts**
- `export const runtime = 'nodejs'`
- `Bearer ${CRON_SECRET}` 인증
- complexes 최대 250개 조회 → per complex `${canonical_name} ${si}` 쿼리
- `searchCafeArticles(query, 100)` → `ingestCafeArticles()` 파이프라인
- errors[] 배열 수집, 부분 실패 시 계속 진행

**vercel.json**
```json
{ "path": "/api/cron/cafe-articles", "schedule": "30 19 * * *" }
```
UTC 19:30 = KST 04:30

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CommentSection.tsx getTierBadge API 마이그레이션**
- **Found during:** T-15-03 lint 검증 (tsc --noEmit)
- **Issue:** member-tier.ts 재작성으로 기존 `getTierBadge(이모지 기반)` 함수가 제거됨. CommentSection.tsx + tierbadge.test.ts가 이를 참조해 TypeScript 오류 발생
- **Fix:** CommentSection.tsx에서 `getTierBadge({tier, cafeVerified})` → `getTierBadgeText(tier)` + bronze 조건 분기로 교체. tierbadge.test.ts도 새 API 기준으로 업데이트
- **Files modified:** src/components/reviews/CommentSection.tsx, src/__tests__/tierbadge.test.ts
- **Commit:** 3311f3b

**2. [Rule 1 - Bug] cafe-articles.ts upsert 카운트 타입 오류**
- **Found during:** T-15-03 lint 검증
- **Issue:** `.select('id', { count: 'exact', head: true })` 두 번째 인수가 Supabase TypeScript 타입과 불일치 (Expected 0-1 arguments, but got 2)
- **Fix:** `.select('id')` + `data.length` 패턴으로 교체
- **Files modified:** src/lib/data/cafe-articles.ts
- **Commit:** 3311f3b

## TDD Gate Compliance

- RED gate: `test(15-02): write failing tests` 커밋 1a0fa14 존재
- GREEN gate: `feat(15-02): implement` 커밋 be81998 존재 (RED 이후)
- 23 tests passing

## Security Notes

| Threat ID | Mitigation |
|-----------|-----------|
| T-15-S2-01 | NAVER_CLIENT_ID/SECRET: server-only import + 환경변수 |
| T-15-S2-02 | dailyLoginAction: auth.getUser() 검증 후 user.id 사용 |
| T-15-S2-04 | cron endpoint: Bearer CRON_SECRET 헤더 검증 |

## Known Stubs

없음.

## Threat Flags

없음 — 모든 신규 trust boundary가 PLAN.md threat_model에 명시되어 있음.

## Self-Check: PASSED

- [x] src/lib/data/member-tier.test.ts 존재
- [x] src/services/naver-cafe.test.ts 존재
- [x] src/lib/data/cafe-articles.test.ts 존재
- [x] src/lib/data/member-tier.ts — MemberTier 5단계, getTierBadgeText export
- [x] src/services/naver-cafe.ts — searchCafeArticles export
- [x] src/lib/data/cafe-articles.ts — getCafeArticlesByComplex, ingestCafeArticles export
- [x] src/actions/daily-login.ts — 'use server' + award_daily_login_points
- [x] src/app/api/cron/cafe-articles/route.ts — Bearer 인증 + cron 로직
- [x] vercel.json — "30 19 * * *" cafe-articles 스케줄
- [x] 커밋 1a0fa14 (RED), be81998 (GREEN), 3311f3b (T-15-03) 존재
- [x] npm run test 23 passed
- [x] npm run lint 통과
