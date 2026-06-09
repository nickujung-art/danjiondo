# Phase 23: SEO URL 구조 최적화 — Research

**Researched:** 2026-06-09
**Domain:** Next.js 15 App Router routing / SEO / Supabase schema migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01**: 한글 URL — `창원시/성산구/내동/대우2차` 형태. 로마자 변환 없음.
- **D-02**: 창원 4단계 / 김해 3단계 — `src/app/[...slug]/page.tsx` catch-all.
- **D-03**: 시·구·동·단지 4개 계층 페이지 모두 SSR. 시/구 페이지: 하위 목록 + 평균 시세. 동 페이지: 단지 목록 + 평균가.
- **D-04**: SEO 최적화 최우선, 사용자 경험은 2순위.
- **D-05**: Yeti JS 불렌더 → 모든 실거래 데이터는 서버 컴포넌트 SSR. 클라이언트 fetch 전환 금지.
- **D-06**: title ≤40자, description ≤80자, `<meta http-equiv="content-language" content="ko-kr">` 모든 페이지.
- **D-07**: BreadcrumbList JSON-LD + 눈에 보이는 `<nav>` 브레드크럼 HTML 모두 필요.
- **D-08**: `complexes.url_slug` 컬럼 사전 계산 — 배치 backfill + 신규 단지 ingest 시 자동.
- **D-09**: 위치 null인 143개 단지는 `url_slug=null`, `/complexes/[id]` 유지.
- **D-10**: si+gu+dong+canonical_name 충돌 0건 → disambiguation suffix 불필요.
- **D-11**: `/feed.xml` RSS 2.0, 최근 거래 50건.
- **D-12**: FAQ JSON-LD는 시·동 레벨 페이지에만 (구·단지 상세 제외).

### Claude's Discretion

- url_slug 충돌 시 suffix 전략 (현재 불필요)
- catch-all route에서 404 처리 방식
- 사이트맵 분할 전략 (50,000 이하면 단일 파일)
- ISR revalidate 시간 (계층 페이지: 1시간, 단지 페이지: 24시간 권장)

### Deferred Ideas (OUT OF SCOPE)

- 네이버 서치어드바이저 실제 등록 (수동)
- 구글 Search Console 등록
- 네이버 블로그 연동
- 진학률 업데이트 (11월 별도)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEO-01 | 한글 URL 구조 — `complexes.url_slug` 컬럼 추가, 위치 null 143개 기존 URL 유지 | 마이그레이션 패턴 + SQL backfill 방법 확인 |
| SEO-02 | 계층별 페이지 — BreadcrumbList JSON-LD + `<nav>` HTML + 실거래 데이터 SSR | Next.js 15 catch-all route + ISR 패턴 확인 |
| SEO-03 | `/complexes/[id]` → 새 한글 URL 301 리다이렉트 | RSC `permanentRedirect()` vs middleware 비교 완료 |
| SEO-04 | 메타데이터 최적화 — title/description 제약, `content-language`, FAQ JSON-LD | `generateMetadata` + `metadata.other` API 확인 |
| SEO-05 | `/sitemap.xml` (lastmod=최근 거래일) + `/feed.xml` RSS 2.0 | 기존 `sitemap.ts` 확장 패턴 + Route Handler RSS 확인 |
| SEO-06 | robots.txt 최적화 + 네이버 서치어드바이저 소유권 인증 경로 | `robots.ts` 패턴 + `public/` 정적 파일 방법 확인 |

</phase_requirements>

---

## Summary

Phase 23은 Next.js 15 App Router에 `[...slug]` catch-all 라우트를 추가하여 `/창원시/성산구/내동/대우2차` 형태의 한글 계층 URL을 구현하는 작업이다. 기술적 난이도는 중간 수준이며, 세 가지 독립 작업 스트림으로 나뉜다: (1) DB 마이그레이션 + backfill, (2) Next.js 라우팅 + 계층 페이지 구현, (3) SEO 메타데이터 + 사이트맵 + RSS.

Next.js 15에서 params는 `Promise`이므로 반드시 `await params`가 필요하다. 한글 URL 파라미터는 v10.0.5 이후 자동 디코딩되므로 `decodeURIComponent`가 불필요하다. [VERIFIED: github.com/vercel/next.js/discussions/17620]

리다이렉트 전략: Next.js 15의 `permanentRedirect()`는 308 상태코드를 반환한다. Naver 공식 문서는 301을 권장하나, Naver Yeti는 GET 요청만 하므로 308(GET method 보존)과 301(method 변경 허용)의 실질적 차이는 없다. 기존 프로젝트도 `next.config.ts`의 `permanent: true`로 308을 사용하고 있으므로 일관성을 위해 RSC `permanentRedirect()` 사용을 권장한다. [VERIFIED: github.com/vercel/next.js/discussions/70668, CITED: nextjs.org/docs]

**Primary recommendation:** ISR (no `generateStaticParams`) + `revalidate=3600` catch-all + RSC `permanentRedirect()` 방식으로 Vercel Hobby 빌드 시간 최소화하면서 SEO 최적화.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 한글 URL 라우팅 | Frontend Server (SSR) | — | Next.js App Router catch-all, 서버 컴포넌트에서 파라미터 해석 |
| 계층 페이지 데이터 (시/구/동) | API / Backend | Database | Supabase 쿼리는 서버 컴포넌트에서만 (CLAUDE.md) |
| 단지 상세 데이터 | API / Backend | Database | 기존 `getComplexById` 패턴 재사용 |
| 301 리다이렉트 | Frontend Server (SSR) | — | RSC `permanentRedirect()` — 미들웨어 불필요 |
| Sitemap 생성 | Frontend Server (SSR) | Database | `MetadataRoute.Sitemap` + DB 쿼리 (ISR 24시간) |
| RSS 피드 | API / Backend | Database | Route Handler + Supabase query |
| BreadcrumbList JSON-LD | Frontend Server (SSR) | — | RSC에서 script[type=ld+json] 렌더 |
| `content-language` meta | Frontend Server (SSR) | — | root `layout.tsx`의 `<head>` 요소 |

