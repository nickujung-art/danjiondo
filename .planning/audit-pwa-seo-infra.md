# PWA · SEO · 성능 · 배포 인프라 심층 감사

> 감사 일자: 2026-06-18  
> 감사 대상: 단지온도 (danjiondo) — Next.js 15 App Router

---

## 1. PWA 검토

### 1-1. Service Worker 캐싱 전략 (Serwist)

**현황**

`src/app/sw.ts`에서 Serwist 9.x를 사용하며 설정은 다음과 같다.

```ts
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})
```

`defaultCache`는 `@serwist/next/worker`가 제공하는 기본 캐싱 전략이며, `next.config.ts`에서 `swSrc: 'src/app/sw.ts'`, `swDest: 'public/sw.js'`로 구성되어 있다. 개발 환경에서는 SW 비활성화(`disable: process.env.NODE_ENV === 'development'`).

**문제점**

- `defaultCache`는 이미지/폰트/정적 자산에 대한 범용 캐싱 전략을 적용하지만, 단지 상세 API (`/api/complexes/[id]/*`) 또는 지도 데이터에 대한 **커스텀 NetworkFirst/StaleWhileRevalidate 전략이 없다.** 실거래가 데이터처럼 자주 변경되는 API 응답이 캐시에 고착될 위험이 있다.
- `skipWaiting: true` + `clientsClaim: true` 조합은 새 SW 배포 즉시 구 탭까지 제어권을 가져가므로, 사용자가 페이지를 보는 도중 갑작스럽게 캐시가 교체될 수 있다. 사용자 경험상 문제는 거의 없지만, 무한 로딩이 발생하는 엣지 케이스가 있다.
- `public/sw.js`가 이미 빌드된 상태로 저장소에 커밋되어 있다 (`public/sw.js`, `public/sw.js.map` 존재). 이 파일은 빌드 시 덮어쓰이므로 저장소에 포함할 필요가 없다. 불필요한 repo 오염이다.

**권장사항**

- API 응답에 대한 명시적 캐싱 전략 추가:
  ```ts
  runtimeCaching: [
    ...defaultCache,
    {
      matcher: /\/api\/complexes\//,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-complexes', networkTimeoutSeconds: 5 },
    },
  ]
  ```
- `public/sw.js`와 `public/sw.js.map`을 `.gitignore`에 추가.

---

### 1-2. manifest.webmanifest 완성도

**현황**

`public/manifest.webmanifest`의 현재 내용:

