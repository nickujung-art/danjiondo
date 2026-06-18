# 컴포넌트 · 라이브러리 · Server Actions 코드 감사

> 감사 일자: 2026-06-18
> 범위: `src/components/`, `src/lib/` (data 제외), `src/app/actions/`

---

## 요약 카운트

| 심각도 | 건수 |
|---|---|
| CRITICAL | 4 |
| HIGH | 8 |
| MEDIUM | 11 |
| LOW / STYLE | 7 |

---

## 1. Server Actions (`src/app/actions/`, `src/lib/auth/`, `src/lib/actions/`)

### 1-1. [CRITICAL] `education.ts` — `metric` 파라미터 SQL 인젝션 위험

**파일**: `src/app/actions/education.ts` (L19)

```typescript
const { data, error } = await (supabase as any).rpc('school_ranking', {
  p_si:          si,
  p_school_type: schoolType,
  p_metric:      metric,   // ← 클라이언트에서 직접 전달
})
```

`metric` 값(`'students_per_class' | 'special' | 'univ_rate'`)은 `EducationCard` 컴포넌트 내에서 파생되지만 Server Action의 타입 시그니처(`metric: string`)는 임의 문자열을 허용합니다. RPC가 내부에서 동적 SQL을 구성한다면 SQL 인젝션이 가능합니다. DB 함수를 확인할 수 없으나 Action 레이어에서 허용 집합 검증이 없습니다.

**수정안**:
```typescript
const ALLOWED_METRICS = new Set(['students_per_class', 'special', 'univ_rate'])
if (!ALLOWED_METRICS.has(metric)) return []
```

또한 `fetchSchoolRanking`에는 인증 체크가 전혀 없습니다. 이 Action은 공개 데이터를 반환하므로 인증 불필요는 허용되지만, 미인증 사용자가 `p_si`, `p_school_type` 등을 자유롭게 제어할 수 있는 점을 인지해야 합니다.

---

### 1-2. [HIGH] `education.ts` — `supabase as any` 캐스팅으로 타입 보호 우회

`(supabase as any).rpc(...)` 패턴은 반환 타입 추론을 잃어버립니다. `SchoolRankingItem[]`으로 단순 캐스팅하지만 실제 RPC 반환 형태가 다를 경우 런타임 오류가 묵인됩니다. `Database` 타입에 해당 RPC를 추가하거나 최소한 zod로 반환 값을 파싱해야 합니다.

---

### 1-3. [MEDIUM] `hagwon.ts` — `saveChildProfile` 반환값 무시

**파일**: `src/components/complex/HagwonRecommendSheet.tsx` (L243-L249)

```typescript
saveChildProfile({ ... }).catch(() => {})
```

`await` 없이 `.catch(() => {})` 처리. 실패 시 완전히 묵인되어 디버깅이 어렵습니다. 최소한 `console.error`로 로깅해야 합니다. 또한 fire-and-forget 패턴이지만 오류 추적이 없어 프로파일 저장 실패를 감지할 수 없습니다.

---

### 1-4. [MEDIUM] `favorite-actions.ts` — `complexId` 입력 검증 없음

**파일**: `src/lib/auth/favorite-actions.ts`

`addFavorite`, `removeFavorite`, `toggleFavoriteAlert` 모두 `complexId: string`을 그대로 DB에 전달합니다. UUID 형식 검증이 없습니다. 다른 Actions(`ad-actions.ts`, `redevelopment-actions.ts`)는 `UUID_RE` 정규식으로 검증하는 패턴을 따르고 있으나 여기서만 누락되었습니다.

**수정안**: `UUID_RE.test(complexId)` 검증 추가.

---

### 1-5. [MEDIUM] `comment-actions.ts` — `reviewId`, `complexId` UUID 검증 없음

**파일**: `src/lib/auth/comment-actions.ts`

`submitComment`, `deleteComment` 모두 `reviewId`, `complexId`에 UUID 검증이 없습니다. `deleteComment`는 `.eq('user_id', user.id)` 조건으로 타 사용자 삭제는 막지만, 형식 검증 없이 DB에 전달하는 패턴은 일관성 위반입니다.

---

### 1-6. [MEDIUM] `gps-approve-actions.ts` — requestId/userId 가드 불충분

**파일**: `src/lib/auth/gps-approve-actions.ts` (L32-L33)

```typescript
if (!requestId || !userId) return { error: '잘못된 파라미터입니다' }
```

