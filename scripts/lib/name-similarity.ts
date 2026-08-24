/**
 * 단지명 유사도 — 거래 원본명(raw_complex_name)과 단지명을 독립 근거로 비교한다.
 *
 * 매칭 RPC 의 trigram 을 흉내내지 않는다. RPC 가 이름으로 붙인 결과를 검증하는 쪽이라
 * 같은 척도를 쓰면 검증이 아니라 동어반복이 된다.
 *
 * 2026-08-21 `relink-transactions-by-jibun.ts` 에서 시작해 2026-08-24
 * `audit-wholesale-mislink.ts` 가 같은 척도를 요구하면서 공유 모듈로 뽑았다.
 * 두 스크립트의 임계값 판단이 갈라지지 않게 하는 것이 목적이다.
 */

/** 이름 정규화 — 공백·괄호·차수 표기를 걷어낸다. src/lib/data/name-normalize.ts 의 축약판. */
export function norm(s: string | null): string {
  if (!s) return ''
  return s.replace(/\(.*?\)/g, '').replace(/[\s·\-_,]/g, '').toLowerCase()
}

/** 문자 bigram Dice 계수. */
export function nameSim(a: string, b: string): number {
  const A = norm(a), B = norm(b)
  if (!A || !B) return 0
  if (A === B) return 1
  if (A.includes(B) || B.includes(A)) return 0.9
  const g = (s: string) => { const o = new Set<string>(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o }
  const ga = g(A), gb = g(B)
  if (!ga.size || !gb.size) return 0
  let inter = 0
  for (const x of ga) if (gb.has(x)) inter++
  return (2 * inter) / (ga.size + gb.size)
}
