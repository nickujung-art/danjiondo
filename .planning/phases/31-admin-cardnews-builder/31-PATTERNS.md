# Phase 31: 어드민 카드뉴스 빌더 - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 17개 (신규/수정 대상)
**Analogs found:** 16 / 17 (`.github/workflows` 신규 = 기존 card-news 워크플로우 참조)

---

## File Classification

| 신규/수정 파일 | Role | Data Flow | 최근접 Analog | Match Quality |
|---------------|------|-----------|--------------|---------------|
| `src/app/admin/cardnews/builder/page.tsx` | page (RSC shell) | request-response | `src/app/admin/cardnews/page.tsx` | exact |
| `src/app/admin/cardnews/scheduler/page.tsx` | page (RSC shell) | request-response | `src/app/admin/presale-discoveries/page.tsx` | exact |
| `src/app/api/admin/cardnews/data/route.ts` | API route | CRUD (read) | `src/app/api/admin/gps-approve/route.ts` | role-match |
| `src/app/api/admin/cardnews/generate-html/route.ts` | API route | transform | `src/app/api/admin/ad-copy-review/route.ts` | role-match |
| `src/app/api/admin/cardnews/ai-text/route.ts` | API route | request-response (AI) | `src/app/api/admin/ad-copy-review/route.ts` | exact |
| `src/app/api/admin/cardnews/trigger-actions/route.ts` | API route | event-driven | `src/app/api/admin/realtors/upload-image/route.ts` | role-match |
| `src/app/api/admin/cardnews/scheduler/route.ts` | API route | request-response | `src/app/api/admin/gps-approve/route.ts` | role-match |
| `src/services/github-actions.ts` | service (어댑터) | request-response | `src/services/molit.ts` | role-match |
| `src/components/admin/cardnews/BuilderOptionsPanel.tsx` | component (client) | event-driven | `src/components/admin/AdCopyReviewer.tsx` | role-match |
| `src/components/admin/cardnews/BuilderPreviewPanel.tsx` | component (client) | transform | `src/components/admin/CardnewsDownloadButton.tsx` | role-match |
| `src/components/admin/cardnews/AiTextEditor.tsx` | component (client) | request-response (AI) | `src/components/admin/AdCopyReviewer.tsx` | exact |
| `src/components/admin/cardnews/ExportPanel.tsx` | component (client) | event-driven | `src/components/admin/CardnewsDownloadButton.tsx` | exact |
| `src/components/admin/cardnews/DataQualityWarning.tsx` | component (client) | transform | `src/components/admin/AdCopyReviewer.tsx` (경고 패턴) | role-match |
| `src/components/admin/cardnews/SchedulerPanel.tsx` | component (client) | request-response | `src/components/admin/AdCopyReviewer.tsx` | role-match |
| `card-news/scripts/fetch-data.js` | script (확장) | CRUD (read) | 자기 자신 (기존 패턴 연장) | exact |
| `card-news/scripts/templates.js` | script (수정) | transform | 자기 자신 (renderClosing 업데이트) | exact |
| `.github/workflows/custom-cardnews.yml` | CI/CD config | event-driven | `card-news/.github/workflows/weekly-generate.yml` | role-match |

---

## Pattern Assignments

---

### `src/app/admin/cardnews/builder/page.tsx` (page, RSC shell)

**Analog:** `src/app/admin/cardnews/page.tsx`

**Imports 패턴** (lines 1-4):
```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
// 클라이언트 컴포넌트들은 여기서 import
import { BuilderOptionsPanel } from '@/components/admin/cardnews/BuilderOptionsPanel'
```

**Auth/Guard 패턴** (lines 12-26 — 기존 cardnews/page.tsx):
```typescript
export default async function AdminCardnewsBuilderPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/cardnews/builder')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }
  // 이후 클라이언트 컴포넌트에 위임
}
```

