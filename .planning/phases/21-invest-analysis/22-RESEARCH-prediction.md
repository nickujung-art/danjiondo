# Phase 22 Pre-Research: AI/ML Price Prediction Engine — Korean Apartment Forecasting

**Researched:** 2026-05-29
**Domain:** Time-series forecasting / ML inference on Vercel serverless + Supabase Postgres
**Confidence:** MEDIUM (options 1-4 verified via official docs/npm; options 5-7 partially inferred)

---

## Context Note

Phase 21 (invest-analysis) has explicitly deferred AI price prediction (D-07: 미래 흐름선 없음).
This document is forward-looking research for a **future Phase 22** that may implement price prediction as an
optional AI-powered layer on top of the Phase 21 실거래 흐름 charts.

The Phase 21 CONTEXT.md states:
> "AI 가격 예측선 (법적 리스크 + 데이터 신뢰도 문제로 장기 보류)"

Any implementation of this research must re-evaluate legal/compliance constraints before proceeding.

---

## Summary

Seven approaches were evaluated for predicting Korean apartment prices 6 months ahead, given:
- Monthly aggregated data per complex per area bucket (소형/59/84/대형)
- 10–300 data points per series (very sparse at the low end)
- Vercel Hobby serverless: 2 GB RAM, 300 s max duration (Fluid Compute), 250 MB bundle cap
- No Python backend; TypeScript-only stack
- Existing APIs: Claude (`@anthropic-ai/sdk`), Gemini (`@google/generative-ai`), Supabase

**Primary recommendation:** Combine **(A) pre-computed statistical forecasts** stored in Supabase
(Holt-Winters / ARIMA via a GitHub Actions batch job) with **(B) LLM narrative layer** using Claude
Haiku to generate a one-sentence plain-language summary of the trend. This approach:
- Runs zero heavy ML in Vercel serverless
- Works with sparse data (≥ 12 points)
- Costs < $1/month at current scale
- Looks intelligent to users without being technically misleading

A secondary option — **TimeGPT REST API** — is viable once data density improves and budget allows
a paid tier (~$50/month).

---

## Verified Constraints: Vercel Hobby (2026-05-14 docs) [VERIFIED: vercel.com/docs/functions/limitations]

| Constraint | Value |
|---|---|
| Max memory | 2 GB / 1 vCPU (not configurable on Hobby) |
| Max duration (Fluid Compute) | 300 s |
| Bundle size (gzip) | 250 MB |
| Request body | 4.5 MB |
| Free tier | Yes — included on Hobby within limits |

Note: The question prompt stated "10s timeout" — this is outdated. With Fluid Compute (enabled by
default in Next.js on Vercel), Hobby functions can run up to 300 seconds. [VERIFIED: vercel.com/docs/functions/limitations]

---

## Option 1: Meta Prophet (Facebook/Meta)

### What it is
Prophet is an additive decomposition model (trend + seasonality + holidays) built originally in
Stan (R/Python). It handles missing data well and is designed for business time series.

### JavaScript/Node.js availability
- **Official Python/R only.** No official JavaScript or WASM build exists. [VERIFIED: facebook.github.io/prophet]
- `prophet-js` on npm (v0.1.1, last published 2021) — NOT a Prophet port; it is a different
  lightweight exponential smoothing package with a confusing name. [VERIFIED: npm registry]
- No active WASM compilation of the Stan backend exists in 2025. Compiling Prophet's Stan model
  to WASM requires the full LLVM toolchain and produces a binary far exceeding Vercel's 250 MB
  bundle limit.

### Vercel feasibility
**BLOCKED.** No JavaScript runtime exists. Python functions on Vercel Hobby are theoretically
possible (`runtime: python3.12`) but: (a) bundling `prophet` with `pystan` exceeds 500 MB; (b)
cold start would be ~30 s; (c) management complexity is high for a solo TypeScript project.

### Data requirements
Officially recommends ≥ 2 years (24 data points) of monthly data for reliable seasonality detection.
Sparse series (10-20 points) produce unreliable seasonal components. [CITED: facebook.github.io/prophet]

### Verdict
| Factor | Assessment |
|---|---|
| Vercel runtime | BLOCKED — Python only, bundle too large |
| Sparse data (10-20 pts) | Poor — unreliable seasonality |
| Implementation complexity | HIGH — requires Python infra |
| Cost | Free (self-hosted), but infra cost not zero |
| AI feel | HIGH — well-known brand |
| **Overall** | **NOT RECOMMENDED** |

