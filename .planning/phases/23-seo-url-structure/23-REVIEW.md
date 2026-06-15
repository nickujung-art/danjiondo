---
phase: 23-seo-url-structure
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - src/app/[...slug]/page.tsx
  - src/app/[...slug]/opengraph-image.tsx
  - src/app/complexes/[id]/page.tsx
  - src/app/layout.tsx
  - src/app/robots.ts
  - src/app/sitemap.ts
  - src/app/feed.xml/route.ts
  - src/app/feed.xml/route.test.ts
  - src/lib/utils/url-slug.ts
  - src/lib/utils/url-slug.test.ts
  - src/lib/data/seo-hierarchy.ts
  - src/lib/data/seo-hierarchy.test.ts
  - src/lib/data/sitemap.ts
  - src/lib/data/sitemap.test.ts
  - src/lib/data/complex-detail.ts
  - src/types/database.ts
  - scripts/backfill-url-slugs.ts
  - tsconfig.json
  - public/naver-site-verification.txt
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 23의 핵심 목표(한글 계층 URL, 308 리다이렉트, BreadcrumbList JSON-LD, sitemap/RSS/robots)는 전반적으로 올바르게 구현됐다. 아키텍처 규칙 준수(서비스 레이어 분리, RLS 미적용 — 공개 데이터), TypeScript strict 대응, CLAUDE.md의 `cancel_date IS NULL AND superseded_by IS NULL` 필터 준수 모두 확인됐다.

그러나 **2개의 BLOCKER**가 존재한다:
1. `getSiPageData` (창원 gu 분기)와 `getGuPageData`의 `complexCount` 계산이 `avg_sale_per_pyeong` 보유 단지 수만 셈 — 항상 과소 표시됨
2. `complexes/[id]/page.tsx`의 308 리다이렉트가 비활성(inactive) 단지를 404로 보냄 — 기존에 정상 렌더되던 페이지가 깨지는 회귀

주요 WARNING 5건도 모두 프로덕션 실 영향권이므로 함께 수정을 권장한다.

---

## Critical Issues

### CR-01: `complexCount` 오계산 — avg_sale_per_pyeong 없는 단지 누락

**File:** `src/lib/data/seo-hierarchy.ts:69-75` (및 `132-134`)
**Issue:**
`getSiPageData`의 창원 gu 분기와 `getGuPageData`의 dong 분기 모두 `complexCount: prices.length`를 사용한다. `prices` 배열은 `avg_sale_per_pyeong`이 null이 아닌 단지만 추가하므로, 거래 데이터가 없어 avg 값이 null인 신규 단지나 매칭 실패 단지는 지도상에서 완전히 카운트에서 제외된다. UI의 "X개 단지" 표시가 틀린 숫자를 보여준다.

이와 반대로 같은 함수의 **김해 분기**는 `entry.count++`로 정확히 구현돼 있어 의도와 구현의 불일치가 명확하다.

```typescript
// 현재 (버그)
const byGu = new Map<string, number[]>()
for (const c of data) {
  if (!c.gu) continue
  const arr = byGu.get(c.gu) ?? []
  if (c.avg_sale_per_pyeong) arr.push(c.avg_sale_per_pyeong)
  byGu.set(c.gu, arr)         // arr.length = price 보유 단지 수만 셈
}
complexCount: prices.length   // 과소 계산
```

**Fix:** 김해 분기처럼 count를 별도로 유지한다.

```typescript
// getSiPageData 창원 분기 수정
const byGu = new Map<string, { count: number; prices: number[] }>()
for (const c of data) {
  if (!c.gu) continue
  const entry = byGu.get(c.gu) ?? { count: 0, prices: [] }
  entry.count++
  if (c.avg_sale_per_pyeong) entry.prices.push(c.avg_sale_per_pyeong)
  byGu.set(c.gu, entry)
}
return {
  si,
  guList: [...byGu.entries()].map(([gu, { count, prices }]) => ({
    gu,
    complexCount: count,      // 수정: 전체 단지 수
    avgPrice: prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null,
  })),
  ...
}
```

