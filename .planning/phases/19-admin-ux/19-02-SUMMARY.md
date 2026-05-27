---
phase: 19-admin-ux
plan: "02"
subsystem: admin-filter
tags: [admin, filter, searchParams, ads, realtors]
dependency_graph:
  requires:
    - src/app/admin/layout.tsx (19-00)
  provides:
    - src/app/admin/ads/page.tsx (status 필터)
    - src/app/admin/realtors/page.tsx (q/active 필터)
  affects: []
tech_stack:
  added: []
  patterns:
    - RSC searchParams Promise<T> await 패턴
    - 클라이언트 배열 filter (MVP 규모, DB 쿼리 추가 없음)
    - GET form + URL searchParams 방식
key_files:
  created: []
  modified:
    - src/app/admin/ads/page.tsx
    - src/app/admin/realtors/page.tsx
decisions:
  - 클라이언트 배열 filter 방식 사용 (목록이 수백 건 미만 MVP 규모, DB 쿼리 추가 불필요)
  - q 파라미터 .trim().slice(0,50) 길이 제한 (T-19-08 XSS 방어, SQL 아님이지만 일관성)
  - status 파라미터 유효성 검사 없음 (무효값이면 filter 결과 0개, 데이터 변경 없음 T-19-07 accept)
metrics:
  duration: "~10 minutes"
  completed: "2026-05-27"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
requirements:
  - ADMIN-11
---

# Phase 19 Plan 02: 광고/중개사 목록 필터 추가 Summary

**One-liner:** ads/page.tsx에 STATUS_LABEL 기반 status 드롭다운 필터, realtors/page.tsx에 이름/회사명 텍스트 검색 + 활성상태 드롭다운 필터를 GET form 방식으로 추가.

## What Was Built

### Task 1: ads/page.tsx status 필터 추가 (커밋 f2dfd4e)

- `searchParams: Promise<{ status?: string }>` 타입으로 함수 시그니처 변경
- `await searchParams` → status 추출
- `allCampaigns.filter(c => c.status === status)` 클라이언트 배열 필터
- GET form: STATUS_LABEL 기반 6개 옵션 드롭다운 (`<option value="">상태 전체</option>` 포함) + 필터/초기화 버튼
- 빈 목록 메시지: 필터 중 → '해당 상태의 광고 캠페인이 없습니다.'

### Task 2: realtors/page.tsx q/active 필터 추가 (커밋 51c2fb2)

- `searchParams: Promise<{ q?: string; active?: string }>` 타입으로 함수 시그니처 변경
- q: `.trim().slice(0, 50)` 길이 제한 + 이름/회사명 `.toLowerCase().includes()` 검색
- active: `'true'` → `!r.is_active` 제외, `'false'` → `r.is_active` 제외
- GET form: 텍스트 검색창(maxLength=50) + 활성상태 드롭다운 + 검색/초기화 버튼
- 빈 목록 메시지: 필터/검색 중 → '검색 결과가 없습니다.'

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| f2dfd4e | feat | ads/page.tsx status 필터 추가 (searchParams + 클라이언트 array filter) |
| 51c2fb2 | feat | realtors/page.tsx q/active 검색·필터 추가 (searchParams + 클라이언트 filter) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `admin-members-filter.test.ts` unused variable lint 오류 수정**
- **Found during:** Task 1 lint 검증
- **Issue:** 19-01에서 작성된 `src/__tests__/admin-members-filter.test.ts`의 `order(col, opts)` 메서드에서 `opts` 미사용 변수 ESLint 오류
- **Fix:** `opts` → `_opts` 로 변경 (ESLint `no-unused-vars` 규칙: 언더스코어 접두사 허용)
- **Files modified:** `src/__tests__/admin-members-filter.test.ts`
- **Commit:** f2dfd4e에 포함 (ads/page.tsx와 동일 커밋)

### 환경 이슈 (범위 밖)

- 워크트리 `npm run build` 시 `supabaseUrl is required` 오류 발생 — 워크트리에 `.env.local` 없음으로 인한 환경 문제. 메인 레포에서는 빌드 정상 통과. 현재 태스크 코드와 무관.
- `src/app/api/complexes/[id]/map-panel/route.test.ts` TypeScript 오류 — 기존 파일의 `sgg_code` 타입 미스매치. 현재 태스크 파일과 무관.

## Known Stubs

없음 — 모든 필터가 실제 데이터 소스(getAllAdCampaigns, getAllRealtors)에 연결됨.

## Threat Flags

없음 — 새로운 보안 경계 없음. 조회 전용 클라이언트 필터; DB 변경 없음.
- T-19-07: ads status 파라미터 — 무효값 시 filter 결과 0개 (accept)
- T-19-08: realtors q 파라미터 — .trim().slice(0,50) 길이 제한 적용 (mitigate)
- T-19-09: layout auth guard + defense-in-depth 각 페이지 auth guard 유지

## Self-Check: PASSED

- [x] `src/app/admin/ads/page.tsx` 존재 + status 필터 포함
- [x] `src/app/admin/realtors/page.tsx` 존재 + q/active 필터 포함
- [x] 커밋 f2dfd4e 존재
- [x] 커밋 51c2fb2 존재
- [x] ESLint PASS (✔ No ESLint warnings or errors)
- [x] 19-01과 files_modified 겹침 없음 (Wave 1 병렬 실행 조건 충족)
