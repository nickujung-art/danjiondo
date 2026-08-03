/**
 * [40-02 / SC9] rankings 배치(computeRankings) 소요시간 실측
 *
 * 실행: npx tsx --conditions=react-server --env-file=.env.local scripts/measure-rankings.ts
 *
 * `--conditions=react-server` 가 필요한 이유: src/lib/data/rankings.ts 는 `import 'server-only'`
 * 로 시작한다. 그 패키지는 exports 조건이 react-server 가 아니면 throw 하는 스텁을 내보낸다.
 * 조건을 주면 빈 모듈로 해석돼 Next 런타임과 동일한 코드 경로를 그대로 잰다 —
 * rankings.ts 에서 server-only 마커를 떼는 것(안전장치 훼손)보다 이쪽이 옳다.
 *
 * ⚠️ 크론 엔드포인트를 외부 curl 로 때릴 수 없다(CRON_SECRET 경로가 외부에서 차단돼 있다).
 *    computeRankings 를 직접 호출하는 것이 유일한 실측 경로다.
 *
 * 🔴 이 스크립트는 프로덕션 complex_rankings 에 실제로 UPSERT 한다. 의도된 동작이다 —
 *    complex_rankings 는 크론이 통째로 덮어쓰는 파생 테이블이라 원본 손실이 없고,
 *    이 실행이 하는 일은 크론이 매시 하는 일과 동일하다.
 */
import { createClient } from '@supabase/supabase-js'
import { computeRankings } from '../src/lib/data/rankings'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 중 누락된 값이 있음')
  process.exit(1)
}

console.log(`🔗 연결 대상: ${SUPABASE_URL}`)
if (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost')) {
  console.log('ℹ️  로컬 Supabase 대상입니다.')
} else {
  console.warn('⚠️  프로덕션 대상입니다 — complex_rankings 에 실제로 UPSERT 합니다.')
}

/** ms/truncated 는 40-02 이전 빌드에는 없다 — BEFORE 측정에서도 이 스크립트가 그대로 돌아야 한다 */
interface MeasuredResult {
  type: string
  upserted: number
  ms?: number
  truncated?: boolean
}

async function main(): Promise<void> {
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const startedAt = Date.now()
  const results = (await computeRankings(
    admin as unknown as Parameters<typeof computeRankings>[0],
  )) as unknown as MeasuredResult[]
  const wallMs = Date.now() - startedAt

  console.table(
    results.map((r) => ({
      type: r.type,
      upserted: r.upserted,
      ms: r.ms ?? '-',
      truncated: r.truncated ?? false,
    })),
  )
  console.log(`⏱️  wall-clock: ${wallMs} ms (${(wallMs / 1000).toFixed(3)} s)`)
  console.log(`   aggregator 합계 ms: ${results.reduce((s, r) => s + (r.ms ?? 0), 0)}`)
  console.log(`   총 upserted: ${results.reduce((s, r) => s + r.upserted, 0)}`)
}

main().catch((err: unknown) => {
  console.error('❌ measure-rankings 실패:', err)
  process.exit(1)
})
