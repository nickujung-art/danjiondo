/**
 * 기존 blog_snippet에서 blog_tags 재분류 (API 호출 없음)
 *
 * collect-hagwon-blog-tags.ts의 TAG_RULES를 업데이트한 뒤
 * 이미 수집된 blog_snippet에 새 규칙을 적용해 blog_tags를 갱신한다.
 * 네이버 API 쿼터 소모 없음.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/reclassify-blog-tags.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/reclassify-blog-tags.ts
 *   npx tsx --env-file=.env.local scripts/reclassify-blog-tags.ts --limit=100
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN   = process.argv.includes('--dry-run')
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 0
const BATCH     = 200

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// collect-hagwon-blog-tags.ts와 동기화 유지
const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  // 대상
  { tag: '#초등전문',     keywords: ['초등', '초등학생', '초1', '초2', '초3', '초4', '초5', '초6'] },
  { tag: '#중등전문',     keywords: ['중등', '중학생', '중학교', '중1', '중2', '중3'] },
  { tag: '#고등전문',     keywords: ['고등', '고등학생', '고등학교', '고1', '고2', '고3', '수능'] },
  { tag: '#입시전문',     keywords: ['입시', '대입', '수시', '정시', '특기', '의대'] },
  { tag: '#유아전문',     keywords: ['유아', '유치원', '7세', '6세', '5세', '영유아'] },
  { tag: '#성인가능',     keywords: ['성인', '직장인', '성인부', '성인반', '성인레슨', '어른'] },
  // 관리방식
  { tag: '#소수정예',     keywords: ['소수정예', '소수', '정예', '1:1', '일대일', '1대1'] },
  { tag: '#개별관리',     keywords: ['개별 관리', '개별관리', '맞춤 지도', '맞춤지도', '개인 맞춤', '1:1 맞춤'] },
  { tag: '#빡센관리',     keywords: ['빡센', '엄격', '철저', '숙제 많', '과제 많'] },
  { tag: '#꼼꼼한관리',   keywords: ['꼼꼼히', '꼼꼼한', '꼼꼼하게', '꼼꼼히 관리', '세심하게'] },
  // 수업방식
  { tag: '#개념중심',     keywords: ['개념', '개념 이해', '원리', '기초'] },
  { tag: '#사고력중심',   keywords: ['사고력', '사유', '생각하는 힘', '창의', '스스로 생각', '논리적'] },
  { tag: '#문제풀이',     keywords: ['문제풀이', '문제 풀이', '서술형', '유형'] },
  { tag: '#내신전문',     keywords: ['내신', '내신 고득점', '내신 관리', '내신 성적', '내신 전문', '내신까지'] },
  { tag: '#반복훈련',     keywords: ['반복', '훈련', '연습', '드릴'] },
  { tag: '#재미있는수업', keywords: ['재미있', '즐겁게', '즐겁고', '재미있게', '흥미롭'] },
  // 선생님
  { tag: '#친절한선생님', keywords: ['친절', '친절한', '선생님이 좋', '선생님이 친', '다정'] },
  { tag: '#경력선생님',   keywords: ['경력', '경험', '베테랑', '전문 선생'] },
  { tag: '#명문대강사',   keywords: ['서울대', '연세대', '고려대', 'SKY', '카이스트', '포스텍', '명문대 출신', '명문대 강사'] },
  // 결과
  { tag: '#성적향상',     keywords: ['성적 향상', '성적향상', '성적 올', '성적이 오', '점수 향상', '등급 상승', '개월 만에', '만에 성적'] },
  // 특징
  { tag: '#시설좋음',     keywords: ['시설', '넓', '쾌적', '깔끔', '깨끗'] },
  { tag: '#체계적커리큘럼', keywords: ['체계', '커리큘럼', '교재', '시스템'] },
]

function extractTags(hagwonName: string, snippets: string): string[] {
  if (!snippets.trim()) return []
  const lines = snippets
    .split('\n')
    .filter(l => l.includes(hagwonName) || l.length < 80)
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
  type Row = { id: string; name: string; blog_snippet: string }
  const rows: Row[] = []
  const PAGE = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('hagwon_db')
      .select('id, name, blog_snippet')
      .eq('is_active', true)
      .not('blog_snippet', 'is', null)
      .order('id')
      .range(offset, offset + PAGE - 1)

    if (error) { console.error('조회 실패:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE || (LIMIT > 0 && rows.length >= LIMIT)) break
    offset += PAGE
  }

  if (LIMIT > 0) rows.length = Math.min(rows.length, LIMIT)
  if (!rows.length) { console.log('대상 없음'); return }

  console.log(`재분류 시작: ${rows.length}건 (dry-run=${DRY_RUN})`)

  let success = 0, failed = 0
  const tagCounts: Record<string, number> = {}

  if (DRY_RUN) {
    for (const row of rows.slice(0, 5)) {
      const tags = extractTags(row.name, row.blog_snippet)
      console.log(`${row.name}: ${tags.join(', ') || '(없음)'}`)
      tags.forEach(t => { tagCounts[t] = (tagCounts[t] ?? 0) + 1 })
    }
    return
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await Promise.all(batch.map(async row => {
      const tags = extractTags(row.name, row.blog_snippet)
      tags.forEach(t => { tagCounts[t] = (tagCounts[t] ?? 0) + 1 })
      const { error } = await supabase
        .from('hagwon_db')
        .update({ blog_tags: tags })
        .eq('id', row.id)
      if (error) { failed++; console.error(`update 오류 [${row.name}]:`, error.message) }
      else success++
    }))
    console.log(`[진행] ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }

  console.log(`\n완료: 성공 ${success}건, 실패 ${failed}건`)
  console.log('\n태그 분포:')
  Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([tag, cnt]) => console.log(`  ${tag}: ${cnt}건`))
}

main().catch(err => { console.error(err); process.exit(1) })
