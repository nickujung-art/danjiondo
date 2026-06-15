/**
 * 학교알리미 「13-다. 졸업생의 진로 현황」 수집
 *
 * 공시항목: 중학교 연1회 11월 공시
 * 방법: 항목별 공시정보 페이지 → 졸업생의 진로 현황 + 경남 + 중학교 검색 → 전체 파싱
 *
 * 사용법:
 *   npx tsx scripts/scrape-school-advancement.ts           # 실제 DB 업데이트
 *   npx tsx scripts/scrape-school-advancement.ts --dry-run # 확인만
 */

import { chromium, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const DRY_RUN = process.argv.includes('--dry-run')

// ─── 로그인 감지 ──────────────────────────────────────────────────────────────
async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .some(a => (a.textContent ?? '').trim() === '로그아웃')
  ).catch(() => false)
}

async function waitForLogin(page: Page): Promise<void> {
  await page.waitForTimeout(2000)
  if (await isLoggedIn(page)) { console.log('이미 로그인 상태'); return }

  console.log('================================================')
  console.log(' 브라우저에서 SNS(네이버/카카오) 로그인 후')
  console.log(' 자동으로 진행됩니다. (최대 3분 대기)')
  console.log('================================================\n')
  process.stdout.write('로그인 대기 중 ')

  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000)
    if (await isLoggedIn(page)) { console.log('\n로그인 확인! ✓'); return }
    if (i % 10 === 9) process.stdout.write('.')
  }
  console.log('\n(3분 경과 — 로그인 없이 진행, 일부 데이터 제한될 수 있음)')
}

// ─── 항목별 공시정보에서 경남 졸업생 진로 현황 수집 ──────────────────────────
interface SchoolGrad {
  schoolName: string
  graduates: number
  science: number
  foreign: number
  privAuto: number
  pubAuto: number
  art: number
  meister: number
}

