/**
 * 전체 단지 × 4 area_bucket 예측 배치 스크립트
 *
 * 실행:
 *   npx tsx scripts/compute-predictions.ts
 *
 * 필요 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 동작:
 *  1. complexes 테이블에서 전체 complex_id 조회 (페이지네이션)
 *  2. 각 단지 × 4 area_bucket 조합에 대해 compute_predictions RPC 호출
 *  3. tx_count 합계 < 10 이면 스킵 (D-02 준수)
 *  4. forecast() 로 6개월 예측 계산
 *  5. complex_price_predictions 에 upsert
 *  6. 에러 발생 시 process.exit(1) (GitHub Actions 알림 트리거)
 */

import { createClient } from '@supabase/supabase-js'
import { forecast } from '../src/lib/prediction/engine'
import type { PricePoint } from '../src/lib/prediction/engine'

// ─── 환경변수 ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '[ERROR] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const AREA_BUCKETS = ['소형', '59', '74', '84', '대형'] as const
type AreaBucket = (typeof AREA_BUCKETS)[number]

const PAGE_SIZE = 1000
const MIN_TX_COUNT = 10
const FORECAST_HORIZON = 12

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface RpcRow {
  year_month: string
  avg_price: number | string
  tx_count: number | string
}

interface PredictionRow {
  complex_id: string
  area_bucket: string
  predicted_month: string
  predicted_price_mean: number
  predicted_price_lower: number
  predicted_price_upper: number
  model_name: string
  training_mape: number
  training_count: number
  computed_at: string
}

// ─── 단지 ID 목록 조회 (페이지네이션) ────────────────────────────────────────

async function fetchAllComplexIds(): Promise<string[]> {
  const ids: string[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('complexes')
      .select('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`complexes 조회 실패: ${error.message}`)
    }

    if (!data || data.length === 0) break

    for (const row of data) {
      if (row.id) ids.push(row.id)
    }

    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return ids
}

// ─── 단지 × area_bucket 예측 처리 ────────────────────────────────────────────

async function processBucket(
  complexId: string,
  areaBucket: AreaBucket,
  computedAt: string,
): Promise<{ skipped: boolean; rows: PredictionRow[] }> {
  // compute_predictions RPC 호출
  const { data, error } = await supabase.rpc('compute_predictions', {
    p_complex_id: complexId,
    p_area_bucket: areaBucket,
    p_months: 30,
  })

  if (error) {
    throw new Error(
      `RPC 오류 (${complexId}, ${areaBucket}): ${error.message}`,
    )
  }

  const rows: RpcRow[] = (data as RpcRow[]) ?? []

  // tx_count 합산 — D-02: 10건 미만이면 스킵
  const totalTxCount = rows.reduce(
    (sum, r) => sum + Number(r.tx_count),
    0,
  )

  if (totalTxCount < MIN_TX_COUNT) {
    return { skipped: true, rows: [] }
  }

  // PricePoint 변환
  const pricePoints: PricePoint[] = rows
    .filter((r) => r.year_month && Number(r.avg_price) > 0)
    .map((r) => ({
      yearMonth: r.year_month,
      avgPrice: Number(r.avg_price),
      txCount: Number(r.tx_count),
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

  // 예측 계산
  const result = forecast(pricePoints, FORECAST_HORIZON)

  if (!result) {
    return { skipped: true, rows: [] }
  }

  // upsert 행 변환
  const predictionRows: PredictionRow[] = result.forecasts.map((f) => ({
    complex_id: complexId,
    area_bucket: areaBucket,
    predicted_month: `${f.yearMonth}-01`, // 월 첫날 정규화
    predicted_price_mean: Math.round(f.mean),
    predicted_price_lower: Math.round(f.lower),
    predicted_price_upper: Math.round(f.upper),
    model_name: result.modelName,
    training_mape: result.trainingMape,
    training_count: result.trainingCount,
    computed_at: computedAt,
  }))

  return { skipped: false, rows: predictionRows }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[INFO] compute-predictions 시작')

  const computedAt = new Date().toISOString()
  const errors: string[] = []
  let processed = 0
  let skipped = 0

  // 1. 전체 단지 ID 조회
  let complexIds: string[]
  try {
    complexIds = await fetchAllComplexIds()
  } catch (err) {
    console.error('[ERROR] complexes 조회 실패:', err)
    process.exit(1)
  }

  const total = complexIds.length
  console.log(`[INFO] 총 ${total}개 단지 처리 시작`)

  // 2. 단지별 순차 처리 (Supabase 연결 풀 보호)
  for (let idx = 0; idx < complexIds.length; idx++) {
    const complexId = complexIds[idx]!

    if (idx % 100 === 0) {
      console.log(
        `[INFO] complex ${idx}/${total} — processed: ${processed}, skipped: ${skipped}, errors: ${errors.length}`,
      )
    }

    try {
      // area_bucket 4개는 Promise.all()로 병렬 처리
      const results = await Promise.all(
        AREA_BUCKETS.map((bucket) =>
          processBucket(complexId, bucket, computedAt),
        ),
      )

      // 생성된 예측 행 모두 수집
      const allRows: PredictionRow[] = []
      for (const r of results) {
        if (r.skipped) {
          skipped++
        } else {
          allRows.push(...r.rows)
        }
      }

      // upsert
      if (allRows.length > 0) {
        const { error: upsertError } = await supabase
          .from('complex_price_predictions')
          .upsert(allRows, {
            onConflict: 'complex_id,area_bucket,predicted_month',
          })

        if (upsertError) {
          throw new Error(`upsert 오류 (${complexId}): ${upsertError.message}`)
        }
      }

      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`[complex ${complexId}] ${msg}`)
      // 단일 단지 실패 시 전체 중단하지 않음 — 에러 수집 후 계속 진행
    }
  }

  // 3. 최종 요약 출력
  console.log(
    `[INFO] 완료 — 총 ${processed}개 단지 처리, ${skipped}개 스킵, ${errors.length}개 에러`,
  )

  if (errors.length > 0) {
    console.error('[ERROR] 발생한 에러 목록:')
    for (const e of errors) {
      console.error(' -', e)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[FATAL]', err)
  process.exit(1)
})
