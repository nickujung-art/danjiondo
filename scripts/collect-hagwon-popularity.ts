/**
 * Naver 블로그 인기도 수집 + fee_tier 분위 계산
 *
 * Step 1: Naver 블로그 검색으로 학원별 naver_blog_count 수집 + popularity_score 정규화
 * Step 2: fee_amount 기반 fee_tier (상위 30%=premium / 30~80%=standard / 80%+=budget) 계산
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-popularity.ts
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-popularity.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-popularity.ts --skip-naver
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN    = process.argv.includes('--dry-run')
const SKIP_NAVER = process.argv.includes('--skip-naver')
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT      = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getBlogCount(name: string): Promise<number> {
  const url = new URL('https://openapi.naver.com/v1/search/blog.json')
  url.searchParams.set('query', name)
  url.searchParams.set('display', '1')
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id':     process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      },
    })
    if (!res.ok) return 0
    const json = await res.json() as { total?: number }
    return json.total ?? 0
  } catch {
    return 0
  }
}

async function main() {
  // ── Step 1: Naver 블로그 수집 ──────────────────────────────────────────────
  if (!SKIP_NAVER) {
    if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
      console.error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 없습니다.')
      process.exit(1)
    }

    let query = supabase
      .from('hagwon_db')
      .select('id, name')
      .eq('is_active', true)
      .is('naver_blog_count', null)

    if (LIMIT > 0) query = query.limit(LIMIT)

    const { data: rows, error } = await query
    if (error) {
      console.error('hagwon_db 조회 실패:', error.message)
      process.exit(1)
    }

    const total = rows?.length ?? 0
    console.log(`[Step 1] Naver 블로그 수집 시작: ${total}건`)

    if (total > 0) {
      const counts: Array<{ id: string; count: number }> = []

      for (let i = 0; i < rows!.length; i++) {
        const row = rows![i]
        const count = await getBlogCount(row.name)
        counts.push({ id: row.id, count })

        if (DRY_RUN && i < 5) {
          console.log(`[dry-run] ${row.name} → ${count}건`)
        }

        await sleep(100)

        if ((i + 1) % 100 === 0 || i === rows!.length - 1) {
          console.log(`[Step 1] ${i + 1}/${total} 수집 완료`)
        }
      }

      if (!DRY_RUN && counts.length > 0) {
        // popularity_score 정규화: log1p(count) / log1p(maxCount)
        const maxCount = Math.max(...counts.map(r => r.count), 1)
        const avgCount = counts.reduce((s, r) => s + r.count, 0) / counts.length

        const upsertData = counts.map(r => ({
          id:               r.id,
          naver_blog_count: r.count,
          popularity_score: parseFloat((Math.log1p(r.count) / Math.log1p(maxCount)).toFixed(4)),
        }))

        // 50건씩 upsert
        for (let i = 0; i < upsertData.length; i += 50) {
          const batch = upsertData.slice(i, i + 50)
          const { error: upsertErr } = await supabase
            .from('hagwon_db')
            .upsert(batch, { onConflict: 'id' })
          if (upsertErr) {
            console.error('popularity upsert 오류:', upsertErr.message)
          }
        }

        console.log(`[Step 1] 완료: ${counts.length}건 수집 (avg count: ${avgCount.toFixed(0)})`)
      } else if (DRY_RUN) {
        console.log(`[Step 1] dry-run 완료`)
      }
    }
  }

  // ── Step 2: fee_tier 분위 계산 ────────────────────────────────────────────
  const { data: feeRows, error: feeErr } = await supabase
    .from('hagwon_db')
    .select('id, fee_amount')
    .not('fee_amount', 'is', null)
    .order('fee_amount', { ascending: false })

  if (feeErr) {
    console.error('fee_amount 조회 실패:', feeErr.message)
    process.exit(1)
  }

  const feeTotal = feeRows?.length ?? 0
  console.log(`[Step 2] fee_tier 계산: ${feeTotal}건 (fee_amount IS NOT NULL)`)

  if (feeTotal > 0 && !DRY_RUN) {
    const withTier = feeRows!.map((r, i) => ({
      id:       r.id,
      fee_tier: i / feeTotal <= 0.3 ? 'premium' : i / feeTotal <= 0.8 ? 'standard' : 'budget',
    }))

    let premium = 0, standard = 0, budget = 0
    for (const r of withTier) {
      if (r.fee_tier === 'premium') premium++
      else if (r.fee_tier === 'standard') standard++
      else budget++
    }

    // 50건씩 upsert
    for (let i = 0; i < withTier.length; i += 50) {
      const batch = withTier.slice(i, i + 50)
      const { error: upsertErr } = await supabase
        .from('hagwon_db')
        .upsert(batch, { onConflict: 'id' })
      if (upsertErr) {
        console.error('fee_tier upsert 오류:', upsertErr.message)
      }
    }

    console.log(`[Step 2] premium: ${premium}건, standard: ${standard}건, budget: ${budget}건`)
  } else if (DRY_RUN) {
    const sample = feeRows?.slice(0, 3).map((r, i) => ({
      name: r.fee_amount,
      tier: i / feeTotal <= 0.3 ? 'premium' : i / feeTotal <= 0.8 ? 'standard' : 'budget',
    }))
    console.log('[dry-run] fee_tier 샘플:', JSON.stringify(sample))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
