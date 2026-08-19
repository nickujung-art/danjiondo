/**
 * 국토부 실거래가 10년 백필 스크립트
 *
 * 실행:
 *   npx tsx scripts/backfill-realprice.ts                     # 아파트 + 연립다세대 모두
 *   npx tsx scripts/backfill-realprice.ts --apt               # 아파트만
 *   npx tsx scripts/backfill-realprice.ts --villa             # 연립다세대만
 *   npx tsx scripts/backfill-realprice.ts --resume            # 완료된 월 건너뜀
 *   npx tsx scripts/backfill-realprice.ts --from=201501 --to=202312
 *   npx tsx scripts/backfill-realprice.ts --sgg=48121,48123
 *
 * 필요 환경변수: MOLIT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * API 한도: 일 10,000회 → 100건/페이지, 월 최대 수십 페이지 → 지역×월 단위 조절
 *
 * 인자 검증(41-02): `--from`/`--to`/`--sgg` 가 빈 값이거나 형식(YYYYMM / 5자리 코드)을
 * 어기면 MOLIT API 를 찌르기 전에 즉시 exit 1 한다. 빈 `--from=` 을 그냥 통과시키면
 * `fromArg ?? defaultFrom` 이 빈 문자열을 nullish 로 취급하지 않아 그대로 새고,
 * `monthRange('', '')` 가 NaN 비교로 빈 배열을 돌려줘 `total=0` → `✅ 0건 upsert` 로
 * **exit 0** 하는 조용한 성공이 된다(ADR-063). 그 경로를 막기 위한 방어다.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'

/**
 * 이 비율 이상 실패하면 배치를 **실패로 간주**하고 exit 1 한다.
 *
 * 30%로 잡은 근거: 정상 실행에서는 실패가 0건이다(2026-07-29~08-01 나흘 연속 76/76 성공).
 * 지역 한두 곳이 일시적으로 실패하는 건 partial 로 넘기되, 3분의 1이 무너지면 개별 지역
 * 문제가 아니라 API·네트워크·키 같은 공통 원인이므로 사람이 봐야 한다.
 */
const FAILURE_ABORT_RATE = 0.3
import { ingestMonth, ingestMonthVilla } from '../src/lib/data/realprice'
import { describeError, isConnectivityError } from '../src/lib/api/describe-error'
import { monthRange, assertYearMonth, parseSggCodes } from '../src/lib/data/backfill-args'

/**
 * 이 머신에서 MOLIT 에 **연결이 되긴 하는지** 한 번만 확인한다.
 *
 * [왜 있는가 — 2026-08-02~03 장애]
 * data.go.kr 은 GitHub Actions(Azure) IP 중 **일부**를 TCP 레벨에서 막는다. 러너 6대를 동시에
 * 띄워 확인했더니 2대는 `UND_ERR_CONNECT_TIMEOUT`, 4대는 HTTP 200 이었다(2026-08-04).
 * 같은 /16 안에서도 갈리므로 대역 차단이 아니라 개별 IP 차단이고, GitHub 러너 IP 는 전 세계가
 * 공유하니 **우리 트래픽과 무관하게** 이미 막힌 IP 를 배정받을 수 있다.
 *
 * 한 job 은 수명 내내 IP 하나를 유지한다 → 막힌 IP 를 뽑으면 152건이 전부 실패한다(0 아니면 100).
 * 실제로 08-02·08-03 이틀 다 152/152 실패였고, 각 건이 5회 재시도 × 10.5초 커넥트 타임아웃으로
 * 60초씩 걸려 **2시간 34분을 태우고** 0건을 적재했다.
 *
 * 그래서 시작하자마자 한 번 찔러보고, 연결 자체가 안 되면 즉시 exit 75 로 끝낸다.
 * 워크플로가 이 코드를 보고 **새 러너(=새 IP)로 다시 시도**한다 — 성공 확률이 회당 약 2/3라
 * 3회면 사실상 붙는다. 프록시나 self-hosted 러너 같은 새 인프라가 필요 없다.
 */
