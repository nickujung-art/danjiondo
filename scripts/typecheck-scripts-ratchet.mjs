/**
 * scripts/ 타입 오류 래칫 (2026-08-26)
 *
 * [왜 이게 필요한가]
 * `tsconfig.json` 의 exclude 에 `scripts` 가 들어 있어 `npm run lint`(= next lint && tsc --noEmit)
 * 가 이 디렉터리를 **한 번도 검사하지 않았다.** 프로덕션 데이터를 만지는 도구 83개가
 * 그 상태였다. 2026-08-26 최초 측정: 오류 75건 / 21개 파일.
 *
 * [현황]
 * 2026-08-26 최초 측정 75건 → 2026-09-02 전수 수정 0건 달성.
 * 기준선 0 으로 잠김 — 새 스크립트도 타입 오류 0 을 유지해야 한다.
 *
 * [래칫 동작]
 * 이 저장소가 이미 쓰는 방식이다(`complex-integrity.yml` 의 BASE_* 3축).
 *   - 기준선보다 **늘면 실패한다** → 새 코드는 깨끗해야 한다
 *   - 줄면 알려준다 → 기준선을 내려 잠근다
 *
 * 🔴 `npm run lint` 에 아직 엮지 않는다 — CI 에 별도 잡으로 넣는 것이 맞다.
 *
 * 실행: node scripts/typecheck-scripts-ratchet.mjs
 */
import { execSync } from 'child_process'

/** 2026-09-02 전수 수정 완료 — 0건 달성. */
const BASELINE = 0

let out = ''
try {
  execSync('npx tsc --noEmit -p tsconfig.scripts.json', { encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
  out = String(e.stdout ?? '') + String(e.stderr ?? '')
}

const lines = out.split('\n').filter((l) => /error TS\d+/.test(l) && !l.includes('node_modules'))
const count = lines.length
const files = new Set(lines.map((l) => l.split('(')[0])).size

console.log(`scripts/ 타입 오류 ${count}건 / ${files}개 파일  (기준선 ${BASELINE})`)

if (count > BASELINE) {
  const shown = lines.slice(0, 20)
  console.error('\n🔴 기준선을 넘었다. 새로 추가·수정한 스크립트가 타입 검사를 통과해야 한다.')
  console.error('   (레거시를 손댔다면 그 파일은 함께 고친다 — 그게 이 래칫의 목적이다)\n')
  shown.forEach((l) => console.error('  ' + l))
  if (lines.length > shown.length) console.error(`  … 외 ${lines.length - shown.length}건`)
  process.exit(1)
}

if (count < BASELINE) {
  console.log(`\n🔽 기준선보다 ${BASELINE - count}건 낮아졌다 — BASELINE 을 ${count} 로 내려 잠글 것.`)
}

console.log('기준선 이내')
