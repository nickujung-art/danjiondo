# Phase 23 — SEO URL 구조 최적화 ✅ 완료 (2026-06)

## 구현 내용
- 한글 계층 URL 전면 도입: `/창원시/성산구/내동/단지명` (네이버 Yeti 최적화)
- `complexes.url_slug` 컬럼 추가 + backfill 1,887건 완료
- `/complexes/[uuid]` → 308 permanentRedirect (활성 단지만: `url_slug && status === 'active'`)
- `src/app/[...slug]/page.tsx` catch-all: 시(창원시/김해시) / 구 / 동 / 단지상세 4단계 dispatch
- BreadcrumbList JSON-LD + FAQPage JSON-LD 모든 계층 페이지에 추가
- `content-language: ko-kr` meta + RSS autodiscovery link (layout.tsx)
- sitemap.ts: 계층 URL + 한글 URL (revalidate=86400), robots.ts: Naver Yeti 허용
- `/feed.xml` RSS 2.0 — 최근 거래 50건, cancel_date/superseded_by 필터

## 신규 파일
- `supabase/migrations/20260609000001_phase23_url_slug.sql` — url_slug UNIQUE INDEX (partial)
- `scripts/backfill-url-slugs.ts` — idempotent, --dry-run 지원
- `src/lib/utils/url-slug.ts` — buildUrlSlug, classifySlug, buildCanonicalUrl (테스트 12개)
- `src/lib/data/seo-hierarchy.ts` — server-only, 4개 함수 (테스트 5개)
- `src/app/[...slug]/page.tsx` — 1177줄 catch-all
- `src/app/[...slug]/opengraph-image.tsx` — catch-all OG 이미지
- `src/app/feed.xml/route.ts` + 테스트 2개
- `public/naver-site-verification.txt`

## 특이사항 / 유지보수
- CR-01 수정(b890f32): complexCount 오계산 → `{ count, prices }` 구조체로 수정
- CR-02 수정(07ee8ae): 비활성 단지 308 리다이렉트 → `status === 'active'` 조건 추가
- 미수정 Warning: feed.xml 1억 미만 거래 "0억" 표시 / permanentRedirect 미인코딩 한글 URL / [...]slug dispatch 시 DB 2회 조회 / opengraph-image.tsx 폰트 try/catch 없음
- `[...slug]/page.tsx` dispatch에서 getGuPageData/getDongPageData 1차 후 컴포넌트 내부 2차 조회(DB 중복) — ISR 캐시로 완화
- 검증: 빌드/lint/test 통과, 22개 단위 테스트 GREEN, 런타임 HTTP 응답은 Vercel 배포 후 확인 완료
