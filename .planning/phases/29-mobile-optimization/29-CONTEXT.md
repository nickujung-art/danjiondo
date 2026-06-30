# Phase 29: 모바일 최적화 (Mobile-First UX) - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

단지온도 앱의 모든 주요 페이지와 컴포넌트를 진짜 mobile-first로 재설계한다.
단순한 반응형(responsive) 개선이 아니라, 네비게이션·레이아웃·터치 인터랙션을 모바일 기준으로 설계하고 데스크탑은 확장으로 취급한다.
기존 데스크탑 레이아웃이 바뀌어도 무방.

**포함 범위:**
- 공유 레이아웃(하단 탭바 + 축소된 상단 헤더)
- 페이지별 Tailwind mobile-first 레이아웃 재작성 (홈 → 랭킹 → 단지상세 → 분양 → 투자 순)
- 44px 터치 타겟 전역 적용
- 바텀시트 패턴 도입 (단지상세 팝업 섹션, 지도 사이드패널)
- 단지상세 탭 스와이프

**제외 범위:**
- 지도 페이지 모바일 재설계 (별도 phase로 처리 — 카카오맵 제약 복잡)
- 어드민 페이지 (운영자용, 모바일 우선순위 낮음)
- PWA 오프라인 기능 개선
- 애니메이션/모션 시스템 재설계

</domain>

<decisions>
## Implementation Decisions

### 모바일 네비게이션
- **D-01: 하단 탭바 도입** — 홈 / 랭킹 / 분양 / MY 4개 탭. 데스크탑 포함 항상 표시.
- **D-02: 상단 헤더 축소** — 로고 + 알림아이콘만. 기존 페이지 링크 전부 제거.
- **D-03: 상/하단 동시 표시** — md 이상에서도 상단 헤더 + 하단 탭바 모두 표시. 헤더와 탭바가 공존.
- **D-04: 공유 레이아웃 컴포넌트** — `src/components/layout/AppHeader.tsx` + `src/components/layout/BottomTabBar.tsx` 신규 작성. `src/app/layout.tsx`에 통합. 기존 각 page.tsx 인라인 헤더 제거.
- **D-05: MY 탭** — 즐겨찾기·알림·프로필 통합. 로그인 유도 진입점.

### 레이아웃·그리드 전략
- **D-06: 모바일-first Tailwind** — 기본값이 모바일 레이아웃, `sm:` 이상에서 데스크탑 오버라이드. `max-sm:` 패턴 사용 금지.
- **D-07: 페이지 단위 순차 진행** — 홈 → 랭킹 → 단지상세 → 분양 → 투자. 지도는 별도 Phase.
- **D-08: inline styles → Tailwind 전환** — 레이아웃/간격/타이포그래피 관련 inline style을 Tailwind 클래스로 교체. 색상·브랜드 값은 inline style 유지 가능.
- **D-09: 컨텐츠 너비** — 모바일 100% 너비 + `px-4`(16px) 패딩. 데스크탑은 `max-w-3xl mx-auto` 또는 `max-w-screen-lg`.

### 터치 타겟·인터랙션
- **D-10: 44px 최소 터치 타겟** — 모든 버튼·링크·칩에 `min-h-[44px] min-w-[44px]` 적용. 칩은 패딩 늘리거나 그룹화로 해결.
- **D-11: 바텀시트 적극 도입** — 단지상세의 각 섹션(교육 팝업, 학원 추천, 재건축 타임라인) + 지도 사이드패널은 모바일에서 바텀시트로 제공. 이미 학원 추천 Sheet(Phase 28)는 유지.
- **D-12: 탭 스와이프 도입** — 단지상세 탭(거래내역/시설/관리비/AI코멘트 등) 좌우 스와이프로 전환. useSwipe 또는 Embla/Swiper 경량 라이브러리 사용.
- **D-13: 스와이프 범위** — 탭 전환 스와이프만. 전체 페이지 제스처 시스템은 도입 안 함.

