---
phase: 22-ai-price-prediction
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - supabase/migrations/20260530000001_complex_price_predictions.sql
  - src/lib/prediction/engine.ts
  - src/lib/prediction/engine.test.ts
  - scripts/compute-predictions.ts
  - .github/workflows/compute-predictions.yml
  - src/lib/data/invest.ts
  - src/components/invest/RegionalPriceChart.tsx
  - src/components/invest/RegionalPriceChartWrapper.tsx
  - src/app/invest/page.tsx
  - src/app/api/invest/prediction-commentary/route.ts
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: issues_found
verdict: WARNING
---

# Phase 22: AI 가격 예측 — 코드 리뷰 보고서

**검토일:** 2026-05-29
**검토 깊이:** standard
**검토 파일 수:** 10
**판정:** BLOCKED

---

## 요약

Phase 22는 Holt-Winters 통계 엔진 + Claude Haiku 해설을 /invest 페이지에 추가하는 작업입니다. 아키텍처 전반은 방향성이 올바르며, `cancel_date IS NULL AND superseded_by IS NULL` 필터 준수, allowlist 입력 검증, 법적 면책 문구 포함, GitHub Actions 시크릿 보호 등 주요 요구사항 대부분이 충족되어 있습니다.

그러나 세 가지 CRITICAL 결함이 존재합니다:
1. **Haiku 프롬프트 출력 사후 검증 부재** — 모델이 규칙을 어겨 가격 숫자를 출력해도 그대로 사용자에게 노출됩니다.
2. **PostgREST 기본 1000행 한도 미적용** — 예측 조회 쿼리에 `.limit()`이 없어 지역 내 단지가 많을 경우 데이터가 무음 잘림됩니다.
3. **`addMonths()` 입력 NaN 전파** — 잘못된 형식의 `yearMonth` 문자열이 입력되면 `NaN`이 연산에 전파되어 예측 월이 `NaN-NaN`이 됩니다.

또한 SQL 스키마 주석(80% CI)과 엔진 구현(z=1.96, 95% CI) 간의 불일치가 WARNING 수준의 정확성 문제를 일으킵니다.

---

## CRITICAL 이슈

### CR-01: Haiku 출력에 가격 숫자가 포함될 경우 사후 검증 없이 그대로 노출

**파일:** `src/app/api/invest/prediction-commentary/route.ts:63-64`

**이슈:**
프롬프트 시스템에서 "구체적인 가격 숫자(만원, 억원 등)를 절대 언급하지 마세요"라고 지시하지만, 모델이 이를 어길 경우 응답 텍스트를 검사하거나 필터링하는 코드가 전혀 없습니다. 프롬프트 인젝션이나 모델 드리프트로 인해 가격 숫자가 포함된 텍스트가 그대로 사용자에게 표시됩니다. 이는 할루시네이션으로 인한 잘못된 투자 정보 제공 위험에 해당합니다.

현재 코드:
```typescript
const text = message.content[0]?.type === 'text' ? message.content[0].text : null
return Response.json({ commentary: text })
```

**수정 방법:**
```typescript
const raw = message.content[0]?.type === 'text' ? message.content[0].text : null
if (!raw) return Response.json({ commentary: null })

// 가격 숫자 포함 여부 사후 검증
const PRICE_PATTERN = /\d[\d,]*\s*(만원|억원|원|만|억|\$)/
const UNIT_PATTERN  = /\d+\s*(만|억)/
if (PRICE_PATTERN.test(raw) || UNIT_PATTERN.test(raw)) {
  // 규칙 위반 — 해설 폐기, null 반환
  return Response.json({ commentary: null })
}
return Response.json({ commentary: raw })
```

---

### CR-02: `getRegionalPricePredictions` — PostgREST 기본 1000행 한도로 데이터 무음 잘림

**파일:** `src/lib/data/invest.ts:171-177`

**이슈:**
`complex_price_predictions` 조회 쿼리에 `.limit()`가 없습니다. PostgREST(Supabase)의 기본 행 반환 한도는 1000행입니다. 지역별 단지 수가 많은 경우(예: 김해시 500단지 × 6개월 예측 = 3000행) 데이터가 1000행에서 무음으로 잘리고, 사용자에게 불완전한 예측 중위값이 표시됩니다. 오류가 발생하지 않으므로 문제를 인지하기 어렵습니다.

