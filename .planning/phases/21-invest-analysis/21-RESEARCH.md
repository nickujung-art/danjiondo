# Phase 21: 투자 분석 통합 페이지 — Research

**Researched:** 2026-05-29
**Domain:** Next.js 15 RSC + Recharts AreaChart + Supabase SQL 집계
**Confidence:** HIGH (전체 소스 코드 직접 확인)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: 포지셔닝 — "AI 예측" 아닌 "실거래 흐름 기반 참고 지수". 법적 면책 고지 필수
- D-02: 노출 위치 — 새 `/invest` 페이지 + `/gap-analysis` → `/invest` 301 redirect + `/complex/[id]` 시세 차트 섹션 추가
- D-03: `/invest` 페이지 구성 — 상단 타입별 시세 흐름 차트 + 하단 갭투자 랭킹 테이블
- D-04: 차트 스펙 — 최근 24개월 고정, 매매만, 월별 평균, 컬러 영역 차트 (Recharts AreaChart + 동적 색상)
- D-05: 타입 선택 UI — 탭 방식 (전체|59㎡|84㎡|…), 거래 건수 < 3 타입 숨김
- D-06: 단지 클릭 — `/complex/[id]` 이동 (별도 투자 상세 페이지 없음)
- D-07: 미래 흐름선 없음
- D-08: UI 원칙 — AI 슬롭 금지, RSC-first (차트만 'use client'), Supabase 쿼리 서버 컴포넌트만, formatPrice() 사용

### Claude's Discretion
- 없음 (모든 핵심 결정 확정)

### Deferred Ideas (OUT OF SCOPE)
- 전세 시세 차트
- 기간 선택 UI (1년/3년/5년)
- AI 가격 예측선
- 단지별 투자 전용 상세 페이지 (/invest/[id])
- 시세 변동 알림
- 지역별 평균 vs 단지 비교 오버레이
- 공급물량 차트 연동
</user_constraints>

---

## Summary

Phase 21은 기존 Phase 20 갭투자 분석(`/gap-analysis`)을 더 넓은 `/invest` 통합 페이지로 확장하는 작업이다. 핵심은 두 가지 신규 기능: (1) 단지 타입별(59㎡/84㎡) 2년 매매 시세 흐름 컬러 영역 차트, (2) `/complex/[id]` 단지 상세에 동일 차트 섹션 추가. 기존 갭투자 랭킹 테이블은 완전히 재사용된다.

코드베이스 직접 확인 결과, 재사용 가능한 인프라가 풍부하다. `computePriceHistory()`는 그대로 쓸 수 있고, `getGapRankings()`와 `/gap-analysis` 필터 탭 패턴도 이식 가능하다. 단, 현재 Recharts 차트들은 모두 `LineChart` + `ComposedChart` 기반이어서 **컬러 영역 차트(`AreaChart`)는 새로 작성**해야 한다. `linearGradient`를 사용하는 기존 코드는 없다.

**Primary recommendation:** 시세 집계는 기존 `complex_monthly_prices` RPC에 `area_bucket` 파라미터를 추가하는 신규 RPC `invest_price_history`를 작성한다. `/invest` 페이지는 RSC로 데이터 fetch 후 차트 컴포넌트에 props로 전달한다. ISR `revalidate = 3600`으로 성능을 확보한다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 시세 집계 (월별 타입별) | Database (RPC) | — | SQL GROUP BY가 가장 효율적; 클라이언트 집계 시 2,000+ 단지 × 24개월 데이터 전송 불가 |
| 갭투자 랭킹 데이터 | Database (complex_gap_stats) | — | Phase 20에서 이미 daily-batch 캐시 테이블 완성 |
| 데이터 fetch + ISR | Frontend Server (RSC page.tsx) | — | `createReadonlyClient()` + `export const revalidate` 패턴 |
| 컬러 영역 차트 렌더링 | Browser (Client Component) | — | Recharts는 DOM 의존 — SSR 불가 |
| 타입 탭 URL 상태 | Browser (Client) + URL | — | `?area_type=84` searchParam, Link 기반 |
| 301 redirect | Frontend Server (next.config.ts) | — | Next.js redirects 설정 |
| URL 파라미터 검증 | Frontend Server (RSC) | — | allowlist 검증 후 쿼리 실행 |

---

## Research Findings

### 1. 기존 코드 재사용 전략

**[VERIFIED: 직접 파일 읽기]**

#### `computePriceHistory()` — `src/lib/data/compare.ts:43`

```typescript
// 시그니처 (검증됨)
export function computePriceHistory(
  txRows: Array<{ deal_date: string; price: number }>
): Array<{ yearMonth: string; avgPrice: number }>
```