const EXIT_BLOCKED_RUNNER = 75

async function preflight(): Promise<void> {
  const url = new URL(
    'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  )
  url.searchParams.set('ServiceKey', process.env.MOLIT_API_KEY!)
  url.searchParams.set('LAWD_CD', '48121')
  url.searchParams.set('DEAL_YMD', '202601')
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('numOfRows', '1')
  url.searchParams.set('_type', 'json')

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20_000),
    })
    console.log(`🔌 MOLIT 연결 확인: HTTP ${res.status}`)
  } catch (err) {
    if (isConnectivityError(err)) {
      console.error(
        `\n🚫 이 러너에서 MOLIT 에 연결할 수 없습니다 — ${describeError(err)}\n` +
          `   data.go.kr 이 이 러너 IP 를 차단한 것으로 보입니다.\n` +
          `   152건을 전부 실패시키는 대신 즉시 종료합니다(exit ${EXIT_BLOCKED_RUNNER}).\n` +
          `   워크플로가 새 러너에서 재시도합니다.`,
      )
      process.exit(EXIT_BLOCKED_RUNNER)
    }
    // 연결은 되는데 다른 이유로 실패한 경우는 배치를 그대로 진행시킨다 — 일시적일 수 있다
    console.warn(`⚠️  연결 확인 중 예외(계속 진행): ${describeError(err)}`)
  }
}

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const args = process.argv.slice(2)
const useResume = args.includes('--resume')
const fromArg   = args.find(a => a.startsWith('--from='))?.split('=')[1]
const toArg     = args.find(a => a.startsWith('--to='))?.split('=')[1]
const sggArg    = args.find(a => a.startsWith('--sgg='))?.split('=')[1]

// --apt: 아파트만 / --villa: 연립다세대만 / 둘 다 없으면: 모두 실행
const useVilla = args.includes('--villa') || !args.includes('--apt')
const useApt   = args.includes('--apt')   || !args.includes('--villa')

// main() 최상단(preflight() 앞)에서 검증 후 채워진다. getSggCodes() 가 참조한다.
let validatedSggCodes: string[] | undefined

async function getCompletedRuns(sggCode: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('ingest_runs')
    .select('year_month')
    .eq('source_id', 'molit_trade')
    .eq('sgg_code', sggCode)
    .eq('status', 'success')
  return new Set((data ?? []).flatMap(r => r.year_month ? [r.year_month] : []))
}

async function getCompletedVillaRuns(sggCode: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('ingest_runs')
    .select('year_month')
    .eq('source_id', 'molit_villa_trade')
    .eq('sgg_code', sggCode)
    .eq('status', 'success')
  return new Set((data ?? []).flatMap(r => r.year_month ? [r.year_month] : []))
}

async function getSggCodes(): Promise<string[]> {
  if (validatedSggCodes) return validatedSggCodes
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r: { sgg_code: string }) => r.sgg_code)
}

async function cleanupStuckRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const sourceIds = ['molit_trade', 'molit_villa_trade']
  let cleaned = 0
  for (const sourceId of sourceIds) {
    const { data } = await supabase
      .from('ingest_runs')
      .update({ status: 'failed', error_message: 'timeout: cleaned up by next run', completed_at: new Date().toISOString() })
      .eq('source_id', sourceId)
      .eq('status', 'running')
      .lt('started_at', cutoff)
      .select('id')
    cleaned += (data ?? []).length
  }
  return cleaned
}

