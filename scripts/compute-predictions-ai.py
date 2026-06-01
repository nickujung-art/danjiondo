#!/usr/bin/env python3
"""
AI 가격 예측 배치 — Amazon Chronos-Bolt-Small

단지 × area_bucket 별 6개월 예측 → complex_price_predictions upsert
model_name = 'chronos-bolt-small'

기존 Holt-Winters 배치(02:00 KST) 이후 03:00 KST에 실행.
같은 UNIQUE 키(complex_id, area_bucket, predicted_month)로 upsert하므로
Chronos 결과가 Holt-Winters 결과를 덮어씁니다.

환경변수:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
import datetime

import requests
import torch
import numpy as np
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

AREA_BUCKETS     = ["소형", "59", "84", "대형"]
MIN_MONTHS       = 6       # 예측 최소 학습 월
MIN_TX_TOTAL     = 10      # 누적 거래 건수 최소값
FORECAST_MONTHS  = 6       # 예측 기간
HOLDOUT_MONTHS   = 6       # MAPE 계산용 hold-out
MODEL_HF_ID      = "amazon/chronos-bolt-small"
MODEL_NAME_DB    = "chronos-bolt-small"
PAGE_SIZE        = 1000
UPSERT_BATCH     = 200     # DB upsert 묶음 크기

# ─── Supabase REST 헬퍼 ───────────────────────────────────────────────────────

def rpc(fn: str, params: dict) -> list:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        headers=HEADERS,
        json=params,
        timeout=30,
    )
    r.raise_for_status()
    return r.json() or []


def select_paginated(table: str, columns: str) -> list:
    rows, offset = [], 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**HEADERS, "Range-Unit": "items",
                     "Range": f"{offset}-{offset + PAGE_SIZE - 1}"},
            params={"select": columns},
            timeout=30,
        )
        r.raise_for_status()
        chunk = r.json() or []
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def upsert_batch(table: str, rows: list, on_conflict: str = "") -> None:
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    r = requests.post(
        url,
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=rows,
        timeout=60,
    )
    r.raise_for_status()

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

# ─── 모델 로드 ────────────────────────────────────────────────────────────────

print(f"[init] 모델 로드: {MODEL_HF_ID}", flush=True)
pipeline = ChronosBoltPipeline.from_pretrained(
    MODEL_HF_ID,
    device_map="cpu",
    dtype=torch.float32,
)
print("[init] 모델 준비 완료", flush=True)

# ─── 단지×버킷 예측 ───────────────────────────────────────────────────────────

def process_bucket(
    complex_id: str,
    bucket: str,
    computed_at: str,
) -> list[dict] | None:

    # 실거래 이력 조회 (전체 데이터)
    raw = rpc("compute_predictions", {
        "p_complex_id":  complex_id,
        "p_area_bucket": bucket,
        "p_months":      None,
    })
    if not raw:
        return None

    raw   = sorted(raw, key=lambda r: r["year_month"])
    prices = [float(r["avg_price"]) for r in raw]
    tx_sum = sum(int(r["tx_count"]) for r in raw)

    if len(prices) < MIN_MONTHS or tx_sum < MIN_TX_TOTAL:
        return None

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
    # quantiles: (1, FORECAST_MONTHS, 2)  /  mean: (1, FORECAST_MONTHS)
    lower_arr = quantiles[0, :, 0].numpy()
    upper_arr = quantiles[0, :, 1].numpy()
    mean_arr  = mean[0].numpy()

    # ── 예측 월 계산 ─────────────────────────────────────────────────────────
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
    computed_at = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[start] {computed_at}", flush=True)

    complexes   = select_paginated("complexes", "id")
    complex_ids = [r["id"] for r in complexes if r.get("id")]
    total       = len(complex_ids) * len(AREA_BUCKETS)
    print(f"[info] 단지 {len(complex_ids)}개 × {len(AREA_BUCKETS)}버킷 = {total}조합", flush=True)

    processed = skipped = errors = 0
    pending: list[dict] = []

    for ci, cid in enumerate(complex_ids):
        for bucket in AREA_BUCKETS:
            try:
                rows = process_bucket(cid, bucket, computed_at)
                if rows:
                    pending.extend(rows)
                    processed += 1
                else:
                    skipped += 1
            except Exception as e:
                print(f"[warn] {cid}/{bucket}: {e}", flush=True)
                errors += 1

            if len(pending) >= UPSERT_BATCH:
                upsert_batch("complex_price_predictions", pending,
                             "complex_id,area_bucket,predicted_month")
                pending = []

        if (ci + 1) % 50 == 0:
            done = (ci + 1) * len(AREA_BUCKETS)
            pct  = done / total * 100
            print(
                f"[progress] {done}/{total} ({pct:.0f}%)"
                f"  처리:{processed}  스킵:{skipped}  오류:{errors}",
                flush=True,
            )

    if pending:
        upsert_batch("complex_price_predictions", pending,
                     "complex_id,area_bucket,predicted_month")

    print(
        f"[done] 처리:{processed}  스킵:{skipped}  오류:{errors}",
        flush=True,
    )
    if errors > total * 0.1:
        print("[ERROR] 오류율 10% 초과 — 파이프라인 점검 필요", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
