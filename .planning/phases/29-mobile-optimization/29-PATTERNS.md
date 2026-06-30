# Phase 29: 모바일 최적화 (Mobile-First UX) - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 12 new/modified files
**Analogs found:** 11 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/layout/AppHeader.tsx` | component (layout) | request-response | `src/components/admin/AdminSidebarDrawer.tsx` | role-match (client nav, pathname-aware) |
| `src/components/layout/BottomTabBar.tsx` | component (layout, nav) | request-response | `src/components/admin/AdminSidebarLinks.tsx` | exact (usePathname active detection, Link nav) |
| `src/components/ui/BottomSheet.tsx` | component (ui, modal) | event-driven | `src/components/complex/HagwonRecommendSheet.tsx` | exact (createPortal fixed overlay pattern) |
| `src/app/layout.tsx` | config (global layout) | request-response | self (existing layout.tsx) | self-modify |
| `src/app/page.tsx` | page (RSC, ISR) | request-response | `src/app/presale/page.tsx` | role-match (Tailwind responsive grid already used) |
| `src/app/rankings/page.tsx` | page (RSC, ISR) | request-response | `src/app/rankings/page.tsx` | self-modify (inline style → Tailwind) |
| `src/app/complexes/[id]/page.tsx` | page (RSC, ISR) | request-response | `src/app/complexes/[id]/page.tsx` | self-modify + DealTypeTabs |
| `src/app/presale/page.tsx` | page (RSC, dynamic) | request-response | `src/app/presale/page.tsx` | self-modify (already has Tailwind grid) |
| `src/app/invest/page.tsx` | page (RSC, ISR) | request-response | `src/app/invest/page.tsx` | self-modify (inline style → Tailwind) |
| `src/components/complex/CompareFloatingBar.tsx` | component (ui, floating) | event-driven | self (existing CompareFloatingBar.tsx) | self-modify (bottom offset only) |
| `src/components/layout/Footer.tsx` | component (layout) | request-response | self (existing Footer.tsx) | self-modify (add `hidden sm:block`) |
| `src/components/hagwon/HagwonRecommendSheet.tsx` | component (ui, sheet) | event-driven | `src/components/complex/HagwonRecommendSheet.tsx` | self-modify (wrap with shared BottomSheet) |

---

## Pattern Assignments

### `src/components/layout/AppHeader.tsx` (NEW — component, request-response)

**Analog:** `src/components/admin/AdminSidebarDrawer.tsx` (client component, sticky header behavior, SVG icons)
**Additional analog:** `src/app/page.tsx` lines 59–73 (BellIcon SVG) + lines 110–195 (existing header structure to replace)

**Type directive + imports** (from AdminSidebarDrawer.tsx lines 1–5):
```tsx
'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
// AppHeader will use: lucide-react Bell, Link from 'next/link'
```

**Semantic HTML + data-capture-hide pattern** (from RESEARCH.md Pattern 1 + ShareButton.tsx line 127):
```tsx
<header
  aria-label="상단 헤더"
  className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 bg-white border-b border-[var(--line-default)]"
  data-capture-hide="true"
>
```
- `data-capture-hide="true"` is required — `ShareButton.tsx` line 127 hides `[data-capture-hide]` elements in its onclone callback.
- `h-14` = 56px per UI-SPEC.
- `z-50` — above BottomTabBar (z-40), same level as existing page headers.

**Logo pattern** (from `src/app/page.tsx` lines 126–129 and `src/app/rankings/page.tsx` line 206):
```tsx
<Link href="/" className="dj-logo">
  <span className="mark">단</span>
  <span>단지온도</span>
</Link>
```
- `dj-logo` and `mark` are existing CSS classes in globals.css. Copy this exact pattern.

**Bell icon SVG pattern** (from `src/app/page.tsx` lines 59–73):
```tsx
// BEFORE (inline in page.tsx — to be extracted):
function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}
// AFTER (AppHeader): use lucide-react Bell at size 22, strokeWidth={1.75} per UI-SPEC
// <Bell size={22} strokeWidth={1.75} />
```

**44px touch target pattern** (from UI-SPEC + CompareFloatingBar.tsx line 53):
```tsx
<button
  className="flex items-center justify-center w-11 h-11"
  aria-label="알림"
  style={{ color: 'var(--fg-pri)' }}