### Claude's Discretion
- 하단 탭바 높이·스타일 (64px 권장, safe-area-inset-bottom 적용)
- 탭바 아이콘 SVG (기존 CLAUDE.md 규칙: 이모지 금지, SVG path만)
- 바텀시트 구현: headless(자체 구현) vs Radix UI Dialog vs Vaul 선택
- 스와이프 라이브러리 선택 (번들 크기 최소화 기준)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 아키텍처 규칙
- `CLAUDE.md` — 금지 애니메이션 속성(layout 속성 금지), SVG only, Semantic HTML 우선, 컴포넌트 디렉토리 구조
- `docs/UI_GUIDE.md` — 색상·타이포·컴포넌트 가이드 (브랜드 색상, 폰트 사이즈)
- `.planning/PROJECT.md` — 핵심 가치와 타겟 유저 (실수요자 중심)

### UI 패턴 참조
- `src/app/layout.tsx` — 현재 전역 레이아웃 구조 (viewport meta, PWA manifest)
- `src/components/layout/` — 기존 레이아웃 컴포넌트 (AdminSidebar 등 참조용)
- `src/app/admin/layout.tsx` — 어드민의 모바일 hamburger drawer 패턴 참조

### 기존 모바일 패턴 (재사용 가능)
- `src/components/hagwon/HagwonRecommendSheet.tsx` — 바텀시트 구현 참조 (Phase 28 산출물)
- `src/app/map/SidePanel.tsx` — 사이드패널/바텀시트 현재 구현 (모바일 개선 대상)
- `src/app/presale/page.tsx` — 유일하게 Tailwind responsive grid 사용 중인 페이지 (패턴 참조)

### 접근성
- `docs/ARCHITECTURE.md` — A11Y 정책 (axe-core CI, Phase 3 완료)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AdminSidebarDrawer` — 모바일 overlay drawer 패턴. BottomTabBar도 비슷한 z-index/overlay 구조 필요
- `HagwonRecommendSheet` — 바텀시트 이미 구현됨. 이 패턴을 추출해 공유 `BottomSheet` 컴포넌트로 추상화 가능
- `src/components/rankings/ShareButton.tsx` — 현재 data-capture-hide로 캡처 시 숨김. 하단 탭바도 동일하게 처리 필요

### Established Patterns
- **인라인 스타일 다수**: 대부분 page.tsx와 컴포넌트가 `style={}` 객체 사용. Tailwind 전환 시 각 파일 전면 리라이트 필요
- **고정 bottom 요소**: CompareFloatingBar(bottom 80px), 학원 Sheet, BottomTabBar 추가 시 z-index 충돌/스택 조율 필요
- **ISR/RSC 분리**: ISR 페이지는 `export const revalidate = N` — client component에 nav 분리해도 ISR 유지 가능
- **safe-area-inset**: PWA/앱 클립 영역 대응 — `env(safe-area-inset-bottom)` CSS 변수로 iOS notch 대응 필요

### Integration Points
- `src/app/layout.tsx` — AppHeader + BottomTabBar를 여기에 추가. 현재 `{children}` 래퍼 구조
- 각 page.tsx 인라인 헤더 제거 후 → `layout.tsx`의 공유 헤더로 대체
- `CompareFloatingBar` — `bottom: 80px` → `bottom: calc(64px + env(safe-area-inset-bottom))`로 탭바 높이 반영

</code_context>

<specifics>
## Specific Ideas

- 사용자 인용: "항상 모바일 화면이 우선이 되었으면 좋겠어. 모든 ui/ux, 버튼 위치 하나까지도 항상 모바일 우선으로" — 기존 디자인이 바뀌어도 무방
- 하단 탭바: 앱스토어/쿠팡 수준 표준 bottom nav 패턴
- 지도 페이지 제외는 사용자가 선택하지 않음 — 지도는 카카오맵 제약이 복잡하므로 별도 phase로 처리 (deferred)

</specifics>

<deferred>
## Deferred Ideas

- **지도 모바일 재설계** — 사이드패널 700px 미만 브레이크 수정. 카카오맵 + 바텀시트 연동. 이 Phase에서 논의 대상으로 선택되지 않음. Phase 30으로 처리.
- **PWA 앱 클립/설치 프롬프트 개선** — 모바일 최적화 이후 UX 상 자연스러운 설치 유도 고려.
- **다크모드 대응** — 모바일 최적화와 별개 작업이므로 다음 기회에.

</deferred>

---

*Phase: 29-mobile-optimization*
*Context gathered: 2026-06-23*
