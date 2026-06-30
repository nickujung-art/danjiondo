---
phase: 31-admin-cardnews-builder
verified: 2026-06-25T09:30:00Z
status: human_needed
score: 29/30 must-haves verified
overrides_applied: 0
human_verification:
  - test: "빌더 전체 흐름 — 기간·주제·지역·평형 선택 후 '데이터 조회' 클릭"
    expected: "iframe 미리보기에 4장 카드 HTML이 시각적으로 정상 렌더링된다"
    why_human: "iframe srcDoc + CDN 폰트 로드는 실제 브라우저에서만 확인 가능. 폰트 로딩 실패·레이아웃 깨짐 여부를 코드만으로 검증 불가"
  - test: "'AI 생성' 버튼 클릭 → GROQ_API_KEY 설정 확인"
    expected: "제목·캡션·인사이트·SNS캡션·해시태그가 채워지고 각 textarea에서 편집 가능하다"
    why_human: "GROQ_API_KEY 환경변수가 Vercel에 설정되어 있어야 동작. 설정 여부와 실제 Groq 응답 품질은 배포 환경에서만 검증 가능"
  - test: "npm run build 실행"
    expected: "빌드 오류 없이 통과. SUMMARY에서 PASSED 주장. /admin/cardnews/builder + /admin/cardnews/scheduler 동적 라우트로 빌드됨"
    why_human: "TypeScript strict 검사·Next.js 빌드를 로컬 개발 환경에서 직접 실행해야 확인 가능"
  - test: "PNG 생성 트리거 → GITHUB_PAT 설정 확인"
    expected: "ExportPanel의 'PNG 생성 트리거' 클릭 시 GitHub Actions run_url이 반환되고 Actions 실행이 시작된다"
    why_human: "GITHUB_PAT Vercel 환경변수 설정 여부와 custom-cardnews.yml 실제 dispatch 성공 여부는 배포 후 확인 필요"
  - test: "/admin/cardnews/scheduler 페이지에서 enable/disable 토글"
    expected: "토글 후 weekly-generate.yml의 GitHub Actions 상태가 실제로 변경된다"
    why_human: "GitHub API 연동은 GITHUB_PAT 설정 및 Fine-grained PAT 권한(Actions read/write) 확인 필요"
---

# Phase 31: 어드민 카드뉴스 빌더 Verification Report

**Phase Goal:** 어드민이 임시/이슈성 카드뉴스를 직접 생성할 수 있는 빌더를 어드민 콘솔에 추가한다. 기존 GitHub Actions 자동 주간 생성은 유지하되, 빌더는 특별 카드를 만드는 보완 도구. 별도 메뉴로 자동 배포 스케줄러 on/off 관리 기능도 추가.
**Verified:** 2026-06-25T09:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### ROADMAP Success Criteria Mapping

| # | Success Criteria | Status | Evidence |
|---|-----------------|--------|----------|
| 1 | `/admin/cardnews/builder` 기간·주제·지역·평형 선택 → 랭킹 데이터 반환 | ✓ VERIFIED | BuilderOptionsPanel (5기간·8주제·7지역·5평형) + CardNewsBuilderClient API fetch 확인 |
| 2 | 빌더 카드 HTML이 iframe 미리보기에 정상 렌더링 | ? HUMAN | srcDoc + scale(0.4) 코드 확인됨. 실제 렌더링은 브라우저 확인 필요 |
| 3 | AI 텍스트 생성 버튼 → 제목·캡션·SNS·해시태그 생성 및 수정 가능 | ? HUMAN | Groq API 코드 확인됨. GROQ_API_KEY 환경변수 설정 + 실제 동작은 배포 확인 필요 |
| 4 | PNG 생성 버튼 → GitHub Actions workflow_dispatch 트리거 | ? HUMAN | triggerWorkflow 코드 wired 확인. GITHUB_PAT 설정 + 실제 Actions 트리거는 배포 확인 필요 |
| 5 | `/admin/cardnews/scheduler` enable/disable + 수동 트리거 | ? HUMAN | setWorkflowEnabled/triggerWorkflow 코드 확인. 실제 GitHub API 연동은 배포 확인 필요 |
| 6 | 모든 카드에 "출처: 국토교통부 실거래가 공개시스템" 표기 | ✓ VERIFIED | templates.js renderClosing/renderClosingPreview + card-templates.ts renderClosingPreview 모두 포함 |
| 7 | `npm run lint && npm run build` 통과 | ? HUMAN | SUMMARY 모든 wave에서 PASSED 주장. 로컬 실행 필요 |

