import { describe, it } from 'vitest'

describe('setComplexRedevelopmentStatus (REDV-01)', () => {
  it.todo('returns error when user is not admin')
  it.todo('rejects invalid complexId (not uuid)')
  it.todo('updates complexes.status to in_redevelopment')
  it.todo('updates predecessor_id when provided')
  it.todo('updates successor_id when provided')
  it.todo('allows null for predecessor_id and successor_id')
  it.todo('calls revalidatePath("/admin/redevelopment")')
})
