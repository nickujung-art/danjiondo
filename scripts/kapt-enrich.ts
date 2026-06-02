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
import { fetchComplexList, fetchKaptBasicInfo } from '../src/services/kapt'

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
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < complexes.length; i++) {
    const complex = complexes[i]!
    const progress = `[${i + 1}/${total}]`

    try {
      // fetchKaptBasicInfo 호출
      const info = await fetchKaptBasicInfo(complex.kapt_code)

      if (!info) {
        console.warn(`${progress} ${complex.canonical_name} — fetchKaptBasicInfo null 반환 (스킵)`)
        failCount++
        await delay(RATE_LIMIT_DELAY_MS)
        continue
      }

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
  console.log(`  성공: ${successCount}/${total}`)
  console.log(`  실패: ${failCount}/${total}`)
  console.log(`  완료 시각: ${new Date().toISOString()}`)

  if (failCount > 0) {
    console.warn(`[kapt-enrich] ${failCount}개 단지 실패 — 재실행 시 WHERE si IS NULL 조건으로 재시도됩니다.`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('[kapt-enrich] 치명적 오류:', err)
  process.exit(1)
})
