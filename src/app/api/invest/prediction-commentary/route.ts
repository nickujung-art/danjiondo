// ISR Route: revalidate = 604800 (1주일)
export const revalidate = 604800

import Anthropic from '@anthropic-ai/sdk'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl
  const sggCode    = searchParams.get('sgg_code')    ?? ''
  const areaBucket = searchParams.get('area_bucket') ?? ''
  const trend      = searchParams.get('trend')       ?? 'neutral'
  const mape       = parseFloat(searchParams.get('mape') ?? '0')

  // 입력 검증 — allowlist (T-22-03-01)
  const ALLOWED_SGG   = ['48121', '48123', '48125', '48127', '48128', '48129', '48250', '']
  const ALLOWED_AREA  = ['소형', '59', '84', '대형', '']
  const ALLOWED_TREND = ['up', 'down', 'neutral']
  if (!ALLOWED_SGG.includes(sggCode))    return Response.json({ commentary: null }, { status: 400 })
  if (!ALLOWED_AREA.includes(areaBucket)) return Response.json({ commentary: null }, { status: 400 })
  if (!ALLOWED_TREND.includes(trend))    return Response.json({ commentary: null }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ commentary: null })

  try {
    const client = new Anthropic({ apiKey })

    const SGG_LABEL: Record<string, string> = {
      '48121': '창원 의창구',
      '48123': '창원 창원구',
      '48125': '창원 성산구',
      '48127': '창원 마산합포구',
      '48128': '창원 마산회원구',
      '48129': '창원 진해구',
      '48250': '김해시',
    }
    const regionLabel = SGG_LABEL[sggCode] ?? '창원·김해 전체'
    const areaLabel   = areaBucket ? `${areaBucket}㎡` : '전체'
    const trendLabel  = trend === 'up' ? '상승' : trend === 'down' ? '하락' : '보합'
    const mapeLabel   = mape > 0 ? `(평균 오차율 약 ${Math.round(mape * 100)}%)` : ''

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `당신은 한국 부동산 시장 데이터 해설가입니다.
통계 모델 결과를 바탕으로 시장 맥락을 설명합니다.
규칙:
1. 구체적인 가격 숫자(만원, 억원 등)를 절대 언급하지 마세요
2. "오를 것입니다", "내릴 것입니다" 등 단정적 예측 표현 금지
3. 투자 조언 또는 매수/매도 권유 금지
4. 2문장 이내로 간결하게 작성
5. 한국어로만 응답`,
      messages: [{
        role:    'user',
        content: `${regionLabel} ${areaLabel} 아파트 매매 통계 분석 결과:
- 6개월 예측 추세: ${trendLabel} 방향 ${mapeLabel}
- 분석 기간: 최근 24개월 실거래 데이터 기반

위 결과를 바탕으로 시장 상황을 2문장으로 해설해주세요.`,
      }],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : null
    return Response.json({ commentary: text })
  } catch {
    return Response.json({ commentary: null })
  }
}
