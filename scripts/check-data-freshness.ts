/**
 * 데이터 신선도 감시 — 배치가 "돌았는지"가 아니라 "데이터가 실제로 갱신됐는지"를 본다.
 *
 * [왜 이게 필요한가 — 2026-08-03 전수검사에서 얻은 교훈]
 * 이 저장소에서 오늘 하루에만 다섯 건의 **침묵 실패**가 나왔다. 공통점은 전부
 * "잡은 성공했는데 데이터는 안 들어왔다"였다:
 *   - K-apt        onConflict 불일치로 100% 실패, data_sources 는 null (한 달간)
 *   - MOLIT 일배치  API 응답 불능으로 152건 전량 실패했는데 `✅ 완료` + exit 0
 *   - 네이버 매물   200개 단지 전부 0건, error 0 (두 달간)
 *   - 네이버 평형   같음 (두 달간)
 *   - 월간 AI 해설  Gemini 429 로 1,342건 전량 실패, 그런데 워크플로는 초록불
 *
 * 잡 단위 감시(GitHub Actions 성공/실패, data_sources.last_status)는 전부 이걸 놓쳤다.
 * 반면 **테이블의 최신 타임스탬프**를 보면 다섯 건 모두 즉시 드러났다. 그래서 감시 기준을
 * 잡이 아니라 데이터로 잡는다.
 *
 * 스크립트를 11개 고쳐 각자 상태를 보고하게 만드는 대신 이 파일 하나로 전부 덮는다 —
 * 새 배치가 생겨도 여기 한 줄만 추가하면 감시가 붙는다.
 *
 * 실행:
 *   npx tsx scripts/check-data-freshness.ts            # 위반 있으면 exit 1
 *   npx tsx scripts/check-data-freshness.ts --warn-only # 항상 exit 0 (보고만)
 *
 * 필요 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const warnOnly = process.argv.includes('--warn-only')

interface Check {
  /** 화면에 보일 이름 */
  label: string
  table: string
  /** 신선도를 재는 타임스탬프 컬럼 */
  column: string
  /** 이 일수를 넘겨 갱신이 없으면 위반 */
  maxAgeDays: number
  /** 어떤 배치가 채우는지 — 위반 시 어디를 봐야 하는지 바로 알려준다 */
  job: string
  /**
   * 정렬 대상을 좁히는 선택적 범위 필터 `[컬럼, 최근 N일]`.
   *
   * transactions 는 수백만 행인데 created_at 에 인덱스가 없어 `order by created_at desc limit 1`
   * 이 statement timeout 이 난다(2026-08-03 확인). 운영 테이블에 인덱스를 새로 붙이는 대신
   * 인덱스가 있는 deal_date 로 후보를 줄인 뒤 정렬한다.
   *
   * 신고 지연 p90 이 13일이라 90일 창이면 최근 적재분은 사실상 전부 들어온다.
   */
  scopeFilter?: { column: string; withinDays: number }
}

/**
 * SLA 는 **주기의 약 1.5배**로 잡는다. 하루짜리 배치가 한 번 걸러도 바로 빨간불이 되면
 * 경고가 상시로 켜지고, 그러면 아무도 안 보게 된다(school_alimi 가 그 상태였다).
 */
const CHECKS: Check[] = [
  { label: '실거래 (아파트·연립)', table: 'transactions',             column: 'created_at',   maxAgeDays: 4,   job: 'molit-daily.yml', scopeFilter: { column: 'deal_date', withinDays: 90 } },
  { label: '단지 랭킹',            table: 'complex_rankings',         column: 'computed_at',  maxAgeDays: 1,   job: 'rankings-cron.yml' },
  { label: 'AI 가격예측',          table: 'complex_price_predictions', column: 'computed_at',  maxAgeDays: 3,   job: 'compute-predictions.yml' },
  { label: '카페 아티클',          table: 'cafe_articles',            column: 'fetched_at',   maxAgeDays: 3,   job: 'cafe-ingest.yml' },
  { label: '주간 지역 AI 코멘트',  table: 'regional_commentary',      column: 'generated_at', maxAgeDays: 10,  job: 'weekly-regional-commentary.yml' },
  { label: '월간 AI 해설',         table: 'complex_price_predictions', column: 'ai_cached_at', maxAgeDays: 45,  job: 'monthly-ai-commentary.yml' },
  { label: '네이버 호가',          table: 'listing_prices',           column: 'created_at',   maxAgeDays: 21,  job: 'naver-listings-biweekly.yml' },
  { label: '네이버 평형',          table: 'complex_area_types',       column: 'created_at',   maxAgeDays: 45,  job: 'naver-area-types-monthly.yml' },
  { label: 'K-apt 시설',           table: 'facility_kapt',            column: 'created_at',   maxAgeDays: 45,  job: 'cron/daily (Vercel)' },
  { label: '지역 미분양',          table: 'regional_unsold',          column: 'fetched_at',   maxAgeDays: 45,  job: 'fetch-regional-unsold.yml' },
  { label: 'SGIS 통계',            table: 'district_stats',           column: 'fetched_at',   maxAgeDays: 120, job: 'sgis-stats.yml' },
  { label: '지역 소득',            table: 'regional_income',          column: 'created_at',   maxAgeDays: 400, job: 'update-regional-income.yml' },
]

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[ERROR] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const violations: string[] = []
  console.log('데이터 신선도 점검\n')
  console.log('상태  대상                     최종 갱신     경과      한도   담당 배치')
  console.log('─'.repeat(96))

  for (const check of CHECKS) {
    let query = supabase
      .from(check.table)
      .select(check.column)
      .not(check.column, 'is', null)
    if (check.scopeFilter) {
      const since = new Date(Date.now() - check.scopeFilter.withinDays * 86_400_000)
        .toISOString()
        .slice(0, 10)
      query = query.gte(check.scopeFilter.column, since)
    }
    const { data, error } = await query
      .order(check.column, { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // 조회 자체가 실패하면 신선도를 판정할 수 없다 — 모른다는 사실을 위반으로 다룬다.
      violations.push(`${check.label}: 조회 실패 — ${error.message}`)
      console.log(` ??   ${check.label.padEnd(22)} 조회 실패: ${error.message}`)
      continue
    }

    const raw = (data as Record<string, unknown> | null)?.[check.column]
    if (!raw) {
      violations.push(`${check.label}: 데이터 없음 (${check.job})`)
      console.log(`🔴    ${check.label.padEnd(22)} (데이터 없음)`)
      continue
    }

    const last = new Date(String(raw))
    const ageDays = (Date.now() - last.getTime()) / 86_400_000
    const stale = ageDays > check.maxAgeDays
    if (stale) violations.push(`${check.label}: ${ageDays.toFixed(1)}일 경과 (한도 ${check.maxAgeDays}일) — ${check.job}`)

    console.log(
      `${stale ? '🔴' : '  '}    ${check.label.padEnd(22)} ${last.toISOString().slice(0, 10)}   ` +
        `${ageDays.toFixed(1).padStart(6)}일 ${String(check.maxAgeDays).padStart(5)}일   ${check.job}`,
    )
  }

  console.log('─'.repeat(96))

  if (violations.length === 0) {
    console.log('\n✅ 전부 정상')
    return
  }

  console.error(`\n🔴 신선도 위반 ${violations.length}건:`)
  for (const v of violations) console.error(`  - ${v}`)

  if (warnOnly) {
    console.error('\n--warn-only 라 exit 0 으로 끝냅니다.')
    return
  }
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
