# Phase 31: 어드민 카드뉴스 빌더 - Research

**Researched:** 2026-06-25
**Domain:** Next.js Admin UI · GitHub Actions API · Groq AI · Supabase Storage · Card HTML 생성
**Confidence:** HIGH (codebase 직접 검증 + GitHub API 문서 인용)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** 주 사용 케이스: 임시/이슈성 카드 (규제 발표, 금리 변동 등). 자동 주간 18시리즈와 독립 운영.
- **D-02** PNG 생성: GitHub Actions workflow_dispatch 트리거. Vercel Hobby Puppeteer 불가.
  - 흐름: 빌더 옵션 → "PNG 생성" 클릭 → Actions 트리거 → artifact ZIP 다운로드 URL 반환
  - 브라우저 미리보기: iframe srcDoc HTML 직접 렌더링 (스케일 다운)
- **D-03** AI: Groq `GROQ_API_KEY` + 모델 `llama-3.3-70b-versatile`. AI는 텍스트 창작만, 숫자는 코드 계산 후 프롬프트 주입.
- **D-04** 데이터 필터: 단지당 3건 미만 제외 / 12개월 평균 대비 200% 초과 제외 / 종료일 7일 이내 경고.
- **D-05** AI 텍스트: 수정 가능 인라인 에디터 + "재생성" 버튼.
- **D-06** 이력 저장: 없음. 생성 후 다운로드, DB 저장 없음.
- **D-07** 스케줄러 관리: `/admin/cardnews/scheduler` — enable/disable + 마지막 실행 + 수동 트리거.
- **D-08** 법적 표기: 클로징 카드 하단 "출처: 국토교통부 실거래가 공개시스템" + 면책 문구. renderClosing()에 하드코딩.
- **D-09** 빌더 옵션: 기간(주간/월간/분기/연간/직접지정) · 주제(8종) · 지역(복수선택) · 평형(4종+직접입력) · 제목 · AI 추가옵션.
- **D-10** 카드 세트: 기본 4장 [커버→하이라이트→랭킹→클로징]. 선택 시 5장 [AI 시황 카드].
- **D-11** DB: deal_type 'sale'(197,606건), 'jeonse'(57,138건), 'monthly'(40,619건). 기존 fetch-data.js는 sale만 지원.
- **D-12** 어드민 네비게이션: 기존 /admin/cardnews 유지 + 신규 /builder + /scheduler 추가.

### Claude's Discretion
- 컴포넌트 파일 분리 단위 (300~500줄 기준)
- iframe 스케일링 방식 (CSS transform scale)
- AI 프롬프트 한국어 톤 (친근한 대화체, 부동산 전문 어휘)
- Groq API 에러 시 폴백 처리 (재시도 버튼만)
- GitHub Actions artifact 만료(30일) 안내 방식

### Deferred Ideas (OUT OF SCOPE)
- Instagram Graph API 자동 업로드 (Phase 2)
- 카드 이력 DB 저장 및 조회
- on-demand Puppeteer (서버사이드 PNG, @sparticuz/chromium)
- AI 시황 카드 (5번째 카드) — 기획 완료, 구현 나중
- 월세 카드뉴스 (보증금+월세 이중 표기 복잡)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILD-01 | 데이터 집계 API (매매·전세·월세, 이상치 필터) | fetch-data.js 패턴 확장 + 신규 jeonse/신고가/변동률 쿼리 |
| BILD-02 | 카드 HTML 생성 API (templates.js 패턴 재사용) | templates.js 5개 함수 확인 완료, CDN 폰트 변형 필요 |
| BILD-03 | Groq AI 텍스트 생성 API (제목·캡션·SNS·해시태그) | hagwon.ts Groq SDK 패턴 확인 완료 |
| BILD-04 | GitHub Actions workflow_dispatch 트리거 + artifact ZIP 다운로드 | GitHub REST API 엔드포인트 정리, PAT 필요 확인 |
| BILD-05 | 빌더 UI 페이지 (옵션 패널 + iframe 미리보기 + AI 에디터 + 다운로드) | iframe srcDoc 폰트 이슈 확인, 스케일링 패턴 |
| BILD-06 | 스케줄러 관리 페이지 (enable/disable·수동 트리거·실행 이력) | GitHub API enable/disable 엔드포인트 확인 |
| BILD-07 | fetch-data.js 확장 (전세·월세·신고가·변동률 신규 쿼리) | 기존 쿼리 패턴 확인, SQL 로직 설계 완료 |
| BILD-08 | 법적 표기 강화 (모든 카드 출처 표기) | 기존 renderClosing() 확인, 문구 업데이트 필요 |
</phase_requirements>

---

## Summary

Phase 31은 어드민 콘솔(`/admin/cardnews/builder`)에 임시·이슈성 카드뉴스를 직접 생성하는 빌더를 추가하는 작업이다. 핵심 기술은 세 가지: (1) Supabase에서 실거래 데이터를 집계하고, (2) 기존 `templates.js` 패턴으로 HTML을 생성하며, (3) GitHub Actions를 API로 트리거해서 Puppeteer로 PNG를 렌더링한다.

가장 중요한 발견은 **주간 자동 생성 워크플로우 위치 문제**다. 기존 `card-news/.github/workflows/weekly-generate.yml`은 서브디렉토리에 있어 GitHub Actions가 자동으로 인식하지 못한다. Phase 31에서는 루트 `.github/workflows/custom-cardnews.yml`을 새로 만들어 HTML 페이로드 URL을 입력으로 받는 방식을 취한다.

