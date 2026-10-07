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
   * 조인된 테이블의 숫자 컬럼에 gt 필터. `embeddedFilter.relation` 과 같은 테이블이어야 한다.
   * 배치 대상과 점검 분모를 맞추는 데 쓴다 (2026-10-07, §4 분모 불일치 수정).
   */
  embeddedGt?: { column: string; gt: number }

  /**
   * 여러 배치가 같은 테이블에 쓸 때, **출처가 같은 테이블의 한 컬럼으로 드러날 때** 쓰는 필터.
   * `embeddedFilter` 와 같은 구멍을 막지만 조인이 필요 없다.
   *
   * [왜 필요한가 — 2026-10-01 발견]
   * `complex_price_predictions` 에는 두 배치가 같은 키로 쓴다 —
   * `compute-predictions.yml`(고전 모델, 17:00Z)과 `compute-predictions-ai.yml`(Chronos, 18:00Z).
   * 이 점검은 `model_name` 을 구분하지 않고 테이블 최신 `computed_at` 만 봤으므로,
   * Chronos 가 45분 뒤에 쓰는 것만으로 **고전 배치가 통째로 죽어도 영원히 초록**이었다.
   * 실제로 09-27~09-30 나흘 연속 타임아웃으로 중단됐는데 `AI 가격예측 0.2일` 초록이었다.
   *
   * `transactions` 에 `embeddedFilter` 를 붙인 것과 **같은 종류의 구멍**이다(2026-08-04).
   * 그쪽은 출처를 조인으로만 알 수 있었지만 여기는 `model_name` 이 같은 테이블에 있다.
   */
  columnFilter?: { column: string; in: readonly string[] }

  /**
   * **마지막 실행이 몇 행을 덮었나**까지 본다. "가장 최신 행이 신선한가"만 보는 판정의 사각을 메운다.
   *
   * [왜 필요한가 — 2026-10-02 발견]
   * `monthly-ai-commentary` 가 `timeout-minutes: 120` 을 넘겨 **2h0m21s 에 잘렸는데**
   * (conclusion=`cancelled`), 그 전에 쓴 행이 `ai_cached_at` 을 오늘 날짜로 남겨서
   * 이 점검이 `월간 AI 해설  0.0일` → **`✅ 전부 정상`** 으로 통과시켰다.
   * 실제 커버리지는 **26%**(6,350/24,320행, `area_bucket=84`)였다.
   * **12회 연속 빨강이던 것이 고쳐져서가 아니라 잘려서 초록이 됐다.**
   *
   * 같은 구멍의 **세 번째 형태**다:
   *   ① 다른 배치가 가림      (2026-08-04, `embeddedFilter` 로 막음)
   *   ② 다른 모델이 가림      (2026-10-01, `columnFilter` 로 막음)
   *   ③ 자기 부분 완료가 가림 (2026-10-02, 여기)
   *
   * [왜 과거 실행이 아니라 목표 대비 비율인가 — 처음 설계를 한 번 갈아엎었다]
   * 처음에는 "마지막 정상 실행만큼 덮었나"로 짰다. **그 바닥이 가짜였다.**
   * 실측해 보니 이 배치는 **한 번도 완주한 적이 없다**:
   *   2026-08-04 실행 6,102행 — 그 실행도 1h35m 에 cancelled (같은 날 success 는 53초·39행)
   *   2026-10-02 실행 6,350행 — 2h0m 에 cancelled. **오늘이 8월보다 더 많이 썼다**
   * 잘린 실행을 바닥으로 삼으면 다음 잘린 실행이 그 바닥을 넘어 통과한다.
   *
   * 그래서 **범위 안 전체 행 대비 비율**로 잰다. 분모를 상수로 박지 않고 매번 세므로
   * 단지가 늘어도 문턱이 낡지 않는다 — 이 파일의 "목록은 낡지만 판정식은 안 낡는다" 그대로다.
   *
   * [⚠️ 문턱은 **달성 가능한 범위**에 걸어야 한다 — 두 번째로 고친 지점]
   * 처음엔 전체(24,320행) 대비 80% 로 잡았다. **그러면 정상 실행도 영원히 빨강이다.**
   * Groq 무료 TPD 가 하루 ~6,350행이라 **설계대로 돌아도 26% 가 천장**이기 때문이다.
   * 늘 빨강인 항목은 곧 무시당한다 — 이 파일이 `school_alimi` 를 두고 경고하는 바로 그 상태다.
   *
   * 그래서 **창원으로 범위를 좁혀** 잰다. 배치가 창원 우선 정렬을 받았으므로(bds `4fd8e5f`)
   * 이제 물어야 할 것은 "전체의 몇 %"가 아니라 **"창원이 다 찼는가"**다.
   *
   * [분모를 배치 대상과 맞추다 — 2026-10-07 수정]
   * 처음에는 창원 5구의 area_bucket=84 전체(5,051행)를 분모로 삼았다. 배치는 tx_count_30d > 0 인
   * 단지만 처리하므로(612건) **분모가 4,439행 부풀어 있었다**. 정상 2회 완주해도 12% 천장이라
   * **영구 빨강**이었다. `embeddedGt` 로 tx_count_30d > 0 을 걸어 분모를 배치 대상에 맞췄다.
   * 같은 수정에서 `windowHours` 를 24 → 45일(1,080h)로 늘려 여러 번 나눠 도는 결과를 누적한다.
   *
   * **교훈**: 커버리지 문턱을 세울 때는 *"무엇이 정상인가"* 가 아니라
   * *"정상일 때 이 숫자가 얼마인가"* 를 먼저 재야 한다. 둘을 혼동하면
   * 켜 둔 적 없는 경보가 매일 울린다.
   */
  coverage?: {
    minRatio: number
    basis: string
    /** 커버리지를 재는 시간 창 (시간). 기본 BATCH_WINDOW_HOURS(24). 여러 번 나눠 도는 배치는 늘려야 한다. */
    windowHours?: number
  }

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
  // 라벨과 job 이 2026-10-01 까지 틀려 있었다 — `compute-predictions.yml` 은 고전 모델이고
  // Chronos 는 `compute-predictions-ai.yml` 이다. 두 배치가 같은 테이블에 써서 서로를 가렸으므로
  // `model_name` 으로 출처를 고정한다(columnFilter 주석 참조).
  // 고전 모델 배치는 같은 날 은퇴했다(산출물이 읽기 시점에 전량 폐기되고 있었다) —
  // 되살리면 아래 주석 처리된 줄을 함께 살린다.
  { label: 'AI 가격예측 (Chronos)', table: 'complex_price_predictions', column: 'computed_at',  maxAgeDays: 3,   job: 'compute-predictions-ai.yml', columnFilter: { column: 'model_name', in: ['chronos-bolt-small'] } },
  // { label: '가격예측 (고전 모델)', table: 'complex_price_predictions', column: 'computed_at',  maxAgeDays: 3,   job: 'compute-predictions.yml',    columnFilter: { column: 'model_name', in: ['linear', 'double-exp', 'holt-winters'] } },
  { label: '카페 아티클',          table: 'cafe_articles',            column: 'fetched_at',   maxAgeDays: 3,   job: 'cafe-ingest.yml' },
  { label: '주간 지역 AI 코멘트',  table: 'regional_commentary',      column: 'generated_at', maxAgeDays: 10,  job: 'weekly-regional-commentary.yml' },
  // 이 배치는 워크플로에서 `--area-bucket=84` 로만 돈다(기본값). 그래서 범위를 84 로 고정한다 —
  // 안 고정하면 분모에 이 배치가 건드리지도 않는 버킷이 섞여 판정이 실제보다 나쁘게 나온다.
  // 이 줄은 **신선도만** 본다. 커버리지는 아래 창원 줄에서 따로 잰다(이유는 거기 주석).
  { label: '월간 AI 해설',         table: 'complex_price_predictions', column: 'ai_cached_at', maxAgeDays: 45,  job: 'monthly-ai-commentary.yml', columnFilter: { column: 'area_bucket', in: ['84'] } },
  // 커버리지는 **창원만** 잰다. 전체(24,320행) 대비로 재면 정상 실행도 영원히 빨강이기 때문이다 —
  // Groq 무료 TPD 가 하루 ~6,350행이라 **설계대로 돌아도 26% 가 천장**이다.
  // 2026-10-02 에 배치가 창원 우선 정렬을 받았으므로(bds `4fd8e5f`), 이제 물어야 할 것은
  // 분모 = 창원 5구 중 최근 30일 거래가 있는 단지(= 배치 대상). embeddedGt 로 tx_count_30d > 0 을 건다.
  // 45일(= maxAgeDays) 창으로 누적 커버리지를 잰다 — 하루 예산 ~408건, 대상 ~612건이라 2회에 나눠 돈다.
  // `si='창원시'` ↔ sgg_code 5구가 1:1 임을 실측 확인했다(1,406단지, 경계 오차 0).
  { label: '월간 AI 해설 (창원)',  table: 'complex_price_predictions', column: 'ai_cached_at', maxAgeDays: 45,  job: 'monthly-ai-commentary.yml', columnFilter: { column: 'area_bucket', in: ['84'] }, embeddedFilter: { relation: 'complexes', column: 'sgg_code', in: ['48121', '48123', '48125', '48127', '48129'] }, embeddedGt: { column: 'tx_count_30d', gt: 0 }, coverage: { minRatio: 0.95, windowHours: 45 * 24, basis: '창원 대상 ~612건(거래 있는 단지), 하루 예산 ~408건 → 2회 실행 필요. 45일 창으로 누적 커버리지 측정' } },
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

