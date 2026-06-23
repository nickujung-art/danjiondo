# Phase 29: 모바일 최적화 (Mobile-First UX) - Research

**Researched:** 2026-06-23
**Domain:** Next.js 15 App Router · Tailwind 3.4 · React 19 · 모바일 UI 패턴
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01**: 하단 탭바 도입 — 홈 / 랭킹 / 분양 / MY 4개 탭. 데스크탑 포함 항상 표시.
- **D-02**: 상단 헤더 축소 — 로고 + 알림아이콘만. 기존 페이지 링크 전부 제거.
- **D-03**: 상/하단 동시 표시 — md 이상에서도 상단 헤더 + 하단 탭바 모두 표시.
- **D-04**: 공유 레이아웃 컴포넌트 — `src/components/layout/AppHeader.tsx` + `src/components/layout/BottomTabBar.tsx` 신규 작성. `src/app/layout.tsx`에 통합. 기존 각 page.tsx 인라인 헤더 제거.
- **D-05**: MY 탭 — 즐겨찾기·알림·프로필 통합. 로그인 유도 진입점.
- **D-06**: 모바일-first Tailwind — 기본값이 모바일 레이아웃, `sm:` 이상에서 데스크탑 오버라이드. `max-sm:` 패턴 사용 금지.
- **D-07**: 페이지 단위 순차 진행 — 홈 → 랭킹 → 단지상세 → 분양 → 투자.
- **D-08**: inline styles → Tailwind 전환 — 레이아웃/간격/타이포그래피 관련 inline style을 Tailwind 클래스로 교체. 색상·브랜드 값은 inline style 유지 가능.
- **D-09**: 컨텐츠 너비 — 모바일 100% 너비 + `px-4`(16px) 패딩. 데스크탑은 `max-w-3xl mx-auto` 또는 `max-w-screen-lg`.
- **D-10**: 44px 최소 터치 타겟 — 모든 버튼·링크·칩에 `min-h-[44px] min-w-[44px]` 적용.
- **D-11**: 바텀시트 적극 도입 — 단지상세의 각 섹션(교육 팝업, 학원 추천, 재건축 타임라인) + 지도 사이드패널은 모바일에서 바텀시트로 제공. HagwonRecommendSheet(Phase 28)는 유지.
- **D-12**: 탭 스와이프 도입 — 단지상세 탭 좌우 스와이프로 전환. useSwipe 또는 Embla/Swiper 경량 라이브러리 사용.
- **D-13**: 스와이프 범위 — 탭 전환 스와이프만. 전체 페이지 제스처 시스템 도입 안 함.

### Claude's Discretion
- 하단 탭바 높이·스타일 (64px 권장, safe-area-inset-bottom 적용)
- 탭바 아이콘 SVG (기존 CLAUDE.md 규칙: 이모지 금지, SVG path만)
- 바텀시트 구현: headless(자체 구현) vs Radix UI Dialog vs Vaul 선택
- 스와이프 라이브러리 선택 (번들 크기 최소화 기준)

### Deferred Ideas (OUT OF SCOPE)
- 지도 모바일 재설계 (Phase 30으로 처리)
- PWA 앱 클립/설치 프롬프트 개선
- 다크모드 대응
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOB-01 | AppHeader(로고+알림) + BottomTabBar(홈/랭킹/분양/MY 4탭) → src/app/layout.tsx 통합. 기존 인라인 헤더 제거. | layout.tsx 현재 구조 확인. 기존 헤더가 각 page.tsx에 인라인 존재 — 5개 이상 페이지 제거 필요. |
| MOB-02 | 홈 페이지 mobile-first 재작성 — Tailwind responsive, 44px 터치 타겟 | page.tsx 현재 inline styles 다수, `padding: 32px 48px` 데스크탑 우선 레이아웃 확인. |
| MOB-03 | 랭킹 페이지 mobile-first 재작성 — 칩 필터 44px, 공유 캡처 영역 safe-area 대응 | ShareButton.tsx의 `data-capture-hide` 패턴 존재. BottomTabBar도 동일 처리 필요. |
| MOB-04 | 단지 상세 페이지 mobile-first 재작성 — 탭 스와이프, 팝업 섹션 바텀시트 전환 | complexes/[id]/page.tsx 현재 데스크탑 2열 레이아웃. CompareFloatingBar `bottom: 80px` → 탭바 높이 반영 필요. |
| MOB-05 | 분양·투자 페이지 mobile-first 재작성 | presale/page.tsx, invest/page.tsx 모두 inline styles 기반 데스크탑 우선. |
| MOB-06 | 공유 BottomSheet 컴포넌트 — HagwonRecommendSheet 패턴 추출, 재사용 가능 컴포넌트화 | HagwonRecommendSheet.tsx 완전 분석 완료. 추출 가능한 공통 구조 확인. |
</phase_requirements>