>
  <Bell size={22} strokeWidth={1.75} />
</button>
```
- `w-11 h-11` = 44×44px minimum touch target (D-10).

---

### `src/components/layout/BottomTabBar.tsx` (NEW — component, nav)

**Analog:** `src/components/admin/AdminSidebarLinks.tsx` — exact pattern for `usePathname()` active detection + `Link` nav items.

**Type directive + imports** (from AdminSidebarLinks.tsx lines 1–4):
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
```

**Pathname-based active detection** (from AdminSidebarLinks.tsx lines 18–25):
```tsx
// AdminSidebarLinks pattern (exact analog):
const pathname = usePathname()
// ...
const isActive = pathname.startsWith(item.href)
// For home tab specifically: pathname === '/'
```

**Fixed nav container** (from AdminSidebarDrawer.tsx lines 81–98 adapted):
```tsx
<nav
  aria-label="하단 탭 네비게이션"
  className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--line-default)]"
  style={{ height: 'calc(64px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
  data-capture-hide="true"
>
  <div className="flex h-16 items-stretch">
    {/* tabs */}
  </div>
</nav>
```
- `z-40` (below AppHeader z-50, below BottomSheet z-200).
- `data-capture-hide="true"` required (same reason as AppHeader — ShareButton.tsx onclone logic).
- height uses CSS env() for iOS notch — inline style required (D-08 exception: env() not in Tailwind).

**Per-tab link pattern** (from AdminSidebarLinks.tsx lines 27–46, adapted to column layout):
```tsx
// AdminSidebarLinks uses isActive → fontWeight / color inline style.
// BottomTabBar adapts to flex-col icon+label layout:
const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
<Link
  key={tab.href}
  href={tab.href}
  className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px]"
  style={{ color: active ? 'var(--dj-orange)' : 'var(--fg-sec)' }}
>
  <tab.icon size={22} strokeWidth={1.75} />
  <span className="text-xs font-bold">{tab.label}</span>
</Link>
```
- `min-h-[44px]` enforces 44px touch target (D-10).
- Color via inline style — CSS variables not in Tailwind config (D-08 rule).
- `text-xs font-bold` = 12px/700 per UI-SPEC typography (tab bar labels).

**Tab definitions** (from RESEARCH.md Pattern 1 + UI-SPEC Component Inventory):
```tsx
// Icons from lucide-react (package.json confirms lucide-react ^0.487.0 installed)
import { Home, BarChart2, Building2, User } from 'lucide-react'

const TABS = [
  { href: '/',         label: '홈',   Icon: Home },
  { href: '/rankings', label: '랭킹', Icon: BarChart2 },
  { href: '/presale',  label: '분양', Icon: Building2 },
  { href: '/profile',  label: 'MY',   Icon: User },
]
```

---

### `src/components/ui/BottomSheet.tsx` (NEW — component, event-driven)

**Analog:** `src/components/complex/HagwonRecommendSheet.tsx` — this IS the pattern to extract. Read lines 407–749 for the complete bottom sheet implementation.

**Type directive** (from HagwonRecommendSheet.tsx line 1):
```tsx
'use client'
import { createPortal } from 'react-dom'
```

**Portal + overlay + sheet structure** (from HagwonRecommendSheet.tsx lines 407–467):
```tsx
// Dim backdrop (lines 409–413):
<div
  onClick={onClose}
  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }}
/>

// Sheet container (lines 415–427):
<div style={{
  position:      'fixed',
  bottom:        0, left: 0, right: 0,
  background:    'var(--bg-surface)',
  borderRadius:  '20px 20px 0 0',
  zIndex:        201,
  maxHeight:     '90vh',
  overflowY:     'auto',
  boxShadow:     '0 -8px 40px rgba(0,0,0,0.15)',
  paddingBottom: 'env(safe-area-inset-bottom, 20px)',
}}>

// Drag handle (lines 428–430):
<div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
  <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--line-default)' }} />
</div>
```

**Shared BottomSheet props interface:**
```tsx
interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}
```

