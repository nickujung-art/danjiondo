---
phase: 29-mobile-optimization
plan: "04"
subsystem: ui/pages
tags: [mobile-first, tailwind, presale, invest, touch-target]
dependency_graph:
  requires: [29-01]
  provides: [presale-mobile-layout, invest-mobile-layout]
  affects: [src/app/presale/page.tsx, src/app/invest/page.tsx]
tech_stack:
  added: []
  patterns: [mobile-first Tailwind, overflow-x-auto filter tabs, CSS var inline style split]
key_files:
  created: []
  modified:
    - src/app/presale/page.tsx
    - src/app/invest/page.tsx
decisions:
  - "tabStyle() CSSProperties 함수를 TAB_BASE_CLASS 상수 + 색상 inline style로 분리"
  - "테이블 내부 셀 inline style은 변경 범위에서 제외 (CSS 변수 색상 의존도 높음)"
metrics:
  duration: "15m"
  completed: "2026-06-23"
  tasks: 2
  files: 2
---

# Phase 29 Plan 04: 분양·투자 페이지 Mobile-First 재작성 Summary

분양(presale)·투자(invest) 두 페이지에서 인라인 헤더를 제거하고, inline style 레이아웃을 mobile-first Tailwind 클래스로 전환하여 Phase 29 목표를 완료했다.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 분양 페이지 mobile-first 재작성 | 214178d | src/app/presale/page.tsx |
| 2 | 투자 페이지 mobile-first 재작성 + 44px 필터 탭 | 59d9db8 | src/app/invest/page.tsx |

## What Was Built

### Task 1: 분양 페이지 (presale/page.tsx)

- 인라인 `<header>` nav 블록 삭제 (AppHeader가 layout.tsx에서 대체)
- Link import 제거 (헤더에서만 사용)
- `<main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>` → `className="px-4 py-6 sm:px-6 sm:max-w-3xl sm:mx-auto"`
- 섹션 `style={{ marginBottom: 40 }}` → `className="mb-10"`
- 제목 `font: '700 18px/1.3'` → `className="text-xl font-bold tracking-tight"`
- CSS 변수 색상 (`--fg-pri`, `--fg-sec`, `--fg-tertiary`, `--bg-canvas`) → inline style 유지 (D-08)
- 기존 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5` 패턴 유지 (변경 불필요)
- `export const dynamic = 'force-dynamic'` 보존

### Task 2: 투자 페이지 (invest/page.tsx)

- 인라인 `<header>` 블록 삭제 (height:60, sticky, dj-logo 포함)
- 최외곽 `<div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>` → `<div className="min-h-screen" style={{ background: 'var(--bg-canvas)' }}>`
- `<main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 32px' }}>` → `className="px-4 py-6 sm:max-w-screen-lg sm:mx-auto"`
- `tabStyle(active: boolean): React.CSSProperties` 함수 → `TAB_BASE_CLASS` 상수 + `tabStyle()` 색상 전용 함수로 분리
- 필터 탭에 `min-h-[44px]` 44px 터치 타겟 적용
- 필터 탭 행: `className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4"` (모바일 엣지 투 엣지 스크롤)
- 제목/설명 inline style → Tailwind (`text-2xl font-bold tracking-tight`, `text-lg font-bold`, `text-xs font-medium` 등)
- `export const revalidate = 3600` 보존 (ISR)

## Decisions Made

- **tabStyle() 분리 패턴**: 함수를 완전 제거 대신 `TAB_BASE_CLASS` 상수(Tailwind) + `tabStyle()` 함수(CSS 변수 색상만)로 분리. Tailwind에서 CSS 변수를 `bg-[var(--dj-orange)]` 형태로 쓰면 런타임에서 동적 토글이 안 되기 때문.
- **테이블 셀 inline style 보존**: 갭투자 테이블 셀 내부(`<td>` 폰트, `<th>` 폰트 등)는 변경 범위에서 제외. CSS 변수 색상에 의존하고 있어 Tailwind 전환 시 가독성 감소 대비 이점이 없음.
- **분양 페이지 max-w-3xl 선택**: presale는 카드 그리드 페이지이므로 narrow 기준(D-09) 적용. invest는 테이블+차트로 wide(max-w-screen-lg) 선택.

## Deviations from Plan

### Auto-fixed Issues

없음 — 계획이 정확히 일치함.

### 범위 외 조정

- `tabStyle()` 함수를 "완전 제거"하지 않고 "색상 전용 축소"로 처리. 색상 값이 CSS 변수(`--dj-orange`, `--bg-surface-2`, `--fg-sec`)이어서 Tailwind `bg-[var(...)]`로는 active 토글을 깔끔하게 표현하기 어려워 함수 형태 유지가 더 명확함.

## Known Stubs

없음.

## Threat Flags

없음 — 레이아웃 전환만 수행했으며 searchParams 처리 로직·ISR 설정은 원본 그대로 유지됨.

## Verification Results

```
✓ presale/page.tsx: export const dynamic = 'force-dynamic' 유지
✓ invest/page.tsx: export const revalidate = 3600 유지
✓ 두 파일 모두 'use client' 없음
✓ 두 파일 모두 max-sm: 패턴 없음 (0건)
✓ invest/page.tsx min-h-[44px] 포함 (line 90)
✓ 두 파일 모두 px-4 포함
✓ 5개 전체 페이지에서 dj-logo 없음 (모든 인라인 헤더 제거 완료)
✓ npm run lint — No ESLint warnings or errors
✓ npm run build — 빌드 성공 (/presale ƒ, /invest ƒ)
✓ npx tsc --noEmit — presale/invest 관련 TypeScript 오류 없음
```

## Self-Check: PASSED

- `src/app/presale/page.tsx` 존재 확인: FOUND
- `src/app/invest/page.tsx` 존재 확인: FOUND
- commit 214178d 존재: FOUND (feat(29-04): 분양 페이지 mobile-first 재작성)
- commit 59d9db8 존재: FOUND (feat(29-04): 투자 페이지 mobile-first 재작성 + 44px 필터 탭)
