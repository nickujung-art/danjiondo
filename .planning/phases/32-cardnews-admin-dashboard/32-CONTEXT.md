# Phase 32: 카드뉴스 관리 대시보드 통합 - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** PRD Express Path (inline) + 사용자 직접 요청

<domain>
## Phase Boundary

`/admin/cardnews` 페이지를 Phase 30 주간 자동 카드뉴스의 실질적인 관리 대시보드로 재구성한다.
현재 `/admin/cardnews/scheduler` 페이지에 분리돼 있는 스케줄러 기능을 메인 카드뉴스 관리 페이지에 통합하고,
UI/UX를 docs/UI_GUIDE.md 디자인 시스템에 맞게 개선한다.

**변경 파일:**
- `src/app/admin/cardnews/page.tsx` — 전면 재작성 (서버→클라이언트 컴포넌트 혼합)
- `src/components/admin/AdminSidebar.tsx` — 사이드바 메뉴 정리
- `src/app/admin/cardnews/scheduler/page.tsx` — 삭제 또는 redirect
- `src/components/admin/cardnews/CardnewsDashboardClient.tsx` — 신규 클라이언트 컴포넌트

</domain>

<decisions>
## Implementation Decisions

### 페이지 구조 (LOCKED)
- `/admin/cardnews` = 통합 관리 대시보드 (스케줄러 + 다운로드 + 데이터 프리뷰)
- `/admin/cardnews/scheduler` 페이지 제거 → `/admin/cardnews` redirect 처리
- `/admin/cardnews/builder` 유지 (변경 없음)

### 대시보드 레이아웃 (LOCKED)
4개 섹션으로 구성:
1. **자동화 상태 카드**: ON/OFF 토글 + 다음 실행 예정 + 마지막 실행 결과 배지
2. **빠른 액션 카드**: 수동 실행 버튼 + PNG 다운로드 버튼
3. **이번 주 데이터 카드**: 최근 30일 신고가 TOP 5 텍스트 + 복사 버튼 (기존 기능 유지)
4. **링크**: "GitHub Actions에서 상세 로그 보기" (외부 링크)

### AdminSidebar 메뉴 (LOCKED)
```
카드뉴스 목록 → 카드뉴스 관리 (label만 변경, href 유지)
카드뉴스 빌더 (유지)
스케줄러 → 제거
```

### SchedulerPanel.tsx 재사용 (LOCKED)
- 기존 `SchedulerPanel.tsx`는 파일 유지, 직접 import해서 사용
- 로직 복붙 금지 — 컴포넌트를 통합 페이지에 embed

### UI 디자인 시스템 (LOCKED)
- docs/UI_GUIDE.md CSS custom property 사용 (`--fg-pri`, `--fg-sec`, `--line-default`, `--bg-surface` 등)
- 기존 AdminSidebar/admin pages의 inline style 패턴 따를 것
- 금지: backdrop-blur, gradient-text, glow 애니메이션, rounded-2xl 균일 적용, gradient orb
- 상태 표시: `--fg-positive` (#00BF40) = 성공/활성, `--fg-negative` (#FF4242) = 실패/비활성, `--fg-cautionary` (#FF9200) = 경고/실행중
- 배지: `--bg-positive-tint` / `--bg-negative-tint` / `--bg-cautionary-tint` 활용

### 컴포넌트 아키텍처 (LOCKED)
```
page.tsx (RSC)
  ├─ auth guard (createSupabaseServerClient → admin role 체크)
  ├─ topDeals 데이터 서버사이드 fetch (기존 로직 유지)
  └─ <CardnewsDashboardClient topDeals={...} /> (client component)
       ├─ <SchedulerPanel /> (기존 컴포넌트 import)
       ├─ <CardnewsDownloadButton /> (기존 컴포넌트 import)
       └─ <AdminCardnewsCopyButton text={...} /> (기존 컴포넌트 import)
```

### Claude's Discretion
- CardnewsDashboardClient 내부 레이아웃 세부 (섹션 간격, 그리드 여부)
- 섹션 헤더 스타일 (기존 admin 페이지 참고)
- 로딩/에러 상태 UX 세부

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 구현 (변경 대상)
- `src/app/admin/cardnews/page.tsx` — 현재 단순 페이지 (전면 재작성 대상)
- `src/app/admin/cardnews/scheduler/page.tsx` — 스케줄러 페이지 (삭제 대상)
- `src/components/admin/cardnews/SchedulerPanel.tsx` — 재사용할 스케줄러 컴포넌트
- `src/components/admin/AdminSidebar.tsx` — 사이드바 (label 수정 + 메뉴 제거)

### 재사용 컴포넌트
- `src/components/admin/CardnewsDownloadButton.tsx` — 다운로드 버튼
- `src/components/admin/AdminCardnewsCopyButton.tsx` — 복사 버튼

### API 어댑터 (그대로 사용)
- `src/services/github-actions.ts` — GitHub Actions API 어댑터
- `src/app/api/admin/cardnews/scheduler/route.ts` — 스케줄러 API (변경 없음)

### 디자인 시스템
- `docs/UI_GUIDE.md` — 색상·타이포·금지 패턴
- `src/components/admin/AdminSidebar.tsx` — 기존 어드민 inline style 패턴 참조

### 인증 패턴
- `src/lib/supabase/server.ts` — createSupabaseServerClient
- 기존 admin page auth 패턴: getUser → profile.role → redirect

</canonical_refs>

<specifics>
## Specific Ideas

- SchedulerPanel의 ON/OFF 토글 버튼은 색상 토큰 기반으로 개선 (현재 Tailwind green/red 하드코딩)
- 상태 배지: text + dot 조합 → 더 명확한 시각적 피드백
- 수동 실행 후 runUrl이 있으면 "실행 확인" 버튼이 두드러지게 표시
- 이번 주 데이터 섹션: TOP5 리스트는 순위별로 번호 강조 (1위 = orange accent)

</specifics>

<deferred>
## Deferred Ideas

- Instagram Graph API 자동 업로드 (Phase 2)
- 카드뉴스 생성 이력 저장/조회
- 실행 히스토리 전체 목록 (현재는 최근 1건만 표시)

</deferred>

---

*Phase: 32-cardnews-admin-dashboard*
*Context gathered: 2026-06-26 via PRD Express Path*