---

## Option 2: Nixtla TimeGPT

### What it is
TimeGPT-1 is a transformer-based foundation model pre-trained on 100B+ real-world time series data
points. It performs zero-shot forecasting — no per-series training required. Hosted as a REST API
at `https://api.nixtla.io`. [VERIFIED: nixtla.io/docs/openapi.json]

### REST API (TypeScript callable)
TimeGPT exposes a REST API directly callable via `fetch()` — no Python SDK required. [VERIFIED: nixtla.io/docs/openapi.json]

```typescript
// POST https://api.nixtla.io/forecast
// Header: Authorization: Bearer <NIXTLA_API_KEY>
// Body:
{
  "y": { "2023-01": 45000, "2023-02": 46200, ... },  // date → price (만원)
  "fh": 6,          // forecast horizon (6 months)
  "freq": "MS",     // monthly start
  "model": "timegpt-1",
  "level": [80, 90] // confidence intervals
}
```

Response includes point forecasts + confidence intervals per period. [CITED: nixtla.io/docs/openapi.json /forecast endpoint]

### Pricing
- **Free tier**: 30-day trial. [CITED: nixtla.io]
- **Paid**: Enterprise pricing only — no public pay-as-you-go page found. Community reviews
  describe it as "expensive for smaller companies." [ASSUMED — exact pricing not disclosed publicly]
- Alternative: Azure AI deployment via Nixtla (pay-per-token, but minimum $100/month commitment
  likely). [ASSUMED]

### Data requirements
- No officially documented minimum. The model is designed for zero-shot inference.
- In practice, < 12 points for monthly series produces low-confidence intervals. [ASSUMED based
  on general foundation model behavior — not stated in Nixtla docs]

### Vercel feasibility
**VIABLE as thin API proxy.** A Vercel API Route calls `api.nixtla.io/forecast` via `fetch()`.
Network latency: ~200-500 ms per request. No heavy compute on Vercel side. Works within 300 s limit.

### Prediction quality
TimeGPT performs well on standard benchmarks (M3, M4). No published study specifically on Korean
regional apartment data exists. Foundation model training data likely includes some real estate
indices but probably not 창원/김해 granular data. [ASSUMED]

### "AI feel"
HIGH — foundation model narrative, confidence intervals, well-branded.

### Verdict
| Factor | Assessment |
|---|---|
| Vercel runtime | VIABLE — thin proxy pattern |
| Sparse data (10-20 pts) | MODERATE — no hard minimum, but quality degrades |
| Implementation complexity | LOW — REST fetch wrapper |
| Cost | UNKNOWN after trial; likely $50-200/month for startup |
| AI feel | HIGH |
| **Overall** | **VIABLE BUT EXPENSIVE — use for pilot/demo only** |

---

## Option 3: Google TimesFM / Vertex AI Forecast

### Google TimesFM
- Open-source decoder-only transformer, 200M parameters, pre-trained on 400B+ time points.
  [VERIFIED: github.com/google-research/timesfm]
- Available as: BigQuery ML (`AI.FORECAST`), AlloyDB, Vertex AI endpoint, or self-hosted Python.
- **No REST API endpoint** separate from Google Cloud services. Not directly callable via `fetch()`
  without wrapping in a Cloud Run or Vertex endpoint. [VERIFIED: cloud.google.com/bigquery/docs/timesfm-model]
- TimesFM 2.5 (Sept 2025) uses only 200M params, top of leaderboard. [CITED: google-research/timesfm README]

### BigQuery ML integration
Could call `AI.FORECAST` via Supabase's `postgres_fdw` or a Supabase Edge Function to BigQuery API.
But: (a) BigQuery is a separate GCP billing account; (b) adds operational complexity; (c) latency
~2-5 s for a forecast query.

### Vertex AI AutoML Forecast
Fully managed, no training code needed, but:
- Training cost: $1.79/hour, minimum ~2 hours = $3.58 per model.
- Prediction: $0.20 per 1,000 data points (first 1M). [VERIFIED: cloud.google.com/vertex-ai/pricing via web search]
- 2,000 complexes × 4 types × 6 months horizon = 48,000 points/run → $9.60/run.
- Training must be re-run periodically; not zero-shot.
- Requires GCP account, IAM, service accounts — high operational overhead.