**Core 패턴** (RSC shell — presale-discoveries/page.tsx lines 55-84 참조):
```typescript
export const revalidate = 0
export const metadata = { title: '카드뉴스 빌더 — 단지온도 관리자' }

// RSC에서 auth 검증 후 'use client' 컴포넌트 조합만 렌더
return (
  <div style={{ padding: 32 }}>
    <h1 style={{ font: '600 20px/1.3 var(--font-sans)', marginBottom: 24 }}>
      카드뉴스 빌더
    </h1>
    <BuilderOptionsPanel />
  </div>
)
```

---

### `src/app/admin/cardnews/scheduler/page.tsx` (page, RSC shell)

**Analog:** `src/app/admin/presale-discoveries/page.tsx`

**Auth/Guard 패턴** (lines 15-32): 동일 — `createSupabaseServerClient()` + profile.role check + redirect

**Core 패턴** (lines 55-84):
```typescript
// presale-discoveries/page.tsx 패턴 — 탭 + 클라이언트 컴포넌트 위임
return (
  <div style={{ padding: 32 }}>
    <h1 style={{ font: '600 20px/1.3 var(--font-sans)', marginBottom: 24 }}>
      카드뉴스 스케줄러 관리
    </h1>
    <SchedulerPanel />
  </div>
)
```

---

### `src/app/api/admin/cardnews/data/route.ts` (API route, CRUD read)

**Analog:** `src/app/api/admin/gps-approve/route.ts`

**Imports 패턴** (lines 1-3):
```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
```

**Auth/Guard 패턴** (lines 7-21 — gps-approve/route.ts):
```typescript
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // 이후 로직...
}
```

**Core 패턴** (Supabase 집계 쿼리 — fetch-data.js 패턴):
```typescript
// 반드시 cancel_date IS NULL AND superseded_by IS NULL 조건 포함 (CLAUDE.md CRITICAL)
const adminClient = createSupabaseAdminClient()
const { data, error } = await adminClient
  .from('transactions')
  .select('complex_id, price, area_m2, sgg_code')
  .is('cancel_date', null)
  .is('superseded_by', null)
  .eq('deal_type', dealType)         // 'sale' | 'jeonse' | 'monthly'
  .gte('deal_date', from)
  .lte('deal_date', to)
  .in('sgg_code', sggCodes)
  .gte('area_m2', areaMin)
  .lte('area_m2', areaMax)
  .not('complex_id', 'is', null)
  .limit(5000)

if (error) return NextResponse.json({ error: error.message }, { status: 500 })
return NextResponse.json({ data: rankingResult })
```

**Error 패턴** (gps-approve/route.ts lines 57-60):
```typescript
if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
```

---

### `src/app/api/admin/cardnews/generate-html/route.ts` (API route, transform)

**Analog:** `src/app/api/admin/ad-copy-review/route.ts`

**Auth/Guard 패턴**: 동일 — gps-approve/route.ts 패턴 그대로

**Core 패턴** (ad-copy-review/route.ts lines 24-35 — JSON 파싱 + 처리):
```typescript
let body: unknown
try {
  body = await request.json()
} catch {
  return NextResponse.json({ error: 'invalid body' }, { status: 400 })
}

// templates.js renderX() 함수 호출 (Node.js 서버사이드에서만)
// CDN 폰트 변형: BASE_CSS_PREVIEW (iframe용)
// 4개 HTML 문자열 반환
return NextResponse.json({
  html: { cover: '...', highlight: '...', ranking: '...', closing: '...' }
})
```

---

### `src/app/api/admin/cardnews/ai-text/route.ts` (API route, AI)

**Analog:** `src/app/api/admin/ad-copy-review/route.ts` (Gemini 패턴) + `src/app/actions/hagwon.ts` (Groq 패턴)

**Imports 패턴** (hagwon.ts lines 4 참조):
```typescript
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
```

**Core Groq 패턴** (hagwon.ts lines 87-98):
```typescript
const FALLBACK_TEXT = { title: null, caption: null, sns: null, hashtags: null }

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
try {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',  // D-03 Locked
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.7,
  })
  const text = res.choices[0]?.message?.content?.trim() ?? null
  return NextResponse.json({ text })
} catch {
  return NextResponse.json({ text: null, fallback: true })  // 재시도 버튼만 (D-05)
}
```

