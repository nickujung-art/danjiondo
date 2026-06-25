---
phase: 31-admin-cardnews-builder
plan: "03"
subsystem: admin-cardnews-api
tags: [github-actions, supabase-storage, cardnews-api, scheduler, BILD-04, BILD-06]

dependency_graph:
  requires:
    - 31-02 (github-actions.ts 서비스 어댑터 7개 함수 — triggerWorkflow/getRunArtifacts/getArtifactDownloadUrl/setWorkflowEnabled/getWorkflowState)
  provides:
    - src/app/api/admin/cardnews/trigger-actions/route.ts (POST: HTML→Storage→workflow_dispatch)
    - src/app/api/admin/cardnews/artifact/route.ts (GET: artifact ZIP 다운로드 URL)
    - src/app/api/admin/cardnews/scheduler/route.ts (GET/PUT/POST: weekly-generate.yml 관리)
  affects:
    - 어드민 카드뉴스 빌더 UI (Plan 31-04 소비자)
    - 어드민 스케줄러 페이지 (Plan 31-04 소비자)

tech_stack:
  added: []
  patterns:
    - Supabase Storage public bucket JSON payload upload (cardnews-payloads)
    - workflow_dispatch → public URL payload 전달 패턴 (PITFALL-4 해결)
    - GitHub API 어댑터 전용 경유 (CLAUDE.md CRITICAL)
    - getAdminGuard 헬퍼 패턴 (admin/superadmin role 검증 재사용)
    - noUncheckedIndexedAccess: 배열 첫 요소 변수 추출 패턴

key_files:
  created:
    - src/app/api/admin/cardnews/trigger-actions/route.ts
    - src/app/api/admin/cardnews/artifact/route.ts
    - src/app/api/admin/cardnews/scheduler/route.ts
  modified: []

key-decisions:
  - "getAdminGuard 헬퍼 함수: scheduler route 3개 핸들러 공통 인증 로직 추출 — 중복 제거"
  - "nextScheduledRun: 매주 월요일 00:10 KST = 일요일 15:10 UTC 계산 로직 하드코딩 (D-07)"
  - "artifact/route.ts: run_id 없으면 getLatestWorkflowRun으로 최근 실행 자동 조회 (UX 편의)"

requirements-completed: [BILD-04, BILD-06]

duration: 6min
completed: "2026-06-25"
---

# Phase 31 Plan 03: GitHub Actions 트리거·Artifact·스케줄러 API Summary

**HTML→Supabase Storage JSON→workflow_dispatch 패턴으로 custom-cardnews.yml 트리거 API + artifact 다운로드 URL 조회 API + weekly-generate.yml GET/PUT/POST 스케줄러 관리 API 구현**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-25T07:23:23Z
- **Completed:** 2026-06-25T07:29:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- POST /api/admin/cardnews/trigger-actions: HTML 4장(cover/highlight/ranking/closing) JSON으로 cardnews-payloads 버킷에 업로드 → public URL → custom-cardnews.yml workflow_dispatch 트리거
- GET /api/admin/cardnews/artifact: run_id 또는 최근 실행에서 artifact ZIP 다운로드 URL 반환 (없으면 status:'pending')
- GET/PUT/POST /api/admin/cardnews/scheduler: weekly-generate.yml 상태 조회·enable/disable·수동 트리거 (D-07 완전 구현)
- 모든 3개 Route 어드민 권한 검증 (401/403), GITHUB_PAT 서버 환경변수 전용

## Task Commits

1. **Task 1: trigger-actions/route.ts + artifact/route.ts (BILD-04)** - `8e54ca5` (feat)
2. **Task 2: scheduler/route.ts + artifact TS fix (BILD-06, D-07)** - `08fb7d4` (feat)

## Files Created/Modified

- `src/app/api/admin/cardnews/trigger-actions/route.ts` - POST: HTML payload → Supabase Storage → GitHub Actions custom-cardnews.yml dispatch
- `src/app/api/admin/cardnews/artifact/route.ts` - GET: run artifact ZIP 다운로드 URL 조회 (30일 만료 안내 포함)
- `src/app/api/admin/cardnews/scheduler/route.ts` - GET/PUT/POST: weekly-generate.yml 상태·enable/disable·수동 트리거

