# Phase 22 — AI 가격 예측 ✅ 완료 (2026-05)

## 구현 내용
- 순수 TypeScript Holt-Winters 예측 엔진 (`src/lib/prediction/engine.ts`): 데이터 길이에 따라 holt-winters(>=24개월)/double-exp(>=12)/linear 자동 선택
- `complex_price_predictions` 테이블: UNIQUE(complex_id, area_bucket, predicted_month), RLS SELECT-only
- GitHub Actions 일배치(`compute-predictions.yml`): UTC 17:00(=KST 02:00), tx_count < 10 단지 스킵
- `/invest` 차트에 6개월 점선 예측선(strokeDasharray="5 3") + 신뢰구간 영역 추가
- Claude Haiku AI 트렌드 해설 카드 (ISR revalidate=604800 = 1주일)
- 가격 숫자 패턴 사후 필터링(PRICE_PATTERN) — 환각 방지
- 법적 면책: "AI 예측은 참고용이며 투자 판단의 근거로 사용 불가"

## 신규 파일
- `src/lib/prediction/engine.ts` — 예측 엔진, server-only 미사용(GitHub Actions 호환)
- `src/lib/prediction/engine.test.ts` — 17개 Vitest 테스트 PASS
- `scripts/compute-predictions.ts` — MIN_TX_COUNT=10, onConflict upsert
- `.github/workflows/compute-predictions.yml` — cron '0 17 * * *', timeout-minutes:30
- `src/app/api/invest/prediction-commentary/route.ts` — claude-haiku-4-5-20251001, revalidate=604800
- `supabase/migrations/20260530000001_complex_price_predictions.sql`

## 특이사항 / 유지보수
- `engine.ts`는 `server-only` 미사용 — GitHub Actions에서 직접 import 가능
- 배치 전까지 predictionData는 빈 배열 → graceful degradation(예측선 미표시)
- Anthropic API 키 미설정 시 commentary null → AI 해설 카드 미렌더(정상 처리)
- compute_predictions RPC: cancel_date IS NULL AND superseded_by IS NULL 필터 포함
- RegionalPriceChart는 ComposedChart로 교체됨(Phase 22에서 AreaChart에서 변경)
- 검증: 17/17 must-haves PASSED, 인간 검증 항목 없음
