/**
 * 단지별 AI 코멘트 배치 스크립트
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/generate-complex-commentary.ts [options]
 *
 * 옵션:
 *   --area-bucket=84   면적 버킷 (소형|59|74|84|대형, 기본: 84)
 *   --limit=200        처리 최대 건수 (0=전체, 기본: 200)
 *   --dry-run          프롬프트 출력만, DB 저장 안 함
 *   --verbose          각 단지 코멘트 콘솔 출력
 *
 * 필요 환경변수: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import { fileURLToPath } from 'url'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComplexCommentaryInput {
  complex_id:          string
  area_bucket:         string
  complex_name:        string
  si:                  string | null
  gu:                  string | null
  built_year:          number | null
  household_count:     number | null
  near_price:          number | null
  far_price:           number | null
  change_pct:          number | null
  avg_mape:            number | null
  model_name:          string | null
  training_count:      number | null
  jeonse_ratio:        number | null
  gap_amount:          number | null
  gap_risk_level:      string | null
  price_change_30d:    number | null
  tx_count_30d:        number | null
  avg_sale_per_pyeong: number | null
  hagwon_score:        number | null
  management_cost_m2:  number | null
  primary_school_name: string | null
  students_per_class:  number | null
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, fn: (v: number) => string): string {
  return val != null ? fn(val) : '—'
}

function gapRiskKo(level: string | null): string {
  if (level === 'safe')    return '안전'
  if (level === 'caution') return '주의'
  if (level === 'danger')  return '위험'
  return '—'
}

export function buildComplexPrompt(row: ComplexCommentaryInput): string {
  const currentYear = new Date().getFullYear()
  const areaLabel =
    row.area_bucket === '소형' || row.area_bucket === '대형'
      ? row.area_bucket
      : `${row.area_bucket}㎡`
  const age = row.built_year != null ? currentYear - row.built_year : null

  return [
    `당신은 단지별 아파트 시장 분석 전문가입니다.`,
    `아래 데이터를 바탕으로 ${row.complex_name} 아파트 (${areaLabel})를 2문장으로 분석하세요.`,
    '',
    '## 예측',
    `- 6개월 예측 변화율: ${fmt(row.change_pct, v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)} (모델: ${row.model_name ?? '—'}, MAPE ${fmt(row.avg_mape, v => `${(v * 100).toFixed(1)}%`)}, 학습 ${row.training_count ?? '—'}개월)`,
    `- 현재→6개월 후: ${fmt(row.near_price, v => `${v.toLocaleString('ko-KR')}만원`)} → ${fmt(row.far_price, v => `${v.toLocaleString('ko-KR')}만원`)}`,
    '',
    '## 시장 신호',
    `- 전세가율: ${fmt(row.jeonse_ratio, v => `${v.toFixed(1)}%`)} (갭 위험도: ${gapRiskKo(row.gap_risk_level)})`,
    `- 최근 30일: 거래 ${row.tx_count_30d ?? '—'}건, 가격 ${fmt(row.price_change_30d, v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`)}%`,
    `- 평당 매매가: ${fmt(row.avg_sale_per_pyeong || null, v => `${v.toFixed(0)}만원`)}`,
    '',
    '## 단지 특성',
    `- 건축: ${row.built_year ?? '—'}년 (약 ${age ?? '—'}년), ${row.household_count ?? '—'}세대`,
    `- 관리비: ${fmt(row.management_cost_m2, v => `${v.toFixed(0)}원/㎡`)}`,
    '',
    '## 학군',
    `- 배정 초등: ${row.primary_school_name ?? '—'} (학급당 ${row.students_per_class != null ? row.students_per_class.toFixed(0) : '—'}명)`,
    `- 학원 점수: ${row.hagwon_score ?? '—'}`,
    '',
    '작성 지침:',
    '- 수치를 직접 인용하세요.',
    '- 예측 방향 근거가 되는 가장 두드러진 요소 1~2가지를 선택하세요.',
    '- 주목할 리스크(전세가율 80%↑, 노후 20년↑, 거래 희소) 또는 강점(500세대↑ 대단지, 학군, 신축 15년↓)을 1가지 언급하세요.',
    '- 투자 권유 표현 절대 금지. 2문장, 한국어.',
  ].join('\n')
}

// ─── CLI Parsing ──────────────────────────────────────────────────────────────

interface CliArgs {
  areaBucket: string
  limit:      number
  dryRun:     boolean
  verbose:    boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { areaBucket: '84', limit: 200, dryRun: false, verbose: false }
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--area-bucket=')) args.areaBucket = arg.split('=')[1] ?? '84'
    else if (arg.startsWith('--limit='))    args.limit      = parseInt(arg.split('=')[1] ?? '200', 10)
    else if (arg === '--dry-run')           args.dryRun     = true
    else if (arg === '--verbose')           args.verbose    = true
  }
  return args
}

// ─── Retry Helper ────────────────────────────────────────────────────────────

async function retryGenerate(
  fn: () => Promise<string>,
  maxRetries = 4,
  baseDelayMs = 2000,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const is503 = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('overloaded') || msg.includes('rate_limit_exceeded') || msg.includes('Rate limit')
      if (!is503 || attempt === maxRetries) throw err
      const wait = baseDelayMs * Math.pow(2, attempt)
      await new Promise<void>(r => setTimeout(r, wait))
    }
  }
  throw new Error('unreachable')
}

// ─── Concurrency Helper ───────────────────────────────────────────────────────

async function runConcurrent<T, R>(
  items:       T[],
  concurrency: number,
  delayMs:     number,
  fn:          (item: T) => Promise<R>,
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey   = process.env.GEMINI_API_KEY

  const groqKey = process.env.GROQ_API_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.')
    process.exit(1)
  }
  if (!groqKey && !geminiKey) {
    console.error('[ERROR] GROQ_API_KEY 또는 GEMINI_API_KEY 중 하나가 필요합니다.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Groq 우선 (무료), Gemini fallback
  let generate: (prompt: string) => Promise<string>
  if (groqKey) {
    const groq = new Groq({ apiKey: groqKey })
    console.log('[INFO] Groq (llama-3.1-8b-instant) 사용')
    generate = async (prompt: string) => {
      const res = await groq.chat.completions.create({
        model:       'llama-3.1-8b-instant',
        messages:    [
          { role: 'system', content: '정확히 2문장만 출력하세요. 불필요한 서두나 반복 없이 바로 분석 내용만 작성하세요.' },
          { role: 'user',   content: prompt },
        ],
        max_tokens:  200,
        temperature: 0.4,
      })
      return res.choices[0]?.message?.content?.trim() ?? ''
    }
  } else {
    const genAI = new GoogleGenerativeAI(geminiKey!)
    const gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    console.log('[INFO] Gemini (gemini-2.5-flash) 사용')
    generate = async (prompt: string) => {
      const result = await gemini.generateContent(prompt)
      return result.response.text().trim()
    }
  }

  console.log(`[START] area_bucket=${args.areaBucket} limit=${args.limit} dry-run=${args.dryRun}`)

  const PAGE_SIZE  = 100
  const STALE_DAYS = 35

  let offset      = 0
  let processed   = 0
  let success     = 0
  let failed      = 0
  let skipped     = 0
  let allRows: ComplexCommentaryInput[] = []

  while (true) {
    const fetchLimit = args.limit > 0
      ? Math.min(PAGE_SIZE, args.limit - allRows.length)
      : PAGE_SIZE

    if (fetchLimit <= 0) break

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      'get_complex_commentary_batch_inputs',
      {
        p_area_bucket: args.areaBucket,
        p_stale_days:  STALE_DAYS,
        p_limit:       fetchLimit,
        p_offset:      offset,
      },
    )

    if (error) {
      console.error('[ERROR] RPC 호출 실패:', error.message)
      process.exit(1)
    }

    const rows = (data ?? []) as ComplexCommentaryInput[]
    if (rows.length === 0) break

    allRows.push(...rows)
    offset += rows.length

    if (rows.length < fetchLimit) break
  }

  console.log(`[FETCH] ${allRows.length}건 조회 완료`)

  if (args.dryRun) {
    for (const row of allRows) {
      console.log(`\n── ${row.complex_name} (${row.area_bucket}) ──`)
      console.log(buildComplexPrompt(row))
    }
    console.log(`\n[DRY-RUN] 총 ${allRows.length}건 프롬프트 출력 완료`)
    return
  }

  // Groq: 30 RPM → concurrency 3, 300ms 간격 (분당 최대 18건)
  // Gemini: concurrency 5, 200ms
  const concurrency = groqKey ? 3 : 5
  const delayMs     = groqKey ? 300 : 200

  const results = await runConcurrent(
    allRows,
    concurrency,
    delayMs,
    async (row) => {
      processed++
      const prompt = buildComplexPrompt(row)

      let commentary: string
      try {
        commentary = await retryGenerate(() => generate(prompt))
      } catch (err) {
        console.error(`[FAIL] ${row.complex_name}:`, err instanceof Error ? err.message : String(err))
        failed++
        return
      }

      if (!commentary) {
        console.warn(`[SKIP] ${row.complex_name}: 빈 응답`)
        skipped++
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('complex_price_predictions')
        .update({
          ai_commentary: commentary,
          ai_cached_at:  new Date().toISOString(),
        })
        .eq('complex_id',  row.complex_id)
        .eq('area_bucket', row.area_bucket)

      if (updateError) {
        console.error(`[FAIL] DB 업데이트 실패 ${row.complex_name}:`, updateError.message)
        failed++
        return
      }

      success++
      if (args.verbose) {
        console.log(`[OK] ${row.complex_name} (${row.area_bucket}): ${commentary}`)
      }
    },
  )

  const totalProcessed = results.length
  console.log(`\n[DONE] 완료: ${success}건 / 실패: ${failed}건 / 건너뜀: ${skipped}건 / 전체: ${totalProcessed}건`)

  if (failed > 0) process.exit(1)
}

const scriptFile = fileURLToPath(import.meta.url)
if (process.argv[1] === scriptFile) {
  main().catch(err => {
    console.error('[FATAL]', err)
    process.exit(1)
  })
}
