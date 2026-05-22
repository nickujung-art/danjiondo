import 'server-only'
import { GoogleGenerativeAI } from '@google/generative-ai'

// T-8-02: NAVER_CLIENT_ID/SECRET는 서버 전용. 클라이언트에서 절대 호출 금지.
const CAFE_SEARCH_URL = 'https://openapi.naver.com/v1/search/cafearticle.json'

export interface CafePost {
  title:    string
  contents: string
  url:      string
  datetime: string
  cafeName: string
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
}

function toIso(pubDate: string): string | null {
  try {
    const d = new Date(pubDate)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch {
    return null
  }
}

export async function searchCafePosts(
  query: string,
  size = 10,
): Promise<CafePost[]> {
  const url = new URL(CAFE_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('sort', 'date')
  url.searchParams.set('display', String(Math.min(size, 100)))

  const res = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id':     process.env.NAVER_CLIENT_ID     ?? '',
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET ?? '',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Naver cafe search HTTP ${res.status}`)

  const json = (await res.json()) as {
    items: Array<{
      title:    string
      link:     string
      description: string
      cafename: string
      pubDate:  string
    }>
  }

  return (json.items ?? []).map(d => ({
    title:    stripHtml(d.title),
    contents: stripHtml(d.description),
    url:      d.link,
    datetime: toIso(d.pubDate) ?? new Date().toISOString(),
    cafeName: d.cafename,
  }))
}

export interface CafeArticleItem {
  articleId:   string   // item.link (naver_article_id)
  title:       string
  description: string
  cafeName:    string
  articleUrl:  string
  publishedAt: string   // ISO 8601
}

export async function searchCafeArticles(
  query: string,
  size = 100,
): Promise<CafeArticleItem[]> {
  const url = new URL(CAFE_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('sort', 'date')
  url.searchParams.set('display', String(Math.min(size, 100)))

  const res = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id':     process.env.NAVER_CLIENT_ID     ?? '',
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET ?? '',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Naver cafe articles HTTP ${res.status}`)

  const json = (await res.json()) as {
    items: Array<{
      title:       string
      link:        string
      description: string
      cafename:    string
      pubDate:     string
    }>
  }

  return (json.items ?? []).map(d => ({
    articleId:   d.link,
    title:       stripHtml(d.title),
    description: stripHtml(d.description),
    cafeName:    d.cafename,
    articleUrl:  d.link,
    publishedAt: toIso(d.pubDate) ?? new Date().toISOString(),
  }))
}

/**
 * T-8-03: Gemini 프롬프트 인젝션 방지
 * 카페 글 내용을 [텍스트]...[텍스트 끝] 구분자로 반드시 감싼다.
 */
export async function extractComplexNames(text: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return []
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction:
      '한국 부동산 텍스트에서 아파트 단지명과 지역명(구/동)을 추출하세요. 응답은 반드시 JSON: {"complexes": ["단지명1"], "region": "창원 성산구"}. 없으면 빈 문자열/배열.',
  })

  // 프롬프트 인젝션 방지: [텍스트] 구분자 사용 (T-8-03)
  const safeText = text.slice(0, 500)
  const prompt = `다음 텍스트에서 아파트 단지명을 추출하세요:\n[텍스트]\n${safeText}\n[텍스트 끝]`

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text().replace(/```json\n?|```/g, '').trim()
    const parsed = JSON.parse(raw) as { complexes: string[] }
    return Array.isArray(parsed.complexes) ? parsed.complexes : []
  } catch {
    return []
  }
}
