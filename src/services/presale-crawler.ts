// server-only는 생략 — 스크립트에서도 직접 임포트 가능하도록
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import { describeError } from '@/lib/api/describe-error'

export interface CrawledPresaleData {
  builder?: string | null
  contractor?: string | null
  totalUnits?: number | null
  moveInDate?: string | null
  address?: string | null
  summary?: {
    totalFloors?: number | null
    buildings?: number | null
    parkingPerUnit?: number | null
    [key: string]: unknown
  }
  unitTypes?: Array<{
    type: string
    area_m2?: number | null
    units?: number | null
    priceMin?: number | null
    priceMax?: number | null
  }>
  community?: {
    facilities?: string[]
    [key: string]: unknown
  }
}

// HTML에서 가시 텍스트만 추출 (스크립트·스타일 제거)
function extractText(html: string, maxChars = 8000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

/** Groq 무료 티어 모델 — generate-regional-commentary.ts 와 같은 모델을 쓴다 */
const GROQ_MODEL = 'qwen/qwen3.8-27b'
const GEMINI_MODEL = 'gemini-3.6-flash'

/**
 * 분양 사이트 URL에서 사업 개요·평형 타입·커뮤니티 정보를 추출.
 * HTML → 구조화 JSON 변환. 실패 시 null 반환 (호출자가 skip 처리).
 *
 * [왜 Groq 우선인가 — 2026-08-04]
 * 원래 Gemini 전용이었는데 **Gemini 프로젝트가 월 지출 한도를 넘겨 429 를 뱉는 상태**다
 * (같은 날 monthly-ai-commentary 가 1,342건 전량 실패한 것과 같은 원인). 그대로 두면 이
 * 크롤러도 호출하는 족족 실패한다.
 *
 * 저장소의 다른 AI 배치들이 이미 Groq(무료) 우선 / Gemini 폴백 구조라 같은 형태로 맞춘다
 * (generate-complex-commentary.ts, generate-regional-commentary.ts). 키가 하나만 있어도 동작한다.
 */
/**
 * 사업 수치가 실제로 실려 있는 하위 경로. 랜딩에 링크된 것만 따라간다(임의 URL 생성 금지).
 * **순서가 우선순위다** — 토큰 예산이 빠듯해 앞의 것부터 담고 넘치면 버린다.
 * overview(사업개요)·community(커뮤니티 시설)가 정보 밀도가 가장 높다.
 */
const DETAIL_PATH_HINTS = ['overview', 'community', 'plane', 'system', 'deployment']
const MAX_SUBPAGES = 3

/**
 * 프롬프트에 실을 본문 총량(자).
 *
 * Groq 무료 티어는 **분당 토큰(TPM) 6,000**이 상한이고 여기에 출력분(max_tokens)도 포함된다.
 * 하위 페이지를 4개 붙였더니 요청이 6,394 토큰이 되어 413 으로 거절당했다(2026-08-04 실측).
 * 한글은 대략 1자당 1토큰이라 본문 2,800자 + 지시문 약 700 + 출력 1,200 ≈ 4,700 으로 잡는다.
 *
 * 정보가 잘리는 건 감수한다 — 무료 티어에서 정확도와 분량을 동시에 가질 수는 없고,
 * **틀린 값을 채우는 것보다 빈 값이 낫다**(프롬프트가 추측을 금지하고 있다).
 */
const TEXT_BUDGET = 2800
const OUTPUT_TOKENS = 1200

/** 페이지별 상한 — 공통 머리말을 걷어낸 뒤에 적용한다 */
const LANDING_CHARS = 1200
const SUBPAGE_CHARS = 900

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; danjiondo-bot/1.0; +https://danjiondo.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * 여러 페이지에 똑같이 들어가는 머리말(글로벌 네비게이션)을 잘라낸다.
 *
 * [왜 필요한가 — 2026-08-05 실측]
 * 창원 센트럴 아이파크(i-park.com/changwon)에서 하위 페이지를 붙였는데도 totalUnits 가
 * 계속 36(실제 1,509)으로 나왔다. 원문에 값이 없어서가 아니다 — `/overview` 텍스트에
 * "1,509세대"가 분명히 있다. 문제는 **모든 페이지의 앞 400~500자가 동일한 메뉴 목록**
 * ("분양정보 사업개요 분양일정 공급금액 …", 그것도 두 번 반복)이라는 것이다.
 * 하위 페이지 상한이 900자인데 그중 절반을 메뉴가 먹으니 본문이 400자밖에 안 남았고,
 * 총세대수는 그 뒤에 있었다. 모델이나 프롬프트 문제가 아니라 예산 배분 문제였다.
 *
 * 메뉴 문구는 사이트마다 다르므로 하드코딩할 수 없다. 대신 **여러 페이지가 공유하는
 * 접두사는 본문이 아니다**는 성질을 쓴다. 페이지가 1개면 비교 대상이 없어 그대로 둔다.
 */
export function stripCommonPrefix(pages: readonly string[]): string[] {
  if (pages.length < 2) return [...pages]

  const shortest = Math.min(...pages.map((p) => p.length))
  let len = 0
  while (len < shortest && pages.every((p) => p[len] === pages[0]![len])) len++

  // 공통 접두사가 어떤 페이지 전체와 같으면 자르지 않는다. 같은 페이지를 두 번 담았거나
  // 한 페이지가 다른 페이지의 머리말과 완전히 겹치는 경우인데, 여기서 자르면 **본문까지**
  // 사라진다. 아래 lastIndexOf 가 마지막 공백까지 되돌리는 탓에 빈 문자열이 되지 않아
  // 길이 검사만으로는 못 걸러진다("같은 본문 내용" → "내용", 테스트로 확인).
  if (len >= shortest) return [...pages]

  // 단어 중간에서 자르면 남은 조각이 노이즈가 된다. 마지막 공백까지 되돌린다.
  const cut = pages[0]!.slice(0, len).lastIndexOf(' ')
  if (cut <= 0) return [...pages]

  return pages.map((p) => p.slice(cut).trim())
}

/**
 * 랜딩 HTML 에서 **같은 사이트의** 상세 경로만 골라낸다.
 * 외부 도메인·PDF 는 제외한다 — 프롬프트 인젝션 표면을 넓히지 않으려는 것이기도 하다.
 */
export function pickDetailUrls(html: string, sourceUrl: string): string[] {
  let origin: URL
  try {
    origin = new URL(sourceUrl)
  } catch {
    return []
  }

  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1] ?? '')

  // 힌트별로 후보를 모은다. 문서 등장 순서로 훑으면 MAX_SUBPAGES 를 채우는 게
  // 메뉴에 먼저 나온 경로가 되어, 정보 밀도가 높은 overview·community 가 밀려날 수 있다
  // (실측: system 이 먼저 잡혀 plane 이 탈락했다). 힌트 배열 순서를 우선순위로 쓴다.
  const byHint = new Map<string, string[]>(DETAIL_PATH_HINTS.map((h) => [h, []]))
  const seen = new Set<string>()

  for (const href of hrefs) {
    if (!href || href.startsWith('#') || /\.(pdf|css|js|png|jpe?g|gif|ico|svg|webp)/i.test(href)) continue
    let abs: URL
    try {
      abs = new URL(href, origin)
    } catch {
      continue
    }
    if (abs.origin !== origin.origin) continue
    if (abs.href === origin.href) continue
    if (seen.has(abs.href)) continue

    const hint = DETAIL_PATH_HINTS.find((h) => abs.pathname.toLowerCase().includes(h))
    if (!hint) continue
    seen.add(abs.href)
    byHint.get(hint)!.push(abs.href)
  }

  const picked: string[] = []
  for (const hint of DETAIL_PATH_HINTS) {
    for (const url of byHint.get(hint)!) {
      picked.push(url)
      if (picked.length >= MAX_SUBPAGES) return picked
    }
  }
  return picked
}