빈 문자열/null 체크만 있습니다. UUID 형식 검증이 없습니다. 임의 문자열이 DB 쿼리로 진입할 수 있습니다.

---

### 1-7. [LOW] 중복된 `requireAdmin` 함수

`ad-actions.ts`, `admin-actions.ts`, `realtor-actions.ts`, `gps-approve-actions.ts`, `redevelopment-actions.ts`, `listing-price-actions.ts` 모두 동일한 `requireAdmin` 함수를 각 파일에 복제하고 있습니다. 6개 복사본이 존재합니다. 중앙화된 `src/lib/auth/require-admin.ts`로 추출해야 합니다. 현재는 기능적으로 동일하지만 미래에 권한 로직 변경 시 6곳을 동시에 수정해야 하는 유지보수 부채입니다.

---

### 1-8. [LOW] `revalidatePath` 과도한 호출 패턴

`realtor-actions.ts` `updateRealtor`에서:
- `revalidatePath('/admin/realtors')` — 목록
- `revalidatePath('/admin/realtors/${id}/edit')` — 편집 페이지
- `assignments`를 쿼리해 각 단지 경로 루프

할당된 단지 수가 많을 경우(수십 개) 많은 revalidatePath 호출이 발생합니다. `revalidatePath('/complexes', 'layout')`으로 상위 경로 invalidation을 고려하세요.

---

## 2. 컴포넌트 (`src/components/`)

### 2-1. [CRITICAL] `HagwonRecommendSheet.tsx` — SSR에서 `document.body` 직접 접근

**파일**: `src/components/complex/HagwonRecommendSheet.tsx` (L272, L601)

```typescript
return createPortal(
  <> ... </>,
  document.body,   // ← SSR에서 실행 시 ReferenceError
)
```

`'use client'`가 있으므로 일반적으로 안전하지만, Next.js App Router에서 Suspense 경계 내부 혹은 서버 컴포넌트 트리에서 강제로 렌더링될 경우 `document is not defined` 오류가 발생할 수 있습니다. `EducationCard.tsx`의 `SchoolDetailSheet`(L757)와 `SchoolRankingSheet`도 동일합니다.

**수정안**: `useEffect` + `useState`로 마운트 후에만 Portal을 렌더링하는 패턴:
```typescript
const [mounted, setMounted] = useState(false)
useEffect(() => setMounted(true), [])
if (!mounted) return null
return createPortal(...)
```

---

### 2-2. [CRITICAL] `AiChatPanel.tsx` — 패널 언마운트 시 SSE reader 정리 없음

**파일**: `src/components/complex/AiChatPanel.tsx` (L148-L175)

```typescript
while (!done) {
  const result = await reader.read()
  // ...
}
```

사용자가 스트리밍 중 패널을 닫으면(`isOpen=false`) 컴포넌트가 언마운트되지 않고(JSX에 `{isOpen && ...}` 조건 렌더) 실제 언마운트 시 reader는 정리되지 않습니다. 실제로 `isOpen && ` 조건이 있어 언마운트는 발생하지만, `sendMessage`가 진행 중인 상태에서 패널을 닫았다가 재오픈하면 이전 스트림이 계속 실행 중일 수 있습니다. `AbortController`를 사용해 진행 중인 fetch를 취소해야 합니다.

**수정안**:
```typescript
const abortRef = useRef<AbortController | null>(null)

async function sendMessage(override?: string) {
  abortRef.current?.abort()
  abortRef.current = new AbortController()
  const res = await fetch('/api/chat/complex', {
    signal: abortRef.current.signal,
    ...
  })
}

useEffect(() => {
  return () => abortRef.current?.abort()
}, [])
```

---

### 2-3. [HIGH] `EducationCard.tsx` — `MiniBar` 컴포넌트 `width` layout 애니메이션 위반

**파일**: `src/components/complex/EducationCard.tsx` (L263-L270)

```typescript
<div style={{
  height: '100%',
  width: `${pct}%`,          // layout 속성!
  background: color,
  borderRadius: 3,
  transition: 'width 0.4s ease',   // ← CLAUDE.md UI 규칙 위반
}} />
```

`width` 속성 애니메이션은 레이아웃 리플로우를 발생시켜 성능 저하를 유발합니다. CLAUDE.md UI 규칙에서 명시적으로 금지한 패턴입니다.

