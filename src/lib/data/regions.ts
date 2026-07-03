import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * regions 테이블에서 is_active=true인 sgg_code 목록을 동적으로 조회한다.
 * ALLOWED_SGG_CODES/ACTIVE_SGG_CODES/LAWD_CODES/offiSggCodes 등
 * 인라인 하드코딩 배열을 대체하는 유일한 지역 마스터 접근 경로 (Phase 33).
 */
export async function getActiveSggCodes(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => r.sgg_code)
}

/**
 * regions 테이블에서 is_active=true인 시/군 이름을 '시'/'군' 접미사 제거 후 중복 제거하여 반환한다.
 * 청약홈(cheongyak) HSSPLY_ADRES 주소 문자열 매칭용 — '창원시'→'창원', '의령군'→'의령'.
 */
export async function getActiveCityNames(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('si')
    .eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  const names = new Set((data ?? []).map((r) => r.si.replace(/(시|군)$/, '')))
  return [...names]
}

/**
 * regions 테이블에서 is_active=true인 전체 (sgg_code, si, gu) 행을 조회한다.
 * CHANGWON_GU_MAP(molit-unsold.ts)/SGG_TO_ADDR(realprice-officetel.ts) 등
 * 정적 시군구 주소 매핑 배열을 대체하는 유일한 지역 주소 마스터 접근 경로 (Phase 33 2차 리비전).
 */
export interface RegionAddr {
  sgg_code: string
  si: string
  gu: string | null
}

export async function getActiveRegionAddrs(
  supabase: SupabaseClient<Database>,
): Promise<RegionAddr[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code, si, gu')
    .eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return data ?? []
}