**Close button** (from HagwonRecommendSheet.tsx lines 455–466, upgrade emoji → lucide-react X):
```tsx
// BEFORE (HagwonRecommendSheet.tsx line 464): ✕ text
// AFTER (shared BottomSheet — UI-SPEC specifies lucide-react X):
import { X } from 'lucide-react'
<button
  onClick={onClose}
  aria-label="닫기"
  className="absolute top-4 right-4 flex items-center justify-center w-11 h-11 rounded-full"
  style={{ background: 'var(--bg-surface-2)', border: 'none', cursor: 'pointer', color: 'var(--fg-sec)' }}
>
  <X size={20} strokeWidth={1.75} />
</button>
```

**Decision note — Vaul vs self-implementation:**
RESEARCH.md recommends Vaul for 3+ bottom sheets. UI-SPEC confirms Vaul 1.1.2. However, HagwonRecommendSheet's createPortal pattern is fully verified and works. The planner should decide: if using Vaul, the sheet wraps `Drawer.Root/Portal/Overlay/Content`; if using createPortal, copy HagwonRecommendSheet lines 407–430 exactly. Either way, the prop interface above is the same.

---

### `src/app/layout.tsx` (MODIFY — config, global layout)

**Existing file:** `src/app/layout.tsx` lines 1–62 (already read in full).

**Current body** (line 54):
```tsx
<body className="font-sans antialiased">
```

**Required changes:**
1. Add `viewportFit: 'cover'` to viewport export (lines 30–34) — required for iOS `env(safe-area-inset-bottom)`.
2. Add `pb-[calc(64px+env(safe-area-inset-bottom,0px))]` to body className.
3. Add `<AppHeader />` before `<NuqsAdapter>`.
4. Add `<BottomTabBar />` after `<Footer />`.
5. Wrap `<Footer />` with `hidden sm:block` class.

**Pattern for viewport** (from RESEARCH.md Pitfall 3):
```tsx
export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',  // ADD: enables env(safe-area-inset-bottom) on iOS
}
```

**Pattern for body + component order** (from RESEARCH.md Pattern 2 + UI-SPEC Layout Contract):
```tsx
<body className="font-sans antialiased pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
  <AppHeader />
  <NuqsAdapter>
    {children}
  </NuqsAdapter>
  <div className="hidden sm:block">
    <Footer />
  </div>
  <BottomTabBar />
</body>
```

---

### `src/app/page.tsx` (MODIFY — page, RSC, ISR)

**Existing file:** `src/app/page.tsx` lines 1–24 (ISR: `export const revalidate = 60`).

**CRITICAL:** Page stays RSC. Do NOT add `'use client'` to this file — ISR would break.

**Pattern to remove:** Lines 110–195 (entire `<header>` block with inline nav links). AppHeader in layout.tsx replaces it.

**Current desktop-first main** (line 198):
```tsx
// BEFORE:
<main style={{ flex: 1, padding: '32px 48px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>

// AFTER (D-06, D-09 — mobile-first Tailwind):
<main className="px-4 py-6 sm:px-8 sm:py-10 max-w-screen-xl mx-auto w-full">
```

**Presale page Tailwind grid analog** (from `src/app/presale/page.tsx` line 92 — the one verified Tailwind grid in the codebase):
```tsx
// presale/page.tsx line 92 — copy this responsive grid pattern:
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
```

**Inline style → Tailwind conversion pattern** (from RESEARCH.md Pattern 6):
```tsx
// Before (desktop-first inline style):
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
// After (mobile-first Tailwind):
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

// Before:
<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
// After:
<div className="flex flex-wrap gap-4">
```

---

### `src/app/rankings/page.tsx` (MODIFY — page, RSC, ISR)

**Existing file:** `src/app/rankings/page.tsx` (revalidate = 3600).

**Pattern to remove:** Lines 204–218 (entire `<header>` with nav links). AppHeader replaces it.

**Current main container** (line 220):
```tsx
// BEFORE:
<main style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 40px' }}>

// AFTER (D-09 — mobile-first):
<main className="px-4 py-5 pb-10 sm:max-w-3xl sm:mx-auto">
```

