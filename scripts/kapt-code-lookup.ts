/**
 * kapt_code 조회 스크립트
 *
 * kapt_code가 없는 단지들을 K-apt 단지목록 API에서 이름 매칭으로 찾아 DB에 업데이트한다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/kapt-code-lookup.ts
 *   npx tsx --env-file=.env.local scripts/kapt-code-lookup.ts --dry-run
 *
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { fetchComplexList } from '../src/services/kapt'

loadEnvConfig(process.cwd(), true)

if (!process.env.KAPT_API_KEY)              { console.error('❌ KAPT_API_KEY 없음');              process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)  { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');  process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/** 한글 이름에서 공백·특수문자 제거 */
function normalize(s: string) {
  return s.replace(/\s/g, '').toLowerCase()
}

/** 매칭 기준: 완전일치 또는 한쪽이 다른쪽을 포함 (단, 포함되는 쪽이 4글자 이상일 때만) */
function isMatch(dbName: string, kaptName: string): boolean {
  const a = normalize(dbName)
  const b = normalize(kaptName)
  if (a === b) return true
  if (a.length >= 4 && b.includes(a)) return true
  if (b.length >= 4 && a.includes(b)) return true
  return false
}

async function main() {
  console.log(`🔍 kapt_code 조회 시작${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  // kapt_code가 없는 active 단지 조회
  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code')
    .eq('status', 'active')
    .is('kapt_code', null)
    .in('sgg_code', ['48121', '48123', '48125', '48127', '48129', '48250'])

  if (error) throw new Error(`조회 실패: ${error.message}`)
  const rows = (complexes ?? []) as Array<{ id: string; canonical_name: string; sgg_code: string }>
  console.log(`📋 대상: ${rows.length}개 단지 (kapt_code 없음)\n`)

  // sgg_code별 K-apt 단지목록 캐시
  const kaptCache = new Map<string, Array<{ kaptCode: string; kaptName: string }>>()
  const sggCodes = [...new Set(rows.map(r => r.sgg_code))]

  for (const sgg of sggCodes) {
    process.stdout.write(`K-apt 단지목록 조회: ${sgg} ...`)
    const list = await fetchComplexList(sgg)
    kaptCache.set(sgg, list.map(c => ({ kaptCode: c.kaptCode, kaptName: c.kaptName })))
    console.log(` ${list.length}개`)
    await new Promise(r => setTimeout(r, 200))
  }

  console.log()
  let found = 0, notFound = 0

  for (const c of rows) {
    const list = kaptCache.get(c.sgg_code) ?? []
    const matches = list.filter(k => isMatch(c.canonical_name, k.kaptName))

    if (matches.length === 1) {
      const m = matches[0]!
      console.log(`  ✅ ${c.canonical_name} → ${m.kaptCode} (${m.kaptName})`)
      if (!DRY_RUN) {
        const { error: uErr } = await supabase
          .from('complexes').update({ kapt_code: m.kaptCode }).eq('id', c.id)
        if (uErr) console.error(`    ❌ 업데이트 실패: ${uErr.message}`)
      }
      found++
    } else if (matches.length > 1) {
      console.log(`  ⚠️  ${c.canonical_name} → 후보 ${matches.length}개: ${matches.map(m => m.kaptName).join(', ')}`)
      notFound++
    }
    // 0개 매칭은 조용히 넘김 (K-apt 미등록 단지)
  }

  console.log(`\n✅ 완료: ${found}개 업데이트, ${notFound}개 중복/미발견`)
  console.log(`💡 업데이트 후 kapt-enrich.ts를 실행하면 세대수·준공년도가 보강됩니다`)
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
