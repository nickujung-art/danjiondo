/**
 * 경상남도 미분양현황 수집 스크립트
 * 사용: npx tsx --env-file=.env.local scripts/fetch-regional-unsold.ts
 */
import { createClient } from '@supabase/supabase-js'
import { fetchGyeongnamUnsold, resolveSggCode } from '../src/services/molit-unsold'
import { getActiveRegionAddrs } from '../src/lib/data/regions'
import { markCronStatus } from '../src/lib/data/cron-status'

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

  // ㉝ 이전 월 데이터와 비교 — API가 기준월을 주지 않아 currentYearMonth()를 라벨로
  // 쓰는데, 실제 발표치가 갱신되지 않았으면 같은 숫자에 다른 월 라벨이 붙는다.
  // "3개월 연속 동일값"이 그 증상이다. 동일하면 upsert를 건너뛰고 경고한다.
  const { data: prevRows } = await supabase
    .from('regional_unsold')
    .select('sgg_code, unsold_count, year_month')
    .lt('year_month', yearMonth)
    .order('year_month', { ascending: false })
    .limit(Object.keys(agg).length)

  if (prevRows?.length) {
    const prevMap = new Map(
      (prevRows as { sgg_code: string; unsold_count: number; year_month: string }[])
        .map(r => [r.sgg_code, r]),
    )
    const allSame = Object.entries(agg).every(
      ([code, cnt]) => prevMap.get(code)?.unsold_count === cnt,
    )
    if (allSame && prevMap.size > 0) {
      const prevYm = prevRows[0].year_month
      console.warn(
        `\n  ⚠ 집계가 ${prevYm} 과 완전 동일 — API 발표치가 갱신되지 않은 것으로 판단, upsert 건너뜀`,
      )
      console.warn(`    이번 값과 동일한 마지막 월: ${prevYm}`)
      await markCronStatus(
        supabase, 'regional-unsold', 'partial',
        `${yearMonth} 집계가 ${prevYm}과 동일 — API 미갱신 추정, upsert 건너뜀`,
      )
      return
    }
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
    await markCronStatus(supabase, 'regional-unsold', 'failed', error.message)
    process.exit(1)
  }

  console.log(`  upsert 완료: ${rows.length}건`)
  await markCronStatus(supabase, 'regional-unsold', 'success')
}

main().catch(e => { console.error(e); process.exit(1) })
