'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface SubmitReviewInput {
  complexId: string
  content:   string
  rating:    number
}

export async function submitReview(
  input: SubmitReviewInput,
): Promise<{ error: string | null }> {
  const { complexId, content, rating } = input

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  if (content.length < 10 || content.length > 500) {
    return { error: '후기는 10자 이상 500자 이하로 작성해주세요.' }
  }
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { error: '평점은 1~5 사이의 정수여야 합니다.' }
  }

  const { error } = await supabase.from('complex_reviews').insert({
    complex_id: complexId,
    user_id:    user.id,
    content:    content.trim(),
    rating,
  })

  if (error) return { error: error.message }
  revalidatePath(`/complexes/${complexId}`)
  return { error: null }
}

export async function deleteReview(
  reviewId: string,
  complexId: string,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase
    .from('complex_reviews')
    .delete()
    .eq('id', reviewId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/complexes/${complexId}`)
  return { error: null }
}

export async function verifyGpsForReview(
  reviewId:  string,
  complexId: string,
  lat:       number,
  lng:       number,
): Promise<{ gps_verified: boolean; error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { gps_verified: false, error: '로그인이 필요합니다.' }

  // TOCTOU 방지: complexId 파라미터가 실제 리뷰의 complex_id와 일치하는지 검증
  const { data: review } = await supabase
    .from('complex_reviews')
    .select('complex_id')
    .eq('id', reviewId)
    .eq('user_id', user.id)
    .single()

  if (!review || review.complex_id !== complexId) {
    return { gps_verified: false, error: '잘못된 요청입니다.' }
  }

  // 스푸핑 방지: 클라이언트 좌표를 PostGIS로 서버 검증 (D-07)
  // error를 본다. 실패해도 verified=false로 안전하게 닫히지만(fail-closed), 그러면
  // "위치 검증 실패"와 "검증 기능 고장"이 화면에서 똑같아 보인다. 로그에는 남겨야 한다.
  const { data: proximity, error: proximityError } = await supabase.rpc('check_gps_proximity', {
    p_complex_id: complexId,
    p_lat:        lat,
    p_lng:        lng,
    p_distance_m: 100,
  })
  if (proximityError) {
    console.error(`[review] GPS 검증 RPC 실패 (complex=${complexId}): ${proximityError.message}`)
  }

  const verified = proximity === true
  if (verified) {
    const { error: updateError } = await supabase
      .from('complex_reviews')
      .update({ gps_verified: true })
      .eq('id', reviewId)
      .eq('user_id', user.id)
    if (updateError) return { gps_verified: false, error: '인증 기록 중 오류가 발생했습니다.' }
    revalidatePath(`/complexes/${complexId}`)
  }
  return { gps_verified: verified, error: null }
}
