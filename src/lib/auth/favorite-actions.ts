'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * 이 파일의 모든 쿼리에 반드시 붙는다.
 *
 * `favorites` 는 danjiondo 와 realtrade-story 가 **공유하는 테이블**이고, 분리는 RLS 가 아니라
 * 애플리케이션 코드 책임이다. site_id 기본값이 'danjiondo' 라 INSERT 는 무사히 넘어가지만
 * SELECT/DELETE/UPDATE 에 필터가 없으면 다른 사이트의 행까지 건드린다.
 *
 * 실제로 removeFavorite 은 필터 없이 (user_id, complex_id) 로만 지우고 있어서, danjiondo 에서
 * 즐겨찾기를 해제하면 같은 사용자의 realtrade-story 즐겨찾기와 평형별 가격알림까지 같이
 * 사라지는 상태였다(2026-07-31 발견).
 */
const SITE_ID = 'danjiondo'

export async function addFavorite(
  complexId: string,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다' }

  // upsert 를 쓰지 않는다. `favorites` 의 유일성은 **부분 인덱스 2개**로 나뉘어 있다:
  //   favorites_complex_favorite_unique_idx  (user_id, complex_id, site_id) WHERE area_type_id IS NULL
  //   favorites_area_type_alert_unique_idx   (user_id, complex_id, area_type_id, site_id)
  //                                          WHERE area_type_id IS NOT NULL
  // Postgres 는 부분 인덱스를 ON CONFLICT 추론에 쓰려면 INSERT 에 인덱스 술어와 같은 WHERE 가
  // 필요한데 PostgREST 는 그걸 보낼 방법이 없다. 그래서 onConflict: 'user_id,complex_id' 는
  // 원리적으로 성공할 수 없었고 42P10 으로 **즐겨찾기 추가가 100% 실패**했다.
  //
  // 부분 인덱스 분리는 의도된 설계라 유지한다 — 같은 단지를 "즐겨찾기(평형 없음)" 하면서
  // 동시에 평형별 가격알림을 거는 조합이 필요해서 2026-07-23 에 일부러 나눴다.
  // 하나로 합치면 그 조합이 다시 막힌다.
  //
  // 이미 있으면 아무것도 하지 않는다(원래 upsert 의 의도도 "있으면 그대로 두기"였다).
  const { data: existing, error: lookupError } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('complex_id', complexId)
    .eq('site_id', SITE_ID)
    .is('area_type_id', null)
    .maybeSingle()
  if (lookupError) return { error: lookupError.message }
  if (existing) return { error: null }

  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: user.id, complex_id: complexId, site_id: SITE_ID })

  if (error) return { error: error.message }
  revalidatePath('/favorites')
  return { error: null }
}

export async function removeFavorite(
  complexId: string,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다' }

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('complex_id', complexId)
    .eq('site_id', SITE_ID)

  if (error) return { error: error.message }
  revalidatePath('/favorites')
  return { error: null }
}

export async function toggleFavoriteAlert(
  complexId: string,
  enabled: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다' }

  const { error } = await supabase
    .from('favorites')
    .update({ alert_enabled: enabled })
    .eq('user_id', user.id)
    .eq('complex_id', complexId)
    .eq('site_id', SITE_ID)

  if (error) return { error: error.message }
  revalidatePath('/favorites')
  return { error: null }
}