```json
{
  "name": "단지온도",
  "short_name": "단지온도",
  "theme_color": "#ea580c",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "/",
  "start_url": "/",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

layout.tsx에서 `manifest: '/manifest.webmanifest'`로 참조된다.

**치명적 문제점 — 아이콘 파일이 없음**

`public/icons/` 디렉토리에는 `README.md`만 존재하며 **`icon-192.png`와 `icon-512.png` 파일이 실제로 없다.** Lighthouse PWA 심사, Chrome의 "홈 화면에 추가" 프롬프트, 모바일 브라우저 아이콘 표시가 모두 실패한다. 이는 **PWA 설치 불가** 상태다.

**추가 문제점**

- `purpose: "any maskable"`을 아이콘 하나에 동시 지정하는 것은 구형 브라우저에서 의도치 않은 결과를 낼 수 있다. `any`와 `maskable`을 두 개의 별도 엔트리로 분리하는 것이 권장된다.
- Apple Touch Icon (`apple-touch-icon`) 및 `apple-mobile-web-app-*` 메타 태그가 없다. iOS Safari는 manifest를 완전히 무시하고 이 메타 태그를 기준으로 아이콘을 결정한다.
- `screenshots` 필드 없음 (Android의 설치 UI 개선에 활용 가능, optional이지만 권장).
- `lang` 필드 없음 (`"lang": "ko-KR"` 추가 권장).

**권장사항**

1. 최우선: `icon-192.png`, `icon-512.png` 실제 파일 생성 후 `public/icons/`에 배치.
2. `purpose` 분리:
   ```json
   { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
   { "src": "/icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" }
   ```
3. layout.tsx에 Apple 메타 태그 추가:
   ```tsx
   <link rel="apple-touch-icon" href="/icons/icon-192.png" />
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-status-bar-style" content="default" />
   ```

---

### 1-3. 오프라인 폴백 페이지

**현황**

오프라인 전용 폴백 페이지(`/offline.html` 또는 앱 라우터의 오프라인 route)가 없다. SW의 `defaultCache`는 네트워크 실패 시 캐시 히트를 시도하지만, 미캐시 경로에 대한 fallback 응답이 없다.

**문제점**

사용자가 오프라인 상태에서 처음 방문하는 단지 페이지에 접근하면 브라우저 기본 오류 화면이 표시된다.

**권장사항**

`src/app/sw.ts`에 네비게이션 폴백 추가:
```ts
const serwist = new Serwist({
  ...
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.mode === 'navigate' }],
  },
})
```
그리고 `src/app/offline/page.tsx`를 정적 페이지로 작성.

---

### 1-4. 웹 푸시 구현

**현황**

- `web-push` 패키지 사용, VAPID 키는 환경변수(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)로 관리.
- `api/worker/notify/route.ts`에서 푸시 발송 로직 구현.
- GitHub Actions `notify-worker.yml`에서 5분마다 실행, `timeout-minutes: 4`로 과중첩 방지.
- `cron-auth.ts`의 `verifyCronSecret`으로 인증.

**문제점**

- `.env.local.example`에 VAPID 키 값이 비어 있다. MEMORY.md에도 "VAPID 미설정" 경고가 있다. **실제 웹 푸시가 동작하지 않을 가능성이 있다.**
- `notify-worker.yml`에서 인증 헤더가 `x-cron-secret`이지만, `weekly-digest.yml`과 `cafe-code-weekly.yml`에서는 `Authorization: Bearer`로 **헤더 방식이 혼재**되어 있다. `verifyCronSecret` 함수가 두 형식을 모두 처리하는지 확인이 필요하다.

**권장사항**

- VAPID 키를 생성하고 Vercel 환경변수에 설정.
- `verifyCronSecret` 구현을 확인하여 `x-cron-secret`과 `Authorization: Bearer` 양쪽을 처리하거나, 하나로 통일.

---

## 2. SEO 검토

### 2-1. 페이지별 Metadata 완성도

**현황**

| 페이지 | title | description | OG | canonical | 평가 |
|---|---|---|---|---|---|
| `/` (홈) | ✅ | ✅ | ✅ | ✅ | 양호 |
| `/map` | 없음 (layout 기본값) | 없음 | 없음 | 없음 | 미흡 |
| `/invest` | ✅ | ✅ | 없음 | 없음 | 부분 |
| `/presale` | ✅ | ✅ | 없음 | 없음 | 부분 |
| `/rankings` | ✅ (동적 생성) | ✅ | ✅ | ✅ | 양호 |
| `/complexes/[id]` | ✅ | ✅ | ✅ | ✅ | 양호 |
| `[...slug]` | ✅ (동적) | ✅ | ✅ | ✅ | 양호 |

**문제점**

- `/map` 페이지에 `metadata` export가 없다. 지도 검색은 핵심 기능임에도 구글·네이버 검색 결과에서 "단지온도 지도"라는 설명이 전혀 표시되지 않는다. (단, `<h1 className="sr-only">`로 숨겨진 h1은 있음.)
- `/invest`, `/presale` 페이지에 OG 태그와 canonical이 없다. SNS 공유 시 제목·이미지 없이 URL만 표시된다.
- Twitter Card 메타 태그가 전체 사이트에 없다. X(트위터)에서 공유 시 미리보기가 생성되지 않는다.
- 글로벌 layout의 metadata가 `keywords`를 포함하지만 (4개 키워드), 각 페이지에서 더 구체적인 키워드를 override하지 않아 모든 페이지가 동일한 키워드를 가진다.

**권장사항**

```tsx
// src/app/map/page.tsx 상단에 추가
export const metadata: Metadata = {
  title: '아파트 지도 검색 — 창원·김해 | 단지온도',
  description: '창원·김해 아파트 평당가를 지도에서 확인하세요. 단지별 실거래가를 지도 핀으로 한눈에.',
  alternates: { canonical: `${SITE}/map` },
}
```

글로벌 layout.tsx에 Twitter Card 추가:
```tsx
twitter: {
  card: 'summary_large_image',
  site: '@danjiondo',
}
```

---

### 2-2. JSON-LD 구조화 데이터

**현황**

- `/complexes/[id]/page.tsx`: `ApartmentComplex` 스키마 구현 (name, address, geo, yearBuilt, numberOfRooms). 정적 `<script type="application/ld+json">`으로 삽입.
- `/[...slug]/page.tsx`: 동일 JSON-LD 구현 있음.
- 홈, 지도, 랭킹 등 다른 페이지: JSON-LD 없음.

**문제점**

- `numberOfRooms` 필드에 `household_count`(세대수)를 사용하고 있다. Schema.org의 `numberOfRooms`는 방의 개수를 의미하므로 의미론적으로 올바르지 않다. 세대수에는 커스텀 프로퍼티를 쓰거나 생략하는 것이 낫다.
- `ApartmentComplex` 타입에 `url` 필드가 `/complexes/${id}` (UUID URL)로 고정되어 있는데, slug URL이 있는 단지에서는 slug URL을 사용해야 한다. (canonical과 불일치 발생 가능)
- 홈페이지에 `WebSite` + `SearchAction` 스키마가 없다. 구글 검색 결과에서 사이트링크 검색창을 활성화할 수 있다.
- RSS 피드가 있음에도 `RSSChannel` 또는 `DataFeed` 스키마 없음.

**권장사항**

홈 페이지에 SearchAction 스키마 추가:
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "url": "https://danjiondo.kr",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://danjiondo.kr/?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

복합 상세 JSON-LD의 `url` 필드를 canonical URL과 일치하도록 수정.

---

### 2-3. sitemap.xml 생성 로직

**현황**

`src/app/sitemap.ts`의 로직:
- `revalidate = 86400` (24시간 ISR)
- 정적 라우트 4개 포함 (`/`, `/map`, `/invest`, `/presale`)
- 시·구·동 계층 URL 생성
- 단지 URL: `url_slug` 있으면 slug URL, 없으면 UUID URL (`/complexes/[id]`)
- 우선순위: 홈 1.0, 지도 0.9, 단지 0.8

**문제점**

- `/rankings` 페이지가 정적 라우트에서 **누락**되어 있다. SEO 가치가 높은 페이지다.
- `lastModified: new Date()` — 모든 정적 라우트의 lastModified가 sitemap 생성 시점의 현재 시각이다. 실제로 콘텐츠가 바뀌지 않아도 항상 "오늘 수정됨"으로 표시되어 크롤러가 불필요하게 재방문한다. 정적 페이지는 고정 날짜 또는 실제 배포일을 사용해야 한다.
- 단지 URL에서 UUID URL 143개가 포함된다. 이 URL들은 유지는 되지만, 리다이렉트 없이 UUID URL을 sitemap에 그대로 노출하면 크롤러가 canonical을 혼동할 수 있다. (현재 코드 내 주석 "D-09"로 알고 있는 사항)
- 사이트맵이 단일 파일이다. 단지 수가 수천 개를 초과하면 Google의 50,000 URL 한도에 걸린다. 현재는 문제없지만 확장 시 sitemapIndex 분리를 고려해야 한다.

**권장사항**

```ts
// 정적 라우트에 rankings 추가
{ url: `${SITE}/rankings`, lastModified: new Date('2025-01-01'), changeFrequency: 'daily', priority: 0.8 },
```

정적 페이지의 `lastModified`를 하드코딩된 날짜 또는 `process.env.NEXT_PUBLIC_DEPLOY_DATE`로 대체.

---

### 2-4. robots.txt 적절성

**현황**

```
User-agent: *
Allow: /
Disallow: /admin/, /api/

