/**
 * templates-golden.test.mjs — 골든 HTML 회귀 테스트 (Phase 40-01)
 *
 * 커밋된 `fixtures/snapshot-golden.json` 을 읽어 `templates.js` 의 렌더 함수를 직접 호출하고,
 * 커밋된 `fixtures/golden/**` 와 **문자열 완전 일치**를 단언한다. DB 접속이 없다.
 *
 * 실행: node card-news/scripts/templates-golden.test.mjs
 *
 * 🔴 이 골든의 출처
 * 이 골든은 **2026-08-03 시점 HEAD 로 새로 생성한 것**이다.
 * `card-news/output/` 에 남아 있는 아카이브 HTML 16개는 2026-06-24·06-29 산출물이고
 * 그 뒤 `templates.js` 디자인이 의도적으로 바뀌었다 (`padding:80px→100px`,
 * `.h2 76px→88px`, `.btn padding:16px 36px→20px 44px` 등). 데이터 비의존 정적 함수인
 * `renderClosing` 조차 아카이브 4/4 와 불일치한다 — 실측 확인됨.
 * 따라서 아카이브는 **회귀 판정 기준이 될 수 없다.** 참고 자료로만 보존한다.
 *
 * 🔴 이 파일은 루트 `npm run test`(vitest, include: `src/ **`)에 **잡히지 않는다.**
 * `card-news/` 는 독립 npm 패키지다. 수동 실행이 유일한 경로다.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  renderCover,
  renderHighlight,
  renderRanking,
  renderClosing,
  renderDistrictChampionsCard,
} from './templates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(__dirname, '../fixtures')
const GOLDEN_DIR = join(FIXTURES, 'golden')

const snapshot = JSON.parse(readFileSync(join(FIXTURES, 'snapshot-golden.json'), 'utf-8'))

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  v ${name}`)
    passed++
  } catch (e) {
    console.error(`  x ${name}: ${e.message}`)
    failed++
  }
}

/** 첫 불일치 행 번호 + NEW/OLD 양쪽 220자를 담은 실패 메시지 */
function diffReport(label, actual, expected) {
  const a = actual.split('\n')
  const b = expected.split('\n')
  const n = Math.max(a.length, b.length)
  let line = -1
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) { line = i + 1; break }
  }
  const clip = (s) => (s === undefined ? '(행 없음)' : s.slice(0, 220))
  return [
    `${label} 골든 불일치`,
    `  첫 불일치 행: ${line} (NEW ${a.length}행 / OLD ${b.length}행)`,
    `  NEW: ${clip(a[line - 1])}`,
    `  OLD: ${clip(b[line - 1])}`,
  ].join('\n')
}

function assertGolden(seriesId, cardName, actual) {
  const rel = join(GOLDEN_DIR, snapshot[seriesId].weekCode, seriesId, `${cardName}.html`)
  const expected = readFileSync(rel, 'utf-8')
  if (actual !== expected) {
    throw new Error(diffReport(`${seriesId}/${cardName}`, actual, expected))
  }
}

// 카드 → 렌더 함수 대응은 generate.js 의 generateCardSet / champions 블록과 동일하다.
const CARD_SET = [
  ['01-cover', renderCover],
  ['02-highlight', renderHighlight],
  ['03-ranking', renderRanking],
  ['04-closing', renderClosing],
]

const CHAMPION_SET = [
  ['01-grid', renderDistrictChampionsCard],
  ['02-closing', renderClosing],
]

// ── 12건: generateCardSet 시리즈 3개 × 카드 4장 ────────────
for (const seriesId of ['84-seongsan', 'city-volume', 'city-value-84']) {
  for (const [cardName, render] of CARD_SET) {
    test(`golden ${seriesId}/${cardName}`, () => {
      assertGolden(seriesId, cardName, render(snapshot[seriesId]))
    })
  }
}

// ── 2건: district-champions ────────────────────────────────
for (const [cardName, render] of CHAMPION_SET) {
  test(`golden district-champions/${cardName}`, () => {
    assertGolden('district-champions', cardName, render(snapshot['district-champions']))
  })
}

console.log(`\n${passed} passed / ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
