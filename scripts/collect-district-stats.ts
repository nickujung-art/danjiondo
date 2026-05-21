/**
 * 행정안전부 주민등록인구통계 수집 스크립트
 *
 * 사용: npx tsx --env-file=.env.local scripts/collect-district-stats.ts
 *
 * API: data.go.kr 행안부 주민등록인구및세대현황정보
 *   - endpoint: 1741000/주민등록인구및세대현황정보/getPeopleAndHouseInfo
 *   - ⚠ MOLIT_API_KEY로 이 서비스를 이용하려면 data.go.kr 포털에서
 *     "주민등록인구및세대현황정보" 활용신청이 별도로 필요합니다.
 *   - 미구독 시 HTTP 500 "Unexpected errors" 반환 → 직접 SQL 삽입 사용
 *
 * 수집 대상: 경남 창원시 5개 구
 * 스케줄: 분기 1회 수동 실행 (분기 종료 후 익월 초 데이터 공개)
 */
import { createClient } from '@supabase/supabase-js'

// ── 설정 ──────────────────────────────────────────────────────────────
const POP_URL = 'https://apis.data.go.kr/1741000/주민등록인구및세대현황정보/getPeopleAndHouseInfo'
const AGE_URL = 'https://apis.data.go.kr/1741000/연령별인구현황/getAgeingInfo'

// 현재 수집 대상 연도/분기 (분기 완료 후 수동 조정)
const DATA_YEAR    = 2026
const DATA_QUARTER = 1   // 1분기 = 1~3월, 기준월 3월

// 기준월 (YYYYMM) — 해당 분기의 마지막 월
const STATS_YM = `${DATA_YEAR}0${DATA_QUARTER * 3}`.padEnd(6, '0')
// Q1→"202603", Q2→"202606", Q3→"202609", Q4→"202612"
const makeStatsYm = (year: number, quarter: number) =>
  `${year}${String(quarter * 3).padStart(2, '0')}`

// 수집 대상 지역
const TARGETS = [
  { si: '창원시', gu: '의창구', admCd: '48121', keyword: '의창구' },
  { si: '창원시', gu: '성산구', admCd: '48123', keyword: '성산구' },
  { si: '창원시', gu: '마산합포구', admCd: '48125', keyword: '마산합포구' },
  { si: '창원시', gu: '마산회원구', admCd: '48127', keyword: '마산회원구' },
  { si: '창원시', gu: '진해구', admCd: '48129', keyword: '진해구' },
]

// ── 유틸 ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseInt(v.replace(/,/g, ''), 10) : Number(v)
  return isNaN(n) ? null : n
}

// 5년 단위 연령 코드 배열을 특정 구간합으로 집계
function sumAgeGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Record<string, any>,
  fields: string[],
): number | null {
  let total = 0
  let hasAny = false
  for (const f of fields) {
    const v = num(item[f])
    if (v !== null) { total += v; hasAny = true }
  }
  return hasAny ? total : null
}

// ── API 호출 ──────────────────────────────────────────────────────────
// data.go.kr API 공통 fetch — ServiceKey + _type 패턴
function makeGovUrl(base: string, extra: Record<string, string>): string {
  const url = new URL(base)
  url.searchParams.set('ServiceKey', process.env.MOLIT_API_KEY!)
  url.searchParams.set('pageNo',     '1')
  url.searchParams.set('numOfRows',  '100')
  url.searchParams.set('_type',      'json')
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v)
  return url.toString()
}