async function fetchGraduationData(page: Page, year: string): Promise<SchoolGrad[]> {
  console.log(`\n[항목별 공시정보] 공시년도 ${year} 조회 중...`)

  await page.goto('https://www.schoolinfo.go.kr/ei/ss/pneiss_a05_s1.do', {
    waitUntil: 'networkidle', timeout: 20_000,
  })
  await page.waitForTimeout(2000)

  // 공시년도 선택
  const yearSel = page.locator('select').filter({ hasText: /2026|2025|2024/ }).first()
  if (await yearSel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yearSel.selectOption({ label: year })
    await page.waitForTimeout(1500)
    console.log(`  공시년도 ${year} 선택`)
  }

  // 공시항목 선택 — "졸업생의 진로 현황"
  // 체크박스 또는 라디오 중 해당 항목 클릭
  const itemLabel = page.getByText('졸업생의 진로 현황', { exact: true })
  if (!(await itemLabel.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('  "졸업생의 진로 현황" 항목 미발견')
    return []
  }
  await itemLabel.click()
  await page.waitForTimeout(500)
  console.log('  "졸업생의 진로 현황" 선택')

  // 학교급: 중학교
  const middleLabel = page.getByText('중학교', { exact: true })
  if (await middleLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await middleLabel.click()
    await page.waitForTimeout(500)
  }

  // 지역: 경상남도
  const sidoSel = page.locator('select').filter({ has: page.locator('option[value*="경남"], option[value*="48"]') }).first()
  if (await sidoSel.isVisible({ timeout: 3000 }).catch(() => false)) {
    // 경남 코드 찾기
    const options = await sidoSel.locator('option').all()
    for (const opt of options) {
      const text = await opt.textContent()
      if (text?.includes('경남') || text?.includes('경상남도')) {
        const val = await opt.getAttribute('value')
        await sidoSel.selectOption(val ?? '경상남도')
        await page.waitForTimeout(500)
        console.log('  경남 선택')
        break
      }
    }
  } else {
    // 지역 라디오/버튼 방식
    const gyeongnamBtn = page.getByText(/경상남도|경남/, { exact: false }).first()
    if (await gyeongnamBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gyeongnamBtn.click()
      await page.waitForTimeout(500)
    }
  }

  // 검색 버튼 클릭
  const searchBtn = page.getByRole('button', { name: /검색|조회/ }).first()
  if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchBtn.click()
    await page.waitForNetworkIdle({ timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    console.log('  검색 완료')
  }

  // 현재 URL과 페이지 내용 확인
  console.log('  현재 URL:', page.url())
  const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '')
  console.log('  페이지 미리보기:', pageText)

  // 결과 테이블 파싱
  const results: SchoolGrad[] = []
  let pageNum = 1
  while (true) {
    const rows = await page.evaluate((): Array<Record<string, string>> => {
      const tables = document.querySelectorAll('table')
      for (const tbl of tables) {
        const txt = tbl.textContent ?? ''
        if (!txt.includes('졸업') && !txt.includes('학교명')) continue
        const rows = Array.from(tbl.querySelectorAll('tr'))
        const headers: string[] = []
        const result: Array<Record<string, string>> = []
        for (const row of rows) {
          const ths = row.querySelectorAll('th')
          if (ths.length > 0) {
            Array.from(ths).forEach(th => headers.push((th.textContent ?? '').trim()))
            continue
          }
          const tds = Array.from(row.querySelectorAll('td')).map(td => (td.textContent ?? '').trim())
          if (tds.length > 0 && headers.length > 0) {
            const r: Record<string, string> = {}
            headers.forEach((h, i) => { r[h] = tds[i] ?? '' })
            result.push(r)
          }
        }
        if (result.length > 0) return result
      }
      return []
    })

    if (rows.length === 0) break

    for (const row of rows) {
      const schoolName = row['학교명'] ?? row['학교'] ?? ''
      if (!schoolName) continue
      const graduates = num(row, '졸업자수', '졸업자_수', '졸업자')
      if (!graduates) continue

      results.push({
        schoolName,
        graduates,
        science:  num(row, '과학고_도내', '과학고도내', '과학고') + num(row, '과학고_도외', '과학고도외'),
        foreign:  num(row, '외국어고·국제고_도내', '외국어고ㆍ국제고_도내', '외고국제고_도내', '외국어고_도내')
                + num(row, '외국어고·국제고_도외', '외국어고ㆍ국제고_도외', '외고국제고_도외', '외국어고_도외'),
        privAuto: num(row, '자율형사립고', '자율형사립', '자사고'),
        pubAuto:  num(row, '자율형공립고', '자율형공립'),
        art:      num(row, '예술체육고', '예고체고', '예고·체고'),
        meister:  num(row, '마이스터고', '마이스터'),
      })
    }

    // 다음 페이지
    const nextBtn = page.getByRole('link', { name: String(pageNum + 1) })
      .or(page.getByRole('button', { name: '다음' }))
    if (!(await nextBtn.isVisible({ timeout: 2000 }).catch(() => false))) break
    await nextBtn.click()
    await page.waitForTimeout(2000)
    pageNum++
    console.log(`  페이지 ${pageNum} 로드...`)
  }

  console.log(`  수집 완료: ${results.length}개 학교`)
  return results
}

function num(row: Record<string, string>, ...kws: string[]): number {
  const k = Object.keys(row).find(k =>
    kws.some(kw => k.replace(/[\s·ㆍ]/g, '').includes(kw.replace(/[\s·ㆍ]/g, '')))
  )
  return k ? Number((row[k] ?? '').replace(/,/g, '')) || 0 : 0
}

// ─── DB 업데이트 ──────────────────────────────────────────────────────────────
async function saveToDb(data: SchoolGrad[]) {
  const { data: schools, error } = await supabase
    .from('facility_school')
    .select('id, school_name')
    .eq('school_type', 'middle')
  if (error) throw error

  const map = new Map(schools!.map(s => [s.school_name, s.id]))
  let updated = 0, notFound = 0

  for (const d of data) {
    const id = map.get(d.schoolName)
    if (!id) { notFound++; continue }

    const total = d.science + d.foreign + d.privAuto + d.pubAuto + d.art + d.meister
    const payload = {
      advancement_rate:    Math.round(total      / d.graduates * 1000) / 10,
      advancement_science: Math.round(d.science  / d.graduates * 1000) / 10,
      advancement_foreign: Math.round(d.foreign  / d.graduates * 1000) / 10,
      advancement_private: Math.round(d.privAuto / d.graduates * 1000) / 10,
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${d.schoolName}: 졸업${d.graduates} rate=${payload.advancement_rate}% 과학${payload.advancement_science}% 외고${payload.advancement_foreign}% 자사${payload.advancement_private}%`)
      updated++
      continue
    }
    const { error: e } = await supabase.from('facility_school').update(payload).eq('id', id)
    if (e) { console.error(`  오류 ${d.schoolName}:`, e.message); continue }
    updated++
  }

  console.log(`\n결과: ${updated}개 업데이트 / 미매칭 ${notFound}개`)
  if (notFound > 0) {
    const notFoundNames = data.filter(d => !map.has(d.schoolName)).map(d => d.schoolName)
    console.log('미매칭:', notFoundNames.slice(0, 20).join(', '))
  }
}

// ─── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}학교알리미 졸업생 진로 현황 수집 시작\n`)

  const browser = await chromium.launch({ headless: false, slowMo: 50, args: ['--start-maximized'] })
  const context = await browser.newContext({ locale: 'ko-KR' })
  const page = await context.newPage()
  await page.bringToFront()

  await page.goto('https://www.schoolinfo.go.kr/Main.do', { waitUntil: 'networkidle', timeout: 20_000 })
  await waitForLogin(page)

  // 2025년 공시 데이터 (2024 졸업생, 2025년 11월 공시) — 가장 최신
  let data = await fetchGraduationData(page, '2025년')

  if (data.length === 0) {
    console.log('2025년 데이터 없음, 2024년 시도...')
    data = await fetchGraduationData(page, '2024년')
  }

  if (data.length === 0) {
    console.log('\n데이터 수집 실패. 현재 페이지 상태:')
    console.log('URL:', page.url())
    const txt = await page.evaluate(() => document.body?.innerText?.slice(0, 500) ?? '')
    console.log(txt)
    await browser.close()
    return
  }

  await saveToDb(data)
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
