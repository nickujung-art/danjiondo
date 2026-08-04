/**
 * 미연결 거래를 단지에 붙일 때 **모호하지 않은 경우만** 골라내는 판정기(2026-08-04).
 *
 * 실행 스크립트는 `scripts/link-unmatched-safe.ts` 이고, 이 파일은 판정 규칙만 담는다.
 *
 * [왜 이렇게까지 보수적인가]
 * 운영권역 미연결 거래 21,529건 중 82.7%(17,800건)는 `complexes` 에 후보 자체가 없다 —
 * 근본 원인은 매칭 로직이 아니라 **단지 마스터 불완전**이다. 마스터가 이만큼 비어 있는
 * 상황에서 "이 동에 후보가 하나뿐이니 맞겠지"는 성립하지 않는다. 형제 단지가 그냥
 * 누락됐을 수 있기 때문이다.
 *
 * 느슨하게 붙였을 때 실제로 벌어지는 일(2026-08-04 실측):
 *   한일타운(377건) → 한일타운4차아파트   1·2·3차 거래가 4차 것으로 표시된다
 *   휴먼빌          → 휴먼빌2단지
 *   대동(2,970건)   → 대동1차황토방
 *   대동(338건)     → 대동디지털황토       숫자가 없어도 아예 다른 이름이다
 * 가격·랭킹·신고가가 통째로 오염된다. **못 붙이는 편이 틀리게 붙이는 것보다 낫다.**
 */

/**
 * 원본명 뒤에 붙어도 같은 단지로 볼 수 있는 접미사.
 *
 * 실측 접미사 분포에서 이 넷만 안전했다. **숫자가 들어간 접미사(1차·2단지·101동)는 절대
 * 추가하지 말 것** — 형제 단지를 통째로 흡수한다. '디지털황토'·'한일유앤아이'처럼 숫자가
 * 없어도 다른 이름인 접미사가 있으므로, 길이나 정규식이 아니라 **허용목록**으로 관리한다.
 */
export const SAFE_SUFFIXES: ReadonlySet<string> = new Set(['', '아파트', '차', '차아파트'])

export interface MatchCandidate {
  id: string
  canonical_name: string
}

export interface UnmatchedTxKey {
  umd_nm: string | null
  raw_complex_name: string | null
}

/**
 * 거래 하나에 붙일 단지를 고른다 — 세 겹을 모두 통과할 때만 반환한다.
 *
 * 1) 동(`umd_nm`)과 원본명이 둘 다 있어야 한다. 동을 모른 채 구 단위로 넓히면 모호 건수가
 *    386 → 1,841 로 다섯 배가 된다(실측).
 * 2) 후보 이름이 원본명으로 시작하고, 남는 접미사가 `SAFE_SUFFIXES` 에 있어야 한다.
 * 3) 그렇게 걸러도 후보가 **정확히 1개**여야 한다.
 *
 * @param candidatesInDong 같은 sgg_code + 같은 동에 속한 단지들. 호출부가 이미 좁혀서 넘긴다.
 */
export function resolveSafeMatch<T extends MatchCandidate>(
  tx: UnmatchedTxKey,
  candidatesInDong: readonly T[],
): T | null {
  const raw = tx.raw_complex_name?.trim()
  if (!raw || !tx.umd_nm) return null

  const matches = candidatesInDong.filter((c) => {
    if (!c.canonical_name.startsWith(raw)) return false
    return SAFE_SUFFIXES.has(c.canonical_name.slice(raw.length))
  })

  return matches.length === 1 ? matches[0]! : null
}
