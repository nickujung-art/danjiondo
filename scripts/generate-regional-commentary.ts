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
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptSupabase = SupabaseClient<any, 'public', any>
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import {
  applySpellFixes,
  buildCommentaryPrompt,
  fallbackCommentary,
  normalizeWhitespace,
  pickSlots,
  rotationSeed,
  validateCommentary,
  type CommentaryFacts,
} from '../src/lib/ai/regional-commentary-style'

/**
 * realtrade-story 운영 권역과 동일 — 창원 5구 + 김해.
 * `shortLabel` 은 **문장에 들어가는 이름**이다. 1차 dry-run에서 성산구만 "창원시 성산구"로,
 * 나머지는 "○○구"로 나와 카드끼리 표기가 어긋났다(모델이 라벨을 임의로 줄였다).
 * 문장용 이름을 코드가 고정해 넘기면 흔들리지 않는다.
 */
const REGIONS: { sggCode: string; label: string; shortLabel: string }[] = [
  { sggCode: '48121', label: '창원시 의창구', shortLabel: '의창구' },
  { sggCode: '48123', label: '창원시 성산구', shortLabel: '성산구' },
  { sggCode: '48125', label: '창원시 마산합포구', shortLabel: '마산합포구' },
  { sggCode: '48127', label: '창원시 마산회원구', shortLabel: '마산회원구' },
  { sggCode: '48129', label: '창원시 진해구', shortLabel: '진해구' },
  { sggCode: '48250', label: '김해시', shortLabel: '김해시' },
]

const GROQ_MODEL = 'qwen/qwen3.8-27b'
const GEMINI_MODEL = 'gemini-2.5-flash'
/** 이 건수 미만이면 코멘트를 만들지 않는다 — 2~3건으로 "시장 동향"을 서술하면 과잉 해석이 된다 */
const MIN_TX_FOR_COMMENTARY = 5
/**
 * 검증 실패 시 재시도 횟수. 재시도마다 슬롯 조합과 온도를 바꿔 다시 굴린다.
 * 3회로 잡은 건 지역 6개 × 최대 3회 = 18콜이라 무료 티어 rate limit 안에 들어오기 때문이다.
 */
const MAX_ATTEMPTS = 3