**Error 패턴** (ad-copy-review/route.ts lines 64-68):
```typescript
} catch (err) {
  // 실패 시 차단 안 함 — fallback 플래그만 반환
  return NextResponse.json({ text: null, fallback: true }, { status: 200 })
}
```

---

### `src/app/api/admin/cardnews/trigger-actions/route.ts` (API route, event-driven)

**Analog:** `src/app/api/admin/realtors/upload-image/route.ts` (외부 서비스 호출 패턴)

**Imports 패턴** (upload-image/route.ts lines 1-2):
```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
// 외부 API는 서비스 어댑터 경유 (CLAUDE.md CRITICAL)
import { triggerWorkflow } from '@/services/github-actions'
```

**Auth/Guard 패턴**: 동일 — gps-approve/route.ts 패턴

**Core 패턴** (upload-image/route.ts lines 37-53 참조):
```typescript
// 1. HTML 페이로드를 Supabase Storage에 업로드
const adminClient = createSupabaseAdminClient()
const { data, error } = await adminClient.storage
  .from('cardnews-payloads')
  .upload(filename, buffer, {
    contentType: 'application/json',
    cacheControl: '3600',
    upsert: false,
  })
if (error) return NextResponse.json({ error: error.message }, { status: 500 })

const { data: { publicUrl } } = adminClient.storage
  .from('cardnews-payloads')
  .getPublicUrl(data.path)

// 2. GitHub Actions 트리거 (서비스 어댑터 경유)
await triggerWorkflow({
  owner: 'nickujung-art',
  repo: 'bds',
  workflowId: 'custom-cardnews.yml',
  ref: 'main',
  inputs: { payload_url: publicUrl, series_id: seriesId },
})

return NextResponse.json({ ok: true, payload_url: publicUrl })
```

---

### `src/app/api/admin/cardnews/scheduler/route.ts` (API route, scheduler)

**Analog:** `src/app/api/admin/gps-approve/route.ts`

**Auth/Guard 패턴**: 동일

**Core 패턴** (GET + PUT 메서드 — GitHub Actions enable/disable):
```typescript
// CLAUDE.md CRITICAL: GitHub API는 src/services/github-actions.ts 어댑터 경유
import { setWorkflowEnabled, getWorkflowState, getLatestWorkflowRun } from '@/services/github-actions'

export async function GET(): Promise<NextResponse> {
  // admin guard...
  const state = await getWorkflowState('nickujung-art', 'bds', 'weekly-generate.yml')
  const latestRun = await getLatestWorkflowRun('nickujung-art', 'bds', 'weekly-generate.yml')
  return NextResponse.json({ state, latestRun })
}

export async function PUT(request: Request): Promise<NextResponse> {
  // admin guard...
  const { enabled } = await request.json() as { enabled: boolean }
  await setWorkflowEnabled('nickujung-art', 'bds', 'weekly-generate.yml', enabled)
  return NextResponse.json({ ok: true })
}
```

---

### `src/services/github-actions.ts` (service, 외부 API 어댑터)

**Analog:** `src/services/molit.ts` (얇은 래퍼 패턴)

**Imports 패턴** (molit.ts lines 1-9):
```typescript
/**
 * GitHub Actions API 어댑터 (얇은 래퍼 — 비즈니스 로직 없음)
 * CLAUDE.md CRITICAL: 외부 API는 src/services/ 어댑터 전용
 */
```

**Core 패턴** (RESEARCH.md Pattern 4~7 기반):
```typescript
const GH_API = 'https://api.github.com'
const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
})

function getToken(): string {
  const token = process.env.GITHUB_PAT
  if (!token) throw new Error('GITHUB_PAT not configured')
  return token
}

export async function triggerWorkflow(params: { ... }): Promise<void> { ... }
export async function getLatestWorkflowRun(owner, repo, workflowId): Promise<WorkflowRun | null> { ... }
export async function getArtifactDownloadUrl(owner, repo, artifactId): Promise<string | null> { ... }
export async function setWorkflowEnabled(owner, repo, workflowId, enabled): Promise<void> { ... }
export async function getWorkflowState(owner, repo, workflowId): Promise<string> { ... }
```