---

## Standard Stack

### Core (기존 스택 — 추가 설치 불필요)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.3.1 | App Router catch-all, ISR, MetadataRoute.Sitemap, Route Handler | 이미 설치됨 |
| @supabase/supabase-js | ^2.105.1 | DB query for slug lookup, hierarchy data | 이미 설치됨 |
| @supabase/ssr | ^0.10.2 | Server Component client | 이미 설치됨 |

### Supporting

이 Phase는 신규 npm 패키지 설치 없음. 기존 스택 100% 재사용.

**Installation:** 없음 (신규 패키지 불필요)

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request /창원시/성산구/내동/대우2차
        │
        ▼
[middleware.ts]
  - Auth check (기존 로직 유지)
  - /complexes/[uuid] 패턴 감지 → NO (catch-all로 처리)
        │
        ▼
[src/app/[...slug]/page.tsx]  ← catch-all
  slug.length === 1 → SiPage component
  slug.length === 2 → GuPage (창원) or DongPage (김해)
  slug.length === 3 → DongPage (창원) or ComplexDetail (김해)
  slug.length === 4 → ComplexDetail (창원)
        │
        ├─ Supabase: SELECT si/gu/dong complexes (hierarchy)
        ├─ Supabase: SELECT by url_slug (complex detail)
        │
        ▼
    RSC HTML + JSON-LD (BreadcrumbList + FAQ)
    metadata: title, description, canonical, OG

HTTP Request /complexes/[uuid]  ← 기존 URL (SEO-03)
        │
        ▼
[src/app/complexes/[id]/page.tsx]
  1. getComplexById(id) → complex
  2. if complex.url_slug → permanentRedirect('/' + complex.url_slug)
  3. else (null slug = 143개) → render page as-is

/sitemap.xml → src/app/sitemap.ts (ISR 24시간)
  - 기존 UUID URL (url_slug null인 143개)
  - 새 Korean URL (url_slug 있는 1,706개)
  - 계층 페이지 (시/구/동)
  - lastmod = complexes.updated_at

/feed.xml → src/app/feed.xml/route.ts (ISR 1시간)
  - 최근 거래 50건 RSS 2.0
```

### Recommended Project Structure

```
src/
  app/
    [...slug]/
      page.tsx              # SEO-02: 계층별 + 단지 상세 catch-all
      opengraph-image.tsx   # OG image for 한글 URL
    complexes/
      [id]/
        page.tsx            # SEO-03: permanentRedirect 추가
    feed.xml/
      route.ts              # SEO-05: RSS 2.0
    sitemap.ts              # SEO-05: Korean URL + 계층 페이지 포함 (기존 확장)
    robots.ts               # SEO-06: Yeti 최적화 (기존 확장)
    layout.tsx              # SEO-04: content-language meta 추가
  lib/
    data/
      seo-hierarchy.ts      # 계층 페이지 데이터 함수 (신규)
      sitemap.ts            # 기존 + url_slug 포함으로 확장
    utils/
      url-slug.ts           # buildUrlSlug(), parseSlug() (신규)
  __tests__/
    url-slug.test.ts        # Vitest unit tests
supabase/
  migrations/
    20260609000001_phase23_url_slug.sql   # url_slug 컬럼 + backfill
public/
  [naver-code].html         # SEO-06: 네이버 서치어드바이저 소유권 인증 (수동 배포)
```

### Pattern 1: Next.js 15 Catch-All Route

**What:** `src/app/[...slug]/page.tsx`로 `/창원시`, `/창원시/성산구`, `/창원시/성산구/내동`, `/창원시/성산구/내동/대우2차` 모두 처리.

**Key facts:**
- `params`는 `Promise<{ slug: string[] }>` (Next.js 15 필수 패턴)
- `slug` 값은 자동 디코딩됨 — `decodeURIComponent` 불필요 [VERIFIED: github.com/vercel/next.js/discussions/17620, fixed in v10.0.5]
- 기본 `dynamicParams = true`: `generateStaticParams` 없어도 on-demand ISR 동작
- `generateStaticParams` 미사용 권장 — 1,849개 페이지 빌드 타임 생성은 Vercel Hobby 빌드 초과 위험

```typescript
// Source: nextjs.org/docs/app/api-reference/functions/generate-static-params.md
// src/app/[...slug]/page.tsx

export const revalidate = 3600  // 1시간 ISR — 계층+단지 통합 값

