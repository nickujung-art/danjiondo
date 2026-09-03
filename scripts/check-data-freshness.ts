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

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptSupabase = SupabaseClient<any, 'public', any>

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
  /**
   * 여러 배치가 같은 테이블에 쓸 때, **어느 배치가 넣은 행인지**로 대상을 좁히는 조인 필터.
   *
   * [왜 필요한가 — 2026-08-04 발견]
   * 08-02·08-03 이틀 다 아파트 실거래 배치가 152/152 실패해 0건이었는데, 이 점검은
   * "0.2일 신선"으로 **초록**이었다. transactions 에는 오피스텔 배치(Vercel cron/daily)도
   * 쓰기 때문이다 — 그날 들어온 33행 중 29행이 오피스텔이었다.
   *
   * [왜 building_type 이 아니라 source_run_id 인가]
   * 처음엔 `complexes.building_type <> 'officetel'` 로 거르려 했는데 **그것도 못 잡는다**.
   * 오피스텔 배치가 넣은 08-03 자 33행 중 4행이 building_type='apt' 인 단지에 붙어 있었다
   * (오피스텔 건물이 complexes 에 apt 로 등록돼 있는 경우가 있다). 건물 유형은 "누가 넣었나"의
   * 근사치일 뿐이라 감시 기준으로 쓸 수 없다.
   *
   * `source_run_id → ingest_runs.source_id` 가 유일하게 정확한 출처다. 실제로 이 기준으로 보면
   * molit_trade 의 최종 적재는 08-01 에 멈춰 있었다.
   */
  embeddedFilter?: { relation: string; column: string; in: readonly string[] }

  /**
   * 원인이 밝혀졌고 **코드로 고칠 수 없어** 의식적으로 보류한 항목. 위반으로 세지 않고
   * `⏸` 로 표기만 한다.
   *
   * [왜 필요한가]
   * 고칠 수 없는 항목이 매일 빨간불을 켜면 감시기 전체가 무의미해진다 — 이 파일 위쪽
   * SLA 주석이 경고하는 바로 그 상태이고, school_alimi 가 실제로 그렇게 방치됐다.
   * 2026-08-07 기준 이 감시기의 위반 4건 중 2건이 네이버 크롤러였는데, 둘 다 네이버의
   * GitHub Actions IP 차단이라 우리 코드로는 손댈 수 없다. 그대로 두면 같은 날 이 감시기가
   * 찾아낸 진짜 고장(gap-stats·kapt)이 소음에 묻힌다.
   *
   * **끄는 게 아니라 분리하는 것이다.** 목록에는 계속 뜨고 경과일도 그대로 보인다.
   * 그리고 보류 항목이 다시 신선해지면 `▶️` 로 알린다 — 차단이 풀렸는데 아무도 모르는
   * 상태를 막기 위한 장치다. 그 신호가 뜨면 이 필드를 지운다.
   */
  pausedReason?: string
}

/**
 * 잡 단위 상태 점검 — 데이터 단위 점검과 **겹치는 게 아니라 서로를 메운다**.
 *
 * 데이터 점검은 "테이블이 신선한가"를 보므로, 같은 테이블에 다른 배치가 쓰면 가려진다.
 * 반대로 잡 점검은 "배치가 실패를 보고했나"를 보므로, 실패를 보고조차 안 하는 침묵 실패를
 * 놓친다. 둘 다 있어야 08-02 같은 사고가 어느 쪽에든 걸린다.
 */
const FAILED_STATUSES = new Set(['failed'])

/**
 * SLA 는 **주기의 약 1.5배**로 잡는다. 하루짜리 배치가 한 번 걸러도 바로 빨간불이 되면
 * 경고가 상시로 켜지고, 그러면 아무도 안 보게 된다(school_alimi 가 그 상태였다).
 */
