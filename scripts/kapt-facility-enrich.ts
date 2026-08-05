/**
 * KAPT 단지 시설 정보 적재 스크립트
 *
 * 실행: npx tsx scripts/kapt-facility-enrich.ts [--debug] [--limit N] [--missing-only]
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 조건: complexes WHERE kapt_code IS NOT NULL (전체 단지)
 * 적재 대상: facility_kapt (management_cost_m2, parking_count, elevator_count, data_month)
 * Idempotent: 이미 같은 (complex_id, data_month) 레코드가 있으면 upsert로 덮어씀
 *
 * --debug : 첫 3개 단지 raw API 응답 출력 후 종료
 * --limit N: N개 단지만 처리
 * --missing-only: 이번 달 data_month 레코드가 아직 없는 단지만 처리 (중단된 실행 재개용)
 */
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fetchKaptBasicInfo, fetchKaptDetailInfo } from '../src/services/kapt'

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') })

if (!process.env.KAPT_API_KEY) {
  console.error('[kapt-facility] KAPT_API_KEY 환경변수가 없습니다.')
  process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[kapt-facility] Supabase 환경변수가 없습니다.')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const DEBUG = process.argv.includes('--debug')
const MISSING_ONLY = process.argv.includes('--missing-only')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1] ?? '10', 10) : null
const RATE_LIMIT_DELAY_MS = 100

/**
 * 마지막 수집 시점(해당 월 1일). **시계열 키가 아니다.**
 *
 * 예전에는 이 값이 unique 제약의 일부라 실행할 때마다 새 행이 쌓였다. 시설 정보는 거의
 * 변하지 않는데(과거 행 1,998개 중 최신과 값이 다른 건 16개뿐) 3,730행 / 1,732단지까지
 * 불어났다. 2026-08-05 마이그레이션에서 unique 를 (complex_id) 로 좁혀 단지당 1행으로
 * 고정했고, 이 값은 "언제 받아온 값인가"를 알려주는 용도로만 남았다.
 *
 * `new Date(y, m, 1)` 은 로컬시(KST)라 toISOString() 을 거치면 전월 말일이 된다 —
 * 실제로 2026-04-30 과 2026-05-01 이 같은 달 스냅샷 두 벌로 갈렸다. UTC 로 만든다.
 */
const now = new Date()
const DATA_MONTH = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  .toISOString().slice(0, 10) // YYYY-MM-01

interface ComplexRow {
  id: string
  kapt_code: string
  canonical_name: string
}

/** --missing-only 판정용 — "행이 있나"가 아니라 "값이 있나"를 본다 */
interface FacilityProbeRow {
  complex_id: string
  parking_count: number | null
  elevator_count: number | null
  building_count: number | null
  mgmt_area: number | null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  console.log('[kapt-facility] 시작 —', new Date().toISOString())
  console.log('[kapt-facility] data_month =', DATA_MONTH)

