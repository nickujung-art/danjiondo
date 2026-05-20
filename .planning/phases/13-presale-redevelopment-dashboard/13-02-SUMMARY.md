---
phase: 13-presale-redevelopment-dashboard
plan: "02"
subsystem: presale-api-client
tags: [cheongyak, fetch, cron, tdd, api-adapter, presale]
dependency_graph:
  requires:
    - 13-01 (CheongyakItemSchema, CompetitionRateItemSchema, normalize.ts, DB 12컬럼)
  provides:
    - src/services/cheongyak/client.ts (fetchCheongyakList, fetchCompetitionRate, CHEONGYAK_SGG_CODES)
    - daily cron 청약홈 3블록 (분양공고 수집 · 경쟁률 병합 · 만료 비활성화)
  affects:
    - Wave 2 (13-04): new_listings DB에 실제 데이터 파이프라인 완성
    - /presale 페이지: 매일 04:00 KST 갱신되는 데이터 소스 완성
tech_stack:
  added: []
  patterns:
    - vi.mock('@/lib/api/retry') 패스스루 — withRetry 재시도 루프 없이 단위 테스트
    - normalizeItems(raw): item 단건 객체 → 배열 정규화 (공공API 1건 응답 처리)
    - Math.max(...rates) 경쟁률 집계 (CONTEXT.md 확정 — MAX 방식)
key_files:
  created:
    - src/services/cheongyak/client.ts
  modified:
    - src/services/cheongyak/client.test.ts (6개 it.todo → it() GREEN)
    - src/app/api/cron/daily/route.ts (청약홈 3블록 + 응답 필드 3개 추가)
decisions:
  - "경쟁률 집계 MAX 확정 — CONTEXT.md 'Claude Discretion'에서 MAX로 고정, 카드 '최고 경쟁률 X:1' 표시 목적"
  - "withRetry mock 패스스루 — res.ok=false throw 시 status≠410이면 withRetry가 재시도하여 5000ms 타임아웃 발생, vi.mock으로 해소"
  - "HOUSE_SECD 파라미터 미사용 — 13-01-SUMMARY Task 0에서 필터 불필요 확인, client.ts에 추가 안 함"
metrics:
  duration: "약 7분"
  completed_date: "2026-05-20"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 13 Plan 02: 청약홈 API 어댑터 + Cron 통합 Summary

**한 줄 요약:** fetchCheongyakList/fetchCompetitionRate Zod+withRetry 어댑터 구현 + daily cron 청약홈 3블록(분양공고 upsert·경쟁률 MAX 병합·만료 비활성화) 통합 완료

## Task 1 결과: client.ts 구현 + 6개 unit test GREEN

**파일:** `src/services/cheongyak/client.ts`

### 함수 시그니처

```typescript
export const CHEONGYAK_SGG_CODES = ['4812500000', '4825000000'] as const

export async function fetchCheongyakList(sggCode: string): Promise<CheongyakItem[]>
// totalCount 기반 자동 페이지네이션, MAX_PAGES=5 안전 상한 (T-13-06 DoS 방어)

export async function fetchCompetitionRate(pblancNo: string): Promise<number | null>
// gnrlRnk1CrsplApplCnt 최댓값, 데이터 없으면 null
```

### URL 파라미터 (API 3)

| 파라미터 | 값 |
|---------|-----|
| `ServiceKey` | `MOLIT_API_KEY` |
| `RoadNmSggCd` | sggCode |
| `pageNo` | 1~N |
| `numOfRows` | 100 |
| `_type` | json |

### 경쟁률 집계 방식 (Open Question 2 해소)

**MAX 채택** — CONTEXT.md에서 "Claude's Discretion"으로 위임된 결정. 단일 numeric 컬럼에 가장 명확하고, 카드 UI에서 "최고 경쟁률 X:1" 표시 목적에 부합.

### 테스트 결과

6개 모두 GREEN:
1. `throws when MOLIT_API_KEY missing` — MOLIT_API_KEY 미설정 시 throw
2. `calls expected URL with RoadNmSggCd + _type=json` — URL 파라미터 검증
3. `parses camelCase response into CheongyakItem[]` — mock JSON → CheongyakItem[] 2건
4. `throws on res.ok === false` — HTTP 오류 throw
5. `returns null when API returns empty items` — 빈 items → null
6. `aggregates multiple houseTy rows into single max competition rate` — [12.3, 45.6, 7.8] → 45.6

## Task 2 결과: daily cron 청약홈 3블록 통합

**파일:** `src/app/api/cron/daily/route.ts`

### 추가된 블록 구조

```
[기존] K-apt UPSERT (DATA-01)
[기존] MOLIT 분양권전매 UPSERT (DATA-02) ← onConflict: 'name,region' 보존
[NEW]  청약홈 분양공고 수집 (PRESALE-01) ← onConflict: 'pblanc_no'
[NEW]  청약홈 경쟁률 병합 (PRESALE-02)
[NEW]  청약홈 만료 공고 비활성화 (T-13-07)
[기존] refresh_complex_price_stats RPC
```

### 응답 JSON 변경

기존 5개 → 9개 필드:

```json
{
  "ok": true,
  "totalUpserted": 0,
  "kaptUpserted": 0,
  "presaleUpserted": 0,
  "cheongyakUpserted": 0,
  "competitionUpdated": 0,
  "expiredDeactivated": 0,
  "errors": []
}
```

### MOLIT_API_KEY 미설정 격리

청약홈 블록 내부에서 `fetchCheongyakList` → `throw('MOLIT_API_KEY not set')` 발생 시 `catch`에서 `errors.push(...)` 후 다음 블록 계속 실행. 기존 MOLIT/KAPT 블록 영향 없음.

## Commits

| 커밋 | 해시 | 내용 |
|------|------|------|
| Task 1 | 42d680f | client.ts 구현 + 6개 unit test GREEN |
| Task 2 | ba718a1 | daily cron 청약홈 3블록 통합 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] withRetry 재시도로 인한 test timeout**
- **Found during:** Task 1 테스트 실행
- **Issue:** `res.ok=false` 에러 throw 시 status=500이 `isNonRetryable(err)` 판단에서 false → withRetry가 5회 재시도 → 5000ms 타임아웃
- **Fix:** `vi.mock('@/lib/api/retry', () => ({ withRetry: (fn) => fn() }))` 패스스루 mock 추가
- **Files modified:** `src/services/cheongyak/client.test.ts`
- **Commit:** 42d680f

## Known Stubs

없음 — 이 플랜은 서비스 어댑터 + cron 통합으로만 구성. UI 렌더링 없음.

## Threat Flags

없음 — 새 네트워크 엔드포인트 추가 없음. fetchCheongyakList/fetchCompetitionRate는 기존 CRON_SECRET 보호 하의 daily cron에서만 호출.

## Self-Check: PASSED

- `src/services/cheongyak/client.ts` 존재 확인
- `src/services/cheongyak/client.test.ts` 6개 GREEN 확인
- `src/app/api/cron/daily/route.ts` 청약홈 3블록 포함 확인
- Commits 42d680f, ba718a1 존재 확인
