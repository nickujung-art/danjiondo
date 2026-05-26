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
      systemInstruction: `당신은 부동산 단지 정보 안내 도우미입니다. 아래 단지 데이터를 바탕으로 질문에 답하세요. 데이터에 없는 내용은 솔직하게 "해당 정보는 데이터에 없습니다"라고 답하세요. 투자 조언은 하지 마세요.\n\n[단지 데이터]\n${context || '(데이터 없음)'}`,
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
