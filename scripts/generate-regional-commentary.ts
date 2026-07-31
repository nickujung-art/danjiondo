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
  // 증감은 **여기서 계산해 문장 형태로 준다**. 모델에게 뺄셈을 시키면 안 된다 —
  // 2026-07-31 dry-run에서 llama-3.1-8b가 28건 vs 27건(=1건 증가)을 "1건 줄었어요"로
  // 뒤집어 서술했다(같은 데이터로 두 번 돌렸을 때 방향이 서로 반대로 나옴). 실거래 데이터
  // 사이트에서 수치 방향이 뒤집히는 건 치명적이라, 산술은 전부 코드가 하고 모델은 문장만 만든다.
  const diff = s.txCount - s.prevTxCount
  const diffPhrase =
    diff === 0 ? '직전 주와 같음' : diff > 0 ? `직전 주보다 ${diff}건 증가` : `직전 주보다 ${Math.abs(diff)}건 감소`

  const lines: string[] = [
    `## ${s.label} (지난주)`,
    `- 매매 거래: ${s.txCount}건 (${diffPhrase})`,
  ]
  if (s.avgPricePerPyeong != null) {
    // 주간 평균 평당가의 **전주 대비 변화율은 일부러 넣지 않는다**(2026-07-31 dry-run에서 결정).
    // 주간 표본이 10~90건이라 어떤 평형·단지가 거래됐는지에 따라 평균이 크게 흔들린다 —
    // 실제로 마산합포구가 28건 기준 "27.1% 상승"으로 나왔는데 이건 시장 변동이 아니라
    // 거래 구성 차이다. 모델에 주면 그대로 단정적으로 서술해 오해를 만든다(ADR-005 기조).
    // 수준(level)만 주고, 방향성은 아래 상승/하락 단지수(30일 기준)가 담당한다.
    lines.push(`- 평균 평당가: ${s.avgPricePerPyeong.toLocaleString('ko-KR')}만원`)
  }
  if (s.topDeal) {
    const py = Math.round(s.topDeal.areaM2 / 3.3058)
    lines.push(
      `- 최고가 거래: ${s.topDeal.complexName} ${py}평${s.topDeal.floor != null ? ` ${s.topDeal.floor}층` : ''} ${formatEok(s.topDeal.price)}`,
    )
  }
  lines.push(`- 최근 30일 기준 상승 단지 ${s.upComplexes}곳 / 하락 단지 ${s.downComplexes}곳`)

  // 지침을 "하지 마세요"보다 "이렇게 쓰세요"로 주고 예시를 넣는다 — 1차 dry-run에서 모델이
  // 매번 "정리해 보겠습니다" 같은 도입부로 한 문장을 낭비하고 해요체 지시를 무시했다.
  return `아래는 ${s.label}의 한 주간 아파트 실거래 데이터예요. 이걸 2~3문장으로 요약해주세요.

${lines.join('\n')}

작성 규칙:
1. 첫 문장부터 바로 사실을 쓰세요. "정리해 보겠습니다", "동향입니다", "알려드릴게요" 같은 도입부는 절대 쓰지 마세요.
2. 모든 문장을 해요체로 끝내세요("~했어요", "~예요"). "~습니다"체는 쓰지 마세요.
3. 데이터에 있는 수치만 쓰세요. 없는 사실을 추측하거나 덧붙이지 마세요.
4. 거래량 변화와 최고가 거래를 중심으로 쓰세요.
5. 상승/하락 단지 수를 언급할 땐 "최근 30일 변동률 기준"이라고 밝히세요.
6. 투자 권유·전망·조언 표현 절대 금지("사기 좋은", "지금이 기회", "오를 것으로 보인다", "주목할 만한" 등). 이미 일어난 일만 서술하세요.
7. 줄바꿈 없이 한 문단으로 쓰세요. 최대 3문장.
8. 데이터에 이미 적힌 증감(증가/감소/같음)을 그대로 쓰세요. 직접 계산하거나 방향을 바꾸지 마세요.
9. 날짜 범위(2026-07-20 같은 형식)를 문장에 넣지 마세요. "지난주"로만 쓰세요.

좋은 예시:
지난주 ○○구에서는 아파트 42건이 거래돼 직전 주보다 5건 늘었어요. 가장 비싼 거래는 △△아파트 34평 12층으로 9억 2,000만원이었어요. 최근 30일 변동률 기준으로는 상승 단지 18곳, 하락 단지 12곳이에요.`
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

    if (dryRun) {
      // dry-run 의 목적은 문장 품질 판단이므로 전문을 그대로 보여준다(잘라내면 톤·군더더기를 못 본다)
      console.log(`\n  ✓ ${region.label} [${result.model}]`)
      console.log(`  ${result.text.replace(/\n+/g, '\n  ')}\n`)
      ok++
      continue
    }

    console.log(`  ✓ ${region.label} [${result.model}] ${result.text.slice(0, 60)}…`)

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
