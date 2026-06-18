'use server'

import { z } from 'zod'
import Groq from 'groq-sdk'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fetchHagwonRecommendations, fetchChildProfile } from '@/lib/data/hagwon-recommend'
import type { HagwonResult, AgeGroup, SubjectCategory, FeeTier } from '@/services/neis-hagwon'

// ── 입력 검증 스키마 (HAGWON-06 + 보안 T-28-10) ────────────────────────────
const RecommendSchema = z.object({
  lat:         z.number().min(-90).max(90),
  lng:         z.number().min(-180).max(180),
  ageGroup:    z.enum(['유아','유치','초등저','초등고','중등','고등']).optional(),
  subjects:    z.array(z.enum(['academic','arts','sports','language'])).optional(),
  feeTierPref: z.enum(['premium','standard','budget']).nullable().optional(),
})

const ChildProfileSchema = z.object({
  nickname:      z.string().min(1).max(20),
  age_group:     z.enum(['유아','유치','초등저','초등고','중등','고등']),
  subject_prefs: z.array(z.string()).max(5),
  fee_tier_pref: z.enum(['premium','standard','budget']).nullable().optional(),
})

// ── Groq 코멘트 생성 (HAGWON-09) ──────────────────────────────────────────
const FALLBACK_COMMENT = '추천 학원 목록을 확인해보세요. 거리, 인기도, 수강료를 종합하여 선별한 학원들입니다.'

async function generateHagwonComment(
  results: HagwonResult[],
  ageGroup?: AgeGroup,
): Promise<string> {
  if (!process.env.GROQ_API_KEY || results.length === 0) return FALLBACK_COMMENT
  const topNames = results.slice(0, 3).map(r => r.name).join(', ')
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  try {
    const res = await groq.chat.completions.create({
      model:       'llama-3.1-8b-instant',
      messages:    [{
        role:    'user',
        content: `아파트 단지 근처 추천 학원 목록입니다.\n학원: ${topNames}\n대상 연령: ${ageGroup ?? '전체'}\n\n이 학원들에 대해 학부모에게 도움이 되는 3~4문장 한국어 코멘트를 작성하세요. 숫자(가격, 거리)를 포함하지 마세요.`,
      }],
      max_tokens:  200,
      temperature: 0.5,
    })
    return res.choices[0]?.message?.content?.trim() ?? FALLBACK_COMMENT
  } catch {
    return FALLBACK_COMMENT
  }
}

// ── recommendHagwons (HAGWON-06, HAGWON-09) ──────────────────────────────
export async function recommendHagwons(input: {
  lat: number; lng: number
  ageGroup?: AgeGroup; subjects?: SubjectCategory[]
  feeTierPref?: FeeTier | null
}): Promise<{ results: HagwonResult[]; comment: string } | { error: string }> {
  const parsed = RecommendSchema.safeParse(input)
  if (!parsed.success) return { error: 'invalid_input' }

  const supabase = await createSupabaseServerClient()
  const results  = await fetchHagwonRecommendations(supabase, parsed.data)
  const comment  = await generateHagwonComment(results, parsed.data.ageGroup as AgeGroup | undefined)

  return { results, comment }
}

// ── saveChildProfile (HAGWON-07) ────────────────────────────────────────
export async function saveChildProfile(input: {
  nickname: string; age_group: AgeGroup
  subject_prefs: string[]; fee_tier_pref?: FeeTier | null
}): Promise<{ ok: true; id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' }

  const parsed = ChildProfileSchema.safeParse(input)
  if (!parsed.success) return { error: 'invalid_input' }

  const existing = await fetchChildProfile(supabase, user.id)
  if (existing) {
    const { error } = await supabase.from('user_child_profiles')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: error.message }
    return { ok: true, id: existing.id }
  }

  const { data, error } = await supabase.from('user_child_profiles')
    .insert({ user_id: user.id, ...parsed.data })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { ok: true, id: data.id }
}

// ── loadChildProfile (HAGWON-07) ────────────────────────────────────────
export async function loadChildProfile(): Promise<{
  nickname: string; age_group: AgeGroup
  subject_prefs: string[]; fee_tier_pref: FeeTier | null
} | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const profile = await fetchChildProfile(supabase, user.id)
  if (!profile) return null
  return {
    nickname:      profile.nickname,
    age_group:     profile.age_group,
    subject_prefs: profile.subject_prefs,
    fee_tier_pref: profile.fee_tier_pref,
  }
}
