import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/**
 * MOLIT 분양권전매 거래를 `new_listings` 행 하나로 확보한다 (없으면 만들고, 있으면 갱신).
 *
 * [왜 upsert가 아닌가]
 * `new_listings`의 MOLIT 유일성 제약은 **부분 인덱스**다:
 *   `new_listings_molit_name_region_idx (name, region) WHERE pblanc_no IS NULL`
 * Postgres는 부분 인덱스를 ON CONFLICT 추론에 쓰려면 INSERT 문에 인덱스 술어와 일치하는
 * `WHERE` 절이 필요한데, **PostgREST는 그 술어를 보낼 방법이 없다.** 즉
 * `onConflict: 'name,region'`은 원리적으로 성공할 수 없고 42P10으로 100% 실패했다.
 *
 * 부분 인덱스는 **의도된 설계라 유지한다** — 이 테이블은 MOLIT 분양권(`pblanc_no IS NULL`, 3행)과
 * 청약 공고(`pblanc_no IS NOT NULL`, 94행)가 공유하며, 비부분으로 바꾸면 두 소스가 같은
 * 단지명·지역에서 충돌한다. 대신 앱에서 명시적으로 조회 후 분기한다. 어차피 호출부는 `id`를
 * 되받아야 하므로 upsert일 필요가 없었다.
 *
 * [왜 23505 재조회 방어를 넣지 않는가 — F-06 재량 결정]
 * 이 경로는 Vercel Cron 04:00 KST **1일 1회 단독 실행**이라 경합 소스가 없고, insert 직전에
 * 같은 술어로 조회한다. 검증되지 않는 방어 분기를 늘리는 것은 프로젝트의 YAGNI 규칙에 어긋난다.
 * 이 결함의 본질적 해결은 방어가 아니라 **에러를 드러내는 것**이다 — 기존 코드가
 * `.select('id').single()`의 `data`만 보고 `error`를 확인조차 하지 않아서 16일간 안 보였다.
 * 그래서 모든 단계의 에러를 호출부로 돌려준다. 만에 하나 23505가 나면 이제 `errors[]`에 뜬다.
 */
export interface MolitListingInput {
  name: string
  region: string
  price: number | null
  fetchedAt: string
}

export interface MolitListingResult {
  id: string | null
  error: string | null
}

export async function upsertMolitListing(
  supabase: Client,
  input: MolitListingInput,
): Promise<MolitListingResult> {
  const { name, region, price, fetchedAt } = input

  // 1) 부분 인덱스 술어(`pblanc_no IS NULL`)와 **정확히 같은 조건**으로 조회한다.
  //    이 `.is()`를 빠뜨리면 청약 공고 행을 잡아 덮어쓴다.
  const { data: existing, error: selectError } = await supabase
    .from('new_listings')
    .select('id')
    .eq('name', name)
    .eq('region', region)
    .is('pblanc_no', null)
    .maybeSingle()

  if (selectError) {
    return { id: null, error: `select 실패: ${selectError.message}` }
  }

  // 2) 있으면 가격·수집시각만 갱신한다. name·region·pblanc_no는 건드리지 않는다.
  if (existing) {
    const existingId = (existing as { id: string }).id
    const { data: updated, error: updateError } = await supabase
      .from('new_listings')
      .update({ price_min: price, price_max: price, fetched_at: fetchedAt })
      .eq('id', existingId)
      .select('id')
      .single()

    if (updateError) {
      return { id: null, error: `update 실패: ${updateError.message}` }
    }
    return { id: (updated as { id: string } | null)?.id ?? existingId, error: null }
  }

  // 3) 없으면 신규 행을 만든다. `pblanc_no`는 넣지 않는다 — NULL 이어야 MOLIT 그룹에 속한다.
  const { data: inserted, error: insertError } = await supabase
    .from('new_listings')
    .insert({ name, region, price_min: price, price_max: price, fetched_at: fetchedAt })
    .select('id')
    .single()

  if (insertError) {
    return { id: null, error: `insert 실패: ${insertError.message}` }
  }
  return { id: (inserted as { id: string } | null)?.id ?? null, error: null }
}