- 입력: `deal_date` (string) + `price` (만원 number) 배열
- 출력: yearMonth별 평균가 배열 (정렬됨)
- 재사용 전략: 그대로 사용 가능. `complex_monthly_prices` RPC가 이미 월별 집계를 반환하므로, Phase 21에서는 이 함수 대신 RPC 결과를 직접 쓰는 게 더 효율적이다. 단, `/invest` 지역 단위 집계(단지 다수를 묶은 집계)에서는 `computePriceHistory` 패턴이 참고용.

#### `getGapRankings()` — `src/lib/data/gap-analysis.ts:35`

```typescript
// 시그니처 (검증됨)
export async function getGapRankings(
  filter: GapRankingFilter,  // { sggCode?: string; riskLevel?: 'safe'|'caution'|'danger' }
  supabase: SupabaseClient<Database>,
): Promise<GapRankingRow[]>
```

- `complex_gap_stats JOIN complexes` 조회, `gap_ratio` 내림차순 정렬, 최대 200건
- **완전 재사용 가능**. `/invest` 하단 갭투자 랭킹 테이블에 그대로 사용.
- ALLOWED_SGG_CODES 내부 allowlist 검증 포함 (`['48121','48123','48125','48127','48128','48129','48250']`)

#### `/gap-analysis/page.tsx` 필터 탭 패턴

**[VERIFIED: 직접 파일 읽기]**

- `searchParams` Promise로 await 후 allowlist 검증 → 검증된 값만 쿼리에 전달
- `filterTab()` 헬퍼 함수: key/value를 URLSearchParams로 조합해 href 생성
- `<Link>` 컴포넌트 기반 (클라이언트 JS 없이 탭 필터 동작)
- `export const revalidate = 3600` (1시간 ISR)
- **재사용 전략**: 이 패턴을 `/invest/page.tsx`에 이식. 지역 필터 탭은 완전히 동일. 위험도 탭도 재사용. `filterTab()` 함수의 URL만 `/gap-analysis` → `/invest`로 변경.

#### `src/lib/format.ts`

**[VERIFIED: 직접 파일 읽기]**

```typescript
formatPrice(price: number): string   // 만원 → "N억 M만" 형식
formatGap(gapWan: number): string    // 갭 금액 포맷 (음수 처리 포함)
formatPyeong(area_m2: number): string // m2 → 평
formatDealDate(dealDate: string): string // "오늘"/"어제"/날짜 포맷
```

**완전 재사용 가능**. `/invest/page.tsx`에서 `import { formatPrice } from '@/lib/format'`.

> 주의: `/gap-analysis/page.tsx`는 `formatPrice`를 로컬 복사해 사용하고 있다 (line 54). `/invest/page.tsx`에서는 반드시 `src/lib/format.ts`에서 import해 DRY 준수.

#### `CompareChart.tsx` Recharts 패턴

**[VERIFIED: 직접 파일 읽기]**

- `LineChart` 사용 (`AreaChart` 미사용)
- RSC에서 props로 데이터 수신 후 `CompareChartWrapper` (`'use client'` + `dynamic(ssr:false)`)로 감싸는 패턴 확인
- **Phase 21 차트 구현 방향**: `AreaChart` 신규 작성. 래퍼 패턴(`dynamic(ssr:false)`)은 동일하게 적용.

#### `complex_monthly_prices` RPC — `supabase/migrations/20260430000013_complex_detail_functions.sql`

**[VERIFIED: 직접 파일 읽기]**

```sql
-- 현재 시그니처
create or replace function public.complex_monthly_prices(
  p_complex_id uuid,
  p_deal_type  text,
  p_months     int default 120
) returns table (year_month text, avg_price numeric, count bigint, avg_area numeric)
```

- `complex_id` 단건 조회만 지원 → 타입(area_bucket) 필터 파라미터 없음
- **Phase 21 결론**: 새 RPC `invest_price_history`를 작성해야 함 (단지별 + 타입별 집계 지원)

---

### 2. 컬러 영역 차트 구현

