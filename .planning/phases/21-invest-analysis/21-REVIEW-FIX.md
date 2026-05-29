---
phase: 21-invest-analysis
fixed_at: 2026-05-29T00:00:00Z
review_path: .planning/phases/21-invest-analysis/21-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 21: Code Review Fix Report

**Fixed at:** 2026-05-29
**Source review:** .planning/phases/21-invest-analysis/21-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (1 Critical + 2 High)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: SQL interval constructed via integer string concatenation — no bounds check on `p_months`

**Files modified:** `supabase/migrations/20260529000002_invest_rpc_clamp_months.sql`
**Commit:** d64204b
**Applied fix:**
새 마이그레이션 파일 `20260529000002_invest_rpc_clamp_months.sql`을 생성하여 두 RPC 함수(`invest_price_history`, `invest_regional_price_history`)를 `CREATE OR REPLACE FUNCTION`으로 교체했다. `LANGUAGE sql`에서 `LANGUAGE plpgsql`로 변경하고 함수 본문 상단에 `v_months := GREATEST(1, LEAST(60, p_months));`를 추가해 p_months를 1~60 범위로 클램핑한다. 이후 날짜 계산에는 원본 p_months 대신 v_months를 사용한다. `cancel_date IS NULL AND superseded_by IS NULL` 조건은 양 함수 모두 유지됨.

### WR-01 (HIGH): `p_deal_type` is an unvalidated `text` parameter exposed to `anon` callers

**Files modified:** `supabase/migrations/20260529000002_invest_rpc_clamp_months.sql`
**Commit:** d64204b
**Applied fix:**
같은 마이그레이션 파일에서 `invest_price_history`의 `p_deal_type text DEFAULT 'sale'`을 `p_deal_type public.deal_type DEFAULT 'sale'`으로 변경했다. 파라미터 타입이 이미 `public.deal_type`이므로 WHERE 절의 `::public.deal_type` 캐스트도 제거했다. GRANT 문도 새 시그니처에 맞게 재부여했다.

### WR-02 (HIGH): `getComplexAreaTypes` makes 4 sequential Supabase round-trips inside a `for` loop

**Files modified:** `src/lib/data/invest.ts`
**Commit:** 199ddc5
**Applied fix:**
`for` 루프 순차 `await` 패턴을 `Promise.all(buckets.map(async (bucket) => { ... }))` 병렬 실행으로 교체했다. 각 버킷 쿼리를 독립적으로 병렬 실행한 뒤 결과를 `.filter`/`.map`으로 집계한다. 버킷 필터 로직, `cancel_date IS NULL`, `superseded_by IS NULL` 조건은 동일하게 유지됨.

---

_Fixed: 2026-05-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