두 번째 핵심은 **브라우저 iframe 미리보기와 Puppeteer PNG 렌더링의 폰트 처리 차이**다. `templates.js`는 `file://` URL로 Pretendard 폰트를 로드하는데, 브라우저 iframe에서는 이 경로가 동작하지 않는다. 미리보기용 HTML에는 Pretendard CDN URL을 사용하고, PNG 생성용 HTML은 기존 파일 경로 방식을 유지해야 한다.

**Primary recommendation:** Supabase Storage를 HTML 페이로드 전달 채널로 사용하고, `src/services/github-actions.ts` 어댑터를 통해 GitHub API를 호출한다. Groq API는 기존 hagwon.ts 패턴(비스트리밍)을 그대로 따른다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 데이터 집계 (매매/전세/신고가/변동률) | API / Backend | Database | 집계 쿼리는 서버사이드에서만, 클라이언트 직접 Supabase 쿼리 금지 (CLAUDE.md) |
| HTML 카드 생성 | API / Backend | — | templates.js 로직은 서버에서 실행, HTML 문자열을 클라이언트에 반환 |
| 브라우저 iframe 미리보기 | Browser / Client | — | srcDoc으로 HTML 렌더링, 서버 호출 없음 |
| AI 텍스트 생성 (Groq) | API / Backend | — | GROQ_API_KEY는 서버 환경변수, API Route에서만 호출 |
| GitHub Actions 트리거 | API / Backend | — | GITHUB_PAT 서버 환경변수, 외부 API 어댑터 (src/services/) |
| HTML 페이로드 저장 | Database / Storage | — | Supabase Storage (기존 realtor-profiles 버킷 패턴 동일) |
| PNG artifact 다운로드 | API / Backend → Browser | — | API가 인증 요청 대행 후 S3 임시 URL을 클라이언트에 반환 |
| 스케줄러 상태 조회/변경 | API / Backend | — | GitHub Actions API (enable/disable) — 서비스 어댑터 경유 |
| 어드민 권한 검증 | Frontend Server (SSR) | API / Backend | layout.tsx(페이지) + API Route 개별 가드(이중 방어) |

---

## Standard Stack

### Core (기존 프로젝트 스택, 추가 설치 없음)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| groq-sdk | ^0.x (기존) | Groq API 호출 | 프로젝트 기존 사용 (hagwon.ts 확인) [VERIFIED: codebase] |
| @supabase/supabase-js | ^2.x (기존) | DB + Storage | createSupabaseAdminClient() 패턴 기존 사용 [VERIFIED: codebase] |
| Next.js App Router | 15 (기존) | API Route Handlers | 프로젝트 스택 [VERIFIED: CLAUDE.md] |
| Puppeteer | ^23 (card-news) | PNG 캡처 (Actions 내) | 기존 capture.js 패턴 [VERIFIED: card-news/scripts/capture.js] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | ^16 (card-news) | .env 로딩 (Actions 스크립트) | card-news/ 스크립트 실행 시 [VERIFIED: card-news/package.json] |

### 추가 설치 불필요

CLAUDE.md 스택 그대로 사용. 새 npm 패키지 설치 없음.

---

## Architecture Patterns

### System Architecture Diagram

```
[Admin Browser]
    │
    ├── [1] 옵션 선택 (기간/주제/지역/평형)
    │         │
    │         ▼
    │   POST /api/admin/cardnews-builder/aggregate
    │         │ (createSupabaseAdminClient 사용)
    │         ▼
    │   [Supabase DB] transactions 쿼리
    │         │ ranking 배열 반환
    │         ▼
    │   POST /api/admin/cardnews-builder/generate-html
    │         │ templates.js renderX() 호출
    │         │ CDN 폰트 변형 적용
    │         │ 4개 HTML 문자열 반환
    │         ▼
    ├── [2] iframe srcDoc 미리보기 (브라우저 내 렌더링)
    │
    ├── [3] POST /api/admin/cardnews-builder/ai-text (선택)
    │         │ Groq llama-3.3-70b-versatile
    │         │ 제목/캡션/SNS/해시태그 반환
    │         ▼
    │   인라인 에디터 표시 + 수동 편집
    │
    ├── [4] "PNG 생성" 클릭
    │         │
    │         ▼
    │   POST /api/admin/cardnews-builder/trigger-png
    │         ├── HTML을 JSON으로 Supabase Storage 업로드
    │         │    → public URL 획득
    │         └── POST github.com API workflow_dispatch
    │              (custom-cardnews.yml, inputs.payload_url)
    │              → 204 반환, run ID 없음
    │         │ run_url 반환 (Actions 페이지 링크)
    │
    └── [5] GET /api/admin/cardnews-builder/artifact?run_id=...
              │ GitHub API: GET /runs → find latest run
              │ GET /runs/{id}/artifacts → archive_download_url
              │ GET archive_download_url (인증) → S3 redirect URL
              └── S3 임시 URL 반환 → 브라우저 직접 다운로드

[GitHub Actions custom-cardnews.yml]
    ├── payload_url 다운로드 (JSON: 4 HTML strings)
    ├── HTML 파일 기록
    ├── Puppeteer 캡처 (1080×1080 PNG × 4)
    └── upload-artifact (ZIP, 30일 보존)
```

### Recommended Project Structure

