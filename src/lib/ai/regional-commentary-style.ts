/**
 * 지역 주간 코멘트의 **문장 품질 장치** — 회전 슬롯 + 결정론적 검증 게이트.
 *
 * scripts/generate-regional-commentary.ts 가 이 모듈을 쓴다. 순수 함수만 두어 테스트가 가능하게
 * 분리했다(스크립트 본체는 Supabase·모델 호출이 섞여 있어 단위 테스트가 안 된다).
 *
 * [왜 필요한가 — 2026-07-31 humanize-korean 탐지기 결과]
 * 1차 dry-run 결과 4개 지역 문장이 **개별로는 멀쩡한데 나란히 놓으면 폼 채우기로 읽혔다**.
 * 슬롯 순서가 4/4 동일했다: `[지역]에서는 → [건수] → [증감] → [최고가] → [상승/하락]`.
 * 첫 문장 개시부가 어절 순서까지 같고 지역명·숫자만 바뀌었다. 홈 피드는 6개 지역 카드를
 * 세로로 쌓으므로, 문장 하나하나를 아무리 다듬어도 이 균일성은 사라지지 않는다.
 *
 * [왜 프롬프트로 "다양하게 써주세요"라고 하지 않는가]
 * llama-3.1-8b 급 소형 모델에 다양성을 요구하면 오히려 자기 최빈 패턴으로 수렴한다(mode collapse).
 * 그래서 **다양성은 코드가 결정론적으로 회전**시키고, 모델에는 매번 "이 순서로 쓰라"는
 * 단일 지시만 준다. 시드는 (주차 × 지역)이라 같은 주·같은 지역은 항상 같은 결과가 나오고
 * (재실행 재현성), 지역끼리는 서로 다르며, 다음 주에는 지역별로 다시 밀린다.
 *
 * [왜 사후 윤문(LLM 재호출)이 아닌가]
 * 생성은 GitHub Actions 크론에서 돌고 결과가 그대로 DB에 들어간다. 사람이 손볼 단계가 없다.
 * 그래서 교정은 전부 **결정론적**이어야 한다 — 정규식 치환과 검증 게이트만 쓴다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 입력 타입
// ─────────────────────────────────────────────────────────────────────────────

export interface CommentaryFacts {
  /** 문장에 쓰는 짧은 지역명. "창원시 성산구"가 아니라 "성산구" — 라벨 표기 흔들림 방지 */
  shortLabel: string
  /** 절대 날짜 기간 라벨. "8월 25~31일" — 밀려도 틀리지 않도록 상대 표현("지난주") 대신 사용 */
  periodLabel: string
  txCount: number
  /** 직전 주 대비 증감(부호 있음). 모델에게 뺄셈을 시키지 않으려고 코드가 계산해 넘긴다 */
  txDiff: number
  topDeal: { complexName: string; price: number; pyeong: number; floor: number | null } | null
  upComplexes: number
  downComplexes: number
}

export interface CommentarySlots {
  openerId: OpenerId
  /** 첫 문장을 반드시 이 어구로 시작한다. 추상 지시보다 리터럴 지정이 훨씬 잘 지켜진다 */
  lead: string
  /** 같은 사실 종류 안에서 몇 번째 어구인지(0|1). 폴백 문장이 어미를 맞출 때 쓴다 */
  leadIndex: number
  openerInstruction: string
  /** 증감 표현. 방향이 뒤집히면 치명적이라 코드가 만들어 그대로 쓰게 한다 */
  volumePhrase: string
  /** 상승/하락 단지 수 표현. 대칭 병렬(`A N곳, B M곳`)이 4/4 반복돼 회전 대상에 넣었다 */
  breadthPhrase: string
}

type OpenerId = 'volume' | 'top_deal' | 'breadth'

// ─────────────────────────────────────────────────────────────────────────────
// 회전 슬롯
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 첫 문장을 무엇으로, **어떤 어구로** 열지. 슬롯 순서 전체를 밀어내는 가장 강한 변수라 1순위로 회전시킨다.
 *
 * 사실 종류(id)당 어구(lead)를 2개씩 둬서 후보가 총 6개다. 3개만 두면 지역이 6곳이라
 * 최소 3곳은 개시부가 반드시 겹치고(비둘기집), 겹친 지역은 검증에서 전부 반려돼 템플릿으로 떨어진다.
 * 실제로 3개짜리 3차 dry-run에서 이 이유로만 폴백이 났다.
 *
 * `requires` 로 데이터가 없는 후보는 제외한다 — 최고가 거래가 없는데 "최고가로 시작하라"고 하면
 * 모델이 없는 사실을 지어낸다.
 */