---

## Summary

Phase 29는 코드/기능 추가가 아니라 **기존 UI를 전면 mobile-first로 재작성**하는 리팩터링 phase다. 새 API 엔드포인트, DB 마이그레이션, 외부 서비스 연동이 없다. 작업량은 순수하게 레이아웃·컴포넌트 코드 변경이며, 위험 요소는 ISR 캐시 동작 유지, html2canvas safe-area 대응, z-index 스택 충돌이다.

현재 코드베이스는 거의 모든 page.tsx와 컴포넌트가 inline `style={}` 객체를 사용한다(D-08 확인). Tailwind 클래스는 소수 컴포넌트에만 존재한다. 따라서 각 페이지 재작성 시 레이아웃·간격·타이포 관련 inline style을 Tailwind 클래스로 전환해야 하며, `var(--dj-orange)` 등 브랜드 CSS 변수는 inline style로 유지한다.

바텀시트 구현은 **Vaul**(React 전용 Drawer, 1.1.2)을 권장한다. 기존 `HagwonRecommendSheet`가 createPortal + fixed positioning 방식이므로 Vaul로 대체하면 드래그·snap·접근성을 무료로 얻는다. 번들 크기가 중요하다면 headless 자체 구현도 현실적(HagwonRecommendSheet 패턴이 이미 검증됨). 탭 스와이프는 **Embla Carousel**(8.6.0, tree-shakeable)을 권장 — Swiper(12.x)는 번들이 크고, 순수 useSwipe 훅은 모멘텀/velocity 처리가 복잡하다.

**Primary recommendation:** MOB-01(공유 레이아웃) → MOB-06(공유 BottomSheet) → MOB-02~05(페이지별 재작성) 순서. Wave 0에서 공유 인프라를 먼저 확보하고, 각 페이지는 독립 Wave로 병렬 진행 가능.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 전역 레이아웃 (AppHeader + BottomTabBar) | Frontend Server (RSC) | Browser (Client, 탭 active 상태) | layout.tsx는 RSC. active 탭 감지만 'use client' 필요 |
| 바텀시트 (BottomSheet) | Browser (Client) | — | 사용자 인터랙션·드래그·포털 전부 클라이언트 |
| 탭 스와이프 (DealTypeTabs) | Browser (Client) | — | touch event, Embla 전부 클라이언트 |
| 페이지 레이아웃 재작성 | Frontend Server (RSC) | — | 각 page.tsx는 이미 RSC, 레이아웃만 변경 |
| 공유 캡처 safe-area | Browser (Client) | — | html2canvas DOM 조작, 클라이언트 전용 |

---

## Standard Stack

### Core (이미 설치됨)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.17 | mobile-first 레이아웃 유틸리티 | 이미 프로젝트에 설치됨 [VERIFIED: package.json] |
| Next.js | 15.3.1 | App Router RSC/Client 경계 | 이미 사용 중 [VERIFIED: package.json] |
| React | 19.1.0 | createPortal(바텀시트), useRef(터치 이벤트) | 이미 사용 중 [VERIFIED: package.json] |

### 추가 필요 — 바텀시트
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vaul | 1.1.2 | 드래그 가능한 drawer/바텀시트 컴포넌트 | BottomSheet 공통 컴포넌트 구현 시 (D-11) |

