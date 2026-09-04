/**
 * 청약홈 미등록 분양 단지 크롤링 스크립트
 * 실행: npx tsx scripts/crawl-presale.ts
 * presale_enriched 테이블의 source_url이 있는 행을 크롤링해서 상세 데이터 채움
 */
import { createClient } from '@supabase/supabase-js'
import { crawlPresaleSource } from '../src/services/presale-crawler'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

async function main() {
  const { data: sources, error } = await supabase
    .from('presale_enriched')
    .select('id, name, source_url, summary, unit_types, community')
    .eq('is_active', true)
    .not('source_url', 'is', null)

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  if (!sources?.length) { console.log('크롤링할 항목 없음'); return }

  console.log(`크롤링 대상: ${sources.length}건`)

  for (const source of sources) {
    console.log(`\n[${source.name}] ${source.source_url}`)
    const data = await crawlPresaleSource(source.source_url as string)

    if (!data) {
      console.log('  → 크롤링 실패 또는 데이터 없음 (스킵)')
      continue
    }

    const updatePayload: Record<string, unknown> = {
      crawled_at: new Date().toISOString(),
      source_type: 'crawl',
    }
    if (data.builder    != null) updatePayload.builder     = data.builder
    if (data.contractor != null) updatePayload.contractor  = data.contractor
    if (data.totalUnits != null) updatePayload.total_units = data.totalUnits
    if (data.moveInDate != null) updatePayload.move_in_date = data.moveInDate
    if (data.address    != null) updatePayload.address     = data.address

    // ㉔ summary — 키 단위 merge. 크롤러가 못 찾은 키(null)는 기존 값 유지.
    // 크롤러가 모르는 키(generalUnits·note 등 수동 입력분)도 보존.
    if (data.summary != null) {
      const existing = (source as Record<string, unknown>).summary as Record<string, unknown> | null
      const merged = { ...(existing ?? {}) }
      for (const [k, v] of Object.entries(data.summary)) {
        if (v != null) merged[k] = v  // 크롤 값이 있으면 덮어씀
      }
      updatePayload.summary = merged
    }

    // ㉔ unit_types — 크롤 결과가 비거나 기존보다 정보가 적으면 덮지 않는다.
    // API 평형에는 price_wan이 있는데 크롤 평형에는 없으므로, 크롤로 갈아치우면 분양가가 사라진다.
    if (data.unitTypes != null && data.unitTypes.length > 0) {
      const existingTypes = (source as Record<string, unknown>).unit_types as unknown[] | null
      if (!existingTypes?.length || existingTypes.length === 0) {
        updatePayload.unit_types = data.unitTypes
      }
      // 기존에 이미 있으면 덮지 않는다 (API 출처가 price_wan 포함으로 더 풍부)
    }

    // ㉔ community — 빈 객체/빈 facilities면 덮지 않는다.
    if (data.community != null && data.community.facilities && data.community.facilities.length > 0) {
      const existingComm = (source as Record<string, unknown>).community as { facilities?: string[] } | null
      // 기존보다 풍부하면 덮어씀
      if (!existingComm?.facilities?.length || data.community.facilities.length >= existingComm.facilities.length) {
        updatePayload.community = data.community
      }
    }

    const { error: updateError } = await supabase
      .from('presale_enriched')
      .update(updatePayload)
      .eq('id', source.id)

    if (updateError) {
      console.log('  → DB 업데이트 실패:', updateError.message)
    } else {
      console.log('  → 완료:', JSON.stringify({ builder: data.builder, totalUnits: data.totalUnits, unitTypesCount: data.unitTypes?.length ?? 0 }))
    }
  }

  console.log('\n크롤링 완료')
}

main().catch(e => { console.error(e); process.exit(1) })
