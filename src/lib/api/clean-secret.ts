/**
 * 시크릿 값을 HTTP 헤더에 넣기 전에 씻는다.
 *
 * [왜 필요한가 — 2026-08-10 실장애]
 * `crawl-presale-news` 배치가 매일 초록불이면서 발굴 0건이었다. 원인은 차단도 API 변경도
 * 아니라 **GitHub Secret 값 맨 앞의 BOM(U+FEFF)** 이었다:
 *
 *   TypeError: Cannot convert argument to a ByteString because the character
 *   at index 0 has a value of 65279 which is greater than 255
 *
 * BOM 이 붙은 파일에서 복사해 시크릿에 붙여넣으면 이렇게 된다. `fetch` 는 헤더 값에
 * U+00FF 를 넘는 문자를 허용하지 않아 **요청이 나가기도 전에** 터진다.
 *
 * **눈에 보이지 않는 문자라 시크릿을 육안으로 비교해도 찾을 수 없다.** 시크릿을 다시
 * 붙여넣어 고칠 수도 있지만, 사람이 다시 실수하면 같은 일이 반복된다 — 경계에서 씻는 게 맞다.
 *
 * 앞뒤 공백도 함께 턴다(붙여넣기에 개행이 딸려오는 일이 흔하다).
 *
 * [적용 범위]
 * 외부 API 인증값을 헤더에 넣는 모든 지점. 2026-08-10 기준 네이버 오픈API 를 쓰는 네 곳
 * (crawl-presale-news, collect-hagwon-blog-tags, collect-hagwon-popularity, naver-cafe).
 * 새로 추가할 때도 이걸 통과시킨다.
 */
export function cleanSecret(value: string | undefined | null): string | undefined {
  if (value == null) return undefined
  // U+FEFF 는 문자열 어디에 있든 헤더 값으로 못 쓴다. 앞머리만이 아니라 전부 턴다.
  const cleaned = value.replace(/﻿/g, '').trim()
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * 필수 시크릿을 읽어 씻고, 없으면 즉시 죽는다.
 *
 * 값이 없는 채로 진행하면 빈 문자열이 헤더에 실려 나가 **401 이 아니라 이상한 실패**로
 * 돌아온다 — 원인을 찾는 데 오래 걸린다. 시작할 때 끊는 게 낫다.
 */
export function requireSecret(name: string): string {
  const value = cleanSecret(process.env[name])
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 없습니다`)
  }
  return value
}