### Observable Truths

**Wave 1 (card-news scripts)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | fetchJeonseRanking, fetchMonthlyRanking, fetchAllTimeHighRanking, fetchPriceChangeRanking가 export된다 | ✓ VERIFIED | `card-news/scripts/fetch-data.js` lines 335, 387, 439, 515 — 모두 존재 |
| 2 | getDateRange(type)가 weekly/monthly/quarterly/yearly/custom을 처리한다 | ✓ VERIFIED | `fetch-data.js` line 29 — 5개 타입 분기 확인 |
| 3 | filterOutliers()가 12개월 평균가 200% 초과를 제거한다 (D-04) | ✓ VERIFIED | `fetch-data.js` line 325: `t.price <= avg * 2` |
| 4 | renderClosing()에 D-08 법적 표기 2줄 하드코딩 | ✓ VERIFIED | `templates.js` lines 396-397, 613-614 + "D-08 LOCKED" 주석 lines 400, 617 |
| 5 | BASE_CSS_PREVIEW가 Pretendard CDN URL 사용 | ✓ VERIFIED | `templates.js` line 43: `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9` |
| 6 | .github/workflows/weekly-generate.yml이 루트에 존재 | ✓ VERIFIED | 파일 존재 확인. cron schedule + workflow_dispatch 포함 |
| 7 | .github/workflows/custom-cardnews.yml이 payload_url + series_id 입력 수신, 30일 artifact | ✓ VERIFIED | `workflow_dispatch` inputs: payload_url(required), series_id. `retention-days: 30` 확인 |
| 8 | generate-from-payload.js가 JSON 페이로드로 4장 PNG 생성 | ✓ VERIFIED | `card-news/scripts/generate-from-payload.js` — captureCard로 01-cover, 02-highlight, 03-ranking, 04-closing 생성 |

**Wave 2 (backend services + API routes)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 9 | POST /api/admin/cardnews/data가 기간·주제·지역·평형으로 랭킹 반환 | ⚠ PARTIAL | sale_top/jeonse_top/monthly_top/alltime_high/price_change 5개 구현. volume/value/district_champions 3개는 빈 배열 반환 (주석: "추후 확장") |
| 10 | 데이터 API가 3건 미만 제외 + 200% 이상치 필터 | ✓ VERIFIED | `data/route.ts` line 138: `avg * 2`, line 213: `countMap.get(id) >= 3` |
| 11 | POST /api/admin/cardnews/generate-html가 CDN 폰트 4장 HTML 반환 | ✓ VERIFIED | `generate-html/route.ts` — card-templates.ts 4개 함수 import + {html: {cover, highlight, ranking, closing}} 반환 |
| 12 | POST /api/admin/cardnews/ai-text가 Groq로 텍스트 생성 | ✓ VERIFIED | `ai-text/route.ts` line 118: `llama-3.3-70b-versatile`, Groq API call 확인 |
| 13 | AI API가 Groq 실패 시 fallback:true 반환 (500 없음) | ✓ VERIFIED | `ai-text/route.ts` line 147: `return NextResponse.json({ ...FALLBACK, fallback: true })` |
| 14 | 모든 API Route가 401/403 반환 | ✓ VERIFIED | data/route.ts lines 393, 406. ai-text/route.ts lines 51, 64 확인 |
| 15 | GITHUB_PAT는 process.env만 접근, 응답 body 미포함 | ✓ VERIFIED | `github-actions.ts` line 10: `getToken()` helper — 응답에 PAT 미포함 |

