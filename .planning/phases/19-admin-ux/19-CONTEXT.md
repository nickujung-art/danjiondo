# Phase 19: 어드민 UI/UX 전면 개선 — Context

**Gathered:** 2026-05-27
**Status:** Ready for planning
**Source:** 대화 분석 (어드민 13개 페이지 전수 조사 + UX 갭 도출)

<domain>
## Phase Boundary

현재 어드민 기능(13개 페이지)은 모두 구현되어 있으나 공유 레이아웃이 없어 운영자가 각 페이지를 URL 직접 입력으로만 접근 가능하다.
이 Phase는 운영자 접근성을 전면 개선한다:
- `src/app/admin/layout.tsx` 공유 레이아웃 신설 (사이드바 네비게이션)
- `/admin` 루트 → `/admin/status` 리다이렉트
- 핵심 목록 페이지(회원/신고/광고/중개사) 검색·필터 추가
- 사이드바에 미처리 항목(pending 신고, 광고, GPS 요청) 뱃지 표시

**범위 밖 (이 Phase에서 다루지 않음):**
- 어드민 기능 자체 변경 (기능은 이미 완성)
- 새 어드민 기능 추가
- 페이지네이션 (목록이 크지 않은 MVP 규모)
- 일괄 작업 (bulk operations)
- CSV 내보내기

</domain>

<decisions>
## Implementation Decisions

### D-01: 공유 어드민 레이아웃 구조
- `src/app/admin/layout.tsx` 생성 — Next.js App Router 공유 레이아웃
- RSC (서버 컴포넌트) 기반: 권한 검증 + 미처리 카운트를 서버에서 조회
- 레이아웃 구조: 왼쪽 240px 고정 사이드바 + 오른쪽 children
- 모바일(≤768px): 사이드바 숨김 + 상단 햄버거 버튼으로 drawer 토글
- AI 슬롭 금지 (CLAUDE.md): backdrop-blur, gradient, glow, 보라/인디고 없이

### D-02: 사이드바 네비게이션 메뉴 구조
9개 메뉴 항목 (아이콘 없이 텍스트만, 기존 프로젝트 스타일 준수):
```
대시보드     → /admin/status
회원 관리    → /admin/members
신고 관리    → /admin/reports    [pending_count 뱃지]
광고 관리    → /admin/ads        [pending_count 뱃지]
중개사 관리  → /admin/realtors
GPS 검증     → /admin/gps-requests [pending_count 뱃지]
카드뉴스     → /admin/cardnews
시세 입력    → /admin/listing-prices
재개발 관리  → /admin/redevelopment
```

### D-03: 미처리 항목 뱃지
서버 컴포넌트에서 3개 카운트를 병렬 조회:
- 신고: `reports WHERE status='pending'` COUNT
- 광고: `ad_campaigns WHERE status='pending'` COUNT  
- GPS: `gps_verification_requests WHERE status='pending'` COUNT
0이면 뱃지 숨김, 1 이상이면 표시 (최대 99+)
레이아웃 revalidate: 0 (항상 최신 카운트)

### D-04: 현재 페이지 active 표시
`usePathname()` (클라이언트) 또는 서버에서 pathname 전달
현재 경로와 일치하는 메뉴 항목: 배경색 + 텍스트 굵기 변경
`pathname.startsWith(href)` 방식으로 하위 경로도 active 처리

### D-05: 권한 검증 위치
레이아웃에서 공통 권한 검증: `requireAdminLayout()`
- supabase server client + auth.getUser() + profiles.role 조회
- admin 또는 superadmin 이외: `/login?next=/admin` 리다이렉트
- 기존 각 페이지의 중복 권한 체크 코드는 레이아웃 적용 후에도 유지 (defense in depth)

### D-06: /admin 루트 페이지
`src/app/admin/page.tsx` 생성:
- 서버 컴포넌트
- `redirect('/admin/status')` 단순 리다이렉트

### D-07: 회원 목록 검색·필터
`/admin/members` 페이지에 추가:
- 닉네임/카페닉네임 텍스트 검색 (URL searchParams)
- 역할 필터: 전체/admin/member (드롭다운)
- 계정 상태 필터: 전체/활성/정지/탈퇴 (드롭다운)
- 서버 컴포넌트에서 searchParams 받아 Supabase 쿼리에 조건 추가

### D-08: 신고 목록 필터
`/admin/reports` 페이지에 추가:
- 상태 필터: 전체/pending/accepted/rejected (탭 또는 드롭다운)
- 대상 유형 필터: 전체/review/user/ad/comment
- 기존 페이지는 이미 `.eq('status', 'pending')` 고정 → 전체 보기 가능하게 변경

