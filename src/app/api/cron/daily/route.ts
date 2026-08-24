import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
// markCronSuccess/markCronFailed 는 gap-stats 전용이었다 — 그 단계가 워크플로로 빠지면서
// 이 라우트에서는 markCronStatus 하나만 쓴다(cron-status 모듈에는 그대로 남아 있다).
import { markCronStatus } from '@/lib/data/cron-status'
import { fetchKaptBasicInfo } from '@/services/kapt'
import {
  fetchPresaleTrades,
  parseAmount,
  currentYearMonth,
  previousYearMonth,
} from '@/services/molit-presale'
import { fetchCheongyakList, fetchRemndrList, fetchCompetitionRate } from '@/services/cheongyak/client'
import { normalizeCheongyakItem, normalizeRemndrItem } from '@/services/cheongyak/normalize'
import { ingestOffiMonth } from '@/lib/data/realprice-officetel'
import { upsertMolitListing } from '@/lib/data/new-listings-molit'
import { getActiveSggCodes, getActiveCityNames } from '@/lib/data/regions'
import { describeError } from '@/lib/api/describe-error'

export const runtime = 'nodejs'

/** K-apt 1회 실행당 처리할 단지 수. 2,922건 ÷ 70 ≈ 42일 순환 (SLA 45일 충족) */
const KAPT_BATCH_SIZE = 70
/** K-apt 루프 시간 예산. 초과 시 중단하고 나머지는 다음 실행으로 넘긴다 */
const KAPT_TIME_BUDGET_MS = 60_000
/** PostgREST 기본 1,000행 캡을 넘기기 위한 페이지 크기 */
const PAGE_SIZE = 1000
/** 페이지네이션 상한 — 소스가 계속 가득 찬 페이지를 돌려줄 때 무한 루프 방지 */
const MAX_PAGES = 20

type KaptTarget = { id: string; kapt_code: string }

/**
 * PostgREST의 1,000행 캡을 넘어 전체 행을 가져온다.
 * (Phase 34에서 같은 캡에 걸린 전례가 있어 페이지네이션을 명시적으로 쓴다)
 *
 * `MAX_PAGES`로 상한을 둔다 — 대상 테이블이 수천 행 규모라 20페이지(2만 행)면
 * 충분하고, 소스가 계속 `PAGE_SIZE`를 돌려주는 이상 상황에서 루프가 멈추지 않는
 * 것을 막는다.
 */
async function fetchAllPages<T>(
  runPage: (from: number, to: number) => Promise<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data } = await runPage(from, from + PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}

/**
 * 이번 실행에서 K-apt를 수집할 단지를 고른다.
 *
 * 우선순위: **facility_kapt가 없는 단지 → updated_at이 오래된 단지** 순.
 *
 * 이전 구현은 정렬·offset 없이 `.limit(50)`만 걸어 매일 같은 50개만 처리했고,
 * kapt_code 보유 2,922건 중 1,463건(50%)이 한 번도 수집되지 않았다.
 *
 * 일자 기반 offset 순환을 쓰지 않는 이유: 시간 예산으로 배치가 조기 종료되면
 * offset은 그대로 전진해 처리하지 못한 단지가 영구히 건너뛰어진다. 이 방식은
 * 처리 못 한 단지가 다음 실행에서도 여전히 우선순위 앞쪽에 남아 자기교정된다.
 */
