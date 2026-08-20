/**
 * KAPT 단지 상세정보 적재 스크립트 (DATA-08)
 *
 * 실행: npx tsx scripts/kapt-enrich.ts
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 조건: WHERE kapt_code IS NOT NULL AND si IS NULL (idempotent — 재실행 안전)
 * API 한도: KAPT 일 100,000회. 669개 × 1회 = 안전. 방어적 100ms 대기 적용.
 *
 * 실행 흐름:
 * 1. regions 테이블에서 sgg_code → si/gu 매핑 조회
 * 2. fetchComplexList를 sgg_code별 1회 호출 → kaptCode → dong(as3) 매핑 생성
 * 3. complexes에서 WHERE kapt_code IS NOT NULL AND si IS NULL 조회
 * 4. 각 단지에 fetchKaptBasicInfo 호출 → si/gu/dong/road_address/household_count/built_year/heat_type/data_completeness 업데이트
 * 5. 진행 상황 + 완료 요약 출력
 */
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { fetchComplexList, fetchKaptBasicInfoDetailed } from '../src/services/kapt'

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') })

// ── 환경변수 검증 ──────────────────────────────────────────────
if (!process.env.KAPT_API_KEY) {
  console.error('[kapt-enrich] KAPT_API_KEY 환경변수가 없습니다.')
  process.exit(1)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[kapt-enrich] Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 없습니다.')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const DEBUG = process.argv.includes('--debug')
const RATE_LIMIT_DELAY_MS = 100

// ── 타입 정의 ──────────────────────────────────────────────────
interface RegionRow {
  sgg_code: string
  si: string
  gu: string | null
}

interface ComplexRow {
  id: string
  kapt_code: string
  sgg_code: string
  canonical_name: string
  data_completeness: Record<string, boolean> | null
}

// ── built_year 추출 헬퍼 ───────────────────────────────────────
function extractBuiltYear(kaptUsedate: string | undefined | null): number | null {
  if (!kaptUsedate) return null
  const year = parseInt(kaptUsedate.slice(0, 4), 10)
  return isNaN(year) ? null : year
}

// ── delay 헬퍼 ─────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── buildDongMap: fetchComplexList를 sgg_code별 1회 호출 ────────
async function buildDongMap(sggCodes: string[]): Promise<Map<string, string>> {
  const dongMap = new Map<string, string>()
  let totalAs3Populated = 0
  let totalComplexes = 0

  for (const sggCode of sggCodes) {
    try {
      const complexList = await fetchComplexList(sggCode)
      for (const complex of complexList) {
        totalComplexes++
        if (complex.as3) {
          dongMap.set(complex.kaptCode, complex.as3)
          totalAs3Populated++
        }
      }
      console.log(`[buildDongMap] sgg_code=${sggCode} → ${complexList.length}개 단지 (as3 채워진 비율: ${totalAs3Populated}/${totalComplexes})`)
    } catch (err) {
      console.error(`[buildDongMap] sgg_code=${sggCode} fetchComplexList 실패:`, err instanceof Error ? err.message : err)
    }
  }

  const as3Rate = totalComplexes > 0 ? ((totalAs3Populated / totalComplexes) * 100).toFixed(1) : '0'
  console.log(`[buildDongMap] dong(as3) 매핑 완료: ${dongMap.size}개 단지, 채워진 비율 ${as3Rate}%`)
  return dongMap
}

// ── main ───────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('[kapt-enrich] 시작 —', new Date().toISOString())

  // 1. regions 테이블에서 sgg_code → si/gu 매핑 조회
  const { data: regionsData, error: regionsError } = await supabase
    .from('regions')
    .select('sgg_code, si, gu')

  if (regionsError) {
    console.error('[kapt-enrich] regions 조회 실패:', regionsError.message)
    process.exit(1)
  }

  const regionMap = new Map<string, { si: string; gu: string | null }>(
    (regionsData as RegionRow[]).map(r => [r.sgg_code, { si: r.si, gu: r.gu }]),
  )
  const sggCodes = [...regionMap.keys()]
  console.log(`[kapt-enrich] regions: ${sggCodes.length}개 sgg_code 로드`)

  // 2. buildDongMap: fetchComplexList를 sgg_code별 1회 호출
  const dongMap = await buildDongMap(sggCodes)

  // 3. complexes에서 WHERE kapt_code IS NOT NULL AND built_year IS NULL 조회
  // (si는 regions 테이블에서 SQL로 채워질 수 있으므로 built_year를 idempotent 마커로 사용)
  const { data: complexesData, error: complexesError } = await supabase
    .from('complexes')
    .select('id, kapt_code, sgg_code, canonical_name, data_completeness')
    .not('kapt_code', 'is', null)
    .is('built_year', null)

  if (complexesError) {
    console.error('[kapt-enrich] complexes 조회 실패:', complexesError.message)
    process.exit(1)
  }

  const complexes = complexesData as ComplexRow[]
  const total = complexes.length
  console.log(`[kapt-enrich] 처리 대상: ${total}개 단지 (WHERE kapt_code IS NOT NULL AND built_year IS NULL)`)

  if (total === 0) {
    console.log('[kapt-enrich] 처리 대상 없음 — 이미 모두 보강 완료')
    return
  }

  // 4. 각 단지 처리
  //
  // [사유를 나눠 센다 — 2026-08-20]
  // 예전에는 값을 못 얻으면 전부 failCount 였다. 그래서 로그에 "null 반환 (스킵)" 만 남고
  // **왜 못 얻었는지 알 수 없었다.** 그 상태에서 원인을 세 번 잘못 짚었다.
  //  - noItem   : API 는 정상인데 그 코드에 항목이 없다 → 대상 아님. 종료 코드에 넣지 않는다
  //  - envelope : data.go.kr 에러 봉투(쿼터 초과 등) → **재시도로 풀린다. 실패로 센다**
  //  - schema   : 응답 구조가 바뀌었다 → 실패로 센다
  //  - fail     : 예외·DB 업데이트 오류
  let successCount = 0
  let failCount = 0
  let noItemCount = 0
  let envelopeCount = 0
  let schemaCount = 0
  const noItemNames: string[] = []

  for (let i = 0; i < complexes.length; i++) {
    const complex = complexes[i]!
    const progress = `[${i + 1}/${total}]`

    try {
      const outcome = await fetchKaptBasicInfoDetailed(complex.kapt_code)

      if (!outcome.ok) {
        // 사유를 **로그에 남긴다** — 이게 없어서 원인 규명에 하루가 걸렸다.
        console.warn(`${progress} ${complex.canonical_name} — ${outcome.reason}: ${outcome.hint}`)
        if (outcome.reason === 'no_item') {
          noItemCount++
          noItemNames.push(complex.canonical_name)
        } else if (outcome.reason === 'error_envelope') {
          envelopeCount++
        } else {
          schemaCount++
        }
        await delay(RATE_LIMIT_DELAY_MS)
        continue
      }
      const info = outcome.data

      if (DEBUG) {
        console.log(`${progress} [DEBUG] raw info:`, JSON.stringify(info))
      }

      // si/gu 파생 (regions 테이블 — 항상 100% 커버)
      const region = regionMap.get(complex.sgg_code) ?? { si: null, gu: null }
      const si = region.si
      const gu = region.gu

      // dong 파생 (fetchComplexList.as3 — 일부만 채워질 수 있음)
      const dong = dongMap.get(complex.kapt_code) ?? null

      // built_year 추출 (kaptUsedate YYYYMMDD → 앞 4자리)
      const builtYear = extractBuiltYear(info.kaptUsedate)

      // heat_type: heatType 우선, 없으면 codeHeatNm 폴백
      const heatType = info.heatType ?? info.codeHeatNm ?? null

      // data_completeness: JavaScript spread merge — 다른 키(transactions 등) 보존
      // 07-02(link-transactions)가 병렬로 transactions: true를 기록할 수 있으므로
      // 전체 JSONB 덮어쓰기 금지
      const existing = (complex.data_completeness as Record<string, boolean> | null) ?? {}
      const merged = { ...existing, kapt: true }

      // Supabase update
      const { error: updateError } = await supabase
        .from('complexes')
        .update({
          si,
          gu,
          dong,
          road_address: info.doroJuso ?? null,
          household_count: info.kaptdaCnt ?? null,
          built_year: builtYear,
          heat_type: heatType,
          data_completeness: merged,
        })
        .eq('id', complex.id)

      if (updateError) {
        console.error(`${progress} ${complex.canonical_name} — 업데이트 실패:`, updateError.message)
        failCount++
      } else {
        console.log(`${progress} ${complex.canonical_name} → si=${si}, dong=${dong ?? 'null'}, built_year=${builtYear ?? 'null'} done`)
        successCount++
      }
    } catch (err) {
      console.error(`${progress} ${complex.canonical_name} — 예외:`, err instanceof Error ? err.message : err)
      failCount++
    }

    // KAPT rate limit 방어 (일 100,000회 한도)
    await delay(RATE_LIMIT_DELAY_MS)
  }

  // 5. 완료 요약
  console.log('\n[kapt-enrich] 완료 ─────────────────────────────────')
  const realFailures = failCount + envelopeCount + schemaCount
  console.log(`  성공:          ${successCount}/${total}`)
  console.log(`  대상 아님:     ${noItemCount}/${total}  (API 정상 응답, 해당 항목 없음)`)
  console.log(`  실패:          ${realFailures}/${total}`)
  console.log(`    ├ 에러 봉투: ${envelopeCount}  (쿼터·키 등 — 재시도로 풀린다)`)
  console.log(`    ├ 스키마:    ${schemaCount}  (응답 구조 변경 의심)`)
  console.log(`    └ 그 외:     ${failCount}  (예외·DB 업데이트 오류)`)
  console.log(`  완료 시각: ${new Date().toISOString()}`)

  if (noItemCount > 0) {
    // 대상 아님은 **실패가 아니다.** K-apt 등록이 없거나 코드가 갱신된 단지가 섞여 있고
    // 재실행해도 결과가 같다. 이걸 실패로 세면 워크플로가 영구히 빨간색이 되고,
    // 그러면 진짜 장애(realFailures)가 그 빨간색에 묻힌다.
    console.log(
      `[kapt-enrich] 대상 아님 ${noItemCount}개 — 재실행해도 같다: ` +
        noItemNames.slice(0, 10).join(', ') +
        (noItemNames.length > 10 ? ` 외 ${noItemNames.length - 10}개` : ''),
    )
  }

  if (realFailures > 0) {
    // 에러 봉투·스키마 변경·예외는 **시끄럽게 실패해야 한다.** 특히 에러 봉투를 조용히
    // 넘기면 쿼터 때문에 못 받은 단지를 영영 건너뛴다.
    console.warn(`[kapt-enrich] ${realFailures}개 실패 — 재실행 시 WHERE si IS NULL 조건으로 재시도됩니다.`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('[kapt-enrich] 치명적 오류:', err)
  process.exit(1)
})
