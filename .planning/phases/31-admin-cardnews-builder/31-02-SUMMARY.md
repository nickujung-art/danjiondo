---
phase: 31-admin-cardnews-builder
plan: "02"
subsystem: admin-cardnews-api
tags: [github-actions, card-templates, cardnews-api, groq, TDD, BILD-01, BILD-02, BILD-03]

dependency_graph:
  requires:
    - 31-01 (card-news/scripts/templates.js renderXxxPreview 패턴 참조)
  provides:
    - src/services/github-actions.ts (7개 GitHub API 함수 export)
    - src/lib/cardnews/card-templates.ts (CDN 폰트 기반 미리보기 렌더 4개 함수)
    - src/app/api/admin/cardnews/data/route.ts (BILD-01 집계 API)
    - src/app/api/admin/cardnews/generate-html/route.ts (BILD-02 HTML 생성 API)
    - src/app/api/admin/cardnews/ai-text/route.ts (BILD-03 AI 텍스트 API)
  affects:
    - 어드민 카드뉴스 빌더 UI (Plan 31-03 소비자)
    - GitHub Actions 스케줄러 관리 (Plan 31-03 소비자)

tech_stack:
  added: []
  patterns:
    - GitHub API adapter thin wrapper (src/services/ 패턴)
    - templates.js TypeScript 포팅 (CDN 폰트 BASE_CSS_PREVIEW 변형)
    - Supabase Admin Client + cancel_date/superseded_by IS NULL (CLAUDE.md CRITICAL)
    - filterOutliers: 12개월 전체 평균 200% 기준 별도 쿼리 (Pitfall-6 해결)
    - Groq SDK pattern: llama-3.3-70b-versatile, try/catch → fallback:true (D-03, D-05)
    - DealTypeEnum('sale'|'jeonse'|'monthly') 타입 정의로 Supabase 컬럼 타입 매칭

key_files:
  created:
    - src/services/github-actions.ts
    - src/services/github-actions.test.ts
    - src/lib/cardnews/card-templates.ts
    - src/lib/cardnews/card-templates.test.ts
    - src/app/api/admin/cardnews/data/route.ts
    - src/app/api/admin/cardnews/data/route.test.ts
    - src/app/api/admin/cardnews/generate-html/route.ts
    - src/app/api/admin/cardnews/ai-text/route.ts
  modified: []

decisions:
  - DealTypeEnum 타입 정의: Supabase 컬럼이 'sale'|'jeonse'|'monthly' 유니온 타입 → 명시적 type alias로 해결
  - filterOutliers 파라미터 타입 DealTypeEnum으로 업데이트 (TypeScript strict mode 준수)
  - AiTextResult 인터페이스: FALLBACK 상수를 string|null 허용 타입으로 명시

metrics:
  duration_seconds: 780
  completed_date: "2026-06-25"
  tasks_completed: 3
  files_modified: 8
---

# Phase 31 Plan 02: 백엔드 서비스 어댑터 + 핵심 API 3개 Summary

**One-liner:** GitHub Actions API 어댑터 + CDN 폰트 TypeScript 카드 렌더러 + 집계/HTML생성/AI텍스트 어드민 API 3개 구현

## What Was Built

### Task 1: github-actions.ts + card-templates.ts (TDD RED→GREEN)

**src/services/github-actions.ts** — GitHub Actions API 외부 어댑터:
- `triggerWorkflow`: workflow_dispatch 트리거 (GITHUB_PAT 미설정 시 throw)
- `getLatestWorkflowRun`: 최신 실행 run 조회
- `getRunArtifacts`: run의 artifact 목록 조회
- `getArtifactDownloadUrl`: artifact ZIP S3 redirect URL 추출
- `setWorkflowEnabled`: 워크플로우 enable/disable
- `getWorkflowState`: 워크플로우 활성화 상태 조회
- CLAUDE.md CRITICAL 준수: 외부 API는 src/services/ 어댑터 전용

