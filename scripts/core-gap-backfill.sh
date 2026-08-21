#!/usr/bin/env bash
# 운영권역(창원 5구 + 김해) 2015~2016 실거래 결손 메우기
#
# [발견 경위] Phase 41 부산 백필 완료 시점을 추정하려 연도 분포를 보다 드러났다.
# 창원·김해 월별 거래가 2016-07 을 경계로 10배 뛴다(200~290 -> 2,000~2,800).
# 원장 확인: molit_trade 누락 80 / molit_villa_trade 누락 96 = 176 지역-월,
# 전부 2015~2016 상반기다. 2015년은 6개 구 중 1개만 수집돼 있었다.
# 근거: .planning/phases/41-busan-recollect/FINDING-changwon-gimhae-gap.md
#
# [영향] 10년 가격 그래프·랭킹·갭 분석·AI 예측이 전부 이 구간을 전제한다.
# 부산이 201501~ 로 채워지면서 운영권역보다 부산이 더 완전해진 상태였다.
#
# --resume 이 이미 수집된 달을 건너뛴다. 부산 백필과 동일한 로컬 병렬 방식.
set -u
cd "$(dirname "$0")/.."
LOGDIR="scripts/.core-gap-logs"; mkdir -p "$LOGDIR"

# 구 6개를 3조로. 부산(16구)보다 훨씬 작아 3병렬로 충분하다.
BATCHES=("48121,48123" "48125,48127" "48129,48250")
FROM=201501; TO=201612

echo "운영권역 결손 백필 시작 — $(date '+%Y-%m-%d %H:%M:%S') / from=$FROM to=$TO"
PIDS=()
for g in "${BATCHES[@]}"; do
  LOG="$LOGDIR/${g//,/_}.log"
  npx tsx scripts/backfill-realprice.ts --sgg="$g" --from="$FROM" --to="$TO" --resume > "$LOG" 2>&1 &
  PIDS+=($!); echo "  시작: $g (pid $!) → $LOG"; sleep 3
done
FAIL=0
for i in "${!PIDS[@]}"; do
  if wait "${PIDS[$i]}"; then echo "✅ ${BATCHES[$i]} 정상 종료"; else echo "❌ ${BATCHES[$i]} 실패"; FAIL=$((FAIL+1)); fi
done
echo "완료 — $(date '+%Y-%m-%d %H:%M:%S') / 실패 $FAIL/${#BATCHES[@]}"
exit $FAIL
