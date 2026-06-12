// 분양 공고 마스터 (Phase 4에서 신규 생성)
export interface NewListing {
  id: string
  name: string
  region: string
  complex_id: string | null
  price_min: number | null
  price_max: number | null
  total_units: number | null
  move_in_date: string | null
  fetched_at: string
}

// 분양권전매 실거래 (transactions 대원칙 적용)
export interface PresaleTransaction {
  id: string
  listing_id: string
  area: number | null
  floor: number | null
  price: number
  deal_date: string
  cancel_date: string | null
  superseded_by: string | null
  created_at: string
}

// 신규 타입: 청약홈 분양 공고 (Tier 1)
export interface CheongyakListing {
  id: string
  pblanc_no: string
  pblanc_nm: string | null
  region: string
  supply_region: string | null
  supply_count: number | null
  rcept_bgnde: string | null
  rcept_endde: string | null
  mvn_prearnge_ym: string | null
  hssply_adres: string | null
  competition_rate: number | null
  complex_id: string | null
}

// 신규 타입: 재건축 예정 단지 (Tier 2)
export interface RedevelopmentComplex {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
  dong: string | null
  household_count: number | null
  predecessor_id: string | null
  successor_id: string | null
  predecessor_name?: string | null
}

// 신규 타입: 신축 단지 (Tier 3)
export interface NewBuiltComplex {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
  built_year: number
  household_count: number | null
}

// Phase 4 테이블은 database.ts에 아직 미반영 — SupabaseClient의 제네릭에 구애받지 않는 최소 인터페이스 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any }

// Tier 1: 활성 청약홈 분양 공고
export async function getActiveListings(
  supabase: AnySupabaseClient,
  limit = 20,
): Promise<CheongyakListing[]> {
  const { data } = await supabase
    .from('new_listings')
    .select('id, pblanc_no, pblanc_nm, region, supply_region, supply_count, rcept_bgnde, rcept_endde, mvn_prearnge_ym, hssply_adres, competition_rate, complex_id')
    .eq('is_active', true)
    .not('pblanc_no', 'is', null)
    .order('rcept_bgnde', { ascending: false })
    .limit(limit)
  return (data as CheongyakListing[] | null) ?? []
}

// 30일 이내 마감된 청약홈 분양 공고 (만료 표시용)
export async function getRecentlyExpiredListings(
  supabase: AnySupabaseClient,
  limit = 20,
): Promise<CheongyakListing[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const { data } = await supabase
    .from('new_listings')
    .select('id, pblanc_no, pblanc_nm, region, supply_region, supply_count, rcept_bgnde, rcept_endde, mvn_prearnge_ym, hssply_adres, competition_rate, complex_id')
    .eq('is_active', false)
    .not('pblanc_no', 'is', null)
    .not('supply_count', 'is', null)
    .gte('rcept_endde', cutoff.toISOString().slice(0, 10))
    .order('rcept_endde', { ascending: false })
    .limit(limit)
  return (data as CheongyakListing[] | null) ?? []
}

// 활성 청약홈 분양 공고 건수 (랜딩 배지용)
export async function getActiveListingCount(
  supabase: AnySupabaseClient,
): Promise<number> {
  const { count } = await supabase
    .from('new_listings')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .not('pblanc_no', 'is', null)
  return (count as number | null) ?? 0
}

// Tier 2: 재건축 예정 단지
export async function getRedevelopmentComplexes(
  supabase: AnySupabaseClient,
  limit = 20,
): Promise<RedevelopmentComplex[]> {
  const { data } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, dong, household_count, predecessor_id, successor_id')
    .eq('status', 'in_redevelopment')
    .order('canonical_name')
    .limit(limit)
  const rows = (data as RedevelopmentComplex[] | null) ?? []

  // predecessor_id가 있는 행에 대해 predecessor canonical_name 채우기 (N+1 방지 - IN 쿼리 1회)
  const predecessorIds = rows.map(r => r.predecessor_id).filter((id): id is string => !!id)
  if (predecessorIds.length === 0) return rows

  const { data: predecessors } = await supabase
    .from('complexes')
    .select('id, canonical_name')
    .in('id', predecessorIds)
  const map = new Map<string, string>()
  for (const p of (predecessors as { id: string; canonical_name: string }[] | null) ?? []) {
    map.set(p.id, p.canonical_name)
  }
  return rows.map(r => ({
    ...r,
    predecessor_name: r.predecessor_id ? map.get(r.predecessor_id) ?? null : null,
  }))
}

// Tier 3: 신축 최신순
export async function getNewBuiltComplexes(
  supabase: AnySupabaseClient,
  limit = 30,
): Promise<NewBuiltComplex[]> {
  const { data } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, built_year, household_count')
    .eq('status', 'active')
    .gte('built_year', 2021)
    .order('built_year', { ascending: false })
    .limit(limit)
  return (data as NewBuiltComplex[] | null) ?? []
}

// ─── Tier 0: 청약홈 미등록 분양 예정 (크롤링 데이터) ─────────────────────────

export interface EnrichedPresaleListing {
  id:          string
  name:        string
  sggCode:     string | null
  address:     string | null
  sourceUrl:   string | null
  builder:     string | null
  totalUnits:  number | null
  moveInDate:  string | null
  summary:     Record<string, unknown>
  unitTypes:   Array<{ type: string; area_m2?: number | null; units?: number | null; priceMin?: number | null; priceMax?: number | null }>
  community:   Record<string, unknown>
  saleStatus:  string
  crawledAt:   string | null
}

export async function getEnrichedPresaleItems(
  supabase: AnySupabaseClient,
  limit = 10,
): Promise<EnrichedPresaleListing[]> {
  const { data } = await supabase
    .from('presale_enriched')
    .select('id, name, sgg_code, address, source_url, builder, total_units, move_in_date, summary, unit_types, community, sale_status, crawled_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!data) return []

  return (data as Record<string, unknown>[]).map(r => ({
    id:         r['id'] as string,
    name:       r['name'] as string,
    sggCode:    (r['sgg_code'] as string | null) ?? null,
    address:    (r['address'] as string | null) ?? null,
    sourceUrl:  (r['source_url'] as string | null) ?? null,
    builder:    (r['builder'] as string | null) ?? null,
    totalUnits: (r['total_units'] as number | null) ?? null,
    moveInDate: (r['move_in_date'] as string | null) ?? null,
    summary:    (r['summary'] as Record<string, unknown>) ?? {},
    unitTypes:  (r['unit_types'] as EnrichedPresaleListing['unitTypes']) ?? [],
    community:  (r['community'] as Record<string, unknown>) ?? {},
    saleStatus: (r['sale_status'] as string) ?? 'presale',
    crawledAt:  (r['crawled_at'] as string | null) ?? null,
  }))
}

// 기존 함수: 분양권전매 실거래 조회 (transactions 대원칙 보존)
export async function getPresaleTransactions(
  listingId: string,
  supabase: AnySupabaseClient,
): Promise<PresaleTransaction[]> {
  const { data } = await supabase
    .from('presale_transactions')
    .select('*')
    .eq('listing_id', listingId)
    .is('cancel_date', null) // transactions 대원칙
    .is('superseded_by', null) // transactions 대원칙
    .order('deal_date', { ascending: false })
  return (data as PresaleTransaction[] | null) ?? []
}
