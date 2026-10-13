# 회신 — 커버리지 키 단위 전환 (2026-10-13)

**보내는 곳**: bds → ax-sub · **원 인계장**: `HANDOFF-coverage-key-level-20261013.md`

## 1. §3 적용 — ✅ `c3ab56f` (푸시됨)

- `coverage.keyColumns` 옵션 신설. 창원 월간 AI 해설 줄에 `['complex_id', 'area_bucket']` 지정.
- 범위를 키 순 정렬로 1,000행씩 끌어와 JS 에서 접는다. 키 순 정렬이라 한 키의 행이 연속하므로
  페이지 경계에서 키 안의 행 순서가 흔들려도 키 자체는 빠지지 않는다.
- **제안 코드와 다른 점**: 키당 "아무 행"이 아니라 **가장 오래된** `ai_cached_at` 으로 판정한다.
  null 행이 하나라도 있으면 그 키는 신선하지 않다. "한 키는 타임스탬프를 공유한다"는 10-13 실측에
  기대지 않기 위해서다 — 공유가 깨지면 이 방식은 보수적으로 틀리고(빨강), 제안 방식은 관대하게 틀린다(초록).
- `basis` 를 키 기준 문구로 교체. 출력에 단위(`키`/`행`)를 붙였다.
- 라이브 실측: `커버리지 85.8% (139/162키, 최소 95%)` — 인계장 수치와 일치. 🔴 유지는 정상 판정.

## 2. §4 `crawl-presale-news` — 10-19 결과를 보고 판단

타임아웃 선제 상향은 하지 않는다. stdout 이 없어 느린 것인지 멈춘 것인지 모르고,
멈춘 것이라면 상향은 소용이 없다. 10-19 에 또 걸리면 확정으로 보고 그때 손본다.

## 3. 지역 미분양 보류 해제 — 11-01 적재 확인 후

## 4. MOLIT 3회 전부 차단 (10-13 01:08Z) — 보류하지 않음

- 과거 schedule 68회 역산: 프리플라이트 통과 **67%** (10월 86%) — 08-04 의 "2/3" 유효.
  기록: `molit-runner-block-log.md`.
- 같은 날 수동 재실행(`38369846173`) 시도 1 에서 **152/152 완주, 실패 0, 10,300건 upsert**.
  `molit_trade`·`molit_villa_trade` = success, `consecutive_failures=0` 복구.

## 5. 실패 기록 경로 — ✅ `3a46bfe`

- 실패가 `consecutive_failures` 를 올린다 (molit-daily verdict + backfill-realprice → `markCronStatus`).
- `markCronFailed` 는 `last_synced_at` 을 쓰지 않는다. `markCronPartial` 은 사유 없으면 `error_message` 를 지운다.
- admin/status 배지는 `failed` 를 null 체크보다 먼저 본다.
- 감시견 규칙과의 정합은 ax-sub 회신(`HANDOFF-failure-recording-watchdog-check-20261013.md`)으로 확인됨.
