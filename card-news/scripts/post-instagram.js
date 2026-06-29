/**
 * post-instagram.js — 생성된 카드뉴스 PNG를 Instagram 캐러셀로 자동 포스팅
 *
 * 실행: node scripts/post-instagram.js --dir=2026-W26/84-seongsan
 *       node scripts/post-instagram.js --week=2026-W26
 *       node scripts/post-instagram.js --week=2026-W26 --series=city-overall,84-seongsan
 *
 * 흐름:
 *   1. output/{weekCode}/{seriesId}/ 에서 PNG 수집
 *   2. Supabase Storage (card-news 버킷) 업로드 → 공개 URL
 *   3. Instagram Graph API 캐러셀 게시 (최대 10장)
 *
 * 제한: Instagram 계정당 25 posts/day
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '../output')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const IG_ACCOUNT_ID = process.env.META_INSTAGRAM_ACCOUNT_ID
const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN
const BUCKET = 'card-news'
const IG_API = 'https://graph.facebook.com/v21.0'

// 시리즈 ID → 한글 설명 (캡션용)
const SERIES_LABELS = {
  'city-overall':    '창원·김해 전체 TOP 10',
  'city-volume':     '창원·김해 거래량 TOP 10',
  'city-value-84':   '창원·김해 84㎡ 가성비 TOP 10',
  '84-seongsan':     '창원 성산구 84㎡ TOP 10',
  '84-uichang':      '창원 의창구 84㎡ TOP 10',
  '84-masanhappo':   '창원 마산합포구 84㎡ TOP 10',
  '84-masanhoewon':  '창원 마산회원구 84㎡ TOP 10',
  '84-jinhae':       '창원 진해구 84㎡ TOP 10',
  '84-gimhae':       '김해시 84㎡ TOP 10',
  '59-seongsan':     '창원 성산구 59㎡ TOP 10',
  '59-uichang':      '창원 의창구 59㎡ TOP 10',
  '59-masanhappo':   '창원 마산합포구 59㎡ TOP 10',
  '59-masanhoewon':  '창원 마산회원구 59㎡ TOP 10',
  '59-jinhae':       '창원 진해구 59㎡ TOP 10',
  '59-gimhae':       '김해시 59㎡ TOP 10',
  '102-seongsan':    '창원 성산구 102㎡ TOP 10',
  '102-uichang':     '창원 의창구 102㎡ TOP 10',
  'district-champions': '창원·김해 구별 챔피언',
}

const HASHTAGS = '#창원부동산 #김해부동산 #창원아파트 #실거래가 #아파트매매 #부동산시세 #단지온도'

// ── Supabase Storage ──────────────────────────────────────

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  // 409 / Duplicate = already exists (정상)
  if (!res.ok && res.status !== 409) {
    const err = await res.json().catch(() => ({}))
    if (err.error !== 'Duplicate') throw new Error(`버킷 생성 실패: ${JSON.stringify(err)}`)
  }
}

async function uploadPng(localPath, storagePath) {
  const buffer = readFileSync(localPath)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`업로드 실패 (${storagePath}): ${JSON.stringify(err)}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
}

// ── Instagram Graph API ───────────────────────────────────

async function createItemContainer(imageUrl) {
  const res = await fetch(`${IG_API}/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: PAGE_TOKEN,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`item container 실패: ${data.error.message}`)
  return data.id
}

async function createCarouselContainer(childIds, caption) {
  const res = await fetch(`${IG_API}/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: PAGE_TOKEN,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`carousel container 실패: ${data.error.message}`)
  return data.id
}

async function publishMedia(containerId) {
  const res = await fetch(`${IG_API}/${IG_ACCOUNT_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: PAGE_TOKEN }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`publish 실패: ${data.error.message}`)
  return data.id
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── 핵심 로직 ─────────────────────────────────────────────

async function postSeries(weekCode, seriesId) {
  const seriesDir = join(OUTPUT_DIR, weekCode, seriesId)
  if (!existsSync(seriesDir)) {
    console.warn(`  [SKIP] 없음: ${weekCode}/${seriesId}`)
    return null
  }

  const pngs = readdirSync(seriesDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .slice(0, 10) // Instagram 캐러셀 최대 10장

  if (pngs.length < 2) {
    console.warn(`  [SKIP] PNG 부족 (${pngs.length}개): ${seriesId}`)
    return null
  }

  console.log(`\n[${seriesId}] ${pngs.length}장 처리 중...`)

  // 1. Supabase 업로드
  const urls = []
  for (const png of pngs) {
    const url = await uploadPng(join(seriesDir, png), `${weekCode}/${seriesId}/${png}`)
    console.log(`  ↑ ${png}`)
    urls.push(url)
  }

  // 2. 각 이미지 컨테이너 생성
  const childIds = []
  for (const url of urls) {
    const id = await createItemContainer(url)
    childIds.push(id)
    await sleep(500)
  }

  // 3. 캡션
  const label = SERIES_LABELS[seriesId] || seriesId
  const weekDisplay = weekCode.replace('-W', '년 ')+ '주차'
  const caption = `📊 ${weekDisplay} ${label}\n\n${HASHTAGS}`

  // 4. 캐러셀 생성 + 게시
  const carouselId = await createCarouselContainer(childIds, caption)
  const postId = await publishMedia(carouselId)
  console.log(`  ✅ 게시 완료 → ${postId}`)
  return postId
}

// ── 메인 ─────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !IG_ACCOUNT_ID || !PAGE_TOKEN) {
    throw new Error(
      '필수 환경변수 누락. .env 파일에 확인:\n' +
      '  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)\n' +
      '  SUPABASE_SERVICE_ROLE_KEY\n' +
      '  META_INSTAGRAM_ACCOUNT_ID\n' +
      '  META_PAGE_ACCESS_TOKEN'
    )
  }

  const args = process.argv.slice(2)
  const dirArg   = args.find(a => a.startsWith('--dir='))
  const weekArg  = args.find(a => a.startsWith('--week='))
  const seriesArg = args.find(a => a.startsWith('--series='))

  await ensureBucket()

  if (dirArg) {
    // 단일 시리즈: --dir=2026-W26/84-seongsan
    const [weekCode, seriesId] = dirArg.split('=')[1].split('/')
    await postSeries(weekCode, seriesId)

  } else if (weekArg) {
    const weekCode = weekArg.split('=')[1]
    const weekDir  = join(OUTPUT_DIR, weekCode)
    if (!existsSync(weekDir)) throw new Error(`주차 폴더 없음: ${weekDir}`)

    let seriesList = readdirSync(weekDir).sort()

    if (seriesArg) {
      const filter = seriesArg.split('=')[1].split(',')
      seriesList = seriesList.filter(s => filter.includes(s))
    }

    console.log(`\n${weekCode} — ${seriesList.length}개 시리즈 게시 시작`)

    let posted = 0
    for (const seriesId of seriesList) {
      const result = await postSeries(weekCode, seriesId)
      if (result) {
        posted++
        // Instagram rate limit 여유 확보 (25 posts/day)
        await sleep(3000)
      }
    }
    console.log(`\n완료: ${posted}개 게시됨`)

  } else {
    console.error('사용법:')
    console.error('  node scripts/post-instagram.js --dir=WEEK/SERIES_ID')
    console.error('  node scripts/post-instagram.js --week=2026-W26')
    console.error('  node scripts/post-instagram.js --week=2026-W26 --series=city-overall,84-seongsan')
    process.exit(1)
  }
}

main().catch(err => { console.error('오류:', err.message); process.exit(1) })
