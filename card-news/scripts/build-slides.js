/**
 * build-slides.js — 카드뉴스 슬라이드 자료구조 (Phase 40-01, 선행조건 0-4)
 *
 * 창부레터 뷰어(`changbuletter/design/cbl-article.jsx:41-66`)가 읽는 계약:
 *
 *     data.slides[i] → { kicker, big, label, sub }   // 정확히 4필드. 그 이상도 이하도 아님
 *
 * 🔴 이 파일은 **완전 순수 모듈**이다 — import 0건. fs·network·Date 비의존.
 *    `fetch-data.js` 를 import 하면 모듈 최상단 env 검증이 딸려와 DB 없는 환경에서 못 쓴다.
 *    `templates.js` 가 이 파일의 `subLine` 을 import 한다 (역방향 의존 금지).
 *
 * ## 단일 원천이 `slides[]` 가 아니라 `data` 인 이유 (D-01 재해석)
 *
 * 40-CONTEXT D-01 은 `data → buildSlides(data) → slides[] → 템플릿이 렌더` 를 그렸지만
 * **문자 그대로는 구현 불가능하다**:
 *   - `renderRanking` 은 10행을 렌더한다. 4필드 슬라이드 1장이 10행을 담을 수 없다
 *   - `renderHighlight` 는 `rank`·`name`·`price`·`sub` 를 각각 다른 DOM 노드로 렌더한다
 *   - 억지로 담으려면 슬라이드 스키마를 4필드 밖으로 넓혀야 하는데 ADR-004 위반이다
 *
 * 그래서 `buildSlides(data)` 와 `render*(data)` 를 **같은 `data` 를 받는 순수 함수 두 개**로 두고,
 * 두 경로에 공통으로 나오는 문자열은 **공유 헬퍼(`subLine`) 하나**에서 만든다.
 * "HTML 과 DB 가 갈라지지 않는다" 는 명제는 `build-slides.test.mjs` 의
 * **containment 단언(케이스 18~21)** 이 기계적으로 강제한다 —
 * 각 슬라이드의 4필드가 같은 회차의 렌더된 HTML 안에 실재해야 한다.
 */

/** 슬라이드 상한 — 뷰어에서 스와이프 피로도를 고려한 D-07 재량값 */
const MAX_SLIDES = 5

const KICKER = { area: '최고가', city: '최고가', volume: '거래량', value: '평당가' }

// volume·value 는 price 문자열에 이미 단위가 박혀 있다("7건", "292만/평") → label 을 비운다.
const LABEL = { area: '만원', city: '만원', volume: '', value: '' }

/**
 * 랭킹 행의 부제 — `renderHighlight` 의 `rankCard()` 와 **공유하는 유일한 문자열 생성기**.
 * @param {string} region
 * @param {string|null|undefined} area
 * @returns {string}
 */
export function subLine(region, area) {
  return area ? `${region} · 전용 ${area}` : region
}

/**
 * `generateCardSet` 이 받는 `data` → 뷰어 슬라이드 배열.
 * @param {{region:string, area:?string, seriesType:?string, ranking:Array}} data
 * @returns {Array<{kicker:string, big:string, label:string, sub:string}>}
 */
export function buildSlides(data) {
  const type = data.seriesType ?? 'area'
  const kickerWord = KICKER[type] ?? KICKER.area
  const label = LABEL[type] ?? LABEL.area

  // 🔴 `pad10` 이 채운 placeholder 는 슬라이드가 되면 안 된다.
  //    "단지명 입력"·"0억 0,000" 이 웹 발행물로 나가면 사고다.
  const rows = (data.ranking ?? []).filter((item) => item && item.name && item.price)

  return rows.slice(0, MAX_SLIDES).map((item) => ({
    kicker: `${item.rank}위 · ${kickerWord}`,
    // 🔴 `big` 은 `item.price` **원문 그대로**. 숫자를 재계산하면 반올림 하나로
    //    렌더 HTML 과 갈라지고 containment 단언이 깨진다.
    big: item.price,
    label,
    sub: `${item.name} · ${item.subtitle ?? subLine(data.region, data.area)}`,
  }))
}

/**
 * district-champions 회차 → 뷰어 슬라이드 배열.
 * @param {{champions:Array<{district:string, name:?string, pricePerPyeong:?number}>}} data
 */
export function buildChampionSlides(data) {
  return (data.champions ?? [])
    // pricePerPyeong 이 없으면 카드가 "—"·"데이터 없음" 을 렌더한다 → 슬라이드로 만들지 않는다.
    // name 이 없는 경우(단지 매칭 실패)도 제외한다 — `sub` 가 null 이 되면 4필드 문자열 계약이 깨진다.
    .filter((ch) => ch && ch.pricePerPyeong && ch.name)
    .map((ch) => ({
      kicker: `${ch.district} 대장단지`,
      // `renderDistrictChampionsCard`(templates.js:314) 와 **같은 식**이어야 containment 가 성립한다.
      big: ch.pricePerPyeong.toLocaleString('ko-KR'),
      label: '만원/평',
      sub: ch.name,
    }))
}

/**
 * `contents` 적재용 메타 (40-03 이 쓴다).
 * @param {string} seriesId
 * @param {object} data
 * @param {string} to - 회차 기간 종료일 `YYYY-MM-DD`
 */
export function buildContentMeta(seriesId, data, to) {
  const isChampions = Array.isArray(data.champions)
  const slides = isChampions ? buildChampionSlides(data) : buildSlides(data)
  const first = slides[0]

  return {
    slug: `${data.weekCode}-${seriesId}`.toLowerCase(),
    title: isChampions
      ? `${data.week} 창원·김해 구별 대장단지`
      : `${data.week} ${data.region}${data.area ? ' ' + data.area : ''} 실거래가 랭킹 TOP 10`,
    category: '주간실거래가',
    excerpt: first ? `${first.sub} — ${first.big}${first.label}` : null,
    // 📌 D-07 재량: 회차 기간 종료일 23:59:59 KST.
    //   ① 재실행해도 값이 안 바뀐다(멱등)
    //   ② 항상 과거라 `contents` 공개 읽기 정책 `published_at <= now()` 를 만족한다
    //   ③ 아카이브 정렬이 회차 순서와 일치한다
    //   `data.period`("06.14 ~ 06.20 신고 건") 에는 연도가 없어 파싱할 수 없다 → 호출부가 `to` 를 넘긴다.
    publishedAt: `${to}T23:59:59+09:00`,
  }
}
