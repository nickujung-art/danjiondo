/**
 * 오피스텔 실거래가 백필 스크립트
 *
 * 실행:
 *   npx tsx scripts/backfill-officetel.ts
 *   npx tsx scripts/backfill-officetel.ts --resume           # 완료된 월 건너뜀
 *   npx tsx scripts/backfill-officetel.ts --from=201501 --to=202312
 *   npx tsx scripts/backfill-officetel.ts --sgg=48121,48123
 *
 * 필요 환경변수: MOLIT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { ingestOffiMonth } from '../src/lib/data/realprice-officetel'

loadEnvConfig(process.cwd(), true)   // true = dev mode → .env.local 로드

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

const SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']

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
  // 매매·전월세 모두 완료된 월만 skip (molit_offi_trade 기준)
  const { data } = await supabase
    .from('ingest_runs')
    .select('year_month')
    .eq('source_id', 'molit_offi_trade')
    .eq('sgg_code', sggCode)
    .eq('status', 'success')
  return new Set((data ?? []).map((r: { year_month: string }) => r.year_month))
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

  const from     = fromArg ?? defaultFrom
  const to       = toArg   ?? defaultTo
  const months   = monthRange(from, to)
  const sggCodes = sggArg ? sggArg.split(',').map(s => s.trim()) : SGG_CODES

  console.log(`📅 기간: ${from} ~ ${to} (${months.length}개월)`)
  console.log(`📍 지역: ${sggCodes.join(', ')}`)
  console.log(`🔄 Resume: ${useResume}`)

  const total = months.length * sggCodes.length
  let done = 0
  let skipped = 0
  let totalUpserted = 0

  for (const sggCode of sggCodes) {
    const completed = useResume ? await getCompletedRuns(sggCode) : new Set<string>()

    for (const ym of months) {
      if (useResume && completed.has(ym)) {
        skipped++
        done++
        continue
      }

      process.stdout.write(`\r[${done + 1}/${total}] ${sggCode} ${ym} ...`)

      try {
        const result = await ingestOffiMonth(sggCode, ym, supabase)
        totalUpserted += result.rowsUpserted
        if (result.status === 'failed') {
          console.warn(`\n  ⚠️  ${sggCode} ${ym}: ${result.status} (${result.rowsFailed}건 실패)`)
        }
      } catch (err) {
        console.error(`\n  ❌ ${sggCode} ${ym}: ${String(err)}`)
      }

      done++
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log(`\n\n✅ 완료: ${done}건 처리 (${skipped}건 skip), ${totalUpserted}건 upsert`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