### 추가 필요 — 스와이프
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| embla-carousel-react | 8.6.0 | 탭 스와이프 캐러셀 | 단지상세 탭 스와이프 (D-12) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vaul | 자체 구현(HagwonRecommendSheet 패턴) | 자체 구현은 이미 검증됨. Vaul은 드래그·snap 무료 제공이나 번들 +~15KB. 바텀시트가 3개 이상이면 Vaul이 유리. |
| embla-carousel-react | Swiper 12.x | Swiper는 번들 크기 크고(~80KB), Embla는 tree-shakeable. 탭 스와이프만이면 Embla 충분. |
| embla-carousel-react | 자체 useSwipe 훅 | 모멘텀/velocity/edge bounce 구현이 복잡. 탭이 3개 이상이면 Embla가 안전. |

**Installation:**
```bash
npm install vaul embla-carousel-react
```

**Version verification:** [VERIFIED: npm registry 2026-06-23]
- vaul: 1.1.2 (latest)
- embla-carousel-react: 8.6.0 (latest stable; 9.0.0-rc02 RC 단계이므로 stable 사용)

---

## Architecture Patterns

### System Architecture Diagram

```
src/app/layout.tsx (RSC)
  ├── <AppHeader />          ← 신규 (Client: 알림 버튼 상태)
  │     로고 | 알림 아이콘
  ├── <NuqsAdapter>
  │     {children}           ← 각 page.tsx
  ├── <Footer />             ← 기존 유지
  └── <BottomTabBar />       ← 신규 (Client: pathname 감지)
        홈 | 랭킹 | 분양 | MY

공유 BottomSheet 컴포넌트 (Client)
  ├── src/components/ui/BottomSheet.tsx     ← 신규 (MOB-06)
  └── 사용: EducationCard, RedevelopmentTimeline, HagwonRecommendSheet(교체 or 래핑)

단지상세 탭 스와이프 (Client)
  └── src/components/complex/DealTypeTabs.tsx  ← 기존 Embla로 교체/확장

페이지별 재작성 (RSC, inline style → Tailwind)
  ├── src/app/page.tsx               (MOB-02)
  ├── src/app/rankings/page.tsx      (MOB-03)
  ├── src/app/complexes/[id]/page.tsx (MOB-04)
  ├── src/app/presale/page.tsx       (MOB-05)
  └── src/app/invest/page.tsx        (MOB-05)
```

### Recommended Project Structure
```
src/
├── components/
│   ├── layout/
│   │   ├── Footer.tsx          # 기존 유지
│   │   ├── AppHeader.tsx       # 신규 (MOB-01)
│   │   └── BottomTabBar.tsx    # 신규 (MOB-01)
│   └── ui/
│       └── BottomSheet.tsx     # 신규 공통 (MOB-06)
├── app/
│   ├── layout.tsx              # AppHeader + BottomTabBar 통합 (MOB-01)
│   ├── page.tsx                # mobile-first 재작성 (MOB-02)
│   ├── rankings/page.tsx       # mobile-first 재작성 (MOB-03)
│   ├── complexes/[id]/page.tsx # mobile-first + 바텀시트 (MOB-04)
│   ├── presale/page.tsx        # mobile-first 재작성 (MOB-05)
│   └── invest/page.tsx         # mobile-first 재작성 (MOB-05)
```

