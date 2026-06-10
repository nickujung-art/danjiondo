---
plan_id: 23-02
phase: 23
plan: 02
subsystem: routing-seo
tags: [seo, catch-all-route, breadcrumb, json-ld, permanent-redirect, metadata, typescript]
dependency_graph:
  requires: [23-01]
  provides: [catch-all-route, og-image-slug, permanent-redirect, content-language-meta]
  affects: [Wave 3 sitemap (23-03), Wave 4 robots+rss (23-04)]
tech_stack:
  added: []
  patterns: [next15-catch-all, isr-revalidate, permanent-redirect-rsc, breadcrumb-jsonld, faq-jsonld]
key_files:
  created:
    - src/app/[...slug]/page.tsx
    - src/app/[...slug]/opengraph-image.tsx
  modified:
    - src/app/complexes/[id]/page.tsx
    - src/app/layout.tsx
    - src/types/database.ts
    - tsconfig.json
decisions:
  - "noUncheckedIndexedAccess 대응: slug 인덱스 접근 시 ?? '' fallback (s0/s1/s2)"
  - "scripts/ tsconfig exclude 추가 — 독립 Node.js 스크립트는 Next.js 빌드에서 제외"
  - "url_slug DB 타입 수정 — database.ts Row/Insert/Update 에 url_slug 필드 추가"
metrics:
  duration_minutes: 30
  completed_date: "2026-06-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 4
---

# Phase 23 Plan 02: catch-all URL 라우팅 + 리다이렉트 Summary

## One-liner

Next.js catch-all `[...slug]/page.tsx`로 한글 계층 URL 4단계 SSR 구현, BreadcrumbList+FAQPage JSON-LD+시각적 nav 브레드크럼 포함, `/complexes/[id]`에 308 permanentRedirect 추가, layout.tsx에 content-language meta 삽입.

## What Was Built

### T-01: src/app/[...slug]/page.tsx + opengraph-image.tsx
**Commit:** `67adc1b`

`src/app/[...slug]/page.tsx` 생성 (1177줄):
- `classifySlug()` 기반 4단계 dispatch: si → SiPage / gu → GuPage or DongPage / dong-or-complex → Complex or DongPage / complex → ComplexDetailPage
- `generateMetadata`: title ≤40자, description ≤80자, 단지 상세에 '매매·전세' 포함 (D-06 W2)
- `buildBreadcrumbJsonLd()`: BreadcrumbList JSON-LD (D-07)
- `buildFaqJsonLd()`: FAQPage JSON-LD — 시·동 레벨만 (D-12)
- `BreadcrumbNav`: 눈에 보이는 `<nav aria-label="breadcrumb">` (D-07)
- `SiPage`: guList(창원)/dongList(김해) + avgPrice 표시 (W1)
- `GuPage`: dongList + avgPrice 표시
- `DongPage`: 단지 목록 + 평균 평당가 표시 (W1) + FAQ JSON-LD
- `ComplexDetailPage`: `/complexes/[id]/page.tsx` 렌더링 로직 완전 재사용, slug URL 기반 URL 참조, BreadcrumbList + BreadcrumbNav 추가
- Pitfall 1 방어: `type === 'invalid'` (slug.length > 4) → `notFound()`
- Pitfall 3 방어: catch-all에 `permanentRedirect` 없음 (무한 루프 방지)
- `export const revalidate = 3600` (ISR 1시간)

`src/app/[...slug]/opengraph-image.tsx` 생성:
- `runtime = 'nodejs'` (TTF 4MB 로드)
- slug에서 직접 name/location 추출 (DB 쿼리 없음, 빠른 응답)
- 기존 `/complexes/[id]/opengraph-image.tsx` 디자인 재사용

`src/types/database.ts`:
- `complexes.url_slug: string | null` Row/Insert/Update 추가 (23-00 마이그레이션과 동기화)

`tsconfig.json`:
- `"scripts"` exclude 추가 (pre-existing TS2393 오류 차단)

### T-02: complexes/[id] permanentRedirect + layout.tsx head 블록
**Commit:** `df9d8fd`

`src/app/complexes/[id]/page.tsx`:
- `import { permanentRedirect } from 'next/navigation'` 추가
- `if (complex.url_slug) { permanentRedirect('/' + complex.url_slug) }` — SEO-03 구현
- T-23-02-01 mitigate: DB 조회값만 redirect destination에 사용 (Open redirect 방어)

`src/app/layout.tsx`:
- `<head>` 블록 추가:
  - `<meta httpEquiv="content-language" content="ko-kr" />` (SEO-04, D-06)
  - `<link rel="alternate" type="application/rss+xml" href="/feed.xml" />` (SEO-05 연계)

## Verification Results

