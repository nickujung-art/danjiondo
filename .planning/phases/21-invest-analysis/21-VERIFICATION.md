---
phase: 21-invest-analysis
verified: 2026-05-29T12:30:00+09:00
status: passed
score: 19/19 must-haves verified
overrides_applied: 0
gaps: []
human_verification:
  - test: "/gap-analysis → /invest 301 redirect 실제 HTTP 응답 확인"
    expected: "HTTP 301 응답 + Location: /invest"
    why_human: "next.config.ts에 permanent:true 설정됨. 실제 서버 기동 없이 HTTP 응답 코드 검증 불가."
  - test: "/invest 페이지 시세 차트 실제 렌더링 확인 (Recharts AreaChart)"
    expected: "지역별 시세 데이터가 차트 영역으로 표시되고, 상승=초록/하락=빨강 영역 채우기가 적용됨"
    why_human: "데이터는 DB에서 가져오므로 로컬 Supabase 미실행 상태에서 차트 렌더링을 자동 검증 불가."
  - test: "단지 상세 페이지 시세 흐름 섹션 위치 확인"
    expected: "GapAnalysisCard 바로 아래에 '시세 흐름' 카드가 렌더됨 (실제 단지 데이터 존재 시)"
    why_human: "areaTypes.length > 0 OR priceHistory.length > 0 조건부 렌더라서 데이터 없으면 안 보임 — 실제 데이터가 있는 단지에서 확인 필요."
---

# Phase 21: 투자 분석 통합 페이지 검증 보고서

**Phase Goal:** 투자 분석 통합 페이지 (/invest) — 지역별 시세 흐름 차트 + 갭투자 위험도 랭킹 통합. 단지 상세 페이지에도 시세 흐름 차트 추가. /gap-analysis → /invest 301 redirect.
**Verified:** 2026-05-29T12:30:00+09:00
**Status:** passed (human verification items 포함)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 기반)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | /invest 페이지에 지역+타입 필터 탭 + Recharts AreaChart 시세 차트가 렌더된다 | VERIFIED | `src/app/invest/page.tsx` 존재. REGION_OPTIONS(7개), AREA_OPTIONS(3개 고정) 탭, `RegionalPriceChartWrapper` 렌더 확인. |
| 2 | /invest 하단 갭투자 랭킹 테이블이 표시되고 단지 클릭 시 /complexes/[id]로 이동한다 | VERIFIED | `getGapRankings` 호출 + `<Link href={\`/complexes/${row.complexId}\`}>` 패턴 확인 (L358~361). |
| 3 | /gap-analysis 접근 시 /invest로 301 redirect된다 | VERIFIED | `next.config.ts`에 `permanent: true` redirect 2개 (plain + :path* 패턴). npm run build에서 /gap-analysis 353B redirect 번들 확인됨. |
| 4 | 단지 상세 페이지에 시세 흐름 차트 섹션이 GapAnalysisCard 아래 존재한다 | VERIFIED | `complexes/[id]/page.tsx` L716 `<GapAnalysisCard>`, L718~763 시세 흐름 섹션 코드 확인. `ComplexPriceChartWrapper` 렌더 포함. |
| 5 | 법적 면책 문구가 두 페이지 모두 존재한다 | VERIFIED | `/invest/page.tsx` L238 "투자 결정에 직접 활용하지 마세요"; `complexes/[id]/page.tsx` L760 동일 문구 확인. |
| 6 | npm run lint && npm run build 통과 | VERIFIED | `npm run lint` → "No ESLint warnings or errors"; `npm run build` → exit 0. /invest 1.69kB 빌드 번들 확인. |

**Score:** 6/6 ROADMAP 성공 기준 VERIFIED

### Must-Haves 세부 검증 (PLAN 프런트매터 기반)

#### 21-00: DB 마이그레이션 + Redirect

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | invest_regional_price_history RPC가 sgg_code + area_bucket + months 파라미터를 받아 연도-월별 평균 매매가를 반환한다 | VERIFIED | `20260529000001_invest_price_history.sql` L51-84. 파라미터 3개 정의, RETURNS TABLE(year_month, avg_price, tx_count), `cancel_date IS NULL AND superseded_by IS NULL` 포함. |
| 2 | invest_price_history RPC가 complex_id + area_bucket + months 파라미터를 받아 연도-월별 평균 매매가를 반환한다 | VERIFIED | 동 SQL L10-44. p_complex_id(uuid) + p_deal_type + p_months + p_area_bucket. GRANT EXECUTE 2개 확인. |
| 3 | /gap-analysis URL 접근 시 /invest로 301 redirect된다 | VERIFIED | `next.config.ts` L12-25. permanent:true 2개 규칙 (plain + :path*). |

