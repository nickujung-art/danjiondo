#!/usr/bin/env python3
"""
AI 가격 예측 배치 — Amazon Chronos-Bolt-Small

단지 × area_bucket 별 6개월 예측 → complex_price_predictions upsert
model_name = 'chronos-bolt-small'

기존 Holt-Winters 배치(02:00 KST) 이후 03:00 KST에 실행.
같은 UNIQUE 키(complex_id, area_bucket, predicted_month)로 upsert하므로
Chronos 결과가 Holt-Winters 결과를 덮어씁니다.

Stage 1(조회)은 스레드풀로 병렬 수행 — 대부분의 조합이 데이터 부족으로 스킵되지만
그 판단 자체도 네트워크 왕복이 필요해, 순차 처리 시 왕복시간 합만으로 시간 예산을
다 씀. Stage 2(모델 추론)는 순차 유지(Chronos 파이프라인 공유, CPU 바운드라 스레드
이점 없음). 갱신 안 된 지 오래된 단지를 우선 처리해 시간 예산 내에 끝나지 못해도
매일 같은 단지만 방치되지 않도록 함.

환경변수:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
import time
import datetime
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import torch
from chronos import ChronosBoltPipeline

# ─── 환경변수 ─────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    print("[ERROR] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

# ─── 상수 ─────────────────────────────────────────────────────────────────────

AREA_BUCKETS     = ["소형", "59", "74", "84", "대형"]
MIN_MONTHS       = 6       # 예측 최소 학습 월
MIN_TX_TOTAL     = 10      # 누적 거래 건수 최소값
FORECAST_MONTHS  = 6       # 예측 기간
HOLDOUT_MONTHS   = 6       # MAPE 계산용 hold-out
MODEL_HF_ID      = "amazon/chronos-bolt-small"
MODEL_NAME_DB    = "chronos-bolt-small"
PAGE_SIZE        = 1000
UPSERT_BATCH     = 200     # DB upsert 묶음 크기
FETCH_WORKERS    = 16      # Stage 1 병렬 조회 스레드 수
STAGE2_DEADLINE_S = 80 * 60  # Stage 2(추론) 소프트 데드라인 — 초과 시 남은 건 다음날로 이월

# ─── Supabase REST 헬퍼 ───────────────────────────────────────────────────────

_thread_local = threading.local()


def _session() -> requests.Session:
    """스레드별 세션 재사용 — 매 호출마다 새 TCP/TLS 핸드셰이크 여는 것 방지."""
    sess = getattr(_thread_local, "session", None)
    if sess is None:
        sess = requests.Session()
        _thread_local.session = sess
    return sess


def rpc(fn: str, params: dict) -> list:
    r = _session().post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        headers=HEADERS,
        json=params,
        timeout=30,
    )
    r.raise_for_status()
    return r.json() or []


def select_paginated(table: str, columns: str, extra_params: dict | None = None) -> list:
    rows, offset = [], 0
    while True:
        params = {"select": columns, **(extra_params or {})}
        r = _session().get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**HEADERS, "Range-Unit": "items",
                     "Range": f"{offset}-{offset + PAGE_SIZE - 1}"},
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        chunk = r.json() or []
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


UPSERT_MAX_RETRIES = 3


def upsert_batch(table: str, rows: list, on_conflict: str = "") -> None:
    """일시적 네트워크 지연/오류에 대비한 재시도 포함.
    max_retries 소진 후에도 실패하면 예외를 그대로 올려 호출부가 판단하게 함
    (Stage 2는 이 예외를 잡아 배치 하나만 건너뛰고 계속 진행 — 전체 run이 죽지 않도록)."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"

    last_err: Exception | None = None
    for attempt in range(UPSERT_MAX_RETRIES):
        try:
            r = _session().post(
                url,
                headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
                json=rows,
                timeout=90,
            )
            r.raise_for_status()
            return
        except requests.exceptions.RequestException as e:
            last_err = e
            if attempt < UPSERT_MAX_RETRIES - 1:
                time.sleep(2 ** attempt)  # 1s, 2s
    assert last_err is not None
    raise last_err

# ─── 유틸리티 ─────────────────────────────────────────────────────────────────

def add_months(year: int, month: int, n: int) -> tuple[int, int]:
    month += n
    year  += (month - 1) // 12
    month  = (month - 1) % 12 + 1
    return year, month


def calc_mape(actual: list[float], predicted: list[float]) -> float:
    pairs = [(a, p) for a, p in zip(actual, predicted) if a > 0]
    if not pairs:
        return 0.0
    return sum(abs(a - p) / a for a, p in pairs) / len(pairs)