User-agent: Yeti
Allow: /
```

**문제점**

- `/auth/`, `/profile/`, `/favorites/` 같은 개인 데이터 경로가 Disallow에 포함되지 않았다. 미들웨어에서 리다이렉트하므로 실제 콘텐츠가 노출될 일은 없지만, 크롤러가 불필요하게 방문할 수 있다.
- `/gap-analysis/` (308 리다이렉트 경로)가 Disallow에 없다. 불필요한 크롤링이 발생할 수 있다.
- `Sitemap:` 디렉티브는 현재 Next.js `robots()` 함수의 `sitemap` 속성으로 자동 추가되므로 양호.

**권장사항**

```ts
disallow: ['/admin/', '/api/', '/auth/', '/profile/', '/favorites/', '/gap-analysis/'],
```

---

### 2-5. 캐노니컬 URL

**현황**

- 홈 (`/`): canonical 있음.
- 단지 상세 (`/complexes/[id]`): slug URL로 308 영구 리다이렉트 + canonical 있음.
- `[...slug]`: canonical 있음.
- 지도, 투자, 분양 등: canonical 없음.

**문제점**

- `/map?q=창원` 등 쿼리파라미터가 붙은 URL에 canonical이 없다. `/map`으로 canonical을 지정하지 않으면 크롤러가 검색 결과 URL을 별개 페이지로 인식할 수 있다.
- `/complexes/[id]` 페이지에서 JSON-LD의 `url`이 UUID URL(`/complexes/${id}`)인데 canonical은 slug URL이다. 불일치.

---

### 2-6. Core Web Vitals 영향 요소

**LCP (Largest Contentful Paint)**

- 홈 페이지 `revalidate = 60`은 적절하나, 아파트 랭킹·분양 데이터를 한 번에 `Promise.all`로 10개 이상 쿼리한다. 서버 응답이 느릴 경우 LCP 지연 요인이 된다.
- 단지 상세 페이지에서 메인 콘텐츠(가격 숫자)는 서버에서 렌더링되므로 LCP에 유리하다.
- `next/image`를 거의 사용하지 않는다 (전체 소스에서 1개 파일만 import). 이미지가 있는 광고 배너나 프로필 사진이 `<img>` 태그로 렌더링되고 있을 가능성이 있다. 실제 확인은 필요하지만 `<img>` 태그 자체는 0개로 확인되어 현재는 문제없다.

**CLS (Cumulative Layout Shift)**

- 폰트가 `display: 'swap'`으로 로드되어 FOUT(Flash of Unstyled Text)가 발생할 수 있으나, 로컬 폰트이므로 실제 CLS는 미미하다.
- Recharts 차트는 클라이언트에서만 렌더링되므로, 서버에서 차지하는 영역과 클라이언트에서 렌더링된 후 영역 크기가 다를 경우 CLS가 발생한다. 차트 컨테이너에 고정 높이를 지정해야 한다.
- `SidebarAdsSection`이 클라이언트 fetch로 광고를 가져오는 구조이므로, 광고 로드 전후 레이아웃 변화가 발생할 수 있다.

**INP (Interaction to Next Paint) / 이전 FID**

- `recharts` 차트 렌더링이 메인 스레드에서 실행되므로, 단지 상세 페이지의 인터랙션 응답성이 낮을 수 있다. `dynamic(() => import('./Chart'), { ssr: false })`로 코드 스플리팅 권장.

---

## 3. 성능 검토

### 3-1. ISR revalidate 시간 평가

| 페이지 | revalidate | 평가 |
|---|---|---|
| `/` (홈) | 60초 | 적절 (실거래가 자주 변함) |
| `/map` | `0` (force-dynamic) | 주의 — 지도 핀 데이터가 매 요청마다 DB 쿼리됨. 핀 데이터는 일배치로 갱신되므로 3600초(1시간)로 충분 |
| `/invest` | 3600초 | 적절 |
| `/presale` | `force-dynamic` | 주의 — 분양 공고는 일배치로 갱신되므로 3600초로 충분. force-dynamic은 Vercel Serverless Function 호출을 유발해 비용 및 TTFB 증가 |
| `/rankings` | 3600초 | 적절 |
| `/complexes/[id]` | 86400초 (24시간) | 너무 김 — 실거래가가 수집된 당일 페이지에 반영되지 않음. 3600초(1시간) 권장 |
| `[...slug]` | 3600초 | 적절 |
| `/sitemap.xml` | 86400초 | 적절 |
| OG Image | 86400초 | 적절 |

**핵심 문제**

- `/map`과 `/presale`의 `force-dynamic`·`revalidate=0`은 Vercel Hobby 플랜에서 Cold Start를 유발하고 ISR 캐시의 이점을 버리는 것이다. 변경 주기가 하루에 한 번인 데이터에 대해 매 요청마다 DB를 조회하는 것은 낭비다.
- `/complexes/[id]`의 24시간 ISR은 오늘 신고된 실거래가가 내일까지 반영되지 않을 수 있다.

---

### 3-2. 이미지 최적화

**현황**

- `next/image`를 `src/components/admin/AdCreateForm.tsx` 한 곳에서만 import한다.
- 소스 전체에서 `<img>` 태그는 0건으로 확인된다.
- OG 이미지는 `next/og`의 `ImageResponse`로 동적 생성하며 TTF 폰트를 사용한다.

**평가**

현재 사용자 대면 이미지가 거의 없는 텍스트 중심 사이트이므로, `next/image` 미사용이 당장 문제를 일으키지는 않는다. 다만 향후 광고 배너 이미지, 공인중개사 프로필 이미지가 추가될 때 `next/image`로 구현하는 것을 원칙으로 삼아야 한다.

---

### 3-3. 폰트 로딩 전략

**현황**

`layout.tsx`에서 `localFont`를 사용하며 `display: 'swap'`, `weight: '100 900'` (variable font)으로 설정되어 있다. WOFF2 파일은 `postinstall` 스크립트(`scripts/copy-fonts.mjs`)로 복사된다.

**OG 이미지 폰트**

`opengraph-image.tsx`에서는 Satori가 WOFF2를 지원하지 않아 별도의 `PretendardSubset.ttf`를 사용한다. `readFileSync`로 동기적으로 파일을 읽으며, `runtime = 'nodejs'`를 지정한다.

**문제점**

- `PretendardSubset.ttf`가 `public/fonts/`에 존재하는지 확인이 필요하다. 빌드 시 이 파일이 없으면 OG 이미지 생성이 실패한다.
- Variable font WOFF2는 번들 크기가 크다 (보통 2~4MB). 서브셋 WOFF2를 별도로 제공하면 초기 다운로드를 줄일 수 있다.

---

### 3-4. 번들 크기 및 Lazy Loading

**현황**

주요 의존성:
- `recharts` ^3.8.1 — 차트 라이브러리 (gzip ~150KB)
- `react-kakao-maps-sdk` ^1.2.1 — 카카오 지도 SDK
- `supercluster` ^8.0.1 — 클러스터링
- `html2canvas` ^1.4.1 — 이미지 공유
- `@anthropic-ai/sdk`, `@google/generative-ai` — AI SDK (서버 전용이어야 함)

**문제점**

- `recharts` 가 단지 상세 페이지에서 동기 import되고 있을 가능성이 크다. 차트 컴포넌트를 `dynamic(() => import(...), { ssr: false })`로 lazy load해야 초기 JS 번들을 줄일 수 있다.
- `@anthropic-ai/sdk`, `@google/generative-ai`는 서버에서만 사용해야 하지만, 클라이언트 번들에 포함되지 않도록 `server-only` 패키지가 적용된 모듈에서만 import하는지 확인이 필요하다.
- `html2canvas`는 공유 기능에서만 사용되므로 lazy import로 전환해야 한다.
- `next.config.ts`에 `images.domains`, `experimental`, `webpack` 등 커스텀 설정이 없다. 번들 분석(`ANALYZE=true`)을 실행해 실제 번들 구성을 파악한 적이 없을 가능성이 높다.

---

### 3-5. `cache: 'force-cache'` vs `revalidate` 전략

Supabase 쿼리가 `createReadonlyClient()`를 통해 직접 실행되고 있어, Next.js의 `fetch` 캐싱이 아닌 Supabase 클라이언트 직접 호출 방식이다. 이 경우 Next.js의 Data Cache가 적용되지 않는다.

`React.cache()`를 일부 함수(`getComplexByIdCached`)에 적용하여 단일 요청 내 중복 호출을 제거하고 있다. 이는 올바른 접근이다.

그러나 `/complexes/[id]` 페이지에서 18개 `Promise.all` 쿼리 중 `React.cache`가 적용된 것은 `getComplexByIdCached`와 `getComplexBySlugCached` 정도뿐이다. 나머지 쿼리는 ISR revalidate 경계에서만 캐시되며, 동일 빌드 내 다른 페이지에서 같은 데이터를 요청해도 재사용되지 않는다.

---

### 3-6. 미들웨어 성능

**현황**

`src/middleware.ts`:
- `/profile`, `/favorites`, `/admin` 경로만 auth 체크 수행
- 공개 경로는 Supabase 왕복 없이 즉시 통과
- matcher에서 `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, `sw.js`, `fonts` 제외

