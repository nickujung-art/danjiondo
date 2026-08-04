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
const GROQ_MODEL = 'llama-3.1-8b-instant'
const GEMINI_MODEL = 'gemini-2.0-flash'

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
  const seen = new Set<string>()
  const picked: string[] = []

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
    if (!DETAIL_PATH_HINTS.some((hint) => abs.pathname.toLowerCase().includes(hint))) continue
    if (seen.has(abs.href)) continue
    seen.add(abs.href)
    picked.push(abs.href)
    if (picked.length >= MAX_SUBPAGES) break
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
  const pages = [extractText(html, 1200)]
  for (const url of detailUrls) {
    const sub = await fetchText(url)
    if (sub) pages.push(extractText(sub, 900))
  }

  // 합친 뒤 한 번 더 자른다 — 페이지별 상한만으로는 총량이 예산을 넘을 수 있다
  const text = pages
    .filter((p) => p.length > 0)
    .join('\n\n---\n\n')
    .slice(0, TEXT_BUDGET)
  if (text.length < 50) return null

  // 프롬프트 인젝션 방지: [페이지텍스트] 구분자 사용
  const prompt = `다음은 분양 아파트 공식 사이트의 텍스트입니다. 구조화된 정보를 JSON으로 추출하세요.

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

반환 형식 (JSON만, 마크다운 코드블록 없이):
{
  "builder": "시공사명 또는 null",
  "contractor": "시행사명 또는 null",
  "totalUnits": 총세대수_숫자_또는_null,
  "moveInDate": "입주 예정 텍스트 (예: 2027년 상반기) 또는 null",
  "address": "주소 또는 null",
  "summary": {
    "totalFloors": 최고층수_숫자_또는_null,
    "buildings": 총동수_숫자_또는_null,
    "parkingPerUnit": 세대당주차대수_숫자_또는_null
  },
  "unitTypes": [
    { "type": "타입명", "area_m2": 전용면적_숫자_또는_null, "units": 세대수_숫자_또는_null, "priceMin": 최저분양가_만원_또는_null, "priceMax": 최고분양가_만원_또는_null }
  ],
  "community": {
    "facilities": ["시설명1", "시설명2"]
  }
}

[페이지텍스트]
${text}
[페이지텍스트 끝]`

  // Groq(무료) 우선, 실패하면 Gemini 폴백. 둘 다 안 되면 null — 호출부가 skip 한다.
  if (groqKey) {
    const text = await runGroq(groqKey, prompt)
    const parsed = parseJsonResponse(text)
    if (parsed) return parsed
  }

  if (geminiKey) {
    const text = await runGemini(geminiKey, prompt)
    const parsed = parseJsonResponse(text)
    if (parsed) return parsed
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
