/**
 * [40-02 / CBL-0-5] aggregatePriceChange — 등락률 랭킹 집계 수용 기준 테스트
 *
 * 창부레터 홈 히어로의 riseRank·avgRise·hotArea 가 전부 rank_type='price_change' 에
 * 의존한다. 여기서 검증하는 것:
 *   - 취소·정정 거래 배제 (ADR-003 · CLAUDE.md · Scope Fence 5)
 *   - 양쪽 창 최소 거래 건수 임계 (희박 단지가 등락률을 왜곡하지 못하게)
 *   - metadata 지역명 (hotArea 근사, 40-CONTEXT D-05)
 *   - 조회 상한 절단이 조용히 일어나지 않음 (truncated 플래그)
 *   - 기존 4종 aggregator 무접촉
 *
 * 🔴 목(mock) 설계 주의 — 40-02-PLAN 의 스캐폴드를 그대로 쓸 수 없다.
 * plan 은 `.from('transactions')` 가 price_change 전용인 것처럼 전제하고
 * 단일 chain 에 `mockResolvedValueOnce` 2개를 걸라고 했으나, 실제로는
 * aggregateHighPrice·aggregateVolume·aggregatePricePerPyeong 도 같은 테이블을
 * 조회한다. 단일 chain 을 쓰면
 *   ① 앞선 3개 aggregator 가 Once 값 2개를 먼저 소비해 4번째 호출이 undefined 로 터지고
 *   ② `.is('cancel_date', null)` 단언이 **기존 aggregator 때문에** 통과해 버려
 *      price_change 경로에 필터가 없어도 케이스 1이 초록으로 뜬다 (거짓 통과).
 * 그래서 `.from('transactions')` 호출마다 **새 chain** 을 주고, 어떤 창인지는
 * 호출 순서가 아니라 **`.select()` 인자와 `.lt()` 사용 여부(= 내용)** 로 판별한다.
 */
import { describe, it, expect, vi, beforeAll, afterEach, type Mock } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Mock Supabase 클라이언트 팩토리 ────────────────────────────────────────────
// rankings.test.ts 의 패턴을 복제한다 (import 하지 않는다 — 그 파일은 route 테스트용).
// 🔴 메서드 화이트리스트에 'lt'·'lte' 포함 (error-notes #001 재발 방지).

type Chain = Record<string, Mock>

function makeMockChain(result: { data: unknown; error: unknown }): Chain {
  const chain: Chain = {}
  const methods = ['select', 'eq', 'is', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['upsert'] = vi.fn().mockResolvedValue({ error: null })
  ;(chain['limit'] as Mock).mockResolvedValue(result)
  return chain
}

const EMPTY = { data: [] as unknown[], error: null }

/** price_change 창 조회만 쓰는 select 문자열 — 기존 3종과 겹치지 않는다 */
const TX_SELECT_PRICE_CHANGE = 'complex_id, price'

interface TxRow { complex_id: string; price: number }
interface ComplexRow { id: string; si: string | null; gu: string | null }

interface Harness {
  supabase: SupabaseClient<Database>
  /** `.from('transactions')` 호출마다 생성된 chain 전부 */
  txChains: Chain[]
  /** price_change 현재 창 chain (`.select('complex_id, price')` 이고 `.lt` 미사용) */
  curChain: () => Chain
  /** price_change 직전 창 chain (`.select('complex_id, price')` 이고 `.lt` 사용) */
  prevChain: () => Chain
  complexesChain: Chain
  rankingsChain: Chain
}

function makeHarness(opts: {
  cur: TxRow[]
  prev: TxRow[]
  complexes?: ComplexRow[]
  sggCodes?: string[]
}): Harness {
  const sggCodes = opts.sggCodes ?? ['48123']
  const txChains: Chain[] = []

  const isPriceChangeChain = (c: Chain) =>
    (c['select'] as Mock).mock.calls[0]?.[0] === TX_SELECT_PRICE_CHANGE
  const usedLt = (c: Chain) => (c['lt'] as Mock).mock.calls.length > 0

  // `.from('transactions')` 마다 새 chain. 어떤 창인지는 내용으로 판별한다.
  const makeTxChain = (): Chain => {
    const chain = makeMockChain(EMPTY)
    ;(chain['limit'] as Mock).mockReset()
    ;(chain['limit'] as Mock).mockImplementation(async () => {
      if (!isPriceChangeChain(chain)) return EMPTY // 기존 high_price/volume/price_per_pyeong
      return usedLt(chain)
        ? { data: opts.prev, error: null }
        : { data: opts.cur, error: null }
    })
    txChains.push(chain)
    return chain
  }

  // regions: getActiveSggCodes 는 `.order()` 가 종단이다 (`.limit()` 아님)
  const regionsChain = makeMockChain(EMPTY)
  ;(regionsChain['order'] as Mock).mockResolvedValue({
    data: sggCodes.map((sgg_code) => ({ sgg_code })),
    error: null,
  })

  const complexesChain = makeMockChain({ data: opts.complexes ?? [], error: null })
  const rankingsChain = makeMockChain(EMPTY)

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'transactions') return makeTxChain()
      if (table === 'regions') return regionsChain
      if (table === 'complexes') return complexesChain
      if (table === 'complex_rankings') return rankingsChain
      return makeMockChain(EMPTY)
    }),
  } as unknown as SupabaseClient<Database>

  const pick = (wantPrev: boolean) => {
    const found = txChains.filter((c) => isPriceChangeChain(c) && usedLt(c) === wantPrev)
    if (found.length !== 1) {
      throw new Error(
        `price_change ${wantPrev ? '직전' : '현재'} 창 chain 을 정확히 1개 찾지 못했다 (found=${found.length}, txChains=${txChains.length})`,
      )
    }
    return found[0]!
  }

  return {
    supabase,
    txChains,
    curChain: () => pick(false),
    prevChain: () => pick(true),
    complexesChain,
    rankingsChain,
  }
}

