# Phase 21: 투자 분석 통합 페이지 — Validation

**Source:** 21-RESEARCH.md Validation Architecture section
**Phase:** 21-invest-analysis

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (unit + integration) |
| Config file | vitest.config.ts |
| Quick run | `npm run test` |
| Full suite | `npm run test && npm run build` |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command |
|--------|----------|-----------|---------|
| INVEST-01 | invest_price_history RPC 반환값 올바름 | unit | `npm run test -- invest` |
| INVEST-02 | areaBucket 필터 적용 시 해당 타입만 집계 | unit | `npm run test -- invest` |
| INVEST-03 | getGapRankings sggCode 필터 (기존) | unit (기존) | `npm run test -- gap` |
| INVEST-04 | 법적 면책 문구 DOM 존재 | e2e | Playwright |

---

## Wave 0 Gaps (테스트 파일 필요)

- [ ] `src/lib/data/__tests__/invest.test.ts` — `getRegionalPriceHistory`, `getComplexAreaTypes` 단위 테스트
- [ ] `supabase/migrations/20260529000001_invest_price_history.sql` — 신규 RPC 마이그레이션

---

## Acceptance Check Commands

```bash
# 전체 테스트 수행
npm run test

# invest 관련 유닛 테스트만
npm run test -- invest

# gap-analysis 기존 테스트 (INVEST-03)
npm run test -- gap

# 빌드 성공 확인
npm run build

# Playwright E2E (INVEST-04 — 법적 면책 문구 DOM 존재)
npm run test:e2e
```

---

## Phase 21 Specific Checks

### 21-00: 마이그레이션 + Redirect

```bash
# RPC 함수 정의 확인
grep -c "invest_regional_price_history" supabase/migrations/20260529000001_invest_price_history.sql
# → 3 이상

# cancel_date 필터 두 함수 모두
grep -v "^--" supabase/migrations/20260529000001_invest_price_history.sql | grep -c "cancel_date.*IS NULL"
# → 2

# 면적 컬럼 일관성 (area_m2 또는 exclusive_area — 둘 다 혼용 금지)
grep -c "exclusive_area" supabase/migrations/20260529000001_invest_price_history.sql
# → 0 (area_m2 사용 확정 시)

# redirect 설정
grep -c "gap-analysis" next.config.ts
# → 2
```

### 21-01: 데이터 함수 + 차트 컴포넌트

```bash
# server-only 지시어
grep "server-only" src/lib/data/invest.ts

# getComplexAreaTypes 죽은 RPC 블록 없음
grep -A3 "async function getComplexAreaTypes" src/lib/data/invest.ts
# → 함수 body가 'const buckets'로 시작해야 함

# Wrapper는 'use client' 없음 (RSC)
grep "'use client'" src/components/invest/RegionalPriceChartWrapper.tsx  # → 없음
grep "'use client'" src/components/invest/ComplexPriceChartWrapper.tsx   # → 없음

# Chart는 'use client' 있음
grep "'use client'" src/components/invest/RegionalPriceChart.tsx  # → 1
grep "'use client'" src/components/invest/ComplexPriceChart.tsx   # → 1
```

### 21-02: /invest 통합 페이지

```bash
# 타입 탭 3개 확인 (D-03/D-09)
grep -A8 "AREA_OPTIONS" src/app/invest/page.tsx
# → '전체', '59㎡', '84㎡' 3항목만

# 소형/대형 탭 표시 없음 확인
grep "소형\|대형" src/app/invest/page.tsx | grep -v "ALLOWED_AREA_BUCKETS\|'소형'\|'대형'"
# → AREA_OPTIONS에서 소형/대형 없음

# ISR + 쿠키 없음
grep "revalidate = 3600" src/app/invest/page.tsx  # → 1
grep "cookies()" src/app/invest/page.tsx           # → 없음
```

### 21-03: 단지 상세 페이지 차트 섹션

```bash
# 기존 쿼리 보존
grep -c "getComplexGapStats" src/app/complexes/[id]/page.tsx  # → 1

# revalidate 유지
grep -c "revalidate = 86400" src/app/complexes/[id]/page.tsx  # → 1
```

---

## Security Validation

| Check | Command | Expected |
|-------|---------|----------|
| sgg_code allowlist | grep "ALLOWED_SGG_CODES" src/app/invest/page.tsx | present |
| area_type allowlist | grep "ALLOWED_AREA_BUCKETS" src/app/invest/page.tsx | present |
| risk_level allowlist | grep "ALLOWED_RISK_LEVELS" src/app/invest/page.tsx | present |
| cancel_date 필터 (양쪽 RPC) | grep-v "^--" migration.sql pipe grep -c "cancel_date IS NULL" | 2 |
| no hardcoded secrets | grep -r "sk_\|API_KEY\|SECRET" src/app/invest/ | nothing |
