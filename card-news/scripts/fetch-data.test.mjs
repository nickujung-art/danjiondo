/**
 * fetch-data.test.mjs — Unit tests for new fetch-data.js exports
 * TDD RED: Tests will fail until new functions are added to fetch-data.js
 *
 * Run: node card-news/scripts/fetch-data.test.mjs
 */
import assert from 'node:assert/strict'

// Set dummy env vars so supabase client creation doesn't throw on module load
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-key-for-unit-tests'

const mod = await import('./fetch-data.js')

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

// ── getDateRange ──────────────────────────────────────────

test('getDateRange is exported as a function', () => {
  assert.equal(typeof mod.getDateRange, 'function')
})

test('getDateRange("monthly") returns { from, to }', () => {
  const r = mod.getDateRange('monthly')
  assert.ok(r.from && r.to, 'should have from and to')
  assert.match(r.from, /^\d{4}-\d{2}-01$/, 'from should be first of month')
})

test('getDateRange("yearly") returns Jan 1 as from', () => {
  const r = mod.getDateRange('yearly')
  const year = new Date().getFullYear()
  assert.equal(r.from, `${year}-01-01`)
})

test('getDateRange("quarterly") returns quarter start', () => {
  const r = mod.getDateRange('quarterly')
  assert.ok(r.from && r.to, 'should have from and to')
})

test('getDateRange("weekly") returns last week range', () => {
  const r = mod.getDateRange('weekly')
  assert.ok(r.from && r.to, 'should have from and to')
  assert.ok(r.from <= r.to, 'from should be before or equal to to')
})

test('getDateRange("custom", from, to) returns custom range', () => {
  const r = mod.getDateRange('custom', '2026-06-01', '2026-06-14')
  assert.equal(r.from, '2026-06-01')
  assert.equal(r.to, '2026-06-14')
})

test('getDateRange throws for unknown type', () => {
  assert.throws(() => mod.getDateRange('invalid'), /Unknown period type/)
})

// ── filterOutliers ────────────────────────────────────────

test('filterOutliers is exported as a function', () => {
  assert.equal(typeof mod.filterOutliers, 'function')
})

// ── New ranking functions ─────────────────────────────────

test('fetchJeonseRanking is exported as a function', () => {
  assert.equal(typeof mod.fetchJeonseRanking, 'function')
})

test('fetchMonthlyRanking is exported as a function', () => {
  assert.equal(typeof mod.fetchMonthlyRanking, 'function')
})

test('fetchAllTimeHighRanking is exported as a function', () => {
  assert.equal(typeof mod.fetchAllTimeHighRanking, 'function')
})

test('fetchPriceChangeRanking is exported as a function', () => {
  assert.equal(typeof mod.fetchPriceChangeRanking, 'function')
})

// ── Result ────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
