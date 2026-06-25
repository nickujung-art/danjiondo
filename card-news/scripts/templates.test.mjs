/**
 * templates.test.mjs — Unit tests for templates.js D-08 disclaimer and preview functions
 * TDD RED: Tests will fail until templates.js is updated
 *
 * Run: node card-news/scripts/templates.test.mjs
 */
import assert from 'node:assert/strict'

const mod = await import('./templates.js')

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

// ── D-08 Legal Attribution ────────────────────────────────

test('renderClosing is exported', () => {
  assert.equal(typeof mod.renderClosing, 'function')
})

test('renderClosing() includes "출처: 국토교통부 실거래가 공개시스템"', () => {
  const h = mod.renderClosing({})
  assert.ok(h.includes('출처: 국토교통부 실거래가 공개시스템'), 'D-08: source attribution missing')
})

test('renderClosing() includes "신고 기준이며 실제 거래와 차이가 있을 수 있습니다"', () => {
  const h = mod.renderClosing({})
  assert.ok(h.includes('신고 기준이며 실제 거래와 차이가 있을 수 있습니다'), 'D-08: disclaimer missing')
})

// ── BASE_CSS_PREVIEW ──────────────────────────────────────

test('BASE_CSS_PREVIEW is exported as a string', () => {
  assert.equal(typeof mod.BASE_CSS_PREVIEW, 'string')
})

test('BASE_CSS_PREVIEW uses CDN font URL (Pitfall-2 fix)', () => {
  assert.ok(mod.BASE_CSS_PREVIEW.includes('cdn.jsdelivr.net'), 'should use CDN')
})

test('BASE_CSS_PREVIEW does not use file:// paths', () => {
  assert.ok(!mod.BASE_CSS_PREVIEW.includes('file://'), 'should not have file:// in preview CSS')
})

test('BASE_CSS_PREVIEW includes Pretendard CDN import', () => {
  assert.ok(mod.BASE_CSS_PREVIEW.includes('orioncactus/pretendard'), 'should import Pretendard CDN')
})

// ── Preview render functions ──────────────────────────────

test('renderCoverPreview is exported', () => {
  assert.equal(typeof mod.renderCoverPreview, 'function')
})

test('renderHighlightPreview is exported', () => {
  assert.equal(typeof mod.renderHighlightPreview, 'function')
})

test('renderRankingPreview is exported', () => {
  assert.equal(typeof mod.renderRankingPreview, 'function')
})

test('renderClosingPreview is exported', () => {
  assert.equal(typeof mod.renderClosingPreview, 'function')
})

test('renderCoverPreview() does not use file:// paths', () => {
  const h = mod.renderCoverPreview({ week: '테스트', region: '성산구', area: '84㎡' })
  assert.ok(!h.includes('file://'), 'preview should not use file:// paths')
})

test('renderCoverPreview() uses CDN font', () => {
  const h = mod.renderCoverPreview({ week: '테스트', region: '성산구', area: '84㎡' })
  assert.ok(h.includes('cdn.jsdelivr.net'), 'preview should use CDN font')
})

test('renderClosingPreview() includes D-08 disclaimer', () => {
  const h = mod.renderClosingPreview({})
  assert.ok(h.includes('출처: 국토교통부 실거래가 공개시스템'), 'closing preview should have D-08')
})

// ── Result ────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
