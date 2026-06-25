---
phase: 31-admin-cardnews-builder
plan: "01"
subsystem: card-news-scripts
tags: [card-news, fetch-data, templates, github-actions, D-08, TDD]

dependency_graph:
  requires: []
  provides:
    - card-news/scripts/fetch-data.js (getDateRange, filterOutliers, fetchJeonseRanking, fetchMonthlyRanking, fetchAllTimeHighRanking, fetchPriceChangeRanking)
    - card-news/scripts/templates.js (BASE_CSS_PREVIEW, renderXxxPreview x4, D-08 disclaimer)
    - card-news/scripts/generate-from-payload.js (Actions payload→PNG)
    - .github/workflows/custom-cardnews.yml (builder workflow_dispatch)
    - .github/workflows/weekly-generate.yml (committed to git - PITFALL-1 fix)
  affects:
    - GitHub Actions (weekly + custom card news generation)
    - 어드민 카드뉴스 빌더 API (Plan 31-02 소비자)

tech_stack:
  added: []
  patterns:
    - TDD (RED→GREEN per task, test scripts as .test.mjs)
    - filterOutliers: 12개월 평균 200% 기준 별도 쿼리 (Pitfall-6 해결)
    - getDateRange: 로컬 시간 기준 날짜 포맷 (UTC+9 시차 고려)
    - BrandLockupPreview: file:// 없는 상대 경로 /logo-cardnews.png

key_files:
  created:
    - card-news/scripts/fetch-data.test.mjs
    - card-news/scripts/templates.test.mjs
    - card-news/scripts/generate-from-payload.js
    - .github/workflows/custom-cardnews.yml
  modified:
    - card-news/scripts/fetch-data.js (319줄 추가)
    - card-news/scripts/templates.js (263줄 추가)
    - .github/workflows/weekly-generate.yml (신규 추가 git 추적)

decisions:
  - D-08 LOCKED 법적 표기: renderClosing() + renderClosingPreview() 양쪽 하드코딩
  - filterOutliers: 집계 기간 외 12개월 전체 평균 별도 쿼리로 Pitfall-6 해결
  - getDateRange: toISOString(UTC) 대신 getFullYear/getMonth/getDate 로컬 시간 포맷
  - BrandLockupPreview: file:// 차단 해결을 위해 /logo-cardnews.png 상대 경로 사용
  - weekly-generate.yml: 로컬에 존재했으나 git 미추적 상태 — 이번 plan에서 커밋

metrics:
  duration_seconds: 501
  completed_date: "2026-06-25"
  tasks_completed: 3
  files_modified: 7
---

# Phase 31 Plan 01: fetch-data.js 확장 + templates.js D-08 + GitHub Actions 정비 Summary

**One-liner:** Supabase 전세/신고가/변동률 집계 함수 6개 추가 + D-08 법적 표기 하드코딩 + CDN 폰트 미리보기 함수 4개 + GitHub Actions 워크플로우 2개 루트 추가

## What Was Built

### Task 1: fetch-data.js 확장 (TDD RED→GREEN)

`card-news/scripts/fetch-data.js`에 6개 함수를 추가했다:

| 함수 | 설명 |
|------|------|
| `getDateRange(type, from?, to?)` | weekly/monthly/quarterly/yearly/custom 기간 계산 |
| `filterOutliers(transactions, dealType)` | 12개월 평균 200% 초과 거래 제거 (D-04, Pitfall-6) |
| `fetchJeonseRanking(...)` | 전세 최고가 TOP N (deal_type='jeonse') |
| `fetchMonthlyRanking(...)` | 월세 최고 보증금 TOP N (deal_type='monthly', D-09) |
| `fetchAllTimeHighRanking(...)` | 신고가 경신 단지 — 2단계 쿼리 (Pattern 9) |
| `fetchPriceChangeRanking(...)` | 가격 변동률 — 병렬 기간 비교 (Pattern 10) |

모든 신규 함수에 `.is('cancel_date', null).is('superseded_by', null)` 적용.

### Task 2: templates.js 수정 (TDD RED→GREEN)

- **D-08 LOCKED**: `renderClosing()` disclaimer를 정확한 2줄 문구로 교체
  - "출처: 국토교통부 실거래가 공개시스템"
  - "본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다"