/**
 * 한 `Check` 의 범위 필터를 쿼리에 올린다.
 *
 * 최신 행 조회와 커버리지 집계가 **반드시 같은 범위**를 봐야 해서 한 곳으로 모았다.
 * 둘이 어긋나면 "최신은 신선한데 집계는 다른 모수"가 되어 판정이 조용히 틀어진다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyScope(query: any, check: Check): any {
  let q = query
  if (check.embeddedFilter) {
    const { relation, column, in: allowed } = check.embeddedFilter
    q = q.in(`${relation}.${column}`, [...allowed])
  }
  if (check.embeddedGt && check.embeddedFilter) {
    q = q.gt(`${check.embeddedFilter.relation}.${check.embeddedGt.column}`, check.embeddedGt.gt)
  }
  if (check.columnFilter) {
    q = q.in(check.columnFilter.column, [...check.columnFilter.in])
  }
  if (check.scopeFilter) {
    const since = new Date(Date.now() - check.scopeFilter.withinDays * 86_400_000)
      .toISOString()
      .slice(0, 10)
    q = q.gte(check.scopeFilter.column, since)
  }
  return q
}

/** 한 실행이 남긴 행으로 묶는 창. 배치는 몇 시간씩 걸리므로 초 단위로 같지 않다. */
const BATCH_WINDOW_HOURS = 24

