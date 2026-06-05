/**
 * 학교알리미 OpenAPI → facility_school 학급당학생수·교원비율 업데이트
 *
 * 실행: npx tsx --env-file=.env.local scripts/collect-school-stats.ts [--year=2024] [--dry-run]
 *
 * API 규칙 (학교알리미, 2026.01.01 이후 발급 키):
 *   - apiType = pInfoCd 값과 동일 (09=학년별학급별학생수, 22=직위별교원현황)
 *   - sidoCode + sggCode 필수
 *   - 최근 3년치만 제공
 *
 * 수집 항목:
 *   - students_per_class  (COL_SUM: 전체 학급당 학생수)
 *   - teachers_ratio      (TEACH_CAL: 수업교원 1인당 학생수)
 *   - data_year           (공시연도)
 *
 * DB 매칭: SCHUL_CODE → facility_school.school_code (map-school-codes.ts로 매핑)
 *         또는 SCHUL_NM + school_type exact match (school_code 없는 경우 fallback)
 */

import { createClient } from '@supabase/supabase-js'

// ─── 학교알리미 API 설정 ─────────────────────────────────────────────────────
const API_BASE = 'https://www.schoolinfo.go.kr/openApi.do'
const API_TYPE_STUDENTS = '09'  // 학년별·학급별 학생수 (COL_SUM, TEACH_CAL)
const API_TYPE_TEACHERS = '22'  // 직위별 교원 현황 (COL_S: 총 교원수)

// ─── 경남 시군구 코드 (창원 5개 구 + 김해) ──────────────────────────────────
const GYEONGNAM_SGG: Array<{ name: string; sggCode: string; schulKndCodes: string[] }> = [
  { name: '창원시 의창구',   sggCode: '48121', schulKndCodes: ['02','03','04'] },
  { name: '창원시 성산구',   sggCode: '48123', schulKndCodes: ['02','03','04'] },
  { name: '창원시 마산합포구', sggCode: '48125', schulKndCodes: ['02','03','04'] },
  { name: '창원시 마산회원구', sggCode: '48127', schulKndCodes: ['02','03','04'] },
  { name: '창원시 진해구',   sggCode: '48129', schulKndCodes: ['02','03','04'] },
  { name: '김해시',          sggCode: '48250', schulKndCodes: ['02','03','04'] },
]
const SIDO_CODE = '48'

const SCHOOL_KND_TYPE: Record<string, string> = {
  '02': 'elementary',
  '03': 'middle',
  '04': 'high',
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function parseArg(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callSchoolInfoApi(apiKey: string, apiType: string, pbanYr: string, schulKndCode: string, sggCode: string): Promise<any[] | null> {
  try {
    const body = new URLSearchParams({
      apiKey,
      apiType,
      pbanYr,
      schulKndCode,
      sidoCode: SIDO_CODE,
      sggCode,
    })
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const j = await res.json()
    if (j.resultCode !== 'success') {
      console.warn(`    [API warn] apiType=${apiType}, sggCode=${sggCode}, knd=${schulKndCode}: ${j.resultMsg}`)
      return null
    }
    return j.list ?? []
  } catch (e) {
    console.warn(`    [API error] apiType=${apiType}, sggCode=${sggCode}:`, e)
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  const dataYear  = parseArg('year') ?? String(new Date().getFullYear())

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey      = process.env.SCHOOL_API_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요')
    process.exit(1)
  }
  if (!apiKey) {
    console.error('[ERROR] SCHOOL_API_KEY 환경변수 필요')
    process.exit(1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(supabaseUrl, serviceKey) as any
  console.log(`[수집] year=${dataYear}, dry-run=${isDryRun}`)

  // ─── 1단계: 학년별·학급별 학생수(apiType=09) 수집 ──────────────────────────
  console.log('\n[1/2] 학년별·학급별 학생수(apiType=09) 수집...')

  // school_code → { students_per_class, teachers_ratio, school_name, school_type }
  const statsMap = new Map<string, { students_per_class: number | null; teachers_ratio: number | null; school_name: string; school_type: string }>()

  for (const area of GYEONGNAM_SGG) {
    process.stdout.write(`  ${area.name}: `)
    let areaCount = 0
    for (const knd of area.schulKndCodes) {
      const rows = await callSchoolInfoApi(apiKey, API_TYPE_STUDENTS, dataYear, knd, area.sggCode)
      if (!rows) continue
      for (const r of rows) {
        if (!r.SCHUL_CODE) continue
        const existing = statsMap.get(r.SCHUL_CODE)
        if (!existing) {
          statsMap.set(r.SCHUL_CODE, {
            students_per_class: r.COL_SUM != null ? Number(r.COL_SUM) : null,
            teachers_ratio:     r.TEACH_CAL != null ? Number(r.TEACH_CAL) : null,
            school_name:        r.SCHUL_NM ?? '',
            school_type:        SCHOOL_KND_TYPE[knd] ?? knd,
          })
          areaCount++
        }
      }
    }
    process.stdout.write(`${areaCount}개\n`)
  }
  console.log(`  전체 수집: ${statsMap.size}개 학교`)

  // ─── 2단계: DB 업데이트 ────────────────────────────────────────────────────
  console.log('\n[2/2] DB 업데이트...')
  let byCode = 0, byName = 0, notFound = 0

  for (const [schoolCode, stats] of statsMap) {
    const updatePayload = {
      students_per_class: stats.students_per_class,
      teachers_ratio:     stats.teachers_ratio,
      data_year:          Number(dataYear),
    }

    if (isDryRun) {
      byCode++
      continue
    }

    // 방법 A: school_code로 매칭
    const { data: byCodeRows, error: err1 } = await supabase
      .from('facility_school')
      .update(updatePayload)
      .eq('school_code', schoolCode)
      .select('id')

    if (!err1 && byCodeRows && byCodeRows.length > 0) {
      byCode += byCodeRows.length
      continue
    }

    // 방법 B: 학교명 + 타입 exact match (school_code 미매핑 학교)
    const { data: byNameRows, error: err2 } = await supabase
      .from('facility_school')
      .update(updatePayload)
      .eq('school_name', stats.school_name)
      .eq('school_type', stats.school_type)
      .select('id')

    if (!err2 && byNameRows && byNameRows.length > 0) {
      byName += byNameRows.length
      // school_code도 업데이트 (향후 매칭 속도 개선)
      await supabase
        .from('facility_school')
        .update({ school_code: schoolCode })
        .eq('school_name', stats.school_name)
        .eq('school_type', stats.school_type)
      continue
    }

    notFound++
  }

  console.log(`  school_code 매칭: ${byCode}건`)
  console.log(`  school_name 매칭: ${byName}건`)
  console.log(`  미매칭: ${notFound}건`)
  if (isDryRun) console.log('  (DRY-RUN — DB 변경 없음)')
  console.log('\n완료.')
}

main().catch(err => {
  console.error('[FATAL]', err)
  process.exit(1)
})
