// Supabase 호출의 error 미확인 지점을 정적으로 찾는다(2026-08-06).
// realtrade-story 저장소와 동일한 스캐너다 — 같은 부류의 장애를 양쪽에서 겪었다.
//
// [왜 필요한가]
// **supabase-js는 쿼리 실패에 예외를 던지지 않는다.** `{ data, error }`를 돌려줄 뿐이다.
// 그래서 `try { await supabase.rpc(...) } catch { ... }`는 RPC 에러에 절대 발동하지 않고,
// `const { data } = await ...`는 실패를 "빈 결과"와 구분하지 못한다.
//
// 이 한 가지 착각이 이 프로젝트에서 반복해서 장애를 만들었다(2026-08-06 전수 점검):
//   * refresh_complex_price_stats — 4주간 무동작. catch가 한 번도 발동하지 않았다.
//   * match_complex_by_admin — RPC 실패가 "매칭 없음"이 되어 15,315건이 미연결로 적재.
//   * get_hagwon_grade — 호출 즉시 실패하는데 `.data ?? null`로 삼켜 "정보 없음"으로만 보였다.
//
// 전부 예외를 던지지 않고 **정상 응답의 모습**으로 끝나 아무도 눈치채지 못했다.
// 사람이 매번 기억하는 대신 스캐너가 잡는다.
//
// [정밀도에 대한 정직한 한계]
// TS 파서가 아니라 줄 단위 휴리스틱이다. 체인이 20줄을 넘거나 변수를 여러 번 경유하면
// 놓칠 수 있다(거짓 음성). 대신 거짓 양성은 최대한 피하도록 짰다 — 게이트가 시끄러우면
// 아무도 안 보게 된다. onconflict-audit(bds)와 같은 방침이다.

/** 실패해도 조용한 쓰기 연산 */
const WRITE_OPS = /\.(insert|update|upsert|delete)\s*\(/
/** supabase 클라이언트로 통용되는 식별자 */
const CLIENT_IDENT = /\bawait\s+\(?\s*(supabase|admin|client|db)\b/
/** 체인을 이어붙일 최대 줄 수 */
const MAX_CHAIN_LINES = 20

export type ViolationKind = 'rpc' | 'write'
export type ViolationMode = 'discarded' | 'no-error-binding'

export interface Violation {
  file: string
  line: number
  kind: ViolationKind
  mode: ViolationMode
  code: string
}

/**
 * 소스 한 편에서 위반을 찾는다(순수 함수 — 파일시스템을 모른다).
 *
 * - `discarded`       : 결과를 아무 변수에도 받지 않음 (`await supabase.from(..).insert(..)`)
 * - `no-error-binding`: 구조분해에 `error`가 없음 (`const { data } = await supabase.rpc(..)`)
 */
export function findUncheckedErrors(file: string, source: string): Violation[] {
  const lines = source.split('\n')
  const out: Violation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // 주석은 건너뛴다. 이 부류의 버그는 "왜 이렇게 고쳤는지"를 주석에 옛 코드로
    // 남기게 되는데, 그걸 위반으로 잡으면 문서를 잘 쓸수록 게이트가 시끄러워진다.
    // (실제로 bds finalize-ingest-run.ts의 설명 주석이 거짓 양성으로 잡혔다.)
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
    if (!CLIENT_IDENT.test(line)) continue

    // 괄호 균형이 맞을 때까지 체인을 이어붙인다
    let chunk = ''
    for (let j = i; j < Math.min(i + MAX_CHAIN_LINES, lines.length); j++) {
      chunk += lines[j] + '\n'
      const opens = (chunk.match(/\(/g) ?? []).length
      const closes = (chunk.match(/\)/g) ?? []).length
      if (opens > 0 && opens <= closes) break
    }

    const isRpc = /\.rpc\s*\(/.test(chunk)
    const isWrite = WRITE_OPS.test(chunk)
    if (!isRpc && !isWrite) continue

    // 이 줄이 `await`로 시작하면 결과를 아무데도 받지 않는다
    if (/^\s*await\s/.test(line)) {
      out.push({ file, line: i + 1, kind: isRpc ? 'rpc' : 'write', mode: 'discarded', code: line.trim() })
      continue
    }

    // 결과를 받긴 하는데 error를 안 받는 경우.
    // 선언부(= 앞쪽)에서만 판단한다 — 체인 본문의 문자열에 'error'가 있어도 무의미하다.
    const head = line.split('await')[0] ?? ''
    const bindsError = /\berror\b/.test(head)
    // 구조분해가 아니라 응답 객체를 통째로 받는 경우(`const res = await ...`)는
    // 이후에 res.error를 볼 수 있으므로 판정하지 않는다.
    const isDestructuring = /\{[^}]*\}\s*=\s*$/.test(head.trimEnd() + ' ') || /\{[^}]*\}\s*=/.test(head)

    if (isDestructuring && !bindsError) {
      out.push({
        file,
        line: i + 1,
        kind: isRpc ? 'rpc' : 'write',
        mode: 'no-error-binding',
        code: line.trim(),
      })
    }
  }

  return out
}

/** 사람이 읽을 표로 만든다 — 실패 메시지에 그대로 붙인다 */
export function formatViolations(violations: readonly Violation[]): string {
  if (violations.length === 0) return '(없음)'
  return violations
    .map((v) => `  ${v.file}:${v.line}  [${v.kind}/${v.mode}]\n      ${v.code.slice(0, 100)}`)
    .join('\n')
}