const CHECKS: Check[] = [
  // transactions 는 세 배치가 공유한다 — 출처(source_run_id)로 나누지 않으면 하나가 전멸해도
  // 다른 하나의 유입 때문에 초록불이 된다(2026-08-04 실제로 그랬다).
  { label: '실거래 (아파트·연립)', table: 'transactions',             column: 'created_at',   maxAgeDays: 4,   job: 'molit-daily.yml',     scopeFilter: { column: 'deal_date', withinDays: 90 }, embeddedFilter: { relation: 'ingest_runs', column: 'source_id', in: ['molit_trade', 'molit_villa_trade'] } },
  { label: '실거래 (오피스텔)',    table: 'transactions',             column: 'created_at',   maxAgeDays: 4,   job: 'cron/daily (Vercel)', scopeFilter: { column: 'deal_date', withinDays: 90 }, embeddedFilter: { relation: 'ingest_runs', column: 'source_id', in: ['molit_offi_trade'] } },
  { label: '단지 랭킹',            table: 'complex_rankings',         column: 'computed_at',  maxAgeDays: 1,   job: 'rankings-cron.yml' },
  { label: 'AI 가격예측',          table: 'complex_price_predictions', column: 'computed_at',  maxAgeDays: 3,   job: 'compute-predictions.yml' },
  { label: '카페 아티클',          table: 'cafe_articles',            column: 'fetched_at',   maxAgeDays: 3,   job: 'cafe-ingest.yml' },
  { label: '주간 지역 AI 코멘트',  table: 'regional_commentary',      column: 'generated_at', maxAgeDays: 10,  job: 'weekly-regional-commentary.yml' },
  { label: '월간 AI 해설',         table: 'complex_price_predictions', column: 'ai_cached_at', maxAgeDays: 45,  job: 'monthly-ai-commentary.yml' },
  // 네이버 2종은 보류다(2026-08-07). 네이버가 GitHub Actions IP 를 차단해 200개 단지가
  // 전부 매물 0건으로 돌아온다. 국내 IP 에서 같은 코드를 돌리면 정상 수집되는 것을 두 번
  // 확인했다(2026-08-03 로컬, 2026-08-07 프로브 — API 경로·응답 형태 모두 그대로였고
  // 쿠키 유무·만료와도 무관했다). 복구에는 자체 호스팅 러너나 프록시가 필요하다 —
  // ADR-059 참고. 데이터가 더 나빠지지는 않는다(중단 후 50일간 신규 단지 1곳).
  { label: '네이버 호가',          table: 'listing_prices',           column: 'created_at',   maxAgeDays: 21,  job: 'naver-listings-biweekly.yml',   pausedReason: '네이버가 GitHub Actions IP 차단 (ADR-059)' },
  { label: '네이버 평형',          table: 'complex_area_types',       column: 'created_at',   maxAgeDays: 45,  job: 'naver-area-types-monthly.yml',  pausedReason: '네이버가 GitHub Actions IP 차단 (ADR-059)' },
  { label: 'K-apt 시설',           table: 'facility_kapt',            column: 'created_at',   maxAgeDays: 45,  job: 'cron/daily (Vercel)' },
  // 지역 미분양도 보류다(2026-08-18). 상대 API 가 고장났고 우리가 고칠 수 없다.
  // 08-01 실행은 HTTP 502 로 죽었고(그땐 재시도가 없었다 — 08-04 에 추가됨),
  // 08-18 에 수동 재실행하니 이번엔 다른 실패가 나왔다:
  //   <resultCode>99</resultCode><resultMsg>UNKNOWN_ERROR</resultMsg>
  // 키를 바꿔 직접 호출해도 같은 응답이라 지속 오류이고 재시도가 통하지 않는다.
  // (같은 날 molit-unsold.ts 도 고쳤다 — XML 오류 응답을 JSON 으로 파싱하다 터져
  //  이 resultCode 가 로그에 안 보이던 문제)
  //
  // 보류로 돌리는 이유: 월 1회 크론이라 상대가 복구될 때까지 **매일** 빨간불이 켜지는데,
  // 그러면 감시기 전체가 무의미해진다(ADR-057 의 school_alimi 전례).
  // 복구를 놓칠 걱정은 없다 — 다시 신선해지면 이 스크립트가 "보류 해제 후보"로 알린다.
  { label: '지역 미분양',          table: 'regional_unsold',          column: 'fetched_at',   maxAgeDays: 45,  job: 'fetch-regional-unsold.yml',     pausedReason: '경남 미분양 API 가 resultCode 99 UNKNOWN_ERROR 로 지속 실패 (2026-08-18 확인)' },
  { label: 'SGIS 통계',            table: 'district_stats',           column: 'fetched_at',   maxAgeDays: 120, job: 'sgis-stats.yml' },
  { label: '지역 소득',            table: 'regional_income',          column: 'created_at',   maxAgeDays: 400, job: 'update-regional-income.yml' },
]

