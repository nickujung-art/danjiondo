/**
 * 단지 임베딩 배치 스크립트 (Voyage AI voyage-4-lite → pgvector)
 *
 * 실행: npx tsx scripts/embed-complexes.ts
 * 환경변수: VOYAGE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 참고: Voyage AI 무료 티어 10M tokens/월. 단지 3000개 × 3 chunk × 200 tokens ≈ 1.8M tokens/1회 실행.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY

if (!VOYAGE_API_KEY) {
  console.error('VOYAGE_API_KEY not set')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: 'voyage-4-lite', input_type: 'document' }),
  })
  if (!res.ok) throw new Error(`Voyage API error: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> }
  return json.data.map(d => d.embedding)
}

interface Complex {
  id: string
  canonical_name: string
  si: string
  gu: string
  dong: string | null
  built_year: number | null
  household_count: number | null
  lat: number | null
  lng: number | null
}

async function buildSummaryChunk(complex: Complex): Promise<string> {
  const { data: lastTx } = await supabase
    .from('transactions')
    .select('price, deal_date')
    .eq('complex_id', complex.id)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .order('deal_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const latestDeal = lastTx
    ? `최근 실거래가 ${lastTx.price?.toLocaleString('ko-KR')}만원 (${lastTx.deal_date})`
    : '실거래 데이터 없음'

  return [
    `${complex.si} ${complex.gu} ${complex.dong ?? ''} ${complex.canonical_name}.`,
    complex.built_year ? `${complex.built_year}년 준공.` : '',
    complex.household_count ? `${complex.household_count}세대.` : '',
    latestDeal,
  ]
    .filter(Boolean)
    .join(' ')
}

async function buildTransactionChunk(complexId: string): Promise<string> {
  const twentyFourMonthsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const { data: txs } = await supabase
    .from('transactions')
    .select('price, area_m2, deal_date, deal_type')
    .eq('complex_id', complexId)
    .is('cancel_date', null)
    .is('superseded_by', null)
    .gte('deal_date', twentyFourMonthsAgo)
    .order('deal_date', { ascending: false })
    .limit(50)

  if (!txs || txs.length === 0) return '최근 24개월 거래 데이터 없음'

  const summary = txs
    .slice(0, 5)
    .map(t => `${t.deal_date} ${t.deal_type} ${t.area_m2}㎡ ${t.price?.toLocaleString('ko-KR')}만원`)
    .join(', ')
  return `최근 거래 ${txs.length}건. 최근 5건: ${summary}`
}

async function buildSchoolChunk(lat: number | null, lng: number | null): Promise<string> {
  if (!lat || !lng) return '학구 정보 없음'
  const { data: schools } = await supabase
    .rpc('get_schools_for_point', { p_lat: lat, p_lng: lng }) as {
      data: Array<{ school_level: string; school_name: string }> | null
    }
  if (!schools || schools.length === 0) return '학구 정보 없음'
  const elem = schools.filter(s => s.school_level === 'elementary').map(s => s.school_name).join(', ')
  const middle = schools.filter(s => s.school_level === 'middle').map(s => s.school_name).join(', ')
  const high = schools.filter(s => s.school_level === 'high').map(s => s.school_name).join(', ')
  const parts: string[] = []
  if (elem) parts.push(`배정 초등학교: ${elem}`)
  if (middle) parts.push(`배정 중학교: ${middle}`)
  if (high) parts.push(`배정 고등학교: ${high}`)
  return parts.length ? parts.join('. ') : '학구 정보 없음'
}

async function buildReviewChunk(complexId: string): Promise<string> {
  const { data: reviews } = await supabase
    .from('complex_reviews')
    .select('content, rating')
    .eq('complex_id', complexId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!reviews || reviews.length === 0) return '주민 후기 없음'

  const combined = reviews
    .map(r => r.content)
    .join(' ')
    .slice(0, 500)
  const avgRating =
    reviews.reduce((s, r) => s + ((r.rating as number | null) ?? 0), 0) / reviews.length
  return `주민 후기 ${reviews.length}건. 평균 평점 ${avgRating.toFixed(1)}. 내용: ${combined}`
}

async function main() {
  console.log('단지 임베딩 시작...')

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, dong, built_year, household_count, lat, lng')
    .eq('status', 'active')
    .order('id')

  if (error || !complexes) {
    console.error('complexes 조회 실패:', error)
    process.exit(1)
  }

  console.log(`총 ${complexes.length}개 단지 임베딩`)

  // 배치 처리 (Voyage AI rate limit 고려 — 20 단지씩)
  const BATCH_SIZE = 20
  for (let i = 0; i < complexes.length; i += BATCH_SIZE) {
    const batch = complexes.slice(i, i + BATCH_SIZE) as Complex[]
    console.log(
      `진행: ${i + 1}~${Math.min(i + BATCH_SIZE, complexes.length)}/${complexes.length}`,
    )

    for (const complex of batch) {
      const [summaryText, txText, reviewText, schoolText] = await Promise.all([
        buildSummaryChunk(complex),
        buildTransactionChunk(complex.id),
        buildReviewChunk(complex.id),
        buildSchoolChunk(complex.lat, complex.lng),
      ])

      const chunks = [
        { type: 'summary', text: summaryText },
        { type: 'transactions', text: txText },
        { type: 'reviews', text: reviewText },
        { type: 'schools', text: schoolText },
      ]

      const embeddings = await embedTexts(chunks.map(c => c.text))

      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j]!
        const embedding = embeddings[j]!
        await supabase.from('complex_embeddings').upsert(
          {
            complex_id: complex.id,
            chunk_type: chunk.type,
            content: chunk.text,
            embedding: `[${embedding.join(',')}]`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'complex_id,chunk_type' },
        )
      }
    }

    // rate limit 방어 (마지막 배치는 대기 불필요)
    if (i + BATCH_SIZE < complexes.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log('임베딩 완료')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
