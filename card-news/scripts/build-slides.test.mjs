/**
 * build-slides.test.mjs — 슬라이드 자료구조 추출 단위 테스트 (Phase 40-01)
 *
 * 실행: node card-news/scripts/build-slides.test.mjs
 *
 * 🔴 이 파일은 루트 `npm run test`(vitest, include: `src/ **`)에 **잡히지 않는다.**
 * `card-news/` 는 독립 npm 패키지다. 수동 실행이 유일한 경로다.
 *
 * 픽스처는 이 파일 안에 리터럴로 박는다 — `fixtures/snapshot-golden.json` 에 의존하면
 * 픽스처가 갱신될 때 단위 테스트가 같이 흔들린다.
 * (단, 케이스 18~21 containment 는 커밋된 골든 실물을 읽는 것이 목적이므로 예외다.)
 */
import assert from 'node:assert/strict'

import { subLine, buildSlides, buildChampionSlides, buildContentMeta } from './build-slides.js'

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

// ── 픽스처 헬퍼 ───────────────────────────────────────────

/** generate.js 의 pad10 과 같은 placeholder 를 만든다 */
function placeholder(rank) {
  return { rank, name: null, price: null, subtitle: null }
}

/** 실데이터 n개 + placeholder 로 10칸을 채운 ranking */
function ranking(realRows) {
  return Array.from({ length: 10 }, (_, i) => realRows[i] ?? placeholder(i + 1))
}

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

const CHAMPION_DATA = {
  week: '2026년 6월 2주차',
  weekCode: '2026-W24',
  period: '06.14 ~ 06.20 신고 건',
  source: '국토교통부 실거래가 공개시스템',
  champions: [
    { district: '의창구', name: '중동 유니시티 2단지', pricePerPyeong: 3833, change: 1.3 },
    { district: '성산구', name: '용지아이파크', pricePerPyeong: 12345, change: -0.4 },
    { district: '마산합포구', name: '메트로시티', pricePerPyeong: 2100, change: null },
    { district: '마산회원구', name: null, pricePerPyeong: null, change: null },
    { district: '진해구', name: '자은３지구', pricePerPyeong: 1800, change: 0 },
    { district: '김해시', name: null, pricePerPyeong: null, change: null },
  ],
}

// ── 1~2. subLine ─────────────────────────────────────────

test('1. subLine(region, area) — area 있으면 "전용" 이 붙는다', () => {
  assert.equal(subLine('창원 성산구', '84㎡'), '창원 성산구 · 전용 84㎡')
})

test('2. subLine(region, null) — area 없으면 region 그대로', () => {
  assert.equal(subLine('창원+김해', null), '창원+김해')
})

// ── 3~5. placeholder 제외 + 상한 ─────────────────────────

test('3. placeholder 제외 — 10칸 중 실데이터 2개면 슬라이드 2장', () => {
  const slides = buildSlides(AREA_DATA)
  assert.equal(slides.length, 2)
  // "단지명 입력"·"0억 0,000" 이 웹으로 나가면 사고다
  assert.ok(!JSON.stringify(slides).includes('단지명 입력'))
  assert.ok(!JSON.stringify(slides).includes('null'))
})

test('4. 실데이터 0개(전부 placeholder) → 빈 배열', () => {
  assert.deepStrictEqual(buildSlides({ ...AREA_DATA, ranking: ranking([]) }), [])
})

test('5. 실데이터 7개 → 상한 5장', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ rank: i + 1, name: `단지${i + 1}`, price: `${i + 1}억` }))
  assert.equal(buildSlides({ ...AREA_DATA, ranking: ranking(rows) }).length, 5)
})

// ── 6~8. seriesType 분기 ─────────────────────────────────

test('6. seriesType:area 슬라이드 0번 — kicker/label/big', () => {
  const s = buildSlides(AREA_DATA)[0]
  assert.equal(s.kicker, '1위 · 최고가')
  assert.equal(s.label, '만원')
  assert.equal(s.big, AREA_DATA.ranking[0].price)
})

test('7. seriesType:volume — kicker 에 "거래량", label 은 빈 문자열', () => {
  const data = {
    ...AREA_DATA,
    seriesType: 'volume',
    area: null,
    region: '창원+김해',
    ranking: ranking([{ rank: 1, name: '노블파크', price: '7건', subtitle: '성산구' }]),
  }
  const s = buildSlides(data)[0]
  assert.ok(s.kicker.includes('거래량'), `kicker=${s.kicker}`)
  assert.equal(s.label, '')
})