**Chip filter pattern** — existing `chip()` function at lines 73–82 uses inline styles. Convert to Tailwind while keeping CSS-variable colors as inline style (D-08):
```tsx
// BEFORE (existing chip function, rankings/page.tsx lines 73–82):
function chip(active: boolean): React.CSSProperties {
  return {
    display: 'inline-block', padding: '6px 12px', borderRadius: 20,
    font: '600 12px/1 var(--font-sans)', textDecoration: 'none',
    background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color:      active ? '#fff' : 'var(--fg-sec)',
    // ...
  }
}
// AFTER — 44px touch target required (D-10), use Tailwind for layout:
<Link
  className="inline-flex items-center px-3 py-3 rounded-full text-xs font-bold whitespace-nowrap shrink-0 min-h-[44px]"
  style={{ background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)', color: active ? '#fff' : 'var(--fg-sec)' }}
>
```

**Chip row scroll** (for filter chips that overflow on mobile):
```tsx
<div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
  {/* chips */}
</div>
```

**BottomTabBar capture exclusion** — BottomTabBar already has `data-capture-hide="true"`. No additional work needed on rankings page itself. The ShareButton.tsx onclone at line 127 handles `[data-capture-hide]` elements automatically.

---

### `src/app/complexes/[id]/page.tsx` (MODIFY — page, RSC, ISR)

**Existing file:** `src/app/complexes/[id]/page.tsx` (revalidate = 86400).

**Pattern to remove:** Lines 380–417 (entire `<header>` with nav + action buttons). AppHeader replaces it. Action buttons (ShareButton, FavoriteButton, CompareAddButton, 알림 설정) move into page body below hero.

**Current desktop 2-column grid** (lines 420–428):
```tsx
// BEFORE:
<main style={{
  padding: '24px 32px',
  display: 'grid',
  gridTemplateColumns: '1fr 360px',
  gap: 24,
  maxWidth: 1280,
  margin: '0 auto',
}}>

// AFTER (mobile-first, desktop sidebar):
<main className="px-4 py-4 sm:px-6 sm:py-6 max-w-screen-xl mx-auto grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
```

**DealTypeTabs tab pattern** — existing `DealTypeTabs.tsx` lines 78–93 shows tab row structure. For swipe, the planner should extend this with Embla wrapping the content area, not the tab buttons themselves.

**Sticky tab bar below AppHeader** (new pattern for complex detail):
```tsx
// Tab bar sticks below AppHeader (top-14 = 56px AppHeader height):
<div className="sticky top-14 z-30 bg-white border-b border-[var(--line-default)]">
  {/* tab buttons */}
</div>
```

---

### `src/app/presale/page.tsx` (MODIFY — page, RSC, dynamic)

**Existing file:** `src/app/presale/page.tsx` — already has the best Tailwind patterns in the project.

**Pattern to remove:** Lines 35–50 (inline header). AppHeader replaces it.

**Keep as-is:** Lines 92, 120 — `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"` — this is already the correct mobile-first Tailwind pattern. All other page grids should copy this.

**Current main container** (line 52):
```tsx
// BEFORE:
<main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

// AFTER:
<main className="px-4 py-6 sm:px-6 sm:max-w-3xl sm:mx-auto">
```

---

### `src/app/invest/page.tsx` (MODIFY — page, RSC, ISR)

**Existing file:** `src/app/invest/page.tsx` (revalidate = 3600).

**Pattern to remove:** Lines 143–165 (desktop-first header block). AppHeader replaces it.

**Filter chip pattern** (existing `tabStyle` function at lines 130–140 — same conversion needed as rankings):
```tsx
// BEFORE (tabStyle inline object, invest/page.tsx line 130):
const tabStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-block', padding: '5px 12px', borderRadius: 6,
  font: '500 12px/1 var(--font-sans)', textDecoration: 'none',
  background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
  // ...
})

// AFTER — 44px min-height, Tailwind layout:
<Link
  className="inline-flex items-center px-3 rounded-[6px] text-xs font-medium whitespace-nowrap min-h-[44px]"
  style={{ background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)', color: active ? '#fff' : 'var(--fg-sec)', border: '1px solid var(--line-subtle)' }}
>
```

**Main container conversion** (from RESEARCH.md Pattern 6):
```tsx
// BEFORE (invest/page.tsx line 143):
<div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>

// AFTER:
<div className="min-h-screen">
  {/* background: var(--bg-canvas) is set via globals.css body — no inline needed */}
```

---

### `src/components/complex/CompareFloatingBar.tsx` (MODIFY — component, floating, event-driven)