/**
 * `data_sources.last_status` 가 실패로 남아 있는 배치를 위반으로 올린다.
 *
 * 데이터 점검이 못 보는 구멍을 메운다: 여러 배치가 한 테이블을 공유하면 테이블은 신선한데
 * 내 배치는 죽어 있을 수 있다. 반대로 이 점검만으로도 부족하다 — 실패를 보고조차 안 하는
 * 배치는 여기에 안 잡힌다. 두 층을 같이 둔다.
 */
async function checkFailedJobs(
  supabase: ScriptSupabase,
  violations: string[],
): Promise<void> {
  const { data, error } = await supabase
    .from('data_sources')
    .select('id, last_status, last_synced_at, error_message')

  if (error) {
    violations.push(`배치 상태 조회 실패 — ${error.message}`)
    console.log(`\n ??   data_sources 조회 실패: ${error.message}`)
    return
  }

  const rows = (data ?? []) as {
    id: string
    last_status: string | null
    last_synced_at: string | null
    error_message: string | null
  }[]
  const failed = rows.filter(r => r.last_status && FAILED_STATUSES.has(r.last_status))

  console.log('\n배치 상태 (data_sources)')
  console.log('─'.repeat(96))
  for (const r of rows) {
    const bad = Boolean(r.last_status && FAILED_STATUSES.has(r.last_status))
    console.log(
      `${bad ? '🔴' : '  '}    ${r.id.padEnd(22)} ${(r.last_status ?? '(미보고)').padEnd(10)} ` +
        `${(r.last_synced_at ?? '-').slice(0, 10)}   ${r.error_message ?? ''}`,
    )
  }
  console.log('─'.repeat(96))

  for (const r of failed) {
    violations.push(`배치 실패 상태: ${r.id} — ${r.error_message ?? '사유 미기록'}`)
  }
}

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
    // 조인 필터가 있으면 !inner 로 붙여 대상 행 자체를 좁힌다(left join 이면 제외가 안 된다)
    const selectExpr = check.embeddedFilter
      ? `${check.column}, ${check.embeddedFilter.relation}!inner(${check.embeddedFilter.column})`
      : check.column

    let query = supabase
      .from(check.table)
      .select(selectExpr)
      .not(check.column, 'is', null)
    if (check.embeddedFilter) {
      const { relation, column, in: allowed } = check.embeddedFilter
      query = query.in(`${relation}.${column}`, [...allowed])
    }
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
      if (check.pausedReason) {
        console.log(`⏸     ${check.label.padEnd(22)} (데이터 없음) — 보류: ${check.pausedReason}`)
        continue
      }
      violations.push(`${check.label}: 데이터 없음 (${check.job})`)
      console.log(`🔴    ${check.label.padEnd(22)} (데이터 없음)`)
      continue
    }

    const last = new Date(String(raw))
    const ageDays = (Date.now() - last.getTime()) / 86_400_000
    const stale = ageDays > check.maxAgeDays

    if (check.pausedReason) {
      // 보류 항목이 **다시 신선해졌다면** 차단이 풀렸다는 뜻이다. 보류를 걸어놓고
      // 복구를 모르는 게 이 장치의 유일한 실패 모드라, 그때는 눈에 띄게 알린다.
      // 위반으로는 세지 않는다 — 좋은 소식으로 배치를 빨간불 만들 이유가 없다.
      const mark = stale ? '⏸ ' : '▶️ '
      const note = stale
        ? `보류: ${check.pausedReason}`
        : `**보류 해제 후보** — 수집이 재개됐다. CHECKS 의 pausedReason 을 지우세요`
      console.log(
        `${mark}    ${check.label.padEnd(22)} ${last.toISOString().slice(0, 10)}   ` +
          `${ageDays.toFixed(1).padStart(6)}일 ${String(check.maxAgeDays).padStart(5)}일   ${note}`,
      )
      continue
    }

    if (stale) violations.push(`${check.label}: ${ageDays.toFixed(1)}일 경과 (한도 ${check.maxAgeDays}일) — ${check.job}`)

    console.log(
      `${stale ? '🔴' : '  '}    ${check.label.padEnd(22)} ${last.toISOString().slice(0, 10)}   ` +
        `${ageDays.toFixed(1).padStart(6)}일 ${String(check.maxAgeDays).padStart(5)}일   ${check.job}`,
    )
  }

  console.log('─'.repeat(96))

  await checkFailedJobs(supabase, violations)

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
