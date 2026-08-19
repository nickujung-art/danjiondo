// server-only 미포함 — scripts/backfill-realprice.ts 가 tsx 로 직접 임포트해야 함
// (src/lib/data/regions.ts 와 동일 패턴, 33-06 선례). 'server-only' 마커는 Node 스크립트
// 실행 시 exports 조건이 맞지 않아 무조건 throw 하여 백필 스크립트를 깨뜨린다.
// 클라이언트 컴포넌트에서 import된 적 없음 — 스크립트 전용 순수 함수 모듈.

/**
 * from~to 사이 YYYYMM 문자열 배열을 생성한다.
 *
 * scripts/backfill-realprice.ts 에 있던 기존 구현을 계산 정의 변경 없이 그대로 옮긴 것이다.
 * from/to 가 형식을 어겼을 때(빈 문자열 등) 이 함수 자체는 방어하지 않는다 — 그 방어는
 * assertYearMonth() 의 몫이고, 호출부는 항상 assertYearMonth 를 거친 값만 여기에 넘겨야 한다.
 */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  let [y, m] = [parseInt(from.slice(0, 4), 10), parseInt(from.slice(4, 6), 10)]
  const [ey, em] = [parseInt(to.slice(0, 4), 10), parseInt(to.slice(4, 6), 10)]
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

/**
 * YYYYMM 형식을 강제하는 인자 검증 함수.
 *
 * [왜 있는가]
 * `--from=` 을 빈 값으로 넘기면 `fromArg` 가 `''` 가 되고, `fromArg ?? defaultFrom` 은
 * 그것을 통과시킨다(빈 문자열은 nullish 가 아니다). 그 결과 `monthRange('', '')` 가
 * `parseInt('')` = `NaN` 비교로 조용히 빈 배열을 돌려주고, `total = 0` → `done = 0` →
 * 실패율 0% → `✅ 완료: 0건 upsert` 로 **exit 0** 한다. 이 함수는 그 경로를 호출 즉시 막는다.
 *
 * `undefined` 는 "인자 미지정"이라 그대로 통과시켜(반환값도 `undefined`) 호출부가
 * 자체 기본값(예: 10년 전 오늘)을 쓸 수 있게 한다. **빈 문자열은 통과시키지 않는다** —
 * 그것이 이 함수가 존재하는 이유다.
 */
export function assertYearMonth(label: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined

  if (!/^\d{6}$/.test(value)) {
    throw new Error(`${label} 은(는) YYYYMM 형식의 6자리 숫자여야 합니다: "${value}"`)
  }

  const month = parseInt(value.slice(4, 6), 10)
  if (month < 1 || month > 12) {
    throw new Error(`${label} 의 월이 올바르지 않습니다(01~12만 허용): "${value}"`)
  }

  return value
}

/**
 * `--sgg=` 값을 콤마 분리 목록으로 파싱한다.
 *
 * `undefined` 는 "인자 미지정"이라 그대로 통과시켜(반환값도 `undefined`) 호출부가
 * `regions` 테이블의 `is_active=true` 전체 조회로 폴백하게 한다. 하지만 **빈 문자열은
 * 다르다** — `--sgg=` 를 빈 값으로 넘기면 의도는 "아무 지역도 지정 안 함"이 아니라
 * 십중팔구 조립 실수다. 빈 값을 그대로 통과시키면(가정: `sggArg?.split(',')` 류)
 * `regions` 전체 38개 지역으로 조용히 확장될 위험이 있으므로 명시적으로 throw 한다.
 */
export function parseSggCodes(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined

  const codes = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (codes.length === 0) {
    throw new Error(
      `--sgg 값이 비어 있습니다. 빈 값은 regions 전체로 조용히 확장될 수 있어 허용하지 않습니다.`,
    )
  }

  for (const code of codes) {
    if (!/^\d{5}$/.test(code)) {
      throw new Error(`--sgg 코드 형식이 올바르지 않습니다(5자리 숫자여야 함): "${code}"`)
    }
  }

  return codes
}
