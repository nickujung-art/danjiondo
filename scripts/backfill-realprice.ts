/**
 * 국토부 실거래가 10년 백필 스크립트
 *
 * 실행:
 *   npx tsx scripts/backfill-realprice.ts                     # 아파트 + 연립다세대 모두
 *   npx tsx scripts/backfill-realprice.ts --apt               # 아파트만
 *   npx tsx scripts/backfill-realprice.ts --villa             # 연립다세대만
 *   npx tsx scripts/backfill-realprice.ts --resume            # 완료된 월 건너뜀
 *   npx tsx scripts/backfill-realprice.ts --from=201501 --to=202312
 *   npx tsx scripts/backfill-realprice.ts --sgg=48121,48123
 *
 * 필요 환경변수: MOLIT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * API 한도: 일 10,000회 → 100건/페이지, 월 최대 수십 페이지 → 지역×월 단위 조절
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { ingestMonth, ingestMonthVilla } from '../src/lib/data/realprice'

loadEnvConfig(process.cwd())

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const args = process.argv.slice(2)
const useResume = args.includes('--resume')
const fromArg   = args.find(a => a.startsWith('--from='))?.split('=')[1]
const toArg     = args.find(a => a.startsWith('--to='))?.split('=')[1]
const sggArg    = args.find(a => a.startsWith('--sgg='))?.split('=')[1]

// --apt: 아파트만 / --villa: 연립다세대만 / 둘 다 없으면: 모두 실행
const useVilla = args.includes('--villa') || !args.includes('--apt')
const useApt   = args.includes('--apt')   || !args.includes('--villa')

function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  let [y, m] = [parseInt(from.slice(0, 4), 10), parseInt(from.slice(4, 6), 10)]
  const [ey, em] = [parseInt(to.slice(0, 4), 10), parseInt(to.slice(4, 6), 10)]
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

async function getCompletedRuns(sggCode: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('ingest_runs')
    .select('year_month')
    .eq('source_id', 'molit_trade')
    .eq('sgg_code', sggCode)
    .eq('status', 'success')
  return new Set((data ?? []).map((r: { year_month: string }) => r.year_month))
}

async function getCompletedVillaRuns(sggCode: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('ingest_runs')
    .select('year_month')
    .eq('source_id', 'molit_villa_trade')
    .eq('sgg_code', sggCode)
    .eq('status', 'success')
  return new Set((data ?? []).map((r: { year_month: string }) => r.year_month))
}

async function getSggCodes(): Promise<string[]> {
  if (sggArg) return sggArg.split(',').map(s => s.trim())
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r: { sgg_code: string }) => r.sgg_code)
}

async function main() {
  if (!process.env.MOLIT_API_KEY) {
    console.error('❌ MOLIT_API_KEY 환경변수 필요')
    process.exit(1)
  }

  const now = new Date()
  const defaultTo   = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), 1)
  const defaultFrom = `${tenYearsAgo.getFullYear()}${String(tenYearsAgo.getMonth() + 1).padStart(2, '0')}`

  const from    = fromArg ?? defaultFrom
  const to      = toArg   ?? defaultTo
  const months  = monthRange(from, to)
  const sggCodes = await getSggCodes()

  const modes: string[] = []
  if (useApt) modes.push('아파트')
  if (useVilla) modes.push('연립다세대')

  console.log(`📅 기간: ${from} ~ ${to} (${months.length}개월)`)
  console.log(`📍 지역: ${sggCodes.join(', ')}`)
  console.log(`🏠 대상: ${modes.join(' + ')}`)
  console.log(`🔄 Resume: ${useResume}`)

  // apt + villa 둘 다 실행 시 total을 2배로 계산
  const modeCount = (useApt ? 1 : 0) + (useVilla ? 1 : 0)
  const total = months.length * sggCodes.length * modeCount
  let done = 0
  let skipped = 0
  let totalUpserted = 0

  for (const sggCode of sggCodes) {
    if (useApt) {
      const completed = useResume ? await getCompletedRuns(sggCode) : new Set<string>()

      for (const ym of months) {
        if (useResume && completed.has(ym)) {
          skipped++
          done++
          continue
        }

        process.stdout.write(`\r[${done + 1}/${total}] apt ${sggCode} ${ym} ...`)

        try {
          const result = await ingestMonth(sggCode, ym, supabase)
          totalUpserted += result.rowsUpserted
          if (result.status === 'failed') {
            console.warn(`\n  ⚠️  apt ${sggCode} ${ym}: ${result.status} (${result.rowsFailed}건 실패)`)
          }
        } catch (err) {
          console.error(`\n  ❌ apt ${sggCode} ${ym}: ${String(err)}`)
        }

        done++

        // API 한도 보호: 지역·월 단위 사이 짧은 대기 (rate limit)
        await new Promise(r => setTimeout(r, 200))
      }
    }

    if (useVilla) {
      const completedVilla = useResume ? await getCompletedVillaRuns(sggCode) : new Set<string>()

      for (const ym of months) {
        if (useResume && completedVilla.has(ym)) {
          skipped++
          done++
          continue
        }

        process.stdout.write(`\r[${done + 1}/${total}] villa ${sggCode} ${ym} ...`)

        try {
          const result = await ingestMonthVilla(sggCode, ym, supabase)
          totalUpserted += result.rowsUpserted
          if (result.status === 'failed') {
            console.warn(`\n  ⚠️  villa ${sggCode} ${ym}: ${result.status} (${result.rowsFailed}건 실패)`)
          }
        } catch (err) {
          console.error(`\n  ❌ villa ${sggCode} ${ym}: ${String(err)}`)
        }

        done++

        // API 한도 보호: 지역·월 단위 사이 짧은 대기 (rate limit)
        await new Promise(r => setTimeout(r, 200))
      }
    }
  }

  console.log(`\n\n✅ 완료: ${done}건 처리 (${skipped}건 skip), ${totalUpserted}건 upsert`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
