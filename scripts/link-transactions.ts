/**
 * transactions.complex_id 일괄 연결 스크립트 (DATA-09)
 *
 * 실행: npx tsx scripts/link-transactions.ts
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 중요: 단지명 단독 매칭 절대 금지 (CLAUDE.md)
 * 항상 sgg_code + pg_trgm 복합 매칭 — matchByAdminCode() wrapper 사용
 * supabase.rpc('match_complex_by_admin') 직접 호출 금지 — ADMIN_CONFIDENCE_CAP 우회 방지
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

import { nameNormalize } from '../src/lib/data/name-normalize'
import { matchByAdminCode } from '../src/lib/data/complex-matching'

loadEnvConfig(process.cwd())

// ── 임계값 ──────────────────────────────────────────────────────
const AUTO_THRESHOLD = 0.9       // complex_id 자동 설정 (matchByAdminCode.confidence >= 0.9)
const QUEUE_LOW_CONFIDENCE = 0.5 // complex_match_queue low_confidence 적재 (0.5~0.9)
// ADMIN_CONFIDENCE_CAP = 0.85 는 matchByAdminCode 내부에서 적용됨 — 별도 Math.min 불필요

// ── 배치 크기 ────────────────────────────────────────────────────
const BATCH_SIZE = 500

// ── 경로 설정 ────────────────────────────────────────────────────
const LOG_PATH = path.join(
  process.cwd(),
  '.planning/phases/07-data-pipeline/unmatched-log.jsonl',
)

// ── Supabase 클라이언트 (service role) ──────────────────────────
function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    console.error('NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.')
    process.exit(1)
  }
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type SupabaseClientType = ReturnType<typeof createSupabaseClient>

// ── Step 0: complex_aliases exact-match lookup ──────────────────
// raw_complex_name + sgg_code로 수동 매핑 테이블에서 직접 조회
// 이 단계에서 매칭되면 matchByAdminCode 호출 없이 즉시 자동 연결 가능
async function matchByAliasLookup(
  params: { sggCode: string; rawName: string },
  supabase: SupabaseClientType,
): Promise<{ complexId: string; confidence: number } | null> {
  // alias_name으로 후보 조회
  const { data: aliasRows, error } = await supabase
    .from('complex_aliases')
    .select('complex_id, confidence')
    .eq('alias_name', params.rawName)
    .order('confidence', { ascending: false })

  if (error || !aliasRows || aliasRows.length === 0) return null

  // sgg_code 필터: 후보 complex_id 중 sgg_code가 일치하는 단지 찾기
  const complexIds = (aliasRows as Array<{ complex_id: string; confidence: number }>).map(
    r => r.complex_id,
  )
  const { data: complexRow } = await supabase
    .from('complexes')
    .select('id')
    .in('id', complexIds)
    .eq('sgg_code', params.sggCode)
    .neq('status', 'demolished')
    .limit(1)
    .maybeSingle()

  if (!complexRow) return null

  const matched = (aliasRows as Array<{ complex_id: string; confidence: number }>).find(
    r => r.complex_id === (complexRow as { id: string }).id,
  )
  if (!matched) return null
  return { complexId: matched.complex_id, confidence: matched.confidence ?? 0.95 }
}

// ── Step 0.5: jibun 정확 매칭 ──────────────────────────────────
// umd_nm + jibun → complexes.jibun_address 마지막 토큰 비교
// "대동" 같은 동명 중복 단지를 번지로 특정한다. 2건 이상 매칭 시 스킵(모호).
async function matchByJibun(
  params: { sggCode: string; umdNm: string; jibun: string },
  supabase: SupabaseClientType,
): Promise<{ complexId: string; confidence: number } | null> {
  // jibun_address 형식: "경남 창원시 XX구 {umdNm} {jibun}" — 마지막 두 토큰이 읍면동+번지
  // 패턴: "사파동 142" 뒤에 아무것도 없거나(일반 형식) 공백+단지명(KAPT 형식) 둘 다 허용
  // LIKE '%사파동 142' : "경남 창원시 성산구 사파동 142" 매칭
  // LIKE '%사파동 142 %': "경상남도 창원성산구 사파동 142 사파대동2차아파트" 매칭
  const suffix = `${params.umdNm} ${params.jibun}`
  const { data: d1 } = await supabase
    .from('complexes').select('id')
    .eq('sgg_code', params.sggCode)
    .neq('status', 'demolished').neq('status', 'merged')
    .like('jibun_address', `%${suffix}`)
  const { data: d2 } = await supabase
    .from('complexes').select('id')
    .eq('sgg_code', params.sggCode)
    .neq('status', 'demolished').neq('status', 'merged')
    .like('jibun_address', `%${suffix} %`)
  const combined = [...(d1 ?? []), ...(d2 ?? [])]
  const unique = [...new Map(combined.map((r: { id: string }) => [r.id, r])).values()]
  const { data, error } = { data: unique, error: null }

  if (error || !data || data.length === 0) return null
  if (data.length === 1) return { complexId: (data[0] as { id: string }).id, confidence: 0.95 }
  return null  // 2건 이상 → 모호, 다음 단계로 넘김
}

// ── sgg_code → 지역명 (Kakao 주소 검색용, regions 테이블에서 동적 로드) ────
let SGG_LABEL: Record<string, string> = {}
let SGG_CITY_SHORT: Record<string, string> = {}

async function loadRegionMaps(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data, error } = await supabase.from('regions').select('sgg_code, si, gu').eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  const rows = (data ?? []) as Array<{ sgg_code: string; si: string; gu: string | null }>
  SGG_LABEL = Object.fromEntries(rows.map(r => [r.sgg_code, r.gu ? `${r.si} ${r.gu}` : r.si]))
  SGG_CITY_SHORT = Object.fromEntries(rows.map(r => [r.sgg_code, r.si.replace(/(시|군)$/, '')]))
}

// 동일 umd_nm+jibun 반복 호출 방지
const geocodeCache = new Map<string, { lat: number; lng: number } | null>()

async function geocodeJibun(
  sggCode: string,
  umdNm: string,
  jibun: string,
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.KAKAO_REST_API_KEY
  if (!apiKey) return null

  const cacheKey = `${sggCode}|${umdNm}|${jibun}`
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey) ?? null

  await new Promise(r => setTimeout(r, 100)) // Kakao API rate limit

  // 1차: sgg_label 포함 전체 주소, 2차: 구 단위 생략한 시/군 단독 주소, 3차: 지역명 없이
  const sggLabel = SGG_LABEL[sggCode] ?? ''
  const cityShort = SGG_CITY_SHORT[sggCode] ?? ''
  const queries = [
    `경남 ${sggLabel} ${umdNm} ${jibun}`.trim(),
    `경상남도 ${cityShort} ${umdNm} ${jibun}`.trim(),
    `경남 ${umdNm} ${jibun}`.trim(),
  ]

  for (const query of queries) {
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
        {
          headers: { Authorization: `KakaoAK ${apiKey}` },
          signal: AbortSignal.timeout(5_000),
        },
      )
      if (!res.ok) continue
      const json = await res.json() as { documents?: Array<{ x: string; y: string }> }
      const doc = json.documents?.[0]
      if (!doc) continue
      const lng = parseFloat(doc.x)
      const lat = parseFloat(doc.y)
      if (isNaN(lat) || isNaN(lng)) continue
      const result = { lat, lng }
      geocodeCache.set(cacheKey, result)
      return result
    } catch { continue }
  }

  geocodeCache.set(cacheKey, null)
  return null
}

// ── Step 0.7: jibun → Kakao 주소 검색 → 반경 200m 최근접 단지 ────
// Step 0.5(jibun_address LIKE)가 null을 반환한 경우의 폴백.
// complexes.jibun_address 미등재 단지(삼계리 34, 중리 338-1 등)를 좌표로 특정한다.
async function matchByJibunGeocode(
  params: { sggCode: string; umdNm: string; jibun: string },
  supabase: SupabaseClientType,
): Promise<{ complexId: string; confidence: number } | null> {
  const coords = await geocodeJibun(params.sggCode, params.umdNm, params.jibun)
  if (!coords) return null

  const { lat, lng } = coords
  const D = 0.002 // bbox ≈ 200m

  const { data } = await supabase
    .from('complexes')
    .select('id, lat, lng')
    .eq('sgg_code', params.sggCode)
    .neq('status', 'demolished').neq('status', 'merged')
    .not('lat', 'is', null).not('lng', 'is', null)
    .gte('lat', lat - D).lte('lat', lat + D)
    .gte('lng', lng - D).lte('lng', lng + D)

  if (!data || data.length === 0) return null

  type R = { id: string; lat: number; lng: number }
  const sorted = (data as R[])
    .map(c => ({ id: c.id, dist: Math.hypot(c.lat - lat, c.lng - lng) }))
    .sort((a, b) => a.dist - b.dist)

  // 1개이거나 1등이 2등보다 2배 이상 가까운 경우만 확정
  const first = sorted[0]
  const second = sorted[1]
  if (first && (sorted.length === 1 || (second && first.dist * 2 < second.dist))) {
    return { complexId: first.id, confidence: 0.90 }
  }

  return null // 여러 단지가 유사 거리 → 모호
}

// ── 중복 방지 가드 (Pitfall 3) ──────────────────────────────────
// complex_match_queue에 동일 transaction_id가 이미 존재하면 true 반환
async function isAlreadyQueued(
  txId: string,
  supabase: SupabaseClientType,
): Promise<boolean> {
  const { data } = await supabase
    .from('complex_match_queue')
    .select('source')
    .eq('source', 'link-transactions')
    .contains('raw_payload', { tx_id: txId })
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ── complex_match_queue 적재 ────────────────────────────────────
async function enqueueUnmatched(
  tx: { id: string; sgg_code: string; raw_complex_name: string },
  reason: 'low_confidence' | 'no_match',
  candidateIds: string[],
  supabase: SupabaseClientType,
): Promise<void> {
  const { error } = await supabase.from('complex_match_queue').insert({
    source: 'link-transactions',
    raw_payload: {
      tx_id: tx.id,
      sgg_code: tx.sgg_code,
      raw_complex_name: tx.raw_complex_name,
    },
    candidate_ids: candidateIds.length > 0 ? candidateIds : null,
    reason,
    status: 'pending',
  })
  if (error) {
    console.warn(`[WARN] complex_match_queue insert 실패 (tx=${tx.id}): ${error.message}`)
  }
}

// ── unmatched-log.jsonl 기록 ────────────────────────────────────
function appendUnmatchedLog(entry: {
  tx_id: string
  sgg_code: string
  raw_complex_name: string
  reason: string
}): void {
  try {
    const logDir = path.dirname(LOG_PATH)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[WARN] unmatched-log 기록 실패: ${msg}`)
  }
}

// ── 진행 출력 ───────────────────────────────────────────────────
function printProgress(
  batchNum: number,
  totalBatches: number,
  linked: number,
  queued: number,
  unmatched: number,
): void {
  process.stdout.write(
    `\r[배치 ${batchNum}/${totalBatches}] 연결: ${linked}, 저신뢰 큐: ${queued}, 미매칭: ${unmatched}`,
  )
}

// ── 메인 로직 ───────────────────────────────────────────────────
async function main(): Promise<void> {
  const supabase = createSupabaseClient()
  await loadRegionMaps(supabase)

  console.log('== transactions.complex_id 일괄 연결 시작 (DATA-09) ==')
  console.log(`임계값: AUTO_THRESHOLD=${AUTO_THRESHOLD}, QUEUE_LOW_CONFIDENCE=${QUEUE_LOW_CONFIDENCE}`)
  console.log(`배치 크기: ${BATCH_SIZE}`)
  console.log(`미매칭 로그: ${LOG_PATH}`)
  console.log()

  // 1. 총 COUNT 조회 (WHERE complex_id IS NULL AND cancel_date IS NULL AND superseded_by IS NULL)
  const { count, error: countError } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .is('complex_id', null)
    .is('cancel_date', null)
    .is('superseded_by', null)

  if (countError) {
    console.error(`COUNT 조회 실패: ${countError.message}`)
    process.exit(1)
  }

  const total = count ?? 0
  console.log(`처리 대상: ${total.toLocaleString()}건 (complex_id IS NULL)`)

  if (total === 0) {
    console.log('처리할 건이 없습니다. 이미 모두 연결되었거나 데이터가 없습니다.')
    return
  }

  const totalBatches = Math.ceil(total / BATCH_SIZE)
  let totalLinked = 0
  let totalQueuedLow = 0
  let totalUnmatched = 0

  // 2. 배치 페이지네이션 처리
  for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
    const offset = (batchNum - 1) * BATCH_SIZE

    const { data: rows, error: fetchError } = await supabase
      .from('transactions')
      .select('id, sgg_code, raw_complex_name, umd_nm, jibun')
      .is('complex_id', null)
      .is('cancel_date', null)
      .is('superseded_by', null)
      .range(offset, offset + BATCH_SIZE - 1)

    if (fetchError) {
      console.error(`\n배치 ${batchNum} 조회 실패: ${fetchError.message}`)
      continue
    }

    if (!rows || rows.length === 0) break

    const linkedPairs: Array<{ id: string; complexId: string }> = []

    // 3. 각 행에 대해 Step 0 (alias) → Step 0.5 (jibun) → matchByAdminCode 순으로 매칭
    for (const tx of rows as Array<{ id: string; sgg_code: string; raw_complex_name: string; umd_nm: string | null; jibun: string | null }>) {
      const nameNormalized = nameNormalize(tx.raw_complex_name)

      // Step 0: complex_aliases exact-match (수동 매핑 우선 조회)
      const aliasResult = await matchByAliasLookup(
        { sggCode: tx.sgg_code, rawName: tx.raw_complex_name },
        supabase,
      )
      if (aliasResult && aliasResult.confidence >= AUTO_THRESHOLD) {
        linkedPairs.push({ id: tx.id, complexId: aliasResult.complexId })
        continue
      }

      // Step 0.5: jibun 정확 매칭 — umd_nm + jibun → jibun_address 마지막 토큰 비교
      // 대동/동성 등 동명 중복 단지를 번지로 정확히 특정한다
      if (tx.umd_nm && tx.jibun) {
        const jibunResult = await matchByJibun(
          { sggCode: tx.sgg_code, umdNm: tx.umd_nm, jibun: tx.jibun },
          supabase,
        )
        if (jibunResult && jibunResult.confidence >= AUTO_THRESHOLD) {
          linkedPairs.push({ id: tx.id, complexId: jibunResult.complexId })
          continue
        }
      }

      // Step 0.7: jibun → Kakao 주소 API → 반경 200m 최근접 단지
      // jibun_address 미등재 단지(삼계리 34, 중리 338-1 등)를 좌표 기반으로 특정한다
      if (tx.umd_nm && tx.jibun) {
        const geocodeResult = await matchByJibunGeocode(
          { sggCode: tx.sgg_code, umdNm: tx.umd_nm, jibun: tx.jibun },
          supabase,
        )
        if (geocodeResult && geocodeResult.confidence >= AUTO_THRESHOLD) {
          linkedPairs.push({ id: tx.id, complexId: geocodeResult.complexId })
          continue
        }
      }

      // CLAUDE.md 필수: sgg_code + pg_trgm 복합 매칭 — 이름 단독 매칭 절대 금지
      // confidenceCap: 0.9 — 개선된 RPC(word_sim + LIKE unique fallback)의 0.90 반환값을
      //   자동 연결 임계값(AUTO_THRESHOLD=0.9)에 도달하도록 허용
      const matchResult = await matchByAdminCode(
        { sggCode: tx.sgg_code, nameNormalized, confidenceCap: 0.9 },
        supabase,
      )

      if (matchResult && matchResult.confidence >= AUTO_THRESHOLD) {
        // confidence >= 0.9 → 자동 연결
        linkedPairs.push({ id: tx.id, complexId: matchResult.complexId })
      } else if (matchResult && matchResult.confidence >= QUEUE_LOW_CONFIDENCE) {
        // confidence 0.5~0.9 → low_confidence 큐 적재 (중복 방지)
        const already = await isAlreadyQueued(tx.id, supabase)
        if (!already) {
          await enqueueUnmatched(tx, 'low_confidence', [matchResult.complexId], supabase)
        }
        totalQueuedLow++
      } else {
        // null 또는 confidence < 0.5 → no_match 큐 적재 (중복 방지) + 로그
        const already = await isAlreadyQueued(tx.id, supabase)
        if (!already) {
          const candidates = matchResult ? [matchResult.complexId] : []
          await enqueueUnmatched(tx, 'no_match', candidates, supabase)
        }
        appendUnmatchedLog({
          tx_id: tx.id,
          sgg_code: tx.sgg_code,
          raw_complex_name: tx.raw_complex_name,
          reason: 'no_match',
        })
        totalUnmatched++
      }
    }

    // 4. 배치별 bulk UPDATE (WHERE complex_id IS NULL — 이미 연결된 행 덮어쓰기 방지)
    if (linkedPairs.length > 0) {
      for (const pair of linkedPairs) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ complex_id: pair.complexId })
          .eq('id', pair.id)
          .is('complex_id', null) // 재실행 안전 가드 (T-07-02-01 mitigate)
        if (updateError) {
          console.warn(`\n[WARN] UPDATE 실패 (tx=${pair.id}): ${updateError.message}`)
        }
      }
      totalLinked += linkedPairs.length
    }

    printProgress(batchNum, totalBatches, totalLinked, totalQueuedLow, totalUnmatched)
  }

  // 5. 최종 요약
  console.log('\n')
  console.log('== 연결 완료 요약 ==')
  console.log(`총 처리 대상: ${total.toLocaleString()}건`)
  console.log(`자동 연결 (confidence >= 0.9): ${totalLinked.toLocaleString()}건`)
  console.log(`저신뢰 큐 (0.5~0.9): ${totalQueuedLow.toLocaleString()}건`)
  console.log(`미매칭 (< 0.5 or null): ${totalUnmatched.toLocaleString()}건`)

  const matchRate = total > 0 ? ((totalLinked / total) * 100).toFixed(1) : '0.0'
  console.log(`자동 연결율: ${matchRate}%`)

  if (parseFloat(matchRate) >= 80) {
    console.log('✓ 목표 달성: 80% 이상 자동 연결 완료')
  } else {
    console.log('△ 목표 미달: 80% 미만. unmatched-log.jsonl 확인 후 name-aliases.json 보완 및 재실행 권장')
  }

  console.log(`미매칭 로그: ${LOG_PATH}`)
}

main().catch((err: unknown) => {
  console.error('스크립트 실행 실패:', err)
  process.exit(1)
})
