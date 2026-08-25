/**
 * K-apt 법정동주소(kaptAddr) 정규화 (2026-08-25)
 *
 * [왜 필요한가]
 * K-apt 가 주는 원형에는 기형이 둘 있다:
 *
 *   경상남도 창원의창구 명서동 27 창원두산위브아파트
 *            ^^^^^^^^^ '창원시' 누락        ^^^^^^^^^^^^^ 단지명이 붙어 있다
 *
 * 기존 데이터의 관례는 `경남 창원시 의창구 …` 다(2026-08-25 실측: 첫 토큰 `경남` 1,107 vs
 * `경상남도` 15 / 창원 시군구는 전부 `창원시 ○○구` 정상형). 표기가 섞이면 문자열 비교로
 * 동·시군구를 읽는 감사 도구가 어긋난다.
 *
 * [무엇에 쓰이는 값인가 — 화면이 아니다]
 * `complexes.jibun_address` 는 **앱에서 읽지 않는다**(2026-08-25 확인: `src/` 전체에서
 * `complex-matching.ts` 의 쓰기 한 곳뿐. JSON-LD PostalAddress 는 `road_address` 를 쓴다).
 * 이 값의 쓸모는 **감사 근거**다 — `audit-wholesale-mislink.ts` 가 "단지가 스스로 밝히는 동"
 * 으로 삼아 거래 다수결(확정 지번)과 대조한다. 두 근거가 독립이어야 전건 오연결이 잡힌다.
 * 그래서 비어 있으면 그 단지는 **감사 자체가 안 된다.**
 *
 * [파싱하지 않고 재구성한다]
 * 시도·시군구는 `sgg_code` 로 이미 알고 있다. kaptAddr 에서는 **동+지번 꼬리만** 취한다.
 * 상류 표기가 어떻게 바뀌어도 앞부분은 우리가 아는 정규형으로 고정된다.
 *
 * 🔴 vitest 는 `src/**` 만 수집한다. 그래서 이 순수 함수는 `scripts/` 가 아니라 여기 둔다
 *    (2026-08-24 `name-similarity.ts` 를 같은 이유로 옮긴 선례를 따른다).
 */

/** 시군구 코드 → 정규 주소 접두. 기존 데이터의 지배적 표기와 맞춘다. */
export const SGG_ADDRESS_PREFIX: Record<string, string> = {
  '48121': '경남 창원시 의창구', '48123': '경남 창원시 성산구',
  '48125': '경남 창원시 마산합포구', '48127': '경남 창원시 마산회원구',
  '48129': '경남 창원시 진해구', '48250': '경남 김해시',
  '26110': '부산 중구', '26140': '부산 서구', '26170': '부산 동구', '26200': '부산 영도구',
  '26230': '부산 부산진구', '26260': '부산 동래구', '26290': '부산 남구', '26320': '부산 북구',
  '26350': '부산 해운대구', '26380': '부산 사하구', '26410': '부산 금정구', '26440': '부산 강서구',
  '26470': '부산 연제구', '26500': '부산 수영구', '26530': '부산 사상구', '26710': '부산 기장군',
}

const squash = (s: string | null | undefined): string => (s ?? '').replace(/\s/g, '')

/**
 * 마지막 토큰이 지번 꼴이면 **정규화한 지번**을, 아니면 null 을 돌려준다.
 *
 * 🔴 K-apt 는 부번이 없을 때 **하이픈을 남긴다** — 2026-08-25 실측 29건:
 *      삼계동 1564-  ·  중앙동 528-  ·  안민동 691-  ·  하대동 111-
 *    그대로 두면 `경남 김해시 삼계동 1564-` 라는 주소가 된다. 본번만 남긴다.
 */
function normalizeJibun(tokens: readonly string[]): string | null {
  const last = tokens[tokens.length - 1]
  if (!last) return null
  const m = /^(\d+)(?:-(\d+))?-?$/.exec(last)
  if (!m?.[1]) return null
  return m[2] ? `${m[1]}-${m[2]}` : m[1]
}

export interface NormalizeResult {
  ok: boolean
  /** 성공 시 `<정규 접두> <동> <지번>`. */
  address?: string
  /** 성공 시 꼬리의 첫 토큰(법정동). 확정 지번과 교차검증할 때 쓴다. */
  dong?: string
  /** 실패 사유. 조용히 건너뛰지 않기 위해 항상 채운다. */
  reason?: string
}

/**
 * `kaptAddr` → `<정규 접두> <동> <지번>`.
 *
 *   ① 끝에 붙은 `kaptName` 을 떼어낸다
 *   ② 동/리/가/읍/면 으로 끝나는 **첫 토큰**부터 끝까지가 꼬리다
 *      — 시도(…도)·시군구(…시/…구/창원○○구)는 그 패턴에 걸리지 않는다
 *      — `진영읍 여래리 233-8` 처럼 읍+리가 겹쳐도 첫 토큰부터 잡으면 온전하다
 *   ③ 꼬리가 지번으로 끝나지 **않으면 실패**로 돌려준다 — 파싱이 어긋난 것이므로
 *      이상한 주소를 조용히 쓰느니 사람에게 남긴다
 */
export function normalizeKaptAddr(
  kaptAddr: string,
  kaptName: string | null | undefined,
  sggCode: string,
): NormalizeResult {
  const prefix = SGG_ADDRESS_PREFIX[sggCode]
  if (!prefix) return { ok: false, reason: `시군구 접두 미정의: ${sggCode}` }

  // ① 끝에 붙은 단지명 제거.
  //    🔴 "뒤에서 한 토큰씩 떼며 이름이 안 남을 때까지" 는 틀린다 — 이름에 공백이 있으면
  //       ("e편한세상 봉황역아파트") 한 토큰만 떼도 남은 문자열이 이름으로 끝나지 않으므로
  //       거기서 멈춰 "e편한세상" 이 주소에 남는다.
  //       **끝의 k개 토큰을 이어붙인 것이 이름과 정확히 같은 k** 를 찾는다.
  //    이름이 안 붙어 있거나 표기가 다르면 아무것도 떼지 않고 ③ 이 걸러낸다.
  const toks = kaptAddr.trim().split(/\s+/).filter(Boolean)
  const nm = squash(kaptName)
  if (nm) {
    for (let k = 1; k < toks.length; k++) {
      if (squash(toks.slice(-k).join('')) === nm) { toks.length -= k; break }
    }
  }

  // ② 동/리/가/읍/면 으로 끝나는 첫 토큰부터가 꼬리
  const start = toks.findIndex((p, i) => i > 0 && /[동리가읍면]$/.test(p))
  if (start < 0) return { ok: false, reason: `동을 못 찾았다: "${kaptAddr}"` }
  const tail = toks.slice(start)

  // ③ 꼬리가 지번으로 끝나야 한다 (끝의 빈 부번 하이픈은 떼어낸다)
  const jibun = normalizeJibun(tail)
  if (jibun === null) {
    return { ok: false, reason: `지번으로 끝나지 않는다: "${tail.join(' ')}"` }
  }
  const body = [...tail.slice(0, -1), jibun].join(' ')

  return { ok: true, address: `${prefix} ${body}`, dong: tail[0] }
}