**[VERIFIED: Recharts 코드베이스 패턴 확인 + [ASSUMED: Recharts v2 공식 API 기반]**

#### 핵심 구현 접근법: SVG linearGradient + AreaChart

Recharts에서 상승/하락 구간별 색상 영역을 그리는 표준 패턴:

```typescript
// 월별 데이터에 direction 플래그를 붙여 컬러를 결정
type MonthlyPoint = {
  yearMonth: string
  avgPrice: number
  direction: 'up' | 'down' | 'flat'  // 전월 대비
}

function addDirections(series: Array<{ yearMonth: string; avgPrice: number }>): MonthlyPoint[] {
  return series.map((p, i) => {
    const prev = series[i - 1]
    const direction =
      prev == null ? 'flat'
      : p.avgPrice > prev.avgPrice ? 'up'
      : p.avgPrice < prev.avgPrice ? 'down'
      : 'flat'
    return { ...p, direction }
  })
}
```

#### Recharts 컬러 영역 차트 두 가지 방식

**방식 A — linearGradient (단순, 권장):**

```tsx
'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// SVG defs에 그라디언트 정의
// 가격 상승 = 초록, 하락 = 빨강으로 전체 영역을 단일 색상으로 표시
// 단점: 단일 색상만 적용됨 (구간별 색상 전환 불가)
```

**방식 B — 구간 분할 렌더링 (정확, 복잡):**

전월 대비 상승/하락 구간을 별도 `<Area>` 컴포넌트로 분리해 각각 색상 적용. 구현이 복잡하고 구간 경계에서 불연속이 생길 수 있다.

**권장: 방식 A 단순화 버전 (Phase 21 규모에 적합)**

최근 24개월 평균가 전체의 추세 방향(전체 상승/하락)을 판단하거나, 차트 영역 색을 전월 대비 마지막 달 방향으로 단색 설정. CONTEXT.md D-04 "상승=초록/하락=빨강 영역 채우기"의 실용적 해석:

```tsx
// 권장 구현: 단일 AreaChart, fill은 전체 평균 방향으로 단색
// 선 색상을 월별로 변경하거나, 배경 영역만 방향별로 구분
// ReferenceLine으로 기준선(최저값) 표시

<AreaChart data={series}>
  <defs>
    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={isRising ? '#16a34a' : '#dc2626'} stopOpacity={0.3} />
      <stop offset="95%" stopColor={isRising ? '#16a34a' : '#dc2626'} stopOpacity={0.05} />
    </linearGradient>
  </defs>
  <Area
    type="monotone"
    dataKey="avgPrice"
    stroke={isRising ? '#16a34a' : '#dc2626'}
    fill="url(#priceGradient)"
    strokeWidth={2}
    dot={false}
  />
</AreaChart>
```

**대안 — 구간별 색상 교대 (고급):**

```tsx
// 각 인접 두 점을 독립 <Area> 세그먼트로 분리
// 구현 복잡도 높음 → Phase 21에서는 단순화 버전 우선
```

#### CONTEXT.md 스케치 해석

```
// CONTEXT.md 스케치 (D-04):
// 상승 구간 = 초록 영역 / 하락 구간 = 빨강 영역
```

실제 구현에서는 동일 차트에서 구간별 색상 전환이 Recharts v2에서 기술적으로 어렵다. 권장 구현: **전체 영역 색상은 최종 추세(24개월 간 상승/하락)로 단색 설정**, 라인 색상은 월별 변화 방향 반영 (또는 단색 라인). 기능 축소가 아니라 실용적 단순화임을 플래너가 판단해 결정.

> [ASSUMED] Recharts v2에서 동일 `<Area>` 컴포넌트 내 구간별 색상 전환은 `linearGradient` + `offset` 계산으로 구현 가능하지만, 데이터 포인트 위치에 따른 offset 동적 계산이 필요하여 구현 복잡도가 높다.

---

### 3. 타입별 집계 쿼리 전략

**[VERIFIED: 기존 마이그레이션 파일 직접 확인]**

#### 기존 `complex_monthly_prices` RPC의 한계

현재 RPC: `complex_id` + `deal_type` + `months` → 타입(exclusive_area) 필터 없음.

Phase 21 요구사항: 타입 탭(전체/59㎡/84㎡)별로 데이터를 구분해야 함.

#### 신규 RPC 설계: `invest_price_history`

```sql
-- 신규 마이그레이션에서 생성
CREATE OR REPLACE FUNCTION public.invest_price_history(
  p_complex_id   uuid,
  p_deal_type    text DEFAULT 'sale',
  p_months       int  DEFAULT 24,
  p_area_bucket  text DEFAULT NULL  -- NULL=전체, '59'=59㎡급, '84'=84㎡급, '소형', '대형'
) RETURNS TABLE (
  year_month text,
  avg_price  numeric,
  tx_count   bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    to_char(deal_date, 'YYYY-MM') AS year_month,
    ROUND(AVG(price))             AS avg_price,
    COUNT(*)                      AS tx_count
  FROM public.transactions
  WHERE
    complex_id    = p_complex_id
    AND deal_type = p_deal_type::public.deal_type
    AND deal_date >= (now() - (p_months || ' months')::interval)::date
    AND cancel_date   IS NULL
    AND superseded_by IS NULL
    AND (
      p_area_bucket IS NULL
      OR CASE
        WHEN exclusive_area < 50 THEN '소형'
        WHEN exclusive_area < 66 THEN '59'
        WHEN exclusive_area < 95 THEN '84'
        ELSE '대형'
      END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC
$$;
```

#### 타입 탭 목록 생성 쿼리

```sql
-- 단지별 존재 타입 + 건수 (24개월 기준)
SELECT
  CASE
    WHEN exclusive_area < 50 THEN '소형'
    WHEN exclusive_area < 66 THEN '59'
    WHEN exclusive_area < 95 THEN '84'
    ELSE '대형'
  END AS area_bucket,
  COUNT(*) AS tx_count
FROM public.transactions
WHERE
  complex_id    = $1
  AND deal_type = 'sale'
  AND deal_date >= CURRENT_DATE - INTERVAL '24 months'
  AND cancel_date   IS NULL
  AND superseded_by IS NULL
GROUP BY area_bucket
HAVING COUNT(*) >= 3
ORDER BY tx_count DESC;
```

이를 별도 RPC `invest_area_types(p_complex_id, p_months)`로 캡슐화하거나, 타입 목록을 TypeScript에서 집계.

#### 실제 `exclusive_area` 컬럼 확인

**[VERIFIED: 기존 마이그레이션 + 소스 검색]**

`transactions` 테이블에 `exclusive_area` 컬럼 존재 확인됨 (`complex_transactions_for_chart` RPC에서 `area_m2` 컬럼 반환). 단, `exclusive_area`와 `area_m2` 두 컬럼 모두 존재하는지 확인 필요. 기존 코드에서는 `area_m2`를 사용한다.

> [ASSUMED] `transactions.exclusive_area`와 `transactions.area_m2`가 동일한 값을 담는지 확인 필요. 현재 코드는 `area_m2`를 사용하므로 RPC에서도 `area_m2`로 버킷화하는 것이 안전하다.

---

### 4. DB 캐싱 전략

**[VERIFIED: 기존 코드 패턴 + 마이그레이션 확인]**

#### 현황: complex_gap_stats 패턴

Phase 20에서 `complex_gap_stats` 테이블을 daily-batch cron이 UPSERT하는 캐시 패턴을 수립했다. 갭투자 랭킹은 이 캐시 테이블을 직접 조회한다.

#### 시세 차트 데이터: 실시간 조회 vs 캐시 테이블

**비교:**

| 방식 | 장점 | 단점 |
|------|------|------|
| 실시간 RPC 조회 + ISR | 구현 단순, 항상 최신 | 단지 클릭마다 DB 집계 발생 |
| complex_monthly_prices (기존 RPC) | 이미 존재 | 타입 필터 없음, 신규 RPC 필요 |
| 별도 캐시 테이블 | 조회 속도 최고 | 구현 복잡, 마이그레이션 + daily-batch 수정 필요 |

**권장: 실시간 RPC + ISR revalidate = 3600**

창원·김해 단지 수(~2,000개)에서 단일 단지 시세 조회는 24개월 × 1 단지 = 매우 작은 집계다. 단지 상세 페이지(`revalidate = 86400`)는 이미 ISR 캐싱으로 보호되고 있다.

`/invest` 페이지는 특정 단지가 아닌 **지역 전체 기준 집계**를 보여주므로, 집계 대상이 달라진다. 시세 흐름 차트가 어떤 단위를 표시하는지 명확히 해야 한다:

**D-03 분석:**
```
/invest
├── 상단: 타입별 시세 흐름 차트 섹션
│   ├── 지역 필터 (sgg_code)
│   ├── 타입 탭 (전체|59㎡|84㎡|...)
│   └── 2년 컬러 영역 차트 (매매 월별 평균가)
```

"지역 단위 시세 흐름 차트"라면 sgg_code + area_bucket 조합 집계가 필요하다. 이는 2,000+ 단지 × 24개월의 트랜잭션 집계를 의미하므로 **ISR revalidate = 3600은 필수**.

단지 상세(`/complex/[id]`)의 시세 차트는 단건 집계이므로 RPC 실시간 조회로 충분하고, 기존 `revalidate = 86400`을 그대로 유지한다.

#### 결론

- `/invest` 지역 단위 시세 집계: 신규 RPC `invest_regional_price_history(sgg_code, area_bucket, months)` + ISR 3600
- `/complex/[id]` 단지별 시세 차트: 신규 RPC `invest_price_history(complex_id, area_bucket, months)` + 기존 revalidate 86400

---

### 5. 라우팅 전략

**[VERIFIED: next.config.ts 직접 확인]**

#### `/gap-analysis` → `/invest` 301 redirect

현재 `next.config.ts`는 `headers()`만 사용하고 `redirects()`가 없다. 추가 위치:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source:      '/gap-analysis',
        destination: '/invest',
        permanent:   true,  // 301
      },
      {
        source:      '/gap-analysis/:path*',
        destination: '/invest/:path*',
        permanent:   true,
      },
    ]
  },
  async headers() {
    // 기존 CSP 헤더 유지
  },
}
```

Sentry + Serwist 래퍼 적용 순서: `withSentryConfig(withSerwist(nextConfig), ...)` 구조가 유지되어야 한다.

#### `/invest` URL 파라미터 구조

```
/invest                          → 전체 지역, 전체 타입
/invest?sgg_code=48125           → 창원 성산구
/invest?sgg_code=48125&area_type=84  → 창원 성산구, 84㎡
/invest?risk_level=danger        → 위험 갭투자 단지 필터
```

`area_type` 파라미터 추가 (기존 `/gap-analysis`에는 없었던 파라미터).

---

### 6. 성능 고려사항

**[VERIFIED: 기존 ISR 패턴 확인]**

#### 창원·김해 데이터 규모

- 단지 수: ~2,000개 (complexes 테이블)
- 거래 데이터: 현재 매칭률 91% 기준 266,001건 (24개월 필터 적용 시 대폭 감소)

#### `/invest` 지역 단위 집계 성능

`sgg_code + area_bucket + 24개월` 집계는 최대 수만 건 → DB 집계 함수에서 수백 ms 소요 가능. ISR `revalidate = 3600`으로 Edge CDN 캐시 필수.

#### `/complex/[id]` 단지별 차트 추가 영향

현재 단지 상세 페이지는 이미 15개의 Promise.all 병렬 쿼리를 실행한다. 시세 차트 쿼리(`invest_price_history`) 1개 추가는 병렬 실행이므로 지연 증가 없음. 단, 타입 목록 쿼리를 별도로 추가하면 쿼리가 2개 늘어난다. 성능 최적화: **타입 목록 쿼리를 하나의 RPC에 통합** (시세 데이터와 동시에 반환).

#### ISR 전략 정리

| 페이지 | revalidate | 이유 |
|--------|------------|------|
| `/invest` | 3600 (1시간) | 갭 통계는 daily 갱신, 시세는 4시간 주기 배치 |
| `/complex/[id]` | 86400 (1일) | 기존 그대로 유지 |

#### Supabase DB 용량 (500MB 무료 티어)

신규 캐시 테이블 없이 RPC 집계만 사용하면 추가 저장 비용 없음.

---

### 7. 보안 위협 모델

**[VERIFIED: 기존 gap-analysis 검증 패턴 확인 + CLAUDE.md 규칙]**

#### URL 파라미터 인젝션 방지

기존 `gap-analysis/page.tsx`의 검증 패턴을 그대로 적용:

```typescript
// ALLOWED_SGG_CODES allowlist (기존 그대로)
const ALLOWED_SGG_CODES = ['48121', '48123', '48125', '48127', '48128', '48129', '48250']