### Pattern 1: BottomTabBar — active 탭 감지
**What:** `usePathname()`으로 현재 경로를 감지해 활성 탭 강조. 'use client' 필요.
**When to use:** 전역 레이아웃의 하단 탭바.
**Example:**
```tsx
// Source: Next.js 15 App Router 공식 패턴 [VERIFIED: 기존 AdminSidebarLinks.tsx 패턴]
'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { href: '/',        label: '홈',   icon: <HomeIcon /> },
  { href: '/rankings', label: '랭킹', icon: <RankIcon /> },
  { href: '/presale',  label: '분양', icon: <BldgIcon /> },
  { href: '/profile',  label: 'MY',   icon: <UserIcon /> },
]

export function BottomTabBar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="하단 탭 네비게이션"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--line-default)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
      data-capture-hide="true"
    >
      <div className="flex h-16 items-stretch">
        {TABS.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px]"
              style={{ color: active ? 'var(--dj-orange)' : 'var(--fg-sec)' }}
            >
              {tab.icon}
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

### Pattern 2: layout.tsx body 패딩 — 탭바 공간 확보
**What:** 전역 레이아웃의 `<body>`에 `pb-16` 또는 해당 높이 패딩 추가해 콘텐츠가 탭바에 가려지지 않도록.
**When to use:** BottomTabBar 통합 후 필수.
**Example:**
```tsx
// Source: [VERIFIED: 기존 layout.tsx 분석]
<body className="font-sans antialiased pb-16 sm:pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
```

### Pattern 3: BottomSheet 공통 컴포넌트 (Vaul 방식)
**What:** Vaul의 `Drawer.Root` + `Drawer.Portal` + `Drawer.Overlay` + `Drawer.Content` 조합.
**When to use:** MOB-06 — EducationCard, RedevelopmentTimeline 팝업 섹션.

```tsx
// Source: [CITED: github.com/emilkowalski/vaul]
'use client'
import { Drawer } from 'vaul'

export function BottomSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/45 z-[200]" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[20px] bg-white"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 20px)', maxHeight: '90dvh', overflowY: 'auto' }}
        >
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[var(--line-default)]" />
          <div className="px-5 pt-3 pb-4">
            <h2 className="text-[17px] font-bold">{title}</h2>
          </div>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

### Pattern 4: BottomSheet 자체 구현 (HagwonRecommendSheet 추출)
**What:** createPortal + fixed positioning 방식 (기존 HagwonRecommendSheet 패턴).
**When to use:** Vaul 미도입 시 또는 단순 표시 전용 (드래그 불필요) 시트.

```tsx
// Source: [VERIFIED: src/components/complex/HagwonRecommendSheet.tsx 분석]
'use client'
import { createPortal } from 'react-dom'

export function BottomSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return createPortal(
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/45 z-[200]" />
      <div
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[20px] z-[201] max-h-[90dvh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 20px)', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
      >
        <div className="flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-[var(--line-default)]" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line-subtle)]">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button onClick={onClose} aria-label="닫기" className="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] grid place-items-center">
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </>,
    document.body,
  )
}
```

### Pattern 5: 탭 스와이프 (Embla Carousel)
**What:** Embla의 `useEmblaCarousel` 훅으로 탭 콘텐츠를 스와이프 가능하게 연결.
**When to use:** 단지상세 DealTypeTabs.tsx (D-12).

```tsx
// Source: [CITED: embla-carousel.com/get-started/react]
'use client'
import useEmblaCarousel from 'embla-carousel-react'
import { useCallback } from 'react'

export function SwipeableTabs({ tabs, activeIndex, onTabChange }: {
  tabs: { label: string; content: React.ReactNode }[]
  activeIndex: number
  onTabChange: (i: number) => void
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: activeIndex })

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    onTabChange(emblaApi.selectedScrollSnap())
  }, [emblaApi, onTabChange])

  // useEffect → emblaApi.on('select', onSelect) 등록 필요

  return (
    <div ref={emblaRef} className="overflow-hidden">
      <div className="flex">
        {tabs.map((tab, i) => (
          <div key={i} className="min-w-full">
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Pattern 6: mobile-first Tailwind 레이아웃 변환
**What:** 기존 inline style 데스크탑 레이아웃을 Tailwind mobile-first로 전환하는 패턴.
**When to use:** MOB-02~05 페이지 재작성.

```tsx
// Before (inline style, desktop-first):
<main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 48px' }}>

// After (Tailwind, mobile-first, D-06):
<main className="px-4 py-6 sm:px-8 sm:py-8 max-w-screen-xl mx-auto">

// Before (grid, desktop-first):
<div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>

