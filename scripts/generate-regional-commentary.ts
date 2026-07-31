/**
 * 지역별 주간 실거래 AI 코멘트 생성 배치.
 *
 * regional_commentary 테이블(20260731000004)에 upsert 한다.
 * realtrade-story 홈 피드가 이 결과를 anon 으로 읽어 "이번 주 OO 실거래 요약"으로 노출한다 —
 * 그쪽 저장소는 아키텍처상 외부 AI API를 직접 호출하지 않으므로(컴포넌트 경계) 생성은 여기서 한다.
 *
 * 구조는 scripts/generate-complex-commentary.ts 를 그대로 따랐다(Groq 우선 → Gemini 폴백,
 * 동시성 제한, service_role 클라이언트).
 *
 * [src/lib/ai/regional-commentary.ts 의 CommentaryInput 을 재사용하지 않은 이유]
 * 그 타입은 PIR·HAI·주담대금리·인구추이·리스크등급까지 30개 필드를 요구하는 **투자분석용**이고,
 * 조립 코드가 src/app/invest/region/[sggCode]/page.tsx 안에 15개 소스로 흩어져 있어 스크립트로
 * 추출할 수 없다(추출하면 페이지와 이중 유지보수가 된다).
 * 이 배치가 만들려는 건 "이번 주 이 지역에서 무슨 거래가 있었나"라는 **실거래 요약**이라
 * 초점 자체가 다르다 — transactions/complexes 만으로 충분하고, realtrade-story 홈이 이미
 * 숫자로 보여주는 지표(거래량·평당가·최고가·신고가·상승하락 단지수)를 AI가 문장으로 풀어주는 역할이다.
 *
 * 필요 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (GROQ_API_KEY | GEMINI_API_KEY)
 *
 * 사용:
 *   npx tsx scripts/generate-regional-commentary.ts                 # 지난주, 운영 6개 지역
 *   npx tsx scripts/generate-regional-commentary.ts --dry-run       # DB 쓰지 않고 출력만
 *   npx tsx scripts/generate-regional-commentary.ts --week-start=2026-07-20
 */
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

/** realtrade-story 운영 권역과 동일 — 창원 5구 + 김해 */
const REGIONS: { sggCode: string; label: string }[] = [
  { sggCode: '48121', label: '창원시 의창구' },
  { sggCode: '48123', label: '창원시 성산구' },
  { sggCode: '48125', label: '창원시 마산합포구' },
  { sggCode: '48127', label: '창원시 마산회원구' },
  { sggCode: '48129', label: '창원시 진해구' },
  { sggCode: '48250', label: '김해시' },
]

const GROQ_MODEL = 'llama-3.1-8b-instant'
const GEMINI_MODEL = 'gemini-2.5-flash'
/** 이 건수 미만이면 코멘트를 만들지 않는다 — 2~3건으로 "시장 동향"을 서술하면 과잉 해석이 된다 */
const MIN_TX_FOR_COMMENTARY = 5

interface WeeklyStats {
  sggCode: string
  label: string
  periodStart: string
  periodEnd: string
  txCount: number
  prevTxCount: number
  avgPricePerPyeong: number | null
  prevAvgPricePerPyeong: number | null
  topDeal: { complexName: string; price: number; areaM2: number; floor: number | null } | null
  upComplexes: number
  downComplexes: number
}

