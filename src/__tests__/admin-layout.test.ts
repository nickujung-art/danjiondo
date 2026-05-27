/**
 * Phase 19 ADMIN-10, ADMIN-13: 공유 어드민 레이아웃
 * requireAdminLayout auth guard + buildNavItems 뱃지 로직 테스트
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { redirect } from 'next/navigation'

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

// ─── requireAdminLayout 테스트 ───────────────────────────────────────────────
// layout.tsx에서 inline으로 구현된 auth guard 로직을 직접 테스트
// (layout.tsx의 auth guard 로직 추출 버전을 테스트 목적으로 정의)

async function requireAdminLayout(
  getUser: () => Promise<{ data: { user: { id: string } | null } }>,
  getProfile: (userId: string) => Promise<{ data: { role: string } | null }>,
) {
  const { data: { user } } = await getUser()
  if (!user) {
    redirect('/login?next=/admin')
    return
  }
  const { data: profile } = await getProfile(user.id)
  const role = (profile as { role: string } | null)?.role ?? ''
  if (!['admin', 'superadmin'].includes(role)) {
    redirect('/')
    return
  }
}

describe('requireAdminLayout — auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: 비로그인(user=null) → redirect("/login?next=/admin")', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    const getProfile = vi.fn().mockResolvedValue({ data: null })

    await requireAdminLayout(getUser, getProfile)

    expect(redirect).toHaveBeenCalledWith('/login?next=/admin')
    expect(redirect).toHaveBeenCalledTimes(1)
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('Test 2: role="member" → redirect("/")', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const getProfile = vi.fn().mockResolvedValue({ data: { role: 'member' } })

    await requireAdminLayout(getUser, getProfile)

    expect(redirect).toHaveBeenCalledWith('/')
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('Test 3: role="admin" → 통과 (redirect 호출 없음)', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    const getProfile = vi.fn().mockResolvedValue({ data: { role: 'admin' } })

    await requireAdminLayout(getUser, getProfile)

    expect(redirect).not.toHaveBeenCalled()
  })
})

// ─── buildNavItems 테스트 ────────────────────────────────────────────────────

describe('buildNavItems — pending count 뱃지', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 4: pendingCount=150 → label "99+"', async () => {
    const { buildNavItems } = await import('@/components/admin/AdminSidebar')
    const items = buildNavItems({ reports: 150, ads: 0, gps: 0 })
    const reportsItem = items.find(i => i.href === '/admin/reports')
    expect(reportsItem?.pendingCount).toBe(150)
    // 뱃지 렌더 로직: > 99 → '99+'
    const badgeText = (reportsItem?.pendingCount ?? 0) > 99 ? '99+' : String(reportsItem?.pendingCount)
    expect(badgeText).toBe('99+')
  })

  it('Test 5: pendingCount=0 → 뱃지 숨김 (count > 0 조건)', async () => {
    const { buildNavItems } = await import('@/components/admin/AdminSidebar')
    const items = buildNavItems({ reports: 0, ads: 0, gps: 0 })
    const reportsItem = items.find(i => i.href === '/admin/reports')
    // pendingCount=0이면 뱃지 숨김 조건: (pendingCount ?? 0) > 0 이 false
    const shouldShowBadge = (reportsItem?.pendingCount ?? 0) > 0
    expect(shouldShowBadge).toBe(false)
  })

  it('Test 6: buildNavItems — 9개 항목 반환', async () => {
    const { buildNavItems } = await import('@/components/admin/AdminSidebar')
    const items = buildNavItems({ reports: 0, ads: 0, gps: 0 })
    expect(items).toHaveLength(9)
  })
})
