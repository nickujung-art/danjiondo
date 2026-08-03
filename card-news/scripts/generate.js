/**
 * generate.js — 주간 카드뉴스 오케스트레이터
 *
 * 실행: node scripts/generate.js
 * 옵션: --series=84-seongsan,city-overall  (특정 시리즈만)
 *       --dry-run                           (HTML만 생성, PNG 캡처 안 함)
 *       --week-offset=-1                   (n주 전 데이터, 기본 -1 = 지난주)
 *       --out=<dir>                        (출력 디렉터리 대체. 기본 ../output)
 *       --dump-data=<file>                 (시리즈별 data 객체를 JSON 한 파일로 덤프, 렌더 생략)
 *       --data=<file>                      (덤프한 JSON으로 렌더. Supabase 조회 0회)
 *       --persist                          (슬라이드를 public.contents 에 적재. 🔴 opt-in)
 *       --persist-series=city-overall      (🔴 적재 범위만 좁힌다. 생성 범위는 --series 그대로)
 *
 * 🔴 `--persist` 가 opt-in 인 이유: `--dry-run` 은 실험용으로 수십 번 돈다. 적재가 기본값이면
 *    그 실험이 전부 프로덕션 `contents` 에 **발행 상태(published)** 로 쓰인다.
 * 🔴 `--persist` 를 쓸 때는 `--series` 나 `--persist-series` 로 **범위를 반드시 좁힌다.**
 *    없으면 18개 시리즈 전부를 도는데, 실제로 발행된 시리즈는 그중 일부뿐이라
 *    **발행된 적 없는 카드뉴스가 창부레터 아카이브에 발행물로 올라간다**.
 *    발행 시리즈 목록은 `ls -1 output/<weekCode>/` 다.
 *
 * ## `--series` vs `--persist-series` (40-04 B-4)
 * `--series` 는 **무엇을 만드는가**(PNG/HTML), `--persist-series` 는 **무엇을 아카이브에
 * 올리는가**를 정한다. 주간 크론은 PNG 를 18시리즈 전부 만들되 적재는 `city-overall` 만 한다 —
 * 실측상 발행 시리즈 수가 회차마다 1/18/1 로 불균일했기 때문이다.
 * 판정은 `persist-contents.js` 의 `shouldPersistSeries()` 한 곳에 있다.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
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
import { buildContentRow, persistContents, getClient, shouldPersistSeries } from './persist-contents.js'

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

async function generateCardSet(seriesId, data, dryRun, outputDir = OUTPUT_DIR) {
  const { weekCode, region, area } = data
  const dir = join(outputDir, weekCode, seriesId)
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
  const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1]
  const dumpDataArg = args.find((a) => a.startsWith('--dump-data='))?.split('=')[1]
  const dataArg = args.find((a) => a.startsWith('--data='))?.split('=')[1]
  const persist = args.includes('--persist')
  // 🔴 적재 범위는 생성 범위(`--series`)와 별개다. 주간 크론은 18시리즈를 만들지만
  //    아카이브에는 실제 발행분만 올린다 (40-04 B-4). 미지정 시 생성분 전부가 대상이다.
  const persistSeriesArg = args.find((a) => a.startsWith('--persist-series='))
  const persistSeries = persistSeriesArg ? persistSeriesArg.split('=')[1].split(',') : null

  // --out 미지정 시 현행 동작(../output) 그대로.
  const outputDir = outArg ? resolve(process.cwd(), outArg) : OUTPUT_DIR
  // --data 지정 시 Supabase 조회를 전혀 하지 않고 동결 스냅샷으로 렌더한다.
  const loadedData = dataArg ? JSON.parse(readFileSync(resolve(process.cwd(), dataArg), 'utf-8')) : null
  // --dump-data 지정 시 시리즈 정의 순서대로 data 를 모으고 렌더는 건너뛴다.
  const dumpBucket = dumpDataArg ? {} : null

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

  // 🔴 `--persist` 없이는 이 배열이 채워지지 않고 DB 접속도 일어나지 않는다.
  //    `--dump-data` 모드는 렌더조차 하지 않으므로 적재 대상이 아니다.
  const persistRows = persist && !dumpBucket ? [] : null
  // 🔴 적재 범위가 어디에서도 좁혀지지 않은 경우에만 경고한다.
  //    `--persist-series` 로 좁혔다면 그 값을 로그에 남겨 "무엇이 발행물이 됐는지"를 증거로 만든다.
  if (persist && !filter && !persistSeries) {
    console.warn(
      '\n⚠️  --persist 를 --series·--persist-series 없이 실행했다. 시리즈 정의 전체(18개)가 적재 대상이 된다.\n' +
      '   발행된 적 없는 회차가 아카이브에 발행물로 올라갈 수 있다.\n' +
      '   적재 범위만 좁히려면(생성은 전부 유지) --persist-series=city-overall 처럼 준다.\n' +
      `   발행 시리즈 목록: ls -1 output/${weekCode}/\n`,
    )
  } else if (persist && persistSeries) {
    console.log(`적재 범위: --persist-series=${persistSeries.join(',')} (생성 범위와 별개)`)
  }

  // ── 구별 평형 시리즈 ──────────────────────────────────
  for (const s of AREA_GU_SERIES) {
    if (filter && !filter.includes(s.id)) continue
    console.log(`[${s.id}] ${s.region} ${s.area}`)
    try {
      let data
      if (loadedData) {
        if (!(s.id in loadedData)) { console.log(`  [skip] ${s.id}: 스냅샷에 없음`); continue }
        data = loadedData[s.id]
      } else {
        const ranking = await fetchAreaRanking({ sggCode: s.sggCode, areaMin: s.areaMin, areaMax: s.areaMax, ...dateRange })
        data = {
          ...baseWeekData,
          region: s.region,
          area: s.area,
          seriesType: 'area',
          subCaption: AREA_CAPTION[s.area],
          ranking: pad10(ranking),
        }
      }
      if (dumpBucket) { dumpBucket[s.id] = data; continue }
      await generateCardSet(s.id, data, dryRun, outputDir)
      if (persistRows && shouldPersistSeries(s.id, persistSeries)) persistRows.push(buildContentRow(s.id, data, to))
    } catch (err) {
      console.error(`  [ERROR] ${s.id}: ${err.message}`)
    }
  }

  // ── 도시 전체 시리즈 ──────────────────────────────────
  for (const s of CITY_SERIES) {
    if (filter && !filter.includes(s.id)) continue
    console.log(`[${s.id}] ${s.region}`)
    try {
      let data
      if (loadedData) {
        if (!(s.id in loadedData)) { console.log(`  [skip] ${s.id}: 스냅샷에 없음`); continue }
        data = loadedData[s.id]
      } else {
        let ranking = []
        if (s.type === 'city') {
          ranking = await fetchCityRanking({ sggCodes: ALL_SGG, ...dateRange })
        } else if (s.type === 'volume') {
          ranking = await fetchVolumeRanking({ sggCodes: ALL_SGG, ...dateRange })
        } else if (s.type === 'value') {
          ranking = await fetchValueRanking({ sggCodes: ALL_SGG, ...dateRange })
        }

        data = {
          ...baseWeekData,
          region: s.region,
          area: s.area,
          seriesType: s.type,
          subCaption: s.caption,
          ranking: pad10(ranking),
        }
      }

      if (dumpBucket) { dumpBucket[s.id] = data; continue }
      await generateCardSet(s.id, data, dryRun, outputDir)
      if (persistRows && shouldPersistSeries(s.id, persistSeries)) persistRows.push(buildContentRow(s.id, data, to))
    } catch (err) {
      console.error(`  [ERROR] ${s.id}: ${err.message}`)
    }
  }

  // ── 구별 대장단지 시리즈 ──────────────────────────────
  if (!filter || filter.includes('district-champions')) {
    console.log(`[district-champions] 구별 대장단지`)
    try {
      let data
      if (loadedData) {
        if (!('district-champions' in loadedData)) {
          console.log(`  [skip] district-champions: 스냅샷에 없음`)
          data = null
        } else {
          data = loadedData['district-champions']
        }
      } else {
        const champions = await fetchDistrictChampions({ sggMap: SGG_MAP, ...dateRange })
        data = { ...baseWeekData, champions }
      }

      if (data && dumpBucket) {
        dumpBucket['district-champions'] = data
      } else if (data) {
        const dir = join(outputDir, data.weekCode, 'district-champions')
        mkdirSync(dir, { recursive: true })

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

        if (persistRows && shouldPersistSeries('district-champions', persistSeries)) persistRows.push(buildContentRow('district-champions', data, to))
      }
    } catch (err) {
      console.error(`  [ERROR] district-champions: ${err.message}`)
    }
  }

  if (dumpBucket) {
    const dumpPath = resolve(process.cwd(), dumpDataArg)
    mkdirSync(dirname(dumpPath), { recursive: true })
    writeFileSync(dumpPath, JSON.stringify(dumpBucket, null, 2), 'utf-8')
    console.log(`\n덤프 완료 → ${dumpPath} (시리즈 ${Object.keys(dumpBucket).length}개)`)
  }

  if (persistRows) {
    const client = await getClient()
    const { upserted, skipped } = await persistContents(client, persistRows)
    console.log(`\n적재 ${upserted}건 / 건너뜀 ${skipped}건 (슬라이드 0장)`)
  }

  await closeBrowser()
  console.log(`\n완료! → output/${weekCode}/`)
}

main().catch((err) => { console.error(err); process.exit(1) })