/** "YYYY-MM-DD" 로 N일 전 */
function daysAgo(base: Date, n: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function pricePerPyeong(price: number, areaM2: number): number {
  return Math.round(price / (areaM2 / 3.3058))
}

function formatEok(price: number): string {
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString('ko-KR')}만원`
  if (uk > 0) return `${uk}억원`
  return `${price.toLocaleString('ko-KR')}만원`
}

/**
 * 프롬프트에 넣을 데이터 블록.
 * 값이 없으면 그 줄을 아예 빼서 모델이 null 을 지어내지 않게 한다.
 */
function buildPrompt(s: WeeklyStats): string {
  const lines: string[] = [
    `## ${s.label} (${s.periodStart} ~ ${s.periodEnd})`,
    `- 매매 거래: ${s.txCount}건 (직전 주 ${s.prevTxCount}건)`,
  ]
  if (s.avgPricePerPyeong != null) {
    const prev = s.prevAvgPricePerPyeong
    const delta =
      prev != null && prev > 0
        ? ` (직전 주 ${prev.toLocaleString('ko-KR')}만원, ${(((s.avgPricePerPyeong - prev) / prev) * 100).toFixed(1)}%)`
        : ''
    lines.push(`- 평균 평당가: ${s.avgPricePerPyeong.toLocaleString('ko-KR')}만원${delta}`)
  }
  if (s.topDeal) {
    const py = Math.round(s.topDeal.areaM2 / 3.3058)
    lines.push(
      `- 최고가 거래: ${s.topDeal.complexName} ${py}평${s.topDeal.floor != null ? ` ${s.topDeal.floor}층` : ''} ${formatEok(s.topDeal.price)}`,
    )
  }
  lines.push(`- 최근 30일 기준 상승 단지 ${s.upComplexes}곳 / 하락 단지 ${s.downComplexes}곳`)

  return `당신은 지역 부동산 실거래 데이터를 정리하는 기자입니다. 아래 데이터로 ${s.label}의 이번 주 실거래 동향을 2~3문장으로 정리해주세요.

${lines.join('\n')}

작성 지침:
- 데이터에 있는 수치만 사용하세요. 데이터에 없는 사실을 추측하거나 덧붙이지 마세요.
- 거래량 변화와 최고가 거래를 중심으로 사실을 전달하세요.
- 투자 권유·전망·조언 표현 절대 금지("사기 좋은", "지금이 기회", "오를 것으로 보인다" 등). 일어난 일만 서술하세요.
- 상승/하락 단지 수는 "최근 30일 변동률 기준"임을 밝히세요.
- 2~3문장, 한국어, 해요체.`
}

async function fetchWeeklyStats(
  supabase: ReturnType<typeof createClient>,
  region: { sggCode: string; label: string },
  periodStart: string,
  periodEnd: string,
): Promise<WeeklyStats> {
  const prevStart = daysAgo(new Date(periodStart), 7)

  const baseFilter = (q: any) =>
    q
      .eq('sgg_code', region.sggCode)
      .eq('deal_type', 'sale')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .not('price', 'is', null)

  const [thisWeek, prevWeek, up, down] = await Promise.all([
    baseFilter(supabase.from('transactions').select('price, area_m2, floor, complex_id'))
      .gte('deal_date', periodStart)
      .lte('deal_date', periodEnd),
    baseFilter(supabase.from('transactions').select('price, area_m2'))
      .gte('deal_date', prevStart)
      .lt('deal_date', periodStart),
    supabase
      .from('complexes')
      .select('id', { count: 'exact', head: true })
      .eq('sgg_code', region.sggCode)
      .eq('status', 'active')
      .gt('price_change_30d', 0),
    supabase
      .from('complexes')
      .select('id', { count: 'exact', head: true })
      .eq('sgg_code', region.sggCode)
      .eq('status', 'active')
      .lt('price_change_30d', 0),
  ])

  const rows = (thisWeek.data ?? []) as { price: number; area_m2: number; floor: number | null; complex_id: string | null }[]
  const prevRows = (prevWeek.data ?? []) as { price: number; area_m2: number }[]

  const avgOf = (list: { price: number; area_m2: number }[]) =>
    list.length === 0 ? null : Math.round(list.reduce((sum, r) => sum + pricePerPyeong(r.price, r.area_m2), 0) / list.length)

  // 최고가 거래 1건 + 단지명
  let topDeal: WeeklyStats['topDeal'] = null
  const top = [...rows].sort((a, b) => b.price - a.price)[0]
  if (top?.complex_id) {
    const { data: complex } = await supabase
      .from('complexes')
      .select('canonical_name')
      .eq('id', top.complex_id)
      .maybeSingle()
    const name = (complex as { canonical_name: string } | null)?.canonical_name
    if (name) topDeal = { complexName: name, price: top.price, areaM2: top.area_m2, floor: top.floor }
  }

  return {
    sggCode: region.sggCode,
    label: region.label,
    periodStart,
    periodEnd,
    txCount: rows.length,
    prevTxCount: prevRows.length,
    avgPricePerPyeong: avgOf(rows),
    prevAvgPricePerPyeong: avgOf(prevRows),
    topDeal,
    upComplexes: up.count ?? 0,
    downComplexes: down.count ?? 0,
  }
}