```
src/
├── app/
│   ├── admin/
│   │   └── cardnews/
│   │       ├── page.tsx           # 기존 텍스트 복사 페이지 (유지)
│   │       ├── builder/
│   │       │   └── page.tsx       # 빌더 UI (RSC shell + Client components)
│   │       └── scheduler/
│   │           └── page.tsx       # 스케줄러 관리
│   └── api/
│       └── admin/
│           └── cardnews-builder/
│               ├── aggregate/route.ts      # BILD-01
│               ├── generate-html/route.ts  # BILD-02
│               ├── ai-text/route.ts        # BILD-03
│               ├── trigger-png/route.ts    # BILD-04
│               ├── artifact/route.ts       # BILD-04
│               └── scheduler/route.ts      # BILD-06
├── components/
│   └── admin/
│       └── cardnews/
│           ├── BuilderPanel.tsx       # 옵션 폼 (Client)
│           ├── CardPreview.tsx        # iframe 미리보기 (Client)
│           ├── AiTextEditor.tsx       # AI 텍스트 인라인 에디터 (Client)
│           ├── DataQualityWarning.tsx # D-04 경고 컴포넌트 (Client)
│           └── SchedulerManager.tsx   # 스케줄러 UI (Client)
└── services/
    └── github-actions.ts             # GitHub API 어댑터 (CRITICAL)

card-news/
└── scripts/
    ├── fetch-data.js          # 기존 + jeonse/신고가/변동률 확장 (BILD-07)
    └── templates.js           # renderClosing() 법적 표기 업데이트 (BILD-08)

.github/
└── workflows/
    └── custom-cardnews.yml    # 신규: 빌더 PNG 생성 전용 워크플로우
```

---

## Critical Finding: weekly-generate.yml 위치 문제

**[VERIFIED: codebase glob]**

현재 주간 생성 워크플로우는 `card-news/.github/workflows/weekly-generate.yml`에 있다. 이 경로는 리포지토리 루트의 `.github/workflows/`가 아니므로 GitHub Actions가 자동으로 인식하지 않는다. (GitHub은 리포지토리 루트의 `.github/workflows/*.yml`만 처리함)

**영향:**
- 현재 주간 자동 생성은 GitHub Actions가 아닌 로컬 실행으로 이뤄졌을 가능성이 높음
- Phase 31에서 `workflow_dispatch` API로 트리거하려면 루트 `.github/workflows/`에 있어야 함

**해결책:**
Phase 31에서 `/.github/workflows/custom-cardnews.yml`을 새로 만든다 (빌더 전용). 기존 `card-news/.github/workflows/weekly-generate.yml`은 루트 `/.github/workflows/weekly-generate.yml`로 이동 (별도 Wave로 처리하거나 Phase 31과 동시 진행).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API 인증 호출 | 인라인 fetch + token 관리 | `src/services/github-actions.ts` 어댑터 | CLAUDE.md CRITICAL: 외부 API는 src/services/ 어댑터 전용 |
| Supabase Storage 업로드 | 직접 S3 API | createSupabaseAdminClient().storage | 기존 realtor-profiles 버킷 패턴 동일 [VERIFIED: upload-image/route.ts] |
| Groq 호출 | axios/fetch 직접 | groq-sdk (기존 설치됨) | 기존 hagwon.ts 패턴 일관성 [VERIFIED: src/app/actions/hagwon.ts] |
| 관리자 인증 | 직접 JWT 파싱 | createSupabaseServerClient() + profile.role check | 기존 어드민 패턴 일관성 [VERIFIED: admin/layout.tsx] |
| HTML→PNG 서버사이드 | Vercel에서 Puppeteer | GitHub Actions + capture.js | Vercel Hobby: Puppeteer 실행 불가 (D-02 Locked) |

**Key insight:** CLAUDE.md의 CRITICAL 규칙 — 외부 API(GitHub, Groq)는 모두 `src/services/` 어댑터를 경유해야 한다. 컴포넌트나 Route Handler에서 직접 호출 금지.

---

## Common Pitfalls

### Pitfall 1: 브라우저 iframe에서 file:// 폰트 경로 실패
**What goes wrong:** `templates.js`의 `@font-face src: url('file:///path/to/fonts/...')` → 브라우저 iframe에서 보안 정책으로 로드 실패. 폰트가 안 보임.
**Why it happens:** Puppeteer는 로컬 파일 시스템 접근 가능하지만 브라우저 iframe의 srcDoc은 파일 시스템 접근 불가.
**How to avoid:** 미리보기용 HTML 생성 함수에서 `BASE_CSS_CDN` 변형을 사용 — Pretendard CDN(`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`)으로 대체.
**Warning signs:** 미리보기에서 폰트가 system font로 fallback되어 보임.

### Pitfall 2: workflow_dispatch 후 run ID 없음
**What goes wrong:** `POST .../dispatches`는 204를 반환하고 run ID를 주지 않는다. 바로 artifact를 조회하면 아직 실행이 시작되지 않음.
**Why it happens:** GitHub API 설계 — 트리거만 하고 생성된 run 정보는 별도 엔드포인트에서 조회.
**How to avoid:** 트리거 후 클라이언트에 "실행 시작됨" 상태를 반환하고, 별도 polling 엔드포인트에서 `GET /runs?event=workflow_dispatch&branch=main` + `created_at` 기준으로 최신 run을 찾는다. 실행에 5~15분 소요될 수 있음을 UI에 표시.
**Warning signs:** "artifact not found" 오류 발생.

### Pitfall 3: 빌트인 GITHUB_TOKEN으로 외부 API 호출 불가
**What goes wrong:** Vercel에서 환경변수 `GITHUB_TOKEN`으로 workflow_dispatch를 호출하면 401 또는 권한 오류.
**Why it happens:** GitHub Actions 빌트인 `GITHUB_TOKEN`은 해당 Actions 실행 컨텍스트에서만 유효. Vercel에서 외부 API 호출 시 무효.
**How to avoid:** GitHub Personal Access Token(PAT)을 별도로 생성 — Fine-grained PAT with "Actions: write" 권한. `GITHUB_PAT` 시크릿으로 Vercel에 등록.
**Warning signs:** 401 Unauthorized 또는 422 Validation Failed 응답.

