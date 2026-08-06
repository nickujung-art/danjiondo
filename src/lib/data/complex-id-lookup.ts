import type { SupabaseClient } from '@supabase/supabase-js'

// 실거래 적재 중 단지 자동 연결(DATA-10) — RPC 실패를 "매칭 없음"과 구분한다.
//
// [왜 분리해 만들었나 — 2026-08-06]
// 이전 구현은 세 곳(아파트 매매/전월세, 연립다세대, 오피스텔)에 복제돼 있었고 전부
// 같은 결함을 갖고 있었다.
//
//   const { data, error } = await supabase.rpc('match_complex_by_admin', {...})
//   if (error || !data || data.length === 0) {
//     complexIdCache.set(key, null)   // ← 두 개의 버그가 한 줄에 있다
//     return null
//   }
//
//   (1) RPC **에러**와 "일치하는 단지 없음"을 같게 취급한다. 호출이 실패해도 거래는
//       complex_id=null로 적재되고, 화면에서는 "등록되지 않은 건물"과 구분되지 않는다.
//   (2) 그 실패를 **캐시에 굳힌다**. 캐시 키가 (시군구, 정규화이름, 읍면동)이라
//       일시적 실패 한 번이 그 단지의 남은 모든 거래를 미연결로 만든다.
//
// 2026-05-26 백필에서 창원·김해만 15,315건이 미연결로 적재됐다. 마린애시앙부영/월영동은
// 그 전까지 2,492건이 정상 연결돼 있었는데 그날 143건이 통째로 빠졌다 — 캐시 키 하나가
// 오염되면 그 단지 전체가 빠진다는 (2)의 증상과 정확히 일치한다.
//
// [설계 결정] 에러면 재시도 후에도 실패 시 **던진다**.
// 미연결 거래는 사실상 쓸 수 없다(단지 상세·랭킹·차트 어디에도 안 잡힌다). 그런데
// 겉보기에는 "우리가 모르는 건물"과 똑같아서 조용히 쌓인다. 차라리 적재를 실패시켜
// ingest_runs.rows_failed에 남기는 편이 낫다 — MOLIT 적재는 dedupe_key 기반이라
// 재실행하면 복구된다. 침묵보다 시끄러운 실패가 낫다.
import type { Database } from '@/types/database'

/** 자동 연결에 쓰는 RPC 이름 — 세 적재 경로가 공유한다 */
const MATCH_RPC = 'match_complex_by_admin'
/** 일시적 실패(타임아웃·순간 부하)를 흡수하기 위한 재시도 횟수 */
const MAX_ATTEMPTS = 2
/** 재시도 전 대기(ms) */
const RETRY_DELAY_MS = 250

export interface MatchArgs {
  sggCode: string
  nameNormalized: string
  umdNm?: string | null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 단지 1건을 조회한다. 매칭이 없으면 null, **RPC가 실패하면 throw**.
 *
 * minSimilarity는 호출부가 정한다 — 아파트·연립은 0.9(고신뢰만), 오피스텔은 이름이
 * 고유해 0.85를 쓴다. RPC에 넘기는 값과 반환된 trgm_sim 재확인에 같은 값을 쓴다.
 */
export async function matchComplexId(
  supabase: SupabaseClient<Database>,
  args: MatchArgs,
  minSimilarity: number,
): Promise<string | null> {
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc(MATCH_RPC, {
      p_sgg_code: args.sggCode,
      p_name_normalized: args.nameNormalized,
      p_min_similarity: minSimilarity,
      // 생략하면 DB 기본값 NULL이 적용된다(p_umd_nm text DEFAULT NULL) — 동 필터 없음과 같다
      p_umd_nm: args.umdNm ?? undefined,
    })

    if (!error) {
      const rows = (data ?? []) as { id: string; trgm_sim: number }[]
      const top = rows[0]
      if (!top) return null
      return Number(top.trgm_sim) >= minSimilarity ? top.id : null
    }

    lastError = error.message
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
  }

  throw new Error(
    `${MATCH_RPC} failed after ${MAX_ATTEMPTS} attempts ` +
      `(sgg=${args.sggCode} name=${args.nameNormalized} umd=${args.umdNm ?? '-'}): ${lastError}`,
  )
}

/**
 * 적재 1회분 동안만 사는 캐시를 붙인 조회 함수를 만든다.
 * 캐시는 호출마다 새로 만든다 — 모듈 스코프에 두면 적재 간 오염이 생긴다(Pitfall 5).
 *
 * **실패는 캐시하지 않는다.** matchComplexId가 던지면 여기서도 그대로 전파되고
 * 캐시에는 아무것도 남지 않으므로, 다음 거래는 다시 조회를 시도한다.
 */
export function createComplexIdLookup(
  supabase: SupabaseClient<Database>,
  minSimilarity: number,
): (sggCode: string, nameNormalized: string, umdNm?: string | null) => Promise<string | null> {
  const cache = new Map<string, string | null>()

  return async function lookupComplexIdCached(sggCode, nameNormalized, umdNm) {
    const key = `${sggCode}:${nameNormalized}:${umdNm ?? ''}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const complexId = await matchComplexId(supabase, { sggCode, nameNormalized, umdNm }, minSimilarity)
    cache.set(key, complexId)
    return complexId
  }
}
