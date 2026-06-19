/**
 * Groq llama-3.1-8b-instant 학원 분류 배치 (규칙기반 + LLM 하이브리드)
 *
 * 1단계: ruleBasedClassify() — realm_sc_nm·학원명·le_crse_nm 기반 규칙 분류
 * 2단계: 규칙 미적용 건만 Groq LLM 호출 (API 비용·속도 절감)
 *
 * naver_blog_count: 분류 결과 저장 후 UI 추천 가중치로 활용 예정
 *   (높을수록 검색 노출 많음 → 인기 학원 우선 노출)
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts --dry-run --limit=10
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts --all
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts --limit=100
 */

import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN      = process.argv.includes('--dry-run')
const MISSING_ONLY = !process.argv.includes('--all')
const LIMIT_ARG    = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT        = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 0

const CONCURRENCY = 3
const DELAY_MS    = 300

const VALID_AGE = ['유아', '유치', '초등저', '초등고', '중등', '고등'] as const
const VALID_CAT = ['exam_prep', 'korean', 'math', 'english', 'arts', 'sports', 'other_language'] as const
const VALID_STY = ['exam_prep', 'enrichment', 'tutoring'] as const

type AgeGroup        = typeof VALID_AGE[number]
type SubjectCategory = typeof VALID_CAT[number]
type TeachingStyle   = typeof VALID_STY[number]

interface ClassifyResult {
  age_groups:       AgeGroup[]
  subject_category: SubjectCategory | null
  teaching_style:   TeachingStyle | null
}

// ─── 규칙 기반 분류 ─────────────────────────────────────────────────────────

/**
 * 학원명 키워드 기반 subject_category 판별.
 * 순서가 우선순위 — 위에 있을수록 먼저 매칭.
 */
function matchNameKeyword(name: string): SubjectCategory | null {
  const n = name.toLowerCase()

  // 스포츠(체육 전문) — arts 보다 먼저 확인
  const sportsKw = [
    '태권도', '합기도', '유도', '검도', '씨름', '수영', '축구', '농구', '야구',
    '배드민턴', '테니스', '골프', '볼링', '스쿼시', '필라테스', '요가', '체조', '체육관',
    '복싱', '킥복싱', '무에타이', '주짓수', '레슬링', '펜싱', '승마', '스케이트', '빙상',
  ]
  if (sportsKw.some(k => n.includes(k))) return 'sports'

  // 예체능 (음악·미술·무용)
  const artsKw = [
    '미술', '음악', '피아노', '바이올린', '첼로', '플루트', '클라리넷', '오보에', '트럼펫',
    '드럼', '기타', '우쿨렐레', '보컬', '성악', '합창', '발레', '무용', '댄스', '방송댄스',
    '그림', '한국화', '서예', '도예', '공예', '웹툰', '만화', '사진', '영상', '연기', '연극',
    '뮤지컬', '클래식', '오케스트라', '현악', '관악', '타악', '가야금', '해금', '대금', '거문고',
  ]
  if (artsKw.some(k => n.includes(k))) return 'arts'

  // 수학
  const mathKw = ['수학', 'math', '수리', '연산', '알고리즘수학', '수학학원']
  if (mathKw.some(k => n.includes(k.toLowerCase()))) return 'math'

  // 영어 — '영수' 복합은 exam_prep으로
  const englishKw = [
    '영어', 'english', '어학', '원어민', '스피킹', '토익', '토플',
    'ielts', 'toeic', 'toefl', '영어학원', '영어회화',
  ]
  if (englishKw.some(k => n.includes(k.toLowerCase()))) {
    if (n.includes('영수')) return 'exam_prep'
    return 'english'
  }

  // 국어·논술
  const koreanKw = ['국어', '논술', '독서', '글쓰기', '작문', '문해력', '한문', '독해', '국어학원']
  if (koreanKw.some(k => n.includes(k))) return 'korean'

  // 입시종합 (수학·영어 단일과목이 아닌 종합형)
  const examKw = ['입시', '종합', '통합', '수능', 'sky', '내신', 'sat', '입시학원', '보습', '영수', '수영어']
  if (examKw.some(k => n.includes(k.toLowerCase()))) return 'exam_prep'

  // 외국어 (영어 제외)
  const langKw = ['일본어', '중국어', '한자', '프랑스어', '독일어', '스페인어', '러시아어', '베트남어', '아랍어', '외국어']
  if (langKw.some(k => n.includes(k))) return 'other_language'

  // 코딩·IT
  const itKw = ['코딩', 'coding', '컴퓨터', '프로그래밍', '로봇', ' sw', ' ai', '소프트웨어']
  if (itKw.some(k => n.includes(k.toLowerCase()))) return 'other_language'

  return null
}