/** 같은 단지의 거래 n건을 만든다 */
function tx(complexId: string, prices: number[]): TxRow[] {
  return prices.map((price) => ({ complex_id: complexId, price }))
}

interface UpsertRow {
  complex_id: string
  rank_type: string
  score: number
  rank: number
  window_days: number
  metadata: Record<string, unknown> | null
}

function priceChangeUpsert(h: Harness): { rows: UpsertRow[]; opts: { onConflict?: string } } | null {
  for (const call of (h.rankingsChain['upsert'] as Mock).mock.calls) {
    const rows = call[0] as UpsertRow[]
    if (Array.isArray(rows) && rows[0]?.rank_type === 'price_change') {
      return { rows, opts: (call[1] ?? {}) as { onConflict?: string } }
    }
  }
  return null
}

async function run(opts: Parameters<typeof makeHarness>[0]) {
  const { computeRankings } = await import('@/lib/data/rankings')
  const h = makeHarness(opts)
  const results = await computeRankings(h.supabase)
  return { h, results, upsert: priceChangeUpsert(h) }
}

const C1 = 'c1-1111-1111-1111-111111111111'
const C2 = 'c2-2222-2222-2222-222222222222'

// ── 케이스 1·2: 필터 (SC7 의 테스트 본체) ───────────────────────────────────

describe('aggregatePriceChange — transactions 필터', () => {
  it('1. 🔴 두 창 모두 취소·정정 거래를 배제한다 (cancel_date / superseded_by)', async () => {
    const { h } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })

    for (const chain of [h.curChain(), h.prevChain()]) {
      expect(chain['is']).toHaveBeenCalledWith('cancel_date', null)
      expect(chain['is']).toHaveBeenCalledWith('superseded_by', null)
    }
  })

  it('2. 두 창 모두 deal_type=sale · sgg_code · complex_id not null 필터를 건다', async () => {
    const { h } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
      sggCodes: ['48123', '48125'],
    })

    for (const chain of [h.curChain(), h.prevChain()]) {
      expect(chain['eq']).toHaveBeenCalledWith('deal_type', 'sale')
      expect(chain['in']).toHaveBeenCalledWith('sgg_code', ['48123', '48125'])
      expect(chain['not']).toHaveBeenCalledWith('complex_id', 'is', null)
    }
  })
})

// ── 케이스 3~6: 최소 거래 건수 임계 ──────────────────────────────────────────