export async function crawlPresaleSource(sourceUrl: string): Promise<CrawledPresaleData | null> {
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if ((!groqKey && !geminiKey) || !sourceUrl) return null

  const html = await fetchText(sourceUrl)
  if (!html) return null

  /**
   * [왜 하위 페이지까지 읽나 — 2026-08-04]
   * 랜딩만 긁었더니 **마케팅 문구와 메뉴 목록만** 잡혔다. 실측(창원 센트럴 아이파크):
   *   totalUnits 36  ← 실제 1,509세대
   *   community.facilities = [가음산공원, 창원광장, 시민생활체육관]
   *     ← 커뮤니티 시설이 아니라 **주변 입지**다. "풍부하고 쾌적한 자연과 휴식 공간" 문단에서
   *       끌어온 것 — 모델 잘못이 아니라 원본에 커뮤니티 정보가 아예 없어서 비슷한 걸 가져온 것이다.
   * 분양 사이트는 수치가 /overview·/community·/plane 같은 하위 경로에 흩어져 있다.
   * 랜딩에 실제로 링크된 것만 따라간다 — 경로를 유추해 만들면 없는 페이지를 두드리게 된다.
   */
  const detailUrls = pickDetailUrls(html, sourceUrl)

  // 페이지별 상한을 **공통 머리말을 걷어낸 뒤에** 적용한다. 순서를 반대로 하면 상한이
  // 메뉴에 소진돼 정작 필요한 수치가 잘려 나간다(stripCommonPrefix 주석 참고).
  const rawPages = [extractText(html)]
  for (const url of detailUrls) {
    const sub = await fetchText(url)
    if (sub) rawPages.push(extractText(sub))
  }
  const pages = stripCommonPrefix(rawPages).map((p, i) =>
    p.slice(0, i === 0 ? LANDING_CHARS : SUBPAGE_CHARS),
  )

  // 합친 뒤 한 번 더 자른다 — 페이지별 상한만으로는 총량이 예산을 넘을 수 있다
  const text = pages
    .filter((p) => p.length > 0)
    .join('\n\n---\n\n')
    .slice(0, TEXT_BUDGET)
  if (text.length < 50) return null

  // 프롬프트 인젝션 방지: [페이지텍스트] 구분자 사용
  const instructions = `다음은 분양 아파트 공식 사이트의 텍스트입니다. 구조화된 정보를 JSON으로 추출하세요.

**추출 규칙 (반드시 지킬 것)**
- 텍스트에 **명시적으로 적혀 있는 값만** 쓰세요. 추정·계산·유추 금지.
- 확실하지 않으면 반드시 null. 비슷해 보이는 값으로 채우지 마세요.
- totalUnits 는 **단지 전체 세대수**입니다. 특정 타입·특별공급 세대수를 여기에 넣지 마세요.
- community.facilities 는 **단지 안에 있는 커뮤니티 시설**만(피트니스·독서실·수영장 등).
  공원·광장·학교·역·백화점처럼 **단지 밖 주변 시설은 절대 넣지 마세요**.
- 없는 항목은 빈 배열이나 null 로 두고, 지어내지 마세요.
- **community.facilities 는 시설 이름만 담은 문자열 배열**입니다. 객체로 만들지 말고
  설명을 덧붙이지 마세요. 예: ["피트니스", "실내골프연습장"]
- unitTypes 의 각 항목은 type·area_m2·units·priceMin·priceMax 만 씁니다. 다른 키 금지.
- 전체 응답은 2,000자를 넘기지 마세요.

**필드 뜻**
- builder 시공사명 / contractor 시행사명 / totalUnits 단지 전체 세대수(숫자)
- moveInDate 입주 예정 시기를 적힌 그대로(문자열) / address 사업지 주소
- summary.totalFloors 최고층수 / summary.buildings 총동수 / summary.parkingPerUnit 세대당 주차대수
- unitTypes[].area_m2 전용면적 / units 해당 타입 세대수 / priceMin·priceMax 분양가(만원)

반환 형식 (JSON만, 마크다운 코드블록 없이). **아래 null 은 형태 예시일 뿐이니
값을 찾았으면 채우고, 못 찾았으면 null 그대로 두세요. 이 지시문의 글자를 값으로
복사하지 마세요.**
{
  "builder": null,
  "contractor": null,
  "totalUnits": null,
  "moveInDate": null,
  "address": null,
  "summary": { "totalFloors": null, "buildings": null, "parkingPerUnit": null },
  "unitTypes": [{ "type": null, "area_m2": null, "units": null, "priceMin": null, "priceMax": null }],
  "community": { "facilities": [] }
}

[페이지텍스트]`

  const prompt = `${instructions}
${text}
[페이지텍스트 끝]`

  // Groq(무료) 우선, 실패하면 Gemini 폴백. 둘 다 안 되면 null — 호출부가 skip 한다.
  if (groqKey) {
    const raw = await runGroq(groqKey, prompt)
    const parsed = parseJsonResponse(raw)
    if (parsed) return cleanFacilities(stripInstructionEcho(parsed, instructions))
  }

  if (geminiKey) {
    const raw = await runGemini(geminiKey, prompt)
    const parsed = parseJsonResponse(raw)
    if (parsed) return cleanFacilities(stripInstructionEcho(parsed, instructions))
  }

  return null
}

