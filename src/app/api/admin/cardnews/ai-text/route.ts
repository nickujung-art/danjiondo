import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { z } from 'zod'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  topic: z.string(),
  region: z.string(),
  area: z.string().nullable(),
  period: z.string(),
  ranking: z.array(
    z.object({
      rank: z.number(),
      name: z.string().nullable(),
      price: z.string().nullable(),
    }),
  ),
  options: z.object({
    cover_caption: z.boolean().default(false),
    insight: z.boolean().default(false),
    sns_caption: z.boolean().default(false),
    hashtags: z.boolean().default(false),
    title_mode: z.enum(['ai', 'manual']).default('ai'),
  }),
})

interface AiTextResult {
  title: string | null
  caption: string | null
  insight: string | null
  sns: string | null
  hashtags: string | null
}

const FALLBACK: AiTextResult = {
  title: null,
  caption: null,
  insight: null,
  sns: null,
  hashtags: null,
}

export async function POST(request: Request): Promise<NextResponse> {
  // 어드민 권한 검증 (gps-approve/route.ts 패턴)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (
    !['admin', 'superadmin'].includes(
      (profile as { role: string } | null)?.role ?? '',
    )
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { topic, region, area, period, ranking, options } = parsed.data

  // 숫자는 코드로 계산 후 프롬프트에 주입 (D-03)
  const top3 = ranking
    .slice(0, 3)
    .map((r) => `${r.rank}위. ${r.name ?? '데이터없음'} — ${r.price ?? '-'}`)
    .join('\n')

  const topicLabel: Record<string, string> = {
    sale_top: '매매 최고가',
    jeonse_top: '전세 최고가',
    monthly_top: '월세 최고보증금',
    volume: '거래량',
    value: '평당가 가성비',
    alltime_high: '신고가 경신',
    price_change: '가격 변동률',
    district_champions: '구별 대장단지',
  }

  const prompt = `당신은 창원·김해 부동산 전문 SNS 콘텐츠 작성자입니다. 친근하고 전문적인 한국어로 작성하세요.

지역: ${region}${area ? ` / 전용 ${area}` : ''}
주제: ${topicLabel[topic] ?? topic}
기간: ${period}
TOP 3 데이터:
${top3}

다음 항목을 JSON 형식으로 작성하세요:
${options.title_mode === 'ai' ? '- title: 카드뉴스 제목 (20자 이내)' : ''}
${options.cover_caption ? '- caption: 커버 캡션 (50자 이내, 흥미 유발)' : ''}
${options.insight ? '- insight: 시황 인사이트 (100자 이내, 전문적)' : ''}
${options.sns_caption ? '- sns: SNS 캡션 (150자 이내, 이모지 1개 포함)' : ''}
${options.hashtags ? '- hashtags: 해시태그 5개 (공백으로 구분, # 포함)' : ''}

JSON만 반환 (마크다운 코드 블록 없이)`

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // D-03 LOCKED
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    })

    const raw = res.choices[0]?.message?.content?.trim() ?? ''

    // JSON 파싱 시도 (```json ... ``` 코드 블록 제거 후)
    const cleaned = raw.replace(/^```[a-z]*\n?/m, '').replace(/```$/m, '').trim()
    let parsedResult: AiTextResult = { ...FALLBACK }

    try {
      const json = JSON.parse(cleaned) as Record<string, string | null>
      parsedResult = {
        title: json['title'] ?? null,
        caption: json['caption'] ?? null,
        insight: json['insight'] ?? null,
        sns: json['sns'] ?? null,
        hashtags: json['hashtags'] ?? null,
      }
    } catch {
      // JSON 파싱 실패 시 raw text를 title에 넣음
      parsedResult = { ...FALLBACK, title: raw.slice(0, 50) || null }
    }

    return NextResponse.json({ ...parsedResult, fallback: false })
  } catch {
    // D-05: Groq 실패 시 차단 안 함 — fallback:true 반환, 재시도 버튼만
    return NextResponse.json({ ...FALLBACK, fallback: true })
  }
}
