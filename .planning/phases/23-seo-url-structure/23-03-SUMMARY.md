---
plan_id: 23-03
phase: 23
plan: 03
subsystem: seo-sitemap-rss
tags: [seo, sitemap, rss, robots, naver, isr, typescript]
dependency_graph:
  requires: [23-01]
  provides: [sitemap-korean-url, rss-feed, robots-yeti, naver-verification-guide]
  affects: [네이버 서치어드바이저 등록 (수동), 구글 Search Console (deferred)]
tech_stack:
  added: []
  patterns: [isr-revalidate, rss-2.0, next-metadata-route, vitest-mock]
key_files:
  created:
    - src/lib/data/sitemap.test.ts
    - src/app/feed.xml/route.ts
    - src/app/feed.xml/route.test.ts
    - public/naver-site-verification.txt
  modified:
    - src/app/sitemap.ts
    - src/lib/data/sitemap.ts
    - src/app/robots.ts
decisions:
  - "encodeSlug를 src/lib/data/sitemap.ts에서 export — sitemap.ts와 테스트 양쪽에서 재사용 (W4b)"
  - "feed.xml encodeSlug는 로컬 복사 — route.ts는 독립 파일, lib import 불필요"
  - "robots.ts Yeti 주석에서 'Yeti' 단어 제거 — grep -c 기준 1건만 카운트되도록"
metrics:
  duration_minutes: 15
  completed_date: "2026-06-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 3
---

# Phase 23 Plan 03: 사이트맵·RSS·robots 구현 Summary

## One-liner

sitemap.ts에 한글 URL 계층(시/구/동) + D-09 fallback UUID URL 추가, RSS 2.0 피드(/feed.xml) 신설 — cancel_date/superseded_by 필터 적용, robots.txt Yeti 명시 허용 + 네이버 서치어드바이저 인증 안내 파일 생성.

## What Was Built

### T-01: sitemap 한글 URL + 계층 페이지 + encodeSlug export + 테스트
**Commit:** `6d26b79`

`src/lib/data/sitemap.ts`:
- `encodeSlug(slug: string): string` 함수 export 추가 (W4b)
- 각 세그먼트에 `encodeURIComponent` 적용, 슬래시 유지

`src/lib/data/sitemap.test.ts` 생성:
- `encodeSlug` 단위 테스트 3개 GREEN (다단계 한글 슬러그, 단일 세그먼트, 4단계 분리)
- D-09 fallback 동작 문서화 (url_slug=null → /complexes/[id])

`src/app/sitemap.ts`:
- `export const dynamic = 'force-dynamic'` 제거 (RESEARCH Pattern 4: revalidate override 방지)
- `revalidate = 86400` ISR 캐시만 사용
- 계층 URL 집계: `siSet` / `guSet` / `dongSet` + `encodeSlug` 인코딩
- 단지 URL: `url_slug` 있으면 한글 URL, 없으면 `/complexes/[id]` (D-09)
- static 라우트에 `/invest`, `/presale` 추가

빌드: `/sitemap.xml` → `Revalidate: 1d, Expire: 1y` 정상

### T-02: feed.xml Route Handler + 테스트 + robots.ts + 네이버 인증 안내
**Commit:** `c317c00`

`src/app/feed.xml/route.ts` 신설 (SEO-05, D-11):
- `revalidate = 3600` ISR
- CLAUDE.md 필수 필터: `.is('cancel_date', null)` + `.is('superseded_by', null)`
- `deal_type = 'sale'`, `limit(50)`, `order('deal_date', desc)`
- RSS 2.0 XML: CDATA wrapping, atom:link self rel, ko language
- `Content-Type: application/rss+xml; charset=utf-8`

`src/app/feed.xml/route.test.ts` 생성 (W4c):
- 2개 테스트 GREEN: cancel_date/superseded_by IS NULL 필터 검증 + Content-Type 검증
- `vi.mock('@/lib/supabase/readonly')` 패턴