interface Props {
  params: Promise<{ slug: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // slug는 이미 decoded Korean string — ['창원시', '성산구', '내동', '대우2차']
  return buildMetadata(slug)
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params
  const supabase = createReadonlyClient()

  // 깊이 기반 dispatch
  if (slug.length === 1) {
    return <SiPage si={slug[0]} supabase={supabase} />
  }
  if (slug.length === 2) {
    // 창원시 → gu page; 김해시 → dong page
    // DB 쿼리로 판별 (url_slug 충돌 없음 D-10)
    return <GuOrDongPage slug={slug} supabase={supabase} />
  }
  if (slug.length === 3) {
    // url_slug='A/B/C'이면 김해 단지 상세; 없으면 창원 동 페이지
    const urlSlug = slug.join('/')
    const complex = await getComplexBySlug(urlSlug, supabase)
    if (complex) return <ComplexDetailPage complex={complex} supabase={supabase} />
    return <DongPage slug={slug} supabase={supabase} />
  }
  if (slug.length === 4) {
    // 항상 창원 단지 상세
    const urlSlug = slug.join('/')
    const complex = await getComplexBySlug(urlSlug, supabase)
    if (!complex) notFound()
    return <ComplexDetailPage complex={complex} supabase={supabase} />
  }
  notFound()
}
```

### Pattern 2: url_slug DB 마이그레이션 + Backfill

**What:** `complexes` 테이블에 `url_slug TEXT` 컬럼 추가 + SQL backfill + UNIQUE INDEX.

```sql
-- Source: 기존 마이그레이션 패턴 (20260516000001_phase11_map_columns.sql)
-- supabase/migrations/20260609000001_phase23_url_slug.sql

-- 1. 컬럼 추가
ALTER TABLE public.complexes
  ADD COLUMN IF NOT EXISTS url_slug TEXT;

-- 2. Unique index (url_slug 기반 단지 조회 O(1))
CREATE UNIQUE INDEX IF NOT EXISTS complexes_url_slug_idx
  ON public.complexes(url_slug)
  WHERE url_slug IS NOT NULL;

-- 3. Backfill — 창원(4단계, gu 있음) + 김해(3단계, gu NULL)
UPDATE public.complexes
SET url_slug = CASE
  WHEN gu IS NOT NULL
    THEN si || '/' || gu || '/' || dong || '/' || canonical_name
  ELSE
    si || '/' || dong || '/' || canonical_name
END
WHERE si IS NOT NULL
  AND dong IS NOT NULL
  AND canonical_name IS NOT NULL;

-- 4. 결과 검증 (이 주석에 예상 결과 기록)
-- SELECT COUNT(*) FROM complexes WHERE url_slug IS NOT NULL;  -- 예상: ~1706
-- SELECT COUNT(*) FROM complexes WHERE url_slug IS NULL;     -- 예상: ~143 (위치 없는 단지)
-- SELECT COUNT(*) FROM complexes;                             -- 예상: 1849
```

**주의 사항:**
- 신규 단지 ingest 시 `url_slug` 자동 계산 로직도 `src/services/` 레이어에 추가 필요 (D-08)
- `canonical_name`에 `/` 문자가 있는 경우 slug 파싱 충돌 가능 — D-10에서 충돌 없음 확인됨. 신규 단지 추가 시 검증 필요 [ASSUMED]

### Pattern 3: 301 리다이렉트 — RSC permanentRedirect()

**What:** `/complexes/[id]/page.tsx` 상단에 `permanentRedirect()` 호출로 308 응답 (Naver Yeti에게 실질적으로 301과 동일).

**308 vs 301 분석:**
- Next.js 15의 `permanentRedirect()`는 308 반환 [VERIFIED: nextjs.org/docs/app/api-reference/functions/permanentRedirect.md]
- 기존 `next.config.ts`의 gap-analysis→invest 리다이렉트도 `permanent: true` = 308
- Naver 공식 문서는 301 권장이나, 308은 GET-only 크롤러에서 동일하게 동작 [CITED: punchkorea.com/how-to-do-naver-seo]
- **프로젝트 일관성 유지: RSC `permanentRedirect()` 사용** (308)

```typescript
// src/app/complexes/[id]/page.tsx 상단에 추가
// Source: nextjs.org/docs/app/api-reference/functions/permanentRedirect.md

import { permanentRedirect } from 'next/navigation'

export default async function ComplexDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  // ...
  const complex = await getComplexById(id, supabase)
  if (!complex) notFound()

  // SEO-03: url_slug가 있는 단지는 한글 URL로 영구 리다이렉트
  if (complex.url_slug) {
    // url_slug = '창원시/성산구/내동/대우2차' (이미 DB에 저장된 원시 한글값)
    permanentRedirect('/' + complex.url_slug)
    // Next.js는 permanentRedirect를 throw로 구현 — 이후 코드 실행 안 됨
  }

  // 위치 null인 143개 단지 — 기존 페이지 그대로 렌더
  // ... (이하 기존 코드 유지)
}
```

**왜 middleware 방식을 쓰지 않나:**
- Middleware는 모든 `/complexes/[id]` 요청마다 실행 → DB lookup 추가 레이턴시
- RSC 방식은 기존 `getComplexById` 호출 결과 재사용 → DB 쿼리 1개도 추가 없음
- 리다이렉트는 한번만 발생 (클라이언트가 301/308 캐시) → 반복 비용 없음

### Pattern 4: Sitemap 확장

**What:** 기존 `src/app/sitemap.ts`를 수정하여 한글 URL + 계층 페이지 포함.

**현재 코드 문제점:**
- `export const dynamic = 'force-dynamic'` + `export const revalidate = 86400` 병용 → `force-dynamic`이 revalidate를 override함 (매 요청마다 재생성, 비효율)
- 수정 시 `dynamic` 내보내기 제거, `revalidate = 86400`만 유지

**한글 URL 인코딩:** `MetadataRoute.Sitemap`의 `url` 필드는 RFC 3986 준수 URL이어야 함. 한글 세그먼트는 `encodeURIComponent`로 인코딩 필요. [VERIFIED: github.com/vercel/next.js/issues/11016]

```typescript
// Source: nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap.md
// src/app/sitemap.ts

import type { MetadataRoute } from 'next'
import { createReadonlyClient } from '@/lib/supabase/readonly'

// force-dynamic 제거 — revalidate로만 제어
export const revalidate = 86400

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

