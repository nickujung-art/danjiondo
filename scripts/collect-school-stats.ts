/**
 * 학교 품질 지표 수집 (학교알리미 API 또는 data.go.kr CSV)
 *
 * 실행: npx tsx --env-file=.env.local scripts/collect-school-stats.ts [--year=2024] [--dry-run]
 *
 * 우선순위:
 *   1. SCHOOL_API_KEY 있으면 학교알리미 OpenAPI 직접 호출
 *   2. CSV 파일 있으면 data.go.kr CSV 파싱 (data/ 디렉토리)
 *   3. 둘 다 없으면 안내 출력
 *
 * 학교알리미 API 사용 전 주의:
 *   학교알리미(www.schoolinfo.go.kr) > OpenAPI > API 제공목록 탭에서
 *   원하는 공시항목(학년별학급별학생수=09, 교원현황=22 등)을 활성화해야 함.
 *   활성화 전에는 "공시되지 않은 항목" 오류 발생.
 *
 * CSV 다운로드 링크:
 *   학급당학생수: https://www.data.go.kr/data/15106331/fileData.do
 *   교원현황:    https://www.data.go.kr/data/15014351/fileData.do
 *   진학현황:    data.go.kr 에서 '학교알리미 진학현황' 검색
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// ─── 학교알리미 API 설정 ──────────────────────────────────────────────────────
const SCHOOLINFO_API_BASE = 'https://www.schoolinfo.go.kr/openApi.do'
// 공시항목 코드 (API 제공목록 탭에서 활성화 필요)
const INFO_CD_STUDENTS = '09'   // 학년별·학급별 학생수
const INFO_CD_TEACHERS = '22'   // 직위별 교원 현황

// ─── CSV 컬럼명 상수 (파일 버전 변경 시 여기만 수정) ─────────────────────────
const COL_SCHOOL_CODE         = '학교코드'
const COL_STUDENTS_PER_CLASS  = '학급당학생수'
const COL_TEACHERS_RATIO      = '교원1인당학생수'
const COL_ADVANCEMENT_SCIENCE = '과학고진학자수'
const COL_ADVANCEMENT_FOREIGN = '외국어고및국제고진학자수'
const COL_ADVANCEMENT_PRIVATE = '자사고진학자수'
const COL_TOTAL_GRADUATES     = '졸업자수'
// ─────────────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data')
const PAGE_SIZE = 1000

function parseArg(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
}

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const content = raw.replace(/^﻿/, '')  // BOM 제거
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = (lines[0] ?? '').split(',').map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

function num(val: string | undefined): number | null {
  if (!val || val === '' || val === '-') return null
  const n = Number(val.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// ─── 학교알리미 API 조회 ──────────────────────────────────────────────────────
interface SchoolInfoRow {
  school_code:     string
  pInfoCd:         string
  year:            string
  // 학생현황
  grade?:          string
  class_nm?:       string
  students_count?: number
  // 교원현황
  teacher_count?:  number
}

async function fetchSchoolInfoData(
  apiKey:      string,
  pInfoCd:     string,
  pbanYr:      string,
  schulKndCode: string,   // 02=초, 03=중, 04=고
  sidoCode:    string,    // 시도코드 (경남=48)
  sggCode:     string,    // 시군구코드
): Promise<SchoolInfoRow[] | null> {
  let pageIndex = 1
  const all: SchoolInfoRow[] = []

  while (true) {
    const url = new URL(SCHOOLINFO_API_BASE)
    url.searchParams.set('apiKey',       apiKey)
    url.searchParams.set('apiType',      'json')
    url.searchParams.set('schulKndCode', schulKndCode)
    url.searchParams.set('pbanYr',       pbanYr)
    url.searchParams.set('sidoCode',     sidoCode)
    url.searchParams.set('sggCode',      sggCode)
    url.searchParams.set('pInfoCd',      pInfoCd)
    url.searchParams.set('pageIndex',    String(pageIndex))
    url.searchParams.set('pageSize',     String(PAGE_SIZE))

    const res = await fetch(url.toString())
    const j   = await res.json()

    if (j.resultCode === 'fail') {
      console.warn('  [학교알리미 API 오류]', j.resultMsg)
      console.warn('  → 학교알리미 > OpenAPI > API 제공목록 탭에서 해당 항목을 활성화하세요.')
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = j.list ?? j.data ?? []
    if (rows.length === 0) break

    for (const r of rows) {
      all.push({
        school_code:     r.SD_SCHUL_CODE ?? r.schulCode ?? '',
        pInfoCd,
        year:            pbanYr,
        grade:           r.GRADE,
        class_nm:        r.CLASS_NM,
        students_count:  r.STU_CNT != null ? Number(r.STU_CNT) : undefined,
        teacher_count:   r.TCHR_CNT != null ? Number(r.TCHR_CNT) : undefined,
      })
    }

    if (rows.length < PAGE_SIZE) break
    pageIndex++
  }

  return all
}

// ─── 경남 시군구 코드 (창원+김해) ────────────────────────────────────────────
const GYEONGNAM_SGG: Record<string, string> = {
  '창원시 의창구': '48121',
  '창원시 성산구': '48123',
  '창원시 마산합포구': '48125',
  '창원시 마산회원구': '48127',
  '창원시 진해구': '48129',
  '김해시': '48250',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trySchoolInfoApi(
  supabase:   any,
  apiKey:     string,
  pbanYr:     string,
  isDryRun:   boolean,
) {
  console.log('[학교알리미 API] 경남 중학교 학급당학생수 조회 시도...')

  let totalUpdated = 0
  let apiWorked = false

  for (const [areaName, sggCode] of Object.entries(GYEONGNAM_SGG)) {
    process.stdout.write(`  ${areaName}(sggCode=${sggCode}) `)
    const rows = await fetchSchoolInfoData(apiKey, INFO_CD_STUDENTS, pbanYr, '03', '48', sggCode)
    if (!rows) {
      process.stdout.write('→ API 미활성화\n')
      return false  // API 안 됨 — CSV로 fallback
    }
    apiWorked = true
    process.stdout.write(`→ ${rows.length}행\n`)
    // TODO: rows를 집계하여 facility_school 업데이트
    // rows에서 학교코드별 평균 학급당학생수 계산 필요
    // (현재 API 응답 구조 미확인으로 집계 로직 보류)
    totalUpdated += rows.length
  }

  if (apiWorked) {
    console.log(`[학교알리미 API] 총 ${totalUpdated}행 조회됨 (DB 업데이트 로직 구현 중)`)
  }
  return apiWorked
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  const dataYear = Number(parseArg('year') ?? new Date().getFullYear())
  const apiKey   = process.env.SCHOOL_API_KEY ?? ''

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  console.log(`[수집 모드] year=${dataYear}, dry-run=${isDryRun}`)

  // ─── 방법 1: 학교알리미 API ────────────────────────────────────────────────
  if (apiKey) {
    console.log(`[학교알리미 API 키 확인: ${apiKey.substring(0, 8)}...]`)
    const worked = await trySchoolInfoApi(supabase, apiKey, String(dataYear), isDryRun)
    if (worked) {
      console.log('완료 (API 방식)')
      return
    }
    console.log('[학교알리미 API] 데이터 미활성화 → CSV 방식으로 전환\n')
  }

  // ─── 방법 2: CSV 파일 ─────────────────────────────────────────────────────
  const studentsFile    = path.join(DATA_DIR, 'school-stats-students.csv')
  const teachersFile    = path.join(DATA_DIR, 'school-stats-teachers.csv')
  const advancementFile = path.join(DATA_DIR, 'school-stats-advancement.csv')
  let anyFile = false

  if (fs.existsSync(studentsFile)) {
    anyFile = true
    console.log(`[students CSV] ${studentsFile} 파싱 중...`)
    const rows = parseCsv(studentsFile)
    let updated = 0, skipped = 0

    for (const row of rows) {
      const code = row[COL_SCHOOL_CODE]?.trim()
      const val  = num(row[COL_STUDENTS_PER_CLASS])
      if (!code || val === null) { skipped++; continue }

      if (!isDryRun) {
        const { error } = await supabase
          .from('facility_school')
          .update({ students_per_class: val, data_year: dataYear })
          .eq('school_code', code)
        if (error) { console.warn(`  [WARN] ${code}: ${error.message}`); skipped++ }
        else updated++
      } else {
        updated++
      }
    }
    console.log(`  업데이트: ${updated}건 / 스킵: ${skipped}건${isDryRun ? ' (DRY-RUN)' : ''}`)
  } else {
    console.log(`[SKIP] school-stats-students.csv 없음`)
  }

  if (fs.existsSync(teachersFile)) {
    anyFile = true
    console.log(`[teachers CSV] ${teachersFile} 파싱 중...`)
    const rows = parseCsv(teachersFile)
    let updated = 0, skipped = 0

    for (const row of rows) {
      const code = row[COL_SCHOOL_CODE]?.trim()
      const val  = num(row[COL_TEACHERS_RATIO])
      if (!code || val === null) { skipped++; continue }

      if (!isDryRun) {
        const { error } = await supabase
          .from('facility_school')
          .update({ teachers_ratio: val, data_year: dataYear })
          .eq('school_code', code)
        if (error) { console.warn(`  [WARN] ${code}: ${error.message}`); skipped++ }
        else updated++
      } else {
        updated++
      }
    }
    console.log(`  업데이트: ${updated}건 / 스킵: ${skipped}건${isDryRun ? ' (DRY-RUN)' : ''}`)
  } else {
    console.log(`[SKIP] school-stats-teachers.csv 없음`)
  }

  if (fs.existsSync(advancementFile)) {
    anyFile = true
    console.log(`[advancement CSV] ${advancementFile} 파싱 중...`)
    const rows = parseCsv(advancementFile)
    let updated = 0, skipped = 0

    for (const row of rows) {
      const code     = row[COL_SCHOOL_CODE]?.trim()
      const science  = num(row[COL_ADVANCEMENT_SCIENCE])
      const foreign  = num(row[COL_ADVANCEMENT_FOREIGN])
      const private_ = num(row[COL_ADVANCEMENT_PRIVATE])
      const total    = num(row[COL_TOTAL_GRADUATES])
      if (!code) { skipped++; continue }

      const totalAdv = (science ?? 0) + (foreign ?? 0) + (private_ ?? 0)
      const rate = total && total > 0
        ? Math.round((totalAdv / total) * 10000) / 100
        : null

      if (!isDryRun) {
        const { error } = await supabase
          .from('facility_school')
          .update({
            advancement_science: science,
            advancement_foreign: foreign,
            advancement_private: private_,
            advancement_rate:    rate,
            data_year:           dataYear,
          })
          .eq('school_code', code)
        if (error) { console.warn(`  [WARN] ${code}: ${error.message}`); skipped++ }
        else updated++
      } else {
        updated++
      }
    }
    console.log(`  업데이트: ${updated}건 / 스킵: ${skipped}건${isDryRun ? ' (DRY-RUN)' : ''}`)
  } else {
    console.log(`[SKIP] school-stats-advancement.csv 없음`)
  }

  if (!anyFile) {
    console.log(`
=== 데이터 수집 방법 ===

방법 A: 학교알리미 API (SCHOOL_API_KEY 설정 완료)
  1. https://www.schoolinfo.go.kr 접속
  2. OpenAPI > API 제공목록 탭 클릭
  3. 다음 항목 활성화 (신청/승인):
     - 09: 학년별·학급별 학생수
     - 22: 직위별 교원 현황
  4. 재실행: npx tsx --env-file=.env.local scripts/collect-school-stats.ts --year=2024

방법 B: data.go.kr CSV 직접 다운로드
  data/ 폴더에 아래 파일 배치 후 재실행:
  - school-stats-students.csv  (학급당학생수)
    → https://www.data.go.kr/data/15106331/fileData.do
  - school-stats-teachers.csv  (교원현황)
    → https://www.data.go.kr/data/15014351/fileData.do
  - school-stats-advancement.csv (진학현황)
    → data.go.kr 에서 '학교알리미 졸업후 진학현황' 검색
`)
  }

  console.log('완료.')
}

main().catch(err => {
  console.error('[FATAL]', err)
  process.exit(1)
})
