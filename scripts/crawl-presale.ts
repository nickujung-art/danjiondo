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
    .select('id, name, source_url')
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
    }
    if (data.builder    != null) updatePayload.builder     = data.builder
    if (data.contractor != null) updatePayload.contractor  = data.contractor
    if (data.totalUnits != null) updatePayload.total_units = data.totalUnits
    if (data.moveInDate != null) updatePayload.move_in_date = data.moveInDate
    if (data.address    != null) updatePayload.address     = data.address
    if (data.summary    != null) updatePayload.summary     = data.summary
    if (data.unitTypes  != null) updatePayload.unit_types  = data.unitTypes
    if (data.community  != null) updatePayload.community   = data.community

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
