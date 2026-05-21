/**
 * 행정안전부 주민등록 인구·세대현황 수집 스크립트
 *
 * 사용: npx tsx --env-file=.env.local scripts/collect-district-stats.ts
 *
 * API: https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus
 *   ⚠ 파라미터: admmCd(더블m) 10자리, srchFrYm/srchToYm YYYYMM, lv=2 (시구단위), rgSeGd=1 (전체)
 *   ⚠ data.go.kr 포털에서 "admmPpltnHhStus" 활용신청 승인 필요 (MOLIT_API_KEY 공용)
 *
 * 수집 대상: 경남 창원시 5개 구 (lv=2로 경남 전체 조회 후 sggNm 필터)
 * 스케줄: 분기 1회 수동 실행
 */
import { createClient } from '@supabase/supabase-js'

// ── 설정 ──────────────────────────────────────────────────────────────
const API_URL = 'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus'
const ADMM_CD_GYEONGNAM = '4800000000'  // 경남 전체 행정구역코드 (10자리, 더블m)

// 202603은 아직 미공표 — 확인된 최근 분기 사용 (2025 Q1 = 202503)
// 공표 확인 후 DATA_YEAR=2026, DATA_QUARTER=1 로 변경
const DATA_YEAR    = 2025
const DATA_QUARTER = 1   // 1분기 = 1~3월, 기준월 3월

// 기준년월 YYYYMM (분기 마지막 월)
const makeYm = (year: number, quarter: number) =>
  `${year}${String(quarter * 3).padStart(2, '0')}`

// 창원시 5개 구 (sggNm에 keyword 포함 여부로 매칭)
const TARGETS = [
  { si: '창원시', gu: '의창구',    keyword: '의창구',    admCd: '48121' },
  { si: '창원시', gu: '성산구',    keyword: '성산구',    admCd: '48123' },
  { si: '창원시', gu: '마산합포구', keyword: '마산합포구', admCd: '48125' },
  { si: '창원시', gu: '마산회원구', keyword: '마산회원구', admCd: '48127' },
  { si: '창원시', gu: '진해구',    keyword: '진해구',    admCd: '48129' },
]

// ── 유틸 ──────────────────────────────────────────────────────────────
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseInt(v.replace(/,/g, ''), 10) : Number(v)
  return isNaN(n) ? null : n
}

// XML 응답 파싱 (행안부 API는 _type=json 설정에도 XML 반환)
function parseXml(xml: string): { totalCount: number; items: Record<string, string>[] } {
  const totalCountMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/)
  const totalCount = totalCountMatch ? parseInt(totalCountMatch[1]) : 0

  const items: Record<string, string>[] = []
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  for (const block of blocks) {
    const obj: Record<string, string> = {}
    const fields = block.match(/<(\w+)>([^<]*)<\/\1>/g) ?? []
    for (const field of fields) {
      const m = field.match(/<(\w+)>([^<]*)<\/\1>/)
      if (m) obj[m[1]] = m[2].trim()
    }
    items.push(obj)
  }
  return { totalCount, items }
}

