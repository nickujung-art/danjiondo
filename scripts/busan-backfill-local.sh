#!/usr/bin/env bash
# 부산 16개 구 MOLIT 백필 — 로컬 8개 병렬 실행 (Phase 41)
#
# [왜 로컬인가 — 2026-08-20 실측]
# GitHub Actions 로 16개 구를 병렬 dispatch 했더니 data.go.kr 이 러너 IP 를 높은 비율로
# 차단했다(초회 16개 중 12개 exit 75). --resume 덕에 작업이 버려지진 않지만, 대부분의 구가
# 적재보다 "npm ci → preflight → 차단 → 재큐" 순환에 시간을 썼다. 50분 경과 시점 진척이
# 4.3% 였고 12개 구가 2% 미만이었다. 완주 추정 19시간+.
#
# 로컬은 국내 IP 라 차단이 없고 5시간 job 한도도 없다. 지역-월 중간값 33.6초 기준
# 4,480 지역-월 / 8 병렬 ≈ 5시간.
#
# 이미 적재된 지역-월은 ingest_runs 에 success 로 남아 --resume 이 건너뛴다.
# (Phase 41 D-02 가 삭제 전 잔존 기록 4,006행을 비워둔 덕에 이 --resume 이 정직하게 동작한다)
#
# 실행:
#   bash scripts/busan-backfill-local.sh
# 로그: scripts/.busan-backfill-logs/<group>.log

set -u
cd "$(dirname "$0")/.."

LOGDIR="scripts/.busan-backfill-logs"
mkdir -p "$LOGDIR"

# 단지 수를 밀도 대리지표로 삼아 최대-최소를 짝지어 8조로 균형 배분했다.
# (26350:200 26230:171 26380:142 26260:127 26320:114 26470:106 26290:101 26530:98
#  26410:87 26710:82 26500:64 26440:52 26200:43 26140:42 26170:27 26110:11)
GROUPS=(
  "26350,26110"
  "26230,26170"
  "26380,26140"
  "26260,26200"
  "26320,26440"
  "26470,26500"
  "26290,26710"
  "26530,26410"
)

FROM=201501
PIDS=()

echo "부산 백필 로컬 병렬 시작 — $(date '+%Y-%m-%d %H:%M:%S')"
echo "그룹 ${#GROUPS[@]}개 / from=$FROM / resume=on"

for g in "${GROUPS[@]}"; do
  LOG="$LOGDIR/${g//,/_}.log"
  npx tsx scripts/backfill-realprice.ts --sgg="$g" --from="$FROM" --resume > "$LOG" 2>&1 &
  PIDS+=($!)
  echo "  시작: $g (pid $!) → $LOG"
  sleep 3   # 동시 기동 시 npx/tsx 컴파일 경합 완화
done

echo "전 그룹 기동 완료. 종료 대기..."

FAIL=0
for i in "${!PIDS[@]}"; do
  if wait "${PIDS[$i]}"; then
    echo "✅ 그룹 ${GROUPS[$i]} 정상 종료"
  else
    RC=$?
    echo "❌ 그룹 ${GROUPS[$i]} 비정상 종료 (exit $RC) — $LOGDIR/${GROUPS[$i]//,/_}.log 확인"
    FAIL=$((FAIL+1))
  fi
done

echo "완료 — $(date '+%Y-%m-%d %H:%M:%S') / 실패 그룹 $FAIL/${#GROUPS[@]}"
exit $FAIL
