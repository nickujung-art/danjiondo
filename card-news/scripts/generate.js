/**
 * generate.js — 주간 카드뉴스 오케스트레이터
 *
 * 실행: node scripts/generate.js
 * 옵션: --series=84-seongsan,city-overall  (특정 시리즈만)
 *       --dry-run                           (HTML만 생성, PNG 캡처 안 함)
 *       --week-offset=-1                   (n주 전 데이터, 기본 -1 = 지난주)
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

import {
  fetchAreaRanking,
  fetchCityRanking,
  fetchVolumeRanking,
  fetchValueRanking,
  fetchDistrictChampions,
  getLastWeekRange,
  getWeekLabel,
  getWeekCode,
  getPeriodLabel,
} from './fetch-data.js'
import { renderCover, renderHighlight, renderRanking, renderClosing, renderDistrictChampionsCard } from './templates.js'
import { captureCard, closeBrowser } from './capture.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '../output')

// ── SGG 코드 맵 ───────────────────────────────────────────
const ALL_SGG = ['48121', '48123', '48125', '48127', '48129', '48250']
const SGG_MAP = {
  '48121': '의창구',
  '48123': '성산구',
  '48125': '마산합포구',
  '48127': '마산회원구',
  '48129': '진해구',
  '48250': '김해시',
}

// ── 시리즈 정의 ───────────────────────────────────────────

const SOURCE = '국토교통부 실거래가 공개시스템'

const AREA_CAPTION = {
  '59㎡':  '이번 주 가장 비싸게 거래된\n소형 아파트는 어디일까요?',
  '84㎡':  '이번 주 가장 비싸게 거래된\n국민평형 아파트는 어디일까요?',
  '102㎡': '이번 주 가장 비싸게 거래된\n준대형 아파트는 어디일까요?',
}

/** 평형별 구별 시리즈 — 핵심 콘텐츠 */
const AREA_GU_SERIES = [
  // 84㎡ (국민평형) — 6개 구
  { id: '84-seongsan',     region: '창원 성산구',     area: '84㎡', areaMin: 80, areaMax: 95,  sggCode: '48123' },
  { id: '84-uichang',      region: '창원 의창구',     area: '84㎡', areaMin: 80, areaMax: 95,  sggCode: '48121' },
  { id: '84-masanhappo',   region: '창원 마산합포구', area: '84㎡', areaMin: 80, areaMax: 95,  sggCode: '48125' },
  { id: '84-masanhoewon',  region: '창원 마산회원구', area: '84㎡', areaMin: 80, areaMax: 95,  sggCode: '48127' },
  { id: '84-jinhae',       region: '창원 진해구',     area: '84㎡', areaMin: 80, areaMax: 95,  sggCode: '48129' },
  { id: '84-gimhae',       region: '김해시',           area: '84㎡', areaMin: 80, areaMax: 95,  sggCode: '48250' },
  // 59㎡ (소형)
  { id: '59-seongsan',     region: '창원 성산구',     area: '59㎡', areaMin: 55, areaMax: 65,  sggCode: '48123' },
  { id: '59-uichang',      region: '창원 의창구',     area: '59㎡', areaMin: 55, areaMax: 65,  sggCode: '48121' },
  { id: '59-masanhappo',   region: '창원 마산합포구', area: '59㎡', areaMin: 55, areaMax: 65,  sggCode: '48125' },
  { id: '59-masanhoewon',  region: '창원 마산회원구', area: '59㎡', areaMin: 55, areaMax: 65,  sggCode: '48127' },
  { id: '59-jinhae',       region: '창원 진해구',     area: '59㎡', areaMin: 55, areaMax: 65,  sggCode: '48129' },
  { id: '59-gimhae',       region: '김해시',           area: '59㎡', areaMin: 55, areaMax: 65,  sggCode: '48250' },
  // 102㎡ (준대형)
  { id: '102-seongsan',    region: '창원 성산구',     area: '102㎡', areaMin: 98, areaMax: 110, sggCode: '48123' },
  { id: '102-uichang',     region: '창원 의창구',     area: '102㎡', areaMin: 98, areaMax: 110, sggCode: '48121' },
]

/** 도시 전체 시리즈 */
const CITY_SERIES = [
  { id: 'city-overall',   region: '창원+김해',  area: null, type: 'city',   caption: '이번 주 창원·김해에서\n가장 비싸게 거래된 아파트는?' },
  { id: 'city-volume',    region: '창원+김해',  area: null, type: 'volume',  caption: '이번 주 거래가 가장\n활발한 단지는 어디일까요?' },
  { id: 'city-value-84',  region: '창원+김해',  area: '84㎡', type: 'value', caption: '이번 주 84㎡ 기준\n가장 저렴한 평당가 단지는?' },
]

// ── 생성 헬퍼 ─────────────────────────────────────────────

function pad10(ranking) {
  return Array.from({ length: 10 }, (_, i) => ranking[i] ?? { rank: i + 1, name: null, price: null, subtitle: null })
}