async function runGroq(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const groq = new Groq({ apiKey })
    const res = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: OUTPUT_TOKENS,
      // 모델이 설명 문장을 덧붙이지 않고 JSON 만 뱉게 강제한다(classify-hagwon-groq.ts 와 동일)
      response_format: { type: 'json_object' },
    })
    return res.choices[0]?.message?.content ?? null
  } catch (err) {
    // 사유를 남긴다 — 조용히 null 을 돌려주면 "크롤 실패"와 "데이터 없음"이 구분되지 않아
    // 호출부가 원인을 영원히 모른다(2026-08-04, 같은 패턴을 이 저장소에서 여러 건 고쳤다).
    console.warn(`[presale-crawler] Groq 실패: ${describeError(err)}`)
    return null
  }
}

async function runGemini(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (err) {
    console.warn(`[presale-crawler] Gemini 실패: ${describeError(err)}`)
    return null
  }
}

/**
 * 모델이 **지시문 자체를 값으로 베껴 넣은 경우**를 걸러낸다.
 *
 * 실측(2026-08-05): moveInDate 에 `"입주 예정 텍스트 (예: 2027년 상반기)"` 가 들어왔다.
 * 페이지에 입주 시기가 없자 반환 형식에 적어둔 설명문을 그대로 복사한 것이다. 그대로
 * 저장되면 화면에 지시문이 노출된다. 프롬프트에서 예시를 걷어냈지만(값 자리를 전부 null 로
 * 바꿨다) 모델이 언제든 다시 할 수 있는 실수라 파싱 쪽에도 방어를 둔다.
 *
 * 판정 기준은 "지시문 블록에 그대로 들어 있는 문자열인가"다. 정상 값은 [페이지텍스트]
 * 구간에서 오므로 지시문에는 없다. 짧은 문자열은 우연히 겹칠 수 있어 4자 미만은 건드리지
 * 않는다("HDC" 같은 값을 잃지 않기 위해서다).
 */