// ── API 호출 ──────────────────────────────────────────────────────────
// lv=2 시구단위로 경남 전체 조회 (창원시 5개 구 포함)
async function fetchDistricts(ym: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let pageNo = 1

  while (true) {
    const url = new URL(API_URL)
    url.searchParams.set('ServiceKey', process.env.MOLIT_API_KEY!)
    url.searchParams.set('pageNo',    String(pageNo))
    url.searchParams.set('numOfRows', '100')
    url.searchParams.set('admmCd',    ADMM_CD_GYEONGNAM)
    url.searchParams.set('srchFrYm',  ym)
    url.searchParams.set('srchToYm',  ym)
    url.searchParams.set('lv',        '2')
    url.searchParams.set('rgSeGd',    '1')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API HTTP ${res.status}: ${body.slice(0, 200)}`)
    }

    const text = await res.text()

    // JSON 시도 (향후 API 변경 대비), 실패 시 XML 파싱
    let totalCount: number
    let items: Record<string, unknown>[]

    if (text.trimStart().startsWith('{')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = JSON.parse(text) as any
      const header = json?.response?.header
      if (header?.resultCode && header.resultCode !== '00') {
        throw new Error(`API 오류: ${header.resultCode} ${header.resultMsg}`)
      }
      const body = json?.response?.body
      const raw: unknown = body?.items?.item
      items = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[]
      totalCount = num(body?.totalCount) ?? 0
    } else {
      // XML 응답 (행안부 API의 실제 동작)
      const resultCodeMatch = text.match(/<resultCode>(\d+)<\/resultCode>/)
      if (resultCodeMatch && resultCodeMatch[1] !== '00' && resultCodeMatch[1] !== '0') {
        const msgMatch = text.match(/<resultMsg>([^<]*)<\/resultMsg>/)
        throw new Error(`API 오류: ${resultCodeMatch[1]} ${msgMatch?.[1] ?? ''}`)
      }
      const parsed = parseXml(text)
      totalCount = parsed.totalCount
      items = parsed.items
    }

    rows.push(...items)
    if (rows.length >= totalCount || items.length === 0) break
    pageNo++
  }

  return rows
}

// ── 메인 ──────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.MOLIT_API_KEY) throw new Error('MOLIT_API_KEY가 설정되지 않았습니다')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const statsYm     = makeYm(DATA_YEAR, DATA_QUARTER)
  const prevStatsYm = makeYm(DATA_YEAR - 1, DATA_QUARTER)
  console.log(`\n수집 기간: ${DATA_YEAR}년 ${DATA_QUARTER}분기 (기준월 ${statsYm}, 전년동기 ${prevStatsYm})`)

  // ── 현재 분기 조회 ──
  console.log(`\n[경남 전체] lv=2 시구단위 조회 중... (${statsYm})`)
  let currentRows: Record<string, unknown>[]
  try {
    currentRows = await fetchDistricts(statsYm)
    console.log(`  → 총 ${currentRows.length}건 수신`)
    if (currentRows.length === 0) {
      console.error(`  ✗ 데이터 없음. ${statsYm} 기준 데이터가 아직 미공표일 수 있습니다.`)
      console.error(`    DATA_YEAR/DATA_QUARTER를 조정 후 재실행해주세요.`)
      process.exit(1)
    }
  } catch (e) {
    console.error('현재 분기 fetch 오류:', e)
    process.exit(1)
  }

  // ── 전년 동기 조회 ──
  console.log(`\n[경남 전체] lv=2 시구단위 조회 중... (${prevStatsYm})`)
  let prevRows: Record<string, unknown>[] = []
  try {
    prevRows = await fetchDistricts(prevStatsYm)
    console.log(`  → 총 ${prevRows.length}건 수신`)
  } catch {
    console.warn('  ⚠ 전년 동기 fetch 실패 — 인구증감 없이 진행')
  }

  // ── 구별 매칭 및 upsert ──
  let upserted = 0
  const errors: string[] = []

  for (const target of TARGETS) {
    const cur  = currentRows.find(r => String(r['sggNm'] ?? '').includes(target.keyword))
    const prev = prevRows.find(r => String(r['sggNm'] ?? '').includes(target.keyword))

    if (!cur) {
      console.error(`\n  ✗ [${target.gu}] 현재 데이터 없음 (sggNm 매칭 실패)`)
      errors.push(`${target.gu}: 데이터 없음`)
      continue
    }

    const population       = num(cur['totNmprCnt'])
    const households       = num(cur['hhCnt'])
    const prevPop          = prev ? num(prev['totNmprCnt']) : null
    const populationChange = population !== null && prevPop !== null ? population - prevPop : null
    const adm_nm           = String(cur['sggNm'] ?? `창원시 ${target.gu}`).trim()

    const changeStr = populationChange !== null
      ? (populationChange >= 0 ? `+${populationChange.toLocaleString()}` : populationChange.toLocaleString())
      : '전년없음'

    console.log(`\n[${target.gu}] "${adm_nm}"`)
    console.log(`  인구 ${population?.toLocaleString() ?? '-'}명 / 세대 ${households?.toLocaleString() ?? '-'} / 전년비 ${changeStr}명`)

    const row = {
      adm_cd:            target.admCd,
      adm_nm,
      si:                target.si,
      gu:                target.gu,
      data_year:         DATA_YEAR,
      data_quarter:      DATA_QUARTER,
      population,
      households,
      population_change: populationChange,
      pop_under20:       null,
      pop_20s:           null,
      pop_30s:           null,
      pop_40s:           null,
      pop_50s:           null,
      pop_60plus:        null,
      fetched_at:        new Date().toISOString(),
    }

    const { error } = await supabase
      .from('district_stats')
      .upsert(row, { onConflict: 'adm_cd,data_year,data_quarter' })

    if (error) {
      errors.push(`${target.gu}: ${error.message}`)
      console.error(`  ✗ upsert 오류:`, error.message)
    } else {
      upserted++
      console.log(`  ✓ upsert 완료`)
    }
  }

  console.log(`\n완료: ${upserted}/${TARGETS.length}개 구 upsert`)
  if (errors.length > 0) {
    console.error('오류 목록:', errors)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