### Verdict
| Factor | Assessment |
|---|---|
| Vercel runtime | VIABLE but indirect (BigQuery/Vertex API call) |
| Sparse data (10-20 pts) | POOR for Vertex AutoML (needs 1000+ per series); UNKNOWN for TimesFM |
| Implementation complexity | HIGH — GCP infra, IAM, billing account |
| Cost | ~$10-50/batch run for Vertex; BigQuery ML monthly ~$5-20 |
| AI feel | HIGH — Google brand |
| **Overall** | **NOT RECOMMENDED for startup phase** |

---

## Option 4: AWS Forecast

### Status
**DEPRECATED.** AWS closed new customer access to Amazon Forecast effective July 29, 2024.
Existing customers can continue but AWS will not introduce new features. Recommended migration
target is Amazon SageMaker Canvas. [VERIFIED: aws.amazon.com/blogs/machine-learning/transition-your-amazon-forecast-usage via web search]

### Verdict: **ELIMINATED — service deprecated, no new signups.**

---

## Option 5: Nixtla statsforecast (Python library)

### What it is
`statsforecast` (Python) provides ARIMA, ETS, Theta, and other classical models optimized for
batch forecasting. It is the fastest Python statistical forecasting library. [CITED: github.com/Nixtla/statsforecast]

### JavaScript/WASM availability
**None.** No npm package exists. No WASM port exists. No web API wrapper provided by Nixtla.
npm search for "statsforecast" returns zero results. [VERIFIED: npm registry search]

The library could be wrapped in a GitHub Actions Python step that writes results to Supabase.
This is the **pre-compute batch pattern** described in the recommendation.

### Verdict
| Factor | Assessment |
|---|---|
| Vercel runtime | N/A — Python batch job only |
| Pattern | Pre-compute → store in Supabase → serve statically |
| Sparse data | GOOD — ARIMA/ETS handle 12+ points; Theta works with ≥ 10 |
| Implementation complexity | MEDIUM — Python script in GitHub Actions |
| Cost | Free (self-hosted) |
| **Overall** | **RECOMMENDED for batch pre-compute layer** |

---

## Option 6: Pure Statistical TypeScript (Hand-rolled)

### What is feasible in TypeScript without external services

The following algorithms can be implemented cleanly in < 200 lines of TypeScript:

#### A. Holt-Winters Triple Exponential Smoothing (Seasonal)
- Handles trend + seasonality explicitly.
- Works with ≥ 12 data points (one full seasonal cycle).
- For monthly Korean real estate: use period = 12 (annual seasonality).
- Parameters α (level), β (trend), γ (season) can be auto-optimized via grid search over RMSE.
- **Library option**: `zodiac-ts` (pure JS, implements Holt-Winters), `ssci` (JS, Holt-Winters).
  Both are lightly maintained but functionally correct for this use case. [CITED: github.com/antoinevastel/zodiac-ts]

#### B. Linear Regression with Seasonal Dummies
- Decompose price = β₀ + β₁×t + Σ βₘ×month_dummy + ε
- Extrapolate the trend 6 months forward.
- Works with as few as 18 data points (12 months + 6 months trend estimation).
- `ml-regression` npm package (v6.3.0, 30 KB, MIT) provides polynomial/linear regression. [VERIFIED: npm registry]
- `regression` npm package (v2.0.1, no dependencies) — simpler, sufficient for linear fit. [VERIFIED: npm registry]

#### C. Simple Moving Average + Trend Extrapolation
- 12-month trailing average + linear extrapolation.
- Works with ≥ 6 data points.
- Extremely simple, lowest "AI feel."

#### Seasonal decomposition notes
Korean apartment transactions show:
- Winter slow season: Nov–Feb (fewer transactions → higher price variance per point).
- Spring active season: Mar–Apr (price discovery).
- Autumn: Sep–Oct slightly active post-Chuseok.
- Data is already monthly so daily/weekly noise is smoothed. [ASSUMED — based on general Korean real estate knowledge; no peer-reviewed source confirmed in this session]

#### Vercel feasibility
All pure TypeScript — runs entirely in Vercel serverless with < 1 MB overhead. `ml-regression`
is 30 KB. Computation for 300 data points: < 5 ms. [VERIFIED: npm registry unpackedSize]