/** PostgREST select 식을 만든다. embeddedFilter + embeddedGt 컬럼을 !inner 조인에 묶는다. */
function buildSelectExpr(check: Check): string {
  if (!check.embeddedFilter) return check.column
  const cols = [check.embeddedFilter.column]
  if (check.embeddedGt) cols.push(check.embeddedGt.column)
  return `${check.column}, ${check.embeddedFilter.relation}!inner(${Array.from(new Set(cols)).join(',')})`
}

/**
 * **가장 최근 실행이 남긴 행**이 몇 개인지 센다. `head: true` 라 본문 없이 카운트만 받는다.
 *
 * ⚠️ **신선도 한도(`maxAgeDays`) 창으로 세지 않는다.** 처음에 그렇게 짰다가 틀렸다 —
 * 45일 창에는 **여러 실행이 누적**되므로(2026-10-02 실측 6,350행) 잘린 실행 하나를
 * 이전 실행들이 떠받쳐 통과시킨다. 그러면 이 장치가 막으려는 바로 그 일이 다시 일어난다.
 *
 * 그래서 **최신 타임스탬프에서 {@link BATCH_WINDOW_HOURS} 안쪽**만 센다 —
 * "마지막 실행이 얼마나 덮었나"를 직접 묻는다. 완주 시 전체가 몇 행인지 몰라도 판정된다.
 *
 * null 을 돌려주는 것은 **"세지 못했다"** 이고 0 과 다르다 — 호출부가 구분해서 다룬다.
 * 조회 실패를 0 으로 바꾸면 "커버리지 0건"이라는 **없던 고장**을 만든다.
 */
