/**
 * kapt_code 있는 단지 중 household_count=0|null 인 단지에 K-apt API로 세대수 재보강
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/kapt-household-refetch.ts
 *   npx tsx --env-file=.env.local scripts/kapt-household-refetch.ts --dry-run
 *
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { fetchKaptBasicInfo } from '../src/services/kapt'

loadEnvConfig(process.cwd(), true)

if (!process.env.KAPT_API_KEY)               { console.error('❌ KAPT_API_KEY 없음');                process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)   { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');    process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)  { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');   process.exit(1) }

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  console.log(`🏠 K-apt 세대수 재보강 시작${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, kapt_code, household_count')
    .eq('building_type', 'apt')
    .eq('status', 'active')
    .not('kapt_code', 'is', null)
    .or('household_count.eq.0,household_count.is.null')

  if (error) throw new Error(`complexes 조회 실패: ${error.message}`)

  const rows = complexes as Array<{ id: string; canonical_name: string; kapt_code: string; household_count: number | null }>
  console.log(`📋 대상: ${rows.length}개 단지`)

  let updated = 0, notFound = 0, failed = 0

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]!
    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name} ...`)

    try {
      const info = await fetchKaptBasicInfo(c.kapt_code)
      if (!info || !info.kaptdaCnt || info.kaptdaCnt === 0) {
        console.log(`\n  ⚠️  ${c.canonical_name} — K-apt 세대수 없음 (kaptCode: ${c.kapt_code})`)
        notFound++
      } else {
        console.log(`\n  ✅ ${c.canonical_name} — ${c.household_count ?? 'null'} → ${info.kaptdaCnt}세대`)
        if (!DRY_RUN) {
          const { error: uErr } = await supabase
            .from('complexes')
            .update({ household_count: info.kaptdaCnt })
            .eq('id', c.id)
          if (uErr) throw new Error(`업데이트 실패: ${uErr.message}`)
        }
        updated++
      }
    } catch (err) {
      console.error(`\n  ❌ "${c.canonical_name}": ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 150))
  }

  console.log(`\n\n✅ 완료: ${updated}개 업데이트, ${notFound}개 K-apt 없음, ${failed}개 실패`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