#### Implementation pattern (on-demand)
```typescript
// src/lib/prediction/holt-winters.ts
export function holtwinters(
  data: number[],          // monthly prices, ascending
  alpha: number,           // level smoothing
  beta: number,            // trend smoothing
  gamma: number,           // seasonal smoothing
  period: number,          // 12 for monthly
  horizon: number          // 6 months ahead
): { point: number[]; lower: number[]; upper: number[] }
```

Auto-optimize α, β, γ by minimizing one-step-ahead RMSE on the training window using a 5×5×5
grid search (125 iterations × 300 data points = 37,500 ops — completes in < 10 ms). [ASSUMED for TypeScript runtime performance — not benchmarked]

#### Sparse series handling (< 12 points)
When `data.length < 12`, fall back to linear regression only (no seasonal component).
When `data.length < 6`, return null (prediction not available).

### "AI feel"
LOW-MEDIUM. Can be elevated by:
- Showing confidence band (±σ of last 12 months of residuals).
- Using language like "모델 예측 참고선" rather than "예측."
- Displaying MAPE on training data as a trust indicator.

### Verdict
| Factor | Assessment |
|---|---|
| Vercel runtime | EXCELLENT — pure TS, < 1 MB |
| Sparse data | GOOD — falls back gracefully to linear |
| Implementation complexity | MEDIUM — 200-300 lines TypeScript |
| Cost | $0 |
| AI feel | MEDIUM (with confidence band + MAPE display) |
| **Overall** | **HIGHLY RECOMMENDED as primary on-demand engine** |

---

## Option 7: LLM-Based Prediction (Claude/Gemini)

### Feasibility
Both `@anthropic-ai/sdk` and `@google/generative-ai` are already in the project. [VERIFIED: package.json]

### Pattern A: LLM as direct forecaster
Feed historical prices as structured JSON, ask for 6-month point forecast.

**Example prompt:**
```
다음은 창원 의창구 XX아파트 84㎡ 월별 평균 매매가(만원)입니다:
2024-01: 45000, 2024-02: 44800, ..., 2025-12: 48200

향후 6개월(2026-01 ~ 2026-06) 예측 평균가를 JSON으로 응답해주세요:
{"forecasts": [{"month": "2026-01", "price": ...}, ...], "confidence": "low|medium|high", "reasoning": "..."}
```

**Known limitations:**
- LLMs do not perform numerical extrapolation reliably. Research shows GPT-4o and Gemini 1.5 Pro
  produce "frequent hallucinations such as fabricated and malformed price sequences" in electricity
  price forecasting tasks. [CITED: arxiv.org/pdf/2506.11050 via web search result]
- MAPE for LLM-only approaches on real financial time series typically ≥ 20%. [CITED: arize.com/blog-course/large-language-model-performance-in-time-series-analysis via web search]
- LLMs have no Korean regional real estate market data at the 창원/김해 단지 level.
- Claude Haiku: $1.00/M input + $5.00/M output. A 12-month history prompt ≈ 500 tokens.
  1,000 daily unique users → 1,000 requests × 500 tokens = 500K tokens = $0.50/day. Acceptable.
  [VERIFIED: platform.claude.com/docs/en/about-claude/pricing via web search]

**Verdict for direct forecasting: NOT RECOMMENDED.** Hallucination risk is too high for a service
showing users specific price numbers that could influence investment decisions.

### Pattern B: LLM as narrative summarizer (RECOMMENDED)
Use statistical forecast (Option 6) for numbers; use LLM only to generate a plain-language
trend summary.

```typescript
// Statistical model produces:  { point: [48500, 49200, 49000, ...], trend: 'up', mape: 0.07 }
// LLM prompt:
const prompt = `
2년 실거래 데이터 분석 결과: 최근 추세 ${trend}, 평균 오차율 ${(mape*100).toFixed(0)}%.
6개월 예측 범위: ${min}만원 ~ ${max}만원.
한국어로 2문장 이내 자연스러운 시장 해설을 작성해주세요. 투자 조언은 포함하지 마세요.
`
```

- Latency: ~500ms (Claude Haiku).
- Cost: ~$0.001 per request (300-500 tokens total).
- Risk: LLM embellishes or adds directional commentary → mitigated by tight system prompt.

