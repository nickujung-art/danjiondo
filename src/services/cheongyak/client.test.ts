import { describe, it, vi, beforeEach, afterEach } from 'vitest'

describe('fetchCheongyakList (PRESALE-01)', () => {
  const ORIGINAL_KEY = process.env.MOLIT_API_KEY
  beforeEach(() => { delete process.env.MOLIT_API_KEY })
  afterEach(() => {
    if (ORIGINAL_KEY) process.env.MOLIT_API_KEY = ORIGINAL_KEY
    vi.restoreAllMocks()
  })

  it.todo('throws when MOLIT_API_KEY missing')
  it.todo('calls expected URL with RoadNmSggCd + _type=json')
  it.todo('parses camelCase response into CheongyakItem[]')
  it.todo('throws on res.ok === false')
})

describe('fetchCompetitionRate (PRESALE-02)', () => {
  it.todo('returns null when API returns empty items')
  it.todo('aggregates multiple houseTy rows into single max competition rate')
})
