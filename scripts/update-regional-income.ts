/**
 * KOSIS 가계금융복지조사 (DT_1HDAAA01)에서 지역별 경상소득을 조회하여
 * regional_income 테이블을 자동 업데이트한다.
 *
 * 사용법:
 *   npx tsx scripts/update-regional-income.ts           # DB 업데이트
 *   npx tsx scripts/update-regional-income.ts --dry-run # 확인만 (DB 수정 없음)
 *   npx tsx scripts/update-regional-income.ts --probe   # KOSIS 원시 응답 출력
 *   npx tsx scripts/update-regional-income.ts --year=2025
 *
 * 데이터 발표 주기: 매년 3~5월 (전년도 소득 기준)
 * 권장 실행 시점: 매년 7월 1일 (GitHub Actions 자동 실행)
 *
 * ── 전국구 확대 시 업데이트 가이드 ────────────────────────────────────────────
 * 현재 가계금융복지조사는 전국/수도권/비수도권 3개만 지원 (시도별 없음).
 * 전국 확대 시:
 *   1. 시도별 소득 통계표 확보 (예: 지역소득통계, 별도 조사)
 *   2. REGION_MAP에 시도별 코드 추가
 *   3. tblId, itmId, objL 파라미터 업데이트
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// ─── KOSIS 파라미터 ───────────────────────────────────────────────────────────
// 테이블: 가계금융복지조사 — 지역별 자산·부채·소득 현황
// 경로: kosis.kr → 소득·소비·자산 → 가계금융복지조사(2017~) → 총괄 → 지역별 자산·부채·소득 현황
const TBL_ID  = 'DT_1HDAAA01'
const ORG_ID  = '101'   // 통계청
const ITM_ID  = 'T01'   // 전가구 평균
const OBJ_L1  = 'A0100' // 전체 (부채보유여부 무관)
const OBJ_L3  = 'C04'   // 경상소득(전년도)

// 지역코드 매핑: region_code → KOSIS objL2 코드
// 현재: 가계금융복지조사는 수도권/비수도권만 제공, 경남은 비수도권(B0520)으로 대리
// 전국구 확대 시: 시도별 데이터 제공 테이블로 교체 후 코드 추가
const REGION_MAP: Record<string, { objL2: string; label: string }> = {
  gyeongnam: { objL2: 'B0520', label: '비수도권(경남 대리값)' },
  // 향후 추가 예시:
  // gyeonggi: { objL2: 'B0510', label: '수도권(경기 대리값)' },
}

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── 플래그 파싱 ─────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run')
const PROBE     = process.argv.includes('--probe')
const yearArg   = process.argv.find(a => a.startsWith('--year='))
const TARGET_YEAR = yearArg ? parseInt(yearArg.split('=')[1]!) : null

// ─── KOSIS 조회 ──────────────────────────────────────────────────────────────
interface KosisRow {
  PRD_DE:  string  // 조사연도
  C2:      string  // 지역 코드 (B0500=전국, B0510=수도권, B0520=비수도권)
  C2_NM:   string  // 지역명
  C3_NM:   string  // 분류명 (경상소득(전년도) 등)
  ITM_NM:  string  // 항목명 (전가구 평균 등)
  DT:      string  // 소득값 (만원)
  UNIT_NM: string  // 단위
}

async function fetchIncome(objL2: string, years = 6): Promise<KosisRow[]> {
  const key = process.env.KOSIS_API_KEY
  if (!key) throw new Error('KOSIS_API_KEY 환경변수 없음')

  const url =
    `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList` +
    `&apiKey=${encodeURIComponent(key)}` +
    `&orgId=${ORG_ID}&tblId=${TBL_ID}` +
    `&itmId=${ITM_ID}+` +
    `&objL1=${OBJ_L1}+&objL2=${objL2}+&objL3=${OBJ_L3}+` +
    `&objL4=&objL5=&objL6=&objL7=&objL8=` +
    `&format=json&jsonVD=Y&prdSe=Y&newEstPrdCnt=${years}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`KOSIS HTTP ${res.status}`)
  const json = await res.json()
  if (json?.err) throw new Error(`KOSIS 에러 ${json.err}: ${json.errMsg}`)
  if (!Array.isArray(json)) throw new Error(`예상치 못한 응답: ${JSON.stringify(json).slice(0, 200)}`)
  return json as KosisRow[]
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  const mode = DRY_RUN ? '[DRY-RUN]' : PROBE ? '[PROBE]' : ''
  console.log(`\n=== 지역 가구소득 업데이트 ${mode} ===\n`)

  if (PROBE) {
    console.log(`테이블: ${TBL_ID} | itmId: ${ITM_ID} | objL3: ${OBJ_L3}\n`)
    for (const [regionCode, { objL2, label }] of Object.entries(REGION_MAP)) {
      console.log(`\n[${regionCode}] ${label} (objL2=${objL2})`)
      try {
        const rows = await fetchIncome(objL2, 6)
        rows.forEach(r =>
          console.log(`  ${r.PRD_DE}년: ${Number(r.DT).toLocaleString('ko-KR')} ${r.UNIT_NM}`)
        )
      } catch (e) {
        console.error(' 실패:', e instanceof Error ? e.message : e)
      }
    }
    return
  }

  for (const [regionCode, { objL2, label }] of Object.entries(REGION_MAP)) {
    console.log(`\n[${regionCode}] ${label}`)

    let rows: KosisRow[]
    try {
      rows = await fetchIncome(objL2, 6)
      console.log(`  KOSIS 조회 성공 (${rows.length}행)`)
    } catch (e) {
      console.error('  [FAIL]', e instanceof Error ? e.message : e)
      continue
    }

    const parsed = rows
      .filter(r => r.DT && !isNaN(Number(r.DT)))
      .map(r => ({
        year:      parseInt(r.PRD_DE),
        // DT 단위는 만원 (UNIT_NM='만원' 확인됨)
        avgIncome: Math.round(Number(r.DT)),
      }))
      .filter(r => !isNaN(r.year) && r.avgIncome > 0)
      .filter(r => !TARGET_YEAR || r.year === TARGET_YEAR)
      .sort((a, b) => a.year - b.year)

    if (parsed.length === 0) {
      console.warn('  [WARN] 유효 데이터 없음')
      continue
    }

    console.log('  조회 결과:')
    parsed.forEach(r => console.log(`    ${r.year}년: ${r.avgIncome.toLocaleString('ko-KR')}만원`))

    const { data: existing } = await supabase
      .from('regional_income')
      .select('year, avg_income')
      .eq('region_code', regionCode)
      .order('year', { ascending: false })

    const existingYears = new Set((existing ?? []).map(r => r.year))
    console.log(`  DB 기존 연도: ${[...existingYears].sort().join(', ') || '없음'}`)

    const toUpsert = parsed.filter(r =>
      !existingYears.has(r.year) ||
      (existing ?? []).find(e => e.year === r.year)?.avg_income !== r.avgIncome
    )

    if (toUpsert.length === 0) {
      console.log('  [OK] 업데이트할 데이터 없음')
      continue
    }

    console.log(`  upsert 대상: ${toUpsert.map(r => r.year).join(', ')}년`)

    if (DRY_RUN) {
      console.log('  [DRY-RUN] DB 수정 생략')
      continue
    }

    for (const row of toUpsert) {
      const { error } = await supabase
        .from('regional_income')
        .upsert(
          { region_code: regionCode, year: row.year, avg_income: row.avgIncome, source: `kosis-${TBL_ID}` },
          { onConflict: 'region_code,year' },
        )
      if (error) {
        console.error(`  [FAIL] ${row.year}년:`, error.message)
      } else {
        console.log(`  [OK]  ${row.year}년 ${row.avgIncome.toLocaleString('ko-KR')}만원`)
      }
    }
  }

  console.log('\n완료.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