**평가**

미들웨어는 최소화 전략이 잘 구현되어 있다. 보호 경로에서만 Supabase auth를 호출하므로 성능상 문제가 없다.

**경미한 문제**

- matcher 패턴에 `icon-*.png` 또는 `img/` 경로가 제외되지 않았다. 이미지 파일 요청에도 미들웨어가 실행되지만, `isProtected` 조건이 빠르게 false를 반환하므로 실질적 영향은 없다.
- `sw.js`는 matcher에서 제외되었으나, 만약 SW가 `/push-subscription` 같은 API를 호출할 때 헤더에 쿠키가 없으면 auth 체크에서 무조건 redirect될 수 있다. 확인 필요.

---

## 4. 배포 인프라 검토

### 4-1. GitHub Actions 워크플로우 오류 가능성

**CI 워크플로우 (`ci.yml`)**

- lint, build, unit-test, e2e 4단계로 구성. e2e는 build에 의존(`needs: [build]`).
- 문제점: `actions/checkout@v5`, `actions/setup-node@v5`를 사용하는데 일부 워크플로우(`molit-daily.yml`, `compute-predictions.yml` 등)는 `@v4`를 사용한다. 버전 불일치가 있다. 동작에 영향은 없지만 일관성이 없다.
- `unit-test` 단계에 환경변수가 없다. Supabase URL 없이 Vitest가 실행된다. 테스트 코드가 환경변수를 mock하거나 필요 없는 형태라면 문제없지만, 그렇지 않다면 환경변수 부재로 테스트가 실패할 수 있다.
- e2e 테스트에서 `npm run build`를 두 번 실행한다 (build job에서 한 번, e2e job에서 한 번). 빌드 결과를 artifact로 공유하면 중복 빌드를 피할 수 있다.