### Pitfall 4: iframe 스케일 컨테이너 크기 미처리
**What goes wrong:** `transform: scale(0.4)` 적용 시 iframe이 시각적으로 작게 보이지만 레이아웃 공간은 원래 1080px를 차지 → 주변 레이아웃이 밀려남.
**Why it happens:** CSS transform은 레이아웃 공간을 변경하지 않음.
**How to avoid:** 래퍼 div를 `width: 432px; height: 432px; overflow: hidden`으로 설정하고, iframe에 `transform: scale(0.4); transform-origin: top left`를 적용.
**Warning signs:** 미리보기 주변에 큰 빈 공간이 생김.

### Pitfall 5: Supabase Storage 버킷 public 설정 누락
**What goes wrong:** HTML 페이로드를 Supabase Storage에 업로드하고 GitHub Actions가 URL로 접근하려 하면 403 오류.
**Why it happens:** 버킷이 private인 경우 인증 없이 접근 불가.
**How to avoid:** `cardnews-payloads` 버킷을 public으로 설정하거나, signed URL(1시간 유효)을 생성해서 workflow input으로 전달. 권장: public 버킷 + 30분 후 자동 삭제 정책.
**Warning signs:** GitHub Actions 스텝에서 HTTP 403 오류.

### Pitfall 6: 이상치 200% 필터를 전체 기간 평균으로 계산해야 함
**What goes wrong:** 12개월 평균을 선택된 집계 기간 내 데이터로만 계산하면 표본이 너무 작음.
**Why it happens:** 단기 기간(주간)에는 단지당 거래가 3~5건에 불과.
**How to avoid:** 이상치 필터용 기준가는 항상 "12개월 전체 평균"으로 별도 쿼리. 집계 기간 내 거래를 이 기준으로 필터링.
**Warning signs:** 정상 가격이 필터링되거나 고가 거래가 남아있음.

### Pitfall 7: renderClosing() 법적 표기 기존 문구 불완전
**What goes wrong:** 기존 `renderClosing()`의 disclaimer: "본 자료는 국토교통부 실거래가 공개시스템 기준입니다" — D-08 요구사항("출처: 국토교통부 실거래가 공개시스템" + "본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다")과 미일치.
**Why it happens:** Phase 30에서 법적 표기 강화 미완성.
**How to avoid:** BILD-08 작업 시 `renderClosing()`을 D-08 정확한 문구로 업데이트.

---

## Code Examples

Verified patterns from codebase:

### Pattern 1: Groq SDK 호출 (기존 패턴)
```typescript
// Source: src/app/actions/hagwon.ts [VERIFIED: codebase]
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const res = await groq.chat.completions.create({
  model: 'llama-3.3-70b-versatile',  // Phase 31: D-03 Locked
  messages: [{ role: 'user', content: prompt }],
  max_tokens: 400,
  temperature: 0.7,
})
const text = res.choices[0]?.message?.content?.trim() ?? FALLBACK_TEXT
```

### Pattern 2: 어드민 권한 검증 (API Route)
```typescript
// Source: src/app/api/admin/realtors/upload-image/route.ts [VERIFIED: codebase]
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    return new Response('Forbidden', { status: 403 })
  }
  // ... 이하 로직
}
```

### Pattern 3: Supabase Storage 업로드
```typescript
// Source: src/app/api/admin/realtors/upload-image/route.ts [VERIFIED: codebase]
const adminClient = createSupabaseAdminClient()
const { data, error } = await adminClient.storage
  .from('cardnews-payloads')  // 신규 버킷
  .upload(filename, buffer, {
    contentType: 'application/json',
    cacheControl: '3600',
    upsert: false,
  })
const { data: { publicUrl } } = adminClient.storage
  .from('cardnews-payloads')
  .getPublicUrl(data.path)
```

### Pattern 4: GitHub Actions workflow_dispatch API 호출
```typescript
// Source: [CITED: docs.github.com/rest/actions/workflows]
// src/services/github-actions.ts (신규 어댑터)
export async function triggerWorkflow(params: {
  owner: string
  repo: string
  workflowId: string
  ref: string
  inputs: Record<string, string>
}): Promise<void> {
  const token = process.env.GITHUB_PAT
  if (!token) throw new Error('GITHUB_PAT not configured')

  const res = await fetch(
    `https://api.github.com/repos/${params.owner}/${params.repo}/actions/workflows/${params.workflowId}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: params.ref, inputs: params.inputs }),
    },
  )
  if (!res.ok && res.status !== 204) {
    throw new Error(`GitHub API error: ${res.status}`)
  }
}
```

### Pattern 5: GitHub Actions 실행 목록 조회 (artifact 찾기용)
```typescript
// Source: [CITED: docs.github.com/rest/actions/workflow-runs]
export async function getLatestWorkflowRun(owner: string, repo: string, workflowId: string) {
  const token = process.env.GITHUB_PAT
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs?` +
    `workflow_id=${workflowId}&event=workflow_dispatch&per_page=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    },
  )
  const json = await res.json() as { workflow_runs: WorkflowRun[] }
  return json.workflow_runs[0] ?? null  // 가장 최근 run
}
```

### Pattern 6: Artifact 다운로드 URL 획득 (S3 리다이렉트 추출)
```typescript
// Source: [CITED: docs.github.com/rest/actions/artifacts]
export async function getArtifactDownloadUrl(owner: string, repo: string, artifactId: number) {
  const token = process.env.GITHUB_PAT
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      redirect: 'manual',  // 리다이렉트를 따르지 않고 Location 헤더만 읽음
    },
  )
  // GitHub는 303 리다이렉트로 임시 S3 URL을 반환
  return res.headers.get('location')  // 인증 불필요한 S3 URL
}
```

### Pattern 7: 스케줄러 enable/disable
```typescript
// Source: [CITED: docs.github.com/rest/actions/workflows#enable-a-workflow]
export async function setWorkflowEnabled(
  owner: string, repo: string, workflowId: string, enabled: boolean
): Promise<void> {
  const action = enabled ? 'enable' : 'disable'
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/${action}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
      },
    },
  )
  if (!res.ok) throw new Error(`Failed to ${action} workflow: ${res.status}`)
}