**Error 패턴** (molit.ts 패턴):
```typescript
if (!res.ok && res.status !== 204) {
  throw new Error(`GitHub API error: ${res.status} ${await res.text()}`)
}
```

---

### `src/components/admin/cardnews/BuilderOptionsPanel.tsx` (component, client)

**Analog:** `src/components/admin/AdCopyReviewer.tsx`

**Directive & Imports** (AdCopyReviewer.tsx lines 1-4):
```typescript
'use client'
import { useState } from 'react'
```

**State 패턴** (AdCopyReviewer.tsx lines 5-14):
```typescript
type BuilderState = 'idle' | 'loading' | 'result' | 'error'

interface BuilderOptions {
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  topic: 'sale_top' | 'jeonse_top' | 'volume' | 'value' | 'alltime_high' | 'price_change' | 'district'
  sggCodes: string[]
  areaMin: number
  areaMax: number
  customFrom?: string
  customTo?: string
}
```

**Core 패턴** (AdCopyReviewer.tsx lines 36-55 — async fetch 패턴):
```typescript
async function handleGenerate() {
  if (state === 'loading') return
  setState('loading')
  try {
    const res = await fetch('/api/admin/cardnews/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
    const data = await res.json() as { data?: RankingRow[]; error?: string }
    if (!res.ok || data.error) {
      setState('error')
      return
    }
    onDataFetched(data.data ?? [])
    setState('result')
  } catch {
    setState('error')
  }
}
```

**Error 패턴** (AdCopyReviewer.tsx lines 100-113):
```typescript
{state === 'error' && (
  <p role="alert" style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>
    데이터 조회에 실패했습니다. 다시 시도해 주세요.
  </p>
)}
```

---

### `src/components/admin/cardnews/BuilderPreviewPanel.tsx` (component, client)

**Analog:** `src/components/admin/CardnewsDownloadButton.tsx`

**Directive** (line 1): `'use client'`

**Core iframe 패턴** (RESEARCH.md Pattern 8 — Pitfall 4 해결책 적용):
```typescript
// 스케일 컨테이너: 1080 * 0.4 = 432px (레이아웃 공간 고정 — Pitfall 4)
<div style={{ width: 432, height: 432, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
  <iframe
    srcDoc={htmlString}
    style={{
      width: 1080,
      height: 1080,
      transform: 'scale(0.4)',
      transformOrigin: 'top left',
      border: 'none',
    }}
    title="카드 미리보기"
    sandbox="allow-same-origin"  // CDN 폰트 로드를 위해 allow-same-origin 포함 (A6 가정)
  />
</div>
```

**4장 탐색 패턴**:
```typescript
// 커버/하이라이트/랭킹/클로징 4장 탭 전환
const [activeCard, setActiveCard] = useState<'cover' | 'highlight' | 'ranking' | 'closing'>('cover')
```

---

### `src/components/admin/cardnews/AiTextEditor.tsx` (component, client, AI)

**Analog:** `src/components/admin/AdCopyReviewer.tsx` (가장 유사한 구조)

**State 패턴** (AdCopyReviewer.tsx lines 5-14):
```typescript
'use client'
import { useState } from 'react'

type AiState = 'idle' | 'loading' | 'result' | 'error'

interface AiTextResult {
  title: string | null
  caption: string | null
  sns: string | null
  hashtags: string | null
}
```

**Core 패턴** (AI 호출 + 인라인 편집 — D-05):
```typescript
// AI 생성 텍스트는 textarea로 수정 가능 (D-05 Locked)
// "재생성" 버튼 제공
const [aiText, setAiText] = useState<AiTextResult | null>(null)
const [editedText, setEditedText] = useState<AiTextResult | null>(null)  // 수정본 별도 관리

async function handleGenerate() {
  setState('loading')
  try {
    const res = await fetch('/api/admin/cardnews/ai-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rankingData, options }),
    })
    const data = await res.json() as { text: AiTextResult; fallback?: boolean }
    setAiText(data.text)
    setEditedText(data.text)  // 편집 시작점
    setState('result')
  } catch {
    setState('error')
  }
}
```

