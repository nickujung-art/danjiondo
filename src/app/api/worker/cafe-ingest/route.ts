import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { searchCafePosts, extractComplexNames } from '@/services/naver-cafe'
import { ingestCafePost } from '@/lib/data/cafe-posts'
import { markCronStatus } from '@/lib/data/cron-status'

export const runtime = 'nodejs'

// 창원·김해 sgg_code 맵핑
const SGG_CODE_MAP: Record<string, string> = {
  '창원 성산구':    '48125',
  '창원 의창구':    '48121',
  '창원 마산합포구': '48125',
  '창원 마산회원구': '48127',
  '창원 진해구':    '48129',
  '김해':          '48720',
}

function resolveSggCode(query: string): string {
  if (query.includes('김해')) return '48720'
  for (const [key, code] of Object.entries(SGG_CODE_MAP)) {
    if (query.includes(key)) return code
  }
  // 창원 기본값: 성산구
  return '48125'
}

// Naver Search API 일 한도(25,000회) 고려: 쿼리 수 제한
const SEARCH_QUERIES = [
  '창원 성산구 아파트',
  '창원 의창구 아파트',
  '창원 마산 아파트',
  '김해 아파트',
  '창원 래미안',
  '창원 힐스테이트',
  '김해 래미안',
]

export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  let ingested = 0
  let failed = 0

  for (const query of SEARCH_QUERIES) {
    try {
      const posts = await searchCafePosts(query, 10)
      for (const post of posts) {
        try {
          // Gemini NER: 단지명 + 지역명(구/동) 함께 추출 (DIFF-02 정확도 개선)
          const names = await extractComplexNames(`${post.title} ${post.contents}`)
          const sggCode = resolveSggCode(query)

          for (const name of names) {
            await ingestCafePost(post, name, sggCode, supabase)
            ingested++
          }
        } catch {
          failed++
        }
      }
    } catch {
      failed++
    }
  }

  await markCronStatus(supabase, 'cafe-articles', failed === 0 ? 'success' : 'partial')

  return NextResponse.json({ ingested, failed })
}