  let data: ComplexRow[] = []
  if (LIMIT) {
    const { data: limited, error } = await supabase
      .from('complexes')
      .select('id, kapt_code, canonical_name')
      .not('kapt_code', 'is', null)
      .order('canonical_name')
      .limit(LIMIT)
    if (error) {
      console.error('[kapt-facility] complexes 조회 실패:', error.message)
      process.exit(1)
    }
    data = (limited ?? []) as ComplexRow[]
  } else {
    // PostgREST 1,000행 기본 캡 우회 — 페이지네이션
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error } = await supabase
        .from('complexes')
        .select('id, kapt_code, canonical_name')
        .not('kapt_code', 'is', null)
        .order('canonical_name')
        .range(offset, offset + PAGE - 1)
      if (error) {
        console.error('[kapt-facility] complexes 조회 실패:', error.message)
        process.exit(1)
      }
      if (!page || page.length === 0) break
      data.push(...(page as ComplexRow[]))
      if (page.length < PAGE) break
    }
  }

  let complexes = data as ComplexRow[]

  if (MISSING_ONLY) {
    // "이번 달에 돌았나"가 아니라 **쓸 만한 값이 들어 있나**로 판단한다(2026-08-05).
    // data_month 기준으로 거르면, 값이 전부 NULL 인 껍데기 행도 "완료"로 세어 영원히
    // 재시도되지 않는다. 실제로 그렇게 생긴 빈 행이 69건 있었다.
    const doneIds = new Set<string>()
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error } = await supabase
        .from('facility_kapt')
        .select('complex_id, parking_count, elevator_count, building_count, mgmt_area')
        .range(offset, offset + PAGE - 1)
      if (error) {
        console.error('[kapt-facility] facility_kapt 조회 실패:', error.message)
        process.exit(1)
      }
      if (!page || page.length === 0) break
      for (const row of page as FacilityProbeRow[]) {
        // mgmt_area 하나만 본다. 이 스크립트가 채우는 필드 중 **가장 나중에 추가된 것**이라,
        // 이게 있으면 최신 코드로 한 번은 돌았다는 뜻이다. "아무 필드나 있으면 완료"로 보면
        // 옛 코드가 채운 주차·승강기만 있는 행이 완료로 세어져 새 필드가 영원히 안 채워진다
        // (실제로 그런 행이 221개 남았다, 2026-08-05).
        // K-apt 가 mgmt_area 를 안 주는 단지는 매번 재시도되지만 2,922곳 중 17곳뿐이라
        // 비용이 무시할 만하고, 스크립트는 멱등이다.
        if (row.mgmt_area != null) doneIds.add(row.complex_id)
      }
      if (page.length < PAGE) break
    }
    const before = complexes.length
    complexes = complexes.filter(c => !doneIds.has(c.id))
    console.log(`[kapt-facility] --missing-only: ${before}개 중 ${doneIds.size}개 완료됨, ${complexes.length}개 남음`)
  }

  const total = complexes.length
  console.log(`[kapt-facility] 처리 대상: ${total}개 단지`)

  let successCount = 0
  let skipCount = 0
  let failCount = 0
  let debugCount = 0

  for (let i = 0; i < complexes.length; i++) {
    const complex = complexes[i]!
    const progress = `[${i + 1}/${total}]`

    try {
      const { parsed, raw } = await fetchKaptDetailInfo(complex.kapt_code)
      await delay(50) // BasicInfo와 DetailInfo 사이 짧은 대기

      // BasicInfo 호출 (동수 — kaptDongCnt 수집)
      let basicParsed = null as Awaited<ReturnType<typeof fetchKaptBasicInfo>>
      try {
        basicParsed = await fetchKaptBasicInfo(complex.kapt_code)
      } catch (err) {
        console.warn(`${progress} BasicInfo 호출 실패 (building_count = null로 진행):`, err instanceof Error ? err.message : err)
      }

      // DEBUG 모드: 처음 3개 raw 응답 출력 후 종료
      if (DEBUG) {
        console.log(`\n${progress} [DEBUG] ${complex.canonical_name} (${complex.kapt_code})`)
        console.log('raw response:', JSON.stringify(raw, null, 2))
        debugCount++
        if (debugCount >= 3) {
          console.log('\n[kapt-facility] --debug 모드: 3개 확인 후 종료')
          return
        }
        await delay(RATE_LIMIT_DELAY_MS)
        continue
      }

      if (!parsed) {
        console.warn(`${progress} ${complex.canonical_name} — API null 반환 (스킵)`)
        skipCount++
        await delay(RATE_LIMIT_DELAY_MS)
        continue
      }

      // 지상+지하 주차면수 합산
      const parkingTotal =
        (parsed.kaptdPcntu ?? 0) + (parsed.kaptdPcnt ?? 0) || null

      const payload = {
        complex_id: complex.id,
        kapt_code: complex.kapt_code,
        parking_count: parkingTotal,
        elevator_count: parsed.kaptdEcnt ?? null,
        management_type: parsed.codeMgr ?? null,
        building_count: basicParsed?.kaptDongCnt ?? null, // UX-03: 동수
        heat_type: basicParsed?.codeHeatNm ?? basicParsed?.heatType ?? null,
        total_area: basicParsed?.kaptTarea ?? basicParsed?.totalArea ?? null,
        management_cost_m2: null, // 월별 총액은 management_cost_monthly 가 별도로 들고 있다
        // 관리비 평형별 배분용 — kaptMarea 가 분모, 면적구간별 세대수가 가중치가 된다
        mgmt_area: basicParsed?.kaptMarea ?? null,
        priv_area: basicParsed?.privArea ?? null,
        households_60: basicParsed?.kaptMparea60 ?? null,
        households_85: basicParsed?.kaptMparea85 ?? null,
        households_135: basicParsed?.kaptMparea135 ?? null,
        households_over135: basicParsed?.kaptMparea136 ?? null,
        data_month: DATA_MONTH,
      }

      // 값이 하나도 없으면 쓰지 않는다(2026-08-05).
      // `parsed` 는 kaptCode/kaptName 만 있어도 truthy 라, API 가 일시적으로 빈 껍데기를
      // 돌려주면 전 필드 NULL 인 행이 그대로 저장됐다. 실제로 69건이 그렇게 생겼고,
      // FacilityList 가 최신 행 1개만 읽기 때문에 그 단지들은 시설 정보가 통째로 사라졌다.
      // "값 없음"과 "수집 실패"를 구분하려면 여기서 막아야 한다.
      const collected = [
        payload.parking_count, payload.elevator_count, payload.management_type,
        payload.building_count, payload.heat_type, payload.total_area, payload.mgmt_area,
      ]
      if (collected.every(v => v == null)) {
        console.warn(`${progress} ${complex.canonical_name} — 응답에 값이 하나도 없음 (저장 안 함)`)
        skipCount++
        await delay(RATE_LIMIT_DELAY_MS)
        continue
      }

      const { error: upsertError } = await supabase
        .from('facility_kapt')
        .upsert(payload, { onConflict: 'complex_id' })

      if (upsertError) {
        console.error(`${progress} ${complex.canonical_name} — upsert 실패:`, upsertError.message)
        failCount++
      } else {
        const fields = [
          parkingTotal != null ? `주차=${parkingTotal}면` : null,
          parsed.kaptdEcnt != null ? `엘리베이터=${parsed.kaptdEcnt}대` : null,
          basicParsed?.kaptDongCnt != null ? `동수=${basicParsed.kaptDongCnt}` : null,
          payload.mgmt_area != null ? `부과면적=${payload.mgmt_area}㎡` : null,
        ].filter(Boolean).join(', ')
        console.log(`${progress} ${complex.canonical_name} → ${fields || '(데이터 없음)'} done`)
        successCount++
      }
    } catch (err) {
      console.error(`${progress} ${complex.canonical_name} — 예외:`, err instanceof Error ? err.message : err)
      failCount++
    }

    await delay(RATE_LIMIT_DELAY_MS)
  }

  console.log('\n[kapt-facility] 완료 ─────────────────────────────────')
  console.log(`  성공: ${successCount}/${total}`)
  console.log(`  스킵: ${skipCount}/${total}`)
  console.log(`  실패: ${failCount}/${total}`)
  console.log(`  완료 시각: ${new Date().toISOString()}`)

  if (failCount > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error('[kapt-facility] 치명적 오류:', err)
  process.exit(1)
})
