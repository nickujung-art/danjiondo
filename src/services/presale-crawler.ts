// server-only는 생략 — 스크립트에서도 직접 임포트 가능하도록
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

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
export async function crawlPresaleSource(sourceUrl: string): Promise<CrawledPresaleData | null> {
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if ((!groqKey && !geminiKey) || !sourceUrl) return null

  let html: string
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; danjiondo-bot/1.0; +https://danjiondo.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    html = await res.text()
  } catch {
    return null
  }

  const text = extractText(html)
  if (text.length < 50) return null

  // 프롬프트 인젝션 방지: [페이지텍스트] 구분자 사용
  const prompt = `다음은 분양 아파트 공식 사이트의 텍스트입니다. 구조화된 정보를 JSON으로 추출하세요.
없는 정보는 null로 표기하세요.

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
      max_tokens: 1500,
      // 모델이 설명 문장을 덧붙이지 않고 JSON 만 뱉게 강제한다(classify-hagwon-groq.ts 와 동일)
      response_format: { type: 'json_object' },
    })
    return res.choices[0]?.message?.content ?? null
  } catch {
    return null
  }
}

async function runGemini(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch {
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