const OPENERS: {
  id: OpenerId
  requires: (f: CommentaryFacts) => boolean
  lead: (f: CommentaryFacts) => string
  instruction: string
}[] = [
  {
    id: 'volume',
    requires: () => true,
    lead: (f) => `${f.periodLabel} ${f.shortLabel}에서는`,
    instruction: '거래 건수와 증감으로 첫 문장을 시작하세요.',
  },
  {
    id: 'volume',
    requires: () => true,
    lead: (f) => `${f.shortLabel}의 ${f.periodLabel} 아파트 거래는`,
    instruction: '거래 건수와 증감으로 첫 문장을 시작하세요.',
  },
  {
    id: 'top_deal',
    requires: (f) => f.topDeal != null,
    lead: () => '가장 비싼 거래는',
    instruction: '가장 비싼 거래로 첫 문장을 시작하세요. 거래 건수와 증감은 그 다음 문장에 쓰세요.',
  },
  {
    id: 'top_deal',
    requires: (f) => f.topDeal != null,
    lead: (f) => `${f.shortLabel}에서 ${f.periodLabel} 가장 높은 값에 팔린 곳은`,
    instruction: '가장 비싼 거래로 첫 문장을 시작하세요. 거래 건수와 증감은 그 다음 문장에 쓰세요.',
  },
  {
    id: 'breadth',
    requires: () => true,
    lead: () => '최근 30일 변동률 기준으로는',
    instruction: '상승·하락 단지 수로 첫 문장을 시작하세요. 거래 건수와 증감은 그 다음 문장에 쓰세요.',
  },
  {
    id: 'breadth',
    requires: () => true,
    lead: () => '최근 30일 변동률로 보면',
    instruction: '상승·하락 단지 수로 첫 문장을 시작하세요. 거래 건수와 증감은 그 다음 문장에 쓰세요.',
  },
]

/** 증감 표현 후보. 숫자와 방향은 코드가 박고 서술어만 돌린다 */
const VOLUME_FORMS = {
  up: [
    (n: number) => `직전 주보다 ${n}건 늘었어요`,
    (n: number) => `직전 주보다 ${n}건 더 거래됐어요`,
    (n: number) => `직전 주보다 ${n}건 많아졌어요`,
  ],
  down: [
    (n: number) => `직전 주보다 ${n}건 줄었어요`,
    (n: number) => `직전 주보다 ${n}건 덜 거래됐어요`,
    (n: number) => `직전 주보다 ${n}건 적었어요`,
  ],
  same: [() => `직전 주와 같았어요`, () => `직전 주와 같은 건수예요`, () => `직전 주와 같은 수준이에요`],
} as const

/** 상승/하락 단지 수 표현. 첫 형태는 대칭 병렬이라 회전 없이 쓰면 AI 티가 난다 */
const BREADTH_FORMS: ((up: number, down: number) => string)[] = [
  (up, down) => `상승 단지 ${up}곳, 하락 단지 ${down}곳이에요`,
  (up, down) => `${up}곳이 올랐고 ${down}곳이 내렸어요`,
  (up, down) => `오른 단지는 ${up}곳이고, 내린 곳은 ${down}곳이에요`,
]

/**
 * (주차 × 지역) 시드. 같은 입력이면 항상 같은 값이라 재실행해도 문장이 바뀌지 않는다.
 * 주차는 periodStart 를 에폭 기준 주 단위로 환산해 쓴다 — 다음 주가 되면 모든 지역의 슬롯이
 * 통째로 밀려서, 같은 지역을 매주 보는 사람에게도 반복으로 읽히지 않는다.
 */
export function rotationSeed(periodStart: string, regionIndex: number): number {
  const weekIndex = Math.floor(Date.parse(`${periodStart}T00:00:00Z`) / (7 * 86_400_000))
  return weekIndex * 7 + regionIndex
}