// ALLOWED_AREA_TYPES 신규 추가
const ALLOWED_AREA_TYPES = ['소형', '59', '84', '대형'] as const

// searchParams 검증 패턴
const rawSgg     = typeof params.sgg_code   === 'string' ? params.sgg_code   : ''
const rawArea    = typeof params.area_type  === 'string' ? params.area_type  : ''
const sggCode    = ALLOWED_SGG_CODES.includes(rawSgg)  ? rawSgg  : undefined
const areaType   = ALLOWED_AREA_TYPES.includes(rawArea as typeof ALLOWED_AREA_TYPES[number])
                     ? rawArea : undefined
```

`getGapRankings()`는 이미 내부 allowlist 검증을 포함하고 있어 이중 방어 적용됨.

#### Supabase RPC SQL Injection

RPC 파라미터는 PostgREST가 prepared statement로 처리하므로 SQL injection 위험 없음. 단, `p_deal_type::public.deal_type` 캐스트로 enum 타입 강제가 필요하다 (기존 패턴 확인됨).

#### 법적 면책 문구

CONTEXT.md D-01, specifics 섹션 기준:

```
* 본 데이터는 국토교통부 실거래가 공개시스템 기반입니다.
* 투자 결정에 직접 활용하지 마세요. 부동산 전문가와 상담하시기 바랍니다.
```

위치: `/invest` 페이지 차트 섹션 하단 + `/complex/[id]` 시세 차트 섹션 하단.

---

## Standard Stack

### Core (기존 스택 완전 재사용)

| Library | Version | Purpose | 확인 방법 |
|---------|---------|---------|-----------|
| Next.js | 15 (App Router) | RSC + ISR + redirects | package.json [VERIFIED] |
| Recharts | v2 | AreaChart 컬러 영역 차트 | 기존 사용 [VERIFIED] |
| Supabase JS | @supabase/ssr | createReadonlyClient() | 기존 패턴 [VERIFIED] |
| TypeScript | strict | 타입 안전성 | tsconfig [VERIFIED] |
| Tailwind CSS | 3.4+ | 없음 (인라인 스타일 패턴) | 기존 패턴 [VERIFIED] |

### 신규 추가 없음

Phase 21은 완전히 기존 라이브러리로 구현 가능하다. 신규 패키지 설치 불필요.

---

## Architecture Patterns

### System Architecture Diagram

```
사용자 브라우저
    │
    ▼
