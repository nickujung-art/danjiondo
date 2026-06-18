/**
 * Groq llama-3.1-8b-instant 학원 분류 배치
 *
 * hagwon_db의 realm_sc_nm, le_crse_nm을 기반으로
 * age_groups / subject_category / teaching_style을 분류하여 저장.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts
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
const VALID_CAT = ['academic', 'arts', 'sports', 'language'] as const
const VALID_STY = ['exam_prep', 'enrichment', 'tutoring'] as const

type AgeGroup       = typeof VALID_AGE[number]
type SubjectCategory = typeof VALID_CAT[number]
type TeachingStyle  = typeof VALID_STY[number]

interface ClassifyResult {
  age_groups:       AgeGroup[]
  subject_category: SubjectCategory | null
  teaching_style:   TeachingStyle | null
}

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
{"age_groups":["유아","유치","초등저","초등고","중등","고등"] 중 해당 항목만 배열로,"subject_category":"academic" | "arts" | "sports" | "language" 중 하나,"teaching_style":"exam_prep" | "enrichment" | "tutoring" 중 하나}`
}

const DEFAULT_RESULT: ClassifyResult = { age_groups: [], subject_category: null, teaching_style: null }

async function classify(name: string, realm: string | null, crse: string | null): Promise<ClassifyResult> {
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

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  let query = supabase
    .from('hagwon_db')
    .select('id, name, realm_sc_nm, le_crse_nm')
    .eq('is_active', true)

  if (MISSING_ONLY) {
    query = query.eq('age_groups', '{}')
  }
  if (LIMIT > 0) {
    query = query.limit(LIMIT)
  }

  const { data: rows, error } = await query
  if (error) {
    console.error('hagwon_db 조회 실패:', error.message)
    process.exit(1)
  }
  if (!rows?.length) {
    console.log('분류할 학원 없음')
    return
  }

  const total = rows.length
  console.log(`분류 시작: ${total}건 (concurrency=${CONCURRENCY})`)

  if (DRY_RUN) {
    const sample = rows.slice(0, 3)
    for (const row of sample) {
      const result = await classify(row.name, row.realm_sc_nm, row.le_crse_nm)
      console.log(`[dry-run] ${row.name} →`, JSON.stringify(result))
    }
    return
  }

  let success = 0
  let failed  = 0

  const classifyRow = async (row: typeof rows[number]) => {
    const result = await classify(row.name, row.realm_sc_nm, row.le_crse_nm)
    return { id: row.id, result }
  }

  // 50건씩 배치 처리
  const BATCH = 50
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
    const batchRows = rows.slice(batchStart, batchStart + BATCH)
    const settled = await runConcurrent(batchRows, CONCURRENCY, DELAY_MS, classifyRow)

    const upsertData = settled
      .filter((r): r is PromiseFulfilledResult<{ id: string; result: ClassifyResult }> => r.status === 'fulfilled')
      .map(r => ({
        id:               r.value.id,
        age_groups:       r.value.result.age_groups,
        subject_category: r.value.result.subject_category,
        teaching_style:   r.value.result.teaching_style,
      }))

    failed += settled.filter(r => r.status === 'rejected').length

    if (upsertData.length > 0) {
      const { error: upsertErr } = await supabase
        .from('hagwon_db')
        .upsert(upsertData, { onConflict: 'id' })
      if (upsertErr) {
        console.error('upsert 오류:', upsertErr.message)
      } else {
        success += upsertData.length
      }
    }

    if ((batchStart + BATCH) % 100 === 0 || batchStart + BATCH >= rows.length) {
      console.log(`[진행] ${Math.min(batchStart + BATCH, total)}/${total} 완료 (성공: ${success}, 실패: ${failed})`)
    }
  }

  console.log(`\n완료: 성공 ${success}건, 실패 ${failed}건`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