## Decisions Made

- `getAdminGuard()` 헬퍼 함수로 scheduler 3개 핸들러의 인증 로직 추출 — 반복 없이 일관된 401/403 처리
- `nextScheduledRun()`: 매주 월요일 00:10 KST = 일요일 15:10 UTC 계산 (D-07 요건)
- artifact/route.ts: `run_id` 쿼리 파라미터 없으면 `getLatestWorkflowRun()`으로 자동 조회 — 클라이언트 편의성

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] artifact/route.ts: noUncheckedIndexedAccess TypeScript 오류**
- **Found during:** Task 2 lint 검증 (`npm run lint`)
- **Issue:** `artifacts[0].id`, `artifacts[0].name`, `artifacts[0].size_in_bytes` 가 TypeScript `noUncheckedIndexedAccess` strict 옵션으로 인해 possibly `undefined` 오류 (TS2532) — 3개 라인 오류
- **Fix:** `const firstArtifact = artifacts[0]` 변수로 추출 후 `if (!firstArtifact)` 가드 → 이후 접근 타입 안전
- **Files modified:** src/app/api/admin/cardnews/artifact/route.ts
- **Verification:** `npm run lint` (`next lint && tsc --noEmit`) 통과
- **Committed in:** 08fb7d4 (Task 2 commit에 포함)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript strict 오류)
**Impact on plan:** TypeScript `noUncheckedIndexedAccess` 표준 패턴 적용. 범위 일탈 없음.

## Issues Encountered

None — lint 오류 1건은 즉시 auto-fix로 해결.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| T-31-09 mitigated | src/app/api/admin/cardnews/trigger-actions/route.ts | admin/superadmin role 검증 → 비인가 workflow_dispatch 불가 |
| T-31-10 mitigated | src/app/api/admin/cardnews/trigger-actions/route.ts | payload = 4개 HTML 문자열 JSON, Zod 스키마 검증 |
| T-31-11 accepted | src/app/api/admin/cardnews/artifact/route.ts | run_url만 반환 (GitHub 공개 링크), artifact S3 URL은 API 경유 |
| T-31-13 mitigated | src/app/api/admin/cardnews/scheduler/route.ts | admin role + setWorkflowEnabled 서비스 어댑터 경유 |

## Known Stubs

None — 모든 API 함수는 실제 로직 구현 완료.

## User Setup Required

- `GITHUB_PAT`: GitHub Personal Access Token (workflow 읽기/쓰기 권한 필요) — 환경변수 설정 필요
- Supabase `cardnews-payloads` 버킷: public 버킷으로 이미 생성됨 (Plan 02 user_setup 완료)

## Next Phase Readiness

- Plan 03 API Routes 3개 완료 — Plan 04 (어드민 빌더 UI + 스케줄러 UI) 소비 가능
- trigger-actions: `{ ok, payload_url, run_url, message }` 반환
- artifact: `{ status: 'ready'|'pending', download_url, artifact_name, size_bytes, expires_info }` 반환
- scheduler GET: `{ enabled, state, latestRun, nextScheduledRun }` 반환

---

## Self-Check: PASSED

Files exist:
- src/app/api/admin/cardnews/trigger-actions/route.ts — CREATED
- src/app/api/admin/cardnews/artifact/route.ts — CREATED
- src/app/api/admin/cardnews/scheduler/route.ts — CREATED

Commits verified:
- 8e54ca5 — feat(31-03): trigger-actions/route.ts + artifact/route.ts (BILD-04)
- 08fb7d4 — feat(31-03): scheduler/route.ts (BILD-06, D-07) + artifact TS fix

lint: PASSED (✔ No ESLint warnings or errors)
tsc --noEmit: PASSED
build: PASSED

---
*Phase: 31-admin-cardnews-builder*
*Completed: 2026-06-25*
