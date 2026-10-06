# 응답 — Notify Worker 일 1회 전환 + 조용한 실패 수정 (2026-10-06)

> 상태: **✅ A-1·A-2·A-4-1 적용 완료** / B는 10-07 01:00 UTC 수동 실행 예정

**보내는 곳**: bds → ax-sub · **작성**: 2026-10-06

---

## ✅ A-1. 크론 변경 — 적용 완료

`notify-worker.yml`:
```diff
- cron: '*/5 * * * *'
+ cron: '0 1 * * *'
```

10:00 KST 고정. 적재(04:00 KST) 6시간 뒤, 주간 요약(09:00 KST) 1시간 뒤.

---

## ✅ A-2. timeout + freshness — 적용 완료

- `timeout-minutes`: 4 → **10**
- `expected_freshness_hours`: 3 → **30** (마이그레이션 `20261006000000`, DB 적용 완료)

---

## ✅ A-4-1. 조용한 실패 수정 — 적용 완료

`src/app/api/worker/notify/route.ts`:
- `failed > 0 || kakaoFailed > 0` 이면 `markCronPartial` 호출
- 메시지: `sent=N failed=N kakaoSent=N kakaoFailed=N`
- 전부 성공일 때만 `markCronSuccess`

감시견이 다음 날 보고에서 `partial` + 사유를 자동으로 읽습니다.

---

## 🟡 A-4-2. 재시도 + catch 구분 — 보류

분석은 맞습니다. `status='failed'`를 되돌리는 코드가 없어 영구 유실됩니다.
410/404(구독 만료)는 의도된 영구 실패가 맞고, 나머지(Resend 장애·카카오 블립)는 구분 없이 묶여 있습니다.
별건으로 처리하겠습니다 — 급하지 않습니다.

---

## 🟡 A-3. 야간 발송 가드 — 인지, 별건 처리

`deliver.ts`에 시간대 가드 없음 확인. A-1으로 정기 발송은 10:00 KST 고정되지만
`workflow_dispatch` 수동 실행은 아무 때나 발송 가능. 별건으로 검토합니다.

---

## ⏳ B. 월간 AI 해설 — 10-07(수) 01:00 UTC 수동 실행

`workflow_dispatch`로 실행 예정. 확인 항목:

| | 기대값 | 확인 방법 |
|---|---|---|
| ① 창원 우선 | 5,051행 먼저 · 100% | 실행 로그 |
| ② 깨끗한 중단 | TpdExhaustedError 즉시 탈출 · ~42분 | 실행 시간 |
| ③ markCronStatus | `partial` + `reason=groq_tpd_exhausted` | data_sources → 10-08 감시견 보고 |

결과는 실행 후 이 파일에 추가하겠습니다.

---

## 적용 시각

- 코드 변경: 2026-10-06 main 머지
- DB 변경: `20261006000000` 마이그레이션 즉시 적용
- **감시견 반영**: 10-07 일배치부터 새 문턱(30h)·새 크론(일 1회) 적용
