/**
 * SGIS 분기 통계 적재 스크립트
 *
 * 실행: npx tsx scripts/ingest-sgis.ts
 * 환경변수: SGIS_CONSUMER_KEY, SGIS_CONSUMER_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 주의: adm_cd 코드는 ASSUMED (48121 등). 실행 전 SGIS stage API로 검증 필요:
 *   GET https://sgisapi.kostat.go.kr/OpenAPI3/addr/stage.json?accessToken=...&cd=48&pg_yn=1
 *
 * 또는 창원시 SGG 코드 확인:
 *   SELECT DISTINCT sgg_code FROM complexes WHERE si = '창원시'
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

// @/services/sgis tsconfig paths가 tsx에서 인식 안 될 경우 아래 상대경로 사용
// import { fetchSgisToken, fetchPopulation, fetchHouseholds } from '../src/services/sgis'
import { fetchSgisToken, fetchPopulation, fetchHouseholds } from '../src/services/sgis'

loadEnvConfig(process.cwd())

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface District {
  si: string
  gu: string
  adm_cd: string
}

async function getActiveDistricts(): Promise<District[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code, si, gu')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r: { sgg_code: string; si: string; gu: string | null }) => ({
    si: r.si,
    gu: r.gu ?? r.si,
    adm_cd: r.sgg_code,
  }))
}

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  const year = now.getFullYear()
  const quarter = Math.ceil((now.getMonth() + 1) / 3)
  // SGIS 데이터는 전년도까지만 확정. 현재 분기 데이터는 전년도 동분기 사용
  return { year: year - 1, quarter }
}

async function main() {
  console.log('SGIS 분기 통계 적재 시작...')

  const token = await fetchSgisToken()
  console.log('SGIS 토큰 발급 완료')

  const { year, quarter } = currentQuarter()
  console.log(`대상 연도: ${year}년 ${quarter}분기`)

  const districts = await getActiveDistricts()
  console.log(`대상 지역: ${districts.length}개`)

  for (const district of districts) {
    try {
      const [popResult, hhResult] = await Promise.all([
        fetchPopulation(token, district.adm_cd, year),
        fetchHouseholds(token, district.adm_cd, year),
      ])

      const { error } = await supabase.from('district_stats').upsert(
        {
          adm_cd: district.adm_cd,
          adm_nm: popResult.adm_nm,
          si: district.si,
          gu: district.gu,
          data_year: year,
          data_quarter: quarter,
          population: popResult.population,
          households: hhResult.households,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'adm_cd,data_year,data_quarter' },
      )

      if (error) {
        console.error(`${district.gu} upsert 실패:`, error)
      } else {
        console.log(
          `${district.gu}: 인구 ${popResult.population.toLocaleString('ko-KR')}명, 세대 ${hhResult.households.toLocaleString('ko-KR')}세대`,
        )
      }
    } catch (err) {
      console.error(`${district.gu} 처리 실패 (스킵):`, err)
    }
  }

  console.log('SGIS 적재 완료')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