async function main() {
  if (!process.env.MOLIT_API_KEY) {
    console.error('❌ MOLIT_API_KEY 환경변수 필요')
    process.exit(1)
  }

  // 인자 검증 — MOLIT API 를 찌르기 전(preflight() 앞)에 형식 위반을 exit 1 로 잡는다.
  // 빈 --from=/--to=/--sgg= 가 monthRange(NaN 비교)를 거쳐 조용히 0개월/0건 적재로
  // "✅ 완료" exit 0 하던 경로를 여기서 막는다(41-02, ADR-063).
  try {
    assertYearMonth('--from', fromArg)
    assertYearMonth('--to', toArg)
    validatedSggCodes = parseSggCodes(sggArg)
  } catch (err) {
    console.error(`❌ 인자 검증 실패: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // 러너가 차단된 IP 를 배정받았는지 먼저 확인 — 여기서 걸러야 2시간 반을 안 태운다
  await preflight()

  // 이전 실행에서 timeout된 stuck 레코드 정리 (30분 초과)
  const cleaned = await cleanupStuckRuns()
  if (cleaned > 0) console.log(`🧹 stuck ingest_runs ${cleaned}건 정리`)

  const now = new Date()
  const defaultTo   = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), 1)
  const defaultFrom = `${tenYearsAgo.getFullYear()}${String(tenYearsAgo.getMonth() + 1).padStart(2, '0')}`

  const from    = fromArg ?? defaultFrom
  const to      = toArg   ?? defaultTo
  const months  = monthRange(from, to)
  if (months.length === 0) {
    // 개별 인자는 형식이 맞아도(YYYYMM) 범위가 역전되면(예: --from=202608 --to=201501)
    // monthRange 가 빈 배열을 돌려준다. 이게 마지막 방어선이다 — 여기를 안 막으면
    // total=0 으로 그대로 진행해 "✅ 0건 upsert" exit 0 이 재현된다.
    console.error(`❌ 기간이 비었습니다 (--from=${from} --to=${to}) — from 이 to 보다 늦거나 형식이 역전된 것으로 보입니다.`)
    process.exit(1)
  }
  const sggCodes = await getSggCodes()

  const modes: string[] = []
  if (useApt) modes.push('아파트')
  if (useVilla) modes.push('연립다세대')

  console.log(`📅 기간: ${from} ~ ${to} (${months.length}개월)`)
  console.log(`📍 지역: ${sggCodes.join(', ')}`)
  console.log(`🏠 대상: ${modes.join(' + ')}`)
  console.log(`🔄 Resume: ${useResume}`)

  // apt + villa 둘 다 실행 시 total을 2배로 계산
  const modeCount = (useApt ? 1 : 0) + (useVilla ? 1 : 0)
  const total = months.length * sggCodes.length * modeCount
  let done = 0
  let skipped = 0
  let totalUpserted = 0
  let failures = 0

  /**
   * 프리플라이트를 통과한 뒤 도중에 IP 가 막히는 경우도 있다(장시간 배치 중 자동 차단).
   * 연결 불가 에러가 연속으로 이 횟수만큼 나면 남은 작업을 포기하고 exit 75 한다 —
   * 어차피 같은 IP 라 끝까지 다 실패할 것이고, 계속 두드리는 게 차단을 더 굳힐 수도 있다.
   */
  const CONNECT_FAIL_STREAK_LIMIT = 3
  let connectFailStreak = 0

  function noteFailure(err: unknown): void {
    failures++
    connectFailStreak = isConnectivityError(err) ? connectFailStreak + 1 : 0
    if (connectFailStreak >= CONNECT_FAIL_STREAK_LIMIT) {
      console.error(
        `\n🚫 연결 불가가 연속 ${connectFailStreak}회 — 이 러너 IP 가 차단된 것으로 보고 중단합니다.\n` +
          `   ${done + 1}/${total} 지점에서 포기, 새 러너에서 재시도합니다(exit ${EXIT_BLOCKED_RUNNER}).`,
      )
      process.exit(EXIT_BLOCKED_RUNNER)
    }
  }

  for (const sggCode of sggCodes) {
    if (useApt) {
      const completed = useResume ? await getCompletedRuns(sggCode) : new Set<string>()

      for (const ym of months) {
        if (useResume && completed.has(ym)) {
          skipped++
          done++
          continue
        }

        process.stdout.write(`\r[${done + 1}/${total}] apt ${sggCode} ${ym} ...`)

        try {
          const result = await ingestMonth(sggCode, ym, supabase)
          totalUpserted += result.rowsUpserted
          if (result.status === 'failed') {
            console.warn(`\n  ⚠️  apt ${sggCode} ${ym}: ${result.status} (${result.rowsFailed}건 실패)`)
          }
        } catch (err) {
          console.error(`\n  ❌ apt ${sggCode} ${ym}: ${describeError(err)}`)
          noteFailure(err)
        }

        done++

        // API 한도 보호: 지역·월 단위 사이 짧은 대기 (rate limit)
        await new Promise(r => setTimeout(r, 200))
      }
    }

    if (useVilla) {
      const completedVilla = useResume ? await getCompletedVillaRuns(sggCode) : new Set<string>()

      for (const ym of months) {
        if (useResume && completedVilla.has(ym)) {
          skipped++
          done++
          continue
        }

        process.stdout.write(`\r[${done + 1}/${total}] villa ${sggCode} ${ym} ...`)

        try {
          const result = await ingestMonthVilla(sggCode, ym, supabase)
          totalUpserted += result.rowsUpserted
          if (result.status === 'failed') {
            console.warn(`\n  ⚠️  villa ${sggCode} ${ym}: ${result.status} (${result.rowsFailed}건 실패)`)
          }
        } catch (err) {
          console.error(`\n  ❌ villa ${sggCode} ${ym}: ${describeError(err)}`)
          noteFailure(err)
        }

        done++

        // API 한도 보호: 지역·월 단위 사이 짧은 대기 (rate limit)
        await new Promise(r => setTimeout(r, 200))
      }
    }
  }

  const failureRate = done > 0 ? failures / done : 0
  const aborted = failureRate >= FAILURE_ABORT_RATE

  console.log(
    `\n\n${aborted ? '❌' : '✅'} 완료: ${done}건 처리 (${skipped}건 skip), ` +
      `${totalUpserted}건 upsert, ${failures}건 실패(${(failureRate * 100).toFixed(1)}%)`,
  )

  const syncedAt = new Date().toISOString()
  const finalStatus = failures === 0 ? 'success' : aborted ? 'failed' : 'partial'
  const errorMessage = aborted
    ? `실패율 ${(failureRate * 100).toFixed(1)}% (${failures}/${done}) — 임계 ${FAILURE_ABORT_RATE * 100}% 초과`
    : null

  const baseUpdate = { last_synced_at: syncedAt, last_status: finalStatus, error_message: errorMessage }
  const successUpdate = { ...baseUpdate, consecutive_failures: 0 }
  if (useApt) {
    await supabase.from('data_sources')
      .update(failures === 0 ? successUpdate : baseUpdate)
      .eq('id', 'molit_trade')
  }
  if (useVilla) {
    await supabase.from('data_sources')
      .update(failures === 0 ? successUpdate : baseUpdate)
      .eq('id', 'molit_villa_trade')
  }

  // 실패율이 임계를 넘으면 **0이 아닌 코드로 종료**해 GitHub Actions를 빨간불로 만든다.
  //
  // 2026-08-02 이 스크립트는 152건을 **전부** 실패하고 0건 적재했는데도 `✅ 완료`를 찍고
  // exit 0으로 끝났다(MOLIT API가 `TypeError: fetch failed`로 응답 불능). 워크플로는 success,
  // data_sources 는 'partial' — 어디를 봐도 정상처럼 보였고 DB를 직접 뒤져서야 발견했다.
  // finalStatus 가 'success'|'partial' 두 값뿐이라 'failed'가 될 수 없었던 것이 근본 원인이다.
  if (aborted) {
    console.error(`\n실패율이 임계(${FAILURE_ABORT_RATE * 100}%)를 넘어 실패로 종료합니다.`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