#### 21-01: 데이터 레이어 + 차트 컴포넌트

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 4 | getRegionalPriceHistory()가 sgg_code + area_bucket 필터로 지역 시세 배열을 반환한다 | VERIFIED | `invest.ts` L31-49. `rpc('invest_regional_price_history', ...)` 호출. `import 'server-only'` 첫 줄. |
| 5 | getComplexAreaTypes()가 단지의 거래 가능 타입 목록(tx_count >= 3)을 반환한다 | VERIFIED | `invest.ts` L56-103. `cancel_date IS null` + `superseded_by IS null` (L84-85). `(count ?? 0) >= 3` 조건 (L98). 빈 RPC 블록 없음 — `const buckets` 로 직접 시작. |
| 6 | getComplexPriceByType()이 단지+타입별 24개월 시세 배열을 반환한다 | VERIFIED | `invest.ts` L110-129. `rpc('invest_price_history', ...)` 호출. |
| 7 | RegionalPriceChartWrapper는 dynamic(ssr:false)로 RegionalPriceChart(use client)를 래핑한다 | VERIFIED | `RegionalPriceChartWrapper.tsx` L1 `'use client'` (21-03에서 bugfix로 추가됨 — Next.js 15 요구사항), L6-32 dynamic ssr:false. `RegionalPriceChart.tsx` L1 `'use client'`. |
| 8 | ComplexPriceChartWrapper가 dynamic(ssr:false)로 렌더된다 | VERIFIED | `ComplexPriceChartWrapper.tsx` L1 `'use client'`, L6-32 dynamic ssr:false. |
| 9 | 차트 색상이 24개월 첫값 대비 마지막값 기준으로 초록(상승)/빨강(하락)으로 결정된다 | VERIFIED | `RegionalPriceChart.tsx` L41-44 `isRising = last >= first; color = isRising ? '#16a34a' : '#dc2626'`. ComplexPriceChart.tsx 동일 패턴. |

#### 21-02: /invest 통합 페이지

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | /invest 페이지가 존재하고 상단에 지역별 시세 흐름 AreaChart가 표시된다 | VERIFIED | `src/app/invest/page.tsx` 존재. L201-240 시세 흐름 섹션. |
| 11 | 타입 탭(전체\|59㎡\|84㎡)이 URL searchParam area_type으로 동작한다 (D-03/D-09: 정확히 3개 탭) | VERIFIED | L53-57 `AREA_OPTIONS = [{전체}, {59㎡}, {84㎡}]` 3개. L215-223 `AREA_OPTIONS.map` 렌더. `filterTab('area_type', ...)` URL 생성. |
| 12 | 지역 필터 탭(전체\|창원 의창\|...\ 김해)이 URL searchParam sgg_code로 동작한다 | VERIFIED | L39-42 REGION_OPTIONS 7개(전체+6구). L189-198 탭 렌더. |
| 13 | 하단에 갭투자 랭킹 테이블이 표시되고 단지 클릭 시 /complexes/[id]로 이동한다 | VERIFIED | L103-106 Promise.all getGapRankings. L358-361 `/complexes/${row.complexId}` Link. |
| 14 | 법적 면책 문구가 페이지에 존재한다 | VERIFIED | L236-239 "투자 결정에 직접 활용하지 마세요". |
| 15 | ISR revalidate = 3600이 설정되어 있다 | VERIFIED | L11 `export const revalidate = 3600`. |
| 16 | /gap-analysis는 /invest로 301 redirect된다 | VERIFIED | next.config.ts 확인됨 (Truth 3과 동일). |

#### 21-03: 단지 상세 페이지 시세 차트

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 17 | 단지 상세 페이지에 '시세 흐름' 섹션이 GapAnalysisCard 아래 존재한다 | VERIFIED | `complexes/[id]/page.tsx` L716 GapAnalysisCard, L718 시세 흐름 섹션. 순서 코드에서 직접 확인. |
| 18 | ComplexPriceChartWrapper가 타입별 24개월 매매 시세 데이터를 받아 렌더된다 | VERIFIED | L754-757 `<ComplexPriceChartWrapper data={priceHistory} title={...}/>`. L289 getComplexPriceByType 호출. |
| 19 | 기존 revalidate = 86400과 모든 기존 쿼리가 유지된다 | VERIFIED | L40 `export const revalidate = 86400`. L29+L285 getComplexGapStats 보존. |

