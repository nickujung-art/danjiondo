import { describe, it, expect, vi } from 'vitest'

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '문장1. 문장2. 문장3. 문장4.' } }],
        }),
      },
    },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn().mockReturnValue({
      select:     vi.fn().mockReturnThis(),
      eq:         vi.fn().mockReturnThis(),
      order:      vi.fn().mockReturnThis(),
      limit:      vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
}))

import { recommendHagwons, saveChildProfile, loadChildProfile } from './hagwon'

describe('recommendHagwons', () => {
  it('validates lat range -90 to 90', async () => {
    const result = await recommendHagwons({ lat: 91, lng: 128 })
    expect(result).toMatchObject({ error: 'invalid_input' })
  })
  it('validates lng range -180 to 180', async () => {
    const result = await recommendHagwons({ lat: 35, lng: 181 })
    expect(result).toMatchObject({ error: 'invalid_input' })
  })
  it('validates ageGroup enum values', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await recommendHagwons({ lat: 35, lng: 128, ageGroup: '대학생' as any })
    expect(result).toMatchObject({ error: 'invalid_input' })
  })
  it('returns results and comment for valid input', async () => {
    const result = await recommendHagwons({ lat: 35.22, lng: 128.68 })
    expect(result).toHaveProperty('results')
    expect(result).toHaveProperty('comment')
  })
})

describe('saveChildProfile', () => {
  it('returns unauthorized for non-logged-in user', async () => {
    const result = await saveChildProfile({ nickname: '민준', age_group: '초등저', subject_prefs: [] })
    expect(result).toMatchObject({ error: 'unauthorized' })
  })
})

describe('loadChildProfile', () => {
  it('returns null for non-logged-in user', async () => {
    const result = await loadChildProfile()
    expect(result).toBeNull()
  })
})
