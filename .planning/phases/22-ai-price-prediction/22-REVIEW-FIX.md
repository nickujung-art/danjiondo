---
phase: 22-ai-price-prediction
fixed_at: 2026-05-29T00:00:00Z
review_path: .planning/phases/22-ai-price-prediction/22-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 22: 코드 리뷰 수정 보고서

**수정일:** 2026-05-29
**원본 리뷰:** `.planning/phases/22-ai-price-prediction/22-REVIEW.md`
**반복 횟수:** 1

**요약:**
- 범위 내 결함: 3 (CR-01, CR-02, CR-03)
- 수정 완료: 3
- 건너뜀: 0

---

## 수정된 이슈

### CR-01: Haiku 출력 가격 패턴 사후 필터링 추가

**수정 파일:** `src/app/api/invest/prediction-commentary/route.ts`
**커밋:** `9a97e5c`
**적용된 수정:**
`message.content[0].text`를 바로 반환하던 코드를 다음과 같이 개선했습니다.
- 변수명을 `text` → `raw`로 변경하고 null 조기 반환 추가
- `PRICE_PATTERN = /\d[\d,]*\s*(만원|억원|원|만|억|\$)/` 패턴으로 가격 숫자 포함 여부 검사
- `UNIT_PATTERN = /\d+\s*(만|억)/` 패턴으로 단위만 있는 경우도 검사
- 두 패턴 중 하나라도 매칭되면 `{ commentary: null }` 반환 (규칙 위반 시 해설 폐기)
- 검증 통과 시에만 `{ commentary: raw }` 반환

---

### CR-02: getRegionalPricePredictions .limit(6000) 추가 — PostgREST 한도 방지

**수정 파일:** `src/lib/data/invest.ts`
**커밋:** `eda725a`
**적용된 수정:**
`getRegionalPricePredictions` 함수의 `complex_price_predictions` 조회 쿼리에 동적 limit을 추가했습니다.
- `rowLimit = Math.min(ids.length * 6 + 100, 6000)` 계산 (단지 수 × 6개월 + 버퍼, 최대 6000)
- `.order()` 전에 `.limit(rowLimit)` 체인 추가
- PostgREST 기본 1000행 한도로 인한 무음 잘림 방지 (500단지 × 6개월 = 최대 3000행 보장)

---

### CR-03: addMonths NaN 방어 — parseInt + Number.isFinite 검증

**수정 파일:** `src/lib/prediction/engine.ts`
**커밋:** `e8f7a88`
**적용된 수정:**
`addMonths` 함수의 `ym.split('-').map(Number)` 방식을 `parseInt`로 교체하고 유효성 검증을 추가했습니다.
- `parseInt(parts[0] ?? '', 10)` / `parseInt(parts[1] ?? '', 10)` 으로 명시적 파싱
- `!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12` 조건 검사
- 유효하지 않은 형식이면 `throw new Error('addMonths: invalid yearMonth format "..."')` 발생
- NaN이 DB에 upsert되어 `predicted_month` 날짜 파싱 실패로 이어지는 경로 차단

---

## 건너뛴 이슈

없음 — 모든 CRITICAL 결함이 성공적으로 수정되었습니다.

---

## 빌드/린트 검증 결과

`npm run lint && npm run build` 실행 결과:
- ESLint: 경고/오류 없음
- TypeScript 오류 2건 (`scripts/backfill-jibun-addr.ts:30`, `src/lib/data/complex-matching.ts:97`) — **이번 수정 이전부터 존재하던 기존 에러**이며, 수정한 3개 파일과 무관함을 `git stash`로 확인
- 이번 수정으로 새롭게 도입된 TypeScript/ESLint 오류: 없음

---

_수정일: 2026-05-29_
_수정자: Claude (gsd-code-fixer)_
_반복 횟수: 1_
