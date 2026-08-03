/**
 * persist-contents.test.mjs — contents 적재 단위 테스트 (Phase 40-03)
 *
 * 실행: node card-news/scripts/persist-contents.test.mjs
 *
 * 🔴 이 파일은 루트 `npm run test`(vitest, include: `src/ **`)에 **잡히지 않는다.**
 *    `card-news/` 는 독립 npm 패키지다. 수동 실행이 유일한 경로다.
 *
 * 🔴 **네트워크를 타지 않는다.** Supabase 클라이언트는 최소 목으로 주입한다 —
 *    그래서 `persistContents(client, rows)` 가 클라이언트를 인자로 받는다.
 */
import assert from 'node:assert/strict'

import { buildContentRow, persistContents } from './persist-contents.js'

let passed = 0
let failed = 0
const queue = []

function test(name, fn) {
  queue.push([name, fn])
}

// ── 픽스처 ────────────────────────────────────────────────

/** generate.js 의 pad10 과 같은 placeholder */
function placeholder(rank) {
  return { rank, name: null, price: null, subtitle: null }
}

/** 실데이터 n개 + placeholder 로 10칸을 채운 ranking */
function ranking(realRows) {
  return Array.from({ length: 10 }, (_, i) => realRows[i] ?? placeholder(i + 1))
}

const TO = '2026-06-20'

const AREA_DATA = {
  week: '2026년 6월 2주차',
  weekCode: '2026-W24',
  period: '06.14 ~ 06.20 신고 건',
  source: '국토교통부 실거래가 공개시스템',
  region: '창원 성산구',
  area: '84㎡',
  seriesType: 'area',
  subCaption: '이번 주 …',
  ranking: ranking([
    { rank: 1, name: '용지아이파크', price: '10억 4,000' },
    { rank: 2, name: '트리비앙', price: '9억 1,000' },
  ]),
}

/** 실데이터가 한 건도 없는 회차 — pad10 placeholder 만 10칸 */
const EMPTY_DATA = { ...AREA_DATA, ranking: ranking([]) }

const CHAMPIONS_DATA = {
  week: '2026년 6월 2주차',
  weekCode: '2026-W24',
  period: '06.14 ~ 06.20 신고 건',
  source: '국토교통부 실거래가 공개시스템',
  champions: [
    { district: '성산구', name: '용지아이파크', pricePerPyeong: 3120 },
    { district: '의창구', name: '중동유니시티', pricePerPyeong: 2480 },
    { district: '진해구', name: null, pricePerPyeong: 1900 },
  ],
}

/** upsert 호출 인자를 기록하는 최소 목 */
function mockClient({ error = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        async upsert(rows, opts) {
          calls.push({ table, rows, opts })
          return { error, data: null }
        },
      }
    },
  }
}

const EXPECTED_KEYS = [
  'body',
  'category',
  'excerpt',
  'is_featured',
  'published_at',
  'region_tags',
  'site_id',
  'slug',
  'status',
  'title',
  'type',
]

// ── 케이스 ────────────────────────────────────────────────

test('1. 랭킹 시리즈 행이 정확히 11개 키를 갖는다', () => {
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.deepStrictEqual(Object.keys(row).sort(), EXPECTED_KEYS)
})

test('2. 🔴 body 가 { slides:[…] } 이고 각 슬라이드가 정확히 4키다', () => {
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.deepStrictEqual(Object.keys(row.body), ['slides'])
  assert.ok(Array.isArray(row.body.slides))
  assert.ok(row.body.slides.length > 0, '슬라이드가 0장이면 이 단언이 공허하게 통과한다')
  for (const s of row.body.slides) {
    assert.deepStrictEqual(Object.keys(s).sort(), ['big', 'kicker', 'label', 'sub'])
  }
})

test('3. 🔴 실데이터 0건 시리즈는 null 을 돌려준다 (빈 발행물 차단)', () => {
  assert.equal(buildContentRow('84-seongsan', EMPTY_DATA, TO), null)
})

test('4. champions 시리즈 — slides 가 채워지고 title 이 분기한다', () => {
  const row = buildContentRow('district-champions', CHAMPIONS_DATA, TO)
  // name 이 null 인 진해구는 buildChampionSlides 가 걸러낸다 → 2장
  assert.equal(row.body.slides.length, 2)
  assert.ok(row.title.includes('구별 대장단지'), `title=${row.title}`)
  assert.equal(row.slug, '2026-w24-district-champions')
})

test('5. slug 는 소문자이고 weekCode 가 앞에 온다', () => {
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.equal(row.slug, '2026-w24-84-seongsan')
})

test('6. published_at 은 회차 종료일 23:59:59 KST 다', () => {
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.equal(row.published_at, '2026-06-20T23:59:59+09:00')
})

test('7. 🔴 status=published · site_id=changbuletter · type=card_news 고정', () => {
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.equal(row.status, 'published')
  assert.equal(row.site_id, 'changbuletter')
  assert.equal(row.type, 'card_news')
})

test('8. 🔴 id·created_at·updated_at 키가 없다 (재실행 시 값이 흔들리지 않게)', () => {
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.equal('id' in row, false)
  assert.equal('created_at' in row, false)
  assert.equal('updated_at' in row, false)
})

test('9. 🔴 persistContents 가 onConflict:"slug" 로 contents 에 upsert 한다', async () => {
  const client = mockClient()
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  const res = await persistContents(client, [row])

  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].table, 'contents')
  assert.equal(client.calls[0].opts.onConflict, 'slug')
  assert.equal(client.calls[0].opts.ignoreDuplicates, false)
  assert.deepStrictEqual(res, { upserted: 1, skipped: 0 })
})

test('10. 🔴 upsert 가 error 를 돌려주면 던진다 (조용히 삼키지 않는다)', async () => {
  const client = mockClient({ error: { code: '42P10', message: 'no unique or exclusion constraint' } })
  const row = buildContentRow('84-seongsan', AREA_DATA, TO)
  await assert.rejects(() => persistContents(client, [row]), /42P10|no unique or exclusion constraint/)
})

test('11. rows 가 전부 null 이면 upsert 를 호출하지 않는다', async () => {
  const client = mockClient()
  const res = await persistContents(client, [null, null])
  assert.equal(client.calls.length, 0, 'upsert 가 호출되면 안 된다')
  assert.deepStrictEqual(res, { upserted: 0, skipped: 2 })
})

test('12. 🔴 같은 입력 2회 → 두 행의 모든 필드가 동일하다 (멱등의 구조적 근거)', () => {
  const a = buildContentRow('84-seongsan', AREA_DATA, TO)
  const b = buildContentRow('84-seongsan', AREA_DATA, TO)
  assert.deepStrictEqual(a, b)
})

// ── 러너 ──────────────────────────────────────────────────

for (const [name, fn] of queue) {
  try {
    await fn()
    console.log(`  v ${name}`)
    passed++
  } catch (e) {
    console.error(`  x ${name}: ${e.message}`)
    failed++
  }
}

console.log(`\n${passed} passed / ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