def fetch_last_updated() -> dict[str, str]:
    """model_name='chronos-bolt-small' 기준 단지별 최신 computed_at.
    단지별 개별 조회가 아니라 전체를 페이지네이션으로 한 번에 가져와 클라이언트에서 축약."""
    rows = select_paginated(
        "complex_price_predictions",
        "complex_id,computed_at",
        extra_params={
            "model_name": "eq.chronos-bolt-small",
            # computed_at은 그날 실행 전체가 공유하는 값이라 동률이 흔함 — id로 타이브레이크
            "order":      "computed_at.desc,id.asc",
        },
    )
    last_updated: dict[str, str] = {}
    for r in rows:
        cid = r["complex_id"]
        if cid not in last_updated:   # order=desc이므로 각 단지의 첫 등장이 최신값
            last_updated[cid] = r["computed_at"]
    return last_updated

# ─── 모델 로드 ────────────────────────────────────────────────────────────────

print(f"[init] 모델 로드: {MODEL_HF_ID}", flush=True)
pipeline = ChronosBoltPipeline.from_pretrained(
    MODEL_HF_ID,
    device_map="cpu",
    dtype=torch.float32,
)
print("[init] 모델 준비 완료", flush=True)

# ─── Stage 1: 실거래 이력 조회 + 임계값 체크 (I/O 바운드, 병렬) ───────────────

def fetch_history(complex_id: str, bucket: str) -> dict | None:
    raw = rpc("compute_predictions", {
        "p_complex_id":  complex_id,
        "p_area_bucket": bucket,
        "p_months":      None,
    })
    if not raw:
        return None

    raw    = sorted(raw, key=lambda r: r["year_month"])
    prices = [float(r["avg_price"]) for r in raw]
    tx_sum = sum(int(r["tx_count"]) for r in raw)

    if len(prices) < MIN_MONTHS or tx_sum < MIN_TX_TOTAL:
        return None

    return {"complex_id": complex_id, "bucket": bucket, "raw": raw, "prices": prices}

# ─── Stage 2: Chronos 모델 추론 (CPU 바운드, 순차) ────────────────────────────

def run_inference(
    complex_id: str,
    bucket: str,
    raw: list[dict],
    prices: list[float],
    computed_at: str,
) -> list[dict]:

    # ── MAPE 계산 (hold-out) ──────────────────────────────────────────────────
    mape = 0.0
    if len(prices) >= MIN_MONTHS + HOLDOUT_MONTHS:
        train = prices[:-HOLDOUT_MONTHS]
        actual_ho = prices[-HOLDOUT_MONTHS:]
        ctx_ho = torch.tensor(train, dtype=torch.float32).unsqueeze(0)
        q_ho, _ = pipeline.predict_quantiles(
            ctx_ho, prediction_length=HOLDOUT_MONTHS, quantile_levels=[0.5]
        )
        pred_ho = q_ho[0, :, 0].numpy().tolist()
        mape = calc_mape(actual_ho, pred_ho)

    # ── 전체 데이터로 6개월 예측 ──────────────────────────────────────────────
    ctx = torch.tensor(prices, dtype=torch.float32).unsqueeze(0)
    quantiles, mean = pipeline.predict_quantiles(
        ctx,
        prediction_length=FORECAST_MONTHS,
        quantile_levels=[0.1, 0.9],
    )
    lower_arr = quantiles[0, :, 0].numpy()
    upper_arr = quantiles[0, :, 1].numpy()
    mean_arr  = mean[0].numpy()

    last_ym = raw[-1]["year_month"]           # 'YYYY-MM'
    yr, mo  = int(last_ym[:4]), int(last_ym[5:7])

    result = []
    for i in range(FORECAST_MONTHS):
        py, pm = add_months(yr, mo, i + 1)
        result.append({
            "complex_id":            complex_id,
            "area_bucket":           bucket,
            "predicted_month":       f"{py:04d}-{pm:02d}-01",
            "predicted_price_mean":  max(1, round(float(mean_arr[i]))),
            "predicted_price_lower": max(1, round(float(lower_arr[i]))),
            "predicted_price_upper": max(1, round(float(upper_arr[i]))),
            "model_name":            MODEL_NAME_DB,
            "training_mape":         round(mape, 4),
            "training_count":        len(prices),
            "computed_at":           computed_at,
        })
    return result

# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main() -> None:
    job_start = time.monotonic()  # 데드라인 기준점 — 모델 로드·Stage 1 소요시간까지 포함
    computed_at = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[start] {computed_at}", flush=True)

    complexes   = select_paginated("complexes", "id", extra_params={"order": "id.asc"})
    complex_ids = [r["id"] for r in complexes if r.get("id")]

    print("[info] 갱신 우선순위 조회 중...", flush=True)
    last_updated = fetch_last_updated()
    # 미갱신(빈 문자열, 항상 최우선)·오래된 단지 순으로 정렬
    complex_ids.sort(key=lambda cid: last_updated.get(cid, ""))
    priority_index = {cid: i for i, cid in enumerate(complex_ids)}

    total = len(complex_ids) * len(AREA_BUCKETS)
    print(
        f"[info] 단지 {len(complex_ids)}개 × {len(AREA_BUCKETS)}버킷 = {total}조합 "
        f"(미갱신·오래된 순 우선)",
        flush=True,
    )

    # ── Stage 1: 병렬 조회 ────────────────────────────────────────────────────
    combos = [(cid, bucket) for cid in complex_ids for bucket in AREA_BUCKETS]
    qualifying: list[dict] = []
    fetch_errors = 0
    fetch_done = 0

    with ThreadPoolExecutor(max_workers=FETCH_WORKERS) as executor:
        futures = {executor.submit(fetch_history, cid, b): (cid, b) for cid, b in combos}
        for future in as_completed(futures):
            cid, bucket = futures[future]
            fetch_done += 1
            try:
                result = future.result()
                if result:
                    qualifying.append(result)
            except Exception as e:
                print(f"[warn] fetch {cid}/{bucket}: {e}", flush=True)
                fetch_errors += 1

            if fetch_done % 2000 == 0:
                print(
                    f"[fetch] {fetch_done}/{total} 조회 완료, 예측 대상 {len(qualifying)}건",
                    flush=True,
                )

    # Stage 1은 as_completed() 완료 순서라 뒤섞임 — 우선순위(오래된 단지 먼저) 순으로 재정렬
    qualifying.sort(key=lambda q: priority_index.get(q["complex_id"], len(complex_ids)))

    skipped = total - len(qualifying) - fetch_errors
    print(
        f"[info] 조회 완료 — 예측 대상 {len(qualifying)}/{total}조합 "
        f"(스킵 {skipped}, 조회오류 {fetch_errors})",
        flush=True,
    )

    # ── Stage 2: 순차 모델 추론 ───────────────────────────────────────────────
    # 데드라인은 job_start(모델 로드+Stage 1 포함) 기준 — Stage 1이 오래 걸려도
    # 90분 하드킬 전에 Stage 2가 안전하게 flush하고 종료하도록 보장
    processed = infer_errors = upsert_errors = 0
    deadline_hit = False
    pending: list[dict] = []

    def flush_pending() -> None:
        nonlocal pending, upsert_errors
        if not pending:
            return
        try:
            upsert_batch("complex_price_predictions", pending,
                         "complex_id,area_bucket,predicted_month")
        except Exception as e:
            # 재시도까지 소진한 뒤에도 실패 — 이 배치만 유실, 나머지 Stage 2는 계속 진행
            # (Stage 1의 6분대 성과를 여기서 통째로 날리지 않는 게 핵심)
            print(f"[warn] upsert 실패(재시도 소진, {len(pending)}행 유실): {e}", flush=True)
            upsert_errors += 1
        pending = []

    for i, q in enumerate(qualifying):
        if time.monotonic() - job_start > STAGE2_DEADLINE_S:
            deadline_hit = True
            print(
                f"[info] Stage 2 소프트 데드라인({STAGE2_DEADLINE_S}s) 도달 — "
                f"{i}/{len(qualifying)} 처리 후 조기 종료, 나머지는 다음 실행에서 "
                f"우선 처리됨(미갱신 우선순위 정렬)",
                flush=True,
            )
            break

        try:
            rows = run_inference(
                q["complex_id"], q["bucket"], q["raw"], q["prices"], computed_at,
            )
            pending.extend(rows)
            processed += 1
        except Exception as e:
            print(f"[warn] infer {q['complex_id']}/{q['bucket']}: {e}", flush=True)
            infer_errors += 1

        if len(pending) >= UPSERT_BATCH:
            flush_pending()

        if (i + 1) % 200 == 0:
            print(
                f"[predict] {i + 1}/{len(qualifying)}  처리:{processed}  오류:{infer_errors}",
                flush=True,
            )

    flush_pending()

    errors = fetch_errors + infer_errors + upsert_errors
    print(
        f"[done] 처리:{processed}  스킵:{skipped}  오류:{errors}"
        f"{'  (소프트 데드라인으로 조기 종료)' if deadline_hit else ''}",
        flush=True,
    )
    if errors > total * 0.1:
        print("[ERROR] 오류율 10% 초과 — 파이프라인 점검 필요", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