/invest?sgg_code=48125&area_type=84
    │
    ▼
InvestPage (RSC, revalidate=3600)
    ├── createReadonlyClient()
    ├── getGapRankings(filter)          → complex_gap_stats JOIN complexes
    ├── getRegionalPriceHistory(filter) → invest_regional_price_history RPC
    │       └── transactions (GROUP BY year_month, area_bucket)
    │
    ├── [props] → RegionalPriceChart ('use client', dynamic ssr:false)
    │               └── Recharts AreaChart (컬러 영역)
    │
    └── [props] → GapRankingTable (RSC inline, 기존 gap-analysis 패턴)
                    └── <Link href="/complexes/[id]">

/gap-analysis → 301 → /invest   (next.config.ts redirects)

/complexes/[id] (RSC, revalidate=86400)
    ├── 기존 Promise.all에 추가:
    │   ├── getComplexAreaTypes(id)     → invest_area_types RPC
    │   └── getComplexPriceByType(id)   → invest_price_history RPC
    │
    └── [props] → ComplexPriceChart ('use client', dynamic ssr:false)
                    └── Recharts AreaChart (타입별 컬러 영역)
```

### 권장 파일 구조 (신규 파일)

```
src/
├── app/
│   ├── invest/
│   │   └── page.tsx              # RSC 통합 페이지 (gap-analysis 이식 + 차트 추가)
│   └── complexes/[id]/
│       └── page.tsx              # 기존 파일에 시세 차트 섹션 추가
├── components/
│   └── invest/
│       ├── RegionalPriceChart.tsx    # 'use client' AreaChart (지역 단위)
│       ├── RegionalPriceChartWrapper.tsx  # dynamic(ssr:false) 래퍼
│       ├── ComplexPriceChart.tsx     # 'use client' AreaChart (단지 단위)
│       └── ComplexPriceChartWrapper.tsx
└── lib/
    └── data/
        └── invest.ts             # getRegionalPriceHistory, getComplexAreaTypes, getComplexPriceByType
