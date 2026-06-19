/**
 * 학원 블로그 스니펫 수집 + AI 태그 추출
 *
 * 네이버 블로그 검색 API (display=10) 로 학원별 스니펫을 수집하고
 * Groq llama-3.1-8b-instant 로 특성 태그를 추출해 DB에 저장한다.
 *
 * 수집 컬럼: blog_snippet (합본 스니펫), blog_tags (태그 배열)
 * 분류 스크립트(classify-hagwon-groq.ts)와 컬럼 충돌 없이 병행 실행 가능.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-blog-tags.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-blog-tags.ts
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-blog-tags.ts --limit=100
 *   npx tsx --env-file=.env.local scripts/collect-hagwon-blog-tags.ts --all  (이미 수집된 것도 재수집)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN  = process.argv.includes('--dry-run')
const ALL      = process.argv.includes('--all')
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT    = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 0

// 네이버 API: 일 25,000 호출 한도. 4,601건 × 1호출 = 4,601 → 하루 충분
const NAVER_DISPLAY = 10   // 스니펫 최대 10개
const DELAY_MS      = 120  // 네이버 API 호출 간격 (초당 ~8회, 안전 마진 포함)
const BATCH_SIZE    = 50   // DB upsert 배치

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

// HTML 태그 + 특수문자 제거
function cleanHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

interface BlogItem {
  title: string
  description: string
}

// "경상남도 창원시 성산구 대원로 87" → "성산구" / "경상남도 김해시 내외로 21" → "김해시"
function extractRegion(address: string | null, admst: string | null): string {
  if (address) {
    const gu = address.match(/[가-힣]+구/)
    if (gu) return gu[0]
  }
  return admst ?? ''
}

async function fetchBlogSnippets(
  hagwonName: string,
  region: string,
): Promise<{ total: number; snippets: string }> {
  const query = region ? `${hagwonName} ${region}` : hagwonName
  const url = new URL('https://openapi.naver.com/v1/search/blog.json')
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(NAVER_DISPLAY))
  url.searchParams.set('sort', 'sim')

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id':     process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return { total: 0, snippets: '' }

    const json = await res.json() as { total?: number; items?: BlogItem[] }
    const items = json.items ?? []

    const snippets = items
      .map(item => {
        const title = cleanHtml(item.title)
        const desc  = cleanHtml(item.description)
        return `[${title}] ${desc}`
      })
      .filter(s => s.length > 10)
      .join('\n')

    return { total: json.total ?? 0, snippets }
  } catch {
    return { total: 0, snippets: '' }
  }
}

// 키워드 → 태그 매핑 (규칙 기반, Groq 불필요)
const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  // 대상
  { tag: '#초등전문',   keywords: ['초등', '초등학생', '초1', '초2', '초3', '초4', '초5', '초6'] },
  { tag: '#중등전문',   keywords: ['중등', '중학생', '중학교', '중1', '중2', '중3'] },
  { tag: '#고등전문',   keywords: ['고등', '고등학생', '고등학교', '고1', '고2', '고3', '수능'] },
  { tag: '#입시전문',   keywords: ['입시', '대입', '수시', '정시', '특기', '의대'] },
  { tag: '#유아전문',   keywords: ['유아', '유치원', '7세', '6세', '5세', '영유아'] },
  // 관리방식
  { tag: '#소수정예',   keywords: ['소수정예', '소수', '정예', '1:1', '일대일', '1대1'] },
  { tag: '#개별관리',   keywords: ['개별 관리', '개별관리', '맞춤 지도', '맞춤지도', '개인 맞춤', '1:1 맞춤'] },
  { tag: '#빡센관리',   keywords: ['빡센', '엄격', '철저', '숙제 많', '과제 많'] },
  // 수업방식
  { tag: '#개념중심',   keywords: ['개념', '개념 이해', '원리', '기초'] },
  { tag: '#문제풀이',   keywords: ['문제풀이', '문제 풀이', '서술형', '내신', '유형'] },
  { tag: '#반복훈련',   keywords: ['반복', '훈련', '연습', '드릴'] },
  // 선생님
  { tag: '#친절한선생님', keywords: ['친절', '친절한', '선생님이 좋', '선생님이 친'] },
  { tag: '#경력선생님',  keywords: ['경력', '경험', '베테랑', '전문 선생'] },
  // 결과
  { tag: '#성적향상',   keywords: ['성적 향상', '성적향상', '성적 올', '성적이 오', '점수 향상', '등급 상승'] },
  // 특징
  { tag: '#시설좋음',   keywords: ['시설', '넓', '쾌적', '깔끔', '깨끗'] },
  { tag: '#체계적커리큘럼', keywords: ['체계', '커리큘럼', '교재', '시스템'] },
]

function extractTags(hagwonName: string, snippets: string): string[] {
  if (!snippets.trim()) return []
  // 학원명이 포함된 문장만 추려서 분석 (다른 학원 후기 배제)
  const lines = snippets
    .split('\n')
    .filter(l => l.includes(hagwonName) || l.length < 80) // 짧은 문장은 일반 서술로 포함
  const text = lines.join(' ').toLowerCase()

  const matched: string[] = []
  for (const rule of TAG_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      matched.push(rule.tag)
      if (matched.length >= 6) break
    }
  }
  return matched
}

async function main() {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    console.error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수 없음')
    process.exit(1)
  }
  // 대상 학원 조회 (blog_snippet null이거나 --all이면 전체)
  type Row = { id: string; name: string; address: string | null; admst_zone_nm: string | null }
  const rows: Row[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    let q = supabase.from('hagwon_db').select('id, name, address, admst_zone_nm').eq('is_active', true)
    if (!ALL) q = q.is('blog_snippet', null)
    const { data, error } = await q.order('id').range(offset, offset + PAGE - 1)
    if (error) { console.error('조회 실패:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE || (LIMIT > 0 && rows.length >= LIMIT)) break
    offset += PAGE
  }
  if (LIMIT > 0 && rows.length > LIMIT) rows.length = LIMIT
  if (!rows.length) { console.log('수집할 학원 없음'); return }

  const total = rows.length
  console.log(`블로그 태그 수집 시작: ${total}건 (dry-run=${DRY_RUN})`)

  let success = 0, failed = 0, noSnippet = 0

  // dry-run: 샘플 3개만 출력
  if (DRY_RUN) {
    for (const row of rows.slice(0, 3)) {
      const region = extractRegion(row.address, row.admst_zone_nm)
      const { total: cnt, snippets } = await fetchBlogSnippets(row.name, region)
      const tags = extractTags(row.name, snippets)
      console.log(`\n[${row.name}] (${region}) 블로그 ${cnt}건`)
      console.log('쿼리:', region ? `${row.name} ${region}` : row.name)
      console.log('스니펫:', snippets.slice(0, 300))
      console.log('태그:', tags)
      await sleep(DELAY_MS)
    }
    return
  }

  type Batch = { id: string; blog_snippet: string; blog_tags: string[] }
  const batchBuf: Batch[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const region = extractRegion(row.address, row.admst_zone_nm)

    const { snippets } = await fetchBlogSnippets(row.name, region)
    await sleep(DELAY_MS)

    if (!snippets) {
      noSnippet++
    } else {
      const tags = extractTags(row.name, snippets)
      batchBuf.push({ id: row.id, blog_snippet: snippets.slice(0, 3000), blog_tags: tags })
    }

    // 배치 flush
    if (batchBuf.length >= BATCH_SIZE || (i === rows.length - 1 && batchBuf.length > 0)) {
      await Promise.all(batchBuf.map(r =>
        supabase.from('hagwon_db').update({
          blog_snippet: r.blog_snippet,
          blog_tags:    r.blog_tags,
        }).eq('id', r.id)
      ))
      success += batchBuf.length
      batchBuf.length = 0
    }

    if ((i + 1) % 100 === 0 || i === rows.length - 1) {
      console.log(`[진행] ${i + 1}/${total} (성공: ${success}, 스니펫없음: ${noSnippet}, 실패: ${failed})`)
    }
  }

  console.log(`\n완료: 성공 ${success}건, 스니펫없음 ${noSnippet}건, 실패 ${failed}건`)
}

main().catch(err => { console.error(err); process.exit(1) })
