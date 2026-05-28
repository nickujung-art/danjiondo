#!/usr/bin/env bash
# 백필 오케스트레이션 — 순차 실행 + 자동 재시도
# 실행: bash scripts/backfill-orchestrate.sh

LOG="scripts/backfill-$(date +%Y%m%d-%H%M%S).log"
MAX_RETRIES=5
RETRY_DELAY=60  # 실패 후 재시도 전 대기 (초)

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$LOG"
}

run_with_retry() {
  local name="$1"
  local cmd="$2"
  local attempt=1

  while [ "$attempt" -le "$MAX_RETRIES" ]; do
    log "[$name] 시도 $attempt/$MAX_RETRIES 시작"

    eval "$cmd" 2>&1 | tee -a "$LOG"
    local rc=${PIPESTATUS[0]}

    if [ "$rc" -eq 0 ]; then
      log "[$name] 완료 ✓"
      return 0
    fi

    log "[$name] 실패 (exit=$rc)"
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      log "[$name] ${RETRY_DELAY}초 후 재시도..."
      sleep "$RETRY_DELAY"
    fi
    attempt=$((attempt + 1))
  done

  log "[$name] 최대 재시도(${MAX_RETRIES}회) 초과 — 다음 단계로 진행"
}

log "=== 백필 오케스트레이션 시작 ==="
log "로그 파일: $LOG"

# 기존 link-transactions 프로세스가 있으면 완료 대기
if pgrep -f "link-transactions" >/dev/null 2>&1; then
  log "[link-transactions] 기존 프로세스 실행 중 — 완료 대기..."
  while pgrep -f "link-transactions" >/dev/null 2>&1; do
    sleep 30
  done
  log "[link-transactions] 기존 프로세스 완료 확인"
fi

# 1. transactions.complex_id 연결 (나머지 NULL 건)
run_with_retry "link-transactions" \
  "npx tsx --env-file=.env.local scripts/link-transactions.ts"

# 2. K-apt API로 세대수=0 단지 재보강
run_with_retry "kapt-household-refetch" \
  "npx tsx --env-file=.env.local scripts/kapt-household-refetch.ts"

# 3. 건축물대장으로 세대수=0 보강 (K-apt 미매칭 단지)
run_with_retry "enrich-apt-unmatched" \
  "npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts --household-zero"

# 4. 좌표 없는 단지 카카오 API로 자동 보완
run_with_retry "fix-null-coords" \
  "npx tsx --env-file=.env.local scripts/fix-null-coords.ts"

log "=== 모든 백필 완료 ==="