**Wave 3 (Actions 트리거·스케줄러 API)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 16 | POST /api/admin/cardnews/trigger-actions가 HTML→Storage 업로드 + Actions 트리거 | ✓ VERIFIED | `trigger-actions/route.ts` — cardnews-payloads 업로드 + triggerWorkflow 호출 확인 |
| 17 | GET /api/admin/cardnews/artifact가 ZIP 다운로드 URL 반환 | ✓ VERIFIED | `artifact/route.ts` — getArtifactDownloadUrl 호출, 30일 만료 안내 포함 |
| 18 | GET /api/admin/cardnews/scheduler가 state + 최근 실행 반환 | ✓ VERIFIED | `scheduler/route.ts` — getWorkflowState + getLatestWorkflowRun, nextScheduledRun 계산 |
| 19 | PUT /api/admin/cardnews/scheduler가 weekly-generate.yml enable/disable | ✓ VERIFIED | `scheduler/route.ts` line 71: `setWorkflowEnabled(GH_OWNER, GH_REPO, WEEKLY_WORKFLOW_ID, enabled)` |
| 20 | POST /api/admin/cardnews/scheduler가 수동 트리거 | ✓ VERIFIED | `scheduler/route.ts` — POST handler에서 triggerWorkflow 호출 확인 |
| 21 | 모든 Route 401/403 반환 | ✓ VERIFIED | getAdminGuard() 헬퍼 패턴으로 3개 핸들러 공통 적용 |
| 22 | GITHUB_PAT 서버 환경변수 전용, 응답 body 미포함 | ✓ VERIFIED | 서비스 어댑터 경유 (github-actions.ts getToken()) — 직접 노출 없음 |

**Wave 4 (UI)**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 23 | /admin/cardnews/builder에서 옵션 선택 + '데이터 조회' 랭킹 불러오기 | ✓ VERIFIED | BuilderOptionsPanel (5기간·8주제·7지역·5평형) + CardNewsBuilderClient 순차 fetch |
| 24 | 4장 미리보기가 iframe srcDoc + scale(0.4) 432px 컨테이너에 표시 | ✓ VERIFIED | BuilderPreviewPanel.tsx — `srcDoc={html}`, `transform: 'scale(0.4)'`, width/height 1080 확인 |
| 25 | AI 텍스트 생성 후 인라인 편집 가능 | ✓ VERIFIED | AiTextEditor.tsx — textarea onChange, fallback 상태 처리 확인 |
| 26 | PNG 생성 트리거가 run_url 응답 | ✓ VERIFIED | ExportPanel.tsx — trigger-actions POST, runUrl 상태 관리, pollArtifact 30초×20회 |
| 27 | /admin/cardnews/scheduler가 별도 페이지로 스케줄러 관리 | ✓ VERIFIED | scheduler/page.tsx RSC auth guard + SchedulerPanel (GET/PUT/POST scheduler API 소비) |
| 28 | 어드민 사이드바에 카드뉴스 목록·빌더·스케줄러 3개 항목 | ✓ VERIFIED | AdminSidebar.tsx lines 25-27 — '카드뉴스 목록', '카드뉴스 빌더', '스케줄러' |
| 29 | DataQualityWarning가 7일 이내 데이터 경고 표시 | ✓ VERIFIED | DataQualityWarning.tsx — 7일 이내 경고 + 3건 미만 경고 |
| 30 | CLAUDE.md UI 금지 항목 없음 (backdrop-blur, gradient-text, glow, 보라/인디고) | ✓ VERIFIED | `src/components/admin/cardnews/` 전체 grep — 0 matches |

