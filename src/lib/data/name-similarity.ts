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

/**
 * 문자 bigram Dice 계수.
 *
 * 🔴 부분일치에 0.9 를 고정으로 주면 **짧은 일반명이 과대평가된다.** 2026-08-24 실측:
 *   대우그린   ↔ 그린   0.9 인데 실제 거리 3,989m
 *   경남신포맨션 ↔ 경남   0.9 인데 실제 거리 13,901m
 * 반대로 `동부산훼밀리2차아파트 ↔ 동부산훼미리2차`(오타 1자, 실제 0m)는 부분일치가
 * 아니라 Dice 로 0.59 를 받는다. 즉 **부분일치 0.9 는 순위를 거꾸로 만든다.**
 *
 * 그래서 길이 비율로 깎는다 — 짧은 쪽이 긴 쪽의 얼마를 덮는지에 비례시킨다.
 * 두 소비처(relink·audit)는 임계값 0.3 이라 통과/탈락 판정은 바뀌지 않고 **순위만 정직해진다**.
 * (`대우그린 ↔ 그린` 은 0.70 으로 여전히 후보에 남는다 — 최종 판정자는 이름이 아니라 거리다.)
 */
export function nameSim(a: string, b: string): number {
  const A = norm(a), B = norm(b)
  if (!A || !B) return 0
  if (A === B) return 1
  if (A.includes(B) || B.includes(A)) {
    const ratio = Math.min(A.length, B.length) / Math.max(A.length, B.length)
    return 0.5 + 0.4 * ratio
  }
  const g = (s: string) => { const o = new Set<string>(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o }
  const ga = g(A), gb = g(B)
  if (!ga.size || !gb.size) return 0
  let inter = 0
  for (const x of ga) if (gb.has(x)) inter++
  return (2 * inter) / (ga.size + gb.size)
}