export async function getWorkflowState(owner: string, repo: string, workflowId: string) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
      },
    },
  )
  const data = await res.json() as { state: 'active' | 'disabled_manually' | string }
  return data.state
}
```

### Pattern 8: iframe srcDoc 미리보기 (CDN 폰트 변형)
```typescript
// templates.js에 CDN 변형 추가
const BASE_CSS_PREVIEW = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
  /* ... 나머지 BASE_CSS 동일 */
`
const LOGO_PUBLIC_URL = '/logo-cardnews.png'  // Next.js public/ 또는 Supabase Storage URL

// API Route에서:
export function renderCoverForPreview(data: CoverData): string {
  return html(body, BASE_CSS_PREVIEW)  // CDN 폰트 변형
}
// Generate용은 기존 file:// 방식 유지
```

```tsx
// CardPreview.tsx
// 컨테이너 크기: 1080 * 0.4 = 432px [ASSUMED: 스케일 비율 선택, Claude Discretion]
<div style={{ width: 432, height: 432, overflow: 'hidden', position: 'relative' }}>
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
    sandbox="allow-same-origin"
  />
</div>
```

### Pattern 9: 신고가 경신 쿼리 설계
```javascript
// card-news/scripts/fetch-data.js 확장 (BILD-07)
// [ASSUMED: SQL 로직 — DB 스키마 기반 설계, 실행 전 검증 필요]
export async function fetchAllTimeHighRanking({ sggCodes, areaMin, areaMax, from, to, dealType = 'sale', limit = 10 }) {
  // 1단계: 집계 기간 내 단지별 최고가
  const { data: periodData } = await supabase
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null).is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from).lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin).lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(5000)

  // 단지별 최고가 맵
  const periodMax = new Map()
  for (const t of periodData ?? []) {
    if (!periodMax.has(t.complex_id) || t.price > periodMax.get(t.complex_id))
      periodMax.set(t.complex_id, t.price)
  }

  // 2단계: 해당 단지들의 이전 전체 기간 최고가
  const complexIds = [...periodMax.keys()]
  const { data: histData } = await supabase
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null).is('superseded_by', null)
    .eq('deal_type', dealType)
    .lt('deal_date', from)
    .in('complex_id', complexIds)
    .limit(50000)

  const histMax = new Map()
  for (const t of histData ?? []) {
    if (!histMax.has(t.complex_id) || t.price > histMax.get(t.complex_id))
      histMax.set(t.complex_id, t.price)
  }

  // 3단계: 신고가 경신 단지 필터링 (현재 > 역대 최고)
  const newHighs = [...periodMax.entries()]
    .filter(([id, curMax]) => curMax > (histMax.get(id) ?? 0))
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)

  const cmap = await fetchComplexNames(newHighs.map(([id]) => id))
  return newHighs.map(([id, price], i) => ({
    rank: i + 1,
    name: cmap.get(id)?.canonical_name ?? null,
    subtitle: cmap.get(id)?.gu ?? null,
    price: formatPrice(price),
  }))
}
```

### Pattern 10: 가격 변동률 쿼리 설계
```javascript
// [ASSUMED: SQL 로직 — DB 스키마 기반 설계]
export async function fetchPriceChangeRanking({ sggCodes, areaMin, areaMax, from, to, dealType = 'sale', limit = 10 }) {
  const durationMs = new Date(to) - new Date(from)
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo.getTime() - durationMs)

  async function fetchPeriodAvg(periodFrom, periodTo) {
    const { data } = await supabase
      .from('transactions')
      .select('complex_id, price')
      .is('cancel_date', null).is('superseded_by', null)
      .eq('deal_type', dealType)
      .gte('deal_date', periodFrom.toISOString().slice(0, 10))
      .lte('deal_date', periodTo.toISOString().slice(0, 10))
      .in('sgg_code', sggCodes)
      .gte('area_m2', areaMin).lte('area_m2', areaMax)
      .not('complex_id', 'is', null)
      .limit(5000)

    const map = new Map()
    for (const t of data ?? []) {
      const cur = map.get(t.complex_id) ?? { sum: 0, count: 0 }
      map.set(t.complex_id, { sum: cur.sum + t.price, count: cur.count + 1 })
    }
    return map
  }

  const [curMap, prevMap] = await Promise.all([
    fetchPeriodAvg(new Date(from), new Date(to)),
    fetchPeriodAvg(prevFrom, prevTo),
  ])

  const changes = []
  for (const [id, cur] of curMap) {
    if (cur.count < 3) continue  // 3건 미만 제외 (D-04)
    const prev = prevMap.get(id)
    if (!prev || prev.count < 3) continue
    const changePct = ((cur.sum / cur.count) - (prev.sum / prev.count)) / (prev.sum / prev.count) * 100
    changes.push({ id, changePct, curAvg: cur.sum / cur.count })
  }

  const sorted = changes.sort((a, b) => b.changePct - a.changePct).slice(0, limit)
  const cmap = await fetchComplexNames(sorted.map((s) => s.id))

  return sorted.map((s, i) => ({
    rank: i + 1,
    name: cmap.get(s.id)?.canonical_name ?? null,
    subtitle: cmap.get(s.id)?.gu ?? null,
    price: `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%`,
    priceUnit: '',
  }))
}
```

