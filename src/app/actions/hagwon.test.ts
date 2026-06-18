import { describe, it, expect, vi } from 'vitest'

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '루트 기반 맞춤 추천 코멘트입니다. 아이의 일정에 맞게 활용하세요.' } }],
        }),
      },
    },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn().mockReturnValue({
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      order:       vi.fn().mockReturnThis(),
      limit:       vi.fn().mockReturnThis(),
      insert:      vi.fn().mockReturnThis(),
      update:      vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single:      vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
}))

import { recommendHagwons, saveChildProfile, loadChildProfile } from './hagwon'

describe('recommendHagwons', () => {
  it('lat 범위 초과 시 invalid_input 반환', async () => {
    const result = await recommendHagwons({ lat: 91, lng: 128 })
    expect(result).toMatchObject({ error: 'invalid_input' })
  })
  it('lng 범위 초과 시 invalid_input 반환', async () => {
    const result = await recommendHagwons({ lat: 35, lng: 181 })
    expect(result).toMatchObject({ error: 'invalid_input' })
  })
  it('잘못된 ageGroup enum → invalid_input', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await recommendHagwons({ lat: 35, lng: 128, ageGroup: '대학생' as any })
    expect(result).toMatchObject({ error: 'invalid_input' })
  })
  it('후보 없음 → combo.hagwons 빈 배열 + fallback comment', async () => {
    const result = await recommendHagwons({ lat: 35.22, lng: 128.68 })
    expect(result).not.toHaveProperty('error')
    if ('combo' in result) {
      expect(result.combo.hagwons).toHaveLength(0)
      expect(typeof result.comment).toBe('string')
    }
  })
  it('유효 입력 → combo + comment 구조 반환', async () => {
    const result = await recommendHagwons({ lat: 35.22, lng: 128.68, ageGroup: '초등저', subjects: ['math'] })
    expect(result).toHaveProperty('combo')
    expect(result).toHaveProperty('comment')
  })
  it('학교 주소 없음이 오류를 일으키지 않음', async () => {
    const result = await recommendHagwons({
      lat: 35.22, lng: 128.68,
      schoolName: '창원초등학교',
      // schoolAddress 없음 → geocoding 스킵
    })
    expect(result).not.toMatchObject({ error: 'invalid_input' })
  })
})

describe('saveChildProfile', () => {
  it('비로그인 상태 → unauthorized 반환', async () => {
    const result = await saveChildProfile({ nickname: '민준', age_group: '초등저', subject_prefs: [] })
    expect(result).toMatchObject({ error: 'unauthorized' })
  })
  it('nickname 빈 문자열도 비로그인 상태에서 unauthorized 우선', async () => {
    const result = await saveChildProfile({ nickname: '', age_group: '초등저', subject_prefs: [] })
    // auth check가 schema 검증보다 먼저 → 비로그인 시 unauthorized
    expect(result).toMatchObject({ error: 'unauthorized' })
  })
})

describe('loadChildProfile', () => {
  it('비로그인 상태 → null 반환', async () => {
    const result = await loadChildProfile()
    expect(result).toBeNull()
  })
})