// After (Tailwind, mobile-first):
<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
```

### Pattern 7: CompareFloatingBar safe-area 보정
**What:** CompareFloatingBar가 현재 `bottom: 80px` 고정값 사용. BottomTabBar 추가 후 탭바 높이(64px) + safe-area 반영 필요.
**When to use:** MOB-01 완료 후 CompareFloatingBar 수정.

```tsx
// Before:
style={{ bottom: 80 }}

// After:
style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)' }}
```

### Anti-Patterns to Avoid
- **`max-sm:` 패턴 사용 금지**: D-06 명시. 기본이 모바일이어야 함.
- **`backdrop-filter: blur()` 사용 금지**: CLAUDE.md AI 슬롭 목록. 탭바 배경도 단순 흰색.
- **`width/height/top/margin` CSS 애니메이션 금지**: CLAUDE.md 애니메이션 규칙. compositor 속성(`transform`, `opacity`)만 허용.
- **이모지를 아이콘으로 사용 금지**: CLAUDE.md. 탭바 아이콘은 SVG path만.
- **`gradient-text`·`gradient orb`·보라/인디고 사용 금지**: CLAUDE.md AI 슬롭.
- **하단 탭바에 `data-capture-hide="true"` 없이 공유 캡처**: 탭바가 캡처 이미지에 포함됨. 반드시 `data-capture-hide="true"` 추가.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 드래그 가능한 바텀시트 | 직접 touch event + 위치 계산 | vaul | snap point, velocity-based dismiss, a11y(role=dialog, aria-modal, focus trap) 전부 내장 |
| 탭 스와이프 모멘텀 | 직접 touchstart/touchmove | embla-carousel-react | rubber-band edge, momentum velocity, RTL 지원 내장 |
| iOS safe-area 계산 | JavaScript window 높이 계산 | `env(safe-area-inset-bottom)` CSS | 브라우저가 네이티브로 처리. JS 계산은 레이아웃 재계산 유발 |
| 모달 focus trap | Tab 키 수동 추적 | vaul(내장) or radix | a11y 기준(WCAG 2.4.3) 준수 필수. 수동 구현 버그 다수 |

**Key insight:** 바텀시트와 스와이프는 엣지케이스(overscroll, momentum, focus trap, iOS 노치 등)가 많아서 직접 구현 시 QA 비용이 라이브러리 도입 비용의 10배 이상이다.

---

## Common Pitfalls

### Pitfall 1: ISR 페이지에 'use client' 헤더 추가 → revalidate 무효화
**What goes wrong:** `src/app/page.tsx`, `src/app/rankings/page.tsx` 등 ISR 페이지에 직접 'use client'를 추가하면 `export const revalidate = 60` 이 무효화된다.
**Why it happens:** 'use client'는 클라이언트 컴포넌트를 선언하며, ISR은 RSC 전용이다. layout.tsx가 클라이언트 컴포넌트를 포함해도 page.tsx 자체가 RSC이면 ISR은 유지된다.
**How to avoid:** page.tsx는 RSC 유지. 탭 active 상태·스와이프 등 인터랙션은 별도 'use client' 자식 컴포넌트로 분리.
**Warning signs:** `revalidate` export가 있는데 컴포넌트 맨 위에 'use client'가 있으면 TypeScript는 경고 안 하지만 ISR이 깨진다.

### Pitfall 2: BottomTabBar가 html2canvas 캡처에 포함됨
**What goes wrong:** ShareButton의 `captureId` 방식으로 캡처 시 BottomTabBar가 화면에 fixed 포지션으로 겹쳐 이미지에 포함된다.
**Why it happens:** html2canvas는 화면에 보이는 DOM을 캡처. 기존 코드에서는 `data-capture-hide="true"` 요소를 onclone 콜백에서 `display: none`으로 처리한다.
**How to avoid:** BottomTabBar에 반드시 `data-capture-hide="true"` 속성 추가. AppHeader에도 동일하게.
**Warning signs:** ShareButton.tsx onclone에 `[data-capture-hide]` 처리 로직 존재 (line 127).

### Pitfall 3: `env(safe-area-inset-bottom)` iOS에서 0px 반환
**What goes wrong:** iOS Safari에서 `env(safe-area-inset-bottom)`이 0을 반환하는 케이스.
**Why it happens:** `<meta name="viewport">` 에 `viewport-fit=cover`가 없으면 safe area 인셋이 계산되지 않는다.
**How to avoid:** `src/app/layout.tsx`의 `viewport` export에 `viewportFit: 'cover'` 추가 필요.

```tsx
// 현재 layout.tsx viewport:
export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  // viewportFit: 'cover'  ← 추가 필요
}
```

**Warning signs:** iOS 기기에서 화면 하단 노치/홈 바 영역에 탭바 콘텐츠가 겹친다.

### Pitfall 4: CompareFloatingBar + BottomTabBar z-index/bottom 충돌
**What goes wrong:** CompareFloatingBar (`bottom: 80px`, `zIndex: 50`)가 BottomTabBar(64px 높이) 위에 떠서 탭바를 가린다.
**Why it happens:** CompareFloatingBar의 bottom은 탭바 높이를 고려하지 않은 고정값.
**How to avoid:** CompareFloatingBar의 bottom을 `calc(64px + env(safe-area-inset-bottom, 0px) + 16px)`로 변경.
**Warning signs:** 단지 비교 버튼이 하단 탭바를 가린다.

### Pitfall 5: Tailwind 클래스가 purge되어 빌드 시 사라짐
**What goes wrong:** 동적으로 생성한 Tailwind 클래스(예: `` `bg-${color}-500` ``)가 프로덕션 빌드에서 사라진다.
**Why it happens:** Tailwind의 JIT는 정적 클래스만 감지한다.
**How to avoid:** 모든 Tailwind 클래스는 완전한 정적 문자열로 작성. 조건부 스타일은 `cn()` 또는 삼항 연산자로 전체 클래스명 전달.
**Warning signs:** 개발 환경에서는 정상이지만 `npm run build` 후 스타일이 사라진다.

### Pitfall 6: DealTypeTabs Embla + nuqs URL 상태 동기화
**What goes wrong:** Embla 스와이프로 탭 전환 시 URL의 `area_type` searchParam이 업데이트되지 않거나, URL로 직접 진입 시 Embla가 잘못된 탭으로 시작한다.
**Why it happens:** Embla의 내부 인덱스 상태와 nuqs URL 상태가 별도로 존재.
**How to avoid:** `emblaApi.on('select', callback)`으로 스와이프 완료 후 nuqs 상태 업데이트. 초기 마운트 시 `startIndex: urlTabIndex`로 Embla 초기화.

---

## Code Examples

### AppHeader SVG 아이콘 (이모지 금지 준수)
```tsx
// Source: [VERIFIED: 기존 codebase 패턴 — src/app/page.tsx BellIcon]
function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}
```

### 탭바 탭 아이콘 예시 (SVG only)
```tsx
// Source: [ASSUMED — 프로젝트 아이콘 패턴 기반]
function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
}
function ChartIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m7 16 4-4 4 4 4-4"/></svg>
}
function BuildingIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10M12 7h.01M12 11h.01"/></svg>
}
function UserIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
}
```

### mobile-first 헤더 (인라인 스타일 → Tailwind)
```tsx
// Source: [VERIFIED: 기존 page.tsx + D-06 방침]
// Before: 데스크탑 우선 inline style
// After: mobile-first Tailwind
<header className="sticky top-0 z-50 flex h-14 items-center justify-between px-4 bg-white border-b border-[var(--line-default)]">
  <Link href="/" className="dj-logo">
    <span className="mark">단</span>
    <span>단지온도</span>
  </Link>
  <button className="flex items-center justify-center w-11 h-11" aria-label="알림">
    <BellIcon />
  </button>
