---
phase: 29-mobile-optimization
plan: "02"
subsystem: page-layouts
tags: [mobile, home, rankings, tailwind, touch-target, isr, chip]
dependency_graph:
  requires:
    - Plan 01 (AppHeader + BottomTabBar + layout.tsx 통합)
  provides:
    - 홈 page.tsx mobile-first 레이아웃 (inline style → Tailwind)
    - 랭킹 rankings/page.tsx mobile-first 레이아웃 + 44px 칩
  affects:
    - 홈 페이지 방문자 (즉각적 모바일 UI 개선)
    - 랭킹 페이지 방문자 (필터 칩 터치 타겟 + 가로 스크롤)
tech_stack:
  added: []
  patterns:
    - mobile-first Tailwind (기본값 모바일, sm: 이상 데스크탑 오버라이드)
    - CHIP_CLASS 상수 + chipStyle() 색상 분리 패턴 (CSS 변수 inline style 유지)
    - overflow-x-auto -mx-4 px-4 edge-to-edge 가로 스크롤
    - min-h-[44px] 터치 타겟 보장
key_files:
  created: []
  modified:
    - src/app/page.tsx (인라인 헤더 제거, Tailwind 그리드, 44px 링크)
    - src/app/rankings/page.tsx (인라인 헤더 제거, chip 재설계, 44px 칩, 가로 스크롤)
decisions:
  - "chip() CSSProperties 반환 → chipStyle()(색상만) + CHIP_CLASS 상수 분리 — CSS 변수는 Tailwind로 표현 불가하므로 D-08 규칙 준수"
  - "홈 page.tsx Suspense 제거 — 헤더 UserMenu 제거 후 미사용 (UserMenu는 AppHeader로 이동됨)"
  - "랭킹 footer 카페 CTA 링크에 min-h-[44px] 추가 — 외부 링크도 44px 규칙 적용"
metrics:
  duration: "~15분"
  completed_date: "2026-06-23"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 29 Plan 02: 홈+랭킹 페이지 Mobile-First 재작성 Summary

**One-liner:** 홈/랭킹 인라인 헤더 전체 삭제, inline style 레이아웃 → Tailwind mobile-first 전환, 랭킹 필터 칩 44px 터치 타겟 + 가로 스크롤 적용.

## What Was Built

Plan 01에서 완성된 AppHeader + BottomTabBar 인프라를 기반으로, 가장 많이 방문하는 두 페이지(홈 · 랭킹)의 인라인 헤더를 제거하고 레이아웃을 mobile-first Tailwind로 전환했다.

### Task 1: 홈 페이지 (src/app/page.tsx)

**인라인 헤더 제거:**
- `<header style={{ height: 60, ... }}>` 전체 블록 삭제 (로고 + nav + 검색바 + UserMenu 포함)
- `UserMenu`, `Suspense`, `SearchIcon`, `BellIcon` — 모두 헤더 전용이었으므로 import/함수 함께 제거
- AppHeader (layout.tsx)가 모든 페이지 공통 헤더를 담당하므로 중복 제거

**레이아웃 전환:**
- 외부 `<div style={{ display:'flex', flexDirection:'column' }}>` → 제거 (layout.tsx의 flex 구조 활용)
- `<main style={{ flex:1, padding:'32px 48px', maxWidth:1280, ... }}>` → `<main className="px-4 py-6 sm:px-8 sm:py10 max-w-screen-xl mx-auto w-full">`
- 신고가 그리드: `gridTemplateColumns:'repeat(4,1fr)'` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`
- 분양 섹션: `marginTop:48` → `mt-12`, `marginBottom:24` → `mb-6`
- 분양 가로 스크롤 행: `display:'flex', gap:12, overflowX:'auto'` → `flex gap-3 overflow-x-auto pb-1`

**터치 타겟:**
- "지도에서 단지 탐색하기 →" Link: `min-h-[44px] inline-flex items-center` 추가
- "전체 보기 →" Link: `min-h-[44px] inline-flex items-center` 추가

**CSS 변수 inline style 유지 (D-08):**
- `color: 'var(--dj-orange)'`, `color: 'var(--fg-sec)'`, `font: '700 36px/1.2 var(--font-sans)'` 등 모두 유지

### Task 2: 랭킹 페이지 (src/app/rankings/page.tsx)

**인라인 헤더 제거:**
- `<header style={{ height:56, ... }}>` 전체 블록 삭제 (로고 + nav + UserMenu 포함)
- `UserMenu`, `Suspense` import 제거

**chip() 함수 재설계 (핵심):**
```tsx
// Before: CSSProperties 전체 반환
function chip(active: boolean): React.CSSProperties { ... }
<Link style={chip(d === activeDate)}>

