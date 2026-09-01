/**
 * news_crawl → 청약홈 행 병합 (일회성).
 *
 * presale_enriched 의 new_listing_id 를 news_crawl 행에서 청약홈 행으로 옮기고,
 * news_crawl 행을 비활성화한다. 한신더휴 manual 행의 알맹이는 보존.
 *
 * 실행: npx tsx scripts/merge-presale-news-crawl.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

// 수동 매핑: enriched_id → { news_crawl_listing_id, cheongyak_listing_id }
const MERGES = [
  {
    label: '창원 한신더휴 메가센텀',
    enriched_id: '63e3c972-2b68-467e-92e1-6e59e26e56da',
    news_crawl_id: 'a5c75f2e-6e62-4844-865e-b0c3c659181d',
    cheongyak_id: 'd1279d94-e631-4cc3-a65e-abc37e04260f',
    cheongyak_sgg: '48127', // 마산회원구
  },
  {
    label: '김해신문 센트럴 아이파크',
    enriched_id: 'c343c847-a6dc-4c0a-81f5-46efce683f5a',
    news_crawl_id: '36055ab7-5caf-427f-9f30-64f043cae781',
    cheongyak_id: 'df78efc8-9d33-484e-ab0e-306a68ea2d08',
    cheongyak_sgg: '48250', // 김해시
  },
  {
    label: '창원센트럴아이파크',
    enriched_id: '64c2f5ec-03ad-4a22-bdb3-78dbd01d8be2',
    news_crawl_id: '6f8fb72f-9c5f-48aa-a1aa-9b4c74b94f55',
    cheongyak_id: 'd928f117-038c-45f7-8915-cb0e18303b7a',
    cheongyak_sgg: '48123', // 성산구
  },
]

async function main() {
  for (const m of MERGES) {
    console.log(`\n[${m.label}]`)

    // 1. enriched 행의 new_listing_id 를 청약홈 행으로 옮기기
    const { error: e1 } = await supabase
      .from('presale_enriched')
      .update({ new_listing_id: m.cheongyak_id, sgg_code: m.cheongyak_sgg })
      .eq('id', m.enriched_id)
    if (e1) { console.error('  enriched update 실패:', e1.message); continue }
    console.log(`  enriched → 청약홈 행 ${m.cheongyak_id} 연결 완료`)

    // 2. news_crawl 행 비활성화
    const { error: e2 } = await supabase
      .from('new_listings')
      .update({ is_active: false })
      .eq('id', m.news_crawl_id)
    if (e2) { console.error('  news_crawl 비활성화 실패:', e2.message); continue }
    console.log(`  news_crawl ${m.news_crawl_id} 비활성화 완료`)

    // 3. 청약홈 행 활성화 (입주 전이므로)
    const { error: e3 } = await supabase
      .from('new_listings')
      .update({ is_active: true })
      .eq('id', m.cheongyak_id)
    if (e3) { console.error('  청약홈 활성화 실패:', e3.message); continue }
    console.log(`  청약홈 ${m.cheongyak_id} 활성화 완료`)
  }

  console.log('\n병합 완료')
}

main().catch(e => { console.error(e); process.exit(1) })
