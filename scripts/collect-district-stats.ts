/**
 * 행정안전부 주민등록 인구·세대현황 수집 스크립트
 *
 * 사용: npx tsx --env-file=.env.local scripts/collect-district-stats.ts
 *
 * API: https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus
 *   행정동별(통반단위) 주민등록 인구 및 세대현황 목록 조회
 *   ⚠ data.go.kr 포털에서 "admmPpltnHhStus" 활용신청 승인 필요 (MOLIT_API_KEY 공용)
 *
 * 수집 대상: 경남 창원시 5개 구 (행정동 집계 → 시군구 합산)
 * 스케줄: 분기 1회 수동 실행
 */
import { createClient } from '@supabase/supabase-js'

// ── 설정 ──────────────────────────────────────────────────────────────
const API_URL = 'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus'

const DATA_YEAR    = 2026
const DATA_QUARTER = 1   // 1분기 = 1~3월, 기준월 3월

// 기준년월 YYYYMM (분기 마지막 월)
const makeStatsYm = (year: number, quarter: number) =>
  `${year}${String(quarter * 3).padStart(2, '0')}`

// 수집 대상 (창원시 5개 구, signguCd = 시군구코드 5자리)
const TARGETS = [
  { si: '창원시', gu: '의창구',   admCd: '48121', signguCd: '48121' },
  { si: '창원시', gu: '성산구',   admCd: '48123', signguCd: '48123' },
  { si: '창원시', gu: '마산합포구', admCd: '48125', signguCd: '48125' },
  { si: '창원시', gu: '마산회원구', admCd: '48127', signguCd: '48127' },
  { si: '창원시', gu: '진해구',   admCd: '48129', signguCd: '48129' },
]

// ── 유틸 ──────────────────────────────────────────────────────────────
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseInt(v.replace(/,/g, ''), 10) : Number(v)
  return isNaN(n) ? null : n
}

// ── API 호출 ──────────────────────────────────────────────────────────
// 특정 signguCd의 모든 행정동 레코드를 페이지네이션으로 전부 가져옴
async function fetchAllRows(stdrYm: string, signguCd: string) {
  const rows: Record<string, unknown>[] = []
  let pageNo = 1

  while (true) {
    const url = new URL(API_URL)
    url.searchParams.set('ServiceKey', process.env.MOLIT_API_KEY!)
    url.searchParams.set('pageNo',    String(pageNo))
    url.searchParams.set('numOfRows', '100')
    url.searchParams.set('_type',     'json')
    url.searchParams.set('stdrYm',    stdrYm)
    url.searchParams.set('signguCd',  signguCd)

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API HTTP ${res.status}: ${body.slice(0, 200)}`)
    }

    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (json as any)?.response?.body
    const raw: unknown = body?.items?.item
    const items = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[]

    rows.push(...items)

    const totalCount = num(body?.totalCount) ?? 0
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

  const statsYm     = makeStatsYm(DATA_YEAR, DATA_QUARTER)
  const prevStatsYm = makeStatsYm(DATA_YEAR - 1, DATA_QUARTER)
  console.log(`\n수집 기간: ${DATA_YEAR}년 ${DATA_QUARTER}분기 (기준월 ${statsYm}, 전년 ${prevStatsYm})`)

  let upserted = 0
  const errors: string[] = []

  for (const target of TARGETS) {
    console.log(`\n[${target.gu}] 처리 중...`)

    // ── 현재 분기 ──
    let currentRows: Record<string, unknown>[] = []
    try {
      currentRows = await fetchAllRows(statsYm, target.signguCd)
      console.log(`  현재: 행정동 ${currentRows.length}건 수신`)
    } catch (e) {
      errors.push(`${target.gu} 현재: ${e}`)
      console.error(`  ✗ 현재 분기 fetch 오류:`, e)
      continue
    }

    // ── 전년 동기 ──
    let prevRows: Record<string, unknown>[] = []
    try {
      prevRows = await fetchAllRows(prevStatsYm, target.signguCd)
      console.log(`  전년: 행정동 ${prevRows.length}건 수신`)
    } catch {
      console.warn(`  ⚠ 전년 fetch 실패 — 증감 없이 진행`)
    }

    // ── 시군구 집계 (행정동 합산) ──
    const sumField = (rows: Record<string, unknown>[], ...keys: string[]) => {
      let total = 0
      for (const row of rows) {
        for (const k of keys) {
          const v = num(row[k])
          if (v !== null) { total += v; break }
        }
      }
      return total
    }

    // 인구·세대 합산: 행안부 API 필드명 후보들
    const population  = sumField(currentRows, 'totPpltnCnt', 'ppltnCnt', 'totPpln')
    const households  = sumField(currentRows, 'totHhdCnt',   'hhdCnt',   'totHhd')
    const prevPop     = prevRows.length > 0
      ? sumField(prevRows, 'totPpltnCnt', 'ppltnCnt', 'totPpln')
      : 0
    const populationChange = population > 0 && prevPop > 0 ? population - prevPop : null

    const adm_nm = (String(currentRows[0]?.['ctprvnNm'] ?? '') + ' ' +
      String(currentRows[0]?.['signguNm'] ?? target.gu)).trim()

    const row = {
      adm_cd:            target.admCd,
      adm_nm:            adm_nm || `창원시${target.gu}`,
      si:                target.si,
      gu:                target.gu,
      data_year:         DATA_YEAR,
      data_quarter:      DATA_QUARTER,
      population:        population || null,
      households:        households || null,
      population_change: populationChange,
      // 연령분포는 이 API에서 미제공 — 별도 API 필요 시 추가
      pop_under20: null,
      pop_20s:     null,
      pop_30s:     null,
      pop_40s:     null,
      pop_50s:     null,
      pop_60plus:  null,
      fetched_at:  new Date().toISOString(),
    }

    const { error } = await supabase
      .from('district_stats')
      .upsert(row, { onConflict: 'adm_cd,data_year,data_quarter' })

    if (error) {
      errors.push(`${target.gu}: ${error.message}`)
      console.error(`  ✗ upsert 오류:`, error.message)
    } else {
      upserted++
      const changeStr = populationChange !== null
        ? (populationChange >= 0 ? `+${populationChange.toLocaleString()}` : populationChange.toLocaleString())
        : '전년없음'
      console.log(
        `  ✓ 인구 ${population.toLocaleString()}명 / ` +
        `세대 ${households.toLocaleString()}세대 / ` +
        `전년비 ${changeStr}명`,
      )
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\n완료: ${upserted}/${TARGETS.length}개 구 upsert`)
  if (errors.length > 0) {
    console.error('오류 목록:', errors)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