### Verdict
| Factor | Assessment |
|---|---|
| Direct forecasting | NOT RECOMMENDED — hallucination risk |
| Narrative summary | RECOMMENDED as complement to statistical forecast |
| Cost | $0.001/request (Haiku) |
| Legal risk | LOW for narrative; HIGH for LLM-generated numbers presented as prediction |

---

## Option 8: TensorFlow.js (LSTM/GRU)

### Bundle size problem
`@tensorflow/tfjs`: 147 MB unpacked [VERIFIED: npm registry]. This is 59% of Vercel's 250 MB
function bundle limit — leaves almost no room for application code.

`@tensorflow/tfjs-node`: 2 GB unpacked [VERIFIED: npm registry]. **Completely infeasible** for
Vercel deployment.

### Training requirements
LSTM typically requires 500+ sequences for reliable weight convergence. Monthly data with 10-300
points per series is far below this threshold. Transfer learning or pre-trained weights would
be required, but no Korean real estate pre-trained LSTM model exists publicly. [ASSUMED]

### Inference-only (pre-trained model)
Loading a SavedModel on Vercel serverless: possible but cold start would be 5-15 s due to WASM
initialization. Vercel Edge Runtime limits memory to 128 MB — TF.js WASM backend alone uses ~80 MB. [ASSUMED for Edge; not officially documented]

### Verdict
| Factor | Assessment |
|---|---|
| Vercel runtime | POOR — 147 MB bundle; cold start ~10s |
| Data requirements | POOR — needs 500+ sequences |
| Implementation complexity | HIGH — training pipeline needed |
| **Overall** | **NOT RECOMMENDED** |

---

## Architecture Patterns

### Pattern A: Pre-Compute Batch (Recommended Primary)

```
GitHub Actions (nightly cron)
  └─ Python script: statsforecast ARIMA/ETS
       ├─ Read transactions from Supabase
       ├─ Compute Holt-Winters forecast per complex per type
       └─ Write to predictions table in Supabase
              ↓
Vercel Next.js RSC
  └─ SELECT * FROM predictions WHERE complex_id=? AND area_bucket=?
       └─ Display chart: historical + forecast dashed line
```

**Predictions table schema:**
```sql
CREATE TABLE complex_price_predictions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  complex_id integer REFERENCES complexes(id),
  area_bucket text CHECK (area_bucket IN ('소형','59','84','대형')),
  predicted_month date,              -- first day of month
  predicted_price_mean integer,      -- 만원
  predicted_price_lower integer,     -- 80% CI lower bound
  predicted_price_upper integer,     -- 80% CI upper bound
  model_name text,                   -- 'holt-winters' | 'arima' | 'linear'
  training_mape real,                -- validation MAPE on last 6 months
  computed_at timestamptz DEFAULT now(),
  UNIQUE (complex_id, area_bucket, predicted_month)
);
```

- Daily batch covers all 2,000+ complexes in ~5 minutes (GitHub Actions free tier).
- Vercel serves predictions as static data — zero compute at request time.
- Users always see fresh predictions (next-day lag acceptable for monthly data).

### Pattern B: On-Demand TypeScript Statistical (Recommended Secondary/Fallback)

```
User views /complex/[id]
  └─ RSC fetches transactions (already needed for chart)
       └─ Server-side: holtwinters(prices, alpha, beta, gamma, 12, 6)
            └─ Returns forecast array
                 └─ Recharts AreaChart: solid line (historical) + dashed line (forecast)
```

- Runs in Vercel serverless at < 5 ms CPU time.
- Fallback for complexes missing from batch predictions (new complexes, sparse data).
- No additional API calls.

### Pattern C: TimeGPT API Proxy (Optional Premium Layer)

```
User requests prediction refresh
  └─ POST /api/predict (Vercel API Route)
       └─ fetch('https://api.nixtla.io/forecast', {
            headers: { Authorization: `Bearer ${NIXTLA_API_KEY}` },
            body: JSON.stringify({ y: priceHistory, fh: 6, freq: 'MS' })
          })
            └─ Store result in complex_price_predictions
```

- Call TimeGPT only when: (a) user explicitly requests "AI 예측 갱신"; (b) last prediction
  is > 7 days old; (c) complex has ≥ 24 data points.
- Rate-limited via `@upstash/ratelimit` (already in project). [VERIFIED: package.json]
- Add to roadmap after free trial validates quality.

---

## Comparative Summary