async function measureCoverage(
  supabase: ScriptSupabase,
  check: Check,
  latest: Date,
): Promise<{ fresh: number; total: number } | { error: string }> {
  const selectExpr = buildSelectExpr(check)
  const head = () =>
    applyScope(supabase.from(check.table).select(selectExpr, { count: 'exact', head: true }), check)

  // 분모는 상수로 박지 않고 매번 센다 — 단지가 늘어도 문턱이 낡지 않는다.
  const totalRes = await head()
  if (totalRes.error) return { error: `전체 집계 실패: ${totalRes.error.message}` }

  const windowHours = check.coverage?.windowHours ?? BATCH_WINDOW_HOURS
  const cutoff = new Date(latest.getTime() - windowHours * 3_600_000).toISOString()
  const freshRes = await head().gte(check.column, cutoff)
  if (freshRes.error) return { error: `최근 실행 집계 실패: ${freshRes.error.message}` }

  return { fresh: freshRes.count ?? 0, total: totalRes.count ?? 0 }
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
    const selectExpr = buildSelectExpr(check)

    // null 제외는 여기서만 건다 — 커버리지의 분모는 **해설이 아직 없는 행도 포함**해야 한다.
    const query = applyScope(supabase.from(check.table).select(selectExpr), check)
      .not(check.column, 'is', null)
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

    // 커버리지 — "최신이 신선한가" 다음에 "얼마나 신선한가"를 묻는다.
    // 부분 완료가 최신 타임스탬프 하나로 전체를 통과시키는 것을 막는다(2026-10-02).
    let covNote = ''
    let covBad = false
    if (check.coverage) {
      const cov = await measureCoverage(supabase, check, last)
      if ('error' in cov) {
        // 세지 못한 것을 "충분하다"로 읽지 않는다 — 확인 불가도 위반이다(이 파일의 기존 원칙).
        covBad = true
        covNote = ` · 커버리지 ${cov.error}`
        violations.push(`${check.label}: 커버리지 집계 실패 — ${cov.error}`)
      } else if (cov.total === 0) {
        covBad = true
        covNote = ' · 커버리지 분모 0 — 범위 설정이 잘못됐다'
        violations.push(`${check.label}: 커버리지 분모가 0이다 — columnFilter/scopeFilter 범위를 확인하세요`)
      } else {
        const ratio = cov.fresh / cov.total
        covBad = ratio < check.coverage.minRatio
        const pct = (ratio * 100).toFixed(1)
        const minPct = (check.coverage.minRatio * 100).toFixed(0)
        covNote = ` · 마지막 실행 커버리지 ${pct}% (${cov.fresh.toLocaleString()}/${cov.total.toLocaleString()}, 최소 ${minPct}%)`
        if (covBad) {
          violations.push(
            `${check.label}: 마지막 실행이 범위의 ${pct}%(${cov.fresh.toLocaleString()}/${cov.total.toLocaleString()})만 덮었다 — ` +
              `${check.job} 가 중간에 잘렸을 수 있다. 근거: ${check.coverage.basis}`,
          )
        }
      }
    }

    console.log(
      `${stale || covBad ? '🔴' : '  '}    ${check.label.padEnd(22)} ${last.toISOString().slice(0, 10)}   ` +
        `${ageDays.toFixed(1).padStart(6)}일 ${String(check.maxAgeDays).padStart(5)}일   ${check.job}${covNote}`,
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