**Error 패턴** (AdCopyReviewer.tsx lines 100-113):
```typescript
{state === 'error' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <p role="alert" style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>
      AI 텍스트 생성에 실패했습니다.
    </p>
    <button className="btn btn-sm btn-secondary" onClick={() => void handleGenerate()}>
      재시도
    </button>
  </div>
)}
```

---

### `src/components/admin/cardnews/ExportPanel.tsx` (component, client, export)

**Analog:** `src/components/admin/CardnewsDownloadButton.tsx` (가장 유사한 구조)

**Core 패턴** (CardnewsDownloadButton.tsx lines 4-54):
```typescript
'use client'
import { useState } from 'react'

export function ExportPanel({ htmlCards, aiText }: ExportPanelProps) {
  const [pending, setPending] = useState(false)
  const [runUrl, setRunUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function handleTrigger() {
    setPending(true)
    setErr(null)
    try {
      const res = await fetch('/api/admin/cardnews/trigger-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlCards, aiText }),
      })
      if (!res.ok) {
        setErr(`Actions 트리거 실패 (${res.status})`)
        return
      }
      const { run_url } = await res.json() as { run_url: string }
      setRunUrl(run_url)  // Actions 페이지 링크
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'PNG 생성 요청 실패')
    } finally {
      setPending(false)
    }
  }
  // ...
}
```

**Blob 다운로드 패턴** (CardnewsDownloadButton.tsx lines 16-24 — artifact 다운로드에도 동일):
```typescript
const blob = await res.blob()
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `cardnews_${seriesId}_${new Date().toISOString().slice(0, 10)}.zip`
document.body.appendChild(a)
a.click()
document.body.removeChild(a)
URL.revokeObjectURL(url)
```

---

### `src/components/admin/cardnews/DataQualityWarning.tsx` (component, client)

**Analog:** `src/components/admin/AdCopyReviewer.tsx` (role="alert" + aria-live 패턴)

**Core 패턴** (AdCopyReviewer.tsx lines 76-85 — role/aria 접근성):
```typescript
'use client'

interface DataQualityWarningProps {
  periodEnd: string  // 'YYYY-MM-DD'
}

export function DataQualityWarning({ periodEnd }: DataQualityWarningProps) {
  const daysElapsed = Math.ceil(
    (new Date().getTime() - new Date(periodEnd).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysElapsed > 7) return null  // 7일 초과면 경고 불필요 (D-04)

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        border: '1px solid var(--line-default)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        background: '#fff3e0',  // 경고 색상 — gradient/glow 금지 (CLAUDE.md)
        font: '500 13px/1.5 var(--font-sans)',
      }}
    >
      데이터가 완전하지 않을 수 있습니다. (종료일: {periodEnd}, {daysElapsed}일 경과)
    </div>
  )
}
```

---

### `src/components/admin/cardnews/SchedulerPanel.tsx` (component, client)

**Analog:** `src/components/admin/AdCopyReviewer.tsx`

**Core 패턴** (상태 토글 + API 호출):
```typescript
'use client'
import { useState } from 'react'

type SchedulerState = 'loading' | 'idle' | 'error'

export function SchedulerPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null)  // null = 로딩 중
  const [state, setState] = useState<SchedulerState>('loading')

  // GET /api/admin/cardnews/scheduler → state, latestRun
  // PUT /api/admin/cardnews/scheduler → { enabled: boolean }
  async function handleToggle(newEnabled: boolean) {
    setState('loading')
    try {
      const res = await fetch('/api/admin/cardnews/scheduler', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })
      if (!res.ok) { setState('error'); return }
      setEnabled(newEnabled)
      setState('idle')
    } catch {
      setState('error')
    }
  }
}
```

---

### `card-news/scripts/fetch-data.js` (script, 확장)

**Analog:** 자기 자신 (기존 패턴 연장)

