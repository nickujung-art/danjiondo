import { describe, it, vi } from 'vitest'

// HAGWON-09: Groq 코멘트 생성 테스트 (vi.mock groq-sdk)
// Wave 4 (28-04)에서 실제 구현 후 채워짐
vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '테스트 코멘트 문장1. 문장2. 문장3.' } }],
        }),
      },
    },
  })),
}))

describe('generateHagwonComment', () => {
  it.todo('returns 3-4 sentence Korean comment')
  it.todo('handles Groq API error gracefully with fallback message')
  it.todo('includes hagwon names in comment context')
})

describe('recommendHagwons action', () => {
  it.todo('validates lat range -90 to 90')
  it.todo('validates lng range -180 to 180')
  it.todo('validates ageGroup enum values')
})
