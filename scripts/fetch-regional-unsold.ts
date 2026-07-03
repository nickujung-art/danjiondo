/**
 * 경상남도 미분양현황 수집 스크립트
 * 사용: npx tsx --env-file=.env.local scripts/fetch-regional-unsold.ts
 */
import { createClient } from '@supabase/supabase-js'
import { fetchGyeongnamUnsold, resolveSggCode } from '../src/services/molit-unsold'
import { getActiveRegionAddrs } from '../src/lib/data/regions'

function currentYearMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const yearMonth = currentYearMonth()
  console.log(`[fetch-regional-unsold] year_month=${yearMonth}`)
  const regionAddrs = await getActiveRegionAddrs(supabase)

  // 전체 페이지 수집 (총 432건, 1회 요청으로 충분)
  const { items, totalCount } = await fetchGyeongnamUnsold(1, 1000)
  console.log(`  API 총 건수: ${totalCount}, 수신: ${items.length}`)

  // sgg_code별 unsold_count 집계
  const agg: Record<string, number> = {}
  let skipped = 0

  for (const item of items) {
    const sggCode = resolveSggCode(item, regionAddrs)
    if (!sggCode) {
      skipped++
      continue
    }
    agg[sggCode] = (agg[sggCode] ?? 0) + item.unsoldcnt_this
  }

  console.log(`  서비스 범위 외 스킵: ${skipped}건`)
  console.log('  집계 결과:')
  for (const [code, cnt] of Object.entries(agg)) {
    console.log(`    sgg_code=${code}  unsold=${cnt}`)
  }

  // upsert
  const rows = Object.entries(agg).map(([sgg_code, unsold_count]) => ({
    sgg_code,
    year_month: yearMonth,
    unsold_count,
  }))

  const { error } = await supabase
    .from('regional_unsold')
    .upsert(rows, { onConflict: 'sgg_code,year_month' })

  if (error) {
    console.error('upsert 실패:', error.message)
    process.exit(1)
  }

  console.log(`  upsert 완료: ${rows.length}건`)
}

main().catch(e => { console.error(e); process.exit(1) })
