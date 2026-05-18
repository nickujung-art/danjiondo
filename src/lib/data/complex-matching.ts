import { nameNormalize } from './name-normalize'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────
// seedComplex (step3a)
// ─────────────────────────────────────────────────────────

export interface SeedComplexInput {
  kaptCode: string
  kaptName: string
  doroJuso?: string
  kaptAddr?: string
  kaptdaCnt?: number
  kaptUseApproveYmd?: string  // YYYYMMDD
  coordX?: number             // 경도 (lng)
  coordY?: number             // 위도 (lat)
  sggCode: string
}

export interface SeedComplexResult {
  id: string
  created: boolean
}

export const INITIAL_DATA_COMPLETENESS = {
  transactions: false,
  school: false,
  kapt: false,
  poi: false,
} as const

export async function seedComplex(
  raw: SeedComplexInput,
  supabase: SupabaseClient,
): Promise<SeedComplexResult> {
  const canonicalName = raw.kaptName
  const nameNormalized = nameNormalize(canonicalName)
  const builtYear = raw.kaptUseApproveYmd
    ? parseInt(raw.kaptUseApproveYmd.slice(0, 4), 10)
    : null

  const row = {
    canonical_name:    canonicalName,
    name_normalized:   nameNormalized,
    kapt_code:         raw.kaptCode,
    sgg_code:          raw.sggCode,
    road_address:      raw.doroJuso ?? null,
    jibun_address:     raw.kaptAddr ?? null,
    household_count:   raw.kaptdaCnt ?? null,
    built_year:        builtYear,
    lat:               raw.coordY ?? null,
    lng:               raw.coordX ?? null,
    status:            'active' as const,
    data_completeness: INITIAL_DATA_COMPLETENESS,
  }

  const { data, error } = await supabase
    .from('complexes')
    .upsert(row, { onConflict: 'kapt_code' })
    .select('id')
    .single()

  if (error) throw new Error(`seedComplex failed for ${canonicalName}: ${error.message}`)
  if (!data) throw new Error(`seedComplex returned no data for ${canonicalName}`)

  return { id: (data as { id: string }).id, created: true }
}

export async function initDataCompleteness(
  complexId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from('complexes')
    .update({ data_completeness: INITIAL_DATA_COMPLETENESS })
    .eq('id', complexId)
  if (error) throw new Error(`initDataCompleteness failed: ${error.message}`)
}

// ─────────────────────────────────────────────────────────
// 3축 매칭 파이프라인 (step3b, ADR-034)
// ─────────────────────────────────────────────────────────

export type MatchAxis = 'address' | 'coordinate' | 'admin_code'

export interface MatchResult {
  complexId: string
  confidence: number
  axis: MatchAxis
}

export interface MatchInput {
  rawName: string
  doroJuso?: string       // 도로명주소
  sggCode: string
  coordX?: number         // 경도 (lng)
  coordY?: number         // 위도 (lat)
  builtYear?: number
  source: string
  rawPayload: Record<string, unknown>
}

// 신뢰도 임계 (ADR-039)
const AUTO_THRESHOLD  = 0.9
const QUEUE_THRESHOLD = 0.7
// axis 3는 좌표 없는 fallback — confidence를 0.85로 캡
const ADMIN_CONFIDENCE_CAP = 0.85

// ── Axis 1: 도로명주소 + 건축연도 exact match ──────────────

export async function matchByAddress(
  params: { doroJuso: string | undefined; builtYear: number | undefined },
  supabase: SupabaseClient,
): Promise<MatchResult | null> {
  if (!params.doroJuso || params.builtYear == null) return null

  const { data, error } = await supabase
    .from('complexes')
    .select('id')
    .eq('road_address', params.doroJuso)
    .eq('built_year', params.builtYear)
    .neq('status', 'demolished')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`matchByAddress query failed: ${error.message}`)
  if (!data) return null

  return { complexId: (data as { id: string }).id, confidence: 1.0, axis: 'address' }
}

// ── Axis 2: 좌표 ±200m + trigram ≥ 0.7 ────────────────────