### D-09: 광고 목록 필터
`/admin/ads` 페이지에 추가:
- 상태 필터: 전체/pending/approved/paused/rejected/ended
- 현재 이미 전체 캠페인을 표시 중 → 상태 필터만 추가

### D-10: 중개사 목록 검색
`/admin/realtors` 페이지에 추가:
- 이름/회사명 텍스트 검색
- 활성 상태 필터: 전체/활성/비활성

### D-11: 모바일 햄버거 메뉴
- 768px 이하에서 상단바(60px) 좌측에 햄버거 버튼 표시
- 클릭 시 사이드바가 overlay drawer로 슬라이드인
- 배경 클릭 또는 메뉴 항목 클릭으로 닫힘
- AdminSidebarDrawer 클라이언트 컴포넌트 분리

### Claude's Discretion
- 사이드바 폭: 240px (기존 헤더 패딩 32px 기준 유지)
- 뱃지 색상: `var(--fg-negative)` 배경 + 흰 텍스트 (기존 status 뱃지 패턴 준수)
- 검색/필터 UI: 기존 admin 페이지 스타일 (input, select 인라인, card 컨테이너 내부)
- 필터 적용: URL searchParams 방식 (RSC 자연스러운 서버 필터링)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 어드민 페이지 (수정 대상)
- `src/app/admin/status/page.tsx` — 대시보드 (레이아웃 적용 후 헤더 제거)
- `src/app/admin/members/page.tsx` — 회원 목록 (검색·필터 추가)
- `src/app/admin/reports/page.tsx` — 신고 목록 (필터 추가)
- `src/app/admin/ads/page.tsx` — 광고 목록 (상태 필터 추가)
- `src/app/admin/realtors/page.tsx` — 중개사 목록 (검색 추가)
- `src/app/admin/gps-requests/page.tsx` — GPS 검증 목록
- `src/app/admin/cardnews/page.tsx` — 카드뉴스
- `src/app/admin/listing-prices/page.tsx` — 시세 입력
- `src/app/admin/redevelopment/page.tsx` — 재개발 관리

### 신규 생성 파일
- `src/app/admin/layout.tsx` — 공유 어드민 레이아웃 (RSC)
- `src/app/admin/page.tsx` — /admin 루트 리다이렉트
- `src/components/admin/AdminSidebar.tsx` — 사이드바 RSC (메뉴 + 뱃지)
- `src/components/admin/AdminSidebarDrawer.tsx` — 모바일 drawer (클라이언트)

### 참조 파일 (패턴 확인용)
- `src/lib/supabase/server.ts` — createSupabaseServerClient
- `src/lib/supabase/admin.ts` — createSupabaseAdminClient
- `src/app/admin/ads/page.tsx` — 기존 requireAdmin 패턴 (레이아웃 통합 후 참조)
- `CLAUDE.md` — AI 슬롭 금지, RSC-first 원칙

</canonical_refs>

<specifics>
## Specific Ideas

### 사이드바 디자인 스케치
```
┌─────────────────────────────────────┐
│ 단 단지온도 어드민                    │
├─────────────────────────────────────┤
│ ● 대시보드                           │
│   회원 관리                          │
│   신고 관리           [3]            │
│   광고 관리           [1]            │
│   중개사 관리                        │
│   GPS 검증            [2]            │
│   카드뉴스                           │
│   시세 입력                          │
│   재개발 관리                        │
└─────────────────────────────────────┘
```
(● = active 표시, [숫자] = pending 뱃지)

### 검색/필터 위치 패턴
기존 각 페이지 카드 상단에 필터 행 추가:
```
[검색창________________] [상태▼] [역할▼]
```
URL: `/admin/members?q=홍길동&status=active&role=member`

### 기존 헤더 제거 계획
각 페이지의 자체 `<header>` 블록 제거 → 레이아웃 사이드바로 대체
단, 페이지 제목(`<h1>`)은 유지

</specifics>

<deferred>
## Deferred Ideas

- 페이지네이션 (MVP 규모에서 목록이 수백 건 미만이므로 defer)
- 일괄 작업 (bulk suspend, bulk approve)
- CSV 내보내기
- 감사 로그 (admin actions 기록)
- 어드민 전용 다크 테마
- 어드민 알림 (새 신고 실시간 알림)

</deferred>

---

*Phase: 19-admin-ux*
*Context gathered: 2026-05-27 (대화 분석 기반)*