**Score:** 19/19 must-haves VERIFIED

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260529000001_invest_price_history.sql` | invest_regional_price_history + invest_price_history RPC 2개 | VERIFIED | 84라인, 두 함수 + GRANT 2개 |
| `next.config.ts` | gap-analysis → invest 301 redirect | VERIFIED | permanent:true 2개 규칙 |
| `src/lib/data/invest.ts` | 서버 전용 함수 3종 | VERIFIED | 'server-only' 첫 줄, 3개 함수 export |
| `src/components/invest/RegionalPriceChart.tsx` | Recharts AreaChart (use client) | VERIFIED | 94라인, 'use client', linearGradient |
| `src/components/invest/RegionalPriceChartWrapper.tsx` | dynamic(ssr:false) 래퍼 | VERIFIED | 'use client' + dynamic ssr:false |
| `src/components/invest/ComplexPriceChart.tsx` | Recharts AreaChart (use client) | VERIFIED | 94라인, 'use client', gradId complexPriceGrad- |
| `src/components/invest/ComplexPriceChartWrapper.tsx` | dynamic(ssr:false) 래퍼 | VERIFIED | 'use client' + dynamic ssr:false |
| `src/app/invest/page.tsx` | 투자 분석 통합 RSC 페이지 | VERIFIED | 465라인, RSC, revalidate=3600 |
| `src/app/complexes/[id]/page.tsx` | 단지 상세 시세 차트 섹션 추가 | VERIFIED | 시세 섹션 + ComplexPriceChartWrapper 사용 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `invest.ts` | `invest_regional_price_history` RPC | `supabase.rpc(...)` | WIRED | L38 `rpc('invest_regional_price_history', ...)` |
| `invest.ts` | `invest_price_history` RPC | `supabase.rpc(...)` | WIRED | L117 `rpc('invest_price_history', ...)` |
| `invest.ts` | transactions 테이블 | `.from('transactions').is('cancel_date', null)` | WIRED | L83-85 cancel_date + superseded_by 필터 |
| `invest/page.tsx` | `getRegionalPriceHistory` | `import from @/lib/data/invest` | WIRED | L6 import, L104 호출 |
| `invest/page.tsx` | `getGapRankings` | `import from @/lib/data/gap-analysis` | WIRED | L4 import, L105 호출 |
| `invest/page.tsx` | `RegionalPriceChartWrapper` | props 전달 | WIRED | L8 import, L227 사용 |
| `complexes/[id]/page.tsx` | `getComplexAreaTypes` | `import from @/lib/data/invest` | WIRED | L32 import, L287 호출 |
| `complexes/[id]/page.tsx` | `getComplexPriceByType` | `import from @/lib/data/invest` | WIRED | L32 import, L289 호출 |
| `complexes/[id]/page.tsx` | `ComplexPriceChartWrapper` | props 전달 | WIRED | L34 import, L754 사용 |
| SQL functions | `transactions` | `cancel_date IS NULL AND superseded_by IS NULL` | WIRED | 두 RPC 함수 모두 L28-29, L67-68 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `RegionalPriceChart.tsx` | `data: RegionalPricePoint[]` | `invest_regional_price_history` RPC (DB 집계) | Yes — transactions GROUP BY deal_date | FLOWING |
| `ComplexPriceChart.tsx` | `data: RegionalPricePoint[]` | `invest_price_history` RPC (DB 집계) | Yes — transactions GROUP BY deal_date | FLOWING |
| `/invest/page.tsx` | `rows: GapRankingRow[]` | `getGapRankings` → complex_gap_stats 테이블 | Yes — Phase 20에서 구축됨 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm run build 성공 | `npm run build` | exit 0, /invest 1.69kB | PASS |
| npm run lint 통과 | `npm run lint` | "No ESLint warnings or errors" | PASS |
| SQL 취소 필터 (두 함수) | grep cancel_date SQL | L28-29, L67-68 — 두 함수 모두 존재 | PASS |
| RSC에 'use client' 없음 | grep 'use client' page.tsx | 투 페이지 모두 없음 | PASS |
| AREA_OPTIONS 정확히 3개 | 코드 직접 확인 | 전체\|59㎡\|84㎡ 3개 고정 | PASS |
| formatPrice 로컬 복사 없음 | grep "function formatPrice" invest/page.tsx | 없음 (import만 존재) | PASS |
| AI 슬롭 없음 | grep backdrop-blur\|glow\|indigo src/components/invest/ | 없음 | PASS |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|---------|
| INVEST-01 | ROADMAP | invest_regional_price_history RPC — sgg_code+area_bucket+months | SATISFIED | SQL 마이그레이션 + invest.ts getRegionalPriceHistory |
| INVEST-02 | ROADMAP | invest_price_history RPC — 단지별 24개월 시세 집계 | SATISFIED | SQL 마이그레이션 + invest.ts getComplexPriceByType |
| INVEST-03 | ROADMAP | /invest 통합 페이지 — 상단 AreaChart + 하단 갭투자 랭킹 | SATISFIED | src/app/invest/page.tsx |
| INVEST-04 | ROADMAP | /complexes/[id] 시세 차트 섹션 + /gap-analysis redirect | SATISFIED | complexes/[id]/page.tsx 수정 + next.config.ts |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `complexes/[id]/page.tsx` | 197-203 | `function formatPrice` 로컬 정의 | INFO | 이 함수는 신규 추가가 아니라 기존부터 존재하던 것. `/invest/page.tsx`와 달리 단지 상세 페이지는 @/lib/format.ts를 import하지 않고 로컬 복사를 유지함. PLAN에서는 단지 상세 페이지의 로컬 formatPrice 삭제를 요구하지 않았으므로 BLOCKER 아님. |

**주석:** `complexes/[id]/page.tsx`의 로컬 `formatPrice` (L197-203)는 Phase 21 이전부터 존재한 기존 코드이며, 이번 Phase에서 추가된 시세 차트 섹션은 이 함수를 사용하지 않는다 (차트 컴포넌트는 내부 `fmtPrice` 사용). Phase 21 PLAN은 이 파일의 기존 로컬 formatPrice 교체를 요구하지 않았으므로 범위 밖 사항이다.

### Human Verification Required

#### 1. /gap-analysis → /invest 301 Redirect HTTP 응답 확인

**Test:** 로컬 또는 스테이징 서버에서 `curl -I http://localhost:3000/gap-analysis` 실행
**Expected:** HTTP/1.1 301 Moved Permanently + Location: /invest 헤더
**Why human:** next.config.ts에 `permanent: true` 설정이 코드로 확인됨. 실제 HTTP 응답 코드는 서버 기동 후에만 검증 가능. 빌드 출력에서 /gap-analysis 353B redirect 번들이 확인되어 코드 레벨 VERIFIED 상태.

