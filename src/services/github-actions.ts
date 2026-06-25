/**
 * GitHub Actions API 어댑터
 * CLAUDE.md CRITICAL: 외부 API는 src/services/ 어댑터 전용 — 컴포넌트/Route 직접 호출 금지
 */

const GH_API = 'https://api.github.com'

function getToken(): string {
  const token = process.env.GITHUB_PAT
  if (!token) throw new Error('GITHUB_PAT not configured')
  return token
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

export interface WorkflowRun {
  id: number
  status: string
  conclusion: string | null
  created_at: string
  html_url: string
  name: string
}

export interface WorkflowArtifact {
  id: number
  name: string
  size_in_bytes: number
  created_at: string
}

export async function triggerWorkflow(params: {
  owner: string
  repo: string
  workflowId: string
  ref: string
  inputs: Record<string, string>
}): Promise<void> {
  const token = getToken()
  const res = await fetch(
    `${GH_API}/repos/${params.owner}/${params.repo}/actions/workflows/${params.workflowId}/dispatches`,
    {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ ref: params.ref, inputs: params.inputs }),
    },
  )
  if (!res.ok && res.status !== 204) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub API dispatch error: ${res.status} ${body}`)
  }
}

export async function getLatestWorkflowRun(
  owner: string,
  repo: string,
  workflowId: string,
): Promise<WorkflowRun | null> {
  const token = getToken()
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/actions/runs?workflow_id=${workflowId}&event=workflow_dispatch&per_page=5`,
    { headers: ghHeaders(token) },
  )
  if (!res.ok) return null
  const json = (await res.json()) as { workflow_runs: WorkflowRun[] }
  return json.workflow_runs[0] ?? null
}

export async function getRunArtifacts(
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowArtifact[]> {
  const token = getToken()
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
    { headers: ghHeaders(token) },
  )
  if (!res.ok) return []
  const json = (await res.json()) as { artifacts: WorkflowArtifact[] }
  return json.artifacts
}

export async function getArtifactDownloadUrl(
  owner: string,
  repo: string,
  artifactId: number,
): Promise<string | null> {
  const token = getToken()
  // GitHub returns 302/303 redirect → S3 pre-signed URL (인증 불필요)
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
    { method: 'GET', headers: ghHeaders(token), redirect: 'manual' },
  )
  return res.headers.get('location')
}

export async function setWorkflowEnabled(
  owner: string,
  repo: string,
  workflowId: string,
  enabled: boolean,
): Promise<void> {
  const token = getToken()
  const action = enabled ? 'enable' : 'disable'
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/actions/workflows/${workflowId}/${action}`,
    { method: 'PUT', headers: ghHeaders(token) },
  )
  if (!res.ok) throw new Error(`Failed to ${action} workflow: ${res.status}`)
}

export async function getWorkflowState(
  owner: string,
  repo: string,
  workflowId: string,
): Promise<string> {
  const token = getToken()
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/actions/workflows/${workflowId}`,
    { headers: ghHeaders(token) },
  )
  if (!res.ok) throw new Error(`Failed to get workflow state: ${res.status}`)
  const data = (await res.json()) as { state: string }
  return data.state
}
