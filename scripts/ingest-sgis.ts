/**
 * SGIS 분기 통계 적재 스크립트
 *
 * 실행: npx tsx scripts/ingest-sgis.ts
 * 환경변수: SGIS_CONSUMER_KEY, SGIS_CONSUMER_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 2026-07-28 실측 확인: SGIS adm_cd는 국토부 표준 법정동코드(regions.sgg_code)와
 * 완전히 다른 자체 코드 체계를 씀 — 예: 경남=38(표준 48 아님), 부산=21(표준 26 아님),
 * 창원시 의창구=38111(표준 48121 아님). GET .../addr/stage.json?accessToken=...&cd=<시도코드>로
 * 직접 조회해 SGG_TO_SGIS_ADM_CD 매핑을 만듦. 새 지역이 regions.is_active에 추가되면
 * 이 매핑도 같이 갱신해야 함(없으면 아래에서 스킵하고 경고 로그만 남김).
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

// 표준 법정동코드(regions.sgg_code) → SGIS 자체 adm_cd
// GET https://sgisapi.kostat.go.kr/OpenAPI3/addr/stage.json?accessToken=...&cd=<시도코드>
// (부산=21, 경남=38)로 2026-07-28 직접 조회해 확인한 값
const SGG_TO_SGIS_ADM_CD: Record<string, string> = {
  // 부산광역시 (SGIS 시도코드 21)
  '26110': '21010', // 중구
  '26140': '21020', // 서구
  '26170': '21030', // 동구
  '26200': '21040', // 영도구
  '26230': '21050', // 부산진구
  '26260': '21060', // 동래구
  '26290': '21070', // 남구
  '26320': '21080', // 북구
  '26350': '21090', // 해운대구
  '26380': '21100', // 사하구
  '26410': '21110', // 금정구
  '26440': '21120', // 강서구
  '26470': '21130', // 연제구
  '26500': '21140', // 수영구
  '26530': '21150', // 사상구
  '26710': '21510', // 기장군
  // 경상남도 (SGIS 시도코드 38)
  '48121': '38111', // 창원시 의창구
  '48123': '38112', // 창원시 성산구
  '48125': '38113', // 창원시 마산합포구
  '48127': '38114', // 창원시 마산회원구
  '48129': '38115', // 창원시 진해구
  '48170': '38030', // 진주시
  '48220': '38050', // 통영시
  '48240': '38060', // 사천시
  '48250': '38070', // 김해시
  '48270': '38080', // 밀양시
  '48310': '38090', // 거제시
  '48330': '38100', // 양산시
  '48720': '38510', // 의령군
  '48730': '38520', // 함안군
  '48740': '38530', // 창녕군
  '48820': '38540', // 고성군
  '48840': '38550', // 남해군
  '48850': '38560', // 하동군
  '48860': '38570', // 산청군
  '48870': '38580', // 함양군
  '48880': '38590', // 거창군
  '48890': '38600', // 합천군
}

interface District {
  si: string
  gu: string
  sggCode: string
  admCd: string
}

async function getActiveDistricts(): Promise<District[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code, si, gu')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)

  const districts: District[] = []
  for (const r of (data ?? []) as { sgg_code: string; si: string; gu: string | null }[]) {
    const admCd = SGG_TO_SGIS_ADM_CD[r.sgg_code]
    if (!admCd) {
      console.warn(`⚠️  ${r.si} ${r.gu ?? ''} (sgg_code=${r.sgg_code}): SGIS adm_cd 매핑 없음 — 스킵`)
      continue
    }
    districts.push({ si: r.si, gu: r.gu ?? r.si, sggCode: r.sgg_code, admCd })
  }
  return districts
}

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  const year = now.getFullYear()
  const quarter = Math.ceil((now.getMonth() + 1) / 3)
  // 2026-07-28 실측: SGIS는 전전년도까지만 확정 데이터 제공(예: 2026년 기준 2024년까지만
  // 조회 가능, 2025년은 "년도 정보를 확인해주세요" 오류). 분기마다 최신 확정연도가
  // 바뀔 수 있으니 다음 실행 시 여전히 유효한지 재확인 필요.
  return { year: year - 2, quarter }
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
        fetchPopulation(token, district.admCd, year),
        fetchHouseholds(token, district.admCd, year),
      ])

      // district_stats.adm_cd는 앱 전역 규약(표준 법정동코드)을 따름 — SGIS 자체 코드(admCd)는
      // API 호출에만 쓰고 저장은 sggCode로 함 (app은 si/gu로 조회하므로 무관하지만 일관성 유지)
      const { error } = await supabase.from('district_stats').upsert(
        {
          adm_cd: district.sggCode,
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