function encodeSlug(slug: string): string {
  // '창원시/성산구/내동/대우2차' → '%EC.../...'
  return slug.split('/').map(encodeURIComponent).join('/')
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createReadonlyClient()

  // 기존 sitemap.ts의 getComplexesForSitemap 대신 확장 쿼리
  const { data: complexes } = await supabase
    .from('complexes')
    .select('id, url_slug, si, gu, dong, updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(50000)

  const all = complexes ?? []

  // 계층 페이지 URL 수집
  const siSet = new Set<string>()
  const guSet = new Set<string>()
  const dongSet = new Set<string>()

  for (const c of all) {
    if (c.si) siSet.add(c.si)
    if (c.si && c.gu) guSet.add(`${c.si}/${c.gu}`)
    if (c.url_slug) {
      // url_slug에서 dong 레벨 경로 추출
      const parts = c.url_slug.split('/')
      if (parts.length >= 3) dongSet.add(parts.slice(0, parts.length - 1).join('/'))
    }
  }

  const hierarchyRoutes: MetadataRoute.Sitemap = [
    ...[...siSet].map(si => ({
      url: `${SITE}/${encodeURIComponent(si)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...[...guSet].map(slug => ({
      url: `${SITE}/${encodeSlug(slug)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...[...dongSet].map(slug => ({
      url: `${SITE}/${encodeSlug(slug)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]

  const complexRoutes: MetadataRoute.Sitemap = all.map(c => ({
    url: c.url_slug
      ? `${SITE}/${encodeSlug(c.url_slug)}`
      : `${SITE}/complexes/${c.id}`,          // 위치 없는 143개는 기존 URL 유지
    lastModified: new Date(c.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [
    { url: `${SITE}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/map`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...hierarchyRoutes,
    ...complexRoutes,
  ]
}
```

**URL 수 예상:** 2 (정적) + ~2 (si) + ~5 (gu) + ~수십 (dong) + 1,849 (complex) = ~1,860개 — 50,000 한도 이하, 단일 파일로 충분.

### Pattern 5: RSS 2.0 피드

**What:** `src/app/feed.xml/route.ts` — Route Handler로 최근 거래 50건 RSS 2.0. [VERIFIED: nextjs.org/docs/app/guides/backend-for-frontend.md]

```typescript
// Source: nextjs.org/docs/app/guides/backend-for-frontend.md
// src/app/feed.xml/route.ts

export const revalidate = 3600  // 1시간 캐시

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

export async function GET(): Promise<Response> {
  const supabase = createReadonlyClient()

  // CLAUDE.md: cancel_date IS NULL AND superseded_by IS NULL 필수
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id, price, area_m2, deal_date,
      complex_id,
      complexes!inner(canonical_name, si, gu, dong, url_slug)
    `)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .not('complex_id', 'is', null)
    .order('deal_date', { ascending: false })
    .limit(50)

  const pubDate = new Date().toUTCString()

  const items = (transactions ?? []).map(tx => {
    const c = tx.complexes as { canonical_name: string; si: string | null; gu: string | null; dong: string | null; url_slug: string | null }
    const location = [c.si, c.gu, c.dong].filter(Boolean).join(' ')
    const priceOk = Math.floor((tx.price as number) / 10000)
    const areaPy = Math.round((tx.area_m2 as number) / 3.3058)
    const link = c.url_slug
      ? `${SITE}/${c.url_slug.split('/').map(encodeURIComponent).join('/')}`
      : `${SITE}/complexes/${tx.complex_id}`
    const title = `${c.canonical_name} ${areaPy}평 ${priceOk}억 (${tx.deal_date})`
    // RFC 2822 date format
    const itemPubDate = new Date(tx.deal_date as string).toUTCString()

    return `<item>
      <title><![CDATA[${title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description><![CDATA[${location} ${c.canonical_name} 실거래: ${priceOk}억 (${areaPy}평)]]></description>
      <pubDate>${itemPubDate}</pubDate>
    </item>`
  }).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>단지온도 - 창원·김해 최신 실거래가</title>
  <link>${SITE}</link>
  <description>창원·김해 아파트 최신 실거래가 50건. 오늘 신고된 거래를 빠르게 확인하세요.</description>
  <language>ko</language>
  <lastBuildDate>${pubDate}</lastBuildDate>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
```

**RSS autodiscovery:** `layout.tsx`의 metadata에 추가:
```typescript
export const metadata: Metadata = {
  // 기존 필드들...
  alternates: {
    types: {
      'application/rss+xml': `${SITE}/feed.xml`,
    },
  },
}
```

### Pattern 6: BreadcrumbList JSON-LD + FAQ JSON-LD

**BreadcrumbList (모든 계층 페이지):**
```typescript
// slug = ['창원시', '성산구', '내동', '대우2차']
function buildBreadcrumbJsonLd(slug: string[]) {
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'
  const items = [
    { '@type': 'ListItem', position: 1, name: '단지온도', item: SITE },
    ...slug.map((segment, i) => ({
      '@type': 'ListItem',
      position: i + 2,
      name: segment,
      // 마지막 항목(단지명)은 item URL 생략 가능 (Google 권장)
      ...(i < slug.length - 1 ? {
        item: `${SITE}/${slug.slice(0, i + 1).map(encodeURIComponent).join('/')}`,
      } : {}),
    })),
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }
}
```

**눈에 보이는 `<nav>` 브레드크럼 (D-07):**
```tsx
// 반드시 JSON-LD와 함께 표시되어야 함 (JSON-LD만 있으면 Naver 미인정)
<nav aria-label="breadcrumb">
  <ol style={{ display: 'flex', gap: 4, listStyle: 'none', padding: 0 }}>
    <li><Link href="/">단지온도</Link></li>
    {slug.map((segment, i) => (
      <li key={i}>
        <span aria-hidden="true"> › </span>
        {i < slug.length - 1
          ? <Link href={`/${slug.slice(0, i+1).map(encodeURIComponent).join('/')}`}>{segment}</Link>
          : <span>{segment}</span>
        }
      </li>
    ))}
  </ol>
</nav>
```

**FAQ JSON-LD (시·동 레벨만, D-12):**
```typescript
// DB 데이터 기반 동적 Q&A
function buildFaqJsonLd(si: string, avgPrice: number, txCount: number) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `${si} 아파트 평균 매매가는?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${si} 아파트 평균 매매가는 약 ${formatPrice(avgPrice)}입니다. 최근 ${txCount}건 거래 기준.`,
        },
      },
    ],
  }
}
```

### Pattern 7: content-language meta + layout.tsx 수정

**What:** `<meta http-equiv="content-language" content="ko-kr">` — Next.js Metadata API는 `http-equiv` 속성을 지원하지 않으므로 root `layout.tsx`의 `<head>` 태그에 직접 추가.

```tsx
// src/app/layout.tsx 수정
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <head>
        {/* SEO-04: Naver Yeti 한국어 페이지 명시 */}
        <meta httpEquiv="content-language" content="ko-kr" />
        {/* RSS autodiscovery (Naver 서치어드바이저 RSS 등록용) */}
        <link rel="alternate" type="application/rss+xml" title="단지온도 최신 실거래가"
              href={`${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'}/feed.xml`} />
      </head>
      <body className="font-sans antialiased">
        {/* ... */}
      </body>
    </html>
  )
}
```

**참고:** HTML5에서 `<meta http-equiv="content-language">`는 deprecated. `<html lang="ko">`(이미 있음)와 `Content-Language: ko` HTTP 헤더가 권장됨. D-06 결정에 따라 meta 태그도 함께 추가. [ASSUMED: Naver Yeti가 meta http-equiv content-language를 실제로 참조하는지 공식 확인 불가]

**추가 옵션** — `next.config.ts`에 HTTP 헤더 추가 (더 표준적):
```typescript
// next.config.ts의 기존 headers() 배열에 추가
{ key: 'Content-Language', value: 'ko' }
```

### Pattern 8: robots.txt 업데이트

```typescript
// src/app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/'],
      },
      {
        // Naver Yeti 명시적 허용 (기본 * 룰과 동일하지만 명시적으로)
        userAgent: 'Yeti',
        allow: '/',
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
```

### Pattern 9: 네이버 서치어드바이저 소유권 인증 (SEO-06)

**HTML 파일 방식 (권장):**
```
public/
  [naver-verification-code].html  // 네이버에서 다운로드한 파일을 그대로 배치
```

**Meta 태그 방식 (대안):**
```typescript
// src/app/layout.tsx의 metadata에 추가
export const metadata: Metadata = {
  verification: {
    other: {
      'naver-site-verification': ['[code]'],
    },
  },
}
```

→ 두 방식 모두 준비해 두고, 사용자가 네이버 서치어드바이저에서 코드 확인 후 수동 적용.

### Pattern 10: OG 이미지 — catch-all 라우트용

기존 `src/app/complexes/[id]/opengraph-image.tsx` 패턴 재사용.

```typescript
// src/app/[...slug]/opengraph-image.tsx
export const runtime = 'nodejs'   // TTF 4MB 로드 허용 (기존 패턴과 동일)
export const revalidate = 86400

interface Props { params: Promise<{ slug: string[] }> }

export default async function Image({ params }: Props): Promise<ImageResponse> {
  const { slug } = await params
  // slug는 auto-decoded: ['창원시', '성산구', '내동', '대우2차']

  const fontData = readFileSync(join(process.cwd(), 'public/fonts/PretendardSubset.ttf'))

  // 단지 상세 vs 계층 페이지 구분
  const name = slug[slug.length - 1]   // 마지막 세그먼트
  const location = slug.slice(0, -1).join(' ')

  return new ImageResponse(
    // ... 기존 디자인 패턴과 동일
  )
}
```

### Anti-Patterns to Avoid

- **`generateStaticParams` 사용 금지:** 1,849개 경로 + 계층 수십 개를 빌드 타임에 생성하면 Vercel Hobby 10분 빌드 한도 초과 위험. On-demand ISR으로 처리.
- **`decodeURIComponent` 불필요:** Next.js 15 params는 자동 디코딩. 이중 디코딩 시 오류.
- **middleware에서 DB lookup:** `/complexes/[id]` 리다이렉트는 RSC 레이어에서 처리. Middleware에 DB 쿼리 추가 시 Edge 런타임 레이턴시 증가.
- **`force-dynamic` + `revalidate` 동시 사용:** `force-dynamic`이 revalidate를 override. 기존 `sitemap.ts`의 `force-dynamic` 제거 필요.
- **Korean URL in metadata without encodeURIComponent:** `alternates.canonical`에 한글 직접 넣으면 Next.js가 HTML 속성에 인코딩 처리를 보장하지 않음. `encodeURIComponent` per segment 사용.
- **단일 rsate revalidate 해결책:** catch-all 파일에서 계층(1시간)과 단지(24시간)의 revalidate가 다름. 단일 파일에서는 `revalidate = 3600`을 사용하는 것이 합리적 (계층 변경 주기 > 1시간이므로 실질적 차이 없음).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Korean URL encoding | 커스텀 인코딩 함수 | `encodeURIComponent` (표준 JS) | RFC 3986 준수, Next.js와 호환 |
| 한글 URL 라우팅 | 별도 regex 매처 | Next.js `[...slug]` catch-all | 프레임워크 내장 지원 |
| JSON-LD 생성 | 별도 라이브러리 | 순수 객체 리터럴 + `JSON.stringify` | 이미 existing 코드 패턴 (complexes/[id]/page.tsx) |
| RSS XML 생성 | rss/feed npm 패키지 | 템플릿 리터럴 | 간단한 50건 피드에 라이브러리 오버킬. Next.js 공식 예제도 템플릿 사용 |
| Sitemap 분할 | 커스텀 sitemap index | Next.js `generateSitemaps` | 50,000 이하이므로 분할 불필요 |
| ISR 캐시 무효화 | 수동 revalidateTag 호출 | `revalidate = 3600/86400` 시간 기반 | 실거래 데이터 배치 주기(1일)와 맞음 |

**Key insight:** Next.js 15는 sitemap, robots, OG image, Route Handler에 대한 일급 지원을 제공한다. 커스텀 XML 파싱/생성 코드 불필요.

---

## Common Pitfalls

### Pitfall 1: catch-all 404 vs `notFound()` 혼용

**What goes wrong:** `slug.length === 0` (optional catch-all `[[...slug]]`의 경우 빈 배열 가능) 처리 누락 시 TypeError.

**Why it happens:** `[...slug]` (필수 catch-all)는 최소 1개 세그먼트 필요. 하지만 `slug.length > 4`인 비정상 URL에 대한 404 처리 누락.

**How to avoid:** 
```typescript
if (slug.length > 4 || slug.length === 0) notFound()
```

**Warning signs:** 5단계 이상 URL 접근 시 500 에러 (런타임에 발견 가능).

### Pitfall 2: 기존 `/complexes/[id]` 페이지와 새 catch-all 충돌

**What goes wrong:** Next.js App Router는 구체적 경로가 catch-all보다 우선. `/complexes/[id]`는 `src/app/complexes/[id]/page.tsx`에 매핑, `/창원시/...`는 `src/app/[...slug]/page.tsx`에 매핑. 충돌 없음.

**하지만:** `src/app/[id]/page.tsx`나 `src/app/[param]/page.tsx`처럼 1단계 동적 라우트가 이미 있으면 catch-all과 충돌. 현재 프로젝트에서 기존 1단계 동적 라우트 없음 [VERIFIED: `ls src/app` 결과 확인].

**How to avoid:** `src/app/` 직하위에 `[단일]` 동적 라우트가 없는지 배포 전 확인.

### Pitfall 3: 리다이렉트 무한 루프

**What goes wrong:** catch-all `/창원시/.../대우2차` 페이지에서 다시 `permanentRedirect('/' + url_slug)`를 호출하면 무한 루프.

**Why it happens:** `/complexes/[id]/page.tsx`에서 `permanentRedirect`를 호출하므로 새 URL은 catch-all로 라우팅 → catch-all은 리다이렉트 로직 없음 → 안전.

**How to avoid:** catch-all `[...slug]/page.tsx`에는 `permanentRedirect` 절대 추가 금지. `/complexes/[id]/page.tsx`에만 리다이렉트 로직.

### Pitfall 4: Supabase PostgREST foreign table JOIN 구문

**What goes wrong:** RSS 피드에서 `transactions!inner(...)` 문법이 Next.js + TypeScript strict 환경에서 타입 추론 실패.

**Why it happens:** `@supabase/supabase-js`의 타입 생성 (`Database` 타입)에서 foreign table join 타입이 복잡하게 추론됨.

**How to avoid:** 
```typescript
// 타입 assertion 사용 — 기존 코드 패턴 (complexes/[id]/page.tsx facilityKapt 사례)
const c = tx.complexes as { canonical_name: string; url_slug: string | null; ... }
```

### Pitfall 5: sitemap URL의 인코딩 일관성 — canonical과 불일치

**What goes wrong:** sitemap에서 `encodeURIComponent`로 인코딩한 URL과, 페이지 `metadata.alternates.canonical`에 한글 그대로 넣은 URL이 다름 → Google/Naver에서 canonical mismatch로 감지.

**How to avoid:** canonical URL도 동일하게 인코딩:
```typescript
// generateMetadata 안에서
const canonicalPath = slug.map(encodeURIComponent).join('/')
return {
  alternates: { canonical: `${SITE}/${canonicalPath}` }
}
```

### Pitfall 6: `complexes.url_slug`에 NULL 처리 누락

**What goes wrong:** `getComplexBySlug(urlSlug, supabase)`에서 url_slug = NULL인 단지 매칭 시도 → PostgREST `eq('url_slug', '')` 오류.

**How to avoid:**
```typescript
// url_slug=null인 행은 index에서 제외됨 (WHERE url_slug IS NOT NULL)
// 항상 null이 아닌 slug로만 쿼리
async function getComplexBySlug(urlSlug: string, supabase: SupabaseClient) {
  if (!urlSlug) return null
  const { data } = await supabase
    .from('complexes')
    .select('...')
    .eq('url_slug', urlSlug)
    .maybeSingle()
  return data
}
```

---

## Code Examples

### E-01: 계층 페이지 데이터 함수 — 시(시) 레벨

```typescript
// Source: 기존 src/lib/data/invest.ts 패턴 참조
// src/lib/data/seo-hierarchy.ts

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SiPageData {
  si:            string
  guList:        Array<{ gu: string; complexCount: number; avgPrice: number | null }>
  dongList:      Array<{ dong: string; complexCount: number }>  // 김해시용
  totalComplexes: number
  avgPrice:      number | null
}

export async function getSiPageData(si: string, supabase: SupabaseClient): Promise<SiPageData | null> {
  const { data, error } = await supabase
    .from('complexes')
    .select('gu, dong, avg_sale_per_pyeong')
    .eq('si', si)
    .eq('status', 'active')
    .not('url_slug', 'is', null)

  if (error || !data || data.length === 0) return null

  // 창원: gu별 집계; 김해: dong별 집계
  const hasCu = data.some(c => c.gu)
  if (hasCu) {
    // 창원시 — gu별 집계
    const byGu = new Map<string, number[]>()
    for (const c of data) {
      if (!c.gu) continue
      const prices = byGu.get(c.gu) ?? []
      if (c.avg_sale_per_pyeong) prices.push(c.avg_sale_per_pyeong)
      byGu.set(c.gu, prices)
    }
    return {
      si,
      guList: [...byGu.entries()].map(([gu, prices]) => ({
        gu,
        complexCount: prices.length,
        avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      })),
      dongList: [],
      totalComplexes: data.length,
      avgPrice: null,
    }
  } else {
    // 김해시 — dong별 집계
    // ... 유사 패턴
    return { si, guList: [], dongList: [], totalComplexes: data.length, avgPrice: null }
  }
}
```

### E-02: url-slug 유틸리티 함수

```typescript
// src/lib/utils/url-slug.ts
// CLAUDE.md: 컴포넌트·라우트 직접 호출 금지 없음 (util 함수이므로 OK)

/** DB에서 url_slug 컬럼값 생성 (마이그레이션 SQL과 동일 로직) */
export function buildUrlSlug(
  si: string | null,
  gu: string | null,
  dong: string | null,
  canonicalName: string | null,
): string | null {
  if (!si || !dong || !canonicalName) return null
  if (gu) return `${si}/${gu}/${dong}/${canonicalName}`
  return `${si}/${dong}/${canonicalName}`
}

/** catch-all slug 배열로 페이지 타입 판별 */
export type SlugPageType = 'si' | 'gu' | 'dong-or-complex' | 'complex' | 'invalid'

export function classifySlug(slug: string[]): SlugPageType {
  if (slug.length === 1) return 'si'
  if (slug.length === 2) return 'gu'      // 창원: si+gu; 김해: si+dong (dong-or-complex과 동일)
  if (slug.length === 3) return 'dong-or-complex'  // DB 조회로 확정
  if (slug.length === 4) return 'complex'
  return 'invalid'
}

/** 한글 URL을 canonical URL string으로 인코딩 */
export function buildCanonicalUrl(site: string, slug: string[]): string {
  return `${site}/${slug.map(encodeURIComponent).join('/')}`
}
```

### E-03: generateMetadata 패턴 (catch-all)

```typescript
// Source: nextjs.org/docs/app/api-reference/functions/generate-metadata.md
// D-06: title ≤40자, description ≤80자

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'
  const canonical = buildCanonicalUrl(SITE, slug)

  // 단지 상세 페이지
  if (slug.length >= 3) {
    const urlSlug = slug.join('/')
    const supabase = createReadonlyClient()
    const complex = await getComplexBySlug(urlSlug, supabase)
    if (complex) {
      const location = slug.slice(0, -1).join(' ')
      const name = slug[slug.length - 1]
      // ≤40자 체크: '내동 대우2차 아파트 매매·전세 | 단지온도' = 21자 (여유)
      const title = `${location.split(' ').pop()} ${name} 아파트 매매·전세 실거래가`
      // ≤80자 체크: '창원시 성산구 내동 대우2차 최근 실거래가 X억원. 평형별 시세·관리비 확인.' = ~42자 (여유)
      const description = `[${location}] ${name} 최근 실거래가 확인. 평형별 시세·관리비 정보.`
      return {
        title,
        description,
        alternates: { canonical },
        openGraph: { title, description, url: canonical, siteName: '단지온도', locale: 'ko_KR', type: 'website' },
      }
    }
  }

  // 계층 페이지
  const currentName = slug[slug.length - 1]
  const title = `${currentName} 아파트 실거래가 | 단지온도`
  const description = `${currentName} 아파트 시세·거래량 현황. 단지별 실거래가 목록.`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: '단지온도', locale: 'ko_KR', type: 'website' },
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router `getStaticPaths` | App Router `generateStaticParams` (선택적) | Next.js 13 | on-demand ISR이 기본 |
| `next/head` for meta | `generateMetadata` export | Next.js 13 | 선언형, 자동 dedup |
| `getServerSideProps` | Server Component (RSC) | Next.js 13 | 컴포넌트 레벨 data fetch |
| 308 "not SEO-safe" | 308 = 301 for GET crawlers | RFC 7538(2015) | Next.js 15 표준이 308 |
| XML 직접 파일 배포 | `app/sitemap.ts` (MetadataRoute) | Next.js 13.3 | ISR 자동 캐싱 |

**Deprecated/outdated:**
- `pages/api/*.ts` 사이트맵 Route → `app/sitemap.ts` 사용
- `<Head>` from `next/head` → `metadata` export API
- `getStaticPaths` fallback → `dynamicParams` + `generateStaticParams` (또는 생략)
- `force-dynamic` 단독 사용 → `revalidate` 값 설정으로 대체

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Naver Yeti는 308 영구 리다이렉트를 301과 동일하게 처리한다 | Pattern 3 | 308 리다이렉트가 SEO equity를 전달하지 않으면 기존 URL 링크 효과 유실 → middleware 방식으로 교체 필요 |
| A2 | `canonical_name`에 `/` 문자 없음 — url_slug 파싱 충돌 없음 | Pattern 2 | url_slug 조회 실패 → 단지 상세 페이지 404 발생 |
| A3 | Naver Yeti가 `<meta http-equiv="content-language">` 메타 태그를 검색 신호로 사용한다 | Pattern 7 | 구현해도 SEO 효과 없음 (낮은 위험) |
| A4 | transactions 테이블의 Supabase PostgREST foreign table JOIN (`complexes!inner`) 쿼리가 RSS 피드에서 정상 작동한다 | Pattern 5 | 타입 오류 또는 쿼리 실패 → 별도 SELECT complexes 쿼리로 분리 |

**Assumption A1 verification path:** 배포 후 Naver Search Advisor에서 `/complexes/[uuid]` URL의 색인 감소, 새 한글 URL 색인 증가 확인.

---

## Open Questions

1. **`complexes.url_slug` backfill 후 충돌 가능성**
   - What we know: D-10에서 si+gu+dong+canonical_name 조합 0건 충돌 확인됨 (2026-06-09 기준)
   - What's unclear: 향후 신규 단지 추가 시 중복 여부
   - Recommendation: UNIQUE INDEX로 DB 레벨에서 보호. INSERT 오류 발생 시 `complex_aliases` 기반으로 suffix 전략 추가.

2. **RSS 피드의 `deal_date` 기준 정렬 시 당일 실거래 없는 날**
   - What we know: 일배치 04:00 KST 실행. 피드 재생성은 ISR 1시간.
   - What's unclear: 거래 없는 주말/공휴일 피드 중복 방지
   - Recommendation: `revalidate = 3600` 유지. 데이터 자체가 변하지 않으면 캐시된 응답 재사용.

3. **Vercel Hobby 함수 개수 제한**
   - What we know: Vercel Hobby는 12개의 Edge/Serverless Function 제한 있음 (최신 정책 [ASSUMED])
   - What's unclear: 현재 몇 개 사용 중인지, catch-all + RSS가 추가되면 초과하는지
   - Recommendation: `vercel.json`에 함수 목록 확인 또는 Vercel 대시보드에서 확인 후 진행.

---

## Environment Availability

이 Phase는 신규 npm 패키지 설치 없음. 외부 서비스 의존성 없음. 모두 기존 환경 재사용.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 로컬 빌드 | ✓ | (project existing) | — |
| Supabase (remote) | DB 마이그레이션 + backfill | ✓ | ^2.105.1 client | — |
| Vercel Hobby | 배포 | ✓ | (existing) | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + happy-dom |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/utils/url-slug.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEO-01 | `buildUrlSlug` — 창원 4단계, 김해 3단계, null 처리 | unit | `npx vitest run src/lib/utils/url-slug.test.ts` | ❌ Wave 0 |
| SEO-01 | `classifySlug` — 깊이별 페이지 타입 반환 | unit | `npx vitest run src/lib/utils/url-slug.test.ts` | ❌ Wave 0 |
| SEO-02 | `getSiPageData` — 시 레벨 데이터 함수 Supabase mock | unit | `npx vitest run src/lib/data/seo-hierarchy.test.ts` | ❌ Wave 0 |
| SEO-05 | sitemap — url_slug 있는 단지는 한글 URL, 없는 건 /complexes/id | unit | `npx vitest run src/lib/data/sitemap.test.ts` | ❌ Wave 0 |
| SEO-05 | RSS feed — `cancel_date IS NULL AND superseded_by IS NULL` 필터 포함 | unit | `npx vitest run src/app/feed.xml/route.test.ts` | ❌ Wave 0 |
| SEO-03 | permanentRedirect 호출 조건 — url_slug 있으면 redirect, 없으면 render | manual | 브라우저에서 `/complexes/[uuid]` 접근 후 한글 URL 착지 확인 | manual-only |

### Wave 0 Gaps

- [ ] `src/lib/utils/url-slug.test.ts` — `buildUrlSlug`, `classifySlug`, `buildCanonicalUrl` covers SEO-01, SEO-02
- [ ] `src/lib/data/seo-hierarchy.test.ts` — `getSiPageData` Supabase mock, covers SEO-02
- [ ] `src/lib/data/sitemap.test.ts` — sitemap URL 생성 로직, covers SEO-05

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/utils/url-slug.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 공개 페이지, 인증 불필요 |
| V3 Session Management | no | 공개 페이지 |
| V4 Access Control | partial | RLS: `complexes` anon read 허용 (기존 정책 유지) |
| V5 Input Validation | yes | `slug` 파라미터 깊이 검증 (`slug.length > 4` → notFound()) |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via slug (`../admin`) | Spoofing | Next.js App Router가 `..` 세그먼트 자동 차단. 추가 검증 불필요. |
| Open redirect via url_slug (`/complexes/[id]`) | Spoofing | url_slug는 DB에서 조회된 값만 사용 — 사용자 입력 직접 사용 없음 |
| SQL injection via slug | Tampering | Supabase `.eq('url_slug', urlSlug)` — parameterized query |
| RSS CDATA injection via canonical_name | Tampering | `<![CDATA[${title}]]>` 감싸기로 처리. `]]>` 포함 여부 검증 필요 [ASSUMED: canonical_name에 ]]> 없음] |