/** 시드로 슬롯 조합을 고른다. attempt 는 검증 실패 재시도용 — 다른 조합으로 다시 굴린다 */
export function pickSlots(facts: CommentaryFacts, seed: number, attempt = 0): CommentarySlots {
  const s = seed + attempt * 13 // 13은 후보 개수(6·3)와 서로소라 재시도마다 조합이 실제로 바뀐다
  const available = OPENERS.filter((o) => o.requires(facts))
  const opener = available[mod(s, available.length)]!

  const volumeBucket =
    facts.txDiff > 0 ? VOLUME_FORMS.up : facts.txDiff < 0 ? VOLUME_FORMS.down : VOLUME_FORMS.same
  const volumePhrase = volumeBucket[mod(s + 1, volumeBucket.length)]!(Math.abs(facts.txDiff))

  const breadthPhrase = BREADTH_FORMS[mod(s + 2, BREADTH_FORMS.length)]!(
    facts.upComplexes,
    facts.downComplexes,
  )

  return {
    openerId: opener.id,
    lead: opener.lead(facts),
    leadIndex: available.filter((o) => o.id === opener.id).indexOf(opener),
    openerInstruction: opener.instruction,
    volumePhrase,
    breadthPhrase,
  }
}

/** JS `%` 는 음수에서 음수를 돌려주므로 배열 인덱스로 쓰려면 감싸야 한다 */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

// ─────────────────────────────────────────────────────────────────────────────
// 포맷
// ─────────────────────────────────────────────────────────────────────────────

export function formatEok(price: number): string {
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString('ko-KR')}만원`
  if (uk > 0) return `${uk}억원`
  return `${price.toLocaleString('ko-KR')}만원`
}

function topDealText(f: CommentaryFacts): string | null {
  if (!f.topDeal) return null
  const floor = f.topDeal.floor != null ? ` ${f.topDeal.floor}층` : ''
  return `${f.topDeal.complexName} ${f.topDeal.pyeong}평${floor} ${formatEok(f.topDeal.price)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// 프롬프트
// ─────────────────────────────────────────────────────────────────────────────

export function buildCommentaryPrompt(f: CommentaryFacts, slots: CommentarySlots): string {
  // **평균 평당가는 프롬프트에 넣지 않는다**(2026-07-31 2차 dry-run에서 제거).
  // 두 가지 이유가 겹친다.
  // (a) 주간 표본이 10~90건이라 어떤 평형·단지가 거래됐는지에 따라 평균이 크게 흔들린다 —
  //     마산합포구가 28건 기준 "27.1% 상승"으로 나온 적이 있는데 시장 변동이 아니라 구성 차이였다.
  // (b) 2~3문장 안에 필수 사실(거래 건수·최고가 거래·상승하락)을 담아야 하는데, 평당가를 주면
  //     모델이 그걸 쓰느라 최고가 거래를 통째로 버리거나 4문장이 됐다. 반려 사유 대부분이 이거였다.
  const lines = [`- 매매 거래: ${f.txCount}건`, `- 증감 표현(그대로 쓸 것): "${slots.volumePhrase}"`]
  const top = topDealText(f)
  if (top) lines.push(`- 최고가 거래: ${top}`)
  lines.push(`- 상승/하락 표현(그대로 쓸 것): "${slots.breadthPhrase}" (최근 30일 변동률 기준)`)

  return `아래는 ${f.shortLabel}의 한 주간 아파트 실거래 데이터예요. 이걸 2~3문장으로 요약해주세요.

${lines.join('\n')}

작성 규칙:
1. ${slots.openerInstruction} 첫 문장은 반드시 "${slots.lead}"로 시작하세요.
2. 첫 문장부터 바로 사실을 쓰세요. "정리해 보겠습니다", "동향입니다", "알려드릴게요" 같은 도입부는 절대 쓰지 마세요.
3. 모든 문장을 해요체로 끝내세요("~했어요", "~이에요"). "~습니다"체는 쓰지 마세요.
4. 위 데이터에 있는 숫자만 쓰세요. 반올림하거나 "약", "천만원" 단위로 바꾸지 마세요.
5. 따옴표로 준 표현("${slots.volumePhrase}", "${slots.breadthPhrase}")은 글자 그대로 문장에 넣으세요. 방향(늘다/줄다, 오르다/내리다)을 바꾸지 마세요.
6. 상승/하락 단지 수를 쓸 때 "최근 30일 변동률 기준"이라고 딱 한 번 밝히세요.
7. 투자 권유·전망·조언 표현 절대 금지("사기 좋은", "지금이 기회", "오를 것으로 보인다", "주목할 만한", "강세", "관망세" 등). 이미 일어난 일만 서술하세요.
8. 데이터에 없는 평가를 붙이지 마세요("머물렀어요", "활발했어요", "부진했어요" 등 금지).
9. "N건의 매매 거래가 있었어요" 같은 번역투 대신 "N건이 거래됐어요"처럼 동사로 쓰세요.
10. 줄바꿈 없이 한 문단, 2~3문장. ISO 날짜(2026-07-20)는 쓰지 마세요. 기간은 첫 문장 개시부에 이미 들어 있으니 반복하지 마세요.
11. "${f.shortLabel}", "${f.txCount}건"${top ? `, 단지 이름 "${f.topDeal!.complexName}"` : ''}은 반드시 그대로 넣으세요. 빠뜨리거나 줄여 쓰면 안 돼요.

좋은 예시(숫자는 예시일 뿐이니 절대 가져다 쓰지 마세요):
${f.periodLabel} ○○구에서는 아파트 999건이 거래돼 직전 주보다 999건 늘었어요. 가장 비싼 거래는 △△아파트 999평 999층 999억원이었어요. 최근 30일 변동률 기준으로는 상승 단지 999곳, 하락 단지 999곳이에요.`
}

// ─────────────────────────────────────────────────────────────────────────────
// 결정론적 교정 — 맞춤법
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 소형 모델이 반복해서 틀리는 표기를 기계적으로 고친다.
 * `이예요`는 국어에 없는 형태인데 llama 계열이 거의 매번 쓴다(탐지기 S1).
 * LLM 재호출이 아니라 정규식이므로 크론 제약("사후 윤문 불가")에 걸리지 않는다.
 */
const SPELL_FIXES: [RegExp, string][] = [
  [/이예요/g, '이에요'],
  [/됬/g, '됐'],
  [/할께요/g, '할게요'],
  [/할꺼/g, '할 거'],
  [/몇일/g, '며칠'],
  [/오랫만/g, '오랜만'],
  [/[ \t]{2,}/g, ' '],
]

export function applySpellFixes(text: string): string {
  return SPELL_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), text).trim()
}

