/**
 * generate-from-payload.js — GitHub Actions 전용 payload→PNG 변환
 *
 * 사용법:
 *   node scripts/generate-from-payload.js --payload=payload.json --series=custom
 *
 * payload.json 형식:
 *   { "cover": "<html>...", "highlight": "<html>...", "ranking": "<html>...", "closing": "<html>..." }
 *
 * 출력: card-news/output/{series}/01-cover.png, 02-highlight.png, 03-ranking.png, 04-closing.png
 */
import { readFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { captureCard, closeBrowser } from './capture.js'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, '../output')

// ── argv 파싱 ─────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const eqIdx = a.indexOf('=')
    if (eqIdx === -1) return [a.replace(/^--/, ''), true]
    const key = a.slice(2, eqIdx)
    const val = a.slice(eqIdx + 1)
    return [key, val]
  }),
)

const payloadPath = resolve(args.payload ?? 'payload.json')
const seriesId = args.series ?? `custom-${Date.now()}`

// ── 페이로드 읽기 ─────────────────────────────────────────

let payload
try {
  payload = JSON.parse(readFileSync(payloadPath, 'utf-8'))
} catch (e) {
  console.error(`[generate-from-payload] payload 파일을 읽을 수 없습니다: ${payloadPath}`)
  console.error(e.message)
  process.exit(1)
}

// ── PNG 생성 ──────────────────────────────────────────────

const dir = join(OUTPUT_DIR, seriesId)
mkdirSync(dir, { recursive: true })

const cards = [
  { name: '01-cover',     html: payload.cover },
  { name: '02-highlight', html: payload.highlight },
  { name: '03-ranking',   html: payload.ranking },
  { name: '04-closing',   html: payload.closing },
]

console.log(`\n[generate-from-payload] 시리즈: ${seriesId}`)
console.log(`페이로드: ${payloadPath}`)
console.log(`출력 디렉토리: ${dir}\n`)

for (const card of cards) {
  if (!card.html) {
    console.warn(`  [skip] ${card.name} (HTML 없음)`)
    continue
  }
  await captureCard(card.html, join(dir, `${card.name}.png`))
  console.log(`  v ${card.name}.png`)
}

await closeBrowser()
console.log(`\n완료! -> output/${seriesId}/`)