| Option | Vercel OK | Sparse Data | TS Integration | Monthly Cost | AI Feel | Recommendation |
|---|---|---|---|---|---|---|
| 1. Prophet | NO | Poor | Not possible | — | High | ELIMINATED |
| 2. TimeGPT REST | YES | OK | fetch() | Unknown (~$50+) | High | Pilot/future |
| 3. Google TimesFM / Vertex | YES (indirect) | Poor | Complex | $10-50/run | High | Not now |
| 4. AWS Forecast | DEPRECATED | — | — | — | — | ELIMINATED |
| 5. statsforecast (Python batch) | N/A (GHA) | Good | GitHub Actions | $0 | Medium | RECOMMENDED (batch) |
| 6. Pure TypeScript Statistical | YES | Good (graceful fallback) | Native | $0 | Medium | RECOMMENDED (on-demand) |
| 7. LLM Direct Forecast | YES | N/A | SDK | ~$0.50/day | High | NOT for numbers |
| 7b. LLM Narrative Only | YES | N/A | SDK | $0.001/req | N/A | RECOMMENDED (UX) |
| 8. TensorFlow.js | POOR | Very poor | Possible | $0 | High | ELIMINATED |

---

## Final Recommendation

### Tier 1: Ship Now (Phase 22 MVP)

**Hybrid: TypeScript Holt-Winters + LLM Narrative**

1. Implement `holtwinters()` in TypeScript (≈ 150 lines, zero dependencies).
2. Call on-demand from RSC at `/complex/[id]` view.
3. Render as dashed forecast line on existing Recharts AreaChart.
4. When ≥ 24 data points AND trend signal is clear, call Claude Haiku for a 1-sentence
   Korean trend summary (cached for 24 hours per complex in Supabase).
5. Show MAPE training score as "모델 신뢰도: N%" badge.
6. Sparse series (< 12 points): hide prediction entirely or show "데이터 부족" badge.

**Cost:** $0/month fixed + ~$0-5/month LLM calls (batched with existing Claude usage).
**Risk:** Low — no external dependencies at core. LLM call is additive.

### Tier 2: Add Later (Phase 22+)

**Pre-compute batch via GitHub Actions + Python statsforecast**

When the prediction surface expands to the `/invest` page (showing regional aggregate predictions):
- Add a GitHub Actions workflow: `predict-prices.yml` (Python, weekly cron).
- Uses `nixtla/statsforecast` ETS/ARIMA per series.
- Writes to `complex_price_predictions` table.
- Vercel RSC reads from table — zero serverless compute.

### Tier 3: Future Consideration

**TimeGPT REST API** — if free trial shows MAPE < 15% on holdout data from 창원/김해 complexes,
upgrade to paid tier. Gate behind feature flag. Call only for complexes with ≥ 24 data points.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---|---|---|
| Confidence interval calculation | Custom bootstrap | Use ±1.96×σ of training residuals |
| Parameter optimization for Holt-Winters | Custom optimizer | Grid search α/β/γ ∈ [0.1, 0.9] step 0.1 |
| Python ARIMA in Node.js | JS ARIMA port | statsforecast in GitHub Actions Python |
| LLM hallucination for numbers | Prompt-only forecasting | Statistical numbers + LLM text-only |

---

## Common Pitfalls

### Pitfall 1: Sparse Series Overconfidence
**What goes wrong:** Holt-Winters on 10 data points returns a confident-looking forecast with
tiny confidence bands.
**Why:** Not enough data to estimate γ (seasonal component) — defaults to 0.
**How to avoid:** Gate seasonal prediction on `data.length >= 24`. For 12-23 points: Holt
(double exponential, no seasonality). For 6-11 points: linear only. Under 6: no prediction.

### Pitfall 2: Price-Level Bias in Short Series
**What goes wrong:** A complex built in 2022 with only 18 months of data during a boom phase
gets an upward-biased trend extrapolation.
**How to avoid:** Show training MAPE prominently. Consider anchoring short-series trend to
regional (sgg_code) aggregate trend as a prior.

### Pitfall 3: Displaying Predictions as Facts
**What goes wrong:** Users interpret dashed forecast line as guaranteed future prices, make
financial decisions.
**Prevention:**
- Style forecast as visually distinct (dashed + lighter color + semi-transparent).
- Mandatory disclaimer: "예측 참고선 — 투자 결정에 활용 금지."
- MAPE badge: "평균 오차 약 N%."
- Legal: Phase 21 CONTEXT.md already notes this risk. Consider legal review before Phase 22.