**Existing file:** `src/components/complex/CompareFloatingBar.tsx` — read in full (lines 1–60).

**Single line change** (line 49):
```tsx
// BEFORE (line 49):
bottom: 80,

// AFTER (RESEARCH.md Pattern 7):
bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)',
```
This is the only required change. The rest of the file (nuqs state management, localStorage sync) is unchanged.

---

### `src/components/layout/Footer.tsx` (MODIFY — component, layout)

**Existing file:** `src/components/layout/Footer.tsx` — read in full (lines 1–45).

**Required change** — handled in `layout.tsx` by wrapping `<Footer />`:
```tsx
// In layout.tsx (preferred approach — no change to Footer.tsx itself):
<div className="hidden sm:block">
  <Footer />
</div>
```
Alternatively, add `className="hidden sm:block"` to the `<footer>` element at line 13 of Footer.tsx directly. Either approach satisfies D-11 (footer hidden on mobile, BottomTabBar takes its role).

---

### `src/components/hagwon/HagwonRecommendSheet.tsx` (MODIFY — component, event-driven)

**Note:** File is currently at `src/components/complex/HagwonRecommendSheet.tsx` (confirmed by Grep). The phase targets moving/renaming it to `src/components/hagwon/HagwonRecommendSheet.tsx` or keeping the path and wrapping it.

**Current portal structure** (lines 407–430 — the sheet wrapper to be replaced by shared BottomSheet):
```tsx
// The wrapping structure (lines 407–430) is replaced by <BottomSheet>:
// BEFORE: manual createPortal + fixed overlay + sheet div
// AFTER: <BottomSheet open={open} onClose={onClose} title="AI 맞춤 학원 추천">
//          {/* step content: lines 469–745 */}
//        </BottomSheet>

// Keep all internal step logic (useState, step machine, form chips) — lines 312–405.
// Only remove the createPortal wrapper and replace with <BottomSheet>.
```

---

## Shared Patterns

### Pattern A: Inline Header Removal (applies to all page.tsx files)

**Source:** Multiple page.tsx files (home lines 110–195, rankings lines 204–218, complexes lines 380–417, presale lines 35–50, invest lines 143+)
**Apply to:** ALL 5 page.tsx modifications
**Action:** Delete the `<header>` block in each page. The shared `<AppHeader />` in `layout.tsx` replaces all of them. After deletion, start each page's return value directly with `<main>` or a wrapper `<div>`.

---

### Pattern B: data-capture-hide Attribute

**Source:** `src/components/rankings/ShareButton.tsx` lines 127–130
```tsx
// ShareButton.tsx onclone (line 127):
cloned.querySelectorAll('[data-capture-hide]').forEach(node => {
  (node as HTMLElement).style.display = 'none'
})
```
**Apply to:** `AppHeader` and `BottomTabBar` — both must have `data-capture-hide="true"` on their root element. This is already the project's established pattern (ShareButton also has it on line 196: `data-capture-hide="true"`).

---

### Pattern C: CSS Variable Colors in Inline Styles (D-08)

**Source:** All existing components — HagwonRecommendSheet.tsx, AdminSidebarLinks.tsx, CompareFloatingBar.tsx
**Rule:** CSS custom properties (`--dj-orange`, `--fg-sec`, `--fg-pri`, `--bg-surface-2`, `--line-default`, `--line-subtle`) are NOT in the Tailwind config. They MUST use inline style.

```tsx
// CORRECT pattern (AdminSidebarLinks.tsx line 41):
style={{ color: isActive ? 'var(--fg-pri)' : 'var(--fg-sec)', background: isActive ? 'var(--bg-surface-2)' : 'transparent' }}

// WRONG (would not work):
className={`text-[var(--fg-pri)]`}  // JIT may not generate this
```

---

### Pattern D: ISR Page Safety (RSC constraint)

**Source:** `src/app/page.tsx` line 23, `src/app/rankings/page.tsx` line 20, `src/app/complexes/[id]/page.tsx` line 47
**Apply to:** All 5 page.tsx modifications
```tsx
// These exports must remain at the TOP of each file and coexist with RSC:
export const revalidate = 60     // page.tsx
export const revalidate = 3600   // rankings/page.tsx, invest/page.tsx
export const revalidate = 86400  // complexes/[id]/page.tsx
// export const dynamic = 'force-dynamic' // presale/page.tsx

// NEVER add 'use client' to these files.
// Client interactivity (tab active, swipe) → extract to separate child components.
```