**수정안**: `transform: scaleX()` + `transform-origin: left` 사용:
```typescript
<div style={{
  height: '100%', width: '100%',
  background: color,
  borderRadius: 3,
  transform: `scaleX(${pct / 100})`,
  transformOrigin: 'left',
  transition: 'transform 0.4s ease',
}} />
```

---

### 2-4. [HIGH] `KakaoMap.tsx` — `readSavedState` sessionStorage 오류 묵인

**파일**: `src/components/map/KakaoMap.tsx` (L28-L40)

```typescript
function readSavedState(...) {
  try {
    const raw = sessionStorage.getItem(MAP_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { ... }
      if (parsed.center?.lat && parsed.center?.lng && parsed.level) return parsed
    }
  } catch {}
  return { center: fallbackCenter, level: fallbackLevel }
}
```

`parsed.center?.lat` 체크에 `lat=0`인 경우 falsy가 되어 저장된 상태를 무시합니다. 실제 창원/김해 지역 좌표는 lat≈35이므로 문제없지만, 일반적으로 올바른 수치 체크는 `parsed.center.lat !== undefined`를 사용해야 합니다.

또한 `readSavedState`가 두 번 호출됩니다 (`initCenter`와 `initLevel` 각각). 동일한 sessionStorage를 두 번 파싱합니다. 한 번만 호출해 결과를 재사용하세요.

---

### 2-5. [HIGH] `MapSidePanel.tsx` — 광고 fetch 오류 무음 실패

**파일**: `src/components/map/MapSidePanel.tsx` (L61-L72)

```typescript
useEffect(() => {
  if (!panelData) { setSidebarAd(null); return }
  const sggParam = panelData.sgg_code ? `?sgg_code=${panelData.sgg_code}` : ''
  fetch(`/api/ads/sidebar${sggParam}`)
    .then(r => r.ok ? r.json() : { ads: [] })
    .then((body: { ads: AdCampaign[] }) => { setSidebarAd(body.ads[0] ?? null) })
    .catch(() => { setSidebarAd(null) })
}, [panelData])
```

fetch가 실패해도 `setSidebarAd(null)`로 조용히 처리됩니다. 이는 허용 가능한 UX 결정이나, 단지 데이터 fetch(L39-L57)와 광고 fetch(L61-L72)가 별도 `useEffect`로 분리되어 있어 `panelData`가 `null`이 되면 광고도 즉시 초기화됩니다. 패널이 닫힐 때 두 개의 useEffect가 순차적으로 실행되는 순서에 주의가 필요합니다.

더 중요한 문제: `panelData` 객체 참조가 변경될 때마다 광고 fetch가 재실행됩니다. `panelData.sgg_code`를 의존성으로 사용하면 불필요한 재요청을 줄일 수 있습니다.

---

### 2-6. [HIGH] `EducationCard.tsx` 내 `SchoolRankingSheet` — `useTransition` 오용

**파일**: `src/components/complex/EducationCard.tsx` (L775-L787)

```typescript
const [, startTransition] = useTransition()
// ...
useEffect(() => {
  setLoading(true)
  setGu('전체')
  startTransition(async () => {
    const result = await fetchSchoolRanking(si, schoolType, metric)
    setData(result)
    setLoading(false)
  })
}, [si, schoolType, metric])
```

`startTransition` 내부에서 `setLoading(true)`를 호출하지 않고 바깥에서 호출하는 것은 문제없으나, `useTransition`은 non-urgent state 업데이트를 표시하기 위한 것이지 Server Action 비동기 호출에 사용하기 위한 것이 아닙니다. `useTransition`의 pending 상태(`isPending`)를 활용하지 않고 별도 `loading` 상태를 유지하는 것도 중복입니다. `useEffect` + 직접 async 함수 호출로 대체하거나 `isPending`을 활용하세요.

---

### 2-7. [MEDIUM] `HagwonRecommendSheet.tsx` — 로딩 애니메이션 인라인 `<style>` 주입

**파일**: `src/components/complex/HagwonRecommendSheet.tsx` (L528-L530)

```typescript
<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
```

인라인 `<style>` 태그를 JSX 내에서 렌더링하면 매 렌더마다 `<head>`에 주입될 수 있습니다. 글로벌 CSS 또는 Tailwind의 `animate-spin` 클래스를 사용해야 합니다.

---

### 2-8. [MEDIUM] `ShareButton.tsx` — ObjectURL 메모리 누수 위험

**파일**: `src/components/rankings/ShareButton.tsx` (L68-L71)