**Score: 29/30 truths verified** (1 PARTIAL: data API volume/value/district_champions 빈 배열 반환)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `card-news/scripts/fetch-data.js` | 6개 신규 함수 export | ✓ VERIFIED | getDateRange, filterOutliers, fetchJeonseRanking, fetchMonthlyRanking, fetchAllTimeHighRanking, fetchPriceChangeRanking |
| `card-news/scripts/templates.js` | D-08 + CDN CSS + 4 Preview 함수 | ✓ VERIFIED | BASE_CSS_PREVIEW + renderCoverPreview/renderHighlightPreview/renderRankingPreview/renderClosingPreview |
| `card-news/scripts/generate-from-payload.js` | payload→4장 PNG | ✓ VERIFIED | captureCard 4회 호출, output/{series}/ 경로 |
| `.github/workflows/weekly-generate.yml` | 루트 위치 GitHub Actions 인식 | ✓ VERIFIED | 루트 .github/workflows/ 에 존재 |
| `.github/workflows/custom-cardnews.yml` | workflow_dispatch + 30일 artifact | ✓ VERIFIED | payload_url required input, retention-days: 30 |
| `src/services/github-actions.ts` | 6개 GitHub API 함수 + GITHUB_PAT guard | ✓ VERIFIED | triggerWorkflow, getLatestWorkflowRun, getRunArtifacts, getArtifactDownloadUrl, setWorkflowEnabled, getWorkflowState |
| `src/lib/cardnews/card-templates.ts` | CDN 폰트 + D-08 + 4 렌더 함수 | ✓ VERIFIED | 전체 구현 (stub 없음). renderHighlightPreview + renderRankingPreview 완전한 HTML/CSS |
| `src/app/api/admin/cardnews/data/route.ts` | 집계 API 401/403 + 이상치 필터 | ⚠ PARTIAL | 5/8 topics 구현. volume/value/district_champions 빈 배열 반환 |
| `src/app/api/admin/cardnews/generate-html/route.ts` | 4장 HTML 생성 | ✓ VERIFIED | card-templates.ts 4개 함수 wired |
| `src/app/api/admin/cardnews/ai-text/route.ts` | Groq + fallback:true | ✓ VERIFIED | llama-3.3-70b-versatile, fallback:true on Groq failure |
| `src/app/api/admin/cardnews/trigger-actions/route.ts` | Storage 업로드 + Actions 트리거 | ✓ VERIFIED | cardnews-payloads 버킷 + triggerWorkflow |
| `src/app/api/admin/cardnews/artifact/route.ts` | ZIP URL 반환 | ✓ VERIFIED | getArtifactDownloadUrl, 30일 만료 안내 |
| `src/app/api/admin/cardnews/scheduler/route.ts` | GET/PUT/POST 3개 핸들러 | ✓ VERIFIED | setWorkflowEnabled + getWorkflowState + triggerWorkflow |
| `src/components/admin/cardnews/BuilderPreviewPanel.tsx` | iframe srcDoc + scale(0.4) | ✓ VERIFIED | srcDoc={html}, transform: 'scale(0.4)', 1080px dimensions |
| `src/app/admin/cardnews/builder/page.tsx` | RSC auth guard | ✓ VERIFIED | createSupabaseServerClient + role check + redirect |
| `src/app/admin/cardnews/scheduler/page.tsx` | RSC auth guard | ✓ VERIFIED | createSupabaseServerClient + role check + redirect |
| `src/components/admin/AdminSidebar.tsx` | 3 nav items 추가 | ✓ VERIFIED | lines 25-27: 카드뉴스 목록/빌더/스케줄러 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `custom-cardnews.yml` | `generate-from-payload.js` | `node scripts/generate-from-payload.js` | ✓ WIRED | yml line 53 확인 |
| `templates.js` | D-08 법적 표기 | 하드코딩 (D-08 LOCKED 주석) | ✓ WIRED | renderClosing + renderClosingPreview 양쪽 |
| `data/route.ts` | Supabase transactions | `cancel_date IS NULL AND superseded_by IS NULL` | ✓ WIRED | 모든 쿼리 조건 포함 |
| `generate-html/route.ts` | `card-templates.ts` | `from '@/lib/cardnews/card-templates'` | ✓ WIRED | 4개 renderPreview 함수 import |
| `ai-text/route.ts` | Groq API | `groq.chat.completions.create` | ✓ WIRED | llama-3.3-70b-versatile |
| `trigger-actions/route.ts` | Supabase Storage (cardnews-payloads) | `adminClient.storage.from('cardnews-payloads').upload()` | ✓ WIRED | 업로드 + publicUrl 획득 |
| `trigger-actions/route.ts` | GitHub Actions custom-cardnews.yml | `triggerWorkflow()` from @/services/github-actions | ✓ WIRED | payload_url + series_id inputs 전달 |
| `scheduler/route.ts` | GitHub Actions weekly-generate.yml | `setWorkflowEnabled` / `getWorkflowState` | ✓ WIRED | WEEKLY_WORKFLOW_ID = 'weekly-generate.yml' |
| `BuilderPreviewPanel.tsx` | API generate-html | fetch POST (CardNewsBuilderClient 경유) | ✓ WIRED | CardNewsBuilderClient가 generate-html API 호출 후 htmlCards 전달 |
| `ExportPanel.tsx` | API trigger-actions | fetch POST '/api/admin/cardnews/trigger-actions' | ✓ WIRED | line 57 확인 |
| `SchedulerPanel.tsx` | API scheduler | fetch GET/PUT/POST '/api/admin/cardnews/scheduler' | ✓ WIRED | line 56 (PUT) 확인 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `BuilderPreviewPanel.tsx` | `htmlCards` | CardNewsBuilderClient → generate-html API → card-templates.ts | Yes (real HTML 생성) | ✓ FLOWING |
| `card-templates.ts renderClosingPreview` | D-08 disclaimer | 하드코딩 상수 | Yes (법적 표기 고정값) | ✓ FLOWING |
| `data/route.ts` (sale_top) | `result` | Supabase transactions (cancel_date IS NULL, superseded_by IS NULL) | Yes (실거래 DB 쿼리) | ✓ FLOWING |
| `data/route.ts` (volume/value/district_champions) | `result` | — (구현 없음) | No (빈 배열 반환) | ⚠ STATIC |

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| fetch-data.js 신규 exports 존재 | `grep -c "export.*fetch\|getDateRange\|filterOutliers"` | 6개 모두 확인 | ✓ PASS |
| templates.js D-08 disclaimer | `grep "국토교통부 실거래가 공개시스템"` | lines 396, 613 (양쪽) | ✓ PASS |
| custom-cardnews.yml workflow_dispatch | 파일 직접 확인 | payload_url required + retention-days: 30 | ✓ PASS |
| AdminSidebar 3 nav items | `grep "builder\|scheduler\|카드뉴스"` | lines 25-27 확인 | ✓ PASS |
| CLAUDE.md UI 금지 패턴 | `grep "backdrop-blur\|gradient-text\|glow\|purple\|indigo"` | 0 matches | ✓ PASS |
| `npm run build` | (실행 불가) | SUMMARY: PASSED — 검증 불가 | ? SKIP |