async function generateCardSet(seriesId, data, dryRun) {
  const { weekCode, region, area } = data
  const dir = join(OUTPUT_DIR, weekCode, seriesId)
  mkdirSync(dir, { recursive: true })

  const cards = [
    { name: '01-cover',     html: renderCover(data) },
    { name: '02-highlight', html: renderHighlight(data) },
    { name: '03-ranking',   html: renderRanking(data) },
    { name: '04-closing',   html: renderClosing(data) },
  ]

  for (const card of cards) {
    const pngPath = join(dir, `${card.name}.png`)
    const htmlPath = join(dir, `${card.name}.html`)

    if (dryRun) {
      writeFileSync(htmlPath, card.html, 'utf-8')
      console.log(`  [dry] wrote ${card.name}.html`)
    } else {
      await captureCard(card.html, pngPath)
      console.log(`  ✓ ${card.name}.png`)
    }
  }
}

// ── 메인 ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filterArg = args.find((a) => a.startsWith('--series='))
  const filter = filterArg ? filterArg.split('=')[1].split(',') : null
  const fromArg = args.find((a) => a.startsWith('--from='))?.split('=')[1]
  const toArg   = args.find((a) => a.startsWith('--to='))?.split('=')[1]
  const monthArg = args.find((a) => a.startsWith('--month='))?.split('=')[1] // e.g. 2026-05

  let from, to
  if (monthArg) {
    const [y, m] = monthArg.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    from = `${monthArg}-01`
    to   = `${monthArg}-${String(lastDay).padStart(2, '0')}`
  } else if (fromArg) {
    from = fromArg; to = toArg
  } else {
    ;({ from, to } = getLastWeekRange())
  }

  const weekCode = monthArg ? monthArg : getWeekCode(from)
  const weekLabel = monthArg
    ? `${monthArg.split('-')[0]}년 ${Number(monthArg.split('-')[1])}월 전체`
    : getWeekLabel(from)
  const period = getPeriodLabel(from, to)

  console.log(`\n창원부동산랩 카드뉴스 생성`)
  console.log(`기간: ${weekLabel} (${weekCode})`)
  console.log(`날짜: ${period}`)
  console.log(dryRun ? '모드: 드라이런 (HTML만)' : '모드: PNG 생성\n')

  const dateRange = { from, to }
  const baseWeekData = { week: weekLabel, weekCode, period, source: SOURCE }

  // ── 구별 평형 시리즈 ──────────────────────────────────
  for (const s of AREA_GU_SERIES) {
    if (filter && !filter.includes(s.id)) continue
    console.log(`[${s.id}] ${s.region} ${s.area}`)
    try {
      const ranking = await fetchAreaRanking({ sggCode: s.sggCode, areaMin: s.areaMin, areaMax: s.areaMax, ...dateRange })
      const data = {
        ...baseWeekData,
        region: s.region,
        area: s.area,
        seriesType: 'area',
        subCaption: AREA_CAPTION[s.area],
        ranking: pad10(ranking),
      }
      await generateCardSet(s.id, data, dryRun)
    } catch (err) {
      console.error(`  [ERROR] ${s.id}: ${err.message}`)
    }
  }

  // ── 도시 전체 시리즈 ──────────────────────────────────
  for (const s of CITY_SERIES) {
    if (filter && !filter.includes(s.id)) continue
    console.log(`[${s.id}] ${s.region}`)
    try {
      let ranking = []
      if (s.type === 'city') {
        ranking = await fetchCityRanking({ sggCodes: ALL_SGG, ...dateRange })
      } else if (s.type === 'volume') {
        ranking = await fetchVolumeRanking({ sggCodes: ALL_SGG, ...dateRange })
      } else if (s.type === 'value') {
        ranking = await fetchValueRanking({ sggCodes: ALL_SGG, ...dateRange })
      }

      const data = {
        ...baseWeekData,
        region: s.region,
        area: s.area,
        seriesType: s.type,
        subCaption: s.caption,
        ranking: pad10(ranking),
      }

      await generateCardSet(s.id, data, dryRun)
    } catch (err) {
      console.error(`  [ERROR] ${s.id}: ${err.message}`)
    }
  }

  // ── 구별 대장단지 시리즈 ──────────────────────────────
  if (!filter || filter.includes('district-champions')) {
    console.log(`[district-champions] 구별 대장단지`)
    try {
      const champions = await fetchDistrictChampions({ sggMap: SGG_MAP })
      const dir = join(OUTPUT_DIR, weekCode, 'district-champions')
      mkdirSync(dir, { recursive: true })

      const data = { ...baseWeekData, champions }
      const cards = [
        { name: '01-grid',    html: renderDistrictChampionsCard(data) },
        { name: '02-closing', html: renderClosing(data) },
      ]

      for (const card of cards) {
        const pngPath = join(dir, `${card.name}.png`)
        const htmlPath = join(dir, `${card.name}.html`)
        if (dryRun) {
          writeFileSync(htmlPath, card.html, 'utf-8')
          console.log(`  [dry] wrote ${card.name}.html`)
        } else {
          await captureCard(card.html, pngPath)
          console.log(`  ✓ ${card.name}.png`)
        }
      }
    } catch (err) {
      console.error(`  [ERROR] district-champions: ${err.message}`)
    }
  }

  await closeBrowser()
  console.log(`\n완료! → output/${weekCode}/`)
}

main().catch((err) => { console.error(err); process.exit(1) })
