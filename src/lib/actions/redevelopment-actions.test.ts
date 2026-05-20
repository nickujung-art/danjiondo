import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Default: no user (unauthenticated)
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } })
const mockProfileFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockImplementation(() => ({
    auth: { getUser: mockGetUser },
    from: mockProfileFrom,
  })),
}))

const mockAdminUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockAdminFrom = vi.fn().mockReturnValue({ update: mockAdminUpdate })
const mockAdminClient = { from: mockAdminFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue(mockAdminClient),
}))

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const PREDECESSOR_UUID = '660e8400-e29b-41d4-a716-446655440001'
const SUCCESSOR_UUID = '770e8400-e29b-41d4-a716-446655440002'

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

function mockAuthenticatedUser(role: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
  mockProfileFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { role } }),
      }),
    }),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('setComplexRedevelopmentStatus (REDV-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset admin mock chain
    mockAdminUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockAdminFrom.mockReturnValue({ update: mockAdminUpdate })
  })

  it('returns error when user is not admin', async () => {
    mockUnauthenticated()
    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    const result = await setComplexRedevelopmentStatus({
      complexId: VALID_UUID,
      status: 'in_redevelopment',
      predecessorId: null,
      successorId: null,
    })
    expect(result.error).toBeTruthy()
  })

  it('rejects invalid complexId (not uuid)', async () => {
    mockAuthenticatedUser('admin')
    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    const result = await setComplexRedevelopmentStatus({
      complexId: 'not-a-uuid',
      status: 'in_redevelopment',
      predecessorId: null,
      successorId: null,
    })
    expect(result.error).toBeTruthy()
  })

  it('updates complexes.status to in_redevelopment', async () => {
    mockAuthenticatedUser('admin')
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    mockAdminUpdate.mockReturnValue({ eq: eqMock })
    mockAdminFrom.mockReturnValue({ update: mockAdminUpdate })

    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    const result = await setComplexRedevelopmentStatus({
      complexId: VALID_UUID,
      status: 'in_redevelopment',
      predecessorId: null,
      successorId: null,
    })

    expect(result.error).toBeNull()
    expect(mockAdminFrom).toHaveBeenCalledWith('complexes')
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_redevelopment',
        predecessor_id: null,
        successor_id: null,
      })
    )
    expect(eqMock).toHaveBeenCalledWith('id', VALID_UUID)
  })

  it('updates predecessor_id when provided', async () => {
    mockAuthenticatedUser('admin')
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    mockAdminUpdate.mockReturnValue({ eq: eqMock })
    mockAdminFrom.mockReturnValue({ update: mockAdminUpdate })

    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    const result = await setComplexRedevelopmentStatus({
      complexId: VALID_UUID,
      status: 'in_redevelopment',
      predecessorId: PREDECESSOR_UUID,
      successorId: null,
    })

    expect(result.error).toBeNull()
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ predecessor_id: PREDECESSOR_UUID })
    )
  })

  it('updates successor_id when provided', async () => {
    mockAuthenticatedUser('admin')
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    mockAdminUpdate.mockReturnValue({ eq: eqMock })
    mockAdminFrom.mockReturnValue({ update: mockAdminUpdate })

    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    const result = await setComplexRedevelopmentStatus({
      complexId: VALID_UUID,
      status: 'in_redevelopment',
      predecessorId: null,
      successorId: SUCCESSOR_UUID,
    })

    expect(result.error).toBeNull()
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ successor_id: SUCCESSOR_UUID })
    )
  })

  it('allows null for predecessor_id and successor_id', async () => {
    mockAuthenticatedUser('admin')
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    mockAdminUpdate.mockReturnValue({ eq: eqMock })
    mockAdminFrom.mockReturnValue({ update: mockAdminUpdate })

    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    const result = await setComplexRedevelopmentStatus({
      complexId: VALID_UUID,
      status: 'active',
      predecessorId: null,
      successorId: null,
    })

    expect(result.error).toBeNull()
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ predecessor_id: null, successor_id: null })
    )
  })

  it('calls revalidatePath("/admin/redevelopment")', async () => {
    mockAuthenticatedUser('admin')
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    mockAdminUpdate.mockReturnValue({ eq: eqMock })
    mockAdminFrom.mockReturnValue({ update: mockAdminUpdate })

    const { setComplexRedevelopmentStatus } = await import('@/lib/actions/redevelopment-actions')
    await setComplexRedevelopmentStatus({
      complexId: VALID_UUID,
      status: 'in_redevelopment',
      predecessorId: null,
      successorId: null,
    })

    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/redevelopment')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/presale')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/complexes/${VALID_UUID}`)
  })
})
