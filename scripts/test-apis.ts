/**
 * API 연결 테스트 스크립트
 * npx tsx --env-file=.env.local scripts/test-apis.ts
 */
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') })

const MOLIT_KEY = process.env.MOLIT_API_KEY!
const KOSIS_KEY = 'ZDk5NDY0NGI1NjFjOGJlNmE2MmM2YmExOTdlNGFkMDU='

async function testMoisPopulation() {
  console.log('\n=== 행안부 주민등록 인구 API 테스트 ===')
  // 창원시 의창구 시군구코드: 48121
  // 행정동 코드 10자리: 4812100000
  const testCodes = ['4812100000', '48121', '4800000000', '48000']

  for (const code of testCodes) {
    const url = new URL('https://apis.data.go.kr/1741000/AdmPItnHhStus/selectAdmmPpltnHhStus')
    url.searchParams.set('serviceKey', MOLIT_KEY)
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('numOfRows', '2')
    url.searchParams.set('type', 'json')
    url.searchParams.set('admmCd', code)
    url.searchParams.set('strdYear', '2024')
    url.searchParams.set('strdMonth', '01')

    const res = await fetch(url.toString())
    const text = await res.text()
    console.log(`admmCd=${code} → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
}

async function testKosisPopulation() {
  console.log('\n=== KOSIS 주민등록 인구 테스트 ===')
  // 다양한 tblId/itmId 조합 시도
  const combos = [
    { tblId: 'DT_1B04005N', itmId: 'T20', objL1: '31', desc: '시군구별 인구(연)' },
    { tblId: 'DT_1B040A3', itmId: 'T20', objL1: '31', desc: '시도별 세대수(월)' },
    { tblId: 'DT_1B040A5', itmId: 'T20', objL1: '31', desc: '시군구별 인구(월)' },
  ]

  for (const { tblId, itmId, objL1, desc } of combos) {
    const url = new URL('https://kosis.kr/openapi/statisticsData.do')
    url.searchParams.set('method', 'getList')
    url.searchParams.set('apiKey', KOSIS_KEY)
    url.searchParams.set('orgId', '101')
    url.searchParams.set('tblId', tblId)
    url.searchParams.set('itmId', itmId)
    url.searchParams.set('objL1', objL1)
    url.searchParams.set('format', 'json')
    url.searchParams.set('jsonVD', 'Y')
    url.searchParams.set('prdSe', 'M')
    url.searchParams.set('startPrdDe', '202401')
    url.searchParams.set('endPrdDe', '202401')

    const res = await fetch(url.toString())
    const text = await res.text()
    console.log(`${desc}(${tblId}/${itmId}/obj=${objL1}) → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
}

async function testKosisIncome() {
  console.log('\n=== KOSIS 소득/GRDP 테스트 ===')
  const combos = [
    { tblId: 'DT_1C65_00003', itmId: 'T10', objL1: '31', desc: '경남 1인당GRDP' },
    { tblId: 'DT_1L9H001', itmId: 'T10', objL1: '3100', desc: '경남 가계소득' },
  ]

  for (const { tblId, itmId, objL1, desc } of combos) {
    const url = new URL('https://kosis.kr/openapi/statisticsData.do')
    url.searchParams.set('method', 'getList')
    url.searchParams.set('apiKey', KOSIS_KEY)
    url.searchParams.set('orgId', '101')
    url.searchParams.set('tblId', tblId)
    url.searchParams.set('itmId', itmId)
    url.searchParams.set('objL1', objL1)
    url.searchParams.set('format', 'json')
    url.searchParams.set('jsonVD', 'Y')
    url.searchParams.set('prdSe', 'A')
    url.searchParams.set('startPrdDe', '2022')
    url.searchParams.set('endPrdDe', '2023')

    const res = await fetch(url.toString())
    const text = await res.text()
    console.log(`${desc} → HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
}

async function testKosisSearch() {
  console.log('\n=== KOSIS 통계목록 검색 ===')
  const url = new URL('https://kosis.kr/openapi/statisticsData.do')
  url.searchParams.set('method', 'getSttsInfo')
  url.searchParams.set('apiKey', KOSIS_KEY)
  url.searchParams.set('format', 'json')
  url.searchParams.set('jsonVD', 'Y')
  url.searchParams.set('vwCd', 'MT_ZTITLE')
  url.searchParams.set('parentListId', 'A_2')  // 인구 카테고리

  const res = await fetch(url.toString())
  const text = await res.text()
  console.log(`통계목록 → HTTP ${res.status}: ${text.slice(0, 500)}`)
}

;(async () => {
  await testMoisPopulation()
  await testKosisPopulation()
  await testKosisIncome()
  await testKosisSearch()
})().catch(console.error)
