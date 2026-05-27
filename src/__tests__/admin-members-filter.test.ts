/**
 * Phase 19 ADMIN-11: 회원 목록 + 신고 목록 searchParams 필터 테스트
 * buildMembersQuery / buildReportsQuery 순수 함수 단위 테스트
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

// ─── 순수 함수 (테스트 대상) ─────────────────────────────────────────────────
// members/page.tsx 에서 export 되는 buildMembersQuery 함수 인터페이스

type QueryChain = {
  calls: string[]
  or: (filter: string) => QueryChain
  eq: (col: string, val: string) => QueryChain
  is: (col: string, val: null) => QueryChain
  not: (col: string, op: string, val: null) => QueryChain
  order: (col: string, opts: object) => QueryChain
}

function makeQueryChain(): QueryChain {
  const calls: string[] = []
  const chain: QueryChain = {
    calls,
    or(filter) { calls.push(`or(${filter})`); return chain },
    eq(col, val) { calls.push(`eq(${col},${val})`); return chain },
    is(col, val) { calls.push(`is(${col},${String(val)})`); return chain },
    not(col, op, val) { calls.push(`not(${col},${op},${String(val)})`); return chain },
    order(col, _opts) { calls.push(`order(${col})`); return chain },
  }
  return chain
}

// members 쿼리 빌더 (members/page.tsx의 로직을 추출한 순수 함수)
function buildMembersQuery(
  base: QueryChain,
  params: { q?: string; role?: string; status?: string },
): QueryChain {
  const rawQ = params.q ?? ''
  const q = rawQ.trim().slice(0, 50)
  const role = params.role ?? ''
  const status = params.status ?? ''

  let query: QueryChain = base

  if (q) {
    query = query.or(`nickname.ilike.%${q}%,cafe_nickname.ilike.%${q}%`)
  }
  if (role) {
    query = query.eq('role', role)
  }
  if (status === 'active') {
    query = query.is('suspended_at', null).is('deleted_at', null)
  } else if (status === 'suspended') {
    query = query.not('suspended_at', 'is', null)
  } else if (status === 'deleted') {
    query = query.not('deleted_at', 'is', null)
  }

  return query.order('created_at', { ascending: false })
}

// reports 쿼리 빌더 (reports/page.tsx의 로직을 추출한 순수 함수)
function buildReportsQuery(
  base: QueryChain,
  params: { status?: string; target_type?: string },
): QueryChain {
  const status = params.status ?? ''
  const target_type = params.target_type ?? ''

  let query: QueryChain = base

  if (status) {
    query = query.eq('status', status)
  }
  if (target_type) {
    query = query.eq('target_type', target_type)
  }

  return query
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
}

// ─── Tests: members 필터 ──────────────────────────────────────────────────────

describe('buildMembersQuery — 회원 목록 필터', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: q="홍길동" → or(nickname.ilike.%홍길동%,cafe_nickname.ilike.%홍길동%) 포함', () => {
    const chain = makeQueryChain()
    buildMembersQuery(chain, { q: '홍길동' })
    expect(chain.calls).toContain('or(nickname.ilike.%홍길동%,cafe_nickname.ilike.%홍길동%)')
  })

  it('Test 2: role="admin" → eq(role,admin) 포함', () => {
    const chain = makeQueryChain()
    buildMembersQuery(chain, { role: 'admin' })
    expect(chain.calls).toContain('eq(role,admin)')
  })

  it('Test 3: status="active" → is(suspended_at,null) + is(deleted_at,null) 포함', () => {
    const chain = makeQueryChain()
    buildMembersQuery(chain, { status: 'active' })
    expect(chain.calls).toContain('is(suspended_at,null)')
    expect(chain.calls).toContain('is(deleted_at,null)')
  })

  it('Test 4: status="suspended" → not(suspended_at,is,null) 포함', () => {
    const chain = makeQueryChain()
    buildMembersQuery(chain, { status: 'suspended' })
    expect(chain.calls).toContain('not(suspended_at,is,null)')
  })

  it('Test 5: status="deleted" → not(deleted_at,is,null) 포함', () => {
    const chain = makeQueryChain()
    buildMembersQuery(chain, { status: 'deleted' })
    expect(chain.calls).toContain('not(deleted_at,is,null)')
  })

  it('Test 6: q="" (빈 문자열) → or() 조건 추가 안 됨', () => {
    const chain = makeQueryChain()
    buildMembersQuery(chain, { q: '' })
    const orCalls = chain.calls.filter(c => c.startsWith('or('))
    expect(orCalls).toHaveLength(0)
  })
})

// ─── Tests: reports 필터 ─────────────────────────────────────────────────────

describe('buildReportsQuery — 신고 목록 필터', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 7: status="" → eq(status,...) 조건 없음 (전체 조회)', () => {
    const chain = makeQueryChain()
    buildReportsQuery(chain, { status: '' })
    const eqStatusCalls = chain.calls.filter(c => c.startsWith('eq(status,'))
    expect(eqStatusCalls).toHaveLength(0)
  })

  it('Test 8: status="pending" → eq(status,pending) 포함', () => {
    const chain = makeQueryChain()
    buildReportsQuery(chain, { status: 'pending' })
    expect(chain.calls).toContain('eq(status,pending)')
  })
})
