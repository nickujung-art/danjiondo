# Phase 23: SEO URL 구조 최적화 - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 13 (7 new, 6 modified)
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/[...slug]/page.tsx` | page (RSC) | request-response | `src/app/complexes/[id]/page.tsx` | exact |
| `src/app/complexes/[id]/page.tsx` | page (RSC) | request-response | itself (modify) | exact |
| `src/lib/data/seo-hierarchy.ts` | data function | CRUD-read | `src/lib/data/invest.ts` | exact |
| `src/lib/data/sitemap.ts` | data function | CRUD-read | itself (modify) | exact |
| `src/lib/utils/url-slug.ts` | utility | transform | `src/lib/utils/facility-format.ts` | exact |
| `src/lib/utils/url-slug.test.ts` | test | — | `src/lib/data/gap-label.test.ts` | exact |
| `src/app/sitemap.ts` | metadata route | batch | itself (modify) | exact |
| `src/app/feed.xml/route.ts` | route handler | request-response | `src/app/api/invest/prediction-commentary/route.ts` | exact |
| `src/app/[...slug]/opengraph-image.tsx` | OG image | request-response | `src/app/complexes/[id]/opengraph-image.tsx` | exact |
| `src/app/robots.ts` | metadata route | — | itself (modify) | exact |
| `src/app/layout.tsx` | layout | — | itself (modify) | exact |
| `supabase/migrations/20260609000001_phase23_url_slug.sql` | migration | — | `supabase/migrations/20260516000001_phase11_map_columns.sql` | exact |
| `scripts/backfill-url-slugs.ts` | script | batch | `scripts/backfill-jibun-addr.ts` | exact |

---

## Pattern Assignments

### `src/app/[...slug]/page.tsx` (page RSC, request-response)

**Analog:** `src/app/complexes/[id]/page.tsx`

**Imports pattern** (lines 1–41):
```typescript
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
// domain data functions from @/lib/data/seo-hierarchy
// utility from @/lib/utils/url-slug
```

**Next.js 15 params pattern** (lines 45–48, 52–54, 208–214):
```typescript
export const revalidate = 3600  // 1시간 ISR (계층+단지 통합; 기존 단지 페이지는 86400)