#### 2. /invest 페이지 시세 차트 실제 렌더링

**Test:** 스테이징/프로덕션 URL에서 `/invest` 접근 후 시세 차트 영역 확인
**Expected:** 지역 필터 탭(7개) + 타입 탭(3개) 동작, Recharts AreaChart 차트가 렌더, DB 데이터 유무에 따라 차트 또는 "데이터 부족" 메시지 표시
**Why human:** Recharts는 `dynamic(ssr:false)` + 'use client'로 클라이언트에서만 렌더됨. 자동 검증 불가.

#### 3. 단지 상세 페이지 시세 흐름 섹션 위치/조건부 렌더 확인

**Test:** 실거래 데이터가 있는 단지의 상세 페이지(`/complexes/[id]`) 접근
**Expected:** GapAnalysisCard 카드 바로 아래에 "시세 흐름" 제목의 카드 섹션 표시, 타입 탭(데이터 있는 타입만), ComplexPriceChartWrapper 차트 또는 "데이터 부족" 메시지
**Why human:** `(areaTypes.length > 0 || priceHistory.length > 0)` 조건부 렌더 — 실제 DB 데이터 있는 단지에서만 섹션이 보임. 로컬 Supabase 미실행 환경에서 자동 검증 불가.

### CLAUDE.md Critical Rules 준수 검증

| Rule | Status | Evidence |
|------|--------|---------|
| 거래 데이터: `cancel_date IS NULL AND superseded_by IS NULL` | VERIFIED | SQL L28-29, L67-68; invest.ts L84-85 |
| Supabase 쿼리는 서버 컴포넌트에서만 | VERIFIED | invest.ts `import 'server-only'`; 두 page.tsx RSC에서만 supabase 사용 |
| complexes 테이블이 단일 진실 (Golden Record) | N/A | 이 Phase는 단지 신규 등록 없음 |
| 광고 조건 (status='approved' + 기간) | N/A | 이 Phase는 광고 쿼리 없음 |
| AI 슬롭 금지 (backdrop-blur, gradient-text, glow, 보라/인디고) | VERIFIED | grep 결과 없음 |

### Gaps Summary

갭 없음. 모든 19개 must-have가 VERIFIED 상태.

21-03 SUMMARY에서 언급된 한 가지 주목할 편차: `ComplexPriceChartWrapper`와 `RegionalPriceChartWrapper`에 `'use client'`가 추가됨 (원래 PLAN에서는 서버 컴포넌트로 설계). 이는 Next.js 15에서 `ssr: false` dynamic()은 클라이언트 컴포넌트에서만 사용 가능하다는 프레임워크 제약으로 인한 필수 버그픽스이며, RSC 페이지들(invest/page.tsx, complexes/[id]/page.tsx)은 여전히 `'use client'` 없이 RSC를 유지한다. 올바른 접근임.

---

_Verified: 2026-05-29T12:30:00+09:00_
_Verifier: Claude (gsd-verifier)_
