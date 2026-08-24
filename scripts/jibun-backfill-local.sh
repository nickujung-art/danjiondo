#!/usr/bin/env bash
# 거래 지번 백필 — 오피스텔 전건 + 운영권역 아파트·연립 (2026-08-24)
#
# [왜]
# 운영권역 유효거래 339,295 중 58,533(17.3%)에 지번이 없다. 부산은 610(0.1%)뿐이다.
# 갈라 보면 원인이 둘이다:
#   오피스텔  22,935 (+부산 610) — 적재부가 jibun 을 아예 안 썼다. 코드 수정 완료(badd9de)
#   아파트·연립 35,598          — 옛 적재분. 지금 코드는 제대로 쓴다(부산 결측 0건이 증거)
# 둘 다 재수집하면 채워진다. MOLIT API 는 전 거래유형·전 item 에 <jibun> 을 준다(실측).
#
# [왜 지번이 중요한가]
# 지번 게이트(20260821090000)가 보는 `complex_canonical_jibun` 은 거래 지번의 다수결이다.
# 지번이 없으면 확정 지번을 못 만들고 게이트가 그 단지를 보호하지 못한다. 운영권역
# 미보호 471곳 중 379곳(80%)이 "거래에 지번이 5건도 없어서"다.
#
# [왜 --resume 을 쓰지 않나]
# --resume 은 ingest_runs 에 success 로 남은 지역-월을 건너뛴다. 이번엔 **이미 성공한 달을
# 다시 덮는 것**이 목적이라 정반대다. upsertTransaction 이
# `onConflict: 'dedupe_key', ignoreDuplicates: false` 라 기존 행을 갱신한다.
#
# [부작용 — 알고 하는 것]
# 재수집은 lookupComplexIdCached 를 다시 타므로 complex_id 도 다시 붙는다. 현재 게이트로
# 재연결되는 것이라 대체로 개선이다. 48123/201701 통제 실험에서 실제로
# `롯데1단지아파트 → 용호롯데아파트` 오연결 1건이 자동으로 고쳐졌다.
# 🔴 그래서 `wholesale-mislink-20260824.json` 의 94곳 판정은 이 백필 뒤 무효다. 재측정할 것.
#
# [왜 로컬인가]
# GitHub Actions IP 가 data.go.kr 에 회당 ~1/3 확률로 차단된다. 국내 로컬은 차단이 없고
# 5시간 job 한도도 없다. 선례: busan-backfill-local.sh, core-gap-backfill.sh
#
# 실행:
#   bash scripts/jibun-backfill-local.sh offi     # 오피스텔 (운영권역+부산)
#   bash scripts/jibun-backfill-local.sh apt      # 아파트·연립 (운영권역)
# 로그: scripts/.jibun-backfill-logs/<mode>_<group>.log

set -u
cd "$(dirname "$0")/.."

MODE="${1:-}"
if [ "$MODE" != "offi" ] && [ "$MODE" != "apt" ]; then
  echo "사용법: bash scripts/jibun-backfill-local.sh {offi|apt}" >&2
  exit 2
fi

LOGDIR="scripts/.jibun-backfill-logs"; mkdir -p "$LOGDIR"
FROM=201501
TO=$(date +%Y%m)

# ⚠️ 변수명에 GROUPS 를 쓰지 않는다 — bash 내장 특수 변수라 할당이 먹지 않는다
# (2026-08-20 busan-backfill-local.sh 에서 실제로 겪었다).
if [ "$MODE" = "offi" ]; then
  SCRIPT="scripts/backfill-officetel.ts"
  # 🔴 부산은 넣지 않는다 — 비용 대비 값이 안 맞는다.
  # 부산 오피스텔 결측은 610건뿐인데 16개 구 × 140개월 = 2,240 지역-월(≈4,480 호출)이 든다.
  # MOLIT 일 한도가 10,000회라, 그걸 쓰면 정작 값이 큰 운영권역 아파트·연립 백필
  # (35,598건)이 한도에 걸린다. 첫 실행에서 4조로 돌렸다가 이 계산을 하고 부산을 뺐다.
  # 부산 610건은 별도 회차에 좁은 기간만 지정해 돌린다.
  BATCHES=("48121,48123,48125" "48127,48129,48250")
else
  SCRIPT="scripts/backfill-realprice.ts"
  # 아파트·연립은 물량이 크다. 운영권역 6개 구를 3조로(부산은 이미 깨끗해 대상 아님).
  BATCHES=("48121,48123" "48125,48127" "48129,48250")
fi

echo "지번 백필 [$MODE] 시작 — $(date '+%Y-%m-%d %H:%M:%S') / from=$FROM to=$TO / ${#BATCHES[@]}조"
PIDS=()
for g in "${BATCHES[@]}"; do
  LOG="$LOGDIR/${MODE}_${g//,/_}.log"
  npx tsx "$SCRIPT" --sgg="$g" --from="$FROM" --to="$TO" > "$LOG" 2>&1 &
  PIDS+=($!); echo "  시작: $g (pid $!) → $LOG"; sleep 3
done

FAIL=0
for i in "${!PIDS[@]}"; do
  if wait "${PIDS[$i]}"; then echo "✅ ${BATCHES[$i]} 정상 종료"
  else echo "❌ ${BATCHES[$i]} 실패"; FAIL=$((FAIL+1)); fi
done
echo "완료 [$MODE] — $(date '+%Y-%m-%d %H:%M:%S') / 실패 $FAIL/${#BATCHES[@]}"
echo
echo "다음: 확정 지번 재계산이 필요하다 —"
echo "  gh workflow run refresh-price-stats.yml --ref main"
exit $FAIL
