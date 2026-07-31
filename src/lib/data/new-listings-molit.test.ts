import { describe, it, expect, vi } from 'vitest'
import { upsertMolitListing } from './new-listings-molit'

/**
 * MOLIT 분양권전매 → new_listings 적재 헬퍼 단위 테스트.
 *
 * 🔴 `src/__tests__/helpers`의 공용 목(`makeMockChain`)을 **의도적으로 재사용하지 않는다.**
 * 그 목은 메서드 화이트리스트 방식이라 새 체인 메서드를 쓰면 조용히 터진다
 * (`.planning/fix-loop/error-notes.md` #001 — `.range()`가 없어 회귀 1건이 났다).
 * 이 파일 전용 목에서 `.select`/`.eq`/`.is`/`.maybeSingle`/`.insert`/`.update`/`.single`을
 * **명시적으로** 정의한다.
 *
 * DB 의존이 없으므로 skipIf 없이 항상 실행된다.
 */

type Result<T> = { data: T | null; error: { message: string } | null }

function makeMock(opts: {
  select?: Result<{ id: string }>
  insert?: Result<{ id: string }>
  update?: Result<{ id: string }>
}) {
  // select('id').eq('name', …).eq('region', …).is('pblanc_no', null).maybeSingle()
  const maybeSingle = vi.fn().mockResolvedValue(opts.select ?? { data: null, error: null })
  const selectChain = {
    eq: vi.fn(() => selectChain),
    is: vi.fn(() => selectChain),
    maybeSingle,
  }
  const select = vi.fn(() => selectChain)

  // insert({…}).select('id').single()
  const insertSingle = vi.fn().mockResolvedValue(opts.insert ?? { data: null, error: null })
  const insertChain = {
    select: vi.fn(() => insertChain),
    single: insertSingle,
  }
  const insert = vi.fn(() => insertChain)

  // update({…}).eq('id', …).select('id').single()
  const updateSingle = vi.fn().mockResolvedValue(opts.update ?? { data: null, error: null })
  const updateChain = {
    eq: vi.fn(() => updateChain),
    select: vi.fn(() => updateChain),
    single: updateSingle,
  }
  const update = vi.fn(() => updateChain)

  /** 이 헬퍼는 어떤 분기에서도 upsert를 쓰면 안 된다 — 부분 인덱스는 ON CONFLICT 추론이 불가능하다 */
  const upsert = vi.fn()

  const from = vi.fn(() => ({ select, insert, update, upsert }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from } as any

  return { client, from, select, selectChain, insert, insertChain, update, updateChain, upsert }
}

const INPUT = {
  name: '창원더샵센트럴파크',
  region: '용호동',
  price: 85000,
  fetchedAt: '2026-07-31T00:00:00.000Z',
}

describe('upsertMolitListing', () => {
  it('기존 행이 있으면 update로 가격·수집시각만 갱신하고 id를 돌려준다', async () => {
    const m = makeMock({
      select: { data: { id: 'existing-1' }, error: null },
      update: { data: { id: 'existing-1' }, error: null },
    })

    const result = await upsertMolitListing(m.client, INPUT)

    expect(result).toEqual({ id: 'existing-1', error: null })
    expect(m.from).toHaveBeenCalledWith('new_listings')
    // 부분 인덱스 술어(pblanc_no IS NULL)와 정확히 같은 조건으로 조회해야 청약 공고 94행을 건드리지 않는다
    expect(m.selectChain.eq).toHaveBeenCalledWith('name', INPUT.name)
    expect(m.selectChain.eq).toHaveBeenCalledWith('region', INPUT.region)
    expect(m.selectChain.is).toHaveBeenCalledWith('pblanc_no', null)

    expect(m.update).toHaveBeenCalledWith({
      price_min: INPUT.price,
      price_max: INPUT.price,
      fetched_at: INPUT.fetchedAt,
    })
    expect(m.updateChain.eq).toHaveBeenCalledWith('id', 'existing-1')
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('기존 행이 없으면 insert로 신규 행을 만들고 id를 돌려준다', async () => {
    const m = makeMock({
      select: { data: null, error: null },
      insert: { data: { id: 'new-1' }, error: null },
    })

    const result = await upsertMolitListing(m.client, INPUT)

    expect(result).toEqual({ id: 'new-1', error: null })
    expect(m.insert).toHaveBeenCalledWith({
      name: INPUT.name,
      region: INPUT.region,
      price_min: INPUT.price,
      price_max: INPUT.price,
      fetched_at: INPUT.fetchedAt,
    })
    expect(m.update).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('select 에러면 insert·update를 하지 않고 에러 문자열을 돌려준다', async () => {
    const m = makeMock({ select: { data: null, error: { message: 'connection reset' } } })

    const result = await upsertMolitListing(m.client, INPUT)

    expect(result.id).toBeNull()
    expect(result.error).toContain('connection reset')
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('insert 에러면 에러 문자열을 돌려준다 — 침묵 실패하지 않는다', async () => {
    const m = makeMock({
      select: { data: null, error: null },
      insert: { data: null, error: { message: 'duplicate key value violates unique constraint' } },
    })

    const result = await upsertMolitListing(m.client, INPUT)

    expect(result.id).toBeNull()
    expect(result.error).toContain('duplicate key value')
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('update 에러면 에러 문자열을 돌려준다 — 침묵 실패하지 않는다', async () => {
    const m = makeMock({
      select: { data: { id: 'existing-2' }, error: null },
      update: { data: null, error: { message: 'permission denied for table new_listings' } },
    })

    const result = await upsertMolitListing(m.client, INPUT)

    expect(result.id).toBeNull()
    expect(result.error).toContain('permission denied')
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.upsert).not.toHaveBeenCalled()
  })
})