`getGuPageData`의 `dongList` (lines 120-136)도 동일하게 수정 필요:

```typescript
const byDong = new Map<string, { count: number; prices: number[] }>()
for (const c of data) {
  if (!c.dong) continue
  const entry = byDong.get(c.dong) ?? { count: 0, prices: [] }
  entry.count++
  if (c.avg_sale_per_pyeong) entry.prices.push(c.avg_sale_per_pyeong)
  byDong.set(c.dong, entry)
}
dongList: [...byDong.entries()].map(([dong, { count, prices }]) => ({
  dong,
  complexCount: count,
  ...
}))
```

테스트도 null avg_sale_per_pyeong 케이스를 추가해 회귀 방지 필요 (`seo-hierarchy.test.ts`).

---

### CR-02: 비활성(inactive) 단지 → 308 리다이렉트 → 404 회귀

**File:** `src/app/complexes/[id]/page.tsx:217-226`
**Issue:**
`getComplexById`는 `status` 필터가 없어 모든 단지를 반환한다. 이후 `complex.url_slug`가 있으면 무조건 308 리다이렉트한다. 그런데 `getComplexBySlug` (`src/lib/data/seo-hierarchy.ts:198`)는 `.eq('status', 'active')`를 적용해 비활성 단지는 `null`을 반환 → `notFound()` → **404**.

`status = 'in_redevelopment'` 등 비활성 단지는 Phase 23 이전에는 `/complexes/[id]`에서 정상 렌더됐다. backfill 스크립트(`scripts/backfill-url-slugs.ts:52-55`)는 status 필터 없이 실행되므로 비활성 단지에도 `url_slug`가 채워진다. 결과적으로 기존에 동작하던 페이지가 404로 깨지는 회귀다.

```typescript
// 현재 (버그)
if (complex.url_slug) {
  permanentRedirect('/' + complex.url_slug)
}

// 수정: active 단지만 slug URL로 리다이렉트
if (complex.url_slug && complex.status === 'active') {
  permanentRedirect('/' + complex.url_slug)
}
```

---

## Warnings

### WR-01: 계층 페이지 DB 쿼리 2회 중복 (GuPage/DongPage)

**File:** `src/app/[...slug]/page.tsx:1155-1174`
**Issue:**
`SlugPage` dispatch에서 `getGuPageData` 또는 `getDongPageData`를 한 번 호출해 존재 여부를 확인하고, 바로 `<GuPage>` / `<DongPage>`를 렌더한다. 그런데 이 컴포넌트들은 내부에서 동일한 함수를 **또 한 번** 호출한다. cache miss 시 동일 SQL이 2회 실행된다.

```
// 현재 흐름 (gu branch)
SlugPage:  getGuPageData(s0, s1, supabase)  // 1st call — 존재 확인
GuPage:    getGuPageData(si, gu, supabase)  // 2nd call — 데이터 사용
```

**Fix:** 가져온 데이터를 props로 전달한다.

```typescript
// SlugPage dispatch
if (guData) return <GuPage data={guData} si={s0} gu={s1} slug={slug} />

// GuPage — data prop 받아 fetch 제거
async function GuPage({
  data,
  si,
  gu,
  slug,
}: {
  data: GuPageData
  si: string
  gu: string
  slug: string[]
}) {
  // const supabase = createReadonlyClient()  ← 삭제
  // const data = await getGuPageData(...)    ← 삭제
  if (!data) notFound()
  ...
}
```

`DongPage` (dong-or-complex 분기)도 동일하게 수정. `SiPage`는 dispatch에서 미리 fetch하지 않으므로 해당 없음.

---

### WR-02: RSS 피드 가격 표시 오류 ("0억")

