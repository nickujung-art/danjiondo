/**
 * setup.js — Pretendard 폰트 다운로드 (최초 1회 실행)
 * npm run setup
 */
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '../fonts')

const FONTS = [
  { weight: '900', name: 'Pretendard-Black' },
  { weight: '800', name: 'Pretendard-ExtraBold' },
  { weight: '700', name: 'Pretendard-Bold' },
  { weight: '600', name: 'Pretendard-SemiBold' },
  { weight: '500', name: 'Pretendard-Medium' },
]

const BASE_URL = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2'

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (existsSync(dest)) { console.log(`  skip (exists): ${dest}`); resolve(); return }
    const file = createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.destroy()
        download(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

mkdirSync(FONTS_DIR, { recursive: true })

for (const { name } of FONTS) {
  const url = `${BASE_URL}/${name}.woff2`
  const dest = join(FONTS_DIR, `${name}.woff2`)
  process.stdout.write(`  downloading ${name}.woff2 ...`)
  await download(url, dest)
  console.log(' done')
}

console.log('\nFonts ready. Run: node scripts/generate.js')