### Requirements Coverage

| Requirement | Status | Evidence |
|------------|--------|----------|
| BILD-01: 데이터 API (기간·주제·지역·평형, 이상치 필터) | ⚠ PARTIAL | 5/8 topics 구현. volume/value/district_champions 미구현 |
| BILD-02: HTML 생성 API (4장) | ✓ SATISFIED | generate-html/route.ts → card-templates.ts 4개 함수 |
| BILD-03: AI 텍스트 API (Groq, fallback) | ✓ SATISFIED | ai-text/route.ts — llama-3.3-70b-versatile, fallback:true |
| BILD-04: GitHub Actions 트리거 API | ✓ SATISFIED | trigger-actions/route.ts + artifact/route.ts |
| BILD-05: 빌더 UI 페이지 | ✓ SATISFIED | builder/page.tsx + 6개 컴포넌트 |
| BILD-06: 스케줄러 관리 페이지 | ✓ SATISFIED | scheduler/page.tsx + scheduler/route.ts GET/PUT/POST |
| BILD-07: 신규 카드 주제 쿼리 (전세·월세·신고가·변동률) | ✓ SATISFIED | fetch-data.js: fetchJeonseRanking, fetchMonthlyRanking, fetchAllTimeHighRanking, fetchPriceChangeRanking |
| BILD-08: 법적 표기 강화 | ✓ SATISFIED | templates.js D-08 LOCKED + card-templates.ts renderClosingPreview |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/app/api/admin/cardnews/data/route.ts` line 457-458 | `// volume / value / district_champions: ... (현재 동일 패턴, 추후 확장)` — 3개 topic이 빈 배열 반환 | ⚠ Warning | UI에서 volume/value/district_champions 선택 시 랭킹 없이 빈 카드뉴스 생성됨 |

