/**
 * [39-00 / F-01] ON CONFLICT 추론 가능 여부 실측 프로브 (PostgREST 레벨)
 * 실행: npx tsx --env-file=.env.local scripts/verify-onconflict-probe.ts [--only=<table>]
 *
 * 왜 PostgREST 레벨인가:
 * raw `EXPLAIN INSERT ... ON CONFLICT (...)`는 SQL을 직접 쓰는 것이라
 * "supabase-js의 `onConflict` 문자열이 실제로 어떤 SQL로 번역되는가"를 검증하지 못한다.
 * 이 프로브는 애플리케이션이 실제로 타는 경로(supabase-js → PostgREST → Postgres)를
 * 그대로 태우므로 raw EXPLAIN보다 강한 검증이다. 둘 다 쓴다.
 *
 * ── 판정 규약 ───────────────────────────────────────────────────────────────
 * | 반환                                   | 판정      | 처리                    |
 * |----------------------------------------|-----------|-------------------------|
 * | 42P10 (no unique or exclusion constraint matching…) | BROKEN | 추론 실패 (플래너 단계) |
 * | 23503 FK 위반 / 23502 NOT NULL 위반    | OK        | 추론 성공 (실행 단계에서 막힘) |
 * | 그 외 에러                             | UNKNOWN   | FAIL + 코드·메시지 전문 출력 |
 * | 에러 없음                              | 🔴 DANGER | 데이터가 쓰였다 → 즉시 exit(1) |
 *
 * ── 데이터 안전성 ───────────────────────────────────────────────────────────
 * 🔴 payload는 **반드시 실행 단계에서 실패하도록** 만든다. FK 컬럼(`complex_id` 등)에
 * `crypto.randomUUID()`를 넣는다 — 실존할 확률 0이라 항상 23503으로 막힌다.
 * 42P10(플래닝 단계 실패)·23503(FK 위반) 모두 문장 전체가 롤백되므로 **행이 남지 않는다.**
 * 실존 ID를 절대 쓰지 않는다. 이 규약이 데이터 안전성의 전부다.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 중 누락된 값이 있음')
  process.exit(1)
}

type Verdict = 'OK' | 'BROKEN' | 'UNKNOWN' | 'DANGER'

interface ProbeTarget {
  no: number
  table: string
  onConflict: string
  /** FK 컬럼은 반드시 randomUUID()를 돌려주는 팩토리로 — 호출 시점에 새로 만든다 */
  payload: () => Record<string, unknown>
  expect: Extract<Verdict, 'OK' | 'BROKEN'>
  note: string
}

/**
 * 프로브 대상. 후속 plan이 여기에 행을 추가하면 그대로 검증 범위가 넓어진다.
 * 🔴 payload의 FK 컬럼에는 randomUUID()만 넣는다 (실존 ID 금지).
 */
const PROBE_TARGETS: readonly ProbeTarget[] = [
  {
    no: 1,
    table: 'facility_kapt',
    onConflict: 'complex_id,data_month',
    payload: () => ({ complex_id: randomUUID(), kapt_code: 'ZZ-PROBE', data_month: '1900-01-01' }),
    expect: 'OK',
    note: '수정값 — 실제 제약 UNIQUE (complex_id, data_month)와 일치',
  },
  {
    no: 2,
    table: 'facility_kapt',
    onConflict: 'complex_id',
    payload: () => ({ complex_id: randomUUID(), kapt_code: 'ZZ-PROBE', data_month: '1900-01-01' }),
    expect: 'BROKEN',
    note: '구값 (대조용) — 매칭되는 유니크 제약이 없어 42P10이 나와야 정상',
  },
]

const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg?.split('=')[1] ?? null

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface ProbeResult {
  no: number
  target: string
  expect: string
  verdict: Verdict
  code: string
  message: string
  pass: boolean
}

const results: ProbeResult[] = []

function classify(code: string | undefined): Verdict {
  if (code === '42P10') return 'BROKEN'
  if (code === '23503' || code === '23502') return 'OK'
  return 'UNKNOWN'
}

async function probe(t: ProbeTarget): Promise<void> {
  const label = `${t.table} (${t.onConflict})`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from(t.table) as any
  const { error } = await table.upsert(t.payload(), { onConflict: t.onConflict })

  if (!error) {
    console.error(
      `\n🔴 [${t.no}] ${label} — 에러 없음. **행이 실제로 쓰였을 수 있음. 수동 확인 필요.**\n` +
        `   즉시 중단한다. facility_kapt에서 kapt_code='ZZ-PROBE' / data_month='1900-01-01' 행을 확인하고 삭제할 것.`,
    )
    process.exit(1)
  }

  const code = (error as { code?: string }).code ?? '(no code)'
  const verdict = classify(code)
  const pass = verdict === t.expect

  if (verdict === 'UNKNOWN') {
    console.error(`\n⚠️  [${t.no}] ${label} — UNKNOWN 에러 전문:`)
    console.error(JSON.stringify(error, null, 2))
  }

  results.push({
    no: t.no,
    target: label,
    expect: t.expect,
    verdict,
    code,
    message: error.message,
    pass,
  })
  console.log(
    `${pass ? '✅' : '❌'} [${t.no}] ${label} — 기대: ${t.expect} / 실측: ${verdict}(${code})`,
  )
  console.log(`      ${t.note}`)
  console.log(`      ↳ ${error.message}`)
}

async function main(): Promise<void> {
  console.log(`🔗 연결 대상: ${SUPABASE_URL}`)
  const targets = ONLY ? PROBE_TARGETS.filter((t) => t.table === ONLY) : PROBE_TARGETS
  console.log(`🎯 프로브 대상: ${targets.length}건${ONLY ? ` (--only=${ONLY})` : ''}\n`)

  if (targets.length === 0) {
    console.error(`❌ --only=${ONLY} 에 해당하는 프로브 대상이 없음`)
    process.exit(1)
  }

  for (const t of targets) {
    await probe(t)
  }

  const passed = results.filter((r) => r.pass).length
  console.log(`\n📊 결과: ${passed}/${results.length} PASS`)
  console.log('| # | 대상 (onConflict) | 기대 | 실측 | 코드 | 판정 |')
  console.log('|---|---|---|---|---|---|')
  for (const r of results) {
    console.log(
      `| ${r.no} | \`${r.target}\` | ${r.expect} | ${r.verdict} | \`${r.code}\` | ${r.pass ? '✅' : '❌'} |`,
    )
  }
  console.log('\n🛡️  데이터 무변경: "에러 없음" 케이스 0건 (전 건 롤백)')

  if (passed !== results.length) {
    console.error('\n❌ 최종 판정: FAIL')
    process.exitCode = 1
  } else {
    console.log(`\n✅ 최종 판정: PASS (${passed}/${results.length})`)
  }
}

void main()