describe('aggregatePriceChange — 최소 거래 건수 임계 (3건)', () => {
  it('3. 양쪽 창 모두 3건 이상이면 결과에 포함된다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert).not.toBeNull()
    expect(upsert!.rows.map((r) => r.complex_id)).toContain(C1)
  })

  it('4. 🔴 현재 창이 2건이면 제외된다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert).toBeNull()
  })

  it('5. 🔴 직전 창이 2건이면 제외된다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert).toBeNull()
  })

  it('6. 직전 창에 데이터가 없으면 제외된다 — 0으로 나누지 않는다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: [],
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert).toBeNull()
  })
})

// ── 케이스 7~9: score 계산과 정렬 ────────────────────────────────────────────

describe('aggregatePriceChange — score 계산·정렬', () => {
  it('7. 🔴 평균 10000 → 11000 이면 score = 10', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert!.rows[0]!.score).toBe(10)
  })

  it('8. 🔴 평균 10000 → 9000 이면 score = -10 (창 순서가 뒤집히면 부호로 잡힌다)', async () => {
    const { upsert } = await run({
      cur: tx(C1, [9000, 9000, 9000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert!.rows[0]!.score).toBe(-10)
  })

  it('9. 상승률 큰 순으로 정렬된다 — rank 1 이 최대 상승', async () => {
    const { upsert } = await run({
      cur: [...tx(C1, [11000, 11000, 11000]), ...tx(C2, [12000, 12000, 12000])],
      prev: [...tx(C1, [10000, 10000, 10000]), ...tx(C2, [10000, 10000, 10000])],
      complexes: [
        { id: C1, si: '창원시', gu: '성산구' },
        { id: C2, si: '창원시', gu: '의창구' },
      ],
    })
    expect(upsert!.rows[0]!.rank).toBe(1)
    expect(upsert!.rows[0]!.complex_id).toBe(C2)
    expect(upsert!.rows[0]!.score).toBe(20)
    expect(upsert!.rows[1]!.complex_id).toBe(C1)
    expect(upsert!.rows[1]!.score).toBe(10)
  })
})

// ── 케이스 10~11: metadata 지역명 (hotArea 근사) ────────────────────────────

describe('aggregatePriceChange — metadata 지역명', () => {
  it('10. 🔴 metadata.region 에 complexes.gu 가 담긴다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert!.rows[0]!.metadata?.['region']).toBe('성산구')
  })

  it('11. gu 가 null 이면 si 로 폴백한다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '김해시', gu: null }],
    })
    expect(upsert!.rows[0]!.metadata?.['region']).toBe('김해시')
  })
})

// ── 케이스 12: 절단 감지 ────────────────────────────────────────────────────

describe('aggregatePriceChange — 조회 상한 절단', () => {
  it('12. 🔴 5000행이 반환되면 truncated:true + console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { results } = await run({
      cur: tx(C1, new Array(5000).fill(11000)),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    const pc = results.find((r) => r.type === 'price_change')
    expect(pc?.truncated).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  it('12-b. 상한 미만이면 truncated 가 참이 아니다', async () => {
    const { results } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(results.find((r) => r.type === 'price_change')?.truncated).toBeFalsy()
  })
})

// ── 케이스 13~16: computeRankings 통합 ──────────────────────────────────────

describe('computeRankings — price_change 통합', () => {
  it('13. 결과가 0건이면 upsert 를 호출하지 않는다', async () => {
    const { h, results } = await run({ cur: [], prev: [] })
    expect((h.rankingsChain['upsert'] as Mock)).not.toHaveBeenCalled()
    expect(results.find((r) => r.type === 'price_change')?.upserted).toBe(0)
  })

  it('14. 🔴 기존 4종이 전부 그대로 있고 price_change 가 끝에 추가된다', async () => {
    const { results } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(results.map((r) => r.type)).toEqual([
      'high_price',
      'volume',
      'price_per_pyeong',
      'interest',
      'price_change',
    ])
    for (const r of results) {
      expect(typeof r.upserted).toBe('number')
      expect(typeof r.ms).toBe('number')
    }
  })

  it('15. 🔴 upsert onConflict 문자열이 그대로다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert!.opts.onConflict).toBe('rank_type,complex_id,window_days')
  })

  it('16. upsert 행의 window_days 는 30 이다', async () => {
    const { upsert } = await run({
      cur: tx(C1, [11000, 11000, 11000]),
      prev: tx(C1, [10000, 10000, 10000]),
      complexes: [{ id: C1, si: '창원시', gu: '성산구' }],
    })
    expect(upsert!.rows.every((r) => r.window_days === 30)).toBe(true)
  })
})
