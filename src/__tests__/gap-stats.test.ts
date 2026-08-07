/**
 * Phase 20 갭투자 통계 수용 기준 테스트 — GAP-04 ~ GAP-05
 *
 * - GAP-04: GET /api/cron/daily Authorization 없음 → 401
 * - GAP-05: 올바른 CRON_SECRET → 200 + ok 필드
 *
 * [GAP-01~03 이 사라진 이유 — 2026-08-07]
 * 갭 통계 계산·반영이 앱(computeGapStats/computeRiskLevel)에서 SQL 함수
 * `refresh_complex_gap_stats` 로 넘어갔다. compute_gap_stats 가 11.45초라 PostgREST
 * 8초 상한을 넘어 이 라우트에서는 매일 타임아웃하고 있었기 때문이다
 * (supabase/migrations/20260807052310_refresh_complex_gap_stats.sql).
 * 대상 함수가 없어져 세 테스트도 함께 내렸다.
 *
 * 이관 시점의 충실성은 기존 786행(앱이 쓴 값)과 대조해 확인했다(불일치 0).
 * 임계값 자체는 GAP-06 이 마이그레이션 SQL 을 직접 읽어 지킨다.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// admin client mock — 로컬 Supabase 없이도 동작
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}))

beforeAll(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

// ── Mock Supabase 클라이언트 팩토리 ────────────────────────────────────────────

function makeMockChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const terminal = vi.fn().mockResolvedValue(result)
  const methods = ['select', 'eq', 'is', 'in', 'not', 'gt', 'gte', 'order', 'limit', 'range']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['upsert'] = vi.fn().mockResolvedValue({ error: null })
  chain['insert'] = vi.fn().mockReturnValue({ ...chain, select: vi.fn().mockReturnValue({ single: terminal }) })
  chain['update'] = vi.fn().mockReturnValue(chain)
  ;(chain['limit'] as ReturnType<typeof vi.fn>).mockResolvedValue(result)
  // `.range()`는 페이지네이션 종단이다 — K-apt 대상 선별(daily/route.ts)이 쓴다.
  // 빈 배열을 돌려줘야 fetchAllPages가 첫 페이지에서 루프를 끝낸다.
  ;(chain['range'] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null })
  chain['single'] = terminal
  return chain
}

function makeMockSupabase(overrides: Record<string, ReturnType<typeof makeMockChain>> = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
  return {
    from: vi.fn((table: string) => overrides[table] ?? makeMockChain({ data: [], error: null })),
    rpc,
  } as unknown as SupabaseClient<Database> & { rpc: typeof rpc }
}

// ── GAP-06: risk_level 임계값이 마이그레이션 SQL 에 그대로 있는지 ────────────────
//
// GAP-01(computeRiskLevel 경계값 단위 테스트)을 대신한다. 판정이 SQL 로 넘어가면서
// **경계 숫자를 잘못 바꾸는 것을 아무도 못 잡는 구멍**이 생겼다 — 값 집합 오타는
// complex_gap_stats_risk_level_check 제약이 잡지만, 40 을 45 로 바꾸는 건 제약도
// ON_ERROR_STOP 도 통과한다.
//
// 라이브 DB 없이 CI 에서 돌아야 하므로 onconflict-audit.test.ts 와 같은 방식 —
// 실물 파일을 읽어 텍스트로 검사한다. 마이그레이션은 append-only 라 이 파일이
// 바뀌면 그건 의도된 변경이고, 그때 이 테스트도 같이 고치게 된다.
describe('GAP-06: risk_level 임계값 (SQL 단일 진실 원천)', () => {
  const MIGRATION = path.resolve(
    __dirname,
    '../../supabase/migrations/20260807052310_refresh_complex_gap_stats.sql',
  )

  it('마이그레이션 파일이 존재한다', () => {
    expect(fs.existsSync(MIGRATION), `없음: ${MIGRATION}`).toBe(true)
  })

  it('CASE 식의 경계와 출력값이 D-02 정의와 일치한다', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8')
    // 주석에도 같은 숫자가 나오므로 CASE 블록만 떼어내 검사한다.
    const caseBlock = sql.slice(sql.indexOf('CASE'), sql.indexOf('END') + 3)

    expect(caseBlock).toMatch(/WHEN\s+g\.gap_ratio\s*<\s*0\s+THEN\s+'danger'/)
    expect(caseBlock).toMatch(/WHEN\s+g\.gap_ratio\s*<\s*40\s+THEN\s+'safe'/)
    expect(caseBlock).toMatch(/WHEN\s+g\.gap_ratio\s*<=\s*60\s+THEN\s+'caution'/)
    expect(caseBlock).toMatch(/ELSE\s+'danger'/)

    // CHECK 제약이 허용하는 값만 나와야 한다 — 오타는 런타임에 제약 위반으로
    // 터지지만, 그때는 이미 야간 배치가 죽은 뒤다.
    const emitted = [...caseBlock.matchAll(/'([a-z]+)'/g)].map(m => m[1])
    expect(new Set(emitted)).toEqual(new Set(['danger', 'safe', 'caution']))
  })
})

// ── GAP-04, GAP-05: GET /api/cron/daily ───────────────────────────────────────

describe('GET /api/cron/daily — Authorization 검증', () => {
  it('GAP-04: Authorization 헤더 없음 → 401', async () => {
    const { GET } = await import('@/app/api/cron/daily/route')
    const res = await GET(new Request('http://localhost/api/cron/daily'))
    expect(res.status).toBe(401)
  })

  it('GAP-05: 올바른 CRON_SECRET → 200 + ok 필드', async () => {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const mockSupabase = makeMockSupabase()
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof createSupabaseAdminClient>,
    )

    const { GET } = await import('@/app/api/cron/daily/route')
    const res = await GET(
      new Request('http://localhost/api/cron/daily', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body).toHaveProperty('ok')
  })
})
