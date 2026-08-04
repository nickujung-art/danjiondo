/**
 * 네트워크 에러를 "원인까지 보이는" 한 줄 문자열로 만든다.
 *
 * [왜 필요한가 — 2026-08-02~03 MOLIT 장애]
 * 이틀 연속 152/152 전건이 실패했는데 로그에 남은 건 `TypeError: fetch failed` 뿐이었다.
 * undici(Node fetch)는 실제 원인을 **전부 `err.cause` 에 넣고** 겉면은 항상 이 한 문장으로
 * 통일한다. 그래서 `String(err)` 로 찍으면 DNS 실패·TCP 커넥트 타임아웃·TLS 실패·상대방
 * 커넥션 끊김이 **전부 같은 글자로 보인다** — 로그만 보고는 무엇을 고쳐야 할지 알 수 없다.
 *
 * cause.code 만 있어도 판단이 갈린다:
 *   UND_ERR_CONNECT_TIMEOUT → 방화벽 DROP 또는 상대 서버 다운(연결 자체가 안 됨)
 *   ECONNREFUSED            → 포트는 닫혔지만 IP 는 살아있음
 *   ENOTFOUND / EAI_AGAIN   → DNS
 *   UND_ERR_SOCKET          → 연결됐다가 상대가 끊음(레이트리밋 의심)
 *   CERT_* / ERR_TLS_*      → TLS
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)

  const parts = [`${err.name}: ${err.message}`]

  // cause 는 중첩될 수 있다(fetch failed → SocketError → Error). 끝까지 따라간다.
  let cause: unknown = err.cause
  let depth = 0
  while (cause instanceof Error && depth < 3) {
    const code = (cause as { code?: string }).code
    parts.push(`cause=${code ?? cause.name}(${cause.message})`)
    cause = cause.cause
    depth++
  }

  return parts.join(' | ')
}

/**
 * 연결 자체가 성립하지 않은 에러인가 — 즉 **재시도해도 이 머신에서는 영원히 실패**할 종류인가.
 *
 * HTTP 500 이나 타임아웃은 상대 서버가 바쁜 것이라 재시도가 의미 있지만, TCP 커넥트가
 * 타임아웃/거부되는 건 방화벽 차단이거나 서버가 죽은 것이다. 같은 IP 로 몇 번을 더 두드려도
 * 결과가 같으므로, 이걸 구분해야 "빨리 포기하고 다른 러너에서 다시"라는 판단을 할 수 있다.
 */
const CONNECTIVITY_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
])

export function isConnectivityError(err: unknown): boolean {
  let cause: unknown = err
  let depth = 0
  while (cause instanceof Error && depth < 4) {
    const code = (cause as { code?: string }).code
    if (code && CONNECTIVITY_CODES.has(code)) return true
    cause = cause.cause
    depth++
  }
  return false
}