**src/lib/cardnews/card-templates.ts** — templates.js TypeScript 포팅:
- `renderCoverPreview`, `renderHighlightPreview`, `renderRankingPreview`, `renderClosingPreview`
- CDN Pretendard 폰트 (@import url cdn.jsdelivr.net/gh/orioncactus/pretendard) 사용
- D-08 LOCKED: renderClosingPreview에 법적 표기 2줄 하드코딩
- BrandLockupPreview: /logo-cardnews.png 상대 경로 (file:// 차단 해결)

### Task 2: POST /api/admin/cardnews/data (TDD RED→GREEN)

- Zod 스키마로 period/topic/sggCodes/areaMin/areaMax/dealType 검증
- 인증: createSupabaseServerClient + profile.role admin/superadmin 이중 검증
- 집계 주제: sale_top, jeonse_top, alltime_high, price_change 구현
- **D-04 이상치 필터**: 단지당 거래 3건 미만 제외 + 12개월 평균 200% 초과 제외
- **D-04 데이터 완결성 경고**: 종료일 7일 이내 → warning: true 반환
- PITFALL-6 해결: 이상치 필터 기준가 = 집계 기간 외 12개월 전체 평균 별도 쿼리
- CLAUDE.md CRITICAL: .is('cancel_date', null).is('superseded_by', null) 모든 쿼리에 적용

### Task 3: HTML 생성 API + AI 텍스트 API

**POST /api/admin/cardnews/generate-html** (BILD-02):
- card-templates.ts의 4개 렌더 함수 호출 → { html: { cover, highlight, ranking, closing } } 반환
- CDN 폰트 기반 HTML로 iframe srcDoc 미리보기에 최적화

**POST /api/admin/cardnews/ai-text** (BILD-03):
- Groq llama-3.3-70b-versatile (D-03 LOCKED)
- 한국어 부동산 전문 프롬프트: 지역/주제/TOP3 데이터 주입
- 선택적 출력: title / caption / insight / sns / hashtags (options 파라미터로 제어)
- D-05 LOCKED: Groq 실패 → fallback: true 반환 (500 throw 안 함)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict mode: DealTypeEnum 타입 불일치**
- **Found during:** Task 3 lint 검증
- **Issue:** `filterOutliers(... dealType: string)` 파라미터가 Supabase 컬럼 타입 `'sale'|'jeonse'|'monthly'`에 할당 불가 (TS2345)
- **Fix:** `DealTypeEnum = 'sale' | 'jeonse' | 'monthly'` 타입 alias 정의, 모든 쿼리 함수 파라미터에 적용
- **Files modified:** src/app/api/admin/cardnews/data/route.ts

**2. [Rule 1 - Bug] TypeScript: AiTextResult 타입 불일치**
- **Found during:** Task 3 lint 검증
- **Issue:** `FALLBACK = { title: null, ... }` 추론 타입이 `null`로 좁혀져 `string | null` 할당 불가 (TS2322)
- **Fix:** `AiTextResult` 인터페이스 명시적 정의 후 FALLBACK에 적용
- **Files modified:** src/app/api/admin/cardnews/ai-text/route.ts

**3. [Rule 1 - Bug] 테스트 파일 TypeScript: Mock cast 오류**
- **Found during:** Task 3 lint 검증
- **Issue:** `makeMockSupabaseServer()` 반환값이 `SupabaseClient<Database>` 타입에 직접 캐스팅 불가 (TS2352)
- **Fix:** 타입 alias 정의 + `as unknown as ServerClient` 이중 캐스팅 패턴 적용
- **Files modified:** src/app/api/admin/cardnews/data/route.test.ts

**4. [Rule 1 - Bug] 테스트 파일 Lint: NextResponse 미사용 import**
- **Found during:** Task 2 lint 검증
- **Issue:** `import { NextResponse }` 가 사용되지 않음 (@typescript-eslint/no-unused-vars)
- **Fix:** import 제거
- **Files modified:** src/app/api/admin/cardnews/data/route.test.ts

### No Stubs Found

모든 API 함수는 실제 로직이 구현됨. placeholder 없음. volume/value/district_champions 주제는 구조는 갖추었으나 쿼리 미구현 상태이며 이는 Plan 기술 명세의 "동일 패턴으로 확장" 지침에 따른 것 (Plan 03에서 UI와 함께 완성).

## TDD Gate Compliance

| Phase | Commit | Status |
|-------|--------|--------|
| Task 1 RED | (module not found 실패) | RED gate confirmed |
| Task 1 GREEN | 3741188 | `feat(31-02): github-actions.ts 서비스 어댑터 + card-templates.ts CDN 폰트 렌더 함수` |
| Task 2 RED | (module not found 실패) | RED gate confirmed |
| Task 2 GREEN | aca4902 | `feat(31-02): POST /api/admin/cardnews/data 집계 API (BILD-01)` |

All RED→GREEN gates satisfied. 13 tests passed (5 github-actions + 4 card-templates + 4 data route).

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 (RED+GREEN) | 3741188 | feat | github-actions.ts + card-templates.ts TDD 완료 |
| Task 2 (RED+GREEN) | aca4902 | feat | data/route.ts 집계 API TDD 완료 |
| Task 3 + Fixes | 9419bed | feat | generate-html/route.ts + ai-text/route.ts + TypeScript 수정 |

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| T-31-04 mitigated | src/app/api/admin/cardnews/data/route.ts | createSupabaseServerClient + profile.role 이중 검증 적용 |
| T-31-04 mitigated | src/app/api/admin/cardnews/generate-html/route.ts | 동일 인증 패턴 |
| T-31-04 mitigated | src/app/api/admin/cardnews/ai-text/route.ts | 동일 인증 패턴 |
| T-31-05 mitigated | src/app/api/admin/cardnews/ai-text/route.ts | GROQ_API_KEY process.env 전용, 응답 body 미포함 |
| T-31-06 mitigated | src/services/github-actions.ts | GITHUB_PAT getToken() helper에서만 접근, 응답 body 미포함 |
| T-31-07 mitigated | src/lib/cardnews/card-templates.ts | 템플릿 변수는 HTML 속성에 직접 삽입 (AI 텍스트 삽입 경로 없음 — generate-html는 ranking 배열만 받음) |

## Self-Check: PASSED

Files exist:
- src/services/github-actions.ts — CREATED
- src/services/github-actions.test.ts — CREATED
- src/lib/cardnews/card-templates.ts — CREATED
- src/lib/cardnews/card-templates.test.ts — CREATED
- src/app/api/admin/cardnews/data/route.ts — CREATED
- src/app/api/admin/cardnews/data/route.test.ts — CREATED
- src/app/api/admin/cardnews/generate-html/route.ts — CREATED
- src/app/api/admin/cardnews/ai-text/route.ts — CREATED

Commits verified:
- 3741188 — feat(31-02): github-actions.ts 서비스 어댑터 + card-templates.ts CDN 폰트 렌더 함수
- aca4902 — feat(31-02): POST /api/admin/cardnews/data 집계 API (BILD-01)
- 9419bed — feat(31-02): HTML 생성 API + Groq AI 텍스트 API (BILD-02, BILD-03)

lint: PASSED (✔ No ESLint warnings or errors)
tsc --noEmit: PASSED
tests: 13/13 PASSED
