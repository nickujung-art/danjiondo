/**
 * [D-11] 부산 좌표+이름유사 중복 후보 탐지 (log-only, 병합 없음)
 * 실행: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx --env-file=.env.local scripts/detect-busan-dup-candidates.ts
 *
 * 34-03이 라이브 적용한 find_nearby_similar_complexes RPC(ST_DWithin+trigram)를
 * detectPotentialDuplicate 헬퍼로 호출한다. 34-05의 카카오 지오코딩으로 lat/lng가
 * 채워진 뒤에만 유효 — 좌표가 없으면 헬퍼가 항상 []을 반환한다.
 *
 * 주의: .env.local이 로컬 Supabase를 가리킬 수 있으므로 환경변수를 명시적으로 설정 후 실행할 것
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { detectPotentialDuplicate } from '../src/lib/data/complex-matching'
import { nameNormalize } from '../src/lib/data/name-normalize'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않음')
  process.exit(1)
}

console.log(`🔗 연결 대상: ${SUPABASE_URL}`)
if (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost')) {
  console.warn('⚠️  로컬 Supabase에 연결 중입니다. 프로덕션 URL을 사용하려면 환경변수를 명시적으로 설정하세요.')
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface BusanRow {
  sgg_code: string
  kapt_code: string
  canonical_name: string
  lat: number
  lng: number
}

// PostgREST 1,000행 캡 대비 페이지네이션 (33-06 선례, RESEARCH.md Pitfall 4)
async function fetchGeocodedBusanRows(): Promise<BusanRow[]> {
  const PAGE = 1000
  const all: BusanRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('complexes')
      .select('sgg_code, kapt_code, canonical_name, lat, lng')
      .like('sgg_code', '26%')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('kapt_code')
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(`complexes 조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as BusanRow[]))
    if (data.length < PAGE) break
    offset += PAGE
  }

  return all
}

async function main() {
  const rows = await fetchGeocodedBusanRows()

  // 지오코딩이 선행되지 않았으면 (34-03이 배선하지 않은 결함의 재발 방지 가드) 중단
  if (rows.length === 0) {
    console.error('❌ 좌표 보유 부산 단지 0건 — 지오코딩(Task 1)이 선행되지 않았거나 실패했습니다. 중단합니다.')
    process.exit(1)
  }

  const dupRows: string[] = ['sgg,kapt,name,dup_kapt,dup_name,dist_m']
  let dupCount = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    process.stdout.write(`\r[${i + 1}/${rows.length}] ${row.canonical_name} ...`)

    const dupCandidates = await detectPotentialDuplicate(supabase, {
      coordX: row.lng,
      coordY: row.lat,
      nameNormalized: nameNormalize(row.canonical_name),
      kaptCode: row.kapt_code,
    })

    for (const d of dupCandidates) {
      dupRows.push(
        `"${row.sgg_code}","${row.kapt_code}","${row.canonical_name}","${d.kapt_code}","${d.canonical_name}",${d.dist_m.toFixed(1)}`,
      )
      dupCount++
    }
  }

  writeFileSync('scripts/busan-dup-candidates.csv', dupRows.join('\n'))

  console.log(`\n좌표 보유 부산 단지 ${rows.length}건 검사, 잠재 중복 ${dupCount}건`)
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