export async function matchByCoordinate(
  params: {
    coordX: number | undefined
    coordY: number | undefined
    nameNormalized: string
  },
  supabase: SupabaseClient,
): Promise<MatchResult | null> {
  if (params.coordX == null || params.coordY == null) return null

  const { data, error } = await supabase.rpc('match_complex_by_coord', {
    p_lng:            params.coordX,
    p_lat:            params.coordY,
    p_name_normalized: params.nameNormalized,
  })

  if (error) throw new Error(`matchByCoordinate rpc failed: ${error.message}`)
  if (!data || (data as unknown[]).length === 0) return null

  const row = (data as { id: string; trgm_sim: number }[])[0]!
  return {
    complexId:  row.id,
    confidence: Number(row.trgm_sim),
    axis:       'coordinate',
  }
}

// ── Axis 3: sgg_code + trigram ≥ 0.5 (fallback) ───────────

export async function matchByAdminCode(
  params: { sggCode: string; nameNormalized: string; confidenceCap?: number },
  supabase: SupabaseClient,
): Promise<MatchResult | null> {
  const { data, error } = await supabase.rpc('match_complex_by_admin', {
    p_sgg_code:        params.sggCode,
    p_name_normalized: params.nameNormalized,
  })

  if (error) throw new Error(`matchByAdminCode rpc failed: ${error.message}`)
  if (!data || (data as unknown[]).length === 0) return null

  const row = (data as { id: string; trgm_sim: number }[])[0]!
  // axis 3 confidence는 cap으로 제한 (기본값: ADMIN_CONFIDENCE_CAP=0.85)
  // link-transactions 재연결 시 confidenceCap: 0.9 사용해 자동 연결 허용
  const cap = params.confidenceCap ?? ADMIN_CONFIDENCE_CAP
  const confidence = Math.min(Number(row.trgm_sim), cap)
  return { complexId: row.id, confidence, axis: 'admin_code' }
}

// ── 큐 적재 ────────────────────────────────────────────────

async function enqueueMatch(
  input: MatchInput,
  reason: 'low_confidence' | 'no_match',
  candidates: string[],
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.from('complex_match_queue').insert({
    source:        input.source,
    raw_payload:   input.rawPayload,
    candidate_ids: candidates.length > 0 ? candidates : null,
    reason,
    status:        'pending',
  })
  if (error) throw new Error(`enqueueMatch failed: ${error.message}`)
}

// ── 별칭 기록 ──────────────────────────────────────────────

async function recordAlias(
  complexId: string,
  rawName: string,
  source: string,
  confidence: number,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.from('complex_aliases').upsert(
    {
      complex_id:  complexId,
      source,
      alias_name:  rawName,
      confidence,
    },
    { onConflict: 'complex_id,source,alias_name' },
  )
  if (error) throw new Error(`recordAlias failed: ${error.message}`)
}

// ── 메인 오케스트레이터 ────────────────────────────────────

export async function matchComplex(
  input: MatchInput,
  supabase: SupabaseClient,
): Promise<string | null> {
  const nameNormalized = nameNormalize(input.rawName)

  // Axis 1
  const byAddr = await matchByAddress(
    { doroJuso: input.doroJuso, builtYear: input.builtYear },
    supabase,
  )
  if (byAddr && byAddr.confidence >= AUTO_THRESHOLD) {
    await recordAlias(byAddr.complexId, input.rawName, input.source, byAddr.confidence, supabase)
    return byAddr.complexId
  }

  // Axis 2
  const byCoord = await matchByCoordinate(
    { coordX: input.coordX, coordY: input.coordY, nameNormalized },
    supabase,
  )
  if (byCoord && byCoord.confidence >= AUTO_THRESHOLD) {
    await recordAlias(byCoord.complexId, input.rawName, input.source, byCoord.confidence, supabase)
    return byCoord.complexId
  }

  // Axis 3
  const byAdmin = await matchByAdminCode(
    { sggCode: input.sggCode, nameNormalized },
    supabase,
  )
  if (byAdmin && byAdmin.confidence >= AUTO_THRESHOLD) {
    await recordAlias(byAdmin.complexId, input.rawName, input.source, byAdmin.confidence, supabase)
    return byAdmin.complexId
  }

  // 최선 후보 집계
  const candidates = [byAddr, byCoord, byAdmin]
    .filter((r): r is MatchResult => r !== null)
    .sort((a, b) => b.confidence - a.confidence)

  const best = candidates[0]

  if (best && best.confidence >= QUEUE_THRESHOLD) {
    // 0.7~0.9: 운영자 검수
    await enqueueMatch(input, 'low_confidence', [best.complexId], supabase)
  } else {
    // <0.7 또는 후보 없음
    await enqueueMatch(
      input,
      'no_match',
      candidates.map(c => c.complexId),
      supabase,
    )
  }

  return null
}