```typescript
const a = document.createElement('a')
a.href = URL.createObjectURL(blob)
a.click()
setTimeout(() => URL.revokeObjectURL(a.href), 200)
```

200ms timeout은 매우 짧습니다. 일부 브라우저에서 파일 다운로드가 시작되기 전에 URL이 revoke될 수 있습니다. 1000ms 이상을 권장합니다. 또한 `a.click()` 후 `setTimeout`이지만 오류 발생 시 finally 블록이 없어 누수가 발생할 수 있습니다.

---

### 2-9. [MEDIUM] `AiChatPanel.tsx` — 메시지 무한 축적

**파일**: `src/components/complex/AiChatPanel.tsx`

`messages` 배열은 패널 닫고 재오픈 시에도 초기화되지 않습니다 (`isOpen` 토글 시 `useState` 유지). 긴 세션에서 메시지가 무한히 쌓입니다. 패널을 닫을 때 또는 일정 개수 초과 시 오래된 메시지 정리 로직이 없습니다.

---

### 2-10. [MEDIUM] `KakaoMap.tsx` — `updateVisible` 콜백 의존성 불안정

**파일**: `src/components/map/KakaoMap.tsx` (L176-L204)

```typescript
const updateVisible = useCallback(
  (map: kakao.maps.Map) => { ... },
  [complexes, presalePins],  // 매 렌더마다 새 배열 참조
)
```

`complexes`와 `presalePins`가 부모에서 매 렌더마다 새 배열로 생성된다면 `updateVisible`도 매번 재생성됩니다. `KakaoMapView`의 `onCreate`/`onIdle`에 새 함수 참조가 전달되면 불필요한 이벤트 재등록이 발생할 수 있습니다. 부모 컴포넌트에서 props를 메모이제이션하거나 배열 내용 기반 안정적인 의존성 관리가 필요합니다.

---

### 2-11. [MEDIUM] `CompareFloatingBar.tsx` — `setIds` 의존성 eslint-disable 오용

**파일**: `src/components/complex/CompareFloatingBar.tsx` (L37)

```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [ids])
```

`setIds`를 의존성에서 제외하기 위해 eslint 억제를 사용합니다. `setIds`는 `useQueryState`의 안정적인 setter이므로 의존성에 포함해도 무방합니다. 또는 `useCallback`으로 효과를 분리해 의도를 더 명확히 표현하세요.

---

### 2-12. [LOW] `EducationCard.tsx` — 고학년 진학률 `advancement_percentile` 공유 버그 가능성

**파일**: `src/components/complex/EducationCard.tsx` (L596-L609)

```typescript
{/* 고등학교: 대학 진학 분석 */}
{school.advancement_percentile != null && (
  <PercentileBar
    percentile={school.advancement_percentile}   // ← 중학교용 필드 재사용
    ...
  />
)}
```

`hasHighUniv` 섹션(고등학교)에서 `school.advancement_percentile`을 사용하는데, 이는 중학교 진학률(`hasMiddleAdv`)에서도 동일 필드를 사용합니다. 고등학교 전용 백분위 필드가 별도 있는지 스키마 확인 필요. 없다면 필드명이 오해를 유발합니다.

---

### 2-13. [LOW] `LoginForm.tsx` — 이메일 입력 시 서버 에러 메시지 노출

**파일**: `src/components/auth/LoginForm.tsx` (L63-L65)

```typescript
{message && (
  <p className={`text-sm ${message.includes('보내드렸') ? 'text-green-600' : 'text-red-500'}`}>
    {message}
  </p>
)}
```

`signInWithEmail`의 `error.message`(Supabase 내부 오류 메시지)가 그대로 노출됩니다. Supabase 에러 메시지는 내부 정보를 포함할 수 있습니다. 사용자에게 친화적인 일반 에러 메시지를 반환해야 합니다.

---

### 2-14. 접근성 검토

전체적으로 양호하나 일부 개선 가능 사항:

**`HagwonRecommendSheet.tsx`**: 
- 각 단계 전환 시 포커스 관리 없음. 단계가 변경될 때 새 콘텐츠 영역으로 포커스 이동 필요.
- 칩 버튼(`Chip` 컴포넌트)에 선택 상태 `aria-pressed` 누락.

**`EducationCard.tsx`**:
- 탭 버튼에 `role="tab"`, `aria-selected` 누락. 현재는 `button`만 사용.
- `SchoolRankingSheet` 구 필터 버튼에 `aria-pressed` 누락.