**기존 쿼리 패턴** (lines 84-119 — fetchAreaRanking 패턴):
```javascript
// 모든 신규 함수는 이 구조를 따름
export async function fetchJeonseRanking({ sggCodes, areaMin, areaMax, from, to, limit = 10 }) {
  // ↑ from/to 파라미터 추가 (기존 getLastWeekRange() 대신 — 빌더에서 기간 직접 전달)
  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2, sgg_code')
    .is('cancel_date', null)           // CLAUDE.md CRITICAL
    .is('superseded_by', null)         // CLAUDE.md CRITICAL
    .eq('deal_type', 'jeonse')         // 신규: jeonse
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`fetchJeonseRanking: ${error.message}`)
  // ... 집계 로직 (fetchAreaRanking과 동일)
}
```

**날짜 범위 유틸 확장** (lines 23-50 — getLastWeekRange 참조):
```javascript
// 기존 getLastWeekRange() 유지 + 범용 getDateRange() 추가
export function getDateRange(type, customFrom, customTo) {
  if (type === 'custom') return { from: customFrom, to: customTo }
  const now = new Date()
  if (type === 'weekly') return getLastWeekRange()
  if (type === 'monthly') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const to = new Date(now - 86400000).toISOString().slice(0, 10)
    return { from, to }
  }
  // ... quarterly, yearly
}
```

**이상치 필터 패턴** (RESEARCH.md Pattern 11 — D-04 기반):
```javascript
// 12개월 기준가로 필터 (별도 쿼리 — Pitfall 6 해결책)
async function filterOutliers(transactions, dealType) {
  // 12개월 전체 평균 별도 계산 후 200% 초과 제거
  // 집계 기간 내 데이터만 사용 금지 (Pitfall 6)
}
```

---

### `card-news/scripts/templates.js` (script, 수정)

**Analog:** 자기 자신

**renderClosing 수정 대상** (lines 330-358 — 기존 문구):
```javascript
// 현재 (수정 대상):
// "본 자료는 국토교통부 실거래가 공개시스템 기준입니다. 투자 판단의 최종 책임은 본인에게 있습니다."

// D-08 요구 문구 (2줄, 하드코딩):
// "출처: 국토교통부 실거래가 공개시스템"
// "본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다"
```

**CDN 폰트 변형 추가** (lines 13-37 — BASE_CSS 참조):
```javascript
// 브라우저 iframe 미리보기용 (Pitfall 1 해결책)
export const BASE_CSS_PREVIEW = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
  /* 나머지 BASE_CSS 동일 (font-face 블록 제외) */
`

// 미리보기용 렌더 함수 (기존 함수와 동일, css 파라미터만 교체)
export function renderCoverPreview(data) {
  return renderCoverWithCss(data, BASE_CSS_PREVIEW)
}
```

---

### `.github/workflows/custom-cardnews.yml` (CI/CD, 신규)

**Analog:** `card-news/.github/workflows/weekly-generate.yml`

**Core 패턴** (RESEARCH.md Pattern 13):
```yaml
name: Custom Card News (Builder)
on:
  workflow_dispatch:
    inputs:
      payload_url:
        description: 'URL to JSON payload with HTML card strings'
        type: string
        required: true
      series_id:
        description: 'Unique series identifier'
        type: string
        default: 'custom'
jobs:
  generate:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: card-news
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: card-news/package-lock.json
      # ... Chromium 의존성 설치, npm ci, 폰트 캐시
      # node scripts/generate-from-payload.js --payload=payload.json --series=${{ inputs.series_id }}
      - uses: actions/upload-artifact@v4
        with:
          name: custom-card-${{ inputs.series_id }}-${{ github.run_id }}
          path: card-news/output/
          retention-days: 30
```

**중요:** 루트 `.github/workflows/`에 위치해야 GitHub Actions가 인식함 (Critical Finding).

---

## Shared Patterns

### 어드민 권한 검증 (RSC 페이지용)
**Source:** `src/app/admin/cardnews/page.tsx` lines 12-26
**Apply to:** `builder/page.tsx`, `scheduler/page.tsx`
```typescript
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?next=/admin/cardnews/builder')

const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()