</header>
```

### MY 탭 — 로그인 상태 분기
```tsx
// Source: [VERIFIED: 기존 UserMenu.tsx + profile/page.tsx 패턴 분석]
// BottomTabBar에서 MY 탭 href 결정
const myHref = isLoggedIn ? '/profile' : '/login?next=/profile'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drawer 직접 구현 (createPortal) | Vaul (드래그 가능) | 2023~2024 | 접근성·드래그 기본 제공 |
| Swiper (jQuery era) | Embla Carousel | 2021+ | 번들 크기 50% 이상 감소, tree-shakeable |
| iOS safe-area JS 계산 | `env(safe-area-inset-bottom)` CSS | iOS 11+ | 레이아웃 재계산 없음 |
| inline styles 전체 | Tailwind mobile-first | — | purge로 프로덕션 CSS 최소화 |

**Deprecated/outdated:**
- Swiper.js 구버전: Embla로 대체 권장 (탭 스와이프 전용 케이스에서)
- `window.innerHeight - X`로 iOS 노치 계산: `env(safe-area-inset-bottom)` 사용

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 탭바 아이콘 SVG path는 직접 작성 (lucide-react 아이콘 사용 가능한지 불명확) | Standard Stack / 아이콘 | lucide-react가 이미 설치됨 (package.json 확인). CLAUDE.md에 "이모지 금지, SVG path만"이라는 제약은 이모지를 금지하는 것이지 lucide-react를 금지하는 것은 아닐 수 있음. 플래너 확인 필요. |
| A2 | Vaul이 React 19와 호환됨 | Standard Stack | vaul 1.1.2 peerDependencies 확인 필요. React 19는 최신이므로 호환 이슈 가능성 낮음. |
| A3 | MY 탭 href = `/profile` (또는 `/login?next=/profile`) | Architecture Patterns | profile 페이지가 기존에 존재함 (src/app/profile/page.tsx 확인됨). |

