/**
 * 학교알리미 「13-다. 졸업생의 진로 현황」 Playwright 스크래퍼
 *
 * 사용법:
 *   npx tsx scripts/scrape-school-advancement.ts              # 전체 실행
 *   npx tsx scripts/scrape-school-advancement.ts --dry-run    # DB 업데이트 없이 테스트
 *   npx tsx scripts/scrape-school-advancement.ts --school 김해대곡  # 특정 학교만
 *
 * 실행 순서:
 *   1. 브라우저가 열리고 schoolinfo.go.kr로 이동
 *   2. Naver/Kakao SNS 로그인 (수동 — 한 번만)
 *   3. 로그인 완료 후 터미널에서 Enter
 *   4. 스크립트가 중학교를 자동 순회 (~15분)
 */

import { chromium, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as readline from 'readline/promises'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DRY_RUN    = process.argv.includes('--dry-run')
const ONLY_IDX   = process.argv.indexOf('--school')
const ONLY_NAME  = ONLY_IDX !== -1 ? process.argv[ONLY_IDX + 1] : null

// ─── DB 중학교 목록 ────────────────────────────────────────────────────────────
async function loadSchools() {
  const { data, error } = await supabase
    .from('facility_school')
    .select('id, school_code, school_name')
    .eq('school_type', 'middle')
    .not('school_code', 'is', null)
    .order('school_name')
  if (error) throw error

  // school_code 기준 deduplicate
  const seen = new Set<string>()
  return (data ?? []).filter(s => {
    if (seen.has(s.school_code!)) return false
    seen.add(s.school_code!)
    return true
  })
}

// ─── 데이터 파싱 ──────────────────────────────────────────────────────────────
interface AdvData {
  graduates:    number
  science:      number  // 과학고
  foreign:      number  // 외고·국제고
  arts:         number  // 예고·체고
  meister:      number  // 마이스터고
  priv_auto:    number  // 자율형사립고(자사고)
  pub_auto:     number  // 자율형공립고
}

function numFrom(raw: Record<string, string>, ...keywords: string[]): number {
  const key = Object.keys(raw).find(k => keywords.some(kw => k.includes(kw)))
  return key ? Number((raw[key] ?? '').replace(/,/g, '')) || 0 : 0
}

function parseTable(data: Record<string, string>): AdvData | null {
  const graduates = numFrom(data, '졸업자')
  if (!graduates) return null
  return {
    graduates,
    science:   numFrom(data, '과학고'),
    foreign:   numFrom(data, '외국어고', '외고', '국제고'),
    arts:      numFrom(data, '예술', '예고', '체고'),
    meister:   numFrom(data, '마이스터'),
    priv_auto: numFrom(data, '자율형사립', '자사고'),
    pub_auto:  numFrom(data, '자율형공립'),
  }
}

// ─── Playwright 데이터 추출 ────────────────────────────────────────────────────
async function scrapeFromPage(page: Page): Promise<AdvData | null> {
  await page.waitForTimeout(2000)  // 동적 로드 대기

  // 메인 프레임 + 모든 iframe에서 시도
  const allFrames = [page.mainFrame(), ...page.frames()]
  for (const frame of allFrames) {
    try {
      const data: Record<string, string> | null = await frame.evaluate(() => {
        const tables = document.querySelectorAll('table')
        for (const table of tables) {
          const txt = table.textContent ?? ''
          if (!txt.includes('졸업자') && !txt.includes('과학고')) continue

          // 헤더 행과 데이터 행 찾기
          const rows = Array.from(table.querySelectorAll('tr'))
          const result: Record<string, string> = {}

          // 헤더 수집 (th 포함 행들)
          const headers: string[] = []
          const headerRows: Element[] = []
          for (const row of rows) {
            const ths = row.querySelectorAll('th')
            if (ths.length > 0) {
              Array.from(ths).forEach(th => headers.push((th.textContent ?? '').trim()))
              headerRows.push(row)
            }
          }

          // 숫자 데이터 행 찾기 (첫번째 숫자 행)
          for (const row of rows) {
            if (headerRows.includes(row)) continue
            const tds = row.querySelectorAll('td')
            const vals = Array.from(tds).map(td => (td.textContent ?? '').trim())
            if (vals.some(v => /^\d[\d,]*$/.test(v))) {
              headers.forEach((h, i) => { if (i < vals.length) result[h] = vals[i] ?? '' })
              if (Object.keys(result).length > 2) return result
            }
          }
        }
        return null
      })
      if (data && Object.keys(data).length > 0) {
        const parsed = parseTable(data)
        if (parsed) return parsed
      }
    } catch {
      // 해당 frame 건너뜀
    }
  }
  return null
}

// ─── DB 업데이트 ──────────────────────────────────────────────────────────────
async function saveToDb(schoolCode: string, d: AdvData) {
  const r = (n: number) => Math.round(n / d.graduates * 1000) / 10
  const payload = {
    advancement_rate:    r(d.science + d.foreign + d.arts + d.meister + d.priv_auto + d.pub_auto),
    advancement_science: r(d.science),
    advancement_foreign: r(d.foreign),
    advancement_private: r(d.priv_auto),
  }
  if (DRY_RUN) { console.log('  [DRY-RUN]', payload); return }
  const { error } = await supabase
    .from('facility_school')
    .update(payload)
    .eq('school_code', schoolCode)
  if (error) throw error
}

// ─── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  const allSchools = await loadSchools()
  const schools = ONLY_NAME
    ? allSchools.filter(s => s.school_name.includes(ONLY_NAME))
    : allSchools
  console.log(`\n대상: ${schools.length}개 중학교 ${DRY_RUN ? '[DRY-RUN]' : ''}`)

  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const context = await browser.newContext({ locale: 'ko-KR' })
  const page    = await context.newPage()

  // 1. 학교알리미 홈 → 수동 로그인
  await page.goto('https://www.schoolinfo.go.kr')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log('\n================================================')
  console.log(' 브라우저에서 Naver/Kakao SNS 로그인 완료 후')
  console.log(' 여기서 Enter를 눌러 자동 수집을 시작하세요.')
  console.log('================================================\n')
  await rl.question('')
  rl.close()

  // 2. 연도 결정 (현재 공시 연도 자동 탐지)
  const pbanYr = new Date().getMonth() >= 10 ? new Date().getFullYear() : new Date().getFullYear() - 1
  console.log(`공시연도: ${pbanYr}\n`)

  let ok = 0, noData = 0, failed = 0
  const failures: string[] = []

  for (let i = 0; i < schools.length; i++) {
    const s = schools[i]!
    process.stdout.write(`[${i + 1}/${schools.length}] ${s.school_name} ... `)

    try {
      // 졸업생 진로현황 직접 접근 (Pneipp_b06)
      await page.goto(
        `https://www.schoolinfo.go.kr/ei/pp/Pneipp_b06_s0p.do?schulCode=${s.school_code}&pbanYr=${pbanYr}`,
        { waitUntil: 'domcontentloaded', timeout: 20_000 }
      )

      const adv = await scrapeFromPage(page)
      if (!adv) {
        // 데이터가 없으면 메인 페이지 경유해서 재시도
        await page.goto(
          `https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l0.do?schulCode=${s.school_code}`,
          { waitUntil: 'domcontentloaded', timeout: 20_000 }
        )
        await page.waitForTimeout(1000)

        // 진로현황 탭 클릭 시도
        const tab = page.getByText('졸업생의 진로 현황', { exact: false })
        if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await tab.click()
          await page.waitForTimeout(2000)
        }

        const adv2 = await scrapeFromPage(page)
        if (!adv2) {
          console.log('데이터 없음')
          noData++
          continue
        }
        await saveToDb(s.school_code!, adv2)
        console.log(`완료 (졸업:${adv2.graduates} 과학:${adv2.science} 외고:${adv2.foreign} 자사:${adv2.priv_auto})`)
      } else {
        await saveToDb(s.school_code!, adv)
        console.log(`완료 (졸업:${adv.graduates} 과학:${adv.science} 외고:${adv.foreign} 자사:${adv.priv_auto})`)
      }
      ok++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`오류: ${msg.slice(0, 80)}`)
      failed++
      failures.push(s.school_name)
    }

    await page.waitForTimeout(300)  // 과부하 방지
  }

  await browser.close()
  console.log(`\n═══ 완료: 성공 ${ok} / 데이터없음 ${noData} / 실패 ${failed} ═══`)
  if (failures.length) {
    console.log('실패:', failures.join(', '))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