/**
 * 줄바꿈·연속 공백을 한 칸으로 접는다.
 * body 는 카드에 한 문단으로 렌더되므로 줄바꿈이 남으면 레이아웃이 깨진다. 모델이 문단을
 * 나눠 쓰는 건 흔한 습관이라, 이건 반려 사유로 다루지 않고 그냥 정규화한다
 * (군더더기 문장이 실제로 늘어난 경우는 아래 문장 수 검사가 따로 잡는다).
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// 검증 게이트
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 금지 표현. 두 부류가 섞여 있다.
 * (a) 투자 권유·전망 — ADR-005 기조. 실거래 사이트가 판단을 대신하면 안 된다.
 * (b) 데이터에 없는 평가·AI 상투어 — 탐지기가 S1으로 잡은 것들.
 */
const BANNED_PATTERNS: [RegExp, string][] = [
  [/주목할\s*만/, '투자 권유(주목할 만한)'],
  [/사기\s*좋/, '투자 권유(사기 좋은)'],
  [/기회(예요|입니다|로|가 될)/, '투자 권유(기회)'],
  [/전망|예상(돼|된|됩니다|해)/, '전망 표현'],
  [/오를\s*것|내릴\s*것/, '예측 표현'],
  [/강세|약세|훈풍|매수세|관망세|열기|투자\s*심리/, '시황 상투어'],
  [/머물렀|부진|활발|침체|위축|달했/, '데이터에 없는 평가'],
  [/건의\s*(매매\s*)?거래가\s*있었/, '번역투(N건의 거래가 있었어요)'],
  [/정리해\s*(보|드)|살펴보면|알려드릴게요|요약하면|다음과\s*같/, '도입부 상투어'],
  [/입니다|습니다|했다\.|이다\./, '해요체 위반'],
  [/\d{4}-\d{2}-\d{2}|\d+월\s*\d+일/, '날짜 표기'],
  // 8B 모델이 한국어 도중 한자로 새는 일이 실제로 있었다("最近 30일", "최다价은")
  [/[一-鿿]/, '한자 혼입'],
  // 문장이 끝났는데 쉼표로 이어붙이는 비문("99건이 거래됐어요, 직전 주보다 9건 더 거래됐어요")
  [/요,/, '쉼표 이어쓰기'],
  // "아파트 거래는 18건이 거래됐어요" 처럼 같은 동사를 겹쳐 쓰는 비문
  [/거래(는|가)\s*\d+건이\s*거래/, '거래 중복 표현'],
]

