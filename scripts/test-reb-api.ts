/**
 * 한국부동산원 R-ONE API 탐색 스크립트
 * npx tsx --env-file=.env.local scripts/test-reb-api.ts
 */

const KEY = process.env.REB_API_KEY ?? ''
const BASE = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do'

async function get(params: Record<string, string>) {
  const qs = new URLSearchParams({ key: KEY, type: 'json', ...params }).toString()
  const url = `${BASE}?${qs}`
  console.log('\n▶ URL:', url.replace(KEY, 'KEY'))
  const res = await fetch(url)
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    console.log('STATUS:', res.status)
    console.log('KEYS:', Object.keys(json))
    // 에러 코드 확인
    const firstKey = Object.keys(json)[0]
    if (firstKey) {
      const inner = json[firstKey]
      if (inner?.RESULT) console.log('RESULT:', JSON.stringify(inner.RESULT))
      if (Array.isArray(inner?.row)) {
        console.log('ROW COUNT:', inner.row.length)
        if (inner.row.length > 0) console.log('SAMPLE ROW:', JSON.stringify(inner.row[0]))
      }
    }
    return json
  } catch {
    console.log('RAW (first 300):', text.slice(0, 300))
    return null
  }
}

async function main() {
  console.log('=== 한국부동산원 R-ONE API 탐색 ===')

  // 1. 아파트 매매가격지수 (전국) — orgId 901
  console.log('\n[1] 아파트 매매가격지수 시도 — 전국 (prdSe=M)')
  await get({ orgId: '901', tblId: 'T_APTPRICE', itmId: 'IDX', prdSe: 'M', newEstPrdCnt: '3' })

  // 2. 통계표 목록 조회 시도
  console.log('\n[2] 통계표 목록 조회')
  await get({ orgId: '901' })

  // 3. 주택가격동향조사 아파트 매매지수
  console.log('\n[3] 주택가격동향조사 (tblId 패턴 시도)')
  await get({ orgId: '901', tblId: 'APTPRICE_IDX', prdSe: 'M', newEstPrdCnt: '3' })

  // 4. R-ONE 실제 알려진 tblId
  console.log('\n[4] 실거래가지수 시도')
  await get({ orgId: '901', tblId: 'PRE_REALST', prdSe: 'M', newEstPrdCnt: '3' })

  // 5. KOSIS 스타일 파라미터로 시도
  console.log('\n[5] KOSIS 스타일 — method=getList')
  const url5 = `${BASE}?key=${KEY}&type=json&orgId=901&tblId=APT_IDX&itmId=IDX&objL1=000&prdSe=M&newEstPrdCnt=3`
  const r5 = await fetch(url5)
  console.log('STATUS:', r5.status, (await r5.text()).slice(0, 200))

  // 6. 다른 baseURL 시도
  console.log('\n[6] 다른 base URL 시도')
  const altBase = 'https://www.reb.or.kr/r-one/openapi/SttsApiOrgData.do'
  const r6 = await fetch(`${altBase}?key=${KEY}&type=json`)
  console.log('STATUS:', r6.status, (await r6.text()).slice(0, 200))
}

main().catch(console.error)