interface Props {
  params: Promise<{ id: string }>    // → catch-all: Promise<{ slug: string[] }>
  searchParams: Promise<{ area_type?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params        // → const { slug } = await params
  const supabase = createReadonlyClient()
  // ... query, build title/description
}

export default async function ComplexDetailPage({ params, searchParams }: Props) {
  const { id } = await params        // → const { slug } = await params
  const supabase = createReadonlyClient()
  const complex = await getComplexById(id, supabase)
  if (!complex) notFound()           // catch-all: notFound() for invalid depth or missing complex
```

**JSON-LD script pattern** (lines 320–354):
```typescript
const jsonLd = {
  '@context': 'https://schema.org',
  '@type':    'ApartmentComplex',
  // ... fields
}
// ...
return (
  <div ...>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
    {/* ... */}
  </div>
)
```
Copy this pattern verbatim for BreadcrumbList + FAQ JSON-LD. Just swap `jsonLd` content. No external library needed.

**generateMetadata openGraph/alternates pattern** (lines 52–74):
```typescript
return {
  title,
  description,
  openGraph: {
    title,
    description,
    url:      `${SITE}/complexes/${id}`,  // → encodeURIComponent per segment for Korean slug
    siteName: '단지온도',
    locale:   'ko_KR',
    type:     'website',
  },
  alternates: {
    canonical: `${SITE}/complexes/${id}`, // → encodeURIComponent per segment
  },
}
```

**`<header>` breadcrumb HTML pattern** (lines 369–376):
```tsx
<header style={{ position: 'sticky', top: 0, zIndex: 50, ... }}>
  <Link href="/" className="dj-logo">...</Link>
  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
    {breadcrumb.join(' › ')} › {complex.canonical_name}
  </span>
</header>
```
This is the visual breadcrumb. For D-07 compliance replace this `<span>` with a semantic `<nav aria-label="breadcrumb"><ol>` as documented in RESEARCH.md Pattern 6.

---

### `src/app/complexes/[id]/page.tsx` — permanentRedirect 추가 (modify existing)

**Analog:** itself. Add after `if (!complex) notFound()` at line 218:

```typescript
import { permanentRedirect } from 'next/navigation'

// SEO-03: url_slug 있는 단지는 한글 URL로 영구 리다이렉트 (308)
// url_slug = '창원시/성산구/내동/대우2차' (DB 저장 원시 한글값)
if ((complex as { url_slug?: string | null }).url_slug) {
  permanentRedirect('/' + (complex as { url_slug: string }).url_slug)
  // permanentRedirect는 throw로 구현 → 이후 코드 실행 안 됨
}
// 위치 null인 143개 단지는 url_slug=null → 기존 페이지 그대로 렌더
```

Note: `getComplexById` select 쿼리(lines 34–44 of `src/lib/data/complex-detail.ts`)에 `url_slug` 컬럼 추가 필요. 현재 select 목록에 없음.

---

### `src/lib/data/seo-hierarchy.ts` (data function, CRUD-read)

**Analog:** `src/lib/data/invest.ts`

**File header + imports pattern** (invest.ts lines 1–6):
```typescript
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
```
`import 'server-only'` 는 클라이언트 번들 포함 방지용. `src/lib/data/` 아래 모든 파일에 필수.

**Function signature + typed supabase pattern** (invest.ts lines 74–84):
```typescript
export async function getSiPageData(
  si: string,
  supabase: SupabaseClient<Database>,
): Promise<SiPageData | null> {
  const { data, error } = await supabase
    .from('complexes')
    .select('gu, dong, avg_sale_per_pyeong')
    .eq('si', si)
    .eq('status', 'active')
    .not('url_slug', 'is', null)

  if (error || !data || data.length === 0) return null
  // ... transform data
}
```

**Error handling pattern** (invest.ts lines 86, 95):
```typescript
if (error || !data) return []   // array return functions
if (error || !data || data.length === 0) return null  // nullable return functions
```
Throw only in `complex-detail.ts` (`getComplexById` at line 43: `throw new Error(...)`) — page-level queries throw. Data aggregation functions return empty/null and let the RSC page handle gracefully.

**CLAUDE.md transaction filter** — wherever querying `transactions` table:
```typescript
.is('cancel_date', null)
.is('superseded_by', null)
```

---

### `src/lib/data/sitemap.ts` — url_slug 컬럼 포함으로 확장 (modify existing)

**Analog:** itself (`src/lib/data/sitemap.ts`)

Current `SitemapEntry` (lines 4–7) and `getComplexesForSitemap` (lines 9–18) — extend to include `url_slug`, `si`, `gu`, `dong`:
```typescript
export interface SitemapEntry {
  id:         string
  updated_at: string
  url_slug:   string | null   // add
  si:         string | null   // add
  gu:         string | null   // add
  dong:       string | null   // add (for dong-level hierarchy URL extraction)
}
```

---

### `src/lib/utils/url-slug.ts` (utility, transform)

**Analog:** `src/lib/utils/facility-format.ts`

**Pattern** (facility-format.ts lines 1–23):
```typescript
/**
 * JSDoc 설명 — D-번호 결정 참조
 */
export function buildUrlSlug(
  si: string | null,
  gu: string | null,
  dong: string | null,
  canonicalName: string | null,
): string | null {
  if (!si || !dong || !canonicalName) return null
  // ...pure computation, no side effects, no imports needed
}
```
No `import 'server-only'` — this utility is used in both server and scripts. Pure functions only.

---

### `src/lib/utils/url-slug.test.ts` (Vitest test)

**Analog:** `src/lib/data/gap-label.test.ts`

**File structure pattern** (gap-label.test.ts lines 1–99):
```typescript
/**
 * url-slug 테스트 — buildUrlSlug() + classifySlug() + buildCanonicalUrl()
 *
 * Phase 23 (TDD RED)
 */
import { describe, it, expect } from 'vitest'
import { buildUrlSlug, classifySlug, buildCanonicalUrl } from './url-slug'

describe('buildUrlSlug', () => {
  it('창원 4단계 — si+gu+dong+name', () => {
    expect(buildUrlSlug('창원시', '성산구', '내동', '대우2차')).toBe('창원시/성산구/내동/대우2차')
  })
  it('김해 3단계 — gu=null이면 si+dong+name', () => {
    expect(buildUrlSlug('김해시', null, '내동', '리버사이드팰리스')).toBe('김해시/내동/리버사이드팰리스')
  })
  it('si=null이면 null 반환', () => {
    expect(buildUrlSlug(null, null, '내동', '대우2차')).toBeNull()
  })
  // ... more cases
})
```
No Supabase mock needed for pure utility functions — `makeSupabaseMock` pattern from `gap-label.test.ts` is only needed for `seo-hierarchy.test.ts`.

---

### `src/app/sitemap.ts` — 한글 URL + 계층 페이지 포함 (modify existing)

**Analog:** itself (`src/app/sitemap.ts`)

**Critical fix** (lines 5–6): Remove `export const dynamic = 'force-dynamic'` (overrides revalidate). Keep only `export const revalidate = 86400`.

**Current pattern to preserve** (lines 1–37): `createReadonlyClient`, `MetadataRoute.Sitemap`, static routes array, `complexRoutes.map(c => ({ url, lastModified, changeFrequency, priority }))`.

**encodeSlug helper needed** (not in current file — new addition):
```typescript
function encodeSlug(slug: string): string {
  return slug.split('/').map(encodeURIComponent).join('/')
}
```
Sitemap URLs must be RFC 3986 compliant — Korean characters must be `encodeURIComponent`-encoded. This is opposite to catch-all page params which are auto-decoded.

---

### `src/app/feed.xml/route.ts` (route handler, request-response)

**Analog:** `src/app/api/invest/prediction-commentary/route.ts`

**revalidate + GET function pattern** (prediction-commentary/route.ts lines 1–7):
```typescript
export const revalidate = 3600

export async function GET(request: NextRequest): Promise<Response> {
  // ... query supabase, build response
  return Response.json({ ... })
}
```
For RSS, return `new Response(rssXml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })` instead of `Response.json`.

**Supabase client** — use `createReadonlyClient()` from `@/lib/supabase/readonly`, not `createSupabaseAdminClient()`. RSS is public read-only data.

**Foreign table join type assertion pattern** (complexes/[id]/page.tsx lines 243–250):
```typescript
const result = await supabase
  .from('facility_kapt')
  .select('*')
  .eq('complex_id', id)
  .maybeSingle()
const facilityKapt = result?.data ?? null
// Then: (facilityKapt as { parking_count?: number | null } | null)?.parking_count
```
Use `as` type assertion for foreign table join results. Same pattern applies to `transactions!inner(complexes(...))` in RSS feed query.

**CLAUDE.md transaction filter** applies here too:
```typescript
.is('cancel_date', null)
.is('superseded_by', null)
```

---

### `src/app/[...slug]/opengraph-image.tsx` (OG image)

**Analog:** `src/app/complexes/[id]/opengraph-image.tsx` — copy verbatim, change `{ id }` to `{ slug }`.

**Full pattern** (opengraph-image.tsx lines 1–130):
```typescript
export const runtime = 'nodejs'   // TTF 4MB 로드 허용
export const alt = '단지온도 아파트 실거래가'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 86400

interface Props { params: Promise<{ slug: string[] }> }  // slug[] 변경

export default async function Image({ params }: Props): Promise<ImageResponse> {
  const { slug } = await params  // await params 패턴 동일
  const fontData = readFileSync(join(process.cwd(), 'public/fonts/PretendardSubset.ttf'))

  // catch-all: 마지막 세그먼트가 이름, 나머지가 위치
  const name = slug[slug.length - 1] ?? '단지온도'
  const location = slug.slice(0, -1).join(' ')

  return new ImageResponse(/* 기존 JSX 디자인 그대로 */, {
    ...size,
    fonts: [{ name: 'Pretendard', data: fontData, style: 'normal', weight: 700 }],
  })
}
```
Supabase query 불필요 (params에서 직접 이름/위치 추출).

---

### `src/app/robots.ts` — Yeti 명시적 허용 추가 (modify existing)

**Analog:** itself (`src/app/robots.ts`)

Current pattern (lines 1–14) — add `Yeti` rule:
```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin/', '/api/'] },
      { userAgent: 'Yeti', allow: '/' },  // 추가
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
```
Note: current file uses `rules: { ... }` (single object), needs to change to `rules: [...]` (array) to support multiple rules.

---

### `src/app/layout.tsx` — content-language meta + RSS autodiscovery (modify existing)

**Analog:** itself (`src/app/layout.tsx`)

Current `<html>` structure (lines 36–50) — add `<head>` block:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <head>
        {/* SEO-04: Naver Yeti 한국어 명시 */}
        <meta httpEquiv="content-language" content="ko-kr" />
        {/* RSS autodiscovery */}
        <link rel="alternate" type="application/rss+xml" title="단지온도 최신 실거래가"
              href="/feed.xml" />
      </head>
      <body className="font-sans antialiased">
        <NuqsAdapter>{children}</NuqsAdapter>
        <Footer />
      </body>
    </html>
  )
}
```

---

### `supabase/migrations/20260609000001_phase23_url_slug.sql` (migration)

**Analog:** `supabase/migrations/20260516000001_phase11_map_columns.sql`

**Column addition pattern** (phase11 migration lines 1–17):
```sql
-- Phase 23: SEO URL 구조 최적화 — complexes.url_slug 컬럼 추가
-- 의존: complexes 테이블 (20260430000002_complexes.sql 이후)

-- ============================================================
-- 1. 컬럼 추가
-- ============================================================
ALTER TABLE public.complexes
  ADD COLUMN IF NOT EXISTS url_slug TEXT;

-- ============================================================
-- 2. UNIQUE INDEX (url_slug 기반 단지 조회 O(1))
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS complexes_url_slug_idx
  ON public.complexes(url_slug)
  WHERE url_slug IS NOT NULL;  -- Partial index: NULL은 제외 (143개 단지)
```

**Backfill UPDATE pattern** — no direct analog in existing migrations (they use RPC/function). Use direct UPDATE:
```sql
-- ============================================================
-- 3. Backfill
-- ============================================================
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
-- 예상 결과: url_slug IS NOT NULL ~ 1706개, IS NULL ~ 143개
```

Phase11 migration 스타일 규칙: 섹션 헤더 `-- ====` 구분선, `IF NOT EXISTS` 안전 가드, 의존 파일 주석.

---

### `scripts/backfill-url-slugs.ts` (script, batch)

**Analog:** `scripts/backfill-jibun-addr.ts` — exact match

**Full structure pattern** (backfill-jibun-addr.ts lines 1–112):

```typescript
/**
 * complexes.url_slug 백필 스크립트
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts
 *   npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts --limit=100
 *
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { buildUrlSlug } from '../src/lib/utils/url-slug'

loadEnvConfig(process.cwd(), true)

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL)     { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음'); process.exit(1) }
if (!SUPABASE_SRV_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT   = limitArg ? parseInt(limitArg.split('=')[1] ?? '10000', 10) : 10000

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SRV_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main(): Promise<void> {
  // query → loop → progress stdout.write → update → summary
}

main().catch((err: unknown) => {
  console.error('스크립트 실행 실패:', err)
  process.exit(1)
})
```

**Progress output pattern** (backfill-jibun-addr.ts lines 65–67):
```typescript
process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name.padEnd(30)} 업데이트: ${updated} 스킵: ${skipped} 실패: ${failed}`)
```

**Idempotent update guard pattern** (backfill-jibun-addr.ts lines 87–89):
```typescript
const { error: updateError } = await supabase
  .from('complexes')
  .update({ url_slug: newSlug })
  .eq('id', c.id)
  .is('url_slug', null)  // 이미 채워진 경우 덮어쓰기 방지
