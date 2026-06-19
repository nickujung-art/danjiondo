# 네이버 부동산 스크래핑 가이드

> 참고 레포지토리: https://github.com/HarimxChoi/anti_bot_scraper (MIT License, Harim Choi)
> 우리 프로젝트 적용 파일: `scripts/map-naver-search.ts`, `scripts/crawl-naver-realtrade.ts`, `src/services/naver-land.ts`

---

## 1. Anti-Bot 우회 핵심 기법

### 1.1 navigator.webdriver 숨기기 (필수)

```typescript
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})
```

네이버는 `navigator.webdriver === true`를 감지해서 봇으로 판단. 반드시 페이지 로드 전(initScript)에 설정해야 함.

### 1.2 headless 모드 (중요)

```typescript
// 권장: headless=false (단지 상세 페이지 접근 시 필수)
const browser = await chromium.launch({ headless: false })

// headless=true: /api/ 엔드포인트 인터셉트에는 작동하지만
// new.land.naver.com/complexes/{complexNo} 단지 상세 페이지는 302→404 리다이렉트 발생
```

**headless 모드별 동작 차이:**
- `headless: true` → `/api/complexes/single-markers` 등 API 응답은 인터셉트 가능
- `headless: true` → `complexes/{no}` 단지 상세 페이지는 차단 (302→404)
- `headless: false` → 단지 상세 페이지 정상 접근 가능

### 1.3 NAVER_COOKIE 주입

```typescript
const rawCookie = process.env.NAVER_COOKIE ?? ''
const cookies = rawCookie.split(';').map(c => {
  const [name, ...rest] = c.trim().split('=')
  return { name: name.trim(), value: rest.join('=').trim(), domain: '.naver.com', path: '/' }
})
await ctx.addCookies(cookies)
```

`.env.local`에 `NAVER_COOKIE=NID_AUT=...;NID_SES=...` 설정. Chrome 개발자도구 → Application → Cookies에서 복사.

**쿠키 만료 증상**: 단지 상세 페이지가 로그인 페이지(302→404)로 리디렉션됨.

### 1.4 이미지/폰트/미디어 차단

```typescript
await ctx.route('**/*', route => {
  const rt = route.request().resourceType()
  if (['image', 'font', 'media'].includes(rt)) return route.abort()
  return route.continue()
})
```

- 2~3배 빠른 로딩
- API 응답 수집에는 영향 없음
- 봇 탐지 회피에도 문제없음 (오히려 자연스러움)

### 1.5 인간형 맵 네비게이션 (Python 원본)

```python
async def human_like_recenter(page, lat, lon, zoom):
    rand_out = random.randint(9, 12)  # 랜덤 줌 아웃
    await wheel_to_zoom(page, rand_out)
    await drag_to_latlon(page, lat, lon)
    await wheel_to_zoom(page, zoom)
    await drag_to_latlon(page, lat, lon)
```

줌 아웃 → 이동 → 줌 인 → 미세조정. "한 번에 목표로 찾아가는 봇" 패턴 회피.

### 1.6 마우스 드래그 시뮬레이션 (Python 원본)

```python
await page.mouse.move(960 - mx, 540 - my, steps=20)  # 20단계 베지어 곡선
```

한 번에 점프하지 않고 20단계로 부드럽게 이동. `mouse.click()` 대신 `mouse.down()` + `move()` + `mouse.up()` 조합.

### 1.7 그리드 스윕 알고리즘 (Python 원본)

```python
for r in range(1, rings + 1):
    for dx in range(-r, r + 1):
        for dy in (-r, r):  # Top, bottom rows only — 중간 행 생략
```

전체 그리드 순회 대신 **상하 행만** 스캔. 규칙적인 격자 패턴 숨김.

---

## 2. 네이버 부동산 API 엔드포인트

### 2.1 단지 마커 목록

```
GET https://new.land.naver.com/api/complexes/single-markers/2.0
  ?cortarNo={cortarNo}
  &zoom=16
  &priceType=RETAIL
  &markerId=&markerType=
  &selectedComplexNo=
  &selectedComplexBuildingNo=
  &fakeComplexMarkerCnt=-1
  &realEstateType=APT%3AOFFICETL
  &tradeType=
  &tag=&rentPriceMin=0&rentPriceMax=900000000
  &priceMin=0&priceMax=900000000
  &areaMin=0&areaMax=900000000
  &oldBuildYears&recentlyBuildYears&minHouseHoldCount&maxHouseHoldCount
  &showArticle=false
  &sameAddressGroup=false
  &minMaintenanceCost&maxMaintenanceCost
  &directions=
```

Playwright로 `new.land.naver.com/complexes?ms={lat},{lng},16&a=APT&b=A1` 페이지 접속 시 자동 호출됨.  
응답: 배열 또는 숫자키 객체 두 형태 모두 처리 필요.

```typescript
// 파싱 예시
function parseMarkers(json: unknown): NaverMarker[] {
  const items = Array.isArray(json) ? json : Object.values(json as Record<string, unknown>)
  return items.flatMap(item => {
    const m = item as Record<string, unknown>
    return [{
      complexNo:   String(m['markerId'] ?? ''),
      complexName: String(m['complexName'] ?? ''),
      lat: parseFloat(String(m['latitude']  ?? '0')),
      lng: parseFloat(String(m['longitude'] ?? '0')),
    }]
  })
}
```

### 2.2 단지 개요 (이름 검색)

