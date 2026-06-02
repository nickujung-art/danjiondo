import { GoogleGenerativeAI } from '@google/generative-ai'
import { unstable_cache } from 'next/cache'

interface CommentaryInput {
  label: string
  areaBucket?: string
  changePct: number | null
  direction: 'up' | 'flat' | 'down' | null
  jeonseRatio: number | null
  txCount: number | null
  unsoldCount: number | null
  horizon: number
}

async function callGemini(input: CommentaryInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const areaLabel =
    !input.areaBucket
      ? '전체'
      : input.areaBucket === '소형' || input.areaBucket === '대형'
        ? input.areaBucket
        : `${input.areaBucket}㎡`

  const trend =
    input.changePct != null
      ? `${input.changePct > 0 ? '+' : ''}${input.changePct.toFixed(1)}%`
      : '예측 데이터 없음'

  const prompt = `당신은 부동산 시장 분석가입니다. 아래 데이터를 바탕으로 ${input.label} 아파트(${areaLabel}) 시장 현황을 2~3문장으로 분석해주세요. 투자자가 이해하기 쉽게, 데이터가 말하는 현황과 ${input.horizon}개월 전망을 설명하세요.

데이터:
- AI 예측 ${input.horizon}개월 변화율: ${trend}
- 최근 전세가율: ${input.jeonseRatio != null ? `${input.jeonseRatio.toFixed(1)}%` : '데이터 없음'}
- 최근 거래량: ${input.txCount != null ? `${input.txCount}건` : '데이터 없음'}
- 미분양: ${input.unsoldCount != null ? `${input.unsoldCount.toLocaleString('ko-KR')}세대` : '데이터 없음'}

규칙: 투자 권유 표현 금지. 2~3문장, 한국어, 사실 중심.`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch {
    return null
  }
}

// sggCode + areaBucket 조합으로 24시간 캐시
export function getRegionalCommentary(
  sggCode: string,
  input: CommentaryInput,
): Promise<string | null> {
  return unstable_cache(
    () => callGemini(input),
    ['regional-ai-commentary', sggCode, input.areaBucket ?? 'all'],
    { revalidate: 86400 },
  )()
}