현재 코드:
```typescript
const { data, error } = await (supabase as any)
  .from('complex_price_predictions')
  .select('predicted_month, ...')
  .in('complex_id', ids)
  .eq('area_bucket', areaBucket)
  .gte('computed_at', twoDaysAgo)
  .order('predicted_month', { ascending: true })
  // limit 없음 → PostgREST 기본 1000행 한도
```

**수정 방법:**
```typescript
// ids.length × 6 (예측 개월) + 버퍼
const rowLimit = Math.min(ids.length * 6 + 100, 5000)

const { data, error } = await (supabase as any)
  .from('complex_price_predictions')
  .select('predicted_month, predicted_price_mean, predicted_price_lower, predicted_price_upper, model_name, training_mape')
  .in('complex_id', ids)
  .eq('area_bucket', areaBucket)
  .gte('computed_at', twoDaysAgo)
  .order('predicted_month', { ascending: true })
  .limit(rowLimit)
```

또는 Supabase 프로젝트 설정에서 `db.max_rows` 상향 후 명시적 limit을 추가합니다.

---

### CR-03: `addMonths()` — NaN 입력 시 예측 월 전체가 `NaN-NaN`으로 오염

**파일:** `src/lib/prediction/engine.ts:64-70`

**이슈:**
`ym.split('-').map(Number)` 결과에 `?? 0`/`?? 1` 연산자를 사용하지만, `??`는 `null`/`undefined`만 처리하고 `NaN`은 통과시킵니다. `data[data.length - 1]?.yearMonth`가 유효하지 않은 형식(`''`, `'invalid'`, `'2024'`)이면 `NaN * 12 + NaN - 1 + n = NaN`이 되어 모든 예측 월이 `NaN-NaN`으로 채워집니다. 이 값이 DB에 upsert되면 `predicted_month` 날짜 파싱 실패로 Postgres 오류가 발생합니다.

현재 코드:
```typescript
function addMonths(ym: string, n: number): string {
  const [year, month] = ym.split('-').map(Number)
  const total = (year ?? 0) * 12 + (month ?? 1) - 1 + n
  // year/month가 NaN이면 total도 NaN, newYear/newMonth도 NaN
```

**수정 방법:**
```typescript
function addMonths(ym: string, n: number): string {
  const parts = ym.split('-')
  const year  = parseInt(parts[0] ?? '', 10)
  const month = parseInt(parts[1] ?? '', 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`addMonths: invalid yearMonth format "${ym}"`)
  }
  const total    = year * 12 + month - 1 + n
  const newYear  = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}
```

---

## WARNING

### WR-01: SQL 주석(80% CI)과 엔진 구현(z=1.96, 95% CI) 불일치

**파일:** `supabase/migrations/20260530000001_complex_price_predictions.sql:16-17` / `src/lib/prediction/engine.ts:88`

**이슈:**
SQL 스키마는 `predicted_price_lower/upper`를 "80% CI"로 문서화하지만, 엔진은 z=1.96(95% CI)을 사용합니다. 80% CI의 z값은 1.28입니다. 어느 쪽이 의도인지 불명확하며, 사용자 대면 UI("예측 참고선")와 컬럼 의미가 일치하지 않습니다.

**수정 방법:**
의도를 명확히 하고 한쪽을 수정합니다:
- 95% CI 유지 의도라면: SQL 주석을 `-- 95% CI 하한`으로 수정
- 80% CI 의도라면: 엔진의 `z = 1.96`을 `z = 1.28`로 수정 (주석도 업데이트)

---

### WR-02: API 라우트에서 `mape` 파라미터 범위 검증 부재

**파일:** `src/app/api/invest/prediction-commentary/route.ts:12`

**이슈:**
`mape = parseFloat(...)` 결과를 범위 검증 없이 프롬프트에 포함합니다. 외부 호출자가 `mape=NaN`, `mape=Infinity`, `mape=-9999`를 전달하면 `mapeLabel`에 비정상 값이 포함된 채 Haiku에 전달됩니다. 또한 `Math.round(NaN * 100)` = `NaN`이 프롬프트 문자열에 `NaN%`로 삽입됩니다.

**수정 방법:**
```typescript
const rawMape = parseFloat(searchParams.get('mape') ?? '0')
const mape    = Number.isFinite(rawMape) && rawMape >= 0 && rawMape <= 1
  ? rawMape
  : 0
```