### Pitfall 4: LLM Hallucinated Numbers
**What goes wrong:** Claude is asked to predict a number and confidently states a price that
is statistically implausible.
**Prevention:** Never pass LLM an open-ended "예측해줘" prompt. LLM only receives
**pre-computed statistical outputs** and is asked to describe them in natural language.

### Pitfall 5: Monthly Data Frequency Encoding
**What goes wrong:** TimeGPT or statsforecast receives `"2024-01-15"` (mid-month transaction
date) instead of `"2024-01-01"` (month-start), causing incorrect frequency detection.
**Prevention:** Always normalize `predicted_month` to first day of month before API calls.
Use `freq: "MS"` (month-start) not `"M"` (month-end) in TimeGPT requests.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | TimeGPT paid pricing is ~$50-200/month for startup scale | Option 2 | Could be cheaper (viable sooner) or more expensive (eliminates option) |
| A2 | TimeGPT quality degrades below 12 monthly data points | Option 2 | If works with 6 points, viable for more complexes |
| A3 | Korean apartment seasonality peaks in spring (Mar-Apr) and dips in winter | Option 6 | If wrong, seasonal period = 12 may still be correct but phase shift matters |
| A4 | Grid search over 125 α/β/γ combinations takes < 10 ms in V8 for 300 data points | Option 6 | If slower, use fixed α=0.3/β=0.1/γ=0.2 defaults instead |
| A5 | Korean apartment complex 창원/김해 level data not present in TimeGPT training data | Option 2 | If present, zero-shot accuracy could be better than assumed |
| A6 | TF.js Edge Runtime memory ceiling is ~128 MB | Option 8 | Vercel Edge Runtime memory limit not officially documented per function |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | TypeScript statistical engine | YES | v24.14.0 | — |
| `@anthropic-ai/sdk` | LLM narrative | YES | 0.95.1 | Use Gemini |
| `@google/generative-ai` | LLM fallback | YES | 0.24.1 | Use Claude |
| `@upstash/ratelimit` | TimeGPT rate limiting | YES | 2.0.8 | — |
| Python 3.x (GitHub Actions) | Batch statsforecast | YES (GHA hosted runners) | 3.12 | — |
| NIXTLA_API_KEY | TimeGPT REST | NOT SET | — | Skip TimeGPT, use TypeScript statistical |

---

## Sources

### Primary (HIGH confidence)
- `vercel.com/docs/functions/limitations` (2026-05-14) — memory/timeout limits
- `nixtla.io/docs/openapi.json` — TimeGPT REST API structure, endpoint paths
- `facebook.github.io/prophet` — Prophet Python-only, no JS port
- npm registry: `prophet-js@0.1.1`, `regression@2.0.1`, `ml-regression@6.3.0`,
  `@tensorflow/tfjs@4.22.0` (147.5 MB), `@tensorflow/tfjs-node@4.22.0` (2 GB),
  `timeseries-analysis@1.0.12` (abandoned 2014)

### Secondary (MEDIUM confidence)
- aws.amazon.com/blogs — Amazon Forecast deprecated July 2024
- cloud.google.com/vertex-ai/pricing — Vertex AI $0.20/1K prediction points
- platform.claude.com — Claude Haiku $1.00/M input, $5.00/M output
- arize.com — LLM time series analysis accuracy comparison
- koreascience.kr — Korean real estate ML MAPE studies (Daegu/Seoul data)

### Tertiary (LOW confidence / ASSUMED)
- TimeGPT minimum data point behavior (not officially documented)
- Korean seasonal patterns (Lunar New Year / Chuseok effects on transaction volume)
- TF.js Edge Runtime specific memory ceiling

---

## Metadata

**Confidence breakdown:**
- Vercel constraints: HIGH — verified from official docs 2026-05-14
- TimeGPT API structure: HIGH — verified from OpenAPI spec
- Pricing (TimeGPT): LOW — no public pricing page found
- Korean seasonality patterns: LOW — training knowledge only
- TypeScript statistical implementation feasibility: MEDIUM — standard algorithms, no specific benchmark

**Research date:** 2026-05-29
**Valid until:** ~2026-08-29 (90 days — Vercel limits and npm versions stable; TimeGPT pricing policy may change)