**`monthly-ai-commentary.yml`**

- `node-version: '20'`으로 설정되어 있다. 다른 모든 워크플로우는 Node.js 22를 사용한다. 불일치.
- AI 코멘트는 GEMINI_API_KEY를 사용하는데, MEMORY.md에 "GROQ 키 재발급 필요" 경고가 있다. Groq 키가 만료되면 이 배치가 실패한다.

**`rankings-cron.yml`**

- 매 시간 정각 실행(`0 * * * *`). GitHub Actions free tier에서 매시간 실행은 월 720회로 한도에 근접한다. 이미 GitHub Actions를 많이 사용하는 경우 throttling이 발생할 수 있다.

---

### 4-2. Vercel Cron 설정

**현황** (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 19 * * *" },
    { "path": "/api/cron/cafe-articles", "schedule": "30 19 * * *" }
  ]
}
```

- `0 19 * * *` = UTC 19:00 = KST 04:00 (적절)
- `30 19 * * *` = UTC 19:30 = KST 04:30 (daily 이후 30분 간격으로 실행, 적절)

**문제점**

- Vercel Hobby 플랜은 Cron이 하루 1회로 제한된다. 따라서 `cafe-articles`가 실행될 수 있는지 확인 필요. 두 크론이 등록되어 있으나 Hobby 플랜에서 두 번째 크론이 실행되지 않을 수 있다.
- CLAUDE.md에도 "Vercel Hobby 1일 1회 한도 때문에" GitHub Actions 활용을 명시하고 있다. 즉, `cafe-articles` Vercel Cron은 실질적으로 실행되지 않을 가능성이 높다. `cafe-ingest.yml` GitHub Actions와 역할이 중복된다.
- `/api/cron/daily`에 `runtime = 'nodejs'`가 명시되어 있으나, Vercel Hobby 플랜의 서버리스 함수 실행 한도(10초)를 `/api/cron/daily` 라우트가 초과할 수 있다. 이 라우트는 K-apt API, MOLIT API, 청약홈 API를 순차 호출하며 상당히 오래 걸린다. Pro 플랜이거나 Streaming/Edge 설정이 필요할 수 있다.

---

### 4-3. 환경변수 누락 위험

**.env.local.example vs CI 비교**

| 변수 | CI (build job) | CI (e2e) | 비고 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | ✅ | ✅ | |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ | 없음 | e2e에서 누락 |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ | ✅ | |
| `NEXT_PUBLIC_SITE_URL` | ✅ | localhost:3000으로 override | |
| `SUPABASE_SERVICE_ROLE_KEY` | 없음 | ✅ | build에서 누락 |

CI build 단계에 `SUPABASE_SERVICE_ROLE_KEY`가 없다. 빌드 중 이 키를 사용하는 코드가 있으면 빌드가 실패한다.

**위험한 누락**

- `RESEND_API_KEY` — 이메일 OTP가 동작하지 않음.
- `VAPID_PRIVATE_KEY` — 웹 푸시가 동작하지 않음. (MEMORY.md 확인됨)
- `BACKUP_PAT` — DB 백업 실패 시 데이터 유실 위험.
- `SOLAPI_*` — SMS 발송 불가 (solapi 패키지 의존성 있음).
- `RATE_LIMIT_SECRET` / Upstash — Rate Limiting 미동작 시 API 남용 위험.

---

### 4-4. 빌드 실패 시나리오

**시나리오 1: OG 이미지 폰트 파일 누락**

`opengraph-image.tsx`에서 `readFileSync('public/fonts/PretendardSubset.ttf')`를 동기 호출한다. 이 파일이 없으면 빌드 시 오류가 아닌 런타임에서 404/500이 발생하며 디버깅이 어렵다.

**시나리오 2: PWA 아이콘 없음**

`public/icons/icon-192.png`, `icon-512.png`가 없다. 빌드는 성공하지만 Lighthouse PWA 심사 실패 및 PWA 설치 불가.

**시나리오 3: Sentry 설정 불완전**

`withSentryConfig`에서 `org`, `project`가 `process.env.SENTRY_ORG`, `process.env.SENTRY_PROJECT`를 참조한다. 이 값들이 `undefined`이면 Sentry 플러그인이 경고를 출력하지만 빌드를 막지 않는다. 다만 소스맵 업로드가 실패하여 Sentry에서 원인 추적이 불가능해진다.

**시나리오 4: CSP 누락 도메인**

`Content-Security-Policy`에서 `connect-src`에 `*.posthog.com`이 포함되어 있으나, 향후 새 외부 서비스 추가 시 CSP 업데이트를 빠뜨리면 브라우저에서 요청이 차단된다.

---

## 5. 종합 우선순위

### 즉시 조치 (버그/기능 파손)

| # | 문제 | 파일 | 심각도 |
|---|---|---|---|
| P1 | PWA 아이콘 파일 없음 (`icon-192.png`, `icon-512.png`) | `public/icons/` | 치명적 |
| P2 | VAPID 키 미설정 — 웹 푸시 불가 | Vercel 환경변수 | 높음 |
| P3 | `/complexes/[id]` JSON-LD의 `url`이 UUID URL — canonical과 불일치 | `src/app/complexes/[id]/page.tsx:363` | 높음 |

### 단기 개선 (SEO 손실)

| # | 문제 | 파일 | 우선도 |
|---|---|---|---|
| S1 | `/map` 페이지 metadata 없음 | `src/app/map/page.tsx` | 높음 |
| S2 | Twitter Card 메타 태그 전체 누락 | `src/app/layout.tsx` | 중간 |
| S3 | `/invest`, `/presale` OG/canonical 없음 | 각 page.tsx | 중간 |
| S4 | sitemap에 `/rankings` 누락 | `src/app/sitemap.ts` | 중간 |
| S5 | 홈에 `WebSite` + `SearchAction` JSON-LD 없음 | `src/app/page.tsx` | 중간 |
| S6 | sitemap `lastModified: new Date()` — 매일 변경으로 과잉 크롤링 | `src/app/sitemap.ts` | 낮음 |

### 성능 개선

| # | 문제 | 파일 | 우선도 |
|---|---|---|---|
| Perf1 | `/map` `revalidate=0` → 3600으로 변경 | `src/app/map/page.tsx:14` | 높음 |
| Perf2 | `/presale` `force-dynamic` → 3600으로 변경 | `src/app/presale/page.tsx:16` | 높음 |
| Perf3 | `/complexes/[id]` revalidate 86400 → 3600 | `src/app/complexes/[id]/page.tsx:47` | 중간 |
| Perf4 | 오프라인 폴백 페이지 추가 | `src/app/offline/page.tsx` (신규) | 중간 |
| Perf5 | `public/sw.js` `.gitignore` 추가 | `.gitignore` | 낮음 |

### 인프라 안정성

| # | 문제 | 심각도 |
|---|---|---|
| I1 | `monthly-ai-commentary.yml` Node 20 → 22 통일 | 낮음 |
| I2 | CI workflow actions 버전 (`@v4`/`@v5`) 통일 | 낮음 |
| I3 | Vercel Hobby Cron 1일 1회 한도 — `cafe-articles` cron 실질적 비활성 가능성 확인 | 중간 |
| I4 | `verifyCronSecret` 인증 헤더 혼재 (`x-cron-secret` vs `Authorization: Bearer`) 통일 | 중간 |