if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
  redirect('/')
}
```

### 어드민 권한 검증 (API Route용)
**Source:** `src/app/api/admin/gps-approve/route.ts` lines 7-21
**Apply to:** 모든 `/api/admin/cardnews/*` route.ts 파일
```typescript
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}
```

### Groq SDK 패턴
**Source:** `src/app/actions/hagwon.ts` lines 87-98
**Apply to:** `src/app/api/admin/cardnews/ai-text/route.ts`
```typescript
const FALLBACK = '내용을 생성할 수 없습니다.'
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
try {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.7,
  })
  return res.choices[0]?.message?.content?.trim() ?? FALLBACK
} catch {
  return FALLBACK
}
```

### Supabase Storage 업로드 패턴
**Source:** `src/app/api/admin/realtors/upload-image/route.ts` lines 37-53
**Apply to:** `src/app/api/admin/cardnews/trigger-actions/route.ts`
```typescript
const adminClient = createSupabaseAdminClient()
const { data, error } = await adminClient.storage
  .from('cardnews-payloads')  // 신규 버킷
  .upload(filename, buffer, {
    contentType: 'application/json',
    cacheControl: '3600',
    upsert: false,
  })
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
const { data: { publicUrl } } = adminClient.storage
  .from('cardnews-payloads')
  .getPublicUrl(data.path)
```

### Client 컴포넌트 API Fetch 패턴
**Source:** `src/components/admin/AdCopyReviewer.tsx` lines 36-55
**Apply to:** 모든 `src/components/admin/cardnews/` 클라이언트 컴포넌트
```typescript
async function handleAction() {
  if (state === 'loading') return
  setState('loading')
  try {
    const res = await fetch('/api/admin/cardnews/...', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json() as ExpectedType
    if (data.error) { setState('error'); return }
    setState('result')
  } catch {
    setState('error')
  }
}
```

### 어드민 사이드바 nav 항목 추가
**Source:** `src/components/admin/AdminSidebar.tsx` lines 17-30 (buildNavItems)
**Apply to:** `src/components/admin/AdminSidebar.tsx` 수정 (D-12)
```typescript
// 기존 { label: '카드뉴스', href: '/admin/cardnews' } 를 3개로 확장
{ label: '카드뉴스 (텍스트)', href: '/admin/cardnews' },
{ label: '카드뉴스 빌더', href: '/admin/cardnews/builder' },
{ label: '카드뉴스 스케줄러', href: '/admin/cardnews/scheduler' },
```

### Supabase 쿼리 필수 조건 (CLAUDE.md CRITICAL)
**Apply to:** `data/route.ts` + `fetch-data.js` 신규 함수 전체
```typescript
// 거래 조회 시 반드시 포함
.is('cancel_date', null)
.is('superseded_by', null)
```

### UI 금지 사항 (CLAUDE.md)
**Apply to:** 모든 컴포넌트
- `backdrop-blur` 금지
- `gradient-text`, glow 애니메이션 금지
- 보라/인디고 브랜드색 금지
- `gradient orb` 금지
- 애니메이션: `transform`, `opacity`, `clip-path`만 허용

---

## No Analog Found

| 파일 | Role | Data Flow | 사유 |
|------|------|-----------|------|
| `card-news/scripts/generate-from-payload.js` (신규) | script | transform | Actions 내 HTML→PNG 변환 스크립트 — 기존 `generate.js` 오케스트레이터 패턴 참조 가능하지만 payload 기반 완전 신규 |

---

## Metadata

**Analog 탐색 범위:**
- `src/app/admin/` — RSC 페이지 6개 검토
- `src/app/api/admin/` — API Route 4개 검토
- `src/components/admin/` — 컴포넌트 16개 검토
- `src/services/` — 외부 API 어댑터 패턴 (molit.ts)
- `src/lib/supabase/admin.ts` — Supabase 클라이언트 팩토리
- `src/app/actions/hagwon.ts` — Groq SDK 패턴
- `card-news/scripts/fetch-data.js` (250줄) — 집계 쿼리 패턴
- `card-news/scripts/templates.js` (358줄) — HTML 렌더 패턴

**Files scanned:** 26개
**Pattern extraction date:** 2026-06-25