export interface ValidationResult {
  ok: boolean
  violations: string[]
  /** 지역 간 중복 판정을 위해 호출자가 모아 두는 개시부 서명 */
  openingSignature: string
}

/**
 * 모델 출력이 그대로 배포돼도 되는지 판정한다.
 *
 * 핵심은 **숫자 부분집합 검사**다. 소형 모델은 "16억 3,000만원"을 "약 16억"으로 바꾸거나
 * 증감 방향을 뒤집는 실수를 하는데(실제로 28건 vs 27건을 "1건 줄었어요"로 서술한 적 있음),
 * 실거래 사이트에서 수치가 틀리면 신뢰가 통째로 무너진다. 그래서 출력에 등장하는 모든 숫자가
 * 입력에서 유래했는지 기계적으로 확인한다.
 *
 * @param seenOpenings 같은 실행에서 앞선 지역들이 만든 개시부 서명. 겹치면 반려한다 —
 *                     홈 피드에 6개가 세로로 쌓이므로 개시부가 같으면 폼 채우기로 읽힌다.
 */
export function validateCommentary(
  text: string,
  facts: CommentaryFacts,
  seenOpenings: ReadonlySet<string> = new Set(),
): ValidationResult {
  const violations: string[] = []
  const openingSignature = signatureOf(text, facts)

  if (text.includes('\n')) violations.push('줄바꿈 포함')

  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  if (sentences.length < 2 || sentences.length > 3) {
    violations.push(`문장 수 ${sentences.length}개(2~3개여야 함)`)
  }
  for (const sentence of sentences) {
    if (!/요[.!?]$/.test(sentence.trim())) violations.push(`해요체 아님: "${sentence.trim().slice(-12)}"`)
  }

  for (const [re, label] of BANNED_PATTERNS) {
    if (re.test(text)) violations.push(`금지 표현(${label})`)
  }

  const thirtyDayMentions = text.split('최근 30일').length - 1
  if (thirtyDayMentions !== 1) violations.push(`"최근 30일" ${thirtyDayMentions}회(1회여야 함)`)

  // 필수 사실 — 1차 검증에서 모델이 규칙은 다 지키면서 **내용을 빠뜨리는** 실패가 나왔다.
  // (지역명 누락 "지난주에는 아파트 99건…", 거래 건수 누락 "직전 주보다 8건 줄었어요",
  //  최고가 단지 누락). 카드가 세 지역에서 서로 다른 정보를 담으면 비교가 불가능하므로
  //  "무엇을 반드시 담을 것인가"도 게이트가 강제한다.
  if (!text.includes(facts.shortLabel)) violations.push(`지역명 누락(${facts.shortLabel})`)
  if (!text.includes(`${facts.txCount}건`)) violations.push(`거래 건수 누락(${facts.txCount}건)`)
  if (facts.topDeal) {
    if (!text.includes(facts.topDeal.complexName)) {
      violations.push(`최고가 단지 누락(${facts.topDeal.complexName})`)
    }
    // 금액은 **문자열 통째로** 요구한다. 숫자 집합 검사만으로는 부족했다 —
    // 2차 dry-run에서 실제 "5억 2,500만원"을 "6억 2,500만원"으로 쓴 출력이 통과했다.
    // 하필 그 단지가 6층이라 6이 허용 집합에 들어 있었기 때문이다(자릿값을 못 보는 한계).
    const priceText = formatEok(facts.topDeal.price)
    if (!text.includes(priceText)) violations.push(`최고가 금액 불일치(${priceText} 없음)`)
  }

  const allowed = allowedNumbers(facts)
  for (const n of extractNumbers(text)) {
    if (!allowed.has(n)) violations.push(`입력에 없는 숫자: ${n}`)
  }

  // 방향 어휘를 코드가 준 것과 반대로 쓰지 않았는지 — 숫자 검사로는 안 잡히는 실수다
  if (facts.txDiff > 0 && /줄었|감소|적었|덜\s*거래/.test(text)) violations.push('증감 방향 반전(증가인데 감소로 서술)')
  if (facts.txDiff < 0 && /늘었|증가|많아|더\s*거래/.test(text)) violations.push('증감 방향 반전(감소인데 증가로 서술)')

  if (seenOpenings.has(openingSignature)) violations.push(`앞 지역과 개시부 동일: "${openingSignature}"`)

  return { ok: violations.length === 0, violations, openingSignature }
}