/**
 * le_crse_nm(교습과정) 기반 subject_category 보조 판별.
 */
function matchCrseKeyword(crse: string): SubjectCategory | null {
  const c = crse.trim()
  if (['수학', '과학', '수학·과학'].includes(c)) return 'math'
  if (['영어', '영어회화', '영어독해', '영어·수학'].includes(c)) {
    return c === '영어·수학' ? 'exam_prep' : 'english'
  }
  if (['국어', '논술', '한국어', '국어·논술'].includes(c)) return 'korean'
  if (['음악', '미술', '무용', '발레', '연기', '성악', '피아노'].includes(c)) return 'arts'
  if (['태권도', '체육', '수영', '축구', '무술'].includes(c)) return 'sports'
  if (['입시', '보통교과', '검정고시', '수능'].includes(c)) return 'exam_prep'
  if (['컴퓨터', 'IT', '코딩', '정보', '소프트웨어', '로봇'].includes(c)) return 'other_language'
  if (['일본어', '중국어', '프랑스어', '독일어', '스페인어', '러시아어'].includes(c)) return 'other_language'
  return null
}

/**
 * teaching_style 규칙 결정.
 */
function deriveTeachingStyle(cat: SubjectCategory | null): TeachingStyle | null {
  if (cat === null) return null
  if (cat === 'arts' || cat === 'sports') return 'enrichment'
  if (cat === 'exam_prep') return 'exam_prep'
  return 'tutoring'
}

/**
 * age_groups 규칙 결정.
 */
function deriveAgeGroups(name: string, realm: string | null): AgeGroup[] {
  // 독서실 → 중·고등
  if (realm === '독서실') return ['중등', '고등']

  const n = name.toLowerCase()
  const ages: Set<AgeGroup> = new Set()

  // 유아·유치 키워드
  const infantKw = ['유아', '영아', '유치', '영유아', '베이비', '아기', '어린이집']
  if (infantKw.some(k => n.includes(k))) {
    ages.add('유아')
    ages.add('유치')
  }

  // 예능(대)·기예(대) 계열은 유치~중등 중심 (입시 미술 제외 시 고등 빠짐)
  if (realm === '예능(대)' || realm === '기예(대)') {
    const examArtKw = ['입시', '내신', '수능', '대입']
    const isExamArt = examArtKw.some(k => name.includes(k))
    if (!isExamArt) {
      ages.add('초등저'); ages.add('초등고'); ages.add('중등')
      return Array.from(ages)
    }
  }

  // 기본 대상
  ages.add('초등저'); ages.add('초등고'); ages.add('중등'); ages.add('고등')
  return Array.from(ages)
}

/**
 * 규칙 기반 분류 메인 함수.
 * - 분류 가능 → ClassifyResult 반환
 * - 분류 불가(LLM 필요) → undefined 반환
 */