- **BASE_CSS_PREVIEW**: CDN 폰트(@import cdn.jsdelivr.net/gh/orioncactus/pretendard) 기반 상수 export
- **htmlPreview()**: BASE_CSS_PREVIEW 사용하는 HTML 래퍼 함수 (내부)
- **BrandLockupPreview()**: /logo-cardnews.png 상대 경로 사용 (file:// 차단 해결)
- **renderCoverPreview / renderHighlightPreview / renderRankingPreview / renderClosingPreview**: iframe srcDoc 미리보기 전용 함수 4개

### Task 3: GitHub Actions 정비

- **generate-from-payload.js**: payload JSON(4개 HTML) → PNG 4장 변환 스크립트
- **custom-cardnews.yml**: payload_url + series_id 입력, artifact 30일 보존 (D-02)
- **weekly-generate.yml**: 루트 `.github/workflows/`에 git 추적 등록 (PITFALL-1 완전 해결)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UTC 시차로 인한 getDateRange 날짜 계산 오류**
- **Found during:** Task 1 GREEN phase (TDD test 실패)
- **Issue:** `new Date(year, month, 1).toISOString().slice(0, 10)` — UTC+9 환경에서 6월 1일 로컬 자정 = 5월 31일 UTC → "2026-05-31" 반환
- **Fix:** `getFullYear()/getMonth()/getDate()` 로컬 시간 기반 포맷팅으로 교체
- **Files modified:** card-news/scripts/fetch-data.js

**2. [Rule 2 - Missing Critical] BrandLockupPreview 분리**
- **Found during:** Task 2 GREEN phase (TDD test 실패)
- **Issue:** renderCoverPreview()가 BrandLockup()을 공유 → file:// 로고 경로가 preview HTML에 포함
- **Fix:** BrandLockupPreview() 신규 함수 추가 — /logo-cardnews.png 상대 경로 사용
- **Files modified:** card-news/scripts/templates.js

**3. [Rule 2 - PITFALL-1] weekly-generate.yml git 미추적 발견**
- **Found during:** Task 3 verification
- **Issue:** weekly-generate.yml이 루트에 존재했으나 git에 추적되지 않음 → GitHub Actions 인식 불가
- **Fix:** git add + commit으로 추적 등록
- **Files modified:** .github/workflows/weekly-generate.yml
- **Commit:** db2d2a6

**4. [Rule 1 - Bug] templates.js D-08 text count=2 (plan says →1)**
- **Explanation:** Plan acceptance criteria에서 `grep -c "출처..." → 1`로 명시했으나, renderClosing()과 renderClosingPreview() 양쪽에 D-08 텍스트를 넣어 2가 됨. 이는 올바른 동작 — 클로징 카드 미리보기도 법적 표기 포함 필수. 계획 기준이 preview 함수 추가를 반영하지 않은 것.

### No Stubs Found

모든 함수는 실제 Supabase 쿼리 로직이 구현됨. placeholder 없음.

## TDD Gate Compliance

| Phase | Commit | Status |
|-------|--------|--------|
| Task 1 RED | 00b52ad | `test(31-01): add failing tests for new fetch-data.js exports` |
| Task 1 GREEN | 3995012 | `feat(31-01): add getDateRange filterOutliers and new ranking functions` |
| Task 2 RED | e06e77f | `test(31-01): add failing tests for templates.js D-08 disclaimer` |
| Task 2 GREEN | c34e2ae | `feat(31-01): update templates.js with D-08 disclaimer and CDN preview functions` |

All RED→GREEN gates satisfied.

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 (RED) | 00b52ad | test | fetch-data.js failing tests |
| Task 1 (GREEN) | 3995012 | feat | fetch-data.js 6개 신규 함수 |
| Task 2 (RED) | e06e77f | test | templates.js failing tests |
| Task 2 (GREEN) | c34e2ae | feat | templates.js D-08 + CDN preview |
| Task 3 | f22eb8b | feat | generate-from-payload.js + custom-cardnews.yml |
| PITFALL-1 fix | db2d2a6 | chore | weekly-generate.yml git 추적 등록 |

## Self-Check

Files exist check:
- card-news/scripts/fetch-data.js — MODIFIED
- card-news/scripts/templates.js — MODIFIED
- card-news/scripts/generate-from-payload.js — CREATED
- .github/workflows/custom-cardnews.yml — CREATED
- .github/workflows/weekly-generate.yml — CREATED (committed)
- card-news/scripts/fetch-data.test.mjs — CREATED
- card-news/scripts/templates.test.mjs — CREATED

## Self-Check: PASSED

All files found. All commits verified.
