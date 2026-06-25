---
phase: 31-admin-cardnews-builder
plan: "04"
subsystem: admin-cardnews-ui
tags: [cardnews-builder, admin-ui, iframe-preview, ai-text, github-actions, BILD-05, BILD-06, BILD-07, BILD-08]

dependency_graph:
  requires:
    - 31-02 (data/generate-html/ai-text API Routes)
    - 31-03 (trigger-actions/artifact/scheduler API Routes)
  provides:
    - src/components/admin/cardnews/BuilderOptionsPanel.tsx (D-09 옵션 선택 폼)
    - src/components/admin/cardnews/DataQualityWarning.tsx (D-04 경고 컴포넌트)
    - src/components/admin/cardnews/BuilderPreviewPanel.tsx (D-10 iframe 4장 미리보기)
    - src/components/admin/cardnews/AiTextEditor.tsx (D-05 인라인 AI 텍스트 편집)
    - src/components/admin/cardnews/ExportPanel.tsx (D-02 PNG 생성 트리거 + artifact polling)
    - src/components/admin/cardnews/SchedulerPanel.tsx (D-07 enable/disable/수동트리거)
    - src/components/admin/cardnews/CardNewsBuilderClient.tsx (빌더 전체 흐름 조율)
    - src/app/admin/cardnews/builder/page.tsx (RSC auth guard)
    - src/app/admin/cardnews/scheduler/page.tsx (RSC auth guard)
    - src/components/admin/AdminSidebar.tsx (D-12 3개 nav items)
  affects:
    - /admin/cardnews/builder (신규 빌더 페이지)
    - /admin/cardnews/scheduler (신규 스케줄러 페이지)

tech_stack:
  added: []
  patterns:
    - iframe srcDoc 1080×1080 → scale(0.4) → 432px 컨테이너 (PITFALL-2 해결, BILD-05 D-10)
    - RSC auth guard 패턴 (profiles.role admin/superadmin check + redirect)
    - Client 컴포넌트 useCallback 기반 순차 fetch (데이터→HTML 파이프라인)
    - textarea 기반 인라인 편집 (contentEditable 대신 XSS 안전, D-05)
    - artifact polling: 30초×20회 반복 (ExportPanel, D-02)
    - useEffect + useCallback fetchStatus 패턴 (SchedulerPanel)

key_files:
  created:
    - src/components/admin/cardnews/BuilderOptionsPanel.tsx
    - src/components/admin/cardnews/DataQualityWarning.tsx
    - src/components/admin/cardnews/BuilderPreviewPanel.tsx
    - src/components/admin/cardnews/AiTextEditor.tsx
    - src/components/admin/cardnews/ExportPanel.tsx
    - src/components/admin/cardnews/SchedulerPanel.tsx
    - src/components/admin/cardnews/CardNewsBuilderClient.tsx
    - src/app/admin/cardnews/builder/page.tsx
    - src/app/admin/cardnews/scheduler/page.tsx
  modified:
    - src/components/admin/AdminSidebar.tsx

key-decisions:
  - "DataQualityWarning: warning && dataCount 두 조건을 동시에 처리하여 중복 렌더 방지"
  - "CardNewsBuilderClient: 데이터 조회 완료 후 즉시 HTML 생성 순차 파이프라인 (사용자 추가 클릭 불필요)"
  - "ExportPanel pollArtifact: 30초×20회 = 최대 10분 (D-02 GitHub Actions 빌드 시간 여유)"
  - "AdminSidebar buildNavItems: 카드뉴스 목록/빌더/스케줄러 3개 flat nav items — 들여쓰기 미적용 (기존 패턴 통일성)"

requirements-completed: [BILD-05, BILD-06, BILD-07, BILD-08]

duration: 9min
completed: "2026-06-25"
---

# Phase 31 Plan 04: 어드민 카드뉴스 빌더 UI Summary

**옵션 선택(D-09)→데이터 조회→iframe 미리보기(D-10)→AI 텍스트 편집(D-05)→PNG 생성 트리거(D-02) 빌더 UI + 스케줄러 페이지(D-07) + AdminSidebar 3 nav items(D-12) 완전 구현**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-25T08:35:50Z
- **Completed:** 2026-06-25T08:44:58Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- BuilderOptionsPanel: 5기간·8주제·7지역·5평형 D-09 LOCKED 옵션 버튼 UI, custom 날짜 범위 입력 포함
- DataQualityWarning: 7일 이내 종료일 및 3건 미만 데이터 경고 (D-04)
- BuilderPreviewPanel: iframe srcDoc 1080×1080px → scale(0.4) → 432px 컨테이너, 4장(커버/하이라이트/랭킹/클로징) 2×2 그리드
- AiTextEditor: Groq AI 생성 버튼 + fallback 에러 처리 + textarea 인라인 편집 5개 필드 (D-05)
- ExportPanel: trigger-actions POST → 30초×20회 artifact polling → PNG ZIP 다운로드 링크 (D-02)
- SchedulerPanel: GET/PUT/POST scheduler API 소비 — 활성화 상태·다음 실행 시각·enable/disable 토글·수동 트리거·최근 실행 이력 (D-07)
- CardNewsBuilderClient: 옵션→데이터→HTML 순차 파이프라인 자동 실행 (BILD-05)
- builder/page.tsx: RSC auth guard, /admin/cardnews/builder 라우트
- scheduler/page.tsx: RSC auth guard, /admin/cardnews/scheduler 라우트 (D-07)
- AdminSidebar: buildNavItems에 '카드뉴스 목록'/'카드뉴스 빌더'/'스케줄러' 3개 항목 추가 (D-12)

