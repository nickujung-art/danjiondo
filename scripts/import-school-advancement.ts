/**
 * 학교알리미 공개용데이터 「13-다. 졸업생의 진로 현황」CSV 임포트
 *
 * 사용법:
 *   npx tsx scripts/import-school-advancement.ts <CSV 파일 경로>
 *
 * CSV 다운로드 방법:
 *   1. https://www.schoolinfo.go.kr 접속 → Naver/Kakao SNS 로그인
 *   2. [공개용데이터] → [졸업생의 진로 현황] → 경남 선택 → 연도 선택 → CSV 다운로드
 *   3. 중학교(3), 고등학교(4) 두 파일 각각 실행
 */

import fs   from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── CSV 파싱 ──────────────────────────────────────────────────────────────────
function parseCsv(filePath: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV가 비어 있습니다')

  const headers = lines[0]!.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

// ─── 헤더 자동 감지 ────────────────────────────────────────────────────────────
function findCol(row: Record<string, string>, keywords: string[]): number {
  const key = Object.keys(row).find(k => keywords.some(kw => k.includes(kw)))
  if (!key) return 0
  return Number((row[key] ?? '').replace(/,/g, '')) || 0
}

function detectHeader(row: Record<string, string>) {
  // 컬럼 탐지 결과 출력 (첫 행만)
  const keys = Object.keys(row)
  console.log('  감지된 CSV 컬럼:', keys.join(' | '))
}

// ─── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  const csvFile = process.argv[2]
  if (!csvFile) {
    console.error('사용법: npx tsx scripts/import-school-advancement.ts <CSV 파일 경로>')
    process.exit(1)
  }

  console.log(`\n파일 읽는 중: ${csvFile}`)
  const rows = parseCsv(csvFile)
  console.log(`  총 ${rows.length}행 로드`)

  if (rows.length > 0) {
    console.log('\n컬럼 구조 확인:')
    detectHeader(rows[0]!)
  }

  // 창원/김해 중학교 목록 로드
  const { data: schools, error: schErr } = await supabase
    .from('facility_school')
    .select('id, school_name, school_type, school_code')
    .in('school_type', ['middle'])

  if (schErr) throw schErr
  console.log(`\nDB 중학교 ${schools!.length}개 로드`)

  const schoolMap = new Map(schools!.map(s => [s.school_name, s]))

  let updated = 0
  let notFound = 0
  const notFoundNames: string[] = []

  for (const row of rows) {
    // 학교명 컬럼 찾기
    const schoolName = row['학교명'] ?? row['학교이름'] ?? row['학교 명'] ?? ''
    if (!schoolName) continue

    const school = schoolMap.get(schoolName)
    if (!school) {
      notFound++
      notFoundNames.push(schoolName)
      continue
    }

    // 졸업자 수 (분모)
    const graduates = findCol(row, ['졸업자수', '졸업자_수', '졸업자 수', '졸업자합계', '졸업자'])
    if (graduates === 0) continue

    // 각 진학자 수
    const scienceCount  = findCol(row, ['과학고_도내', '과학고도내', '과학고'])
                        + findCol(row, ['과학고_도외', '과학고도외'])
    const foreignCount  = findCol(row, ['외국어고_도내', '외고_도내', '외고국제고_도내', '외국어고·국제고_도내'])
                        + findCol(row, ['외국어고_도외', '외고_도외', '외고국제고_도외', '외국어고·국제고_도외'])
    const privateCount  = findCol(row, ['자율형사립고', '자율형 사립고', '자율형사립', '자사고'])
    const publicAdvCount = findCol(row, ['자율형공립고', '자율형 공립고', '자율형공립'])
    const artCount      = findCol(row, ['예술체육고_도내', '예고체고_도내', '예고·체고_도내'])
                        + findCol(row, ['예술체육고_도외', '예고체고_도외', '예고·체고_도외'])
    const meisterCount  = findCol(row, ['마이스터고_도내', '마이스터_도내'])
                        + findCol(row, ['마이스터고_도외', '마이스터_도외'])

    // 특목고+자율고 전체 진학률 (advancement_rate)
    const totalSpecial = scienceCount + foreignCount + artCount + meisterCount + privateCount + publicAdvCount
    const advancementRate    = totalSpecial    / graduates * 100
    const advancementScience = scienceCount    / graduates * 100
    const advancementForeign = foreignCount    / graduates * 100
    const advancementPrivate = privateCount    / graduates * 100

    const { error } = await supabase
      .from('facility_school')
      .update({
        advancement_rate:    Math.round(advancementRate    * 10) / 10,
        advancement_science: Math.round(advancementScience * 10) / 10,
        advancement_foreign: Math.round(advancementForeign * 10) / 10,
        advancement_private: Math.round(advancementPrivate * 10) / 10,
      })
      .eq('id', school.id)

    if (error) { console.error(`  오류 ${schoolName}:`, error.message); continue }
    updated++
  }

  console.log(`\n완료: ${updated}개 업데이트 / 미매칭 ${notFound}개`)
  if (notFoundNames.length > 0) {
    console.log('미매칭 학교 (DB에 없음):')
    notFoundNames.slice(0, 20).forEach(n => console.log(`  - ${n}`))
    if (notFoundNames.length > 20) console.log(`  ... 외 ${notFoundNames.length - 20}개`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
