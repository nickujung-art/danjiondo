/**
 * 단지-거래 무결성 감시 — 오염이 늘어나면 시끄럽게 실패한다.
 *
 * [왜 필요한가]
 * 2026-08-06 전수 점검에서 찾은 오염은 전부 **조용히** 쌓였다. 잡기 어려워서가 아니라
 * 아무도 보지 않았기 때문이다. 세 가지 축으로 SQL 몇 줄이면 드러난다.
 *
 * [세 검출 축 — 서로 다른 것을 잡는다]
 *   1) 다중 지번   한 단지에 붙은 거래의 지번이 갈리고 **동까지 다르면** 다른 건물이 섞였다.
 *                  같은 동 인접 필지(창원더샵센트럴파크 = 가음동 15·16·17)는 정상이므로
 *                  동으로 거른다. 이 필터가 없으면 거짓 양성이 절반이다.
 *   2) 회전율 이상 거래수 ÷ 세대수 ÷ 10년 > 25%. **지번이 단일이어도 잡힌다** —
 *                  1번이 놓치는 것을 잡는다. 정상 단지는 4~10%다.
 *                  (76세대 레코드가 791건을 갖고 있던 STX칸이 이 축으로 발견됐다.)
 *   3) 정식 단지 공백 kapt_code 가 있는데 거래가 0건이면 그 거래는 다른 레코드에 있다.
 *                  1·2번의 **대상 단지를 찾는 데** 쓴다.
 *
 * [절대값이 아니라 증가를 본다]
 * 지금도 미해결이 남아 있다 — 대상 단지가 아예 없어서 붙일 곳이 없는 것들이다.
 * 절대 수치로 판정하면 매번 실패해 아무도 안 보게 된다. **기준선 대비 늘었을 때만**
 * 실패한다. 오염을 줄였으면 아래 BASELINE 도 함께 내려 되돌아가지 못하게 잠근다.
 *
 * 실행:
 *   npx tsx scripts/check-complex-integrity.ts
 *   npx tsx scripts/check-complex-integrity.ts --report-only   # 실패시키지 않고 현황만
 *
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js'

/** 감시 대상 — 운영권역(창원 5구 + 김해) */
const SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']

/** 기준선 (2026-08-06 측정). 이 값을 **넘으면** 실패한다. */
const BASELINE = {
  multi_jibun: 9,
  turnover_anomaly: 23,
  empty_kapt: 60,
} as const

const LABELS: Record<keyof typeof BASELINE, string> = {
  multi_jibun: '다중 지번(동 다름, 소수 50건↑)',
  turnover_anomaly: '회전율 이상(>25%, 거래 100건↑)',
  empty_kapt: 'K-apt 등록인데 거래 0건',
}

const REPORT_ONLY = process.argv.includes('--report-only')

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

  const supabase = createClient(url, key)
  // 임의 SQL을 넘기지 않는다 — 전용 RPC 하나가 세 수치를 돌려준다(인젝션 표면 없음).
  const { data, error } = await supabase.rpc('complex_integrity_counts', { p_sgg: SGG_CODES })
  if (error) throw new Error(`complex_integrity_counts 실패: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null
  if (!row) throw new Error('complex_integrity_counts 가 결과를 돌려주지 않았다')

  console.log('[complex-integrity] 운영권역 단지-거래 무결성\n')
  const worse: string[] = []
  const better: string[] = []

  for (const k of Object.keys(BASELINE) as (keyof typeof BASELINE)[]) {
    const current = Number(row[k] ?? 0)
    const base = BASELINE[k]
    const delta = current - base
    const mark = delta > 0 ? '❌' : delta < 0 ? '✅' : '  '
    const sign = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0'
    console.log(`  ${mark} ${LABELS[k].padEnd(32)} ${String(current).padStart(4)} (기준 ${base}, ${sign})`)
    if (delta > 0) worse.push(`${k} ${base}→${current}`)
    if (delta < 0) better.push(`${k} ${base}→${current}`)
  }

  if (better.length > 0) {
    console.log(`\n기준선보다 낮아졌다: ${better.join(', ')}`)
    console.log('  → 이 파일의 BASELINE 을 내려 잠글 것. 안 그러면 다시 나빠져도 통과한다.')
  }

  if (worse.length === 0) {
    console.log('\n✅ 기준선 이내')
    return
  }

  console.error(
    `\n❌ 오염이 늘었다: ${worse.join(', ')}\n` +
      `   조사 방법은 realtrade-story 의 .planning/data-quality/audit-20260806.md\n` +
      `   '검출 축 세 가지' 절 참고. 원인은 대개 셋 중 하나다 —\n` +
      `     · 새 중복 레코드가 생겼다(같은 건물이 두 벌로 등록)\n` +
      `     · 병합이 시딩으로 되돌아갔다(삭제로 구현하면 시더가 되살린다)\n` +
      `     · 매칭이 엉뚱한 단지를 잡는다(이름이 흔하거나 별칭 미등록)`,
  )
  if (!REPORT_ONLY) process.exit(1)
}

main().catch((err) => {
  console.error(`[complex-integrity] 실패: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
