---
plan_id: 23-01
phase: 23
plan: 01
subsystem: data-layer
tags: [seo, url-slug, tdd, data-functions, typescript]
dependency_graph:
  requires: [23-00]
  provides: [url-slug.ts, seo-hierarchy.ts, ComplexDetail.url_slug, SitemapEntry.url_slug]
  affects: [Wave 2 routing (23-02), Wave 3 sitemap (23-03)]
tech_stack:
  added: []
  patterns: [tdd-red-green, server-only, supabase-mock, pure-utility]
key_files:
  created:
    - src/lib/utils/url-slug.ts
    - src/lib/utils/url-slug.test.ts
    - src/lib/data/seo-hierarchy.ts
    - src/lib/data/seo-hierarchy.test.ts
  modified:
    - src/lib/data/complex-detail.ts
    - src/lib/data/sitemap.ts
decisions:
  - "buildUrlSlug server-only 없음 — scripts/backfill-url-slugs.ts에서도 직접 import 가능"
  - "getSiPageData hasGu 분기 — 창원(gu 있음)/김해(gu 없음) 자동 감지"
  - "getComplexBySlug empty guard — if (!urlSlug) return null (Pitfall 6 방어)"
  - "김해시 dongList avgPrice 테스트 추가 (AC 5개 이상 충족)"
metrics:
  duration_minutes: 20
  completed_date: "2026-06-09"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 2
---

# Phase 23 Plan 01: SEO 데이터 레이어 구현 Summary

## One-liner

buildUrlSlug/classifySlug/buildCanonicalUrl 순수 함수 3개 + getSiPageData/getGuPageData/getDongPageData/getComplexBySlug 서버 데이터 함수 4개로 SEO 계층 URL 처리 레이어 전체 완성 (TDD, 17개 테스트 GREEN).

## What Was Built

### T-01: url-slug.ts + url-slug.test.ts (TDD RED→GREEN)
**Commit:** `7299f91`

`src/lib/utils/url-slug.ts` 생성:
- `buildUrlSlug(si, gu, dong, canonicalName)` — 창원 4단계/김해 3단계 slug 생성, null guard
- `classifySlug(slug[])` → `'si' | 'gu' | 'dong-or-complex' | 'complex' | 'invalid'`
- `buildCanonicalUrl(site, slug[])` — 각 세그먼트 encodeURIComponent 인코딩
- `import 'server-only'` 없음 — scripts/에서도 직접 import 가능 (D-08 지원)

테스트: 12개 GREEN (buildUrlSlug 5, classifySlug 5, buildCanonicalUrl 2)

### T-02: seo-hierarchy.ts + seo-hierarchy.test.ts (TDD RED→GREEN)
**Commit:** `97db9cc`

`src/lib/data/seo-hierarchy.ts` 생성:
- `getSiPageData(si, supabase)` — 창원(guList+avgPrice) / 김해(dongList+avgPrice) 자동 분기 (W1)
- `getGuPageData(si, gu, supabase)` — 창원 구 레벨 dongList+avgPrice
- `getDongPageData(si, gu, dong, supabase)` — 동 단지 목록 + 동 평균 평당가 (W1)
- `getComplexBySlug(urlSlug, supabase)` — url_slug로 단지 조회 + 빈 slug guard (T-23-01-01 mitigate)
- `import 'server-only'` 포함

테스트: 5개 GREEN (창원 guList avgPrice, 김해 dongList avgPrice, 빈 데이터 null, 빈 slug guard, 유효 slug 반환)

### T-03: complex-detail.ts + sitemap.ts 확장
**Commit:** `b7a82d5`

`src/lib/data/complex-detail.ts`:
- `ComplexDetail` 인터페이스에 `url_slug: string | null` 추가 (SEO-01)
- `getComplexById` SELECT 쿼리에 `url_slug` 포함

`src/lib/data/sitemap.ts`:
- `SitemapEntry` 인터페이스에 `url_slug`, `si`, `gu`, `dong` 필드 추가 (SEO-05)
- `getComplexesForSitemap` SELECT 확장

## Verification Results

| Check | Result |
|-------|--------|
| url-slug.test.ts | 12개 PASS |
| seo-hierarchy.test.ts | 5개 PASS |
| buildUrlSlug 창원 4단계 | ✓ |
| buildUrlSlug 김해 3단계 | ✓ |
| classifySlug 5종 판별 | ✓ |
| buildCanonicalUrl 인코딩 | ✓ |
| getSiPageData avgPrice (W1) | ✓ |
| getComplexBySlug empty guard | ✓ |
| url_slug in ComplexDetail | ✓ |
| url_slug in SitemapEntry | ✓ |
| server-only url-slug.ts | 없음 (scripts import 가능) |
| server-only seo-hierarchy.ts | 있음 |
| 빌드 오류 (내 변경) | 없음 |

## Deviations from Plan

### Auto-added Tests

**[Rule 2 - Missing Coverage] 김해시 dongList avgPrice 테스트 추가**
- **Found during:** T-02 GREEN 단계
- **Issue:** Plan 예시 코드에 4개 테스트만 있어 AC "5개 이상" 미충족
- **Fix:** 김해시 시나리오 (gu=null → dongList 분기, avgPrice 계산) 테스트 추가
- **Files modified:** `src/lib/data/seo-hierarchy.test.ts`
- **Commit:** `97db9cc`

### Pre-existing Issue (Out of Scope)

`scripts/geocode-to-sql.ts:68` — "Duplicate function implementation" TypeScript 에러.
내 변경 전부터 존재하는 pre-existing 빌드 오류. `scripts/` 폴더의 독립 스크립트로 범위 외.
`npm run build`는 이 파일로 인해 실패하지만 이는 Phase 23-01 이전부터의 기존 문제.

## Security Notes (Threat Model)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-23-01-01 (Tampering - getComplexBySlug) | mitigate | .eq('url_slug', urlSlug) parameterized + if (!urlSlug) return null guard 구현 |
| T-23-01-02 (Information Disclosure - seo-hierarchy) | accept | complexes anon read RLS 기존 정책 유지 |
| T-23-01-03 (DoS - getDongPageData) | accept | .not('url_slug', 'is', null) 필터 + 동당 단지 수 자연 제한 |

## Known Stubs

None. 모든 함수 완전 구현.

## Threat Flags

None. 새로운 네트워크 엔드포인트 없음 (데이터 레이어 함수만).

## Downstream Dependencies

이 플랜이 제공하는 것:
- `buildUrlSlug / classifySlug / buildCanonicalUrl` — Wave 2 catch-all 라우트에서 사용
- `getSiPageData / getGuPageData / getDongPageData / getComplexBySlug` — Wave 2 [slug]/page.tsx에서 사용
- `ComplexDetail.url_slug` — Wave 2 /complexes/[id] permanentRedirect에서 사용
- `SitemapEntry.{url_slug,si,gu,dong}` — Wave 3 sitemap.ts 계층 URL 생성에 사용

## Self-Check: PASSED

- [x] `src/lib/utils/url-slug.ts` 존재
- [x] `src/lib/utils/url-slug.test.ts` 존재
- [x] `src/lib/data/seo-hierarchy.ts` 존재
- [x] `src/lib/data/seo-hierarchy.test.ts` 존재
- [x] Commit `7299f91` (T-01) 존재
- [x] Commit `97db9cc` (T-02) 존재
- [x] Commit `b7a82d5` (T-03) 존재
- [x] 12+5 = 17개 테스트 GREEN
- [x] `ComplexDetail.url_slug` 필드 존재
- [x] `SitemapEntry.{url_slug,si,gu,dong}` 필드 존재
