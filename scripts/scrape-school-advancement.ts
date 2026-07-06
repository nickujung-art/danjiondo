/**
 * 학교알리미 「13-다. 졸업생의 진로 현황」 수집
 *
 * 방법: 학교별 공시정보 페이지 jQuery .load() 방식 (로그인 불필요)
 *   - pneiss_a03_s0.do 세션 유지 → gongsiInfo06.load(Pneipp_b06_s0p.do)
 *   - JG_YEAR=2025 (2025년 11월 4차 공시, 2024년 졸업생 기준)
 *
 * 실행:
 *   npx tsx scripts/scrape-school-advancement.ts                         # 중학교 전체
 *   npx tsx scripts/scrape-school-advancement.ts --school-type=high      # 고등학교 (대학 진학률)
 *   npx tsx scripts/scrape-school-advancement.ts --dry-run               # DB 저장 없이 확인
 *   npx tsx scripts/scrape-school-advancement.ts --school-type=high --dry-run
 */

import { chromium, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN     = process.argv.includes('--dry-run')
const SCHOOL_TYPE = process.argv.includes('--school-type=high') ? 'high' : 'middle'
const COOKIE_FILE = path.resolve(process.cwd(), '.schoolinfo-cookies.json')

// 경남 전체 (창원 5개 구는 학교알리미 GUGUN_CODE 상 창원시 단일 코드로 조회됨 + Phase 33 신규 16개 지역)
// GUGUN_CODE 패턴 검증: sgg_code(regions 테이블) + '00000' — curl로 각 지역 실호출 확인 완료(2026-07-06)
const TARGETS = [
  { name: '창원시', gugunCode: '4812000000' },
  { name: '김해시', gugunCode: '4825000000' },
  { name: '진주시', gugunCode: '4817000000' },
  { name: '통영시', gugunCode: '4822000000' },
  { name: '사천시', gugunCode: '4824000000' },
  { name: '밀양시', gugunCode: '4827000000' },
  { name: '거제시', gugunCode: '4831000000' },
  { name: '양산시', gugunCode: '4833000000' },
  { name: '의령군', gugunCode: '4872000000' },
  { name: '함안군', gugunCode: '4873000000' },
  { name: '창녕군', gugunCode: '4874000000' },
  { name: '고성군', gugunCode: '4882000000' },
  { name: '남해군', gugunCode: '4884000000' },
  { name: '하동군', gugunCode: '4885000000' },
  { name: '산청군', gugunCode: '4886000000' },
  { name: '함양군', gugunCode: '4887000000' },
  { name: '거창군', gugunCode: '4888000000' },
  { name: '합천군', gugunCode: '4889000000' },
]

// hangmok_json.do?JG_YEAR=2025 에서 확인한 "06" 항목 고정 파라미터 (중/고 공통)
const HANGMOK06_BASE = {
  GS_HANGMOK_CD: '06',
  GS_HANGMOK_NO: '13-다',
  GS_HANGMOK_NM: '졸업생의 진로 현황',
  GS_BURYU_CD:   'JG040',
  JG_BURYU_CD:   'JG130',
  JG_HANGMOK_CD: '52',
  JG_GUBUN:      '1',
  JG_YEAR2:      '2025',
  GS_TYPE:       'Y',
  JG_YEAR:       '2025',
  CHOSEN_JG_YEAR:'2025',
  PRE_JG_YEAR:   '2025',
}

// HG_JONGRYU_GB: 03=중학교, 04=고등학교
const JONGRYU_GB = SCHOOL_TYPE === 'high' ? '04' : '03'

interface School { uuid: string; name: string }

interface MiddleGradData {
  advancement_rate:    number  // 진학자계 비율(%)
  advancement_science: number  // 과학고 비율(%)
  advancement_foreign: number  // 외고·국제고 비율(%)
  advancement_private: number  // 자율형사립고 비율(%)
}

interface HighGradData {
  univ_rate:       number  // 진학자 합계 비율 (전문대+4년제+국외)
  univ_4year_rate: number  // 4년제 대학 비율
  univ_2year_rate: number  // 전문대 비율
}

// ─── 학교 UUID 목록 수집 (공개 API) ─────────────────────────────────────────
async function fetchSchoolList(gugunCode: string): Promise<School[]> {
  const res = await fetch(
    'https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0_school_json.do',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ HG_JONGRYU_GB: JONGRYU_GB, SIDO_CODE: '4800000000', GUGUN_CODE: gugunCode }).toString(),
    }
  )
  if (!res.ok) throw new Error(`학교목록 API 오류: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await res.json()
  return data.map(s => ({ uuid: s.SHL_IDF_CD, name: s.SHL_NM }))
}

// ─── 개별 학교 데이터 수집 (jQuery .load()) ──────────────────────────────────
async function fetchGradData(page: Page, school: School): Promise<string | null> {
  const params = { ...HANGMOK06_BASE, SHL_IDF_CD: school.uuid }

  await page.evaluate((p) => {
    return new Promise<void>((resolve) => {
      const $ = (window as Window & { jQuery: typeof import('jquery') }).jQuery
      if (!$) { resolve(); return }

      let box = document.getElementById('gongsiInfo06')
      if (!box) {
        box = document.createElement('div')
        box.id = 'gongsiInfo06'
        document.body.appendChild(box)
      }
      $(box).load('/ei/pp/Pneipp_b06_s0p.do', $.param(p), () => resolve())
    })
  }, params)

  // 내부 스크립트(goJipyo06 → pneiss_a03_s0p.do)가 실행되도록 대기
  await page.waitForTimeout(4000)

  const text = await page.evaluate(() => {
    const el = document.getElementById('gongsiInfo06')
    return el ? el.innerText : ''
  })

  if (!text || text.includes('서비스 일시 중단')) return null
  return text
}

// ─── 중학교 텍스트 파싱 ───────────────────────────────────────────────────────
// "비  율" 행: [0]='비  율' [1]=일반고 [2]=특성화고 [3]=과학고 [4]=외고국제고
//   [5]=예고체고 [6]=마이스터고 [7]=특목소계 [8]=자율사립 [9]=자율공립
//   [10]=자율소계 [11]=기타 [12]=진학자계 [13]=취업자 [14]=대안교육 [15]=무직자
function parseMiddle(text: string): MiddleGradData | null {
  const lines = text.split('\n')
  const rateLine = lines.find(l => /^비\s+율/.test(l.trim()))
  if (!rateLine) return null

  const parts = rateLine.trim().split(/\t+/)
  const p = (i: number) => parseFloat(parts[i] ?? '0') || 0

  return {
    advancement_rate:    p(12),
    advancement_science: p(3),
    advancement_foreign: p(4),
    advancement_private: p(8),
  }
}

// ─── 고등학교 텍스트 파싱 ────────────────────────────────────────────────────
// "비  율" 행: [0]='비  율' [1]=전문대학 [2]=대학교(4년제) [3]=국외진학
//   [4]=? [5]=? [6]=진학자계 [7]=취업자 [8]=기타
function parseHigh(text: string): HighGradData | null {
  const lines = text.split('\n')
  const rateLine = lines.find(l => /^비\s+율/.test(l.trim()))
  if (!rateLine) return null

  const parts = rateLine.trim().split(/\t+/)
  const p = (i: number) => parseFloat(parts[i] ?? '0') || 0

  return {
    univ_2year_rate: p(1),   // 전문대학
    univ_4year_rate: p(2),   // 대학교(4년제)
    univ_rate:       p(6),   // 진학자 합계
  }
}

// ─── DB 저장: 중학교 ──────────────────────────────────────────────────────────
async function saveMiddle(
  supabase: ReturnType<typeof createClient>,
  school: School,
  data: MiddleGradData,
): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from('facility_school')
    .update({
      advancement_rate:    data.advancement_rate,
      advancement_science: data.advancement_science,
      advancement_foreign: data.advancement_foreign,
      advancement_private: data.advancement_private,
      data_year: 2025,
    })
    .eq('school_name', school.name)
    .eq('school_type', 'middle')
    .select('id')

  if (error) { console.error(`    [DB오류] ${school.name}:`, error.message); return false }
  if (!rows || rows.length === 0) { console.warn(`    [미매칭] ${school.name}`); return false }
  return true
}

// ─── DB 저장: 고등학교 ────────────────────────────────────────────────────────
async function saveHigh(
  supabase: ReturnType<typeof createClient>,
  school: School,
  data: HighGradData,
): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from('facility_school')
    .update({
      univ_rate:       data.univ_rate,
      univ_4year_rate: data.univ_4year_rate,
      univ_2year_rate: data.univ_2year_rate,
      data_year: 2025,
    })
    .eq('school_name', school.name)
    .eq('school_type', 'high')
    .select('id')

  if (error) { console.error(`    [DB오류] ${school.name}:`, error.message); return false }
  if (!rows || rows.length === 0) { console.warn(`    [미매칭] ${school.name}`); return false }
  return true
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  const typeLabel = SCHOOL_TYPE === 'high' ? '고등학교 (대학 진학률)' : '중학교 (고교 진학률)'
  console.log(`\n[졸업생 진로 수집] ${typeLabel} ${DRY_RUN ? '- DRY-RUN' : ''}\n`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. 학교 목록 수집
  const allSchools: (School & { area: string })[] = []
  for (const { name, gugunCode } of TARGETS) {
    const schools = await fetchSchoolList(gugunCode)
    allSchools.push(...schools.map(s => ({ ...s, area: name })))
    console.log(`  ${name}: ${schools.length}개 ${SCHOOL_TYPE === 'high' ? '고등학교' : '중학교'}`)
  }
  console.log(`\n총 ${allSchools.length}개 학교 수집 대상\n`)

  // 2. Playwright 시작
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  })
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'))
    await context.addCookies(cookies)
  }
  const page = await context.newPage()

  // 학교별 공시정보 페이지 로드 (세션 활성화 + jQuery 로드)
  await page.goto('https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do', {
    waitUntil: 'networkidle', timeout: 30000,
  })
  await page.waitForTimeout(2000)

  // 3. 각 학교 데이터 수집
  let success = 0, failed = 0, notMatched = 0

  for (const school of allSchools) {
    process.stdout.write(`  [${school.area}] ${school.name} ... `)

    const text = await fetchGradData(page, school)
    if (!text) {
      console.log('수집 실패')
      failed++
      continue
    }

    if (SCHOOL_TYPE === 'high') {
      const data = parseHigh(text)
      if (!data) {
        console.log('파싱 실패')
        failed++
        continue
      }

      if (DRY_RUN) {
        console.log(`total=${data.univ_rate}% 4yr=${data.univ_4year_rate}% 2yr=${data.univ_2year_rate}%`)
        success++
        continue
      }

      const saved = await saveHigh(supabase, school, data)
      if (saved) {
        console.log(`OK (total=${data.univ_rate}% 4yr=${data.univ_4year_rate}%)`)
        success++
      } else {
        notMatched++
      }
    } else {
      const data = parseMiddle(text)
      if (!data) {
        console.log('파싱 실패')
        failed++
        continue
      }

      if (DRY_RUN) {
        console.log(`rate=${data.advancement_rate}% sci=${data.advancement_science}% for=${data.advancement_foreign}% pri=${data.advancement_private}%`)
        success++
        continue
      }

      const saved = await saveMiddle(supabase, school, data)
      if (saved) {
        console.log(`OK (rate=${data.advancement_rate}%)`)
        success++
      } else {
        notMatched++
      }
    }

    await page.waitForTimeout(500)
  }

  await browser.close()

  console.log(`\n=== 완료 ===`)
  console.log(`  성공: ${success}개`)
  console.log(`  수집 실패: ${failed}개`)
  console.log(`  DB 미매칭: ${notMatched}개`)
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1) })
