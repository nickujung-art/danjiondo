/**
 * getActiveAds 의 쿼리 불변식 — DB 없이 CI 에서 항상 실행된다.
 *
 * 🔴 왜 별도 파일인가
 * `src/__tests__/ads.test.ts` 의 getActiveAds 테스트는 `describe.skipIf(!SKEY)` 라
 * CI 에서 통째로 스킵된다. 거기에 케이스를 더해도 회귀를 잡지 못한다.
 * 그래서 목 클라이언트로 **쿼리에 어떤 조건이 붙었는지**를 직접 검사한다.
 *
 * 여기서 잠그는 4가지는 전부 "빠뜨려도 조용히 통과하는" 부류다 —
 * 쿼리는 성공하고 행도 돌아오는데 **엉뚱한 행이 섞인다.**
 *   site_id     남의 사이트 광고가 danjiondo 화면에 노출된다
 *   status      미승인·거절·일시정지 광고가 노출된다
 *   기간        만료됐거나 아직 시작 안 한 광고가 노출된다  (CLAUDE.md CRITICAL)
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getActiveAds } from '@/lib/data/ads'
import { SITE_ID } from '@/lib/data/site'

interface Call { method: string; args: unknown[] }

/** 체인 호출을 기록하는 최소 목. 어떤 메서드를 불러도 자기 자신을 돌려주고, await 하면 rows 를 준다. */
function makeRecorder(rows: unknown[] = []) {
  const calls: Call[] = []
  const chain: Record<string, unknown> = {}
  // 🔴 getActiveAds 가 쓰는 체인 메서드는 전부 넣는다 — 빠지면 "is not a function" 으로
  //    터진다(오답노트 #001: 목이 화이트리스트 방식이다).
  for (const m of ['select', 'eq', 'lte', 'gte', 'order', 'or', 'not', 'in', 'is', 'limit']) {
    chain[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return chain }
  }
  chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(ok, err)

  const client = {
    from: (table: string) => { calls.push({ method: 'from', args: [table] }); return chain },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

const called = (calls: Call[], method: string, ...args: unknown[]): boolean =>
  calls.some(c => c.method === method && args.every((a, i) => c.args[i] === a))

describe('getActiveAds — 쿼리 불변식', () => {
  it('🔴 site_id 로 이 사이트 광고만 조회한다', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('sidebar', client)
    expect(called(calls, 'eq', 'site_id', SITE_ID)).toBe(true)
  })

  it('SITE_ID 는 danjiondo 다', () => {
    expect(SITE_ID).toBe('danjiondo')
  })

  it('status=approved 만 조회한다 (CLAUDE.md CRITICAL)', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('sidebar', client)
    expect(called(calls, 'eq', 'status', 'approved')).toBe(true)
  })

  it('기간 조건 — starts_at <= now <= ends_at (CLAUDE.md CRITICAL)', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('sidebar', client)
    expect(called(calls, 'lte', 'starts_at')).toBe(true)
    expect(called(calls, 'gte', 'ends_at')).toBe(true)
  })

  it('요청한 placement 로 조회한다', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('banner_top', client)
    expect(called(calls, 'eq', 'placement', 'banner_top')).toBe(true)
  })

  it('ad_campaigns 테이블을 본다', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('in_feed', client)
    expect(called(calls, 'from', 'ad_campaigns')).toBe(true)
  })

  it('map_popup 은 좌표 있는 캠페인만 조회한다', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('map_popup', client)
    expect(called(calls, 'not', 'target_lat', 'is', null)).toBe(true)
    expect(called(calls, 'not', 'target_lng', 'is', null)).toBe(true)
  })

  it('sggCode 를 주면 해당 지역 + 전체지역(null) 을 함께 조회한다', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('sidebar', client, '48123')
    const or = calls.find(c => c.method === 'or')
    expect(or).toBeDefined()
    expect(String(or?.args[0])).toContain('target_sgg_code.is.null')
    expect(String(or?.args[0])).toContain('48123')
  })

  it('site_id 필터는 다른 조건과 함께 적용된다 (하나만 남지 않는다)', async () => {
    const { client, calls } = makeRecorder()
    await getActiveAds('sidebar', client)
    expect(called(calls, 'eq', 'site_id', SITE_ID)).toBe(true)
    expect(called(calls, 'eq', 'status', 'approved')).toBe(true)
    expect(called(calls, 'eq', 'placement', 'sidebar')).toBe(true)
  })
})