async function selectKaptTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  limit: number,
): Promise<KaptTarget[]> {
  const eligible = await fetchAllPages<KaptTarget>((from, to) =>
    supabase
      .from('complexes')
      .select('id, kapt_code')
      .not('kapt_code', 'is', null)
      .order('id')
      .range(from, to),
  )

  const synced = await fetchAllPages<{ complex_id: string; updated_at: string | null }>((from, to) =>
    supabase
      .from('facility_kapt')
      .select('complex_id, updated_at')
      .order('complex_id')
      .range(from, to),
  )

  const syncedAt = new Map(synced.map(row => [row.complex_id, row.updated_at ?? '']))

  // 미수집(=Map에 없음)은 빈 문자열로 취급돼 오름차순 정렬에서 항상 앞에 온다
  return [...eligible]
    .filter(c => Boolean(c.kapt_code))
    .sort((a, b) => (syncedAt.get(a.id) ?? '').localeCompare(syncedAt.get(b.id) ?? ''))
    .slice(0, limit)
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const errors: string[] = []
  let totalUpserted = 0
  let cheongyakUpserted = 0
  let remndrUpserted = 0
  let competitionUpdated = 0
  let expiredDeactivated = 0
  let offiUpserted = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseAdminClient() as any
  const activeSggCodes = await getActiveSggCodes(supabase)

  // ── MOLIT 분양권전매 UPSERT (DATA-02) ────────────────────────────────
  const dealYmd = currentYearMonth()
  let presaleUpserted = 0

  for (const lawdCd of activeSggCodes) {
    try {
      const trades = await fetchPresaleTrades(lawdCd, dealYmd)
      for (const trade of trades) {
        // upsert를 쓰지 않는 이유·에러 확인의 필요성은 upsertMolitListing 주석 참조.
        // 요약: MOLIT 유일성 제약이 부분 인덱스(WHERE pblanc_no IS NULL)라 ON CONFLICT
        // 추론이 원리적으로 불가능했고, 예전 코드는 error를 확인조차 하지 않아 16일간 묻혔다.
        const { id: listingId, error: listingError } = await upsertMolitListing(supabase, {
          name:      trade.aptNm,
          region:    trade.umdNm,
          price:     parseAmount(trade.dealAmount),
          fetchedAt: new Date().toISOString(),
        })

        if (listingError) {
          errors.push(
            `new_listings molit name=${trade.aptNm} region=${trade.umdNm}: ${listingError}`,
          )
          continue
        }
        if (!listingId) continue
        const dealDate = `${trade.dealYear}-${trade.dealMonth.padStart(2, '0')}-${trade.dealDay.padStart(2, '0')}`

        const { error } = await supabase
          .from('presale_transactions')
          .upsert(
            {
              listing_id:  listingId,
              area:        trade.excluUseAr ?? null,
              floor:       trade.floor ?? null,
              price:       parseAmount(trade.dealAmount),
              deal_date:   dealDate,
              cancel_date: trade.cdealType === 'Y' ? dealDate : null,
            },
            { onConflict: 'listing_id,deal_date,area,floor', ignoreDuplicates: true },
          )
        if (!error) presaleUpserted++
      }
    } catch (err) {
      errors.push(`presale lawdCd=${lawdCd}: ${describeError(err)}`)
    }
  }
  totalUpserted += presaleUpserted

  // ── 청약홈 분양 공고 수집 (PRESALE-01, per T-13-06) ──────────────────────────
  // fetchCheongyakList 내부에서 경남 전체 조회 후 regions 기반 동적 도시명으로 필터링
  const activeCityNames = await getActiveCityNames(supabase)
  const cheongyakPblancNos: string[] = []
  try {
    const items = await fetchCheongyakList(activeCityNames)
    for (const item of items) {
      const row = normalizeCheongyakItem(item)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('new_listings')
        .upsert(
          {
            name:                row.name,
            region:              row.region,
            pblanc_no:           row.pblanc_no,
            pblanc_nm:           row.pblanc_nm,
            sgg_code:            row.sgg_code,
            supply_region:       row.supply_region,
            supply_count:        row.supply_count,
            rcept_bgnde:         row.rcept_bgnde,
            rcept_endde:         row.rcept_endde,
            przwner_presnatn_de: row.przwner_presnatn_de,
            mvn_prearnge_ym:     row.mvn_prearnge_ym,
            hssply_adres:        row.hssply_adres,
            is_active:           true,
            fetched_at:          row.fetched_at,
          },
          { onConflict: 'pblanc_no' },
        )
      if (!error) {
        cheongyakUpserted++
        cheongyakPblancNos.push(row.pblanc_no)
      } else {
        errors.push(`cheongyak upsert pblanc_no=${row.pblanc_no}: ${error.message}`)
      }
    }
  } catch (err) {
    errors.push(`cheongyak: ${describeError(err)}`)
  }
  totalUpserted += cheongyakUpserted

  // ── 청약홈 잔여세대·무순위 수집 (PRESALE-01-B) ────────────────────────────────
  try {
    const remndrItems = await fetchRemndrList(activeCityNames)
    for (const item of remndrItems) {
      const row = normalizeRemndrItem(item)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('new_listings')
        .upsert(
          {
            name:                row.name,
            region:              row.region,
            pblanc_no:           row.pblanc_no,
            pblanc_nm:           row.pblanc_nm,
            sgg_code:            row.sgg_code,
            supply_region:       row.supply_region,
            supply_count:        row.supply_count,
            rcept_bgnde:         row.rcept_bgnde,
            rcept_endde:         row.rcept_endde,
            przwner_presnatn_de: row.przwner_presnatn_de,
            mvn_prearnge_ym:     row.mvn_prearnge_ym,
            hssply_adres:        row.hssply_adres,
            is_active:           true,
            fetched_at:          row.fetched_at,
          },
          { onConflict: 'pblanc_no' },
        )
      if (!error) {
        remndrUpserted++
        cheongyakPblancNos.push(row.pblanc_no)
      } else {
        errors.push(`remndr upsert pblanc_no=${row.pblanc_no}: ${error.message}`)
      }
    }
  } catch (err) {
    errors.push(`remndr: ${describeError(err)}`)
  }
  totalUpserted += remndrUpserted

  // ── 청약홈 경쟁률 병합 (PRESALE-02, per D-2) ─────────────────────────────────
  for (const pblancNo of cheongyakPblancNos) {
    try {
      const rate = await fetchCompetitionRate(pblancNo)
      if (rate == null) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('new_listings')
        .update({ competition_rate: rate })
        .eq('pblanc_no', pblancNo)
      if (!error) competitionUpdated++
      else errors.push(`competition update pblanc_no=${pblancNo}: ${error.message}`)
    } catch (err) {
      errors.push(`competition pblanc_no=${pblancNo}: ${describeError(err)}`)
    }
  }

  // ── 청약홈 만료 공고 비활성화 (RESEARCH Pitfall 3, T-13-07) ──────────────────
  try {
    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: expired, error } = await (supabase as any)
      .from('new_listings')
      .update({ is_active: false })
      .lt('rcept_endde', today)
      .not('pblanc_no', 'is', null)
      .eq('is_active', true)
      .select('id')
    if (!error) expiredDeactivated = (expired as { id: string }[] | null)?.length ?? 0
    else errors.push(`expired deactivation: ${error.message}`)
  } catch (err) {
    errors.push(`expired deactivation: ${describeError(err)}`)
  }

  // ── 오피스텔 실거래 전월+당월 수집 (OFFI-01) ──────────────────────────────
  //
  // 🔴 **전월을 반드시 함께 훑는다.** MOLIT 은 계약 후 신고까지 시차가 있어 M 월 거래가
  // M+1 월에 들어온다. 당월만 보면 달이 바뀌는 순간 그 달을 두 번 다시 보지 않아
  // 지연 신고분이 **영구 누락**된다.
  //
  // 2026-08-24 실측(48121·48123·48125 오피스텔을 백필로 다시 훑어 신규 생성된 행의 비율):
  //   2026-05  81/131 = 61.8% 누락      2026-08(당월)  0/67 = 0%
  //   2026-06  37/168 = 22.0% 누락      2025년         3/1,665 = 0.2%(이전 백필분)
  //   2026-07  30/139 = 21.6% 누락
  //   ↔ 아파트 대조군(전월+당월을 매일 훑는 molit-daily.yml): 2026-06·07 둘 다 **0건**
  // 당월 0% / 지난 달 22~62% / 아파트 0 이라는 시그니처가 원인을 정확히 가리킨다.
  //
  // 아파트·연립은 molit-daily.yml 이 from=전월 to=당월 로 이미 이렇게 돈다.
  // 오피스텔만 이 저장소에서 빠져 있었다.
  const offiYms = [previousYearMonth(), currentYearMonth()]
  let offiErrors = 0
  for (const sggCode of activeSggCodes) {
    for (const offiYm of offiYms) {
      try {
        const result = await ingestOffiMonth(sggCode, offiYm, supabase)
        offiUpserted += result.rowsUpserted
        if (result.status === 'failed') {
          errors.push(`offi ${sggCode} ${offiYm}: ${result.rowsFailed}건 실패`)
          offiErrors++
        }
      } catch (err) {
        errors.push(`offi ${sggCode} ${offiYm}: ${describeError(err)}`)
        offiErrors++
      }
    }
  }
  totalUpserted += offiUpserted
  // 분모는 시도 횟수다 — 전월+당월로 2배가 됐으므로 sgg 수만 쓰면 'partial' 구간이
  // 절반으로 줄어 전멸에 가까운 실패도 'partial' 로 보고된다.
  const offiAttempts = activeSggCodes.length * offiYms.length
  const offiStatus = offiErrors === 0 ? 'success' : offiErrors < offiAttempts ? 'partial' : 'failed'
  const offiErrMsg = offiErrors > 0
    ? errors.filter(e => e.startsWith('offi')).slice(-3).join('; ')
    : undefined
  if (!await markCronStatus(supabase, 'molit_offi_trade', offiStatus, offiErrMsg)) {
    errors.push('markCronStatus(molit_offi_trade) 갱신 실패 — 로그 확인')
  }

  // ── Phase 11: 평당가·30일 변동률·거래량 배치 집계 (MAP-02, MAP-05) ──────────
  //
  // 이 단계는 2026-07-09부터 4주간 조용히 실패하고 있었다. 원인이 둘이다.
  //
  //  (1) supabase.rpc()는 **에러를 throw하지 않는다** — { data, error }를 돌려준다.
  //      그래서 예전의 try/catch는 RPC 에러에 한 번도 발동하지 않았고, 타임아웃
  //      에러가 errors 배열에조차 들어가지 않았다. 아래처럼 error를 직접 봐야 한다.
  //  (2) 이 단계에는 data_sources 항목이 없어 data-freshness-check도 볼 수 없었다.
  //      'price-stats' 행을 두고 성패를 남긴다.
  //
  // 실패 원인 자체(PostgREST 8초 statement timeout vs 함수 실행 41초)는
  // supabase/migrations/20260806000000_refresh_complex_price_stats_setbased.sql 참고.
  // 집합 기반 재작성으로 줄였지만 여전히 8초를 밑돌지 못한다 — 그래서 더더욱
  // 실패가 드러나야 한다.
  // **여기서 호출하지 않는다.** .github/workflows/refresh-price-stats.yml 이 담당한다.
  //
  // 이 배치는 41~46초가 걸리는데 PostgREST 세션 상한은 8초다. 그래서 이 라우트에서
  // 부르던 시절에는 매일 호출되면서도 매일 8초에 잘렸고, 2026-07-09 부터 4주간
  // 아무 일도 하지 않았다. 여기 다시 넣으면 매일 04:00 에 'failed' 를 찍고 05:00 에
  // 워크플로가 'success' 로 덮는 상태가 된다.
  // 성패 기록(data_sources.price-stats)도 그 워크플로가 남긴다.

  // ── 갭투자 통계 재계산 (GAP-D05) ──────────────────────────────────────────
  //
  // **여기서 호출하지 않는다.** .github/workflows/refresh-gap-stats.yml 이 담당한다.
  // 바로 위 price-stats 와 같은 벽이지만 성격이 조금 다르다. 실측(2026-08-07):
  //   * cold  11.45초 / warm 0.35~5.1초
  //   * PostgREST 세션 상한  8초 (authenticator 롤 statement_timeout)
  // price-stats(41초)처럼 항상 넘는 게 아니라 **cold 일 때만 넘는데, 이 라우트가 도는
  // 19:00 UTC 가 정확히 cold 다.** 그래서 이 자리에서 매일 타임아웃하며
  // data_sources.gap-stats 를 'failed' 로 찍고 있었다(complex_gap_stats 는 2026-08-05
  // 이후 정지). 앱 UPSERT 를 SQL 안으로 옮겨 psql 직결로 돌린다 —
  // supabase/migrations/20260807052310_refresh_complex_gap_stats.sql 참고.
  //
  // 여기 다시 넣으면 매일 04:00 에 'failed' 를 찍고 05:30 에 워크플로가 'success' 로
  // 덮는 깜빡임이 된다. 성패 기록(data_sources.gap-stats)도 그 워크플로가 남긴다.

  // ── K-apt 부대시설 UPSERT (DATA-01) ──────────────────────────────────────
  // 라우트 **마지막**에 둔다. K-apt는 SLA 45일짜리 시설 데이터로 우선순위가 가장
  // 낮은데 이전에는 맨 앞에서 돌았다 — 여기서 타임아웃이 나면 실거래·분양·청약·
  // 오피스텔·갭통계가 전부 실행되지 않았다.
  const kaptStart = Date.now()
  let kaptUpserted = 0
  let kaptErrors = 0
  // API 가 단지를 못 찾아 null 을 준 경우 — 실패가 아니라 정상 스킵이지만, 전부 null 이면
  // 그건 API 장애다. 구분해서 세지 않으면 "0건 적재"의 원인이 실패인지 스킵인지 알 수 없다.
  let kaptNotFound = 0
  let kaptBudgetExceeded = false
  const kaptTargets = await selectKaptTargets(supabase, KAPT_BATCH_SIZE)

  for (const complex of kaptTargets) {
    if (Date.now() - kaptStart > KAPT_TIME_BUDGET_MS) {
      kaptBudgetExceeded = true
      break
    }
    try {
      const info = await fetchKaptBasicInfo(complex.kapt_code)
      if (!info) {
        kaptNotFound++
        continue
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const facilityKaptTable = supabase.from('facility_kapt') as any
      const { error } = await facilityKaptTable.upsert(
        {
          complex_id:      complex.id,
          kapt_code:       info.kaptCode,
          heat_type:       info.heatType ?? null,
          management_type: info.managementType ?? null,
          total_area:      info.totalArea ?? null,
          data_month:      new Date().toISOString().slice(0, 7) + '-01',
        },
        // 제약은 **UNIQUE (complex_id)** 다(2026-08-05 변경).
        //
        // 원래는 UNIQUE (complex_id, data_month) 로 월별 스냅샷을 쌓는 설계였으나,
        // 그 결과 한 단지에 여러 행이 생겼고 FacilityList 가 최신 data_month 한 행만
        // 읽어 값이 비면 시설 정보가 통째로 빈 화면이 됐다(중복 3,730행 → 1,732행 정리,
        // 마이그레이션 20260805063000_facility_kapt_dedupe_and_area.sql).
        //
        // onConflict 는 반드시 실재하는 유니크 제약과 일치해야 한다. 어긋나면 upsert 가
        // **100% 실패**하고 그 실패는 조용하다:
        //   * 2026-07-30: 'complex_id' 만 줬는데 제약이 (complex_id, data_month) 라 전량 실패
        //   * 2026-08-05: 제약을 (complex_id) 로 바꾸면서 이 줄을 같이 못 고쳐 다시 전량 실패
        //     (data_sources.kapt = 'failed'. scripts/kapt-facility-enrich.ts 는 고쳤는데
        //      이 라우트를 빠뜨렸다 — 제약을 바꾸면 **모든 쓰기 지점**을 훑어야 한다.)
        { onConflict: 'complex_id' },
      ) as { error: { message: string } | null }
      if (!error) {
        kaptUpserted++
      } else {
        // 사유를 반드시 남긴다. 예전에는 `else kaptErrors++` 로 카운터만 올리고 error.message 를
        // 통째로 버렸다 — 그래서 2026-07-06 이후 한 달 내내 0건 적재였는데도 "partial" 이라는
        // 사실만 남고 왜인지는 끝까지 알 수 없었다(2026-08-04 전수조사에서 발견).
        // 응답이 길어지지 않도록 앞쪽 몇 건만 남긴다 — 원인 파악에는 표본이면 충분하다.
        kaptErrors++
        if (kaptErrors <= 3) errors.push(`kapt upsert ${complex.kapt_code}: ${error.message}`)
      }
    } catch (err) {
      kaptErrors++
      if (kaptErrors <= 3) errors.push(`kapt=${complex.kapt_code}: ${describeError(err)}`)
    }
  }
  totalUpserted += kaptUpserted
  // 대상이 있었는데 한 건도 못 넣었으면 **실패**다. 예전에는 상태가 'success'|'partial' 뿐이라
  // 전량 스킵(API 가 전부 null)도 'success' 로 보고됐다 — MOLIT 배치가 152/152 실패에도
  // ✅ 를 찍던 것과 같은 구조의 구멍이다(ADR-056).
  // 시간예산 초과를 상태에 반영한다(2026-08-06). 예전에는 kaptBudgetExceeded를 계산해
  // 놓고 판정에 쓰지 않아, 60초 예산이 끝나 중단된 것과 API가 망가진 것이 똑같이
  // 'failed'로 찍혔다. 이 단계는 라우트 **마지막**에 있어 앞 단계가 느려지면 예산을
  // 못 받는 일이 실제로 생긴다 — 원인이 다르면 대응도 달라야 한다.
  const kaptReason = [
    `대상 ${kaptTargets.length}`,
    `적재 ${kaptUpserted}`,
    `실패 ${kaptErrors}`,
    `미조회 ${kaptNotFound}`,
    kaptBudgetExceeded ? `시간예산 ${KAPT_TIME_BUDGET_MS / 1000}초 초과로 중단` : null,
  ].filter(Boolean).join(' · ')

  const kaptStatus =
    kaptTargets.length === 0 ? 'success'
    : kaptUpserted === 0 ? 'failed'
    : (kaptErrors > 0 || kaptBudgetExceeded) ? 'partial'
    : 'success'

  if (kaptStatus !== 'success') errors.push(`kapt: ${kaptReason}`)
  // 사유를 data_sources.error_message에 남긴다. 예전에는 인자를 넘기지 않아
  // last_status='failed' + error_message=null 이 되어 원인을 알 길이 없었다.
  if (!await markCronStatus(
    supabase, 'kapt', kaptStatus, kaptStatus === 'success' ? undefined : kaptReason,
  )) {
    errors.push('markCronStatus(kapt) 갱신 실패 — 로그 확인')
  }

  await markCronStatus(supabase, 'daily-batch', errors.length === 0 ? 'success' : 'partial')

  return Response.json({
    ok: errors.length === 0,
    totalUpserted,
    kaptUpserted,
    kaptSelected: kaptTargets.length,
    kaptErrors,
    kaptNotFound,
    kaptBudgetExceeded,
    presaleUpserted,
    cheongyakUpserted,
    remndrUpserted,
    competitionUpdated,
    expiredDeactivated,
    offiUpserted,
    errors,
  })
}
