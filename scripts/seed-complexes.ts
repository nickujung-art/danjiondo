/**
 * 창원·김해 아파트 단지 마스터 시드 (K-apt API → complexes 테이블)
 *
 * 실행:
 *   npx tsx scripts/seed-complexes.ts
 *   npx tsx scripts/seed-complexes.ts --sgg=26110,26140   # 지정 지역만 시딩 (전체 재시딩 회피)
 *   npx tsx scripts/seed-complexes.ts --bootstrap   # API 없이 bootstrap SQL만 적재
 *
 * 필요 환경변수: KAPT_API_KEY (없으면 --bootstrap 모드로 자동 전환)
 *
 * ⚠️ --sgg 가 있는 이유(41-03): `seedComplex()` 의 UPDATE 경로가 `built_year` 를 무조건
 * null 로 덮어쓴다(`raw.kaptUseApproveYmd` 가 `KaptComplex` 스키마에 없어 항상 null이다).
 * `--sgg` 없이 돌리면 `regions.is_active=true` 전체가 대상이 되어 **이미 보강된 지역의
 * built_year 가 리셋된다** — Phase 34 가 실제로 겪고 `kapt-enrich.ts` 를 10회 반복 실행해
 * 복구했다(34-03-SUMMARY.md "Deviations from Plan" #3). `seedComplex()` 자체의 무조건
 * 덮어쓰기를 고치는 것은 이 스크립트의 범위 밖이다 — `--sgg` 로 사정거리를 좁히는 것이 대응이다.
 *
 * 🔴 `KAPT_API_KEY` 가 안 잡히면 `useBootstrap` 이 자동으로 켜져 `runBootstrap()` 이 실행된다
 * — **창원·김해 샘플 10건만 upsert** 하고 "성공"으로 끝난다. `--sgg` 로 다른 지역(예: 부산)을
 * 시딩하려는 실행에서 이 경로를 타면 조용한 오작동이다. 실행 로그에 "🔧 Bootstrap 모드"가
 * 보이면 즉시 중단할 것.
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { fetchComplexList } from '../src/services/kapt'
import { seedComplex, type SeedComplexInput } from '../src/lib/data/complex-matching'
import { nameNormalize } from '../src/lib/data/name-normalize'
import { parseSggCodes } from '../src/lib/data/backfill-args'

loadEnvConfig(process.cwd())

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface FailureRecord {
  sgg_code: string
  raw_name: string
  reason: string
}

async function getSggCodes(sggCodes: string[] | undefined): Promise<string[]> {
  if (sggCodes) return sggCodes
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r: { sgg_code: string }) => r.sgg_code)
}

async function runWithApi(sggCodes: string[]): Promise<void> {
  const failures: FailureRecord[] = []
  let totalUpserted = 0

  for (const sggCode of sggCodes) {
    console.log(`\n📍 ${sggCode} 단지 목록 조회 중...`)
    let complexes
    try {
      complexes = await fetchComplexList(sggCode)
    } catch (err) {
      console.error(`  ❌ ${sggCode} API 오류: ${String(err)}`)
      failures.push({ sgg_code: sggCode, raw_name: '', reason: String(err) })
      continue
    }

    console.log(`  → ${complexes.length}건 수신`)
    let sggUpserted = 0

    for (const c of complexes) {
      try {
        await seedComplex({ ...c, sggCode }, supabase)
        sggUpserted++
      } catch (err) {
        failures.push({ sgg_code: sggCode, raw_name: c.kaptName, reason: String(err) })
      }
    }

    console.log(`  ✓ ${sggUpserted}건 upsert 완료`)
    totalUpserted += sggUpserted
  }

  console.log(`\n✅ 총 ${totalUpserted}건 upsert 완료`)

  if (failures.length > 0) {
    const csvPath = join(process.cwd(), 'scripts', 'seed-failures.csv')
    const csv = [
      'sgg_code,raw_name,reason',
      ...failures.map(f => `"${f.sgg_code}","${f.raw_name}","${f.reason.replace(/"/g, '""')}"`),
    ].join('\n')
    writeFileSync(csvPath, csv, 'utf-8')
    console.warn(`⚠️  실패 ${failures.length}건 → ${csvPath}`)
  }
}

async function runBootstrap(): Promise<void> {
  console.log('\n🔧 Bootstrap 모드: supabase/seed/complexes_bootstrap.sql 적재')

  const { data: regions } = await supabase.from('regions').select('sgg_code, si, gu')
  const regionMap = new Map(
    (regions ?? []).map((r: { sgg_code: string; si: string; gu: string | null }) => [
      r.sgg_code,
      { si: r.si, gu: r.gu },
    ]),
  )

  // bootstrap 샘플 데이터 (실제 API 결과로 교체 예정)
  const BOOTSTRAP_COMPLEXES = [
    { kaptCode: 'K4812100001', kaptName: '창원더샵아파트',      doroJuso: '경상남도 창원시 의창구 용지로 100', kaptdaCnt: 1200, kaptUseApproveYmd: '20050301', sggCode: '48121' },
    { kaptCode: 'K4812100002', kaptName: '창원센트럴자이아파트', doroJuso: '경상남도 창원시 의창구 의창대로 200', kaptdaCnt: 850, kaptUseApproveYmd: '20120601', sggCode: '48121' },
    { kaptCode: 'K4812100003', kaptName: '창원반도유보라아파트', doroJuso: '경상남도 창원시 의창구 팔용로 50',  kaptdaCnt: 640, kaptUseApproveYmd: '20180901', sggCode: '48121' },
    { kaptCode: 'K4812300001', kaptName: '성산자이아파트',       doroJuso: '경상남도 창원시 성산구 가음정로 10', kaptdaCnt: 990, kaptUseApproveYmd: '20080401', sggCode: '48123' },
    { kaptCode: 'K4812300002', kaptName: '창원롯데캐슬아파트',   doroJuso: '경상남도 창원시 성산구 중앙대로 300', kaptdaCnt: 1100, kaptUseApproveYmd: '20150201', sggCode: '48123' },
    { kaptCode: 'K4812500001', kaptName: '마산합포e편한세상아파트', doroJuso: '경상남도 창원시 마산합포구 3·15대로 50', kaptdaCnt: 720, kaptUseApproveYmd: '20110701', sggCode: '48125' },
    { kaptCode: 'K4812700001', kaptName: '마산회원래미안아파트',  doroJuso: '경상남도 창원시 마산회원구 회원로 20', kaptdaCnt: 880, kaptUseApproveYmd: '20031201', sggCode: '48127' },
    { kaptCode: 'K4812900001', kaptName: '진해웅동푸르지오아파트', doroJuso: '경상남도 창원시 진해구 충장로 100', kaptdaCnt: 760, kaptUseApproveYmd: '20160501', sggCode: '48129' },
    { kaptCode: 'K4825000001', kaptName: '김해장유더샵아파트',    doroJuso: '경상남도 김해시 장유로 200',       kaptdaCnt: 1350, kaptUseApproveYmd: '20190801', sggCode: '48250' },
    { kaptCode: 'K4825000002', kaptName: '김해율하자이아파트',    doroJuso: '경상남도 김해시 율하로 50',        kaptdaCnt: 1050, kaptUseApproveYmd: '20201101', sggCode: '48250' },
  ]

  let upserted = 0
  for (const c of BOOTSTRAP_COMPLEXES) {
    const region = regionMap.get(c.sggCode)
    await seedComplex({ ...c, ...region } as SeedComplexInput, supabase)
    upserted++
  }

  console.log(`  ✓ bootstrap ${upserted}건 upsert 완료`)
  console.log('\n💡 실제 단지 데이터는 KAPT_API_KEY 설정 후 재실행하세요.')

  // bootstrap SQL 파일 갱신 (upsert 한 내용을 재현 가능한 형태로 저장)
  const sqlRows = BOOTSTRAP_COMPLEXES.map(c => {
    const nm = nameNormalize(c.kaptName)
    const year = c.kaptUseApproveYmd ? parseInt(c.kaptUseApproveYmd.slice(0, 4), 10) : 'NULL'
    return `  ('${c.kaptCode}', '${c.kaptName.replace(/'/g, "''")}', '${nm}', '${c.sggCode}', '${c.doroJuso.replace(/'/g, "''")}', ${c.kaptdaCnt}, ${year})`
  }).join(',\n')

  const sql = `-- 창원·김해 단지 마스터 bootstrap (seed-complexes.ts 생성, KAPT API 결과로 교체 예정)\ninsert into public.complexes (kapt_code, canonical_name, name_normalized, sgg_code, road_address, household_count, built_year)\nvalues\n${sqlRows}\non conflict (kapt_code) do update set\n  canonical_name  = excluded.canonical_name,\n  name_normalized = excluded.name_normalized,\n  road_address    = excluded.road_address,\n  household_count = excluded.household_count,\n  built_year      = excluded.built_year;\n`
  writeFileSync(join(process.cwd(), 'supabase', 'seed', 'complexes_bootstrap.sql'), sql, 'utf-8')
  console.log('  ✓ supabase/seed/complexes_bootstrap.sql 갱신됨')
}

async function main() {
  const useBootstrap = process.argv.includes('--bootstrap') || !process.env.KAPT_API_KEY

  // 인자 검증(41-03) — regions 전체 조회 전에 형식 위반을 exit 1 로 잡는다.
  // 빈 --sgg= 가 그대로 새면 parseSggCodes 가 undefined 로 오인해 regions 전체로
  // 조용히 확장될 위험이 있다(41-02 가 이미 이 경로를 막아뒀다).
  const sggArg = process.argv.find(a => a.startsWith('--sgg='))?.split('=')[1]
  let validatedSggCodes: string[] | undefined
  try {
    validatedSggCodes = parseSggCodes(sggArg)
  } catch (err) {
    console.error(`❌ 인자 검증 실패: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  if (useBootstrap && !process.argv.includes('--bootstrap')) {
    console.warn('⚠️  KAPT_API_KEY 없음 → bootstrap 모드로 실행합니다.')
    console.warn('   실제 데이터 수집: KAPT_API_KEY 설정 후 재실행\n')
  }

  const sggCodes = await getSggCodes(validatedSggCodes)
  console.log(`대상 지역: ${sggCodes.join(', ')}`)

  if (useBootstrap) {
    await runBootstrap()
  } else {
    await runWithApi(sggCodes)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
