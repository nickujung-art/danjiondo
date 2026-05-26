import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function embedQuery(text: string): Promise<number[]> {
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ input: [text], model: 'voyage-4-lite', input_type: 'query' }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    return json.data?.[0]?.embedding ?? []
  } catch {
    return []
  }
}

export async function POST(request: Request): Promise<Response> {
  // 인증 확인 — 미로그인 사용자의 Voyage AI + Claude API 무제한 소모 방지
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const complexId = typeof b.complexId === 'string' ? b.complexId : null
  const contextData = typeof b.contextData === 'string' ? b.contextData : null
  const messages = Array.isArray(b.messages)
    ? (b.messages as Array<{ role: string; content: string }>)
    : null

  if (!complexId || !messages) {
    return NextResponse.json({ error: 'complexId and messages required' }, { status: 400 })
  }

  // 마지막 user 메시지 추출
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  if (!lastUserMsg) {
    return NextResponse.json({ error: 'no user message' }, { status: 400 })
  }

  // contextData(페이지 데이터 직접 전달)가 있으면 Voyage AI + pgvector 스킵
  let context = contextData ?? ''
  if (!context) {
    try {
      const queryEmbedding = await embedQuery(lastUserMsg)
      if (queryEmbedding.length > 0) {
        const adminClient = createSupabaseAdminClient()
        const { data: chunks } = await (adminClient as unknown as {
          rpc: (fn: string, args: { query_embedding: number[]; target_complex_id: string; match_count: number }) =>
            Promise<{ data: Array<{ chunk_type: string; content: string; similarity: number }> | null }>
        }).rpc('match_complex_embeddings', {
          query_embedding: queryEmbedding,
          target_complex_id: complexId,
          match_count: 3,
        })
        context = (chunks ?? []).map(c => c.content).join('\n\n')
      }
    } catch {
      // 임베딩/검색 실패 시 context 없이 진행
    }
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-lite-latest',
      systemInstruction: `당신은 10년 경력의 부동산 전문 컨설턴트입니다. 아래 [단지 데이터]를 분석해 전문가 관점에서 답변하세요.

답변 원칙:
- 수치를 나열하지 말고 수치가 의미하는 바를 해석하세요
- 지역 평균·중간값 대비 이 단지의 위치를 비교하세요
- 가격 흐름은 방향성·속도·거래량으로 판단하세요 (예: "3개월 연속 상승세", "거래량 감소 속 가격 유지")
- 결론을 먼저 말하고 근거를 덧붙이세요
- 4~6문장 내외로 핵심만 담되 중요한 수치는 인용하세요
- 매수·매도 권유는 하지 않되 객관적 분석은 충분히 하세요
- 데이터에 없는 내용은 짧게 "해당 정보는 데이터에 없습니다"라고만 하세요

[단지 데이터]
${context || '(데이터 없음)'}`,
    })

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const chat = model.startChat({ history })

    const result = await chat.sendMessageStream(lastUserMsg)

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