**File:** `src/app/feed.xml/route.ts:43-47`
**Issue:**
`priceOk = Math.floor((tx.price as number) / 10000)`는 가격을 억 단위로 내림 변환한다. `price`가 만원 단위이므로 9,000만원 거래는 `Math.floor(9000/10000) = 0`. RSS item title이 `"단지명 N평 0억 (날짜)"`가 된다. 또한 11,500만원(1.15억)도 `"1억"`으로 표시돼 부정확하다.

```typescript
// 현재 (버그)
const priceOk = Math.floor((tx.price as number) / 10000)
const title = `${c.canonical_name} ${areaPy}평 ${priceOk}억 (${tx.deal_date})`
```

**Fix:** 복합 단위 포맷 또는 소수점 표기 사용.

```typescript
function formatRssPrice(priceMan: number): string {
  const uk = Math.floor(priceMan / 10000)
  const man = priceMan % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString('ko-KR')}만`
  if (uk > 0) return `${uk}억`
  return `${priceMan.toLocaleString('ko-KR')}만`
}

const title = `${c.canonical_name} ${areaPy}평 ${formatRssPrice(tx.price as number)} (${tx.deal_date})`
```

---

### WR-03: `permanentRedirect`에 미인코딩 한글 URL 사용

**File:** `src/app/complexes/[id]/page.tsx:225`
**Issue:**
`permanentRedirect('/' + complex.url_slug)`는 HTTP `Location` 헤더에 한글 문자를 그대로 포함한다(예: `/창원시/성산구/내동/대우2차`). RFC 3986은 URI에 ASCII만 허용하며, 비 ASCII 문자는 퍼센트 인코딩이 필요하다. 대다수 현대 브라우저와 Naver Yeti는 이를 허용하지만 일부 HTTP 클라이언트나 CDN에서 오작동 가능성이 있다.

```typescript
// 현재
permanentRedirect('/' + complex.url_slug)