### Pattern 11: 이상치 필터 (200% 초과 제거)
```javascript
// [VERIFIED: D-04 Locked 결정 기반 로직]
async function filterOutliers(transactions, dealType) {
  // 12개월 평균 계산 (기준가)
  const complexIds = [...new Set(transactions.map(t => t.complex_id))]
  const twelveMonthsAgo = new Date(); twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  const { data: historical } = await supabase
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null).is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', twelveMonthsAgo.toISOString().slice(0, 10))
    .in('complex_id', complexIds)
    .limit(50000)

  const avgMap = new Map()
  const sumMap = new Map()
  for (const t of historical ?? []) {
    const cur = sumMap.get(t.complex_id) ?? { sum: 0, count: 0 }
    sumMap.set(t.complex_id, { sum: cur.sum + t.price, count: cur.count + 1 })
  }
  for (const [id, { sum, count }] of sumMap) {
    avgMap.set(id, sum / count)
  }

  return transactions.filter(t => {
    const avg = avgMap.get(t.complex_id)
    if (!avg) return true  // 평균 데이터 없으면 유지
    return t.price <= avg * 2  // 200% 초과 제외
  })
}
```

### Pattern 12: 데이터 완결성 경고 컴포넌트
```tsx
// DataQualityWarning.tsx [ASSUMED: 컴포넌트 설계, D-04 기준]
interface DataQualityWarningProps {
  periodEnd: string  // 'YYYY-MM-DD'
}

export function DataQualityWarning({ periodEnd }: DataQualityWarningProps) {
  const daysUntilNow = Math.ceil(
    (new Date().getTime() - new Date(periodEnd).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysUntilNow > 7) return null

  return (
    <div role="alert" aria-live="polite" style={{ /* 경고 스타일 */ }}>
      데이터가 완전하지 않을 수 있습니다. (종료일: {periodEnd}, {daysUntilNow}일 경과)
    </div>
  )
}
```

### Pattern 13: custom-cardnews.yml (신규 워크플로우)
```yaml
# .github/workflows/custom-cardnews.yml [CITED: weekly-generate.yml 패턴 기반]
name: Custom Card News (Builder)

on:
  workflow_dispatch:
    inputs:
      payload_url:
        description: 'URL to JSON payload with HTML card strings'
        type: string
        required: true
      series_id:
        description: 'Unique series identifier for artifact naming'
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

      - name: Install Chromium system dependencies
        run: sudo apt-get install -y libgbm-dev libxss1 libasound2t64 libatk-bridge2.0-0 libgtk-3-0

      - name: Install dependencies
        run: npm ci

      - name: Cache Pretendard fonts
        uses: actions/cache@v4
        with:
          path: card-news/fonts
          key: pretendard-1.3.9

      - name: Download Pretendard fonts
        run: node scripts/setup.js

      - name: Download HTML payload
        run: |
          curl -f -o payload.json "${{ inputs.payload_url }}"

      - name: Generate PNG from payload
        run: node scripts/generate-from-payload.js --payload=payload.json --series=${{ inputs.series_id }}

      - name: Upload PNG artifacts
        uses: actions/upload-artifact@v4
        with:
          name: custom-card-${{ inputs.series_id }}-${{ github.run_id }}
          path: card-news/output/
          retention-days: 30
```

---

## GitHub API 엔드포인트 정리

[CITED: docs.github.com/en/rest/actions]

| 목적 | Method | Endpoint | 인증 | 응답 |
|------|--------|----------|------|------|
| 워크플로우 트리거 | POST | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` | Bearer PAT | 204 (body 없음) |
| 최근 실행 목록 | GET | `/repos/{owner}/{repo}/actions/runs?workflow_id={id}&event=workflow_dispatch&per_page=5` | Bearer PAT | JSON runs[] |
| 실행 artifacts | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` | Bearer PAT | JSON artifacts[] |
| artifact ZIP 다운로드 | GET | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip` | Bearer PAT | 302/303 redirect → S3 URL |
| 워크플로우 활성화 | PUT | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable` | Bearer PAT | 204 |
| 워크플로우 비활성화 | PUT | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable` | Bearer PAT | 204 |
| 워크플로우 상태 조회 | GET | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}` | Bearer PAT | JSON { state } |

**PAT 권한 요구사항 [CITED: docs.github.com/en/rest/actions]:**
- Fine-grained PAT: "Actions: write" + "Metadata: read"
- Classic PAT: `workflow` scope

---

## fetch-data.js 확장 설계 (BILD-07)

현재 지원 (sale만): `fetchAreaRanking`, `fetchCityRanking`, `fetchVolumeRanking`, `fetchValueRanking`, `fetchDistrictChampions`

추가 필요:

| 함수명 | 주제 | 설명 |
|--------|------|------|
| `fetchJeonseRanking` | 전세최고가 | fetchAreaRanking/fetchCityRanking와 동일하되 `deal_type='jeonse'` |
| `fetchAllTimeHighRanking` | 신고가경신 | 집계 기간 내 최고가 > 이전 전체 기간 최고가 (Pattern 9 참조) |
| `fetchPriceChangeRanking` | 가격변동률 | 이번 기간 평균 vs 직전 동일 기간 평균 비교 (Pattern 10 참조) |