interface WeeklyStats {
  sggCode: string
  label: string
  shortLabel: string
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

/**
 * 조회 결과(WeeklyStats) → 문장 생성용 사실(CommentaryFacts).
 *
 * 증감은 **여기서 계산한다**. 모델에게 뺄셈을 시키면 안 된다 — 2026-07-31 dry-run에서
 * llama-3.1-8b가 28건 vs 27건(=1건 증가)을 "1건 줄었어요"로 뒤집어 서술했다(같은 데이터로
 * 두 번 돌렸을 때 방향이 서로 반대로 나옴). 실거래 사이트에서 수치 방향이 뒤집히는 건
 * 치명적이라, 산술은 전부 코드가 하고 모델은 문장만 만든다.
 */
function toFacts(s: WeeklyStats, periodLabel: string): CommentaryFacts {
  return {
    shortLabel: s.shortLabel,
    periodLabel,
    txCount: s.txCount,
    txDiff: s.txCount - s.prevTxCount,
    // avgPricePerPyeong 은 일부러 넘기지 않는다 — input_snapshot 에는 추적용으로 남기되
    // 문장 생성에는 쓰지 않는다(이유는 buildCommentaryPrompt 주석 참고).
    topDeal: s.topDeal
      ? {
          complexName: s.topDeal.complexName,
          price: s.topDeal.price,
          pyeong: Math.round(s.topDeal.areaM2 / 3.3058),
          floor: s.topDeal.floor,
        }
      : null,
    upComplexes: s.upComplexes,
    downComplexes: s.downComplexes,
  }
}

async function fetchWeeklyStats(
  supabase: ScriptSupabase,
  region: { sggCode: string; label: string; shortLabel: string },
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
    shortLabel: region.shortLabel,
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

/**
 * 온도를 0.4 → 0.8로 올렸다(2026-07-31).
 * 낮은 온도가 "안전"해 보이지만, 8B 모델에서는 오히려 자기 최빈 패턴으로 수렴해
 * 지역 6개가 똑같은 문장 틀로 나오는 원인이었다. 대신 수치 정확성은 온도가 아니라
 * 아래 검증 게이트(validateCommentary)가 보장한다 — 틀린 숫자는 재시도로 걸러진다.
 */
const TEMPERATURE = 0.8
/**
 * 400 → 220. 여유를 주면 모델이 시키지도 않은 항목을 줄바꿈으로 덧붙여 4~5문장이 됐다
 * (1차 검증에서 가장 흔한 반려 사유). 2~3문장이면 220토큰으로 충분하다.
 */
const MAX_TOKENS = 220
/** 제목·머리말·"물론이죠" 같은 래퍼를 붙이지 않게 하는 최소 지시 */
const SYSTEM_PROMPT =
  '당신은 아파트 실거래 데이터를 요약하는 한국어 편집자예요. 요청받은 요약문만 출력하고 제목·머리말·설명·목록은 절대 붙이지 마세요.'

/**
 * **Gemini 우선, Groq 폴백**(2026-07-31 순서 뒤집음).
 *
 * 원래는 다른 배치들을 따라 Groq(llama-3.1-8b) 우선이었다. 단지 코멘트는 수천 건이라
 * 속도·비용이 중요했지만 지역 코멘트는 **주 6건**이라 그 이유가 성립하지 않는다.
 * 3차 dry-run에서 8B 출력이 검증은 통과하면서도 문장이 어색했다
 * ("39평을 가진 신리마을중앙하이츠8단지아파트 6층이", "거래되며, 가장 비싼 거래였어요").
 * 문장 품질이 이 배치의 존재 이유라, 더 나은 모델을 기본으로 둔다.
 */
/**
 * 이번 실행에서 Gemini 를 포기했는지.
 *
 * 2026-07-31 현재 Gemini 키가 월 지출 한도 초과라 모든 호출이 429다(무료 운영 방침상
 * 당분간 이 상태를 유지한다 — MVP 오픈 후 재검토). Gemini 를 1순위로 두는 설계는 유지하되,
 * 한 번 실패하면 이번 실행 동안은 더 시도하지 않는다. 안 그러면 지역 6곳 × 재시도 3회 =
 * 최대 18번을 헛되이 왕복하고 CI 로그도 429로 뒤덮인다.
 *
 * 실행이 끝나면 초기화되므로, 나중에 한도를 풀면 다음 크론부터 자동으로 Gemini 를 다시 쓴다.
 */
let geminiDisabledForRun = false

async function callModel(prompt: string): Promise<{ text: string; model: string } | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  const groqKey = process.env.GROQ_API_KEY

  if (geminiKey && !geminiDisabledForRun) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey)
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_TOKENS },
      })
      const result = await model.generateContent(prompt)
      const text = result.response.text().trim()
      if (text) return { text, model: GEMINI_MODEL }
    } catch (err) {
      // 스택 전체는 찍지 않는다 — 지역 6곳 × 재시도라 CI 로그가 스택으로 뒤덮인다
      geminiDisabledForRun = true
      console.error(
        `[regional-commentary] Gemini 실패 — 이번 실행은 Groq만 씁니다: ${(err as Error).message?.slice(0, 160)}`,
      )
    }
  }

  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey })
      const res = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      })
      const text = res.choices[0]?.message?.content?.trim()
      if (text) return { text, model: GROQ_MODEL }
    } catch (err) {
      console.error('[regional-commentary] Groq 호출 실패:', err)
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

  // "8월 25~31일" 형태의 절대 날짜 라벨 — "지난주" 상대 표현 대신 사용
  const ps = new Date(periodStart)
  const pe = new Date(periodEnd)
  const periodLabel = ps.getMonth() === pe.getMonth()
    ? `${ps.getMonth() + 1}월 ${ps.getDate()}~${pe.getDate()}일`
    : `${ps.getMonth() + 1}월 ${ps.getDate()}일~${pe.getMonth() + 1}월 ${pe.getDate()}일`

  // ㉘ 완료된 주만 생성 — 진행 중인 주는 거래 자료가 불완전해 "항상 줄었다"가 나온다.
  // --week-start 로 명시적으로 지정한 경우는 강제 실행(과거 주 보충용).
  const todayStr = now.toISOString().slice(0, 10)
  if (!weekStartArg && periodEnd >= todayStr) {
    console.log(`[regional-commentary] ⚠ 대상 주(${periodStart} ~ ${periodEnd})가 아직 끝나지 않았다 — 건너뜀`)
    console.log(`  오늘: ${todayStr}, 주 종료: ${periodEnd}. 완료 주만 생성하는 정책(㉘).`)
    return
  }

  console.log(`[regional-commentary] 대상 기간: ${periodStart} ~ ${periodEnd} (${periodLabel})${dryRun ? ' (dry-run)' : ''}`)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let ok = 0
  let skipped = 0
  let failed = 0
  let fellBack = 0
  /**
   * 이번 실행에서 이미 쓴 개시부. 홈 피드는 6개 지역 카드를 세로로 쌓으므로,
   * 문장 하나하나가 멀쩡해도 개시부가 겹치면 "폼 채우기"로 읽힌다(탐지기 S1).
   */
  const seenOpenings = new Set<string>()

  for (const [regionIndex, region] of REGIONS.entries()) {
    const stats = await fetchWeeklyStats(supabase, region, periodStart, periodEnd)

    if (stats.txCount < MIN_TX_FOR_COMMENTARY) {
      console.log(`  - ${region.label}: 거래 ${stats.txCount}건 — 최소 ${MIN_TX_FOR_COMMENTARY}건 미만이라 건너뜀`)
      skipped++
      continue
    }

    const facts = toFacts(stats, periodLabel)
    const seed = rotationSeed(periodStart, regionIndex)

    // 모델 출력이 규칙(숫자 일치·해요체·금지 표현·개시부 중복)을 어기면 슬롯을 바꿔 다시 굴린다.
    // 사후 윤문(LLM 재호출로 다듬기)이 불가능한 크론 환경이라, 판정은 전부 결정론적이어야 한다.
    let accepted: { text: string; model: string; signature: string } | null = null
    let lastViolations: string[] = []

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !accepted; attempt++) {
      const slots = pickSlots(facts, seed, attempt)
      const result = await callModel(buildCommentaryPrompt(facts, slots))
      if (!result) break

      const text = applySpellFixes(normalizeWhitespace(result.text))
      const check = validateCommentary(text, facts, seenOpenings)
      if (check.ok) {
        accepted = { text, model: result.model, signature: check.openingSignature }
      } else {
        lastViolations = check.violations
        console.log(`    · ${region.label} 시도 ${attempt + 1} 반려: ${check.violations.join(' / ')}`)
        // dry-run 은 프롬프트를 고치려고 돌리는 거라, 왜 반려됐는지 원문을 봐야 한다
        if (dryRun) console.log(`      ↳ ${text}`)
      }
    }

    // 최후 방어선 — 숫자를 전부 코드가 박는 사람 작성 템플릿. 카드를 비우지 않는다.
    if (!accepted) {
      const slots = pickSlots(facts, seed)
      const text = fallbackCommentary(facts, slots)
      const check = validateCommentary(text, facts, seenOpenings)
      accepted = { text, model: 'fallback-template', signature: check.openingSignature }
      fellBack++
      console.warn(`  ! ${region.label}: ${MAX_ATTEMPTS}회 모두 반려(${lastViolations.join(' / ')}) — 템플릿으로 대체`)
    }

    seenOpenings.add(accepted.signature)

    if (dryRun) {
      // dry-run 의 목적은 문장 품질 판단이므로 전문을 그대로 보여준다(잘라내면 톤·군더더기를 못 본다)
      console.log(`\n  ✓ ${region.label} [${accepted.model}]`)
      console.log(`  ${accepted.text}\n`)
      ok++
      continue
    }

    console.log(`  ✓ ${region.label} [${accepted.model}] ${accepted.text.slice(0, 60)}…`)

    const { error } = await supabase.from('regional_commentary').upsert(
      {
        sgg_code: stats.sggCode,
        area_bucket: null,
        period_type: 'weekly',
        period_start: stats.periodStart,
        period_end: stats.periodEnd,
        headline: null,
        body: accepted.text,
        model_name: accepted.model,
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

  console.log(
    `[regional-commentary] 완료 — 성공 ${ok}(템플릿 대체 ${fellBack}) / 건너뜀 ${skipped} / 실패 ${failed}`,
  )

  // **전부 템플릿이면 모델에 아예 닿지 못한 것으로 본다.**
  // 이 배치는 모델 호출이 다 실패해도 폴백 덕에 "성공"으로 끝나 데이터까지 갱신된다.
  // 로그를 안 보면 정상처럼 보이는데 실제로는 AI 문장이 한 줄도 없는 상태다
  // (예: GEMINI_API_KEY 는 등록됐지만 지출 한도로 429, GROQ_API_KEY 는 미등록).
  // 문장 품질이 이 배치의 존재 이유이므로 조용히 넘어가지 않는다.
  if (ok > 0 && fellBack === ok) {
    console.error(
      `[regional-commentary] 🔴 ${ok}개 지역이 전부 템플릿으로 나갔습니다 — 모델 호출이 한 번도 성공하지 못했습니다. ` +
        `GROQ_API_KEY / GEMINI_API_KEY 등록 상태와 위 호출 에러를 확인하세요.`,
    )
    // ㉗ 조용한 폴백은 폴백이 아니라 손실 — CI가 실패하도록 exit 1
    process.exit(1)
  }

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('[regional-commentary] 예외 종료:', err)
  process.exit(1)
})