test('8. seriesType:value — kicker 에 "평당가", label 은 빈 문자열', () => {
  const data = {
    ...AREA_DATA,
    seriesType: 'value',
    region: '창원+김해',
    ranking: ranking([{ rank: 1, name: '정일맨션', price: '292만/평', subtitle: '마산회원구' }]),
  }
  const s = buildSlides(data)[0]
  assert.ok(s.kicker.includes('평당가'), `kicker=${s.kicker}`)
  assert.equal(s.label, '')
})

// ── 9~10. sub 조립 ───────────────────────────────────────

test('9. subtitle 있는 행 → sub = "이름 · subtitle"', () => {
  const data = {
    ...AREA_DATA,
    ranking: ranking([{ rank: 1, name: '노블파크', price: '7건', subtitle: '성산구' }]),
  }
  assert.equal(buildSlides(data)[0].sub, '노블파크 · 성산구')
})

test('10. subtitle 없는 행 + area 있음 → sub = "이름 · region · 전용 area"', () => {
  assert.equal(buildSlides(AREA_DATA)[0].sub, '용지아이파크 · 창원 성산구 · 전용 84㎡')
})

// ── 11~12. buildChampionSlides ───────────────────────────

test('11. buildChampionSlides — pricePerPyeong 없는 2건 제외 → 4장', () => {
  assert.equal(buildChampionSlides(CHAMPION_DATA).length, 4)
  // 🔴 ppp 는 있는데 단지 매칭이 실패해 name 이 null 인 행도 제외한다 —
  //    sub 가 null 이 되면 뷰어의 4필드 문자열 계약이 깨지고 containment 도 불가능해진다.
  const orphan = { ...CHAMPION_DATA, champions: [{ district: '성산구', name: null, pricePerPyeong: 9999, change: null }] }
  assert.deepStrictEqual(buildChampionSlides(orphan), [])
})

test('12. buildChampionSlides big 포맷 = toLocaleString("ko-KR")', () => {
  const s = buildChampionSlides(CHAMPION_DATA)[1]
  assert.equal(s.big, (12345).toLocaleString('ko-KR'))
  assert.equal(s.label, '만원/평')
  assert.equal(s.kicker, '성산구 대장단지')
  assert.equal(s.sub, '용지아이파크')
})

// ── 13. 뷰어 계약 — 정확히 4키 ───────────────────────────

test('13. 모든 슬라이드가 정확히 4키만 갖는다 (뷰어 계약 고정)', () => {
  // 🔴 이 파일에서 가장 중요한 단언.
  // 슬라이드 스키마가 조용히 넓어지면 창부레터 뷰어(cbl-article.jsx)가 **에러 없이**
  // 필드를 무시한다 — 침묵 실패가 최악의 실패 모드다.
  const all = [...buildSlides(AREA_DATA), ...buildChampionSlides(CHAMPION_DATA)]
  assert.ok(all.length > 0)
  for (const s of all) {
    assert.deepStrictEqual(Object.keys(s).sort(), ['big','kicker','label','sub'])
  }
})

// ── 14~16. buildContentMeta ──────────────────────────────

test('14. buildContentMeta slug 소문자화', () => {
  const m = buildContentMeta('84-seongsan', AREA_DATA, '2026-06-20')
  assert.equal(m.slug, '2026-w24-84-seongsan')
  assert.equal(m.category, '주간실거래가')
  assert.equal(m.title, '2026년 6월 2주차 창원 성산구 84㎡ 실거래가 랭킹 TOP 10')
  assert.equal(m.excerpt, '용지아이파크 · 창원 성산구 · 전용 84㎡ — 10억 4,000만원')
})

test('15. buildContentMeta publishedAt = 회차 종료일 23:59:59 KST', () => {
  const m = buildContentMeta('84-seongsan', AREA_DATA, '2026-06-20')
  assert.equal(m.publishedAt, '2026-06-20T23:59:59+09:00')
})

test('16. buildContentMeta champions 제목 분기', () => {
  const m = buildContentMeta('district-champions', CHAMPION_DATA, '2026-06-20')
  assert.ok(m.title.includes('구별 대장단지'), `title=${m.title}`)
  assert.equal(m.slug, '2026-w24-district-champions')
})

// ── 17. 순수성 ───────────────────────────────────────────

test('17. 순수성 — 같은 입력 2회 호출 결과가 동일', () => {
  assert.deepStrictEqual(buildSlides(AREA_DATA), buildSlides(AREA_DATA))
  assert.deepStrictEqual(buildChampionSlides(CHAMPION_DATA), buildChampionSlides(CHAMPION_DATA))
  assert.deepStrictEqual(
    buildContentMeta('84-seongsan', AREA_DATA, '2026-06-20'),
    buildContentMeta('84-seongsan', AREA_DATA, '2026-06-20'),
  )
})

console.log(`\n${passed} passed / ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
