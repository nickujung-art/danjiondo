/**
 * KOSIS 가계금융복지조사에서 경남 연간 평균 가구소득을 조회하여
 * regional_income 테이블을 자동 업데이트한다.
 *
 * 사용법:
 *   npx tsx scripts/update-regional-income.ts              # DB 업데이트
 *   npx tsx scripts/update-regional-income.ts --dry-run    # 확인만 (DB 수정 없음)
 *   npx tsx scripts/update-regional-income.ts --probe      # KOSIS API 응답 raw 출력 (테이블 ID 확인용)
 *   npx tsx scripts/update-regional-income.ts --year=2025  # 특정 연도만
 *
 * KOSIS 테이블 확인 방법 (--probe 실행 후 맞지 않으면):
 *   1. https://kosis.kr 접속 → 통계 검색 → "가계금융복지조사 시도별"
 *   2. 원하는 표 클릭 → URL에서 tblId 값 확인
 *   3. 아래 INCOME_TBL_ID 상수를 업데이트
 *
 * 데이터 발표 주기: 매년 3~5월 (전년도 데이터)
 * 권장 실행 시점: 매년 7월 (발표 후 충분한 여유)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// ─── KOSIS 설정 ──────────────────────────────────────────────────────────────
const KOSIS_BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'

// 가계금융복지조사 시도별 가구소득 — 테이블 ID
// 확인: kosis.kr → 가계금융복지조사 → 소득·지출 → 시도별 → API 조회 후 tblId 파라미터
const ORG_ID       = '101'         // 통계청
const INCOME_TBL   = 'DT_HHMACF2' // 1차 시도 (가계금융복지조사)
const FALLBACK_TBL = 'DT_HHMACF5' // 2차 시도 (표 이름이 다를 경우)

// 경남 시도코드 (KOSIS C1 분류)
// 확인: --probe 실행 시 출력되는 C1, C1_NM 필드로 확인 가능
const GYEONGNAM_C1 = '48'

// 연간 평균소득 항목 (ITM_ID)
// 확인: --probe 출력에서 ITM_NM이 "평균소득" 또는 "가구소득"인 행의 ITM_ID 값
const INCOME_ITM   = 'T1'

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── 플래그 파싱 ─────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run')
const PROBE   = process.argv.includes('--probe')
const yearArg = process.argv.find(a => a.startsWith('--year='))
const TARGET_YEAR = yearArg ? parseInt(yearArg.split('=')[1]!) : null

// ─── KOSIS API 호출 ──────────────────────────────────────────────────────────
interface KosisRow {
  PRD_DE: string   // 연도 (YYYY)
  C1:     string   // 분류 코드 (시도코드)
  C1_NM:  string   // 분류명
  ITM_ID: string   // 항목 ID
  ITM_NM: string   // 항목명
  DT:     string   // 수치값
}

async function fetchKosisIncome(tblId: string): Promise<KosisRow[]> {
  const key = process.env.KOSIS_API_KEY
  if (!key) throw new Error('KOSIS_API_KEY 환경변수 없음')

  const url =
    `${KOSIS_BASE}?method=getList` +
    `&apiKey=${encodeURIComponent(key)}` +
    `&orgId=${ORG_ID}&tblId=${tblId}` +
    `&itmId=${INCOME_ITM}+` +
    `&objL1=${GYEONGNAM_C1}+` +
    `&objL2=&objL3=&objL4=&objL5=&objL6=&objL7=&objL8=` +
    `&format=json&jsonVD=Y` +
    `&prdSe=Y&newEstPrdCnt=6`  // 최근 6년치

  const res = await fetch(url)
  if (!res.ok) throw new Error(`KOSIS HTTP ${res.status}`)

  const json = await res.json()

  // KOSIS 에러 응답 확인
  if (json?.err) {
    throw new Error(`KOSIS 에러 ${json.err}: ${json.errMsg}`)
  }

  if (!Array.isArray(json)) {
    throw new Error(`예상치 못한 KOSIS 응답 형식: ${JSON.stringify(json).slice(0, 200)}`)
  }

  return json as KosisRow[]
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== 경남 가구소득 업데이트 ${DRY_RUN ? '[DRY-RUN]' : PROBE ? '[PROBE]' : ''} ===\n`)

  // --probe: 원시 API 응답 출력 후 종료
  if (PROBE) {
    console.log(`KOSIS 테이블 ${INCOME_TBL} 원시 응답 조회 중...`)
    try {
      const rows = await fetchKosisIncome(INCOME_TBL)
      console.log(`\n응답 행 수: ${rows.length}`)
      if (rows.length > 0) {
        console.log('\n첫 번째 행 필드:')
        console.log(JSON.stringify(rows[0], null, 2))
        console.log('\n모든 ITM_NM 항목:')
        const items = [...new Set(rows.map(r => `${r.ITM_ID}: ${r.ITM_NM}`))]
        items.forEach(i => console.log(' ', i))
        console.log('\n모든 시도 (C1):')
        const regions = [...new Set(rows.map(r => `${r.C1}: ${r.C1_NM}`))]
        regions.forEach(r => console.log(' ', r))
        console.log('\n경남(C1=48) 데이터:')
        rows.filter(r => r.C1 === GYEONGNAM_C1).forEach(r =>
          console.log(`  ${r.PRD_DE}년: ${r.ITM_NM} = ${r.DT}`)
        )
      }
    } catch (e) {
      console.error('1차 테이블 실패:', e instanceof Error ? e.message : e)
      console.log(`\nFallback 테이블 ${FALLBACK_TBL} 시도...`)
      try {
        const rows2 = await fetchKosisIncome(FALLBACK_TBL)
        console.log(`응답 행 수: ${rows2.length}`)
        if (rows2.length > 0) console.log(JSON.stringify(rows2.slice(0, 3), null, 2))
      } catch (e2) {
        console.error('2차 테이블도 실패:', e2 instanceof Error ? e2.message : e2)
        console.log('\n→ KOSIS 포털에서 직접 테이블 ID를 확인해주세요:')
        console.log('  1. https://kosis.kr → 통계 검색 → "가계금융복지조사 시도별 가구소득"')
        console.log('  2. 표 선택 → API 탭 → tblId 파라미터 값 확인')
        console.log('  3. INCOME_TBL 상수 업데이트 후 재실행')
      }
    }
    return
  }

  // 실제 데이터 조회
  let rows: KosisRow[] = []
  let usedTbl = INCOME_TBL
  try {
    rows = await fetchKosisIncome(INCOME_TBL)
    console.log(`[OK] ${INCOME_TBL} 조회 성공 (${rows.length}행)`)
  } catch (e) {
    console.warn(`[WARN] ${INCOME_TBL} 실패 — Fallback ${FALLBACK_TBL} 시도...`)
    try {
      rows = await fetchKosisIncome(FALLBACK_TBL)
      usedTbl = FALLBACK_TBL
      console.log(`[OK] ${FALLBACK_TBL} 조회 성공 (${rows.length}행)`)
    } catch (e2) {
      console.error('[FAIL] KOSIS 조회 실패:', e2 instanceof Error ? e2.message : e2)
      console.log('\n→ --probe 옵션으로 API 응답을 확인하세요.')
      process.exit(1)
    }
  }

  // 경남 소득 행 필터링 (만원 단위로 변환)
  const gyeongnamRows = rows
    .filter(r => r.C1 === GYEONGNAM_C1 && r.DT && !isNaN(Number(r.DT)))
    .map(r => {
      const year = parseInt(r.PRD_DE)
      // KOSIS는 보통 단위가 "만원" 또는 "원" — 값 크기로 추정
      const rawVal = Number(r.DT)
      // 원 단위면 만원으로 변환 (일반적으로 5000만원대 → 50000000원)
      const avgIncomeMw = rawVal > 100000 ? Math.round(rawVal / 10000) : Math.round(rawVal)
      return { year, avgIncome: avgIncomeMw, rawVal, itmNm: r.ITM_NM }
    })
    .filter(r => !isNaN(r.year) && r.avgIncome > 0)
    .filter(r => !TARGET_YEAR || r.year === TARGET_YEAR)
    .sort((a, b) => a.year - b.year)

  if (gyeongnamRows.length === 0) {
    console.warn('[WARN] 경남 소득 데이터를 찾을 수 없습니다.')
    console.log('→ --probe 옵션으로 API 구조를 확인하고 GYEONGNAM_C1, INCOME_ITM 상수를 조정하세요.')
    process.exit(1)
  }

  console.log(`\n조회된 경남 가구소득 (${usedTbl}):`)
  gyeongnamRows.forEach(r =>
    console.log(`  ${r.year}년: ${r.avgIncome.toLocaleString('ko-KR')}만원 (원본: ${r.rawVal}, ${r.itmNm})`)
  )

  // DB 기존 데이터 확인
  const { data: existing } = await supabase
    .from('regional_income')
    .select('year, avg_income')
    .eq('region_code', 'gyeongnam')
    .order('year', { ascending: false })

  const existingYears = new Set((existing ?? []).map(r => r.year))
  console.log(`\nDB 기존 연도: ${[...existingYears].join(', ') || '없음'}`)

  // 신규 연도만 upsert
  const toInsert = gyeongnamRows.filter(r => !existingYears.has(r.year))
  const toUpdate = gyeongnamRows.filter(r => existingYears.has(r.year))

  if (toInsert.length === 0 && toUpdate.length === 0) {
    console.log('\n[OK] 업데이트할 데이터 없음 (모두 최신)')
    return
  }

  if (toInsert.length > 0) {
    console.log(`\n신규 추가 예정: ${toInsert.map(r => r.year).join(', ')}년`)
  }
  if (toUpdate.length > 0) {
    console.log(`업데이트 예정: ${toUpdate.map(r => r.year).join(', ')}년`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] DB 수정하지 않음')
    return
  }

  // 실제 upsert
  for (const row of [...toInsert, ...toUpdate]) {
    const { error } = await supabase
      .from('regional_income')
      .upsert(
        {
          region_code: 'gyeongnam',
          year:        row.year,
          avg_income:  row.avgIncome,
          source:      `kosis-auto-${usedTbl}`,
        },
        { onConflict: 'region_code,year' },
      )

    if (error) {
      console.error(`[FAIL] ${row.year}년 upsert 실패:`, error.message)
    } else {
      console.log(`[OK]  ${row.year}년 ${row.avgIncome.toLocaleString('ko-KR')}만원 upsert 완료`)
    }
  }

  console.log('\n완료.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
