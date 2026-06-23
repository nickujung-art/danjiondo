---
phase: 29
slug: mobile-optimization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 |
| **Config file** | package.json scripts (`"test": "vitest run"`) |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npm run lint`
- **Before `/gsd-verify-work`:** `npm run test && npm run lint && npm run build`
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-00-01 | 00 | 0 | MOB-01 | — | BottomTabBar renders 4 tabs, aria-label, data-capture-hide | unit | `npm run test -- BottomTabBar` | ❌ W0 | ⬜ pending |
| 29-00-02 | 00 | 0 | MOB-01 | — | AppHeader renders logo + bell + aria-label | unit | `npm run test -- AppHeader` | ❌ W0 | ⬜ pending |
| 29-00-03 | 00 | 0 | MOB-06 | — | BottomSheet open/close, title prop rendered | unit | `npm run test -- BottomSheet` | ❌ W0 | ⬜ pending |
| 29-01-01 | 01 | 1 | MOB-01 | — | npm install vaul embla-carousel-react succeeds | shell | `node -e "require('vaul')"` | ✅ | ⬜ pending |
| 29-01-02 | 01 | 1 | MOB-01/06 | — | AppHeader + BottomTabBar + BottomSheet RED tests turn GREEN | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 29-01-03 | 01 | 1 | MOB-01 | — | layout.tsx integrates both, TypeScript clean | build | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 29-02-01 | 02 | 2 | MOB-02 | — | 홈 page mobile-first, min-h-[44px] on CTAs | build | `grep -n "min-h-\[44px\]" src/app/page.tsx` | ✅ | ⬜ pending |
| 29-02-02 | 02 | 2 | MOB-03 | — | 랭킹 page mobile-first, BottomTabBar data-capture-hide | shell | `grep -n "data-capture-hide" src/components/layout/BottomTabBar.tsx` | ✅ | ⬜ pending |
| 29-03-01 | 03 | 2 | MOB-04 | T-29-06 | ISR preserved, no 'use client' in page.tsx | shell | `grep -n "export const revalidate" "src/app/complexes/[id]/page.tsx"` | ✅ | ⬜ pending |
| 29-03-02a | 03 | 2 | MOB-04 | T-29-07 | DealTypeTabs Embla swipe + nuqs sync | shell | `grep -n "useEmblaCarousel" src/components/complex/DealTypeTabs.tsx` | ✅ | ⬜ pending |
| 29-03-02b | 03 | 2 | MOB-06 | — | HagwonRecommendSheet uses shared BottomSheet | shell | `grep -n "BottomSheet" src/components/complex/HagwonRecommendSheet.tsx` | ✅ | ⬜ pending |
| 29-03-03 | 03 | 2 | MOB-04/06 | D-11 | EducationCard SchoolDetailSheet + 순위 → BottomSheet | shell | `grep -n "BottomSheet" src/components/complex/EducationCard.tsx` | ✅ | ⬜ pending |
| 29-03-04 | 03 | 2 | MOB-04 | D-11 | RedevelopmentTimeline → BottomSheet trigger | shell | `grep -n "RedevelopmentSheet\|BottomSheet" "src/app/complexes/[id]/page.tsx"` | ✅ | ⬜ pending |
| 29-04-01 | 04 | 3 | MOB-05 | — | 분양 page mobile-first Tailwind | build | `npx tsc --noEmit 2>&1 \| grep presale` | ✅ | ⬜ pending |
| 29-04-02 | 04 | 3 | MOB-05 | — | 투자 page mobile-first Tailwind | build | `npx tsc --noEmit 2>&1 \| grep invest` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/layout/BottomTabBar.test.tsx` — covers MOB-01 (탭 렌더링, active 상태, data-capture-hide)
- [ ] `src/components/layout/AppHeader.test.tsx` — covers MOB-01 (로고, 알림 버튼, aria-label)
- [ ] `src/components/ui/BottomSheet.test.tsx` — covers MOB-06 (open/close, title prop, portal)
- [ ] Framework install: `npm install vaul embla-carousel-react` — required for Wave 1 components

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 탭 스와이프 제스처 (터치 이벤트) | MOB-04 | Vitest는 브라우저 터치 이벤트 미지원 | Chrome DevTools → 모바일 시뮬레이션 → /complexes/[id] 진입 → 탭 콘텐츠 좌우 스와이프 확인 |
| iOS safe-area (홈 인디케이터 영역) | MOB-01 | 실기기 또는 iOS 시뮬레이터 필요 | iPhone Safari에서 BottomTabBar가 홈 인디케이터에 가리지 않는지 확인 |
| html2canvas 캡처 (BottomTabBar 미포함) | MOB-03 | DOM 스냅샷 테스트 불필요 | 랭킹 페이지 공유 버튼 → 캡처 이미지에 BottomTabBar 없음 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
