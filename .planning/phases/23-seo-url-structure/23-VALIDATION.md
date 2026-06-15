---
phase: 23
slug: seo-url-structure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run src/lib/utils/url-slug.test.ts src/lib/data/seo-hierarchy.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 23-00-T01 | 23-00 | 0 | SEO-01 | url_slug 컬럼 존재 + NOT NULL 허용 | migration | `supabase db push` 후 \`SELECT column_name FROM information_schema.columns WHERE table_name='complexes' AND column_name='url_slug'\` | ⬜ pending |
| 23-00-T03 | 23-00 | 0 | SEO-01 | backfill 멱등성 (재실행 시 동일 결과) | manual | `npx tsx scripts/backfill-url-slugs.ts --dry-run` | ⬜ pending |
| 23-01-T01 | 23-01 | 1 | SEO-01 | buildUrlSlug("창원시","성산구","내동","대우2차") = "창원시/성산구/내동/대우2차" | unit (TDD) | `npx vitest run src/lib/utils/url-slug.test.ts` | ⬜ pending |
| 23-01-T02 | 23-01 | 1 | SEO-02 | getComplexBySlug("창원시/성산구/내동/대우2차") → complex data | unit | `npx vitest run src/lib/data/seo-hierarchy.test.ts` | ⬜ pending |
| 23-01-T03 | 23-01 | 1 | SEO-05 | getComplexesForSitemap() → [{url_slug, updated_at}] | unit | `npx vitest run src/lib/data/seo-hierarchy.test.ts` | ⬜ pending |
| 23-02-T01 | 23-02 | 2 | SEO-02, SEO-04 | catch-all page 렌더 + BreadcrumbList JSON-LD 포함 | build | `npm run build` | ⬜ pending |
| 23-02-T02 | 23-02 | 2 | SEO-03 | /complexes/[id] → 308 permanentRedirect | manual | curl -I `https://danjiondo.vercel.app/complexes/[uuid]` → Location: 한글 URL | ⬜ pending |
| 23-03-T01 | 23-03 | 2 | SEO-05 | sitemap.xml 포함 encodeURIComponent 한글 URL | unit | `npx vitest run src/lib/data/sitemap.test.ts` | ⬜ pending |
| 23-03-T02 | 23-03 | 2 | SEO-05 | feed.xml cancel_date IS NULL AND superseded_by IS NULL 필터 | unit | `npx vitest run src/app/feed.xml/route.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/utils/url-slug.test.ts` — buildUrlSlug 단위 테스트 (TDD RED)
- [ ] `src/lib/data/seo-hierarchy.test.ts` — getComplexBySlug, getDongPageData, getComplexesForSitemap 단위 테스트
- [ ] `src/lib/data/sitemap.test.ts` — encodeSlug, D-09 UUID fallback, 계층 URL 중복 제거
- [ ] `src/app/feed.xml/route.test.ts` — cancel_date/superseded_by 필터 검증

*23-01 T-01은 TDD(url-slug.test.ts 먼저), 나머지는 Wave 1/2에서 구현 직후 테스트.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /complexes/[uuid] → 308 리다이렉트 | SEO-03 | Next.js permanentRedirect()는 런타임에만 실행 | 배포 후: `curl -I https://danjiondo.vercel.app/complexes/[existing-uuid]` → 308 + Location 헤더 확인 |
| Naver Yeti 크롤링 확인 | SEO-06 | 네이버 서치어드바이저 등록은 외부 수동 작업 | 코드 배포 후 search.naver.com/indexing 에 URL 등록 |
| BreadcrumbList JSON-LD 네이버 반영 | SEO-02 | 크롤 주기 의존 | search.naver.com에서 `site:danjiondo.vercel.app` 검색 후 breadcrumb 표시 확인 (1~2주 소요) |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