---

### WR-03: 페이지 `revalidate=3600`이 fetch의 `revalidate=604800`을 재정의

**파일:** `src/app/invest/page.tsx:11` / `src/app/invest/page.tsx:120`

**이슈:**
`page.tsx`의 `export const revalidate = 3600`은 페이지 전체의 ISR 주기를 1시간으로 설정합니다. 내부 fetch의 `{ next: { revalidate: 604800 } }` 옵션은 Next.js App Router에서 페이지 레벨 revalidate보다 길 경우 페이지 revalidate에 맞춰 잘립니다. 즉 AI 해설이 매 1시간마다 재호출될 수 있어 Anthropic API 비용이 의도와 다르게 발생합니다.

**수정 방법:**
AI 해설 API 라우트를 별도 캐시 레이어(KV, ISR 전용 라우트, 또는 DB 캐시 컬럼 `ai_cached_at` 활용)로 분리하거나, 페이지 revalidate를 AI 해설 주기와 동일하게 맞춥니다. 현재 마이그레이션에 `ai_cached_at timestamptz` 컬럼이 이미 존재하므로 DB 캐시 방식이 적절합니다.

---

### WR-04: `getRegionalPricePredictions` — `trainingMape` 집계 누락으로 MAPE 표시가 항상 0

**파일:** `src/lib/data/invest.ts:182-217`

**이슈:**
`training_mape`를 SELECT하지만 `MonthBucket` 타입에 포함하지 않아 집계가 전혀 이루어지지 않습니다. 반환 객체는 항상 `trainingMape: 0`으로 하드코딩되어 있습니다. 결과적으로 `RegionalPriceChart.tsx`의 "평균 오차 약 X%" 배지가 항상 빈 문자열이 되고, `page.tsx`에서 API에 전달하는 `mape=0`도 AI 해설 품질 지표로서 의미가 없어집니다.

**수정 방법:**
```typescript
type MonthBucket = { means: number[]; lowers: number[]; uppers: number[]; mapes: number[] }
// 집계 시:
b.mapes.push(row.training_mape)
// 반환 시:
trainingMape: b.mapes.length > 0
  ? b.mapes.reduce((s, v) => s + v, 0) / b.mapes.length
  : 0,
```

---

### WR-05: `doubleExp` 그리드 탐색에서 최소 데이터(n=6)일 때 훈련 데이터가 3개뿐

**파일:** `src/lib/prediction/engine.ts:139-140`

**이슈:**
`doubleExp`에서 `n=6`일 때 `holdout = Math.min(6, Math.floor(6/2)) = 3`, `trainEnd = 3`입니다. 3개 데이터로 이중지수평활 그리드 탐색을 수행하면 초기화가 `L = prices[0]`, `T = prices[1] - prices[0]`이고 반복이 2회뿐입니다. 25개 alpha/beta 조합 중 어떤 조합도 의미 있는 차이를 보이지 않아 그리드 탐색이 실질적으로 무효합니다. 더 큰 문제는 이 경우 `linearForecast`가 더 적합함에도 불구하고 경계값(n=12일 때) `doubleExp`가 선택된다는 것입니다.

**수정 방법:**
`computeMape` 내에서 `doubleExp`를 호출할 때 최소 학습 데이터 검사를 추가하거나, `doubleExp`의 `holdout` 계산을 `Math.min(6, Math.floor(n / 3))`으로 조정합니다.

---

### WR-06: SVG `gradId`에 비ASCII 한국어 문자 포함 — 그라디언트 렌더링 실패 가능

**파일:** `src/components/invest/RegionalPriceChart.tsx:56`

**이슈:**
```typescript
const gradId = `priceGrad-${title.replace(/\s/g, '')}`
```
`title`은 `"창원의창구59㎡아파트매매시세흐름(최근24개월)"` 같은 한국어 문자열입니다. SVG 1.1 스펙에 따르면 `id` 속성에는 ASCII 문자, 숫자, `-`, `_`만 허용됩니다. 한국어 문자가 포함된 SVG ID는 일부 브라우저(Safari, 구형 Chrome)에서 `url(#gradId)`로 참조하는 그라디언트가 렌더링되지 않을 수 있습니다. 또한 `()`와 `㎡` 기호가 URI fragment 파싱을 깨뜨릴 수 있습니다.