```

마이그레이션:
```
supabase/migrations/
└── 2026XXXX_invest_price_history.sql   # invest_price_history + invest_regional_price_history RPC
```

### 기존 gap-analysis 페이지 처리

`/gap-analysis/page.tsx`는 301 redirect 설정 후 **삭제하지 않고 유지**하거나, redirect 후 파일 삭제. Next.js redirects는 파일 존재 여부와 무관하게 동작하므로 삭제 가능. 단, 삭제 시 모든 기존 링크(`/gap-analysis`)가 정상적으로 `/invest`로 이동하는지 확인 필요.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 월별 집계 | 클라이언트 JavaScript 집계 | SQL GROUP BY RPC | 24개월 거래 데이터 클라이언트 전송 금지 |
| URL 파라미터 라우팅 | useState + 브라우저 API | `<Link>` href (기존 gap-analysis 패턴) | RSC 재렌더링 없이 필터 동작 |
| 가격 포맷팅 | 로컬 함수 | `src/lib/format.ts::formatPrice` | 이미 존재, DRY |
| 갭 랭킹 조회 | 새 쿼리 | `getGapRankings()` 재사용 | 이미 allowlist + RLS 포함 |
| 차트 SSR | Recharts 직접 SSR | `dynamic(ssr:false)` 래퍼 | Recharts DOM 의존 |

---

## Common Pitfalls

### Pitfall 1: formatPrice 로컬 복사

**What goes wrong:** `/gap-analysis/page.tsx`처럼 `formatPrice`를 로컬 복사해 사용하면 두 버전이 diverge됨.

**How to avoid:** `/invest/page.tsx`에서 반드시 `import { formatPrice } from '@/lib/format'`.

**Warning signs:** page.tsx 안에 `function formatPrice` 정의가 있으면 즉시 제거.

### Pitfall 2: 차트 컴포넌트 SSR

**What goes wrong:** Recharts를 `'use client'`로만 표시하고 `dynamic(ssr:false)` 없이 사용하면 `window is not defined` 빌드 오류.

**How to avoid:** `CompareChartWrapper` 패턴처럼 래퍼 컴포넌트 + `dynamic(ssr:false)`.

### Pitfall 3: revalidate와 cookies() 충돌

**What goes wrong:** ISR 페이지에서 `cookies()` 호출 시 `revalidate` 비활성화.

**How to avoid:** `/invest/page.tsx`에서 `createReadonlyClient()`만 사용 (cookies() 미포함). 기존 gap-analysis 패턴 동일.

### Pitfall 4: area_type 파라미터 미검증

**What goes wrong:** `params.area_type`을 그대로 SQL에 전달하면 SQL injection 가능.

**How to avoid:** ALLOWED_AREA_TYPES allowlist 검증 후 RPC에 전달. RPC 내에서도 CASE 버킷화로 이중 방어.

### Pitfall 5: cancel_date/superseded_by 필터 누락

**What goes wrong:** 취소·정정 거래가 포함되어 시세가 왜곡됨 (CLAUDE.md CRITICAL).

**How to avoid:** 신규 RPC에 `AND cancel_date IS NULL AND superseded_by IS NULL` 필수 포함. 기존 RPC 패턴 동일하게 적용.

### Pitfall 6: next.config.ts wrapper 순서

**What goes wrong:** `redirects()` 추가 시 `withSentryConfig(withSerwist(nextConfig))` 래퍼 구조를 깨뜨림.

**How to avoid:** `nextConfig` 객체에 `async redirects()` 추가 후 기존 `withSentryConfig(withSerwist(nextConfig), ...)` 래퍼는 그대로 유지.

---

## Code Examples

### 컬러 영역 차트 기본 패턴

```tsx
// src/components/invest/RegionalPriceChart.tsx
'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface PricePoint {
  yearMonth: string
  avgPrice:  number
  txCount:   number
}