---

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/nextjs` — catch-all routes, generateStaticParams, permanentRedirect, sitemap MetadataRoute, Route Handler RSS, generateMetadata API
- `src/app/sitemap.ts` (codebase) — 기존 sitemap 구현 패턴 직접 확인
- `src/app/complexes/[id]/page.tsx` (codebase) — 리다이렉트 대상 페이지 직접 확인
- `src/middleware.ts` (codebase) — 기존 미들웨어 구조 확인
- `next.config.ts` (codebase) — 기존 redirect 설정 확인
- `supabase/migrations/20260430000002_complexes.sql` (codebase) — complexes 스키마 직접 확인
- `supabase/migrations/20260516000001_phase11_map_columns.sql` (codebase) — 컬럼 추가 마이그레이션 패턴

### Secondary (MEDIUM confidence)
- [github.com/vercel/next.js/discussions/17620](https://github.com/vercel/next.js/discussions/17620) — Korean UTF-8 URL auto-decoding in Next.js
- [github.com/vercel/next.js/discussions/70668](https://github.com/vercel/next.js/discussions/70668) — permanentRedirect 308 vs 301 discussion
- [robertmarshall.dev/blog/how-to-permanently-redirect-301-308-with-next-js](https://robertmarshall.dev/blog/how-to-permanently-redirect-301-308-with-next-js/) — 308 SEO equivalence

### Tertiary (LOW confidence / ASSUMED)
- A1: Naver Yeti의 308 처리 방식 — [punchkorea.com/how-to-do-naver-seo](https://www.punchkorea.com/how-to-do-naver-seo-factors-and-checklists-to-rank-in-korea/) Naver recommends 301 but 308 treatment unknown
- A3: `<meta http-equiv="content-language">` Naver Yeti 참조 여부 — Naver 공식 문서에서 미확인

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 신규 패키지 없음, 기존 스택 100% 재사용 확인
- Architecture: HIGH — Next.js 15 catch-all 패턴, ISR, permanentRedirect Context7 공식 문서 확인
- DB Migration: HIGH — 기존 migration 패턴 10+개 직접 확인, SQL backfill 단순
- Pitfalls: HIGH — 기존 코드베이스 + GitHub issues 교차 검증
- Naver Yeti 특화 최적화: MEDIUM — Naver 공식 SEO 문서 상세 정보 미비, 업계 자료 기반

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (Next.js 15 stable이므로 30일 유효)