**수정 방법:**
```typescript
// 한국어/특수문자를 제거하고 ASCII + 숫자만 남기기
const gradId = `priceGrad-${title.replace(/[^\w-]/g, '').slice(0, 40) || 'default'}`
// 또는 해시 기반 ID:
const gradId = `priceGrad-${Math.abs(title.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0))}`
```

---

## INFO

### IN-01: API 라우트 내 allowlist 상수가 `invest.ts`의 exported 상수와 중복 정의

**파일:** `src/app/api/invest/prediction-commentary/route.ts:15-16`

**이슈:**
`ALLOWED_SGG`와 `ALLOWED_AREA`가 라우트 파일 내에 인라인 배열로 선언되어 있으나, `src/lib/data/invest.ts`에 이미 `ALLOWED_SGG_CODES`와 `ALLOWED_AREA_BUCKETS`가 export되어 있습니다. DRY 원칙 위반으로, 향후 지역 코드 추가 시 두 파일을 모두 수정해야 합니다.

**수정 방법:**
```typescript
import { ALLOWED_SGG_CODES, ALLOWED_AREA_BUCKETS } from '@/lib/data/invest'
// '' 허용을 위해 확장
if (sggCode !== '' && !(ALLOWED_SGG_CODES as ReadonlyArray<string>).includes(sggCode))
  return Response.json({ commentary: null }, { status: 400 })
```

---

### IN-02: `compute-predictions.ts`의 `skipped` 카운터가 bucket 단위로 집계되어 집계 의미 불명확

**파일:** `scripts/compute-predictions.ts:206-207`

**이슈:**
`skipped++`는 4개 bucket 중 하나라도 skip되면 각각 증가하여 최대 4×단지수가 됩니다. 반면 `processed++`는 단지 단위로 1회만 증가합니다. 따라서 최종 요약 로그 `processed + skipped`가 `total`과 일치하지 않아 진행 상황 파악이 혼란스럽습니다.

**수정 방법:**
로그 출력 시 단위를 명확히 하거나 카운터를 단지/bucket 레벨로 분리합니다:
```
[INFO] 완료 — 단지 ${processed}/${total}개 처리, bucket ${skipped}개 스킵(데이터 부족), ${errors.length}개 에러
```

---

### IN-03: `RegionalPriceChartWrapper.tsx`가 'use client' 선언 후 동적 로드 — 이중 클라이언트 경계 불필요

**파일:** `src/components/invest/RegionalPriceChartWrapper.tsx:1`

**이슈:**
`RegionalPriceChartWrapper`는 `'use client'`로 선언되어 있고 내부에서 `dynamic(..., { ssr: false })`를 사용합니다. `dynamic` import가 이미 SSR을 비활성화하므로 Wrapper 자체에 `'use client'`는 중복입니다. Recharts를 사용하는 `RegionalPriceChart.tsx`의 `'use client'`만으로 충분합니다.

**수정 방법:**
`RegionalPriceChartWrapper.tsx`는 서버 컴포넌트로 유지하고 `'use client'` 선언을 제거합니다. `dynamic` import 시 Next.js가 클라이언트 경계를 자동으로 설정합니다.

---

## 검토 체크리스트

| 항목 | 결과 |
|------|------|
| Haiku 프롬프트 가격 숫자 금지 | 프롬프트 규칙 존재하나 **출력 검증 없음 (CR-01)** |
| `sgg_code`/`area_type` allowlist 검증 | 완료 |
| `cancel_date IS NULL AND superseded_by IS NULL` | SQL 함수, 직접 쿼리 모두 포함 |
| D-07 graceful degradation (데이터 없을 때 예측 라인 미표시) | 완료 (`hasPrediction` 플래그로 조건 렌더링) |
| 법적 면책 문구 ("AI 예측은 참고용이며 투자 판단의 근거로 사용 불가") | 완료 (`page.tsx:292`) |
| GitHub Actions 시크릿 미로깅 | 완료 (SERVICE_KEY 직접 출력 없음) |
| PostgREST 행 한도 처리 | **누락 (CR-02)** |
| 예측 월 NaN 전파 방어 | **누락 (CR-03)** |

---

_검토일: 2026-05-29_
_검토자: Claude (gsd-code-reviewer)_
_깊이: standard_