async function callModel(prompt: string): Promise<{ text: string; model: string } | null> {
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey })
      const res = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 400,
      })
      const text = res.choices[0]?.message?.content?.trim()
      if (text) return { text, model: GROQ_MODEL }
    } catch (err) {
      console.error('[regional-commentary] Groq 실패, Gemini로 폴백:', err)
    }
  }

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey)
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
      const result = await model.generateContent(prompt)
      const text = result.response.text().trim()
      if (text) return { text, model: GEMINI_MODEL }
    } catch (err) {
      console.error('[regional-commentary] Gemini 호출 실패:', err)
    }
  }

  return null
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const weekStartArg = args.find((a) => a.startsWith('--week-start='))?.split('=')[1]

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.')
    process.exit(1)
  }
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error('[ERROR] GROQ_API_KEY 또는 GEMINI_API_KEY 중 하나가 필요합니다.')
    process.exit(1)
  }

  // 기본값: 지난주 월요일 ~ 일요일. 크론이 월요일에 돌므로 "직전 완결 주"를 대상으로 한다.
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay() // 월=1 … 일=7
  const periodStart = weekStartArg ?? daysAgo(now, dayOfWeek - 1 + 7)
  const periodEnd = daysAgo(new Date(periodStart), -6)

  console.log(`[regional-commentary] 대상 기간: ${periodStart} ~ ${periodEnd}${dryRun ? ' (dry-run)' : ''}`)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const region of REGIONS) {
    const stats = await fetchWeeklyStats(supabase, region, periodStart, periodEnd)

    if (stats.txCount < MIN_TX_FOR_COMMENTARY) {
      console.log(`  - ${region.label}: 거래 ${stats.txCount}건 — 최소 ${MIN_TX_FOR_COMMENTARY}건 미만이라 건너뜀`)
      skipped++
      continue
    }

    const result = await callModel(buildPrompt(stats))
    if (!result) {
      console.error(`  ✗ ${region.label}: 모델 호출 실패`)
      failed++
      continue
    }

    console.log(`  ✓ ${region.label} [${result.model}] ${result.text.slice(0, 60)}…`)

    if (dryRun) {
      ok++
      continue
    }

    const { error } = await supabase.from('regional_commentary').upsert(
      {
        sgg_code: stats.sggCode,
        area_bucket: null,
        period_type: 'weekly',
        period_start: stats.periodStart,
        period_end: stats.periodEnd,
        headline: null,
        body: result.text,
        model_name: result.model,
        input_snapshot: stats,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'sgg_code,area_bucket,period_type,period_start' },
    )
    if (error) {
      console.error(`  ✗ ${region.label}: upsert 실패 — ${error.message}`)
      failed++
      continue
    }
    ok++

    // 무료 티어 rate limit 여유
    await new Promise((r) => setTimeout(r, 400))
  }

  console.log(`[regional-commentary] 완료 — 성공 ${ok} / 건너뜀 ${skipped} / 실패 ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[regional-commentary] 예외 종료:', err)
  process.exit(1)
})