| Check | Result |
|-------|--------|
| `[...slug]/page.tsx` 존재 | ✓ |
| `revalidate = 3600` | ✓ |
| `classifySlug` 사용 | ✓ (3회) |
| `BreadcrumbList` JSON-LD | ✓ |
| `aria-label="breadcrumb"` nav | ✓ |
| `FAQPage` JSON-LD (D-12) | ✓ |
| `notFound()` 다중 (Pitfall 1) | ✓ (7회) |
| `매매·전세` title 포함 (W2, D-06) | ✓ |
| `avgPrice` 표시 (W1) | ✓ (14회) |
| opengraph-image.tsx 존재 | ✓ |
| `permanentRedirect` in complexes/[id] | ✓ (import+call) |
| `permanentRedirect` NOT in catch-all (Pitfall 3) | ✓ (0회) |
| `httpEquiv="content-language"` in layout | ✓ |
| `content="ko-kr"` | ✓ |
| `feed.xml` RSS autodiscovery | ✓ |
| npm run build | ✓ PASS |
| url-slug.test.ts 12개 | ✓ GREEN |
| seo-hierarchy.test.ts 5개 | ✓ GREEN |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript noUncheckedIndexedAccess: slug 인덱스 접근**
- **Found during:** T-01 빌드
- **Issue:** `slug[0]`, `slug[1]`, `slug[2]`가 `string | undefined` 타입 — `noUncheckedIndexedAccess: true` 설정으로 컴파일 오류
- **Fix:** dispatch 함수에서 `const s0 = slug[0] ?? ''` 등 fallback 변수로 추출
- **Files modified:** `src/app/[...slug]/page.tsx`
- **Commit:** `67adc1b`

**2. [Rule 2 - Missing Coverage] database.ts에 url_slug 컬럼 누락**
- **Found during:** T-01 빌드
- **Issue:** Phase 23-00 마이그레이션으로 DB에 `url_slug` 추가됐으나 TypeScript 타입 미업데이트 → `seo-hierarchy.ts` Supabase 쿼리에서 SelectQueryError
- **Fix:** `src/types/database.ts`의 complexes Row/Insert/Update에 `url_slug: string | null` 추가
- **Files modified:** `src/types/database.ts`
- **Commit:** `67adc1b`

**3. [Rule 3 - Blocking] tsconfig scripts/ 제외**
- **Found during:** T-01 빌드 (pre-existing, but blocks the build check)
- **Issue:** `scripts/geocode-to-sql.ts` + `scripts/test-reb-api.ts` — TS2393 Duplicate function implementation (global scope 충돌). 내 변경 이전부터 존재하는 오류이지만 `npm run build` 수용 기준을 블로킹
- **Fix:** `tsconfig.json` exclude에 `"scripts"` 추가 — 독립 Node.js 스크립트는 Next.js 빌드 대상 외
- **Files modified:** `tsconfig.json`
- **Commit:** `67adc1b`

## Security Notes (Threat Model)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-23-02-01 (Spoofing - permanentRedirect) | mitigate | complex.url_slug는 DB 조회값만 사용. 사용자 입력 redirect 없음 |
| T-23-02-02 (Tampering - slug depth) | mitigate | classifySlug → 5단계+ notFound() 구현 |
| T-23-02-03 (DoS - 계층 DB 쿼리) | mitigate | revalidate=3600 ISR 캐시 구현 |
| T-23-02-04 (Tampering - BreadcrumbList JSON-LD) | accept | JSON.stringify 자동 escape |
| T-23-02-05 (Spoofing - slug 기반 open redirect) | mitigate | catch-all에 permanentRedirect 없음 확인 |

## Known Stubs

None. 모든 기능 완전 구현.

## Threat Flags

None. 새로운 네트워크 엔드포인트 없음 (기존 Supabase anon read 정책 유지).

## Downstream Dependencies

이 플랜이 제공하는 것:
- `/창원시`, `/창원시/성산구`, `/창원시/성산구/내동`, `/창원시/성산구/내동/대우2차` — SSR 200 응답
- `/complexes/[uuid]` (url_slug 있는 단지) — 308 redirect to 한글 URL
- `<meta httpEquiv="content-language" content="ko-kr">` — 모든 페이지에 존재
- RSS autodiscovery `/feed.xml` link — Wave 3/4에서 실제 피드 구현 시 자동 연결

## Self-Check: PASSED

- [x] `src/app/[...slug]/page.tsx` 존재 (커밋 `67adc1b`)
- [x] `src/app/[...slug]/opengraph-image.tsx` 존재 (커밋 `67adc1b`)
- [x] `src/app/complexes/[id]/page.tsx` permanentRedirect 추가 (커밋 `df9d8fd`)
- [x] `src/app/layout.tsx` content-language + RSS link (커밋 `df9d8fd`)
- [x] `src/types/database.ts` url_slug 추가 (커밋 `67adc1b`)
- [x] `tsconfig.json` scripts 제외 (커밋 `67adc1b`)
- [x] 커밋 `67adc1b` 존재
- [x] 커밋 `df9d8fd` 존재
- [x] `npm run build` PASS
- [x] 단위 테스트 17개 GREEN (url-slug + seo-hierarchy)
