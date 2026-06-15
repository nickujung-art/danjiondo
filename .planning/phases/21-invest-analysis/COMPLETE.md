# Phase 21 — 투자 분석 통합 페이지 ✅ 완료 (2026-05)

## 구현 내용
- `/invest` 신규 통합 페이지: 지역별 시세 흐름 AreaChart (상승=초록/하락=빨강) + 갭투자 랭킹 테이블
- `/gap-analysis` → `/invest` 301 redirect (next.config.ts, permanent:true)
- 지역 필터 7개(전체+창원 6구+김해), 타입 탭 3개(전체|59㎡|84㎡), ISR revalidate=3600
- 단지 상세 페이지(`/complexes/[id]`)에 GapAnalysisCard 아래 시세 흐름 섹션 추가
- 법적 면책 문구: "투자 결정에 직접 활용하지 마세요" — 두 페이지 모두

## 신규 파일
- `supabase/migrations/20260529000001_invest_price_history.sql` — 2개 RPC (invest_regional_price_history, invest_price_history)
- `src/lib/data/invest.ts` — server-only, 3개 함수 (getRegionalPriceHistory, getComplexAreaTypes, getComplexPriceByType)
- `src/components/invest/RegionalPriceChart.tsx` / `ComplexPriceChart.tsx` — use client, Recharts AreaChart
- `src/components/invest/RegionalPriceChartWrapper.tsx` / `ComplexPriceChartWrapper.tsx` — use client + dynamic(ssr:false)
- `src/app/invest/page.tsx` — RSC, 465줄

## 특이사항 / 유지보수
- Wrapper 컴포넌트에 `'use client'` 필수 (Next.js 15에서 ssr:false dynamic은 클라이언트 컴포넌트에서만 작동)
- `complexes/[id]/page.tsx`의 로컬 `formatPrice` 함수는 Phase 21 이전부터 존재, 제거 대상 아님
- RPC 두 함수 모두 `cancel_date IS NULL AND superseded_by IS NULL` 필터 포함
- getComplexAreaTypes: tx_count >= 3인 타입만 반환
- 검증: 19/19 must-haves PASSED, lint/build 통과