export function stripInstructionEcho<T>(value: T, instructions: string): T {
  const MIN_LEN = 4
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return v.length >= MIN_LEN && instructions.includes(v) ? null : v
    }
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== null)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]))
    }
    return v
  }
  return walk(value) as T
}

/**
 * 시설명 자리에 들어온 마케팅 문구를 걷어낸다.
 *
 * 실측(2026-08-05): `["어린이집", "시니어라운지", "근린생활시설",
 * "특별한 순간들로 즐거움을 더하는 커뮤니티 시설"]`. 앞의 둘은 맞고 뒤의 둘은 아니다.
 * 프롬프트가 이미 "시설 이름만"이라고 못박고 있는데도 홍보 문구가 섞여 들어온다.
 *
 * 실제 커뮤니티 시설명은 짧다 — "피트니스센터"(6자) "실내골프연습장"(7자)
 * "게스트하우스"(6자). 반면 마케팅 문구에는 조사와 서술어가 들어가 길어진다.
 * 길이만으로 거의 다 갈리므로 규칙을 하나만 둔다. 시설명은 15자를 넘지 않는다.
 * "근린생활시설"처럼 시설이 아니라 용도 분류인 값은 이 규칙으로 못 거르지만,
 * 그건 원문 표기 자체라 지어낸 값은 아니다 — 무리해서 거르지 않는다.
 */
const MAX_FACILITY_NAME_LEN = 15

export function cleanFacilities(data: CrawledPresaleData): CrawledPresaleData {
  const facilities = data.community?.facilities
  if (!Array.isArray(facilities)) return data
  const cleaned = facilities.filter(
    (f) => typeof f === 'string' && f.trim().length > 0 && f.trim().length <= MAX_FACILITY_NAME_LEN,
  )
  return { ...data, community: { ...data.community, facilities: cleaned } }
}

/** 마크다운 코드블록·앞뒤 설명이 섞여 와도 첫 JSON 객체만 꺼낸다. 파싱 실패는 null. */
function parseJsonResponse(raw: string | null): CrawledPresaleData | null {
  if (!raw) return null
  const cleaned = raw.replace(/```json\n?|```/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as CrawledPresaleData
  } catch {
    return null
  }
}