---

## Open Questions

1. **BottomSheet: Vaul vs 자체 구현 (createPortal)**
   - What we know: `HagwonRecommendSheet`는 이미 createPortal 방식으로 구현되어 작동함. Vaul은 드래그 기능과 접근성을 추가로 제공하나 번들 +15KB.
   - What's unclear: 단지상세에서 몇 개의 바텀시트가 필요한지 최종 확정 필요 (교육 팝업, 재건축 타임라인 = 최소 2개). HagwonRecommendSheet는 기존 유지(D-11).
   - Recommendation: 3개 이상 바텀시트 → Vaul 도입. 2개 이하 → createPortal 패턴 추출로 충분. 플래너가 MOB-04 scope 확정 후 결정.

2. **DealTypeTabs 탭 구성 확인 필요**
   - What we know: 단지상세 탭은 여러 섹션(거래내역/시설/관리비/AI코멘트 등)으로 구성됨.
   - What's unclear: 현재 DealTypeTabs.tsx가 어떤 구조인지 확인 필요 (거래 타입 탭인지, 섹션 탭인지).
   - Recommendation: 플래너가 `src/components/complex/DealTypeTabs.tsx` 확인 후 스와이프 범위 결정.

3. **Footer 처리**
   - What we know: 현재 `src/app/layout.tsx`에 `<Footer />`가 있음. BottomTabBar 추가 시 푸터가 탭바 위에 보이는지, 숨겨야 하는지 미결.
   - Recommendation: 모바일에서 푸터 숨김 (`hidden sm:block`) 또는 탭바 위에 표시. 플래너 결정 필요.

---

## Environment Availability

Step 2.6: 이 Phase는 순수 프론트엔드 코드/컴포넌트 변경. 외부 서비스, DB, CLI 도구 의존성 없음.

단, `npm install vaul embla-carousel-react` 실행 필요.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | ✓ | v24.14.0 | — |
| npm | 패키지 설치 | ✓ | 11.9.0 | — |
| vaul | MOB-06 BottomSheet | ✗ (미설치) | 1.1.2 | createPortal 자체 구현 |
| embla-carousel-react | MOB-04 탭 스와이프 | ✗ (미설치) | 8.6.0 | useSwipe 자체 훅 |