/** 쉼표를 지운 뒤 등장하는 모든 정수 */
function extractNumbers(text: string): number[] {
  return (text.replace(/,/g, '').match(/\d+/g) ?? []).map(Number)
}

/**
 * 출력에 등장해도 되는 숫자 집합.
 * 금액은 "N억 M만원" 형태로 쪼개져 나오므로 억/만 단위도 함께 허용한다.
 */
export function allowedNumbers(f: CommentaryFacts): Set<number> {
  const set = new Set<number>([f.txCount, Math.abs(f.txDiff), f.upComplexes, f.downComplexes, 30])
  // periodLabel("8월 25~31일")에 포함된 숫자를 허용
  for (const n of extractNumbers(f.periodLabel)) set.add(n)
  if (f.topDeal) {
    set.add(f.topDeal.price)
    set.add(Math.floor(f.topDeal.price / 10000))
    set.add(f.topDeal.price % 10000)
    set.add(f.topDeal.pyeong)
    if (f.topDeal.floor != null) set.add(f.topDeal.floor)
    // 단지명에 숫자가 들어가는 경우가 흔하다("유니시티1단지", "e편한세상2차")
    for (const n of extractNumbers(f.topDeal.complexName)) set.add(n)
  }
  return set
}

/**
 * 개시부 서명 — 첫 문장 앞 3어절에서 지역명과 숫자를 지운 것.
 * 숫자를 지우는 이유: 지역마다 숫자는 당연히 다른데, 사람이 균일하다고 느끼는 건
 * 숫자를 뺀 **어절 골격**이 같을 때다.
 */
function signatureOf(text: string, facts: CommentaryFacts): string {
  const head = text.split(/(?<=[.!?])\s+/)[0] ?? text
  return head
    .replaceAll(facts.shortLabel, '')
    .replace(/창원시|김해시/g, '')
    .replace(/[\d,]+/g, '#')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// 폴백
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 재시도까지 실패했을 때 내보내는 사람이 쓴 문장.
 * 모델 출력이 없다고 카드를 비우지 않는다 — 숫자는 전부 코드가 박으므로 항상 정확하고,
 * 슬롯 회전은 그대로 타므로 지역끼리 똑같아지지도 않는다.
 */
export function fallbackCommentary(f: CommentaryFacts, slots: CommentarySlots): string {
  // 각 문장은 자기가 개시부일 때만 슬롯이 고른 어구(lead)를 쓰고, 아닐 땐 기본형을 쓴다.
  // 이렇게 해야 폴백끼리도 첫 문장이 겹치지 않는다 — 폴백은 여러 지역에서 동시에 날 수 있다.
  const leads = (id: OpenerId) => (slots.openerId === id ? slots.leadIndex : 0)

  // 어구마다 뒤에 붙는 어미가 달라야 말이 된다("…거래는 32건으로" vs "…에서는 아파트 32건이 거래돼")
  const volume =
    leads('volume') === 1
      ? `${f.shortLabel}의 ${f.periodLabel} 아파트 거래는 ${f.txCount}건으로, ${slots.volumePhrase}.`
      : `${f.periodLabel} ${f.shortLabel}에서는 아파트 ${f.txCount}건이 거래돼 ${slots.volumePhrase}.`
  const breadth =
    leads('breadth') === 1
      ? `최근 30일 변동률로 보면 ${slots.breadthPhrase}.`
      : `최근 30일 변동률 기준으로는 ${slots.breadthPhrase}.`
  const top = topDealText(f)
  const topSentence = !top
    ? null
    : leads('top_deal') === 1
      ? `${f.shortLabel}에서 ${f.periodLabel} 가장 높은 값에 팔린 곳은 ${top}이에요.`
      : `가장 비싼 거래는 ${top}이었어요.`

  const ordered =
    slots.openerId === 'top_deal' && topSentence
      ? [topSentence, volume, breadth]
      : slots.openerId === 'breadth'
        ? [breadth, volume, topSentence]
        : [volume, topSentence, breadth]
  // 3문장 상한이라 topSentence 가 있으면 항상 3문장, 없으면 2문장이 된다

  return ordered.filter((s): s is string => s != null).slice(0, 3).join(' ')
}
