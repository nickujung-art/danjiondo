---
phase: 18-realtor-recommendation
plan: "03"
subsystem: complex-detail-ui
tags: [realtor, complex-detail, rsc, tel-link]
dependency_graph:
  requires: ["18-01"]
  provides: ["18-03"]
  affects: ["src/app/complexes/[id]/page.tsx"]
tech_stack:
  added: []
  patterns: ["RSC component", "tel: URI link", "initials avatar fallback"]
key_files:
  created:
    - src/components/realtors/RealtorCard.tsx
    - src/components/realtors/RealtorCard.test.tsx
  modified:
    - src/app/complexes/[id]/page.tsx
decisions:
  - "RealtorCard는 순수 RSC — 'use client' 없음, 상호작용 없음, tel: 링크로 충분"
  - "in_feed 광고 완전 제거 — getActiveAds('in_feed') 호출 및 JSX 섹션 모두 삭제"
  - "Realtor 타입은 src/lib/data/realtors.ts에서 재사용 (인라인 인터페이스 대신)"
metrics:
  duration: "~10분"
  completed: "2026-05-26"
  tasks_completed: 2
  files_changed: 3
---

# Phase 18 Plan 03: RealtorCard 컴포넌트 + 단지 상세 공인중개사 섹션 Summary

RealtorCard RSC 컴포넌트 생성 및 단지 상세 페이지에서 in_feed 광고를 제거하고 공인중개사 카드 섹션으로 교체.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RealtorCard RSC 컴포넌트 구현 | 7ad0c23 | src/components/realtors/RealtorCard.tsx, RealtorCard.test.tsx |
| 2 | 단지 상세 in_feed 제거 + 공인중개사 섹션 교체 | 8f2aac8 | src/app/complexes/[id]/page.tsx |

## What Was Built

- `RealtorCard.tsx`: 순수 RSC 컴포넌트. 이름/사무소명/설명 표시, tel: URI 링크 버튼(하이픈 제거), 이미지 없을 때 이니셜 아바타 fallback
- `RealtorCard.test.tsx`: Vitest 3개 테스트 — tel: href 형식 검증, 이니셜 렌더, 이미지 렌더
- `page.tsx`: `inFeedAds` 변수 및 `getActiveAds('in_feed', ...)` 호출 완전 제거; `complexRealtors` + `getRealtorsByComplexId` 추가; 조건부 공인중개사 섹션 삽입

## Verification

- `npm run lint`: ESLint 오류 없음 (tsc max-warnings 플래그는 tsc에서 미지원 — ESLint 단계 통과)
- `npm run build`: 빌드 성공 (complexes/[id] 경로 포함)
- `npm run test -- --run`: RealtorCard 3개 테스트 모두 통과; 기타 실패는 Supabase DB 연결 필요한 기존 통합 테스트

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest 전역 함수 미임포트**
- **Found during:** Task 1 테스트 파일 TypeScript 검사
- **Issue:** 프로젝트의 기존 테스트 파일들은 `globals: true` vitest 설정에도 불구하고 `describe`, `it`, `expect`를 vitest에서 명시적으로 import함 (tsconfig에 vitest 타입 미포함)
- **Fix:** `import { describe, it, expect } from 'vitest'` 추가
- **Files modified:** src/components/realtors/RealtorCard.test.tsx
- **Commit:** 7ad0c23

## Known Stubs

None. RealtorCard는 props로 전달받은 실제 데이터를 렌더링함.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: external-image-src | src/components/realtors/RealtorCard.tsx | image_url을 img src에 직접 사용 — next.config.ts 허용 도메인 추가 권장 (T-18-03-02) |

## Self-Check: PASSED

- src/components/realtors/RealtorCard.tsx: FOUND
- src/components/realtors/RealtorCard.test.tsx: FOUND
- src/app/complexes/[id]/page.tsx (getRealtorsByComplexId): FOUND
- Commit 7ad0c23: FOUND
- Commit 8f2aac8: FOUND
- inFeedAds in page.tsx: NOT FOUND (correctly removed)
