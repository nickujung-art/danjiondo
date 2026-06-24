import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Google Generative AI SDK mock
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      startChat: vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockResolvedValue({
          stream: (async function* () { yield { text: () => '안녕하세요' } })(),
        }),
      }),
    }),
  })),
}))

// Supabase server client mock (cookies() 없이 인증 통과)
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      }),
    },
  }),
}))

// Supabase admin client mock
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({
    rpc: vi.fn().mockResolvedValue({
      data: [{ content: '테스트 단지 데이터', chunk_type: 'summary' }],
    }),
  }),
}))

// fetch mock for Voyage AI
const mockFetch = vi.fn()
global.fetch = mockFetch as typeof fetch

describe('POST /api/chat/complex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: Array(1024).fill(0.1) }],
      }),
    })
  })

  it('complexId 없으면 400 반환', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '안녕' }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('complexId')
  })

  it('messages 없으면 400 반환', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complexId: 'test-uuid' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('messages가 빈 배열이면 400 반환 (user message 없음)', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complexId: 'test-uuid', messages: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('유효한 요청 시 SSE 스트리밍 응답 반환', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complexId: '00000000-0000-0000-0000-000000000001',
        messages: [{ role: 'user', content: '이 단지 어때요?' }],
      }),
    })
    const res = await POST(req)
    // SSE 응답이면 text/event-stream Content-Type
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('invalid JSON body 시 400 반환', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('Voyage AI를 voyage-4-lite 모델로 호출', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complexId: '00000000-0000-0000-0000-000000000001',
        messages: [{ role: 'user', content: '실거래가 알려줘' }],
      }),
    })
    await POST(req)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.voyageai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('voyage-4-lite'),
      }),
    )
  })

  it('match_complex_embeddings RPC를 target_complex_id로 호출', async () => {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const mockRpc = vi.fn().mockResolvedValue({ data: [] })
    ;(createSupabaseAdminClient as Mock).mockReturnValue({ rpc: mockRpc })

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat/complex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complexId: '00000000-0000-0000-0000-000000000002',
        messages: [{ role: 'user', content: '주차 어때요?' }],
      }),
    })
    await POST(req)
    expect(mockRpc).toHaveBeenCalledWith(
      'match_complex_embeddings',
      expect.objectContaining({ target_complex_id: '00000000-0000-0000-0000-000000000002' }),
    )
  })
})
