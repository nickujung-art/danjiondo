'use server'

import { z } from 'zod'
import Groq from 'groq-sdk'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fetchHagwonCandidates, fetchChildProfile } from '@/lib/data/hagwon-recommend'
import {
  individualScore,
  selectBestCombo,
  type ScoredCandidate,
  type ComboResult,
} from '@/lib/hagwon-route'
import type { AgeGroup, SubjectCategory, FeeTier } from '@/services/neis-hagwon'
import { SUBJECT_LABELS, FEE_LABELS } from '@/services/neis-hagwon'

// ── 입력 검증 스키마 ──────────────────────────────────────────────────────────
const SUBJECT_ENUM  = ['exam_prep','korean','math','english','arts','sports','other_language'] as const
const FEE_TIER_ENUM = ['premium','standard','budget'] as const
const AGE_ENUM      = ['유아','유치','초등저','초등고','중등','고등'] as const

const RecommendSchema = z.object({
  lat:           z.number().min(-90).max(90),
  lng:           z.number().min(-180).max(180),
  ageGroup:      z.enum(AGE_ENUM).optional(),
  subjects:      z.array(z.enum(SUBJECT_ENUM)).optional(),
  feeTierPref:   z.array(z.enum(FEE_TIER_ENUM)).optional(),
  schoolAddress: z.string().max(200).optional(),
  schoolName:    z.string().max(60).optional(),
})

const ChildProfileSchema = z.object({
  nickname:      z.string().min(1).max(20),
  age_group:     z.enum(AGE_ENUM),
  subject_prefs: z.array(z.string()).max(5),
  fee_tier_pref: z.array(z.enum(FEE_TIER_ENUM)).optional(),
})

// ── Kakao 주소 → 좌표 (학교 geocoding) ───────────────────────────────────────
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
    url.searchParams.set('query', address)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const json = await res.json() as { documents?: Array<{ x: string; y: string }> }
    const doc = json.documents?.[0]
    if (!doc) return null
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
  } catch {
    return null
  }
}

// ── Groq 루트 코멘트 생성 ────────────────────────────────────────────────────
const FALLBACK_COMMENT = '거리, 인기도, 수강료, 경로 효율성을 종합하여 선별한 학원입니다. 아이의 일정에 맞게 활용해 보세요.'

async function generateRouteComment(
  combo:    ComboResult,
  input:    { ageGroup?: string; schoolName?: string },
): Promise<string> {
  if (!process.env.GROQ_API_KEY || combo.hagwons.length === 0) return FALLBACK_COMMENT

  const routeText = combo.route
    .map((s, i) => i === combo.route.length - 1 ? s.label : `${s.label}(${Math.round(s.distToNext)}m)`)
    .join(' → ')

  const hagwonDesc = combo.hagwons.map(h =>
    [
      h.subject ? `[${SUBJECT_LABELS[h.subject as SubjectCategory] ?? h.subject}]` : null,
      h.name,
      h.realm_sc_nm ? `(${h.realm_sc_nm})` : null,
      h.fee_tier ? FEE_LABELS[h.fee_tier as FeeTier] : null,
    ].filter(Boolean).join(' ')
  ).join(' / ')

  const prompt =
    `자녀 연령: ${input.ageGroup ?? '미선택'}` +
    (input.schoolName ? `\n학교: ${input.schoolName}` : '') +
    `\n추천 루트: ${routeText} (총 ${(combo.totalRouteDist / 1000).toFixed(1)}km)` +
    `\n추천 학원: ${hagwonDesc}` +
    `\n\n위 등원 루트와 학원들에 대해 학부모에게 실질적인 도움이 되는 한국어 코멘트를 3~4문장으로 작성하세요. ` +
    `루트의 효율성과 각 학원의 특징을 언급하세요. 정확한 수치(가격·거리·숫자)는 포함하지 마세요.`

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  try {
    const res = await groq.chat.completions.create({
      model:       'llama-3.1-8b-instant',
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  250,
      temperature: 0.5,
    })
    return res.choices[0]?.message?.content?.trim() ?? FALLBACK_COMMENT
  } catch {
    return FALLBACK_COMMENT
  }
}

// ── recommendHagwons ─────────────────────────────────────────────────────────
export type RecommendResult =
  | { combo: ComboResult; comment: string }
  | { error: string }

export async function recommendHagwons(input: {
  lat: number; lng: number
  ageGroup?:     AgeGroup
  subjects?:     SubjectCategory[]
  feeTierPref?:  FeeTier[]
  schoolAddress?: string
  schoolName?:   string
}): Promise<RecommendResult> {
  const parsed = RecommendSchema.safeParse(input)
  if (!parsed.success) return { error: 'invalid_input' }

  // 비인증 사용자 차단 (Groq·Kakao API 비용 보호)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' }

  const { lat, lng, ageGroup, subjects, feeTierPref, schoolAddress, schoolName } = parsed.data

  // 1. 학교 geocoding (선택된 경우)
  let schoolLat: number | undefined, schoolLng: number | undefined
  if (schoolAddress) {
    const geo = await geocodeAddress(schoolAddress)
    if (geo) { schoolLat = geo.lat; schoolLng = geo.lng }
  }

  // 2. 과목별 병렬 후보 조회 (과목 미선택 시 전체 조회)
  const targetSubjects: Array<SubjectCategory | undefined> =
    subjects && subjects.length > 0 ? subjects : [undefined]

  // supabase는 위에서 생성한 것 재사용 (중복 생성 방지)

  const perSubjectRaw = await Promise.all(
    targetSubjects.map(subject =>
      fetchHagwonCandidates(supabase, {
        homeLat:   lat,
        homeLng:   lng,
        schoolLat, schoolLng,
        ageGroup,
        subject,
        limit: 20,
      })
    )
  )

  // 3. 개별 점수 계산 → 과목별 Top-5
  const feeTiers = (feeTierPref ?? []) as FeeTier[]

  const perSubjectScored: ScoredCandidate[][] = perSubjectRaw.map((candidates, si) =>
    candidates
      .map(h => ({
        ...h,
        subject: (targetSubjects[si] ?? null) as SubjectCategory | null,
        individual_score: individualScore(
          h, lat, lng, feeTiers, ageGroup, schoolLat, schoolLng,
        ),
      }))
      .sort((a, b) => b.individual_score - a.individual_score)
      .slice(0, 5)
  ).filter(arr => arr.length > 0)

  if (perSubjectScored.length === 0) {
    return { combo: { hagwons: [], visitOrder: [], route: [], totalRouteDist: 0 }, comment: FALLBACK_COMMENT }
  }

  // 4. 루트 최적화 (Greedy TSP + 콤보 선택)
  const combo = selectBestCombo(perSubjectScored, lat, lng, schoolLat, schoolLng, schoolName)

  // 5. Groq 루트 코멘트
  const comment = await generateRouteComment(combo, { ageGroup, schoolName })

  return { combo, comment }
}

// ── saveChildProfile ─────────────────────────────────────────────────────────
export async function saveChildProfile(input: {
  nickname:      string
  age_group:     AgeGroup
  subject_prefs: string[]
  fee_tier_pref?: FeeTier[]
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

// ── loadChildProfile ─────────────────────────────────────────────────────────
export async function loadChildProfile(): Promise<{
  nickname:      string
  age_group:     AgeGroup
  subject_prefs: string[]
  fee_tier_pref: FeeTier[]
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
    fee_tier_pref: (profile.fee_tier_pref as FeeTier[] | null) ?? [],
  }
}