// After: 색상만 inline, 레이아웃은 Tailwind 상수
const CHIP_CLASS = 'inline-flex items-center px-3 rounded-full text-xs font-bold whitespace-nowrap shrink-0 min-h-[44px]'
function chipStyle(active: boolean): React.CSSProperties { /* 색상만 */ }
<Link className={CHIP_CLASS} style={chipStyle(d === activeDate)}>
```

**필터 칩 행 가로 스크롤:**
- `display:'flex', gap:6, overflowX:'auto'` → `flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-4 px-4`
- `-mx-4 px-4` 패턴: 모바일에서 양 끝까지 스크롤 가능한 edge-to-edge 레이아웃

**44px 터치 타겟:**
- 날짜 칩: `min-h-[44px]` (CHIP_CLASS에 포함)
- 지역 탭 칩: `min-h-[44px]` (CHIP_CLASS에 포함)
- 카페 링크 `<a>`: `min-h-[44px]` 추가

**main 컨테이너 전환:**
- `maxWidth:680, margin:'0 auto', padding:'20px 16px 40px'` → `px-4 py-5 pb-10 sm:max-w-3xl sm:mx-auto`

**SectionHeader 컴포넌트:**
- `style={{ display:'flex', alignItems:'center', ... marginBottom:12 }}` → `flex items-center justify-between gap-2 mb-3`

**섹션 wrapper:**
- `style={{ marginBottom: 32 }}` → `mb-8`

**footer:**
- 인라인 스타일 레이아웃 → `border-t py-5 px-4`, 내부 div → `sm:max-w-3xl sm:mx-auto flex items-center justify-between gap-3 flex-wrap`

## Commits

| Hash | Message |
|------|---------|
| 7993543 | feat(29-02): home page mobile-first rewrite — remove inline header, Tailwind grid |
| 58b7c8f | feat(29-02): rankings page mobile-first rewrite — 44px chips, overflow-x-auto scroll |

## Deviations from Plan

### Auto-fixed Issues

없음 — 계획대로 정확히 실행됨.

### 범위 외 발견 이슈 (deferred)

**1. [Pre-existing] HagwonRecommendSheet.tsx lint 오류**
- **발견:** Plan 02 lint 검증 중
- **파일:** `src/components/complex/HagwonRecommendSheet.tsx:290`
- **내용:** `react/no-unescaped-entities` — `"` 이스케이프 필요
- **조치:** `.planning/phases/29-mobile-optimization/deferred-items.md`에 기록. 내 변경과 무관한 기존 오류이므로 수정 안 함.

## Known Stubs

없음 — 두 파일 모두 데이터 완전 연결 상태 유지. 레이아웃/스타일 변환만 수행했으므로 기존 데이터 소스 그대로.

## Threat Flags

없음 — 새로운 API 엔드포인트/auth 경로/외부 네트워크 호출 없음. ISR (`revalidate = 60`, `revalidate = 3600`) 유지로 T-29-04 위협 완화됨.

## Self-Check: PASSED

- [x] `src/app/page.tsx` — `export const revalidate = 60` 존재
- [x] `src/app/page.tsx` — `'use client'` 없음
- [x] `src/app/page.tsx` — 인라인 `<header>` 없음
- [x] `src/app/page.tsx` — `max-sm:` 패턴 없음 (0건)
- [x] `src/app/page.tsx` — `px-4` 포함 (main 컨테이너)
- [x] `src/app/page.tsx` — `min-h-[44px]` 존재 (2개 링크)
- [x] `src/app/rankings/page.tsx` — `export const revalidate = 3600` 존재
- [x] `src/app/rankings/page.tsx` — `'use client'` 없음
- [x] `src/app/rankings/page.tsx` — 인라인 `<header>` 없음
- [x] `src/app/rankings/page.tsx` — `max-sm:` 패턴 없음 (0건)
- [x] `src/app/rankings/page.tsx` — `min-h-[44px]` CHIP_CLASS 포함 + footer 링크
- [x] `src/app/rankings/page.tsx` — `overflow-x-auto` 2개 칩 행 포함
- [x] `npx tsc --noEmit` 통과 (에러 없음)
- [x] 수정 파일 ESLint 통과 (HagwonRecommendSheet.tsx 기존 오류는 범위 외)
- [x] 커밋 7993543, 58b7c8f 모두 존재