// 수정: encodeURI는 슬래시를 보존하면서 한글 인코딩
permanentRedirect('/' + complex.url_slug.split('/').map(encodeURIComponent).join('/'))
```

`src/lib/utils/url-slug.ts`의 `buildCanonicalUrl('')`을 재사용해도 된다:
```typescript
import { buildCanonicalUrl } from '@/lib/utils/url-slug'
// ...
permanentRedirect(buildCanonicalUrl('', complex.url_slug.split('/')))
```

---

### WR-04: `opengraph-image.tsx` 폰트 파일 누락 시 비보호 크래시

**File:** `src/app/[...slug]/opengraph-image.tsx:25-27`
**Issue:**
`readFileSync(join(process.cwd(), 'public/fonts/PretendardSubset.ttf'))`가 try/catch 없이 호출된다. 배포 환경에서 폰트 파일이 누락되거나 경로가 다를 경우 OG 이미지 핸들러 전체가 동기 예외로 크래시하고, Next.js가 500 응답을 반환한다. 기존 `complexes/[id]/opengraph-image.tsx`의 패턴을 그대로 복사하여 동일 문제가 전파됐다.

```typescript
// 수정
let fontData: Buffer
try {
  fontData = readFileSync(join(process.cwd(), 'public/fonts/PretendardSubset.ttf'))
} catch {
  // 폰트 없으면 시스템 폰트로 폴백 (빈 fonts 배열)
  return new ImageResponse(
    (<div style={{ width: '100%', height: '100%', display: 'flex', background: '#fff',
      alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
      {name}
    </div>),
    { ...size },
  )
}
```

---

### WR-05: `complexes/[id]/page.tsx` generateMetadata가 구 UUID URL을 canonical로 설정

**File:** `src/app/complexes/[id]/page.tsx:65-73`
**Issue:**
`generateMetadata`가 반환하는 `alternates: { canonical: '${SITE}/complexes/${id}' }`는 308 리다이렉트와 함께 응답된다. 308 응답에는 HTML body가 없으므로 실질적 SEO 영향은 없지만, `url_slug`가 있는 단지의 경우 새 slug URL을 canonical로 반환하는 것이 일관성 있다. 현재 상태에서 Googlebot/Yeti는 308을 따르므로 치명적이지 않다.

```typescript
// 수정: url_slug 있으면 slug URL을 canonical로 반환
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createReadonlyClient()
  const complex = await getComplexById(id, supabase)
  if (!complex) return { title: '단지를 찾을 수 없습니다' }

  const canonicalUrl = complex.url_slug && complex.status === 'active'
    ? buildCanonicalUrl(SITE, complex.url_slug.split('/'))
    : `${SITE}/complexes/${id}`

  // ...
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    // ...
  }
}
```

---

## Info

### IN-01: `encodeSlug` 함수 중복 정의

**File:** `src/app/feed.xml/route.ts:7-9`
**Issue:**
`encodeSlug`가 `src/lib/data/sitemap.ts`에 이미 export되어 있음에도 `route.ts`에 동일 구현이 인라인으로 재정의돼 있다. 변경 시 두 곳을 동시에 수정해야 한다.

**Fix:**
```typescript
// route.ts에서 import
import { encodeSlug } from '@/lib/data/sitemap'
// 인라인 정의 삭제
```

---

### IN-02: `classifySlug` 반환값 'gu'가 김해 dong 경로도 포함하는 의미 불일치

**File:** `src/lib/utils/url-slug.ts:26-31`
**Issue:**
`classifySlug`가 `slug.length === 2`일 때 `'gu'`를 반환하지만, 이 경로는 `/김해시/내동`처럼 구(gu)가 없는 시의 동(dong) 페이지일 수도 있다. dispatch 로직이 올바르게 처리하므로 런타임 버그는 아니나, 타입 이름이 의도를 오도한다.

**Fix (선택적):** 반환 타입을 `'depth2'` 또는 `'gu-or-dong'`으로 변경하거나, JSDoc으로 의미를 명시한다.

---

### IN-03: `seo-hierarchy.test.ts` — complexCount 버그 미검출

**File:** `src/lib/data/seo-hierarchy.test.ts:31-45`
**Issue:**
`getSiPageData` 창원 테스트의 mock rows가 모두 `avg_sale_per_pyeong` 비 null이라 CR-01 버그가 테스트를 통과한다. `avg_sale_per_pyeong: null`인 row를 추가해야 회귀 방지가 된다.

**Fix:**
```typescript
const rows = [
  { gu: '성산구', dong: '내동', avg_sale_per_pyeong: 1000 },
  { gu: '성산구', dong: '사파동', avg_sale_per_pyeong: 1100 },
  { gu: '성산구', dong: '무동', avg_sale_per_pyeong: null },  // 추가
  { gu: '의창구', dong: '팔용동', avg_sale_per_pyeong: 900 },
]
// 성산구 complexCount는 3 (not 2)이어야 함
expect(성산구?.avgPrice).toBe(1050)    // avgPrice는 1000+1100 기준이므로 그대로
const 성산구count = result!.guList.find(g => g.gu === '성산구')
expect(성산구count?.complexCount).toBe(3)  // 수정 후 기댓값
```

---

### IN-04: `backfill-url-slugs.ts` `--limit` 인자 NaN 미검증

**File:** `scripts/backfill-url-slugs.ts:30`
**Issue:**
`parseInt(limitArg.split('=')[1] ?? '10000', 10)`은 `--limit=abc` 입력 시 `NaN`을 반환한다. Supabase `.limit(NaN)` 동작이 정의되지 않아 쿼리 결과가 예측 불가능하다.

**Fix:**
```typescript
const parsedLimit = limitArg ? parseInt(limitArg.split('=')[1] ?? '', 10) : 10000
const LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10000
```

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