```

Note: `backfill-jibun-addr.ts`는 `loadEnvConfig`를 사용하지만 `backfill-realprice.ts`는 `dotenv.config`를 사용한다. 최신 스크립트 패턴은 `loadEnvConfig(@next/env)` 사용.

---

## Shared Patterns

### Supabase readonly client
**Source:** `src/lib/supabase/readonly.ts` (전체 파일 4줄)
**Apply to:** `src/app/[...slug]/page.tsx`, `src/app/feed.xml/route.ts`, `src/app/sitemap.ts`, `src/app/[...slug]/opengraph-image.tsx`
```typescript
import { createReadonlyClient } from '@/lib/supabase/readonly'
const supabase = createReadonlyClient()
```
`createReadonlyClient()` 사용 이유: `cookies()`를 호출하지 않아 ISR `revalidate`가 정상 동작. 서버 컴포넌트/Route Handler에서 공개 데이터 조회 시 전용.

### Next.js 15 await params
**Source:** `src/app/complexes/[id]/page.tsx` lines 45–48, 209–210
**Apply to:** 모든 신규 RSC 페이지 (`[...slug]/page.tsx`, `[...slug]/opengraph-image.tsx`)
```typescript
interface Props { params: Promise<{ slug: string[] }> }
const { slug } = await params  // Promise — await 필수 (Next.js 15)
```

### CLAUDE.md transaction filter
**Source:** CLAUDE.md + `supabase/migrations/20260516000001_phase11_map_columns.sql` lines 44–45
**Apply to:** `src/lib/data/seo-hierarchy.ts` (transactions 쿼리 시), `src/app/feed.xml/route.ts`
```typescript
.is('cancel_date', null)
.is('superseded_by', null)
```
누락 시 취소·정정 거래 포함 → 데이터 오염.

### JSON-LD script tag
**Source:** `src/app/complexes/[id]/page.tsx` lines 351–354
**Apply to:** `src/app/[...slug]/page.tsx` (BreadcrumbList, FAQ JSON-LD)
```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

### SITE constant
**Source:** `src/app/complexes/[id]/page.tsx` line 50, `src/app/sitemap.ts` line 8, `src/app/robots.ts` line 3
**Apply to:** 모든 신규 파일 (URL 생성 시)
```typescript
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'
```

---

## No Analog Found

없음. 모든 파일에 대해 프로젝트 내 기존 analog 발견됨.

---

## Metadata

**Analog search scope:** `src/app/`, `src/lib/data/`, `src/lib/utils/`, `scripts/`, `supabase/migrations/`
**Files scanned:** 13 analogs read
**Pattern extraction date:** 2026-06-09