async function fetchPopulation(statsYm: string) {
  const url = makeGovUrl(POP_URL, { searchYn: 'Y', ctprvnNm: '경상남도', statsYm })
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`인구 API HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: unknown = (json as any)?.response?.body?.items?.item
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[]
}

async function fetchAgeBreakdown(statsYm: string, signguNm: string) {
  const url = makeGovUrl(AGE_URL, { searchYn: 'Y', ctprvnNm: '경상남도', signguNm, statsYm })
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: unknown = (json as any)?.response?.body?.items?.item
    if (!raw) return null
    const items = Array.isArray(raw) ? raw : [raw]
    return items.length > 0 ? (items[0] as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY가 설정되지 않았습니다')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const statsYm     = makeStatsYm(DATA_YEAR, DATA_QUARTER)
  const prevStatsYm = makeStatsYm(DATA_YEAR - 1, DATA_QUARTER)
  console.log(`\n수집 기간: ${DATA_YEAR}년 ${DATA_QUARTER}분기 (기준월 ${statsYm})`)
  console.log(`전년 기준월: ${prevStatsYm}`)

  // ── 현재 + 전년 인구 데이터 fetch ──
  console.log('\n[1/3] 현재 분기 인구·세대 데이터 fetch...')
  let currentItems: Awaited<ReturnType<typeof fetchPopulation>> = []
  try {
    currentItems = await fetchPopulation(statsYm)
    console.log(`  → ${currentItems.length}개 행정구역 수신`)
  } catch (e) {
    console.error('  ✗ 현재 분기 인구 API 오류:', e)
    process.exit(1)
  }

  console.log('[2/3] 전년 동기 인구 데이터 fetch (증감 계산용)...')
  let prevItems: Awaited<ReturnType<typeof fetchPopulation>> = []
  try {
    prevItems = await fetchPopulation(prevStatsYm)
    console.log(`  → ${prevItems.length}개 행정구역 수신`)
  } catch {
    console.warn('  ⚠ 전년 데이터 fetch 실패 — 증감 없이 진행')
  }

  // 전년 인구 맵 (keyword → population)
  const prevPopMap = new Map<string, number>()
  for (const item of prevItems) {
    const nm = String(item['signguNm'] ?? '')
    for (const t of TARGETS) {
      if (nm.includes(t.keyword)) {
        const p = num(item['ppltnCnt'] ?? item['총인구수'])
        if (p !== null) prevPopMap.set(t.admCd, p)
      }
    }
  }

  // ── 대상 구별 처리 ──
  console.log('\n[3/3] 구별 데이터 처리 및 upsert...')
  let upserted = 0
  const errors: string[] = []

  for (const target of TARGETS) {
    // 현재 인구·세대 매칭
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const popItem: any = currentItems.find((it) =>
      String(it['signguNm'] ?? '').includes(target.keyword),
    )

    if (!popItem) {
      console.warn(`  ⚠ ${target.gu}: 인구 데이터 없음 — skip`)
      continue
    }

    const population  = num(popItem.ppltnCnt ?? popItem.총인구수)
    const households  = num(popItem.hhdCnt ?? popItem.세대수)
    const adm_nm: string = popItem.signguNm ?? `창원시${target.gu}`

    // 인구 증감 계산
    const prevPop = prevPopMap.get(target.admCd) ?? null
    const populationChange =
      population !== null && prevPop !== null ? population - prevPop : null

    // 연령분포 fetch
    const ageItem = await fetchAgeBreakdown(statsYm, adm_nm)

    // 5년 단위 → 6개 구간 합산
    // 행안부 API 연령별 필드명: ageGroup0004, ageGroup0509, ... ageGroup9599, ageGroup100
    const AGE_FIELDS: Record<string, string[]> = {
      popUnder20: ['ageGroup0004', 'ageGroup0509', 'ageGroup1014', 'ageGroup1519'],
      pop20s:     ['ageGroup2024', 'ageGroup2529'],
      pop30s:     ['ageGroup3034', 'ageGroup3539'],
      pop40s:     ['ageGroup4044', 'ageGroup4549'],
      pop50s:     ['ageGroup5054', 'ageGroup5559'],
      pop60plus:  [
        'ageGroup6064', 'ageGroup6569', 'ageGroup7074', 'ageGroup7579',
        'ageGroup8084', 'ageGroup8589', 'ageGroup9094', 'ageGroup9599', 'ageGroup100',
      ],
    }

    const popUnder20 = ageItem ? sumAgeGroups(ageItem, AGE_FIELDS.popUnder20!) : null
    const pop20s     = ageItem ? sumAgeGroups(ageItem, AGE_FIELDS.pop20s!)     : null
    const pop30s     = ageItem ? sumAgeGroups(ageItem, AGE_FIELDS.pop30s!)     : null
    const pop40s     = ageItem ? sumAgeGroups(ageItem, AGE_FIELDS.pop40s!)     : null
    const pop50s     = ageItem ? sumAgeGroups(ageItem, AGE_FIELDS.pop50s!)     : null
    const pop60plus  = ageItem ? sumAgeGroups(ageItem, AGE_FIELDS.pop60plus!)  : null

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
      pop_under20:       popUnder20,
      pop_20s:           pop20s,
      pop_30s:           pop30s,
      pop_40s:           pop40s,
      pop_50s:           pop50s,
      pop_60plus:        pop60plus,
      fetched_at:        new Date().toISOString(),
    }

    const { error } = await supabase
      .from('district_stats')
      .upsert(row, { onConflict: 'adm_cd,data_year,data_quarter' })

    if (error) {
      errors.push(`${target.gu}: ${error.message}`)
      console.error(`  ✗ ${target.gu}:`, error.message)
    } else {
      upserted++
      const ageStatus = ageItem ? '연령분포O' : '연령분포X'
      const changeStr = populationChange !== null
        ? (populationChange >= 0 ? `+${populationChange.toLocaleString()}` : populationChange.toLocaleString())
        : '증감없음'
      console.log(
        `  ✓ ${target.gu}: 인구${population?.toLocaleString() ?? '?'}명 / ` +
        `세대${households?.toLocaleString() ?? '?'}세대 / ` +
        `전년비${changeStr}명 / ${ageStatus}`,
      )
    }

    // API 레이트 리밋 대응
    await new Promise((r) => setTimeout(r, 300))
  }

  console.log(`\n완료: ${upserted}/${TARGETS.length}개 구 upsert`)
  if (errors.length > 0) {
    console.error('오류 목록:', errors)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
