/**
 * NEIS 학원교습소정보(acaInsTiInfo) 전수 수집 배치
 *
 * 창원시·김해시 학원 전수를 NEIS Open API에서 수집하여 hagwon_db에 upsert.
 * 페이지네이션 1000건/페이지, INFO-200(데이터없음) 처리, 수강료 파싱 포함.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/fetch-hagwon-neis.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/fetch-hagwon-neis.ts
 *   npx tsx --env-file=.env.local scripts/fetch-hagwon-neis.ts --zone=창원시
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')
const ZONE_ARG = process.argv.find(a => a.startsWith('--zone='))?.split('=')[1]

const ADMST_ZONE_NAMES = ZONE_ARG ? [ZONE_ARG] : ['창원시', '김해시']

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface NeisAcaRow {
  ACA_NM:           string
  ADMST_ZONE_NM:    string
  ACA_ASNUM:        string
  REALM_SC_NM:      string
  LE_ORD_NM:        string
  LE_CRSE_NM:       string
  PSNBY_THCC_CNTNT: string
  FA_RDNMA:         string
  FA_RDNDA:         string
  FA_RDNZC:         string
  FA_TELNO:         string
  TOFOR_SMTOT:      string
  REG_STTUS_NM:     string
  ESTBL_YMD:        string
}

function parseFeeAmount(text: string): number | null {
  if (!text) return null
  const m = text.replace(/[,원]/g, '').match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

function parseEstablishedAt(ymd: string): string | null {
  if (!ymd || ymd.length < 8) return null
  const y = ymd.slice(0, 4)
  const m = ymd.slice(4, 6)
  const d = ymd.slice(6, 8)
  return `${y}-${m}-${d}`
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface FetchPageResult {
  rows: NeisAcaRow[]
  totalCount: number
}

async function fetchPage(zoneName: string, pIndex: number): Promise<FetchPageResult> {
  const url = new URL('https://open.neis.go.kr/hub/acaInsTiInfo')
  url.searchParams.set('KEY', process.env.NEIS_API_KEY!)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('ATPT_OFCDC_SC_CODE', 'S10') // 경남
  url.searchParams.set('ADMST_ZONE_NM', zoneName)
  url.searchParams.set('pIndex', String(pIndex))
  url.searchParams.set('pSize', '1000')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`NEIS API HTTP ${res.status}`)

  const json = await res.json() as {
    acaInsTiInfo?: [
      { head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] },
      { row?: NeisAcaRow[] }
    ]
    RESULT?: { CODE: string; MESSAGE: string }
  }

  // 최상위 에러 응답 처리
  if (json.RESULT) {
    const code = json.RESULT.CODE
    if (code === 'INFO-200') return { rows: [], totalCount: 0 }
    throw new Error(`NEIS API error: ${code} ${json.RESULT.MESSAGE}`)
  }

  const head = json.acaInsTiInfo?.[0]?.head
  if (!head) return { rows: [], totalCount: 0 }

  const totalCount = head[0].list_total_count
  const resultCode = head[1].RESULT.CODE

  if (resultCode === 'INFO-200') return { rows: [], totalCount: 0 }
  if (resultCode.startsWith('ERROR')) {
    throw new Error(`NEIS API error: ${resultCode} ${head[1].RESULT.MESSAGE}`)
  }

  const rows = json.acaInsTiInfo?.[1]?.row ?? []
  return { rows, totalCount }
}

async function collectZone(zoneName: string): Promise<number> {
  // dry-run: 첫 페이지 건수만 출력
  const first = await fetchPage(zoneName, 1)
  if (DRY_RUN) {
    console.log(`[${zoneName}] 총 ${first.totalCount}건 (dry-run — DB 저장 안 함)`)
    return 0
  }

  const totalPages = Math.ceil(first.totalCount / 1000)
  let allRows: NeisAcaRow[] = [...first.rows]
  console.log(`[${zoneName}] page 1/${totalPages} → ${first.rows.length}건 수집`)

  for (let pIndex = 2; pIndex <= totalPages; pIndex++) {
    await sleep(500)
    const { rows } = await fetchPage(zoneName, pIndex)
    allRows = allRows.concat(rows)
    console.log(`[${zoneName}] page ${pIndex}/${totalPages} → ${rows.length}건 수집`)
  }

  // upsert 100건 배치
  const upsertRows = allRows.map(row => ({
    aca_asnum:      row.ACA_ASNUM,
    name:           row.ACA_NM,
    address:        row.FA_RDNMA || null,
    address_detail: row.FA_RDNDA || null,
    zipcode:        row.FA_RDNZC || null,
    phone:          row.FA_TELNO || null,
    realm_sc_nm:    row.REALM_SC_NM || null,
    le_ord_nm:      row.LE_ORD_NM || null,
    le_crse_nm:     row.LE_CRSE_NM || null,
    fee_text:       row.PSNBY_THCC_CNTNT || null,
    fee_amount:     parseFeeAmount(row.PSNBY_THCC_CNTNT),
    capacity:       row.TOFOR_SMTOT ? parseInt(row.TOFOR_SMTOT, 10) || null : null,
    established_at: parseEstablishedAt(row.ESTBL_YMD),
    is_active:      row.REG_STTUS_NM === '등록',
    admst_zone_nm:  row.ADMST_ZONE_NM || null,
  }))

  let upserted = 0
  for (let i = 0; i < upsertRows.length; i += 100) {
    const batch = upsertRows.slice(i, i + 100)
    const { error } = await supabase.from('hagwon_db').upsert(batch, {
      onConflict: 'aca_asnum',
      ignoreDuplicates: false,
    })
    if (error) {
      console.error(`[${zoneName}] upsert 오류 (batch ${i}~${i + batch.length}):`, error.message)
    } else {
      upserted += batch.length
    }
  }

  console.log(`[${zoneName}] 완료: ${upserted}건 upserted`)
  return upserted
}

async function main() {
  if (!process.env.NEIS_API_KEY) {
    console.error('NEIS_API_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  let total = 0
  for (const zoneName of ADMST_ZONE_NAMES) {
    total += await collectZone(zoneName)
  }

  if (!DRY_RUN) {
    console.log(`\n전체 완료: 총 ${total}건`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