## Task Commits

1. **Task 1: BuilderOptionsPanel + DataQualityWarning + BuilderPreviewPanel** - `2eba1a1` (feat)
2. **Task 2: AiTextEditor + ExportPanel + SchedulerPanel** - `b89c944` (feat)
3. **Task 3: builder/page + scheduler/page + CardNewsBuilderClient + AdminSidebar** - `442da90` (feat)

## Files Created/Modified

- `src/components/admin/cardnews/BuilderOptionsPanel.tsx` - D-09 5기간·8주제·7지역·5평형 선택 폼
- `src/components/admin/cardnews/DataQualityWarning.tsx` - 7일 이내·3건 미만 경고 (D-04)
- `src/components/admin/cardnews/BuilderPreviewPanel.tsx` - iframe scale(0.4) 4장 미리보기 (D-10)
- `src/components/admin/cardnews/AiTextEditor.tsx` - AI 생성 + textarea 인라인 편집 (D-05)
- `src/components/admin/cardnews/ExportPanel.tsx` - PNG 생성 트리거 + artifact polling (D-02)
- `src/components/admin/cardnews/SchedulerPanel.tsx` - 스케줄러 상태·토글·수동 트리거 (D-07)
- `src/components/admin/cardnews/CardNewsBuilderClient.tsx` - 전체 흐름 조율 Client 컴포넌트
- `src/app/admin/cardnews/builder/page.tsx` - RSC auth guard → CardNewsBuilderClient
- `src/app/admin/cardnews/scheduler/page.tsx` - RSC auth guard → SchedulerPanel
- `src/components/admin/AdminSidebar.tsx` - 카드뉴스 목록/빌더/스케줄러 3개 nav items (D-12)

## Decisions Made

- CardNewsBuilderClient에서 데이터 조회 완료 직후 HTML 생성을 자동 연계 — 사용자가 '미리보기 생성' 버튼을 별도로 누를 필요 없이 흐름이 자동 진행됨
- AdminSidebar: 카드뉴스 3개 항목을 flat하게 추가 (들여쓰기/그룹 없음) — 기존 buildNavItems 배열 패턴 통일성 유지
- DataQualityWarning: ranking.length > 0 조건 추가 — 아직 데이터 조회 전(빈 배열)에 "0건 미만" 경고가 표시되지 않도록

## Deviations from Plan

None — plan을 정확히 구현. TypeScript strict 오류 없이 lint 및 build 통과.

## Known Stubs

None — 모든 컴포넌트가 실제 API를 호출하는 완전한 구현.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| T-31-14 mitigated | src/app/admin/cardnews/builder/page.tsx | RSC레벨 admin/superadmin role guard + redirect (T-31-14) |
| T-31-16 accepted | src/components/admin/cardnews/BuilderPreviewPanel.tsx | iframe sandbox="allow-same-origin" only, no allow-scripts |

---

## Self-Check: PASSED

Files exist:
- src/components/admin/cardnews/BuilderOptionsPanel.tsx — CREATED
- src/components/admin/cardnews/DataQualityWarning.tsx — CREATED
- src/components/admin/cardnews/BuilderPreviewPanel.tsx — CREATED
- src/components/admin/cardnews/AiTextEditor.tsx — CREATED
- src/components/admin/cardnews/ExportPanel.tsx — CREATED
- src/components/admin/cardnews/SchedulerPanel.tsx — CREATED
- src/components/admin/cardnews/CardNewsBuilderClient.tsx — CREATED
- src/app/admin/cardnews/builder/page.tsx — CREATED
- src/app/admin/cardnews/scheduler/page.tsx — CREATED
- src/components/admin/AdminSidebar.tsx — MODIFIED

Commits verified:
- 2eba1a1 — feat(31-04): BuilderOptionsPanel + DataQualityWarning + BuilderPreviewPanel
- b89c944 — feat(31-04): AiTextEditor + ExportPanel + SchedulerPanel
- 442da90 — feat(31-04): builder/page + scheduler/page + CardNewsBuilderClient + AdminSidebar nav

lint: PASSED (✔ No ESLint warnings or errors)
tsc --noEmit: PASSED
build: PASSED (/admin/cardnews/builder + /admin/cardnews/scheduler 모두 ƒ Dynamic 라우트로 빌드됨)

---
*Phase: 31-admin-cardnews-builder*
*Completed: 2026-06-25*
