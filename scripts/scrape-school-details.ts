/**
 * Wave 2: 학교 공시 항목에서 특수학급 수 수집
 *
 * 학교알리미 항목01(학교현황)에서 특수학급 수를 파싱합니다.
 * 항목08(교원)/30(급식)/73(방과후)는 2025년 공시 미입력 학교가 대다수 → 스킵
 *
 * 실행:
 *   npx tsx scripts/scrape-school-details.ts              # 전체 실행
 *   npx tsx scripts/scrape-school-details.ts --dry-run    # DB 저장 없이 확인
 */

import { chromium, type Browser, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')

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

const SCHOOL_TYPES = [
  { gb: '02', label: '초등학교', dbType: 'elementary' },
  { gb: '03', label: '중학교',   dbType: 'middle'     },
  { gb: '04', label: '고등학교', dbType: 'high'       },
]

interface SchoolEntry {
  name:    string
  uuid:    string
  dbType:  string
}

async function fetchSchoolList(gugunCode: string, gb: string): Promise<SchoolEntry[]> {
  const dbType = SCHOOL_TYPES.find(t => t.gb === gb)!.dbType
  const res = await fetch(
    'https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0_school_json.do',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        HG_JONGRYU_GB: gb,
        SIDO_CODE:     '4800000000',
        GUGUN_CODE:    gugunCode,
      }).toString(),
    }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await res.json()
  return data
    .filter(s => s.SHL_IDF_CD && s.SHL_NM)
    .map(s => ({ name: s.SHL_NM, uuid: s.SHL_IDF_CD, dbType }))
}

async function loadItem01(page: Page, uuid: string): Promise<string[]> {
  const p = {
    GS_HANGMOK_CD: '01', GS_HANGMOK_NO: '01', GS_HANGMOK_NM: '학교 현황',
    GS_BURYU_CD: 'JG010', JG_BURYU_CD: 'JG010', JG_HANGMOK_CD: '10',
    JG_GUBUN: '1', JG_YEAR2: '2025', GS_TYPE: 'Y',
    JG_YEAR: '2025', CHOSEN_JG_YEAR: '2025', PRE_JG_YEAR: '2025',
    SHL_IDF_CD: uuid,
  }
  await page.evaluate((opts) => new Promise<void>(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $ = (window as any).jQuery
    let b = document.getElementById('tb2')
    if (!b) { b = document.createElement('div'); b.id = 'tb2'; document.body.appendChild(b) }
    $(b).load(opts.url, $.param(opts.p), () => r())
  }), { p, url: '/ei/pp/Pneipp_b01_s0p.do' })
  await page.waitForTimeout(2500)
  const text = await page.evaluate(() => document.getElementById('tb2')?.innerText ?? '')
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}

function parseSpecialClassCount(lines: string[]): number | null {
  const line = lines.find(l => /^특수학급 : \d/.test(l))
  if (!line) return null
  const m = line.match(/특수학급 : (\d+)/)
  return m ? parseInt(m[1]) : null
}

async function main() {
  console.log(`\n[학교 공시항목 수집] ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let browser: Browser | null = null
  let page: Page | null = null
  let total = 0, updated = 0, noData = 0, failed = 0

  try {
    browser = await chromium.launch({ headless: true })
    page    = await browser.newPage()

    await page.goto('https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do', {
      waitUntil: 'networkidle',
      timeout:   30_000,
    })
    await page.waitForTimeout(2000)

    for (const { name: areaName, gugunCode } of TARGETS) {
      for (const { gb, label, dbType } of SCHOOL_TYPES) {
        const schools = await fetchSchoolList(gugunCode, gb)
        console.log(`\n  ${areaName} ${label}: ${schools.length}개`)
        total += schools.length

        for (const school of schools) {
          try {
            const lines             = await loadItem01(page!, school.uuid)
            const specialClassCount = parseSpecialClassCount(lines)

            if (specialClassCount === null) {
              noData++
              continue
            }

            if (DRY_RUN) {
              console.log(`    ${school.name}: 특수학급 ${specialClassCount}개`)
              updated++
              continue
            }

            const { error } = await supabase
              .from('facility_school')
              .update({ special_class_count: specialClassCount })
              .eq('school_name', school.name)
              .eq('school_type', dbType)

            if (error) {
              console.error(`    [DB오류] ${school.name}:`, error.message)
              failed++
            } else {
              updated++
              if (updated % 20 === 0) process.stdout.write(`    진행: ${updated}개 업데이트\n`)
            }
          } catch (e) {
            console.error(`    [오류] ${school.name}:`, (e as Error).message)
            failed++
          }
        }
      }
    }
  } finally {
    await browser?.close()
  }

  console.log(`\n=== 완료 ===`)
  console.log(`  수집 대상:  ${total}개`)
  console.log(`  업데이트:   ${updated}개`)
  console.log(`  데이터 없음: ${noData}개`)
  console.log(`  오류:       ${failed}개`)
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1) })
