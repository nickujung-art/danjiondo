// server-only는 생략 — 스크립트에서도 직접 임포트 가능하도록
import { GoogleGenerativeAI } from '@google/generative-ai'

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

/**
 * 분양 사이트 URL에서 사업 개요·평형 타입·커뮤니티 정보를 추출.
 * Gemini flash로 HTML → 구조화 JSON 변환.
 * 실패 시 null 반환 (호출자가 skip 처리).
 */
export async function crawlPresaleSource(sourceUrl: string): Promise<CrawledPresaleData | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey || !sourceUrl) return null

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

  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

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

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text().replace(/```json\n?|```/g, '').trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as CrawledPresaleData
  } catch {
    return null
  }
}
