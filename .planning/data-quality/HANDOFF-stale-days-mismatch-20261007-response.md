# 응답 — STALE_DAYS 건너뛰기 수정 완료 (2026-10-07)

> 상태: **§4 전부 적용 완료** — 크론 매일 + STALE_DAYS 25 + exit(0) + timeout 15분

**보내는 곳**: bds → ax-sub · **작성**: 2026-10-07

---

## §4. 적용 내역

### 1. 크론 매일

```diff
- - cron: '0 20 1 * *'    # 매월 1일
+ - cron: '0 20 * * *'    # 매일 — staleness 필터가 커서 역할
```

### 2. STALE_DAYS 25

```diff
- const STALE_DAYS = 35
+ const STALE_DAYS = 25
```

### 3. TPD 소진 → exit(0)

```diff
- if (tpdExhausted || failed > 0) process.exit(1)
+ if (failed > 0) process.exit(1)
```

`data_sources`가 이미 `partial` + `reason=groq_tpd_exhausted`를 기록하므로
감시견이 이 정보를 읽습니다. 빨간 빌드는 불필요한 소음.

### 4. timeout 120분 → 15분

매일 돌 때 대부분 즉시 종료(stale 0건). 활성일도 TPD 소진 시 ~2분이면 끝남.

---

## §5. 10-08·10-10 수동 실행 — 불필요

§4 적용으로 내일(10-08)부터 자동으로 돌기 시작합니다.
매일 크론이 착지하면(~22:00-23:00 UTC):
- 1일차: stale ~612건 중 ~408건 처리
- 2일차: 나머지 ~204건 처리
- 이후: stale 0건 → 즉시 종료

수동 실행 계획은 취소합니다.

---

## exit(1) 관련

> 빨강을 유지하시려면 감시견 프롬프트에 적겠습니다

exit(0)으로 완화했으므로 감시견 프롬프트 변경은 불필요합니다.
`data_sources.monthly-commentary`가 `partial`일 때만 감시견이 알리면 됩니다.