function ruleBasedClassify(
  name: string,
  realm: string | null,
  crse: string | null,
): ClassifyResult | undefined {
  const r = realm?.trim() ?? null
  const n = name.trim()
  const c = crse?.trim() ?? null

  // 독서실: subject_category null (시설이지 학원이 아님)
  if (r === '독서실') {
    return {
      age_groups:       ['중등', '고등'],
      subject_category: null,
      teaching_style:   null,
    }
  }

  let cat: SubjectCategory | null = null

  if (r === '예능(대)' || r === '기예(대)' || r === '예능') {
    // 예능 계열 내 스포츠·일반예능 구분
    const sportsRealmKw = ['태권도', '수영', '축구', '체육', '합기도', '유도', '검도', '복싱', '권투']
    cat = sportsRealmKw.some(k => n.includes(k)) ? 'sports' : 'arts'

  } else if (r === '국제화') {
    // 교습과정이 영어면 english, 아니면 other_language
    const isEnglish = c != null && ['영어', '영어회화', '영어독해', '영어청취'].some(ec => c.includes(ec))
    cat = isEnglish ? 'english' : 'other_language'

  } else if (r === '정보') {
    cat = 'other_language' // IT·컴퓨터 계열

  } else if (r === '인문사회(대)') {
    // 논술·국어 중심, 학원명으로 세분류
    cat = matchNameKeyword(n) ?? 'korean'

  } else if (r === '직업기술' || r === '기타(대)') {
    // 학원명으로 판단, 안 되면 LLM
    cat = matchNameKeyword(n)
    if (cat === null) return undefined

  } else if (r === '종합(대)') {
    // 학원명 → 교습과정 → 기본 exam_prep
    cat = matchNameKeyword(n) ?? (c ? matchCrseKeyword(c) : null) ?? 'exam_prep'

  } else if (r === '입시.검정 및 보습') {
    // 가장 많은 계열(57%) — 학원명+교습과정 기반 세분류
    cat = matchNameKeyword(n) ?? (c ? matchCrseKeyword(c) : null)
    // 분류 실패 → LLM
    if (cat === null) return undefined

  } else {
    // 알 수 없는 realm → 학원명으로 시도, 실패 시 LLM
    cat = matchNameKeyword(n) ?? (c ? matchCrseKeyword(c) : null)
    if (cat === null) return undefined
  }

  return {
    age_groups:       deriveAgeGroups(n, r),
    subject_category: cat,
    teaching_style:   deriveTeachingStyle(cat),
  }
}

// ─── LLM 분류 ────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

function buildClassifyPrompt(name: string, realm: string | null, crse: string | null): string {
  return `학원명: ${name}
교습계열: ${realm ?? '알 수 없음'}
교습과정: ${crse ?? '알 수 없음'}

아래 JSON만 출력 (설명 없음):
{"age_groups":["유아","유치","초등저","초등고","중등","고등"] 중 해당 항목만 배열로,"subject_category":"exam_prep"(입시) | "korean"(국어) | "math"(수학) | "english"(영어) | "arts"(미술·예체능) | "sports"(스포츠·운동) | "other_language"(기타외국어·IT) 중 하나,"teaching_style":"exam_prep" | "enrichment" | "tutoring" 중 하나}`
}

const DEFAULT_RESULT: ClassifyResult = { age_groups: [], subject_category: null, teaching_style: null }

