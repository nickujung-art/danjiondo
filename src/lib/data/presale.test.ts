import { describe, it } from 'vitest'

describe('getActiveListings (PRESALE-03 Tier 1)', () => {
  it.todo('returns only rows where pblanc_no IS NOT NULL and is_active=true')
  it.todo('orders by rcept_bgnde DESC')
  it.todo('selects all 11 cheongyak columns + id')
})

describe('getRedevelopmentComplexes (PRESALE-03 Tier 2)', () => {
  it.todo('returns only complexes with status=in_redevelopment')
  it.todo('includes predecessor_id and successor_id columns')
})

describe('getNewBuiltComplexes (PRESALE-03 Tier 3)', () => {
  it.todo('returns only complexes with built_year >= 2021 AND status=active')
  it.todo('orders by built_year DESC')
})

describe('getActiveListingCount (PRESALE-03 landing badge)', () => {
  it.todo('returns count of active cheongyak listings')
})