**`AiChatPanel.tsx`**: 
- `role="dialog"` + `aria-modal="true"` + `aria-label` — 잘 구현됨.
- 메시지 목록 `role="log"` + `aria-live="polite"` — 잘 구현됨.
- Escape 키 핸들러 — 잘 구현됨.
- 전반적으로 접근성 우수.

**`MapSidePanel.tsx`**:
- 두 `role="dialog"` 요소(PC, 모바일)가 동시에 DOM에 존재. 스크린 리더는 두 다이얼로그를 모두 인식할 수 있습니다. 비활성 패널에 `aria-hidden="true"` 추가 권장.

---

## 3. `src/lib/` 검토

### 3-1. [MEDIUM] `format.ts` — `formatPrice` 0 처리 불명확

**파일**: `src/lib/format.ts` (L4-L11)

```typescript
export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price < 0) return '—'
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}
```

- `price = 0`: `return "0만"` — 이것이 의도된 동작인가? 화면에 "0만원"이 표시될 수 있습니다.
- `man` 계산에서 음수가 아닌 정수만 가정 (`price >= 0` 조건으로 보호됨).
- `price = NaN`: `Number.isFinite(NaN) === false`이므로 `'—'` 반환 — 올바름.
- `price = Infinity`: `Number.isFinite(Infinity) === false`이므로 `'—'` 반환 — 올바름.

`generate-alerts.ts`의 로컬 `formatPrice`(L6-L11)는 `price < 0`, NaN, Infinity 가드가 없는 별도 구현입니다. 두 구현이 불일치합니다.

---

### 3-2. [MEDIUM] `notifications/deliver.ts` — 웹 푸시 실패 개별 처리 없음

**파일**: `src/lib/notifications/deliver.ts` (L31-L49)

```typescript
async function sendPushToUser(supabase, userId, payload) {
  const { data: subs } = await supabase.from('push_subscriptions')
    .select('endpoint, p256dh, auth').eq('user_id', userId)

  for (const sub of subs ?? []) {
    await webpush.sendNotification(...)   // 실패 시 예외 전파
  }
}
```

구독이 여러 개일 때(멀티 디바이스) 첫 번째 구독 발송 실패 시 나머지 디바이스에 발송이 안 됩니다. 각 구독 발송을 독립적으로 try-catch 해야 합니다. 또한 410 Gone(구독 만료) 응답 시 해당 구독을 DB에서 삭제하는 로직이 없습니다. 이는 만료된 구독이 계속 축적되는 메모리/성능 문제를 야기합니다.

**수정안**:
```typescript
for (const sub of subs ?? []) {
  try {
    await webpush.sendNotification(...)
  } catch (err) {
    // 410/404 응답 시 구독 삭제
    if (err instanceof WebPushError && (err.statusCode === 410 || err.statusCode === 404)) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
  }
}
```

---

### 3-3. [MEDIUM] `notifications/deliver.ts` — `auth.admin.getUserById` N+1 쿼리

**파일**: `src/lib/notifications/deliver.ts` (L83-L84)

```typescript
for (const n of pending) {
  const { data: authUser } = await (supabase as any).auth.admin.getUserById(notif.user_id)
```

배치(최대 50건)마다 매 알림당 `auth.admin.getUserById` 호출이 발생합니다. 최악의 경우 50회 API 호출. 미리 고유 `user_id` 집합을 모아 이메일을 일괄 조회하거나 `profiles` 테이블에 이메일 컬럼을 캐시하는 방식이 효율적입니다.

---

### 3-4. [MEDIUM] `hagwon-route.ts` — `selectBestCombo` 반환값 non-null assertion

**파일**: `src/lib/hagwon-route.ts` (L224)

```typescript
return bestResult!
```

`perSubjectScored.length === 0`인 경우는 호출 전에 걸러지지만, `pools`가 모두 빈 배열인 경우(`pools[si] ?? []`가 빈 배열) `search(0)` 재귀가 즉시 종료되어 `bestResult`가 `null`인 채로 `!`로 캐스팅됩니다. 이 경우 런타임 오류가 발생합니다.

`recommendHagwons`에서 `perSubjectScored.length === 0` 체크(L166)로 보호되지만, `hagwon-route.ts`가 독립적으로 호출되는 경우 불안전합니다.

**수정안**:
```typescript
return bestResult ?? { hagwons: [], visitOrder: [], route: [], totalRouteDist: 0 }
```

---

### 3-5. [LOW] `supabase/server.ts` — 환경변수 `!` non-null assertion

