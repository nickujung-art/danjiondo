import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const REGIONS = [
  { sgg_code: '48121', sgg_name: '창원시 의창구',    si: '창원시', gu: '의창구' },
  { sgg_code: '48123', sgg_name: '창원시 성산구',    si: '창원시', gu: '성산구' },
  { sgg_code: '48125', sgg_name: '창원시 마산합포구', si: '창원시', gu: '마산합포구' },
  { sgg_code: '48127', sgg_name: '창원시 마산회원구', si: '창원시', gu: '마산회원구' },
  { sgg_code: '48129', sgg_name: '창원시 진해구',    si: '창원시', gu: '진해구' },
  { sgg_code: '48250', sgg_name: '김해시',           si: '김해시', gu: null },
  { sgg_code: '48170', sgg_name: '진주시', si: '진주시', gu: null },
  { sgg_code: '48220', sgg_name: '통영시', si: '통영시', gu: null },
  { sgg_code: '48240', sgg_name: '사천시', si: '사천시', gu: null },
  { sgg_code: '48270', sgg_name: '밀양시', si: '밀양시', gu: null },
  { sgg_code: '48310', sgg_name: '거제시', si: '거제시', gu: null },
  { sgg_code: '48330', sgg_name: '양산시', si: '양산시', gu: null },
  { sgg_code: '48720', sgg_name: '의령군', si: '의령군', gu: null },
  { sgg_code: '48730', sgg_name: '함안군', si: '함안군', gu: null },
  { sgg_code: '48740', sgg_name: '창녕군', si: '창녕군', gu: null },
  { sgg_code: '48820', sgg_name: '고성군', si: '고성군', gu: null },
  { sgg_code: '48840', sgg_name: '남해군', si: '남해군', gu: null },
  { sgg_code: '48850', sgg_name: '하동군', si: '하동군', gu: null },
  { sgg_code: '48860', sgg_name: '산청군', si: '산청군', gu: null },
  { sgg_code: '48870', sgg_name: '함양군', si: '함양군', gu: null },
  { sgg_code: '48880', sgg_name: '거창군', si: '거창군', gu: null },
  { sgg_code: '48890', sgg_name: '합천군', si: '합천군', gu: null },
] as const

const DATA_SOURCES = [
  { id: 'molit_trade',  cadence: 'daily',     expected_freshness_hours: 48,   ui_label: '전일 기준' },
  { id: 'molit_rent',   cadence: 'daily',     expected_freshness_hours: 48,   ui_label: '전일 기준' },
  { id: 'kapt',         cadence: 'monthly',   expected_freshness_hours: 1080, ui_label: '전월 기준' },
  { id: 'school_alimi', cadence: 'quarterly', expected_freshness_hours: 2400, ui_label: '분기 기준' },
  { id: 'kakao_poi',    cadence: 'quarterly', expected_freshness_hours: 2400, ui_label: '분기 기준' },
  { id: 'juso',         cadence: 'event',     expected_freshness_hours: 168,  ui_label: '갱신 기준' },
] as const

async function main() {
  console.log('🌱 Seeding data_sources...')
  const { error: dsErr } = await client
    .from('data_sources')
    .upsert([...DATA_SOURCES], { onConflict: 'id' })
  if (dsErr) throw new Error(`data_sources seed failed: ${dsErr.message}`)

  const { count: dsCount } = await client
    .from('data_sources')
    .select('*', { count: 'exact', head: true })
  console.log(`  ✓ data_sources: ${dsCount}건`)

  console.log('🌱 Seeding regions...')
  const { error: regErr } = await client
    .from('regions')
    .upsert([...REGIONS], { onConflict: 'sgg_code' })
  if (regErr) throw new Error(`regions seed failed: ${regErr.message}`)

  const { count: regCount } = await client
    .from('regions')
    .select('*', { count: 'exact', head: true })
  console.log(`  ✓ regions: ${regCount}건`)

  console.log('✅ Seed complete.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
