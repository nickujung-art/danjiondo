/**
 * complexes.jibun_address 백필 (KAPT API kaptAddr 사용)
 *
 * jibun_address IS NULL인 active 단지에 KAPT 법정동주소를 채운다.
 * 완료 후 link-transactions.ts를 재실행하면 jibun 기반 매칭이 동작한다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts --limit=100
 *
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { fetchKaptBasicInfo } from '../src/services/kapt'

loadEnvConfig(process.cwd(), true)

const KAPT_API_KEY      = process.env.KAPT_API_KEY
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SRV_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KAPT_API_KEY)     { console.error('❌ KAPT_API_KEY 없음');              process.exit(1) }
if (!SUPABASE_URL)     { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');   process.exit(1) }
if (!SUPABASE_SRV_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');  process.exit(1) }

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT   = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10000

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SRV_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const BATCH_DELAY_MS = 120  // KAPT API 과부하 방지

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  console.log(`== complexes.jibun_address 백필 시작 ${DRY_RUN ? '[DRY-RUN]' : ''} ==`)

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, kapt_code')
    .eq('status', 'active')
    .not('kapt_code', 'is', null)
    .is('jibun_address', null)
    .limit(LIMIT)

  if (error) { console.error(`조회 실패: ${error.message}`); process.exit(1) }

  const rows = complexes ?? []
  console.log(`대상: ${rows.length}건`)
  if (rows.length === 0) { console.log('처리할 항목 없음.'); return }

  let updated = 0, skipped = 0, failed = 0

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i] as { id: string; canonical_name: string; kapt_code: string }
    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name.padEnd(30)} 업데이트: ${updated} 스킵: ${skipped} 실패: ${failed}`)

    let info: Awaited<ReturnType<typeof fetchKaptBasicInfo>>
    try {
      info = await fetchKaptBasicInfo(c.kapt_code)
    } catch (err) {
      console.warn(`\n  ⚠ API 오류 (${c.kapt_code} ${c.canonical_name}): ${String(err)}`)
      failed++
      await sleep(BATCH_DELAY_MS)
      continue
    }

    const jibunAddress = info?.kaptAddr ?? null
    if (!jibunAddress) {
      skipped++
      await sleep(BATCH_DELAY_MS)
      continue
    }

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('complexes')
        .update({ jibun_address: jibunAddress })
        .eq('id', c.id)
        .is('jibun_address', null)  // 이미 채워진 경우 덮어쓰기 방지

      if (updateError) {
        console.warn(`\n  ⚠ UPDATE 실패 (${c.canonical_name}): ${updateError.message}`)
        failed++
        await sleep(BATCH_DELAY_MS)
        continue
      }
    }

    updated++
    await sleep(BATCH_DELAY_MS)
  }

  console.log('\n')
  console.log('== 완료 ==')
  console.log(`업데이트: ${updated}건 | 주소없음 스킵: ${skipped}건 | 실패: ${failed}건`)
  if (DRY_RUN) console.log('(dry-run — DB 변경 없음)')
}

main().catch((err: unknown) => {
  console.error('스크립트 실행 실패:', err)
  process.exit(1)
})
