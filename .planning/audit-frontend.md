# 단지온도 프론트엔드 코드 전수 심층 감사 보고서

> 감사 범위: `src/app/` 하위 전체 `.tsx` 파일 (라우트·레이아웃·에러·로딩·컴포넌트 포함)
> 감사 기준일: 2026-06-18
> Next.js 15 App Router · TypeScript strict · Supabase RLS

---

## 목차

1. [요약 점수표](#요약-점수표)
2. [🔴 Critical — 즉시 수정](#critical--즉시-수정)
3. [🟠 High — 출시 전 수정](#high--출시-전-수정)
4. [🟡 Medium — 출시 후 빠르게](#medium--출시-후-빠르게)
5. [🟢 Low / 고도화 제안](#low--고도화-제안)
6. [✅ 잘 된 것들](#-잘-된-것들)
7. [파일별 빠른 참조표](#파일별-빠른-참조표)

---

## 요약 점수표

| 등급 | 건수 |
|------|------|
| 🔴 Critical | 2 |
| 🟠 High | 9 |
| 🟡 Medium | 12 |
| 🟢 Low | 10 |
| ✅ 잘 된 것 | 14 |

---

## 🔴 Critical — 즉시 수정

### C-01 오픈 리다이렉트 취약점 — `consent/page.tsx`

**파일**: `src/app/consent/page.tsx:19`

```tsx
// 취약 코드 (현재)
const next = searchParams.next ?? '/'
redirect(next)   // ← next = "//evil.com" 이면 외부 사이트로 리다이렉트

redirect(`/login?next=${encodeURIComponent(`/consent?next=${next}`)}`)  // next 미검증 중첩
```

외부 공격자가 `?next=//evil.com` 또는 `?next=https://phishing.com` 을 포함한 링크를 사용자에게 전달하면 로그인 완료 후 외부 사이트로 리다이렉트됩니다.

**수정 방법**:
```tsx
const raw = searchParams.next ?? '/'
// 상대 경로만 허용 — 프로토콜·외부 도메인 차단
const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
```

이 패턴은 `[...slug]/page.tsx:239` 의 T-23-02-01 코멘트(url_slug는 DB 조회값만 사용)와 동일한 원칙이나 consent에는 아직 적용되지 않았음.

---

### C-02 "신고가" 배지 무조건 표시 — `complexes/[id]/page.tsx` (이전 `[...slug]/page.tsx`)

**파일**: `src/app/complexes/[id]/page.tsx:437-441`

```tsx
// 현재 코드 — 조건 없음
<span className="badge orange">
  <FireIcon />
  신고가
</span>
```

모든 단지 상세 페이지에서 "신고가" 배지가 무조건 표시됩니다. 실제 신고가 여부를 확인하는 로직이 없어 사용자를 오도합니다.

**수정 방법**: `rawSaleData`에서 가장 최근 거래의 가격이 해당 단지 역대 최고가인지 판별하는 로직 추가.
```tsx
// 최근 거래가 역대 최고가인지 확인
const allPrices = rawSaleData.map(t => t.price)
const maxPrice = Math.max(...allPrices)
const isNewHigh = rawSaleData.length > 3 && latestSale && Math.round(latestSale.avgPrice) >= maxPrice * 0.99
```
혹은 DB에 `is_new_high` 플래그 컬럼을 추가하는 것이 더 정확합니다 (rankings 피드에서는 이미 `tx.is_new_high`를 사용하고 있음 — `rankings/[date]/page.tsx:132`).

---

## 🟠 High — 출시 전 수정

### H-01 깨진 법적 링크 — `login/page.tsx`

**파일**: `src/app/login/page.tsx:36-38`

```tsx
<Link href="/terms">이용약관</Link>       // 404
<Link href="/privacy">개인정보처리방침</Link>  // 404
```

실제 법적 페이지 경로는 `/legal/terms`, `/legal/privacy`입니다. 회원가입 동의 화면의 법적 링크가 404이므로 규정 준수 문제가 됩니다.

**수정**: `/terms` → `/legal/terms`, `/privacy` → `/legal/privacy`

---

### H-02 즐겨찾기 페이지 분양 링크 dead — `favorites/page.tsx`

**파일**: `src/app/favorites/page.tsx:63`

```tsx
<Link href="#">분양</Link>   // dead link
```

실제 분양 페이지는 `/presale`입니다.

**수정**: `href="#"` → `href="/presale"`

---

### H-03 Error 컴포넌트 타입 불완전 — `[...slug]/error.tsx`

**파일**: `src/app/[...slug]/error.tsx:5`

```tsx
export default function SlugError({ reset }: { reset: () => void }) {
```

Next.js 13+ Error boundary 컴포넌트 시그니처는 `{ error: Error & { digest?: string }, reset: () => void }` 입니다. `error` prop이 없으면 에러 내용을 로깅·표시할 수 없고, Next.js가 내부적으로 prop을 전달할 때 TypeScript 타입 불일치가 발생합니다.

**수정**:
```tsx
export default function SlugError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // 개발 환경에서 에러 정보 표시 또는 로깅
```

---

### H-04 `getAdRoiStats` 에러 처리 누락 — `admin/ads/page.tsx`

**파일**: `src/app/admin/ads/page.tsx:57`

```tsx
const roiStats = await getAdRoiStats(adminClient)   // .catch() 없음
```

동일 파일의 `adsQuery`는 에러 처리가 있으나 `getAdRoiStats`는 없습니다. 이 함수가 실패하면 광고 관리 페이지 전체가 500 에러로 렌더링됩니다.

**수정**: `.catch(() => null)` 또는 try/catch 추가

---

### H-05 복수 어드민 페이지 중복 인증 — 불필요한 DB 쿼리

**파일**: 
- `src/app/admin/status/page.tsx:180-191`
- `src/app/admin/listing-prices/page.tsx:62-75`
- `src/app/admin/redevelopment/page.tsx:79-91`
- `src/app/admin/cardnews/page.tsx:14-26`
- `src/app/admin/gps-requests/page.tsx:9-21`
- `src/app/admin/presale-discoveries/page.tsx:15-32`

`src/app/admin/layout.tsx`가 이미 모든 `/admin/*` 경로에서 user + role을 검증합니다. 위 6개 페이지는 각자 동일한 auth 검증을 다시 수행하여 페이지 로드마다 2-3번의 불필요한 Supabase 쿼리가 실행됩니다.

또한 `admin/status/page.tsx:188`은 `createSupabaseServerClient` (RLS-bound)를 사용하여 auth 검증하는데, 이미 layout에서 admin client로 확인 후 페이지에 진입하므로 로직 불일치입니다.

**수정**: 각 어드민 페이지에서 auth 검증 블록 제거. layout의 보호로 충분.

---

### H-06 `decodeURIComponent` 직접 JSX 사용 — `admin/redevelopment/page.tsx`

**파일**: `src/app/admin/redevelopment/page.tsx:355`

```tsx
<p>{decodeURIComponent(formError)}</p>
```

`formError`가 `%` 뒤 잘못된 문자(예: `%ZZ`)를 포함하면 `decodeURIComponent`가 throw하여 서버 컴포넌트 렌더링이 실패합니다.

**수정**:
```tsx
const safeError = (() => { try { return decodeURIComponent(formError) } catch { return formError } })()
```

---

### H-07 이용약관 "초안" 문구 — `legal/terms/page.tsx`

**파일**: `src/app/legal/terms/page.tsx:56`

```tsx
<p>초안 — 법무 검토 전 / 시행일: 2026년 5월 6일</p>
```

실제 프로덕션 서비스에서 "법무 검토 전"이 법적 문서에 공개되고 있습니다. 시행일은 이미 지났으므로 이 경고 문구를 반드시 제거해야 합니다.

---

### H-08 `complexes/[id]/page.tsx` — 알림 버튼이 로그인 리다이렉트

**파일**: `src/app/complexes/[id]/page.tsx:409-416`

```tsx
<Link
  href={`/login?next=/complexes/${id}`}
  className="btn btn-md btn-orange"
>
  <BellIcon />알림 설정
</Link>
```

비로그인 사용자를 로그인으로 보내는 것은 좋지만, 이미 로그인한 사용자도 동일 버튼을 클릭하면 로그인 페이지로 이동합니다. 인증 상태에 따른 분기가 없습니다. (참고: 동일 패턴이 `[...slug]/page.tsx`의 BellIcon에도 존재)

---

### H-09 `reactivate/page.tsx` — `reactivateAccount as any` 타입 캐스트

**파일**: `src/app/reactivate/page.tsx:97`

```tsx
action={reactivateAccount as any}
```

Server Action을 `as any`로 캐스팅하면 타입 안전성이 없어집니다. `profile/page.tsx:287`의 `deleteAccount as any`도 동일 패턴. Server Action 타입을 `(formData: FormData) => Promise<void>` 형태로 명시적 타이핑 필요.

---

## 🟡 Medium — 출시 후 빠르게

### M-01 AI 컨텍스트 빌더 교육 데이터 하드코딩 — `complexes/[id]/page.tsx`

**파일**: `src/app/complexes/[id]/page.tsx:920-932` (및 `[...slug]/page.tsx:943`)

```tsx
buildComplexContext({
  ...
  facilityEdu: { schools: [], hagwons: [], daycares: [], kindergartens: [], hagwonStats: null, si: null },
  // ^ 항상 빈 배열 — FacilityEduSection이 스트리밍으로 렌더되지만 AI 컨텍스트엔 교육 데이터 없음
})
```

`FacilityEduSection`은 Suspense로 스트리밍되나, AI 채팅 패널(`AiChatPanel`)이 받는 컨텍스트에는 교육 시설 정보가 전혀 없습니다. AI가 "이 단지 주변 학교 알려줘"에 정확하게 답할 수 없습니다.

**수정 방안**: `FacilityEduSection` 로직을 페이지 레벨 Promise.all에 포함시켜 컨텍스트 빌더에 전달하거나, AI 채팅 시 별도 RPC로 교육 데이터 조회.

---

### M-02 `Suspense` fallback 누락 — UserMenu

**파일**: 
- `src/app/map/page.tsx:80`
- `src/app/rankings/page.tsx:192`
- `src/app/rankings/[date]/page.tsx:75`

```tsx
<Suspense><UserMenu /></Suspense>   // fallback 없음 → null 렌더 → CLS
```

fallback=null은 UserMenu가 로드되는 동안 헤더 우측이 비어 보여 레이아웃 시프트(CLS)가 발생합니다.

**수정**: `fallback={<div style={{ width: 80 }} />}` 또는 스켈레톤 플레이스홀더 추가.

---

### M-03 `74㎡` 탭 비활성 — `invest/region/[sggCode]/page.tsx`

**파일**: `src/app/invest/region/[sggCode]/page.tsx:64`

```tsx
{ label: '74㎡', value: '74' },
```

`ALLOWED_AREA_BUCKETS`에 `'74'` 값이 없으면 이 탭을 선택해도 `areaBucket = undefined`가 되어 "전체" 상태로 표시됩니다. 버튼은 있지만 동작하지 않는 것처럼 보입니다. 실제로 `ALLOWED_AREA_BUCKETS`를 확인하여 `'74'`가 포함됐는지 점검 필요.

---

### M-04 홈 BellIcon 버튼 non-functional

**파일**: `src/app/page.tsx` (approx line 174)

BellIcon을 포함한 버튼에 `onClick` 핸들러가 없습니다. 클릭해도 아무 일도 일어나지 않습니다.

**수정**: 알림 설정 페이지(`/profile`)로 링크하거나, 로그인 모달 트리거 추가.

---

### M-05 `supabase as any` 타입 캐스트 — 복수 어드민 페이지

**파일**:
- `src/app/rankings/page.tsx:36`
- `src/app/admin/ads/page.tsx` (복수)
- `src/app/admin/listing-prices/page.tsx:81-92`
- `src/app/admin/redevelopment/page.tsx:97, 104, 112`
- `src/app/admin/presale-discoveries/page.tsx:38`

여러 테이블(`listing_prices`, `presale_discoveries`, `redevelopment_projects`)이 생성된 DB 타입에 없어서 `as any`로 우회합니다. 타입 안전성 누락.

**수정**: `npm run db:types` (또는 `supabase gen types typescript`) 재실행하여 타입 갱신.

---

### M-06 `invest/page.tsx` — complexHref 미사용

**파일**: `src/app/invest/page.tsx:330`

```tsx
href={`/complexes/${row.complexId}`}   // hardcoded
// 다른 페이지는 complexHref(id, urlSlug) 사용
```

url_slug가 있는 단지의 경우 잘못된 URL로 링크됩니다 (`/complexes/123` 대신 `/창원-어반e편한세상-마산회원` 같은 슬러그 URL이어야 함).

**수정**: `complexHref(row.complexId, row.urlSlug)` 사용 (urlSlug를 쿼리에 포함해야 함).

---

### M-07 `admin/listing-prices/page.tsx` — Server Action 인라인 정의

**파일**: `src/app/admin/listing-prices/page.tsx`

Server Action이 page 파일 내부에 `'use server'` 지시어로 정의되어 있습니다. Next.js는 이를 지원하지만, 어드민 액션들은 `src/app/actions/admin/` 등으로 분리하여 재사용성 및 테스트 가능성을 높이는 것이 권장됩니다.

---

### M-08 `complexes/[id]/page.tsx` — 18개 병렬 DB 쿼리

**파일**: `src/app/complexes/[id]/page.tsx:244-320`

단일 페이지 로드에 18개의 병렬 Supabase 쿼리 + FacilityEduSection 스트리밍. 이는 Supabase 연결 풀(max 10-15)에 압박을 줄 수 있습니다. 특히 트래픽이 몰릴 때 connection timeout 위험.

**완화**: React.cache 활용 최대화, 자주 변하지 않는 데이터(facilityKapt, redevelopment)는 revalidate 주기를 늘려 ISR 캐시 활용.

---

### M-09 `admin/cardnews/page.tsx` — 중복 인증 + 신고가 로직 단순화

**파일**: `src/app/admin/cardnews/page.tsx:14-26`

위 H-05와 동일한 중복 auth 패턴. 추가로 line 55의 `price` 정렬이 "최고 거래가" 기준이지만 "신고가 TOP 5"로 표시합니다. 역대 신고가가 아닌 30일 내 가장 비싼 거래가 Top 5입니다 — 제목과 로직 불일치.

---

### M-10 `[...slug]/loading.tsx` — CSS 변수 불일치

**파일**: `src/app/[...slug]/loading.tsx:31`

```tsx
background: 'var(--bg-sec)'   // --bg-sec 존재 여부 불확실
```

다른 파일들은 `var(--bg-surface-2)`, `var(--bg-canvas)`를 사용하는데 이 파일만 `--bg-sec`를 참조합니다. CSS 변수가 정의되지 않았으면 shimmer 애니메이션이 단색으로 보입니다.

---

### M-11 `auth/hash/page.tsx` — `createBrowserClient` 직접 인스턴스화

**파일**: `src/app/auth/hash/page.tsx:13-15`

```tsx
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

아키텍처 규칙에 따르면 클라이언트 측 Supabase는 `src/lib/supabase/client.ts`의 싱글톤을 사용해야 합니다. 직접 인스턴스화는 실시간 구독과 세션 상태가 중복될 수 있습니다. 단, auth hash 처리 전용이라 실질적 문제는 없을 수도 있으나 일관성을 위해 수정 권장.

---

### M-12 법적 서류 `SUPPORT_EMAIL` 환경변수 fallback 불일치

**파일**: `src/app/legal/terms/page.tsx:8`

```tsx
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@danjiondo.com'
```

fallback 도메인이 `danjiondo.com`인데 실제 서비스 도메인은 `danjiondo.kr`입니다 (`.kr` vs `.com`). 환경변수 미설정 시 잘못된 이메일이 약관에 표시됩니다.

---

## 🟢 Low / 고도화 제안

### L-01 `gap-analysis/page.tsx` — formatPrice 함수 중복

**파일**: `src/app/gap-analysis/page.tsx:54-59`

로컬 `formatPrice` 함수가 `@/lib/format`에 이미 있는 함수와 동일합니다. `import { formatPrice } from '@/lib/format'`으로 교체하면 중복 제거됩니다.

---

### L-02 `complexes/[id]/page.tsx` — 아이콘-레이블 불일치

**파일**: `src/app/complexes/[id]/page.tsx:557-585`

단지 기본 정보 그리드에서:
- `<SchoolIcon />` → "준공연도" (학교 아이콘이 날짜 레이블에)
- `<BusIcon />` → "세대수"
- `<WonIcon />` → "최고층"
- `<BellIcon />` → "지역"

아이콘과 레이블 의미가 전혀 맞지 않습니다. 적절한 아이콘으로 교체 필요.

---

### L-03 `admin/members/page.tsx` — superadmin 역할 필터 누락

**파일**: `src/app/admin/members/page.tsx:143`

역할 필터 select에 `admin`/`member` 옵션만 있고 `superadmin`이 없습니다. superadmin 계정을 역할로 필터링할 수 없습니다.

---

### L-04 `compare/page.tsx` — 단일 단지 선택 시 빈 상태

**파일**: `src/app/compare/page.tsx`

`validIds.length === 1`일 때 `CompareTable`이 `complexes=[]`로 렌더됩니다. "단지 하나만 선택됨 — 비교하려면 하나 더 추가하세요" 같은 안내 UI가 없습니다.

---

### L-05 `profile/page.tsx` — vapidKey 빈 문자열 전달

**파일**: `src/app/profile/page.tsx:51`

```tsx
vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
```

VAPID 키가 설정되지 않은 경우 빈 문자열이 전달됩니다. `PushToggle` 컴포넌트가 빈 키를 gracefully 처리하는지 확인 필요. 미처리 시 푸시 구독 API 오류 발생.

---

### L-06 `[...slug]/page.tsx` — `generateMetadata`와 페이지 함수의 중복 `getComplexBySlugCached` 호출

두 함수 모두 동일 slug로 `getComplexBySlugCached`를 호출합니다. React.cache로 메모이제이션되어 있다면 중복 호출이 없지만, `createReadonlyClient()`를 매번 새로 생성하는 경우 캐시 키가 다를 수 있습니다.

---

### L-07 `admin/realtors/[id]/edit/page.tsx` — N회 병렬 paginated 쿼리

**파일**: `src/app/admin/realtors/[id]/edit/page.tsx:32-41`

복잡한 페이지네이션 병렬 쿼리로 모든 단지를 가져옵니다. 단지 수가 ~3,000개라면 3회 쿼리. 실시간 검색 가능한 드롭다운이나 서버사이드 검색으로 교체하면 더 효율적입니다.

---

### L-08 `rankings/page.tsx` — `supabase as any` 타입 캐스트

**파일**: `src/app/rankings/page.tsx:36`

`generateMetadata` 내 join 쿼리에서 타입 에러를 피하려고 `supabase as any` 사용. DB 타입 갱신 후 제거 가능.

---

### L-09 `complexes/[id]/page.tsx` — 비로그인 사용자 FavoriteButton/CompareAddButton

**파일**: `src/app/complexes/[id]/page.tsx:407-408`

`FavoriteButton`과 `CompareAddButton`이 서버 컴포넌트로 렌더되어 비로그인 사용자도 버튼을 볼 수 있습니다. 클릭 시 로그인으로 리다이렉트하는지, 아니면 클라이언트에서 처리하는지 확인 필요. 비로그인 사용자에게는 로그인 유도 메시지가 있어야 합니다.

---

### L-10 `ads/page.tsx` — 가격 정보 없는 패키지 카드

**파일**: `src/app/ads/page.tsx:11-15`

광고 패키지 카드에 "단가는 문의 후 개별 안내"라는 안내만 있고 가격이 전혀 없습니다. 광고주 전환율에 영향을 줄 수 있습니다. 최소한 시작 가격 또는 범위를 표시하는 것을 검토하세요.

---

## ✅ 잘 된 것들

### G-01 Next.js 15 async params/searchParams 전면 적용

감사 대상 모든 동적 라우트에서 `params`와 `searchParams`를 올바르게 `await` 처리합니다:
- `[...slug]/page.tsx`: `const { slug: rawSlug } = await params`
- `invest/region/[sggCode]/page.tsx`: `const { sggCode } = await params`
- `rankings/[date]/page.tsx`: `const { date } = await params`
- `complexes/[id]/page.tsx`: `const { id } = await params`

---

### G-02 입력 검증 일관성 — 허용 목록(allowlist) 패턴

`invest/page.tsx`, `invest/region/[sggCode]/page.tsx`, `admin/members/page.tsx` 등에서 URL 파라미터를 `Set` 기반 허용 목록으로 검증합니다:
```tsx
const ALLOWED_SORT = new Set(['price', 'deal_date'])
const sort = ALLOWED_SORT.has(rawSort) ? rawSort : 'deal_date'
```

---

### G-03 FacilityEduSection Suspense 스트리밍

`complexes/[id]/page.tsx:844-850`에서 N+1 RPC가 집약되는 교육 시설 섹션을 명시적 fallback UI와 함께 Suspense로 스트리밍합니다. 교육 데이터 로딩이 나머지 페이지를 블로킹하지 않습니다.

---

### G-04 SEO — Canonical URL + OpenGraph + JSON-LD

`complexes/[id]/page.tsx`에서 `url_slug` 기반 canonical URL 설정, OpenGraph 메타데이터, Schema.org `ApartmentComplex` JSON-LD를 완비합니다. T-23-02-01 주석으로 오픈 리다이렉트 방어도 문서화됩니다.

---

### G-05 ISR 전략이 페이지 특성에 맞게 설정

| 페이지 | revalidate | 이유 |
|---|---|---|
| `/` (홈) | 60s | 자주 갱신 |
| `[...slug]` | 3600s | 실거래가 변화 느림 |
| `/map` | 0 (force-dynamic) | 실시간 지도 |
| `/rankings` | 3600s | 일 1회 배치 |
| `complexes/[id]` | 86400s | K-apt 데이터 일 단위 |

---

### G-06 관리비 데이터 에러 처리 — `.catch()` fallback 패턴

`complexes/[id]/page.tsx`의 Promise.all 내 모든 쿼리에 `.catch()` fallback이 있습니다. 한 쿼리 실패가 전체 페이지를 깨뜨리지 않습니다.

---

### G-07 admin/layout.tsx 중앙 집중 인증 가드

`admin/layout.tsx`가 모든 `/admin/*` 경로에 대해 user + role 검증을 수행합니다. 개별 페이지의 중복 auth는 과잉이지만, 레이아웃 수준의 보호 자체는 올바른 설계입니다.

---

### G-08 rankings/[date]/page.tsx — date 파라미터 정규식 검증

```tsx
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()
```

URL 파라미터를 DB 쿼리에 사용하기 전에 형식 검증을 수행합니다. 좋은 보안 관행입니다.

---

### G-09 permanentRedirect — url_slug 기반 308 리다이렉트

`complexes/[id]/page.tsx:240-241`에서 `url_slug`가 있는 단지는 한글 슬러그 URL로 308 영구 리다이렉트합니다. SEO 관점에서 중복 URL을 피하고 크롤러 혼선을 방지합니다. T-23-02-01 코멘트로 오픈 리다이렉트 방어 이유도 문서화됩니다.

---

### G-10 Semantic HTML 사용

`complexes/[id]/page.tsx`, `ads/page.tsx`, `gps-requests/page.tsx` 등에서 `<main>`, `<header>`, `<article>`, `<section>`, `<nav>` 등 시맨틱 HTML 요소를 사용합니다.

---

### G-11 admin/realtors/page.tsx — searchParams 검증 + 에러 상태 UI

```tsx
const q = rawQ.trim().slice(0, 50)  // 길이 제한
const active = ALLOWED_ACTIVE.has(rawActive) ? rawActive : ''  // 허용 목록
```

에러 발생 시 크래시 없이 에러 메시지 카드를 표시합니다.

---

### G-12 `auth/hash/page.tsx` — 해시 토큰 검증 후 세션 설정

```tsx
if (!accessToken || !refreshToken) {
  router.replace('/login?error=auth')
  return
}
```

접근 토큰·리프레시 토큰 모두 검증 후 세션 설정합니다. 에러 시 안전한 fallback으로 리다이렉트합니다.

---

### G-13 generated `static params` — 30일 날짜 사전 생성

`rankings/[date]/page.tsx`의 `generateStaticParams`가 최근 30일 날짜를 사전 생성합니다. 자주 방문하는 날짜는 ISR 캐시에서 즉시 서빙됩니다.

---

### G-14 `complexes/[id]/page.tsx` — 로딩 스켈레톤 shimmer 애니메이션

`[...slug]/loading.tsx`에서 compositor 속성(`background-position`)만 사용하는 shimmer 애니메이션을 구현합니다. `width/height` 레이아웃 속성 애니메이션을 피하는 UI 규칙을 준수합니다.

---

## 파일별 빠른 참조표

| 파일 | 이슈 | 등급 |
|------|------|------|
| `consent/page.tsx:19` | 오픈 리다이렉트 | 🔴 C-01 |
| `complexes/[id]/page.tsx:437` | 무조건 신고가 배지 | 🔴 C-02 |
| `login/page.tsx:36-38` | `/terms`, `/privacy` 404 링크 | 🟠 H-01 |
| `favorites/page.tsx:63` | `href="#"` dead link (분양) | 🟠 H-02 |
| `[...slug]/error.tsx:5` | error prop 누락 | 🟠 H-03 |
| `admin/ads/page.tsx:57` | getAdRoiStats .catch() 누락 | 🟠 H-04 |
| `admin/*/page.tsx` (6개) | 중복 auth 검증 | 🟠 H-05 |
| `admin/redevelopment/page.tsx:355` | decodeURIComponent throw 위험 | 🟠 H-06 |
| `legal/terms/page.tsx:56` | "초안 — 법무 검토 전" 프로덕션 노출 | 🟠 H-07 |
| `complexes/[id]/page.tsx:409` | 로그인 사용자도 로그인 리다이렉트 | 🟠 H-08 |
| `reactivate/page.tsx:97` | Server Action `as any` 캐스트 | 🟠 H-09 |
| `complexes/[id]/page.tsx:920` | AI 컨텍스트 교육 데이터 항상 빈 배열 | 🟡 M-01 |
| `map/page.tsx:80`, `rankings/page.tsx:192` | Suspense fallback 누락 → CLS | 🟡 M-02 |
| `invest/region/[sggCode]/page.tsx:64` | 74㎡ 탭 비활성 가능성 | 🟡 M-03 |
| `page.tsx` (홈) | BellIcon 버튼 non-functional | 🟡 M-04 |
| 복수 admin 페이지 | `supabase as any` / DB 타입 누락 | 🟡 M-05 |
| `invest/page.tsx:330` | complexHref 미사용 → url_slug 무시 | 🟡 M-06 |
| `admin/listing-prices/page.tsx` | Server Action 인라인 정의 | 🟡 M-07 |
| `complexes/[id]/page.tsx:244` | 18개 병렬 DB 쿼리 | 🟡 M-08 |
| `admin/cardnews/page.tsx:55` | "신고가 TOP 5" vs "최고가 TOP 5" 불일치 | 🟡 M-09 |
| `[...slug]/loading.tsx:31` | CSS 변수 `--bg-sec` 불일치 | 🟡 M-10 |
| `auth/hash/page.tsx:13` | createBrowserClient 직접 인스턴스화 | 🟡 M-11 |
| `legal/terms/page.tsx:8` | SUPPORT_EMAIL fallback 도메인 .com vs .kr | 🟡 M-12 |
| `gap-analysis/page.tsx:54` | formatPrice 함수 중복 | 🟢 L-01 |
| `complexes/[id]/page.tsx:557` | 아이콘-레이블 의미 불일치 | 🟢 L-02 |
| `admin/members/page.tsx:143` | superadmin 역할 필터 누락 | 🟢 L-03 |
| `compare/page.tsx` | 단일 단지 선택 빈 상태 미처리 | 🟢 L-04 |
| `profile/page.tsx:51` | vapidKey 빈 문자열 처리 | 🟢 L-05 |
| `[...slug]/page.tsx` | generateMetadata 중복 getComplexBySlugCached | 🟢 L-06 |
| `admin/realtors/[id]/edit/page.tsx` | N회 paginated 쿼리로 모든 단지 로드 | 🟢 L-07 |
| `rankings/page.tsx:36` | generateMetadata supabase as any | 🟢 L-08 |
| `complexes/[id]/page.tsx:407` | 비로그인 FavoriteButton CTA 불명확 | 🟢 L-09 |
| `ads/page.tsx` | 광고 패키지 가격 미표시 | 🟢 L-10 |

---

*보고서 생성: 2026-06-18, 감사자: Claude Sonnet 4.6*