---

### Pattern E: 44px Touch Target

**Source:** `src/components/complex/CompareFloatingBar.tsx` line 53 (`minHeight: 44`), `src/components/complex/DealTypeTabs.tsx` lines 123–124 (`minHeight: 32` — needs upgrade)
**Apply to:** All buttons, links, chips across all 5 page rewrites

```tsx
// Tailwind: min-h-[44px] min-w-[44px] on interactive elements
// For chips that are visually smaller, use padding to reach 44px height:
<button className="inline-flex items-center px-3 min-h-[44px] rounded-full text-xs font-bold">
  chip text
</button>
// DealTypeTabs chips currently use minHeight: 32 — must be upgraded to 44px (D-10)
```

---

### Pattern F: safe-area-inset-bottom

**Source:** `src/components/complex/HagwonRecommendSheet.tsx` line 425 (`paddingBottom: 'env(safe-area-inset-bottom, 20px)'`)
**Apply to:** BottomTabBar (0px fallback), BottomSheet (20px fallback), body padding in layout.tsx

```tsx
// Three usages:
// 1. BottomTabBar height:
style={{ height: 'calc(64px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
// 2. BottomSheet content:
style={{ paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}
// 3. Body (layout.tsx):
className="pb-[calc(64px+env(safe-area-inset-bottom,0px))]"
// All env() expressions must use inline style (not Tailwind) — except body which uses Tailwind arbitrary value
```

---

### Pattern G: Tailwind Mobile-First Grid/Layout (D-06)

**Source (only verified Tailwind grid in codebase):** `src/app/presale/page.tsx` line 92
```tsx
// The ONE existing Tailwind responsive grid — use as template for ALL new grids:
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"

// Content width pattern (D-09):
className="px-4 py-6 sm:px-8 sm:py-8 max-w-screen-xl mx-auto"   // full-width pages
className="px-4 py-6 sm:max-w-3xl sm:mx-auto"                     // narrow pages (rankings, presale)

// FORBIDDEN: max-sm: prefix. All responsive overrides use sm:/md:/lg: (mobile-first).
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Embla tab swipe extension of `DealTypeTabs.tsx` | component (client) | event-driven | No carousel/swipe pattern exists in codebase. RESEARCH.md Pattern 5 provides the Embla API pattern (`useEmblaCarousel`, `emblaApi.on('select', cb)`, nuqs sync). Planner should reference RESEARCH.md Pattern 5 + Pitfall 6 for the URL-sync implementation. |

---

## Key Observations for Planner

1. **Header removal is the biggest structural change.** Five page.tsx files each have an inline `<header>` block that must be deleted. Pattern A above documents which lines to remove per file.

2. **HagwonRecommendSheet is at `src/components/complex/`, not `src/components/hagwon/`.** Grep confirms `src/components/complex/HagwonRecommendSheet.tsx`. The phase spec says to migrate to shared BottomSheet — the file stays in place and its createPortal wrapper (lines 407–430) is replaced by `<BottomSheet>`.

3. **lucide-react is already installed** (package.json, version ^0.487.0 confirmed by UI-SPEC). RESEARCH.md Assumption A1 is resolved: use `lucide-react` icons, NOT hand-rolled SVG paths. CLAUDE.md's "SVG path only" prohibition applies to emoji icons, not icon libraries.

4. **presale/page.tsx is the Tailwind role model.** It's the only page with verified responsive Tailwind grids (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). All other page rewrites should copy this pattern.

5. **z-index hierarchy to enforce:** AppHeader `z-50` → BottomTabBar `z-40` → CompareFloatingBar `z-50` → BottomSheet overlay `z-[200]` → BottomSheet content `z-[201]`. CompareFloatingBar and AppHeader share z-50 but don't overlap, so no conflict.

---

## Metadata

**Analog search scope:** `src/components/layout/`, `src/components/admin/`, `src/components/complex/`, `src/components/rankings/`, `src/app/` (all page.tsx files)
**Files read:** 16 source files
**Pattern extraction date:** 2026-06-23