**Missing dependencies with fallback:**
- vaul: createPortal 자체 구현(HagwonRecommendSheet 패턴)으로 대체 가능
- embla-carousel-react: useSwipe 자체 훅으로 대체 가능 (단, 모멘텀 처리 복잡)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | vitest.config.ts (or package.json scripts) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOB-01 | BottomTabBar renders 4 tabs with correct hrefs | unit | `npm run test -- src/components/layout/BottomTabBar.test.tsx` | ❌ Wave 0 |
| MOB-01 | AppHeader renders logo + notification icon | unit | `npm run test -- src/components/layout/AppHeader.test.tsx` | ❌ Wave 0 |
| MOB-06 | BottomSheet opens/closes on trigger | unit | `npm run test -- src/components/ui/BottomSheet.test.tsx` | ❌ Wave 0 |
| MOB-02~05 | Page layout smoke test (E2E) | smoke e2e | `npm run test:e2e -- --grep "mobile"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test && npm run lint`
- **Phase gate:** `npm run test && npm run lint && npm run build` (E2E optional — Playwright 설정 확인 후)

### Wave 0 Gaps
- [ ] `src/components/layout/BottomTabBar.test.tsx` — covers MOB-01 (탭 렌더링, active 상태)
- [ ] `src/components/layout/AppHeader.test.tsx` — covers MOB-01 (로고, 알림 버튼)
- [ ] `src/components/ui/BottomSheet.test.tsx` — covers MOB-06 (open/close, portal)
- [ ] Framework install: vaul + embla-carousel-react — `npm install vaul embla-carousel-react`

---

## Security Domain

이 Phase는 UI/레이아웃 재작성만 포함. 새 API 엔드포인트, 사용자 데이터 저장, 인증 변경 없음.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 기존 Supabase Auth 유지, 변경 없음 |
| V3 Session Management | no | 기존 패턴 유지 |
| V4 Access Control | no | MY 탭은 /profile 리다이렉트 (기존 auth guard 유지) |
| V5 Input Validation | no | 입력 폼 없음 |
| V6 Cryptography | no | 해당 없음 |

**관련 보안 고려사항:**
- BottomTabBar의 MY 탭 href: 로그인 여부와 무관하게 `/profile`로 링크. `/profile/page.tsx`의 기존 auth guard가 미로그인 시 `/login`으로 리다이렉트 처리 (기존 동작 유지, 변경 없음).

---

## Sources

### Primary (HIGH confidence)
- `src/components/complex/HagwonRecommendSheet.tsx` — BottomSheet 패턴 분석 [VERIFIED: codebase]
- `src/app/layout.tsx` — 현재 전역 레이아웃 구조 [VERIFIED: codebase]
- `src/app/page.tsx`, `src/app/rankings/page.tsx`, `src/app/presale/page.tsx`, `src/app/invest/page.tsx` — 현재 인라인 스타일 패턴 확인 [VERIFIED: codebase]
- `src/components/complex/CompareFloatingBar.tsx` — `bottom: 80px` 고정값 확인 [VERIFIED: codebase]
- `src/components/rankings/ShareButton.tsx` — `data-capture-hide` 패턴 확인 [VERIFIED: codebase]
- `package.json` — 설치된 패키지 목록 확인 [VERIFIED: codebase]
- `tailwind.config.ts` — Tailwind 설정 확인 [VERIFIED: codebase]
- `docs/UI_GUIDE.md` — 하단 탭바 56px 가이드, safe-area, 모바일 레이아웃 사양 [VERIFIED: codebase]
- `npm view vaul version`, `npm view embla-carousel-react version` [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- vaul GitHub (emilkowalski/vaul) — Vaul Drawer API 패턴 [CITED: github.com/emilkowalski/vaul]
- Embla Carousel 공식 문서 — React 훅 사용법 [CITED: embla-carousel.com/get-started/react]

### Tertiary (LOW confidence)
- 없음

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — package.json 직접 확인, npm registry 버전 검증
- Architecture: HIGH — 기존 코드 전수 조사 완료
- Pitfalls: HIGH — 기존 코드 패턴에서 직접 도출 (CompareFloatingBar, ShareButton, HagwonRecommendSheet)
- Library 선택 (Vaul vs 자체): MEDIUM — 트레이드오프 문서화, 최종 선택은 플래너 결정

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (Tailwind/Next.js 안정, 30일)
