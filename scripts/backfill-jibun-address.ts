/**
 * 부산 complexes jibun_address 백필 (K-apt kaptAddr → complexes.jibun_address)
 *
 * 실행: npx tsx scripts/backfill-jibun-address.ts [--sgg-prefix=26] [--dry-run]
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * kapt-enrich.ts가 doroJuso → road_address만 쓰고 kaptAddr → jibun_address를 빠뜨렸다.
 * 이 스크립트는 kapt_code가 있고 jibun_address가 없는 단지를 K-apt API로 채운다.
 */
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fetchKaptBasicInfoDetailed } from '../src/services/kapt'

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') })

if (!process.env.KAPT_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('필요: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const sggPrefix = process.argv.find(a => a.startsWith('--sgg-prefix='))?.split('=')[1] ?? null
const dryRun = process.argv.includes('--dry-run')

async function fetchAllTargets() {
  const PAGE_SIZE = 1000
  const all: { id: string; kapt_code: string; canonical_name: string; sgg_code: string }[] = []
  let from = 0

  while (true) {
    let query = supabase
      .from('complexes')
      .select('id, kapt_code, canonical_name, sgg_code')
      .not('kapt_code', 'is', null)
      .or('jibun_address.is.null,jibun_address.eq.')
      .order('sgg_code')
      .range(from, from + PAGE_SIZE - 1)

    if (sggPrefix) query = query.like('sgg_code', `${sggPrefix}%`)

    const { data, error } = await query
    if (error) { console.error('쿼리 실패:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

async function main() {
  const targets = await fetchAllTargets()
  if (targets.length === 0) { console.log('백필 대상 없음'); return }

  console.log(`== jibun_address 백필 시작 ==`)
  console.log(`대상: ${targets.length}건${sggPrefix ? ` (sgg_code: ${sggPrefix}xxx)` : ''}`)
  if (dryRun) console.log('⚠️  DRY RUN — DB 갱신 없음')
  console.log()

  let updated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    process.stdout.write(`\r[${i + 1}/${targets.length}] ${t.canonical_name ?? t.kapt_code}`)

    try {
      const result = await fetchKaptBasicInfoDetailed(t.kapt_code)
      if (!result.ok) {
        skipped++
        continue
      }

      const jibun = result.data.kaptAddr
      const road = result.data.doroJuso
      if (!jibun && !road) { skipped++; continue }

      if (dryRun) {
        if (jibun) console.log(`\n  → ${t.canonical_name}: jibun=${jibun}`)
        updated++
        continue
      }

      const patch: Record<string, string | null> = {}
      if (jibun) patch.jibun_address = jibun
      if (road) patch.road_address = road

      const { error: updateErr } = await supabase
        .from('complexes')
        .update(patch)
        .eq('id', t.id)

      if (updateErr) {
        console.warn(`\n  ⚠️  ${t.canonical_name} 갱신 실패: ${updateErr.message}`)
        failed++
      } else {
        updated++
      }
    } catch (err) {
      console.warn(`\n  ❌ ${t.canonical_name}: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n\n== 완료 ==`)
  console.log(`갱신: ${updated} / 스킵: ${skipped} / 실패: ${failed} / 총: ${targets.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