async function classifyByLLM(name: string, realm: string | null, crse: string | null): Promise<ClassifyResult> {
  try {
    const res = await groq.chat.completions.create({
      model:           'llama-3.1-8b-instant',
      messages:        [{ role: 'user', content: buildClassifyPrompt(name, realm, crse) }],
      max_tokens:      120,
      temperature:     0.2,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
      age_groups?: string[]
      subject_category?: string
      teaching_style?: string
    }
    return {
      age_groups:       (parsed.age_groups ?? []).filter((a): a is AgeGroup => (VALID_AGE as readonly string[]).includes(a)),
      subject_category: (VALID_CAT as readonly string[]).includes(parsed.subject_category ?? '') ? parsed.subject_category as SubjectCategory : null,
      teaching_style:   (VALID_STY as readonly string[]).includes(parsed.teaching_style ?? '') ? parsed.teaching_style as TeachingStyle : null,
    }
  } catch {
    return DEFAULT_RESULT
  }
}

/**
 * 규칙 기반 시도 → undefined이면 LLM 호출 (하이브리드).
 */
async function classify(
  name: string,
  realm: string | null,
  crse: string | null,
): Promise<ClassifyResult & { source: 'rule' | 'llm' }> {
  const ruleResult = ruleBasedClassify(name, realm, crse)
  if (ruleResult !== undefined) {
    return { ...ruleResult, source: 'rule' }
  }
  const llmResult = await classifyByLLM(name, realm, crse)
  return { ...llmResult, source: 'llm' }
}

// ─── 동시 실행 유틸 ───────────────────────────────────────────────────────────

async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const settled = await Promise.allSettled(batch.map(fn))
    results.push(...settled)
    if (i + concurrency < items.length) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs))
    }
  }
  return results
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  type Row = { id: string; name: string; realm_sc_nm: string | null; le_crse_nm: string | null }
  const rows: Row[] = []
  const PAGE = 1000
  let offset = 0

  // PostgREST max_rows=1000 → 페이지네이션으로 전수 수집
  while (true) {
    let q = supabase.from('hagwon_db').select('id, name, realm_sc_nm, le_crse_nm').eq('is_active', true)
    if (MISSING_ONLY) q = q.is('subject_category', null)
    const { data, error } = await q.order('id').range(offset, offset + PAGE - 1)
    if (error) { console.error('hagwon_db 조회 실패:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE || (LIMIT > 0 && rows.length >= LIMIT)) break
    offset += PAGE
  }
  if (LIMIT > 0 && rows.length > LIMIT) rows.length = LIMIT
  if (!rows.length) { console.log('분류할 학원 없음'); return }

  const total = rows.length
  console.log(`분류 시작: ${total}건 (concurrency=${CONCURRENCY}, dry-run=${DRY_RUN}, missing-only=${MISSING_ONLY})`)

  // dry-run: 샘플 출력 후 종료
  if (DRY_RUN) {
    const sampleSize = Math.min(LIMIT > 0 ? LIMIT : 10, rows.length)
    let ruleCount = 0; let llmCount = 0
    console.log(`\n=== dry-run: 처음 ${sampleSize}건 ===`)
    for (const row of rows.slice(0, sampleSize)) {
      const result = await classify(row.name, row.realm_sc_nm, row.le_crse_nm)
      const { source, ...classifyResult } = result
      if (source === 'rule') ruleCount++; else llmCount++
      console.log(`[${source.padEnd(4)}] ${row.name.padEnd(24)} realm=${(row.realm_sc_nm ?? '-').padEnd(16)} crse=${row.le_crse_nm ?? '-'}`)
      console.log(`       → cat=${classifyResult.subject_category ?? 'null'} style=${classifyResult.teaching_style ?? 'null'} ages=${JSON.stringify(classifyResult.age_groups)}`)
    }
    console.log(`\n규칙 분류: ${ruleCount}건 / LLM 분류: ${llmCount}건 (예상 규칙률: ${Math.round(ruleCount / sampleSize * 100)}%)`)
    return
  }

  let success = 0
  let failed  = 0
  let ruleTotal = 0
  let llmTotal  = 0

  type ClassifyPayload = { id: string; result: ClassifyResult & { source: 'rule' | 'llm' } }

  const classifyRow = async (row: Row): Promise<ClassifyPayload> => {
    const result = await classify(row.name, row.realm_sc_nm, row.le_crse_nm)
    return { id: row.id, result }
  }

  // 50건씩 배치 처리
  const BATCH = 50
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batchRows = rows.slice(batchStart, batchStart + BATCH)
    const settled = await runConcurrent(batchRows, CONCURRENCY, DELAY_MS, classifyRow)

    const upsertData = settled
      .filter((r): r is PromiseFulfilledResult<ClassifyPayload> => r.status === 'fulfilled')
      .map(r => {
        if (r.value.result.source === 'rule') ruleTotal++; else llmTotal++
        return {
          id:               r.value.id,
          age_groups:       r.value.result.age_groups,
          subject_category: r.value.result.subject_category,
          teaching_style:   r.value.result.teaching_style,
        }
      })

    failed += settled.filter(r => r.status === 'rejected').length

    if (upsertData.length > 0) {
      // upsert는 NOT NULL 컬럼 INSERT 오류 발생 → 개별 update 사용
      await Promise.all(upsertData.map(async r => {
        const { error: updErr } = await supabase.from('hagwon_db').update({
          age_groups:       r.age_groups,
          subject_category: r.subject_category,
          teaching_style:   r.teaching_style,
        }).eq('id', r.id)
        if (updErr) { failed++; console.error('update 오류:', updErr.message) }
        else success++
      }))
    }

    if ((batchStart + BATCH) % 100 === 0 || batchStart + BATCH >= rows.length) {
      console.log(`[진행] ${Math.min(batchStart + BATCH, total)}/${total} 완료 (성공: ${success}, 실패: ${failed}, 규칙: ${ruleTotal}, LLM: ${llmTotal})`)
    }
  }

  console.log(`\n완료: 성공 ${success}건, 실패 ${failed}건`)
  console.log(`분류 방법: 규칙 기반 ${ruleTotal}건 / LLM ${llmTotal}건`)
  if (success > 0) {
    const ruleRate = Math.round(ruleTotal / success * 100)
    console.log(`규칙 분류율: ${ruleRate}% (LLM 절감: ${ruleRate}%)`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