**월세 카드뉴스는 Deferred** (CONTEXT.md deferred 항목).

---

## 기간 옵션 계산 로직

| 기간 옵션 | from | to |
|-----------|------|----|
| 주간(지난주) | 지난 주 월요일 | 지난 주 일요일 |
| 월간 | 이번 달 1일 | 어제 |
| 분기 | 이번 분기 시작일 | 어제 |
| 연간 | 올해 1월 1일 | 어제 |
| 직접지정 | 사용자 입력 | 사용자 입력 |

기존 `getLastWeekRange()` 확장: 기간 타입 파라미터를 받아 해당 범위 반환하는 `getDateRange(type, customFrom?, customTo?)` 함수로 교체.

---

## 어드민 사이드바 업데이트

현재 `AdminSidebar.tsx`의 `buildNavItems()`에 `{ label: '카드뉴스', href: '/admin/cardnews' }` 한 항목만 있음. [VERIFIED: src/components/admin/AdminSidebar.tsx]

D-12에 따라 3개 항목으로 확장:
```typescript
{ label: '카드뉴스 (텍스트)', href: '/admin/cardnews' },
{ label: '카드뉴스 빌더', href: '/admin/cardnews/builder' },
{ label: '카드뉴스 스케줄러', href: '/admin/cardnews/scheduler' },
```

---

## renderClosing() 법적 표기 업데이트 (BILD-08)

현재 문구 [VERIFIED: card-news/scripts/templates.js]:
```
본 자료는 국토교통부 실거래가 공개시스템 기준입니다. 투자 판단의 최종 책임은 본인에게 있습니다.
```

D-08 요구 문구:
```
출처: 국토교통부 실거래가 공개시스템
본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다
```

두 문구를 클로징 카드 하단에 하드코딩 (제거 불가). `renderClosing()`에 `source` 파라미터 전달 방식 유지.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| groq-sdk | BILD-03 | ✓ | 기존 설치 | — |
| @supabase/supabase-js | BILD-01, 04 | ✓ | ^2.x | — |
| Puppeteer | BILD-04 (Actions) | ✓ (ubuntu) | ^23 (card-news) | — |
| GROQ_API_KEY | BILD-03 | [ASSUMED] | — | MEMORY에 "GROQ 키 재발급 필요" 주의 표시 |
| GITHUB_PAT | BILD-04, 06 | ✗ (미등록) | — | 신규 생성 필요 |
| Supabase Storage | BILD-04 | ✓ (기존 사용) | — | — |
| Pretendard CDN | BILD-05 (preview) | ✓ (public CDN) | 1.3.9 | system font fallback |

**Missing dependencies with no fallback:**
- `GITHUB_PAT`: GitHub Personal Access Token 신규 생성 필요 ("Actions: write" 권한). Vercel 환경변수에 등록.