```
GET https://new.land.naver.com/api/complexes/overview
  ?realEstateType=APT
  &query={단지명}
```

응답 필드: `complexList[].complexNo`, `complexName`, `latitude`, `longitude`

### 2.3 매물 목록 (PC API)

```
GET https://new.land.naver.com/api/articles/complex/{complexNo}
  ?realEstateType=APT
  &tradeType=A1  (A1=매매, B1=전세, B2=월세)
  &page=1
  &pageSize=20
```

응답: `articleList[]` + `isMoreData` (boolean)

필드: `dealOrWarrantPrc` (가격문자열), `exclusiveArea` (전용면적), `area2` (전용면적 대체)

### 2.4 매물 상세 (모바일, 더 안정적)

```
GET https://m.land.naver.com/article/info/{articleNo}
GET https://m.land.naver.com/article/view/{articleNo}  (fallback)
```

`fin.land.naver.com`으로 리디렉션 시 원래 URL로 재접속 필요.

---

## 3. 메르카토르 투영 변환

지도 드래그를 위한 픽셀-좌표 변환:

```typescript
function ll_to_pixel(lat: number, lon: number, z: number): [number, number] {
  const scale = 256 * Math.pow(2, z)
  const x = (lon + 180.0) / 360.0 * scale
  const siny = Math.sin(lat * Math.PI / 180)
  const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale
  return [x, y]
}

function pixel_to_ll(x: number, y: number, z: number): [number, number] {
  const scale = 256 * Math.pow(2, z)
  const lon = x / scale * 360.0 - 180.0
  const n = Math.PI - 2.0 * Math.PI * y / scale
  const lat = Math.atan(Math.sinh(n)) * 180 / Math.PI
  return [lat, lon]
}
```

---

## 4. 워커 풀 패턴 (탭 재사용)

```typescript
// 탭 미리 생성
const tabPool = await Promise.all(
  Array.from({ length: WORKERS }, () => ctx.newPage())
)

// Queue 방식으로 탭 재사용
const queue = [...targets]
async function worker(tab: Page) {
  while (queue.length > 0) {
    const item = queue.shift()
    // tab 재사용하여 처리
  }
}
await Promise.all(tabPool.map(tab => worker(tab)))
```

매번 탭을 새로 열지 않아 메모리 효율적. 우리 스크립트에서 WORKERS=4 사용.

---

## 5. 한국식 금액 파싱

```typescript
// src/services/naver-land.ts parsePrcInfo()
// "5억 3,000" → 53000 (만원), "3억" → 30000, "9,800" → 9800
export function parsePrcInfo(prcInfo: string): number | null {
  const clean = prcInfo.replace(/,/g, '').trim()
  const match = clean.match(/^(?:(\d+)억)?(?:\s*(\d+))?$/)
  if (!match) return null
  const uk  = parseInt(match[1] ?? '0', 10)
  const man = parseInt(match[2] ?? '0', 10)
  const result = uk * 10000 + man
  return result > 0 ? result : null
}
```

---

## 6. 우리 프로젝트 스크립트 현황

| 파일 | 목적 | 상태 |
|------|------|------|
| `scripts/map-naver-search.ts` | DB 미매핑 단지 → naver_complex_no 탐색 | 완료 (headless: true) |
| `scripts/map-naver-complexes-playwright.ts` | 격자 탐색 방식 매핑 (레거시) | 완료 |
| `scripts/crawl-naver-realtrade.ts` | 단지 실거래 탭 탐색 | 미완 (headless 문제) |
| `src/services/naver-land.ts` | API 어댑터 (searchNaverComplex, fetchNaverListings) | 완료 |

### 알려진 문제

- **단지 상세 페이지 302→404**: `headless: true`에서 `complexes/{complexNo}` URL 차단됨. `headless: false`로 전환 필요.
- **NAVER_COOKIE 만료**: 단지 페이지 접근 시 로그인 요구. Chrome에서 NID_AUT + NID_SES 재발급 필요.
- **실거래 API 미발견**: 네이버 부동산은 실거래 데이터를 별도 REST API로 미제공. 실거래 탭 렌더링만 가능.

### 실행 명령

```bash
# 단지 매핑 (미매핑 단지 → naver_complex_no)
npx tsx scripts/map-naver-search.ts

# 단지 상세 + 평형 데이터 수집
npx tsx scripts/crawl-naver-area-types.ts

# 단지 실거래 탭 탐색 (headless: false 권장)
npx tsx scripts/crawl-naver-realtrade.ts --limit=50

# area_type_id 재매핑
npx tsx -e "import {createClient} from '@supabase/supabase-js'; ..."
```

---

## 7. 요청 간격 권장값

| 동작 | 권장 딜레이 |
|------|------------|
| 페이지 이동 후 마커 대기 | 2,500ms |
| 그리드 스윕 각 지점 | 600ms |
| 마우스 드래그 단계 간 | 350ms |
| 탭 워커 수 (동시 요청) | 4개 이하 (IP 차단 방지) |
| 단지 상세 페이지 접근 | 3개 이하 동시 |

---

## 8. 주의사항

- 네이버 이용약관상 자동화 크롤링은 제한됨. 내부 데이터 수집 전용으로만 사용.
- 공용 IP에서 다수 동시 실행 시 IP 차단 위험.
- 플랫폼 변경으로 URL 패턴이나 응답 구조가 변경될 수 있음.