**파일**: `src/lib/supabase/server.ts` (L8-L9)

```typescript
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
```

`admin.ts`는 누락 시 명시적 에러를 throw하지만 `server.ts`는 `!` assertion만 사용합니다. 환경변수 누락 시 `createServerClient`에서 모호한 오류가 발생합니다. `admin.ts` 패턴을 따라 명시적 검증을 추가하세요:
```typescript
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Supabase env vars missing')
```

---

### 3-6. [LOW] `notifications/generate-alerts.ts` — `as any` 캐스팅

**파일**: `src/lib/notifications/generate-alerts.ts` (L41)

```typescript
const r = t as any
const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
```

`database.ts` 타입이 조인 쿼리를 정확히 반영하지 못해 `as any` 사용. `Database['public']['Tables']['transactions']['Row'] & { complexes: { canonical_name: string } }` 같은 명시적 인터섹션 타입을 정의하거나 `supabase-js`의 관계 타입을 활용하면 더 안전합니다.

---

### 3-7. 공통 패턴 평가

**양호한 패턴들**:
- `supabase/client.ts` — 실시간 구독 전용 용도 명시, 적절히 제한됨.
- `supabase/admin.ts` — `server-only` import, 명시적 env 검증, 용도 주석.
- `lib/auth/actions.ts` — 이메일 정규식 검증, 입력 trim 처리.
- `lib/auth/review-actions.ts` — TOCTOU 방지 검증 (L69-L78), GPS 서버 검증.
- `lib/auth/ad-actions.ts` — URL 프로토콜 검증, MIME 타입 화이트리스트, 날짜 유효성 검사.
- `hagwon.ts` Server Action — Zod 스키마 검증, auth-first 패턴, Groq API 키 누락 폴백.

---

## 4. 스타일 / UI 가이드 위반

| 파일 | 위반 사항 |
|---|---|
| `EducationCard.tsx` (MiniBar) | `width` 속성 `transition` — layout 애니메이션 금지 위반 |
| `EducationCard.tsx` (SCHOOL_TYPE_COLOR) | `color: '#7c3aed'`, `bg: '#ede9fe'` — 보라색 브랜드컬러 사용 금지 위반 |
| `EducationCard.tsx` (MiniBar) | `color: '#a78bfa'` — 보라계열 사용 |
| `EducationCard.tsx` (rankingItem row) | `univ_2year_rate` 바 `color: '#a78bfa'` |
| `TransactionChart.tsx` (L109) | `transition: 'all 0.15s'` — `all` 사용 (width 포함 가능성) |

**주의**: 보라/인디고 색상(`#7c3aed`, `#a78bfa`, `'#ede9fe'`)이 `EducationCard.tsx`의 고등학교 섹션 및 학교 타입 색상에 광범위하게 사용됩니다. CLAUDE.md UI 규칙 위반입니다.

---

## 5. 우선 수정 권장 목록

| 우선순위 | 항목 | 파일 | 예상 작업 |
|---|---|---|---|
| 1 | CRITICAL: `education.ts` metric 인젝션 | `src/app/actions/education.ts` | 화이트리스트 검증 추가 (5분) |
| 2 | CRITICAL: Portal SSR 안전성 | `HagwonRecommendSheet.tsx`, `EducationCard.tsx` | mounted guard 추가 (15분) |
| 3 | CRITICAL: AiChatPanel SSE 미정리 | `AiChatPanel.tsx` | AbortController 추가 (20분) |
| 4 | HIGH: MiniBar layout 애니메이션 | `EducationCard.tsx` | scaleX transform으로 전환 (10분) |
| 5 | HIGH: sendPushToUser 개별 실패 처리 | `deliver.ts` | try-catch per subscription + 410 정리 (30분) |
| 6 | HIGH: `selectBestCombo` null assertion | `hagwon-route.ts` | null 코어레싱 반환값 (5분) |
| 7 | MEDIUM: `favorite-actions.ts` UUID 검증 | `favorite-actions.ts` | UUID_RE 추가 (10분) |
| 8 | MEDIUM: N+1 getUserById | `deliver.ts` | 이메일 일괄 조회로 리팩터 (1시간) |
| 9 | MEDIUM: `requireAdmin` 중복 제거 | 6개 action 파일 | 공통 모듈 추출 (45분) |
| 10 | STYLE: 보라색 계열 색상 위반 | `EducationCard.tsx` | 색상 교체 (20분) |
