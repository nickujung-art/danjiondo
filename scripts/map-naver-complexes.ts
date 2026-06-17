/**
 * 네이버 부동산 단지 번호(naver_complex_no) 매핑 스크립트
 *
 * 실행: npx tsx scripts/map-naver-complexes.ts [--dry-run]
 *
 * 전략 (RESEARCH.md §3):
 *   1. complexes WHERE naver_complex_no IS NULL AND lat IS NOT NULL 조회
 *   2. 각 단지명으로 searchNaverComplex 호출
 *   3. 이름 정규화 비교 + haversine 거리 < 200m → exact match
 *   4. exact match 시 naver_complex_no UPDATE (dry-run 시 로그만)
 *
 * CLAUDE.md: 단지명 단독 매칭 금지 — 항상 좌표+이름 복합 매칭
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { searchNaverComplex, normalizeComplexName, haversineDistanceM } from '../src/services/naver-land'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const isDryRun = process.argv.includes('--dry-run')
const CONCURRENCY = 2           // 네이버 rate limit 방지
const SLEEP_MS    = 1500        // 요청 간 1.5초 대기
const EXACT_DIST_M   = 200      // 200m 이내 → exact match
const FUZZY_DIST_M   = 500      // 200~500m → fuzzy (skip, 로그만)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface ComplexRow {
  id:               string
  canonical_name:   string
  name_normalized:  string
  lat:              number | null
  lng:              number | null
}

async function mapComplex(row: ComplexRow): Promise<'exact' | 'fuzzy' | 'miss'> {
  const results = await searchNaverComplex(row.canonical_name).catch(() => [])
  if (results.length === 0) return 'miss'

  const normTarget = normalizeComplexName(row.canonical_name)

  for (const candidate of results) {
    const normCand = normalizeComplexName(candidate.complexName)

    // 이름 유사도 우선 체크 (includes 방향 양쪽)
    const nameMatch = normCand.includes(normTarget) || normTarget.includes(normCand)
    if (!nameMatch) continue

    // 좌표 없는 DB 단지 — 이름 exact만 허용 (RESEARCH.md §3.2)
    if (!row.lat || !row.lng) {
      if (normCand === normTarget) {
        if (!isDryRun) {
          await supabase.from('complexes').update({ naver_complex_no: candidate.complexNo }).eq('id', row.id)
        }
        console.log(`[EXACT-NAME-ONLY] ${row.canonical_name} → ${candidate.complexNo}`)
        return 'exact'
      }
      continue
    }

    // 좌표 있는 단지 — 거리 검증 필수
    if (!candidate.latitude || !candidate.longitude) continue

    const dist = haversineDistanceM(
      { lat: row.lat, lng: row.lng },
      { lat: candidate.latitude, lng: candidate.longitude },
    )

    if (dist < EXACT_DIST_M) {
      if (!isDryRun) {
        await supabase.from('complexes').update({ naver_complex_no: candidate.complexNo }).eq('id', row.id)
      }
      console.log(`[EXACT] ${row.canonical_name} → ${candidate.complexNo} (dist: ${Math.round(dist)}m)`)
      return 'exact'
    }

    if (dist < FUZZY_DIST_M) {
      console.log(`[FUZZY-SKIP] ${row.canonical_name} → ${candidate.complexNo} (dist: ${Math.round(dist)}m, 수동 확인 필요)`)
      return 'fuzzy'
    }
  }

  return 'miss'
}

async function processInChunks<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      await fn(item)
      await sleep(SLEEP_MS)
    }
  })
  await Promise.all(workers)
}

async function main() {
  console.log(`[map-naver-complexes] 시작 (dry-run: ${isDryRun})`)

  // naver_complex_no가 아직 없는 단지만 대상
  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, name_normalized, lat, lng')
    .is('naver_complex_no', null)
    .order('canonical_name')

  if (error) throw error

  const total = complexes?.length ?? 0
  console.log(`처리 대상: ${total}개`)

  const stats = { exact: 0, fuzzy: 0, miss: 0 }

  await processInChunks(
    (complexes ?? []) as ComplexRow[],
    async (row) => {
      const result = await mapComplex(row)
      stats[result]++
    },
    CONCURRENCY,
  )

  console.log(`\n=== 결과 ===`)
  console.log(`exact: ${stats.exact} / fuzzy(skip): ${stats.fuzzy} / miss: ${stats.miss}`)
  if (total > 0) {
    console.log(`매핑률: ${((stats.exact / total) * 100).toFixed(1)}%`)
  } else {
    console.log(`매핑률: 0.0% (처리 대상 없음)`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
