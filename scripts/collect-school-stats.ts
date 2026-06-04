/**
 * 학교알리미 공시 데이터 파일(data.go.kr)을 파싱하여
 * facility_school의 품질 컬럼을 업데이트한다.
 *
 * 실행: npx tsx --env-file=.env.local scripts/collect-school-stats.ts [--year=2024] [--dry-run]
 *
 * 입력 파일 (수동 다운로드 → data/ 디렉토리에 배치):
 *   data/school-stats-students.csv    학급당학생수 (학교코드, 학교명, 학교종류, 학급당학생수)
 *   data/school-stats-teachers.csv   교원1인당학생수 (학교코드, 교원1인당학생수)
 *   data/school-stats-advancement.csv 진학현황 (학교코드, 과학고, 외고, 자사고 진학자수)
 *
 * 파일이 없으면 SKIP 메시지 출력 후 해당 업데이트 건너뜀.
 * school_code 기준 매칭 — 10-05 스크립트로 school_code 먼저 채워야 효과적.
 *
 * data.go.kr URL:
 *   학급당학생수: https://www.data.go.kr/data/15106331/fileData.do
 *   교원현황:    https://www.data.go.kr/data/15014351/fileData.do
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

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

function parseArg(name: string): string | undefined {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`))
  return arg?.split('=')[1]
}

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf-8')
  // BOM 제거
  const content = raw.replace(/^﻿/, '')
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

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  const dataYear = Number(parseArg('year') ?? new Date().getFullYear())

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const studentsFile    = path.join(DATA_DIR, 'school-stats-students.csv')
  const teachersFile    = path.join(DATA_DIR, 'school-stats-teachers.csv')
  const advancementFile = path.join(DATA_DIR, 'school-stats-advancement.csv')

  let anyFile = false

  // ─── 1. 학급당학생수 ─────────────────────────────────────────────────────
  if (fs.existsSync(studentsFile)) {
    anyFile = true
    console.log(`[students] ${studentsFile} 파싱 중...`)
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
    console.log(`[SKIP] ${studentsFile} 없음 — 학급당학생수 업데이트 건너뜀`)
  }

  // ─── 2. 교원 1인당 학생수 ────────────────────────────────────────────────
  if (fs.existsSync(teachersFile)) {
    anyFile = true
    console.log(`[teachers] ${teachersFile} 파싱 중...`)
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
    console.log(`[SKIP] ${teachersFile} 없음 — 교원비율 업데이트 건너뜀`)
  }

  // ─── 3. 진학현황 (중학교 전용) ───────────────────────────────────────────
  if (fs.existsSync(advancementFile)) {
    anyFile = true
    console.log(`[advancement] ${advancementFile} 파싱 중...`)
    const rows = parseCsv(advancementFile)
    let updated = 0, skipped = 0

    for (const row of rows) {
      const code    = row[COL_SCHOOL_CODE]?.trim()
      const science = num(row[COL_ADVANCEMENT_SCIENCE])
      const foreign = num(row[COL_ADVANCEMENT_FOREIGN])
      const private_= num(row[COL_ADVANCEMENT_PRIVATE])
      const total   = num(row[COL_TOTAL_GRADUATES])
      if (!code) { skipped++; continue }

      const totalAdvancement = (science ?? 0) + (foreign ?? 0) + (private_ ?? 0)
      const rate = total && total > 0
        ? Math.round((totalAdvancement / total) * 10000) / 100  // 소수점 2자리 %
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
    console.log(`[SKIP] ${advancementFile} 없음 — 진학현황 업데이트 건너뜀`)
  }

  if (!anyFile) {
    console.log('\n[INFO] 처리할 파일 없음. data/ 디렉토리에 CSV 파일을 배치 후 재실행하세요.')
    console.log('  data/school-stats-students.csv')
    console.log('  data/school-stats-teachers.csv')
    console.log('  data/school-stats-advancement.csv')
    console.log('\n다운로드 링크:')
    console.log('  학급당학생수: https://www.data.go.kr/data/15106331/fileData.do')
    console.log('  교원현황:    https://www.data.go.kr/data/15014351/fileData.do')
  }

  console.log('\n완료.')
}

main().catch(err => {
  console.error('[FATAL]', err)
  process.exit(1)
})
