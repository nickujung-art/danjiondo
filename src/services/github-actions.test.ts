/**
 * TDD RED: github-actions.ts 서비스 어댑터 테스트
 * Task 1 RED phase — 구현 전 실패해야 함
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

describe('github-actions service adapter', () => {
  let originalPat: string | undefined

  beforeEach(() => {
    originalPat = process.env.GITHUB_PAT
    delete process.env.GITHUB_PAT
  })

  afterEach(() => {
    if (originalPat !== undefined) {
      process.env.GITHUB_PAT = originalPat
    } else {
      delete process.env.GITHUB_PAT
    }
    vi.restoreAllMocks()
  })

  it('triggerWorkflow — GITHUB_PAT 미설정 시 에러를 throw한다', async () => {
    const { triggerWorkflow } = await import('./github-actions')
    await expect(
      triggerWorkflow({ owner: 'o', repo: 'r', workflowId: 'w.yml', ref: 'main', inputs: {} }),
    ).rejects.toThrow('GITHUB_PAT not configured')
  })

  it('getWorkflowState — GITHUB_PAT 미설정 시 에러를 throw한다', async () => {
    const { getWorkflowState } = await import('./github-actions')
    await expect(
      getWorkflowState('o', 'r', 'w.yml'),
    ).rejects.toThrow('GITHUB_PAT not configured')
  })

  it('setWorkflowEnabled — GITHUB_PAT 설정 시 GitHub API를 호출한다', async () => {
    process.env.GITHUB_PAT = 'test-token'
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response)

    const { setWorkflowEnabled } = await import('./github-actions')
    await expect(setWorkflowEnabled('o', 'r', 'w.yml', true)).resolves.toBeUndefined()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/enable'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('getLatestWorkflowRun — API 실패 시 null을 반환한다', async () => {
    process.env.GITHUB_PAT = 'test-token'
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)

    const { getLatestWorkflowRun } = await import('./github-actions')
    const result = await getLatestWorkflowRun('o', 'r', 'w.yml')
    expect(result).toBeNull()
  })

  it('triggerWorkflow — API 204 응답 시 void를 반환한다', async () => {
    process.env.GITHUB_PAT = 'test-token'
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response)

    const { triggerWorkflow } = await import('./github-actions')
    await expect(
      triggerWorkflow({ owner: 'o', repo: 'r', workflowId: 'w.yml', ref: 'main', inputs: { key: 'val' } }),
    ).resolves.toBeUndefined()
  })
})