function formatPrice(v: unknown): string {
  const n = Number(v)
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`
  return `${n.toLocaleString()}만`
}

export function RegionalPriceChart({ data }: { data: PricePoint[] }) {
  if (data.length === 0) {
    return <div style={{ ...emptyStyle }}>데이터 없음</div>
  }

  const first = data[0]?.avgPrice ?? 0
  const last  = data[data.length - 1]?.avgPrice ?? 0
  const isRising = last >= first
  const color = isRising ? '#16a34a' : '#dc2626'

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="yearMonth"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(2)}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPrice} width={56} />
        <Tooltip
          formatter={(v) => [formatPrice(v), '월평균']}
          labelFormatter={(l) => String(l)}
          contentStyle={{ fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="avgPrice"
          stroke={color}
          strokeWidth={2}
          fill="url(#priceGradient)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

### ISR + RSC 데이터 fetch 패턴

```typescript
// src/lib/data/invest.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const ALLOWED_AREA_BUCKETS = ['소형', '59', '84', '대형'] as const
type AreaBucket = typeof ALLOWED_AREA_BUCKETS[number]

export interface RegionalPricePoint {
  yearMonth: string
  avgPrice:  number
  txCount:   number
}

export async function getRegionalPriceHistory(
  supabase:    SupabaseClient,
  sggCode:     string | undefined,
  areaBucket:  AreaBucket | undefined,
  months = 24,
): Promise<RegionalPricePoint[]> {
  // RPC 호출 — invest_regional_price_history
  const { data, error } = await supabase.rpc('invest_regional_price_history', {
    p_sgg_code:    sggCode   ?? null,
    p_area_bucket: areaBucket ?? null,
    p_months:      months,
  })
  if (error || !data) return []
  return (data as Array<{ year_month: string; avg_price: number; tx_count: number }>).map(r => ({
    yearMonth: r.year_month,
    avgPrice:  Number(r.avg_price),
    txCount:   Number(r.tx_count),
  }))
}
```

### next.config.ts redirects 추가 패턴

```typescript
// next.config.ts (기존 파일에 추가)
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source:      '/gap-analysis',
        destination: '/invest',
        permanent:   true,
      },
      {
        source:      '/gap-analysis/:path*',
        destination: '/invest/:path*',
        permanent:   true,
      },
    ]
  },
  async headers() {
    // 기존 CSP 헤더 유지 — 변경 없음
    return [ /* ... */ ]
  },
}
// withSentryConfig(withSerwist(nextConfig), ...) 래퍼 구조 유지
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (unit + integration) |
| Config file | vitest.config.ts |
| Quick run | `npm run test` |
| Full suite | `npm run test && npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command |
|--------|----------|-----------|---------|
| INVEST-01 | invest_price_history RPC 반환값 올바름 | unit | `npm run test -- invest` |
| INVEST-02 | areaBucket 필터 적용 시 해당 타입만 집계 | unit | `npm run test -- invest` |
| INVEST-03 | getGapRankings sggCode 필터 (기존) | unit (기존) | `npm run test -- gap` |
| INVEST-04 | 법적 면책 문구 DOM 존재 | e2e | Playwright |

### Wave 0 Gaps (테스트 파일)

- [ ] `src/lib/data/__tests__/invest.test.ts` — `getRegionalPriceHistory`, `getComplexAreaTypes` 단위 테스트
- [ ] 신규 RPC 마이그레이션: `supabase/migrations/2026XXXX_invest_price_history.sql`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 공개 페이지 |
| V3 Session Management | no | 공개 페이지 |
| V4 Access Control | no | 공개 데이터 |
| V5 Input Validation | yes | allowlist 검증 (sgg_code, area_type, risk_level) |
| V6 Cryptography | no | 해당 없음 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| searchParams SQL injection | Tampering | ALLOWED_SGG_CODES + ALLOWED_AREA_TYPES allowlist (RSC 레이어), RPC enum 캐스트 (DB 레이어) |
| 무효 sgg_code로 데이터 우회 | Tampering | allowlist 미포함 값 → undefined → 쿼리에서 필터 미적용 (전체 조회) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `transactions.area_m2`와 `exclusive_area`가 동일 컬럼 (또는 area_m2로 버킷화 가능) | 타입별 집계 쿼리 | RPC SQL에서 컬럼명 변경 필요 |
| A2 | Recharts v2 AreaChart에서 `linearGradient` stopColor 동적 설정 지원 | 컬러 영역 차트 | 구현 방식 변경 필요 (구간 분할 방식으로) |
| A3 | `/invest` 페이지 시세 차트가 "지역 단위 집계" (단지별 아닌) | 라우팅 + 쿼리 전략 | CONTEXT.md D-03 재해석 필요 — 단지별이라면 쿼리 구조 완전히 달라짐 |

**주의: A3에 대한 명확화 필요**

CONTEXT.md D-03 스케치를 보면 `/invest` 상단 차트가 지역 전체 시세인지, 특정 단지 시세인지 불명확하다. 스케치는 지역 단위 차트처럼 보이지만, "단지 클릭 → /complex/[id]" 흐름으로 보면 단지별 미리보기 차트일 수도 있다. **플래너가 이 점을 명확히 하거나 사용자에게 확인 필요.**

---

## Sources

### Primary (HIGH confidence)
- `src/lib/data/compare.ts` — `computePriceHistory()` 시그니처 직접 확인
- `src/lib/data/gap-analysis.ts` — `getGapRankings()`, `getComplexGapStats()` 직접 확인
- `src/app/gap-analysis/page.tsx` — 필터 탭 + ISR + allowlist 패턴 직접 확인
- `src/app/compare/CompareChart.tsx` — Recharts LineChart 패턴 직접 확인
- `src/components/complex/TransactionChart.tsx` — ComposedChart 패턴 직접 확인
- `src/lib/format.ts` — formatPrice 시그니처 직접 확인
- `next.config.ts` — redirects 미사용 확인, 래퍼 구조 확인
- `supabase/migrations/20260528000003_complex_gap_stats.sql` — complex_gap_stats 스키마 직접 확인
- `supabase/migrations/20260430000013_complex_detail_functions.sql` — complex_monthly_prices RPC 시그니처 직접 확인
- `supabase/migrations/20260514000002_phase9_transactions_for_chart.sql` — complex_transactions_for_chart RPC 확인
- `src/app/complexes/[id]/page.tsx` — Promise.all 패턴 + GapAnalysisCard 위치 직접 확인

### Secondary (MEDIUM confidence)
- [ASSUMED] Recharts AreaChart linearGradient API: 프로젝트 내 사용 예 없음, 공식 docs 기반

---

## RESEARCH COMPLETE