**Missing dependencies with fallback:**
- `GROQ_API_KEY`: MEMORY 주의 메모에 "재발급 필요" — AI 기능만 비활성화되고 빌더 나머지 기능은 동작. 실행 전 키 재발급 확인 필요.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (기존 프로젝트) |
| Config file | vitest.config.ts (기존) |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILD-01 | 집계 함수 — 3건 미만 제외, 200% 필터 | unit | `npm run test -- --run src/lib/data/cardnews-aggregate.test.ts` | ❌ Wave 0 |
| BILD-02 | HTML 생성 — 4장 반환, 법적 표기 포함 | unit | `npm run test -- --run src/lib/data/cardnews-builder.test.ts` | ❌ Wave 0 |
| BILD-03 | Groq API — 폴백 처리, 빈 키 시 FALLBACK | unit (mock) | `npm run test -- --run src/services/github-actions.test.ts` | ❌ Wave 0 |
| BILD-04 | GitHub API adapter — dispatch, artifact URL | unit (mock fetch) | `npm run test -- --run src/services/github-actions.test.ts` | ❌ Wave 0 |
| BILD-05 | iframe 스케일 컴포넌트 렌더 | visual/manual | manual | — |
| BILD-06 | 스케줄러 enable/disable toggle | unit (mock) | 포함 in github-actions.test.ts | ❌ Wave 0 |
| BILD-07 | 신고가 경신 쿼리 — 이전 최고가 초과 로직 | unit | `npm run test -- --run card-news/scripts/fetch-data.test.js` | ❌ Wave 0 |
| BILD-08 | renderClosing() — 법적 표기 2개 문구 포함 | unit | templates.test.js | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/lib/data/cardnews-aggregate.test.ts` — BILD-01 이상치 필터 로직
- [ ] `src/lib/data/cardnews-builder.test.ts` — BILD-02 HTML 생성 검증
- [ ] `src/services/github-actions.test.ts` — BILD-03, 04, 06 GitHub/Groq 어댑터
- [ ] `card-news/scripts/fetch-data.test.js` — BILD-07 신규 쿼리 함수

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | createSupabaseServerClient() + profile.role 검증 (API Route 레벨) |
| V4 Access Control | yes | admin/superadmin role만 허용 — layout.tsx(페이지) + API Route(이중 가드) |
| V5 Input Validation | yes | Zod — 기간/지역/평형 입력 검증 (Server Action 패턴 준용) |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 비인가 GitHub API 트리거 | Elevation of Privilege | API Route 어드민 권한 가드 필수 |
| GITHUB_PAT 노출 | Information Disclosure | 서버 환경변수 전용, 클라이언트 컴포넌트 import 절대 금지 |
| HTML 인젝션 (AI 텍스트 → 카드) | Tampering | AI 생성 텍스트를 DOM textContent로만 삽입 (innerHTML 금지) |
| Supabase Storage 공개 URL 악용 | Tampering | 페이로드 버킷에 업로드 크기 제한 + 30분 TTL signed URL 사용 권장 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Groq GROQ_API_KEY가 유효하게 재발급되었다 | Environment Availability | AI 기능 전체 비작동. 실행 전 키 확인 필수 |
| A2 | 신고가 경신 쿼리 (2단계 조회) 성능이 허용 범위 내 | fetch-data.js 확장 | 이전 전체 기간 조회 시 데이터가 많아 timeout 가능. 12개월로 한정 필요할 수 있음 |
| A3 | Supabase Storage `cardnews-payloads` 버킷 신규 생성 필요 | Supabase Storage 패턴 | 버킷 없으면 업로드 실패. Wave 0에서 버킷 생성 확인 필요 |
| A4 | `card-news/.github/workflows/weekly-generate.yml`이 현재 GitHub Actions에서 실행 안 됨 | Critical Finding | 만약 루트에 복사본이 있다면 중복 workflow 문제 |
| A5 | GITHUB_PAT Fine-grained PAT "Actions: write" 권한으로 weekly-generate.yml(루트 이동 후) 트리거 가능 | GitHub API 엔드포인트 | 권한 범위 불충분 시 422 오류 |
| A6 | iframe `sandbox="allow-same-origin"` 설정으로 CDN 폰트 로드 가능 | iframe 패턴 | sandbox 제약 따라 CDN 접근 차단될 수 있음. `sandbox=""` 제거 또는 `allow-scripts` 추가 필요 가능성 |

---

## Open Questions

1. **weekly-generate.yml 루트 이동 여부**
   - 알고 있는 것: 현재 `card-news/.github/workflows/`에 있어 GitHub Actions 자동 실행 안 됨
   - 불분명: Phase 30에서 72 PNG를 어떻게 생성했는지 (로컬? 임시 루트 배치?)
   - 권장: Phase 31 Wave 0에서 루트 `.github/workflows/weekly-generate.yml`로 이동하면서 custom-cardnews.yml도 함께 생성

2. **GROQ_API_KEY 재발급 상태**
   - MEMORY에 "⚠️ GROQ 키 재발급 필요" 표시
   - Phase 31 실행 전 키 상태 확인 필수

3. **가격변동률 쿼리 직전 기간 데이터 부족**
   - 주간 선택 시 직전 주 거래가 0건인 단지가 많을 수 있음
   - 권장: 비교 기간 거래 3건 미만 단지는 변동률 계산 제외 + UI에 "비교 데이터 부족 단지 제외됨" 안내

---

## Project Constraints (from CLAUDE.md)

- **CRITICAL**: GitHub Actions 어댑터는 반드시 `src/services/github-actions.ts`에 → 컴포넌트/Route에서 직접 fetch 호출 금지
- **CRITICAL**: Supabase 쿼리는 서버 컴포넌트/API Route에서만 → 클라이언트 컴포넌트 직접 쿼리 금지
- **CRITICAL**: 거래 조회: `WHERE cancel_date IS NULL AND superseded_by IS NULL` 필수
- UI 금지: backdrop-blur · gradient-text · glow · 보라/인디고 · gradient orb
- 애니메이션: compositor 속성만 (`transform`, `opacity`, `clip-path`)
- Semantic HTML 우선
- Server Action 우선 (mutation). REST Route는 외부 노출 필요 시만
- 파일 크기: 최대 800줄 (컴포넌트 분리 기준)
- TDD: 테스트 먼저 작성

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: card-news/scripts/fetch-data.js] — 기존 5개 집계 함수 패턴
- [VERIFIED: card-news/scripts/templates.js] — 4개 카드 렌더 함수 + BASE_CSS
- [VERIFIED: card-news/scripts/capture.js] — Puppeteer 캡처 패턴
- [VERIFIED: card-news/.github/workflows/weekly-generate.yml] — 기존 워크플로우 구조
- [VERIFIED: src/app/actions/hagwon.ts] — Groq SDK 사용 패턴
- [VERIFIED: src/app/admin/layout.tsx] — 어드민 권한 검증 패턴
- [VERIFIED: src/app/api/admin/realtors/upload-image/route.ts] — Supabase Storage 업로드 패턴
- [VERIFIED: src/components/admin/AdminSidebar.tsx] — 사이드바 nav 구조

### Secondary (MEDIUM confidence)
- [CITED: docs.github.com/en/rest/actions/workflows] — workflow_dispatch, enable/disable API
- [CITED: docs.github.com/en/rest/actions/workflow-runs] — runs 목록 조회
- [CITED: docs.github.com/en/rest/actions/artifacts] — artifact 다운로드 (302 redirect → S3)

### Tertiary (LOW — assumed)
- 신고가 경신/가격변동률 쿼리 로직 — DB 스키마 기반 설계, 실제 실행 전 검증 필요
- iframe sandbox 설정 상세 동작 — 브라우저별 차이 있을 수 있음

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 기존 codebase 직접 검증
- Architecture: HIGH — 기존 패턴 + GitHub API 문서
- Pitfalls: HIGH — codebase 검증으로 실제 문제 식별
- New Query Logic: MEDIUM — DB 스키마 기반 설계, 실행 전 검증 필요

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (GitHub API 안정적, 30일)