### Human Verification Required

**1. iframe 4장 미리보기 시각 확인**

**Test:** /admin/cardnews/builder 접속 → 기간·주제·지역·평형 선택 → '데이터 조회' 클릭
**Expected:** 4장 카드 HTML이 432×432px 컨테이너에 scale(0.4)으로 축소되어 정상 렌더링. Pretendard CDN 폰트 로드 성공
**Why human:** iframe srcDoc + CDN 폰트(@import) 로딩 성공 여부는 실제 브라우저에서만 확인 가능. Next.js sandbox 정책·CORS 등 영향 가능

**2. AI 텍스트 생성 기능**

**Test:** 데이터 조회 후 'AI 생성' 버튼 클릭
**Expected:** 제목·커버캡션·인사이트·SNS캡션·해시태그 5개 필드가 채워지고, 각 textarea에서 직접 편집 가능
**Why human:** GROQ_API_KEY Vercel 환경변수 설정 여부와 실제 Groq API 응답 품질 확인 필요

**3. npm run build 통과**

**Test:** `npm run build` 실행
**Expected:** 빌드 오류 없이 완료. /admin/cardnews/builder + /admin/cardnews/scheduler 동적 라우트 생성
**Why human:** 모든 SUMMARY에서 PASSED 주장 (Wave 02: aca4902, Wave 03: 08fb7d4, Wave 04: 442da90 이후). 로컬 환경에서 직접 확인 필요

**4. GitHub Actions 실제 연동 (선택적)**

**Test:** GITHUB_PAT 설정 확인 후 'PNG 생성 트리거' 버튼 클릭
**Expected:** GitHub Actions run이 시작되고 run_url이 반환된다. 약 5~15분 후 artifact ZIP 다운로드 가능
**Why human:** GITHUB_PAT Fine-grained PAT 권한(Actions read/write) 설정 필요. 실제 Actions 실행은 GitHub 환경 필요

**5. 스케줄러 enable/disable (선택적)**

**Test:** /admin/cardnews/scheduler → 활성화/비활성화 토글
**Expected:** GitHub Actions weekly-generate.yml 상태가 실제로 변경됨
**Why human:** GITHUB_PAT 권한 및 GitHub API 연동 확인 필요

### Gaps Summary

**1개 WARNING — volume/value/district_champions 주제 미구현**

`src/app/api/admin/cardnews/data/route.ts`는 8개 topic을 Zod enum으로 허용하지만, `volume`, `value`, `district_champions` 3개 topic은 빈 배열을 반환한다. 코드 주석: "현재 동일 패턴, 추후 확장". 이 3개 topic을 선택한 경우 랭킹 데이터 없이 빈 카드뉴스가 생성된다.

**영향:** 핵심 주제(sale_top/jeonse_top/monthly_top/alltime_high/price_change)는 완전히 구현되어 있어 주요 use case는 동작한다. 빌더 UI에서 volume/value/district_champions 선택 시 사용자에게 빈 결과가 표시된다는 점을 인지해야 한다.

**자동화 검증 결과: 29/30 truths VERIFIED, 1 PARTIAL**
**인간 검증 항목: 5개 (iframe 렌더링, AI 생성, build 통과, Actions 연동, 스케줄러 토글)**

---

_Verified: 2026-06-25T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