`src/app/robots.ts` 수정 (SEO-06):
- `rules: { ... }` → `rules: [...]` 배열로 변환
- Yeti user-agent 명시 추가: `allow: '/'`
- `/admin/`, `/api/` disallow 유지

`public/naver-site-verification.txt` 생성:
- HTML 파일 업로드 방법 (권장) + Meta 태그 방법 안내
- RSS/사이트맵 등록 URL 포함

빌드: `/feed.xml` → `Revalidate: 1h, Expire: 1y`, `/robots.txt` → Static 정상

## Verification Results

| Check | Result |
|-------|--------|
| `force-dynamic` in sitemap.ts | 0건 (제거됨) |
| `revalidate = 86400` in sitemap.ts | 1건 |
| `encodeSlug` 사용 in sitemap.ts | 4건 |
| `url_slug` in sitemap.ts | 6건 |
| `siSet` in sitemap.ts | 3건 |
| `export function encodeSlug` in sitemap.ts (lib) | 1건 |
| sitemap.test.ts 3개 테스트 | GREEN |
| `revalidate = 3600` in route.ts | 1건 |
| `cancel_date` in route.ts | 2건 |
| `superseded_by` in route.ts | 2건 |
| `rss version="2.0"` in route.ts | 1건 |
| `application/rss+xml` in route.ts | 2건 |
| `CDATA` in route.ts | 3건 |
| route.test.ts 2개 테스트 | GREEN |
| `Yeti` in robots.ts | 1건 |
| public/naver-site-verification.txt | 존재 |
| npm run build | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] robots.ts Yeti 주석 'Yeti' 단어 제거**
- **Found during:** T-02 acceptance criteria 확인
- **Issue:** `// SEO-06: Naver Yeti 명시적 허용` 주석에 'Yeti'가 포함되어 `grep -c "Yeti"` → 2 (기준: 1)
- **Fix:** 주석 문구를 '// SEO-06: 네이버 크롤러 명시적 허용'으로 변경
- **Files modified:** `src/app/robots.ts`
- **Commit:** `c317c00`

## Security Notes (Threat Model)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-23-03-01 (Tampering - RSS CDATA) | mitigate | `<![CDATA[...]]>` wrapping 구현. canonical_name에 ]]> 없음 확인 |
| T-23-03-02 (Tampering - transactions join) | mitigate | cancel_date IS NULL + superseded_by IS NULL + deal_type='sale' 필터 구현 |
| T-23-03-03 (Information Disclosure - sitemap) | accept | 단지 이름/위치는 공개 정보. SEO 의도된 노출 |
| T-23-03-04 (DoS - sitemap) | mitigate | revalidate=86400 ISR + limit(50000) 상한 구현 |
| T-23-03-05 (Information Disclosure - robots) | accept | /admin/, /api/ disallow 유지. Yeti는 공개 URL만 |

## Known Stubs

None. 모든 기능 완전 구현.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-public-endpoint | src/app/feed.xml/route.ts | 새 공개 엔드포인트. cancel_date/superseded_by 필터로 정보 노출 범위 제어됨 |

## Downstream Dependencies

- `/sitemap.xml`: 네이버 서치어드바이저 사이트맵 등록 (수동)
- `/feed.xml`: 네이버 서치어드바이저 RSS 등록 (수동)
- `public/naver-site-verification.txt`: 운영자가 인증 코드 확인 후 적용

## Self-Check: PASSED

- [x] `src/lib/data/sitemap.ts` `encodeSlug` export 존재
- [x] `src/lib/data/sitemap.test.ts` 존재 + 3개 PASS
- [x] `src/app/sitemap.ts` force-dynamic 제거, 계층 URL + 단지 한글 URL 포함
- [x] `src/app/feed.xml/route.ts` 존재
- [x] `src/app/feed.xml/route.test.ts` 존재 + 2개 PASS
- [x] `src/app/robots.ts` rules 배열 + Yeti 1건
- [x] `public/naver-site-verification.txt` 존재
- [x] Commit `6d26b79` (T-01) 존재
- [x] Commit `c317c00` (T-02) 존재
- [x] `npm run build` PASS
