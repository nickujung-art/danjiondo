---
phase: 13-presale-redevelopment-dashboard
plan: "04"
subsystem: presale-dashboard-ui
tags: [tdd, 3tier, presale, redevelopment, newbuild, rsc, isr]
dependency_graph:
  requires:
    - 13-01 (DB 스키마 + presale.test.ts RED 스캐폴드)
    - 13-03 (setComplexRedevelopmentStatus — Tier 2 데이터 입력 경로)
  provides:
    - getActiveListings (CheongyakListing[] 반환, Tier 1)
    - getActiveListingCount (랜딩 배지용)
    - getRedevelopmentComplexes (Tier 2)
    - getNewBuiltComplexes (Tier 3)
    - PresaleCard (CheongyakListing props)
    - RedevelopmentCard (신규)
    - NewBuildCard (신규)
    - /presale 3-tier RSC 페이지
    - 랜딩 신축·분양 섹션 활성 건수 배지
  affects:
    - src/app/page.tsx (신축·분양 섹션 강화)
    - 소비자: 모든 /presale 방문 사용자
tech_stack:
  added: []
  patterns:
    - Promise.all 3-tier 병렬 fetch (RSC)
    - 조건부 섹션 헤더 (데이터 없으면 Tier 1·2 헤더 숨김)
    - Tier 3 항상 표시 (빈 상태 메시지)
    - revalidate=3600 ISR (일배치 cron 04:00 기준)
    - IN 쿼리 1회 predecessor_name 조회 (N+1 방지)
key_files:
  created:
    - src/components/presale/RedevelopmentCard.tsx
    - src/components/presale/NewBuildCard.tsx
  modified:
    - src/lib/data/presale.ts
    - src/lib/data/presale.test.ts
    - src/components/presale/PresaleCard.tsx
    - src/app/presale/page.tsx
    - src/app/page.tsx
decisions:
  - "getActiveListings 반환 타입 NewListing[] → CheongyakListing[] 변경 (PresaleCard props 동시 변경)"
  - "테스트 9개: 8개 todo → it 전환 + getActiveListingCount 테스트 2개 (총 9개)"
  - "predecessor_name 조회: IN 쿼리 1회로 N+1 방지 (재건축 단지 보통 10개 이하)"
  - "Tier 3 항상 헤더 표시: CONTEXT.md D-1 결정 준수"
metrics:
  duration: "약 30분"
  completed_date: "2026-05-20"
  tasks_completed: 3
  files_created: 2
  files_modified: 5
---

# Phase 13 Plan 04: /presale 3-tier 대시보드 재설계 Summary

**한 줄 요약:** presale.ts 4개 쿼리 함수 + CheongyakListing/RedevelopmentComplex/NewBuiltComplex 타입 + 카드 컴포넌트 3종 + /presale 3-tier RSC 페이지 + 랜딩 활성 분양 건수 배지 (9개 test GREEN)

## Task 1 결과: presale.ts 3-tier 쿼리 + 타입 추가 + 9개 test GREEN

### 4개 신규 함수 시그니처

```typescript
// Tier 1: 활성 청약홈 분양 공고
export async function getActiveListings(supabase, limit = 20): Promise<CheongyakListing[]>

// 랜딩 배지용 건수
export async function getActiveListingCount(supabase): Promise<number>

// Tier 2: 재건축 예정 단지 (predecessor_name IN 조회 1회)
export async function getRedevelopmentComplexes(supabase, limit = 20): Promise<RedevelopmentComplex[]>

// Tier 3: 신축 최신순
export async function getNewBuiltComplexes(supabase, limit = 30): Promise<NewBuiltComplex[]>
```

### 필터 조건

| 함수 | 필터 | 정렬 |
|------|------|------|
| getActiveListings | is_active=true + pblanc_no IS NOT NULL | rcept_bgnde DESC |
| getActiveListingCount | is_active=true + pblanc_no IS NOT NULL | head:true |
| getRedevelopmentComplexes | status='in_redevelopment' | canonical_name ASC |
| getNewBuiltComplexes | status='active' + built_year >= 2021 | built_year DESC |

### 보안 (T-13-13, T-13-14 미티게이션)

- `getActiveListings`: `not('pblanc_no', 'is', null)` → MOLIT 분양권전매 데이터 Tier 1 진입 차단
- `is_active=true`: 만료 공고 자동 제외 (13-02 cron 2중 방어)

### 테스트 결과: 9개 GREEN

| # | 테스트 | 검증 대상 |
|---|--------|----------|
| 1 | getActiveListings: is_active + not pblanc_no | 필터 조건 |
| 2 | getActiveListings: rcept_bgnde DESC | 정렬 |
| 3 | getActiveListings: 12개 컬럼 select | 컬럼 목록 |
| 4 | getRedevelopmentComplexes: in_redevelopment | 필터 |
| 5 | getRedevelopmentComplexes: predecessor_id/successor_id | 컬럼 |
| 6 | getNewBuiltComplexes: built_year >= 2021 + active | 필터 |
| 7 | getNewBuiltComplexes: built_year DESC | 정렬 |
| 8 | getActiveListingCount: eq + not 호출 확인 | count 쿼리 |
| 9 | getActiveListingCount: count=null → 0 반환 | null 안전 |

## Task 2 결과: 카드 컴포넌트 3종

### PresaleCard (CheongyakListing props로 리팩토링)

| 표시 항목 | 소스 필드 | 처리 |
|----------|----------|------|
| 지역 chip | region | 직접 표시 |
| 청약일정 badge | rcept_bgnde + rcept_endde | formatDateRange → "MM.DD~MM.DD" |
| 단지명 | pblanc_nm | null → '주택명 미정' |
| 세대수 (주황색) | supply_count | null → '세대수 미정' |
| 경쟁률 badge | competition_rate | null이면 미표시, formatRate → "N.N:1" |
| 입주예정 | mvn_prearnge_ym | YYYYMM → "YYYY년 MM월 입주예정" |
| 공급위치 | hssply_adres | null이면 미표시 |
| 링크 | complex_id | 있으면 /complexes/{id} |

### RedevelopmentCard (신규)

- chip: si + gu 조합
- badge: "재건축 예정" (neutral)
- 단지명: canonical_name
- predecessor: predecessor_name 있을 때 "기존: {name}" 표시
- 세대수: household_count 있을 때 표시

### NewBuildCard (신규)

- chip: si + gu 조합
- badge: "신축" (neutral)
- 단지명: canonical_name
- 준공연도 (주황색 핵심): `{built_year}년 준공`
- 세대수: household_count 있을 때 표시

### 3개 카드 공통 규칙

- `className="card-flat"` 적용
- `aria-label` 필수
- var(--*) 토큰 사용 (fg-pri, fg-sec, fg-tertiary, dj-orange, bg-canvas, line-default)
- AI 슬롭 0건 (backdrop-blur/gradient-text/glow/보라·인디고 없음)

## Task 3 결과: /presale 3-tier RSC + 랜딩 배지

### /presale 3-tier 섹션 조건부 헤더 규칙

| Tier | 섹션 | 헤더 표시 조건 |
|------|------|--------------|
| 1 | 분양 공고 | listings.length > 0 일 때만 (D-1 준수) |
| 2 | 재건축 예정 | redevelopments.length > 0 일 때만 (D-1 준수) |
| 3 | 신축 단지 | 항상 표시 (D-1: Tier 3는 fallback 아닌 상시 표시) |

### 랜딩 페이지 배지 통합 방식

```typescript
// Promise.all에 추가 (기존 fetch 병렬 유지)
const [...기존5개, activeListingCount] = await Promise.all([
  ...기존5개,
  getActiveListingCount(supabase).catch(() => 0),
])

// 조건부 배지
{activeListingCount > 0 && (
  <span className="badge pos">{activeListingCount}건 분양 진행 중</span>
)}
```

- `.catch(() => 0)`: API 실패 시 배지 미표시 (graceful degradation)
- 기존 `revalidate = 60` 유지 (ISR 60s)

## Commits

| 태스크 | 커밋 | 내용 |
|--------|------|------|
| Task 1 (TDD GREEN) | e389c8d | presale.ts 3-tier 쿼리 + 4타입 + 9테스트 GREEN |
| Task 2 | 1214cf2 | 카드 컴포넌트 3종 — PresaleCard 리팩 + 2종 신규 |
| Task 3 | 2b75819 | /presale 3-tier RSC 재설계 + 랜딩 분양 건수 배지 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 파일 `mock.calls[0][0]` 타입 오류**
- **Found during:** Task 2 `npx tsc --noEmit`
- **Issue:** `chain.select.mock.calls[0][0]` → `Object is possibly 'undefined'` (noUncheckedIndexedAccess)
- **Fix:** `(chain.select.mock.calls[0] as unknown[])[0] as string` 캐스트
- **Files modified:** `src/lib/data/presale.test.ts`
- **Commit:** 1214cf2 (Task 2에 포함)

**2. [Rule 1 - Bug] 테스트 파일 unused variable `chain`**
- **Found during:** Task 3 `npm run lint`
- **Issue:** `getActiveListingCount` 테스트에서 `createMockChain()` 결과를 `chain`에 할당 후 미사용
- **Fix:** `chain` 변수 제거 (countChain만 사용)
- **Files modified:** `src/lib/data/presale.test.ts`
- **Commit:** 2b75819 (Task 3에 포함)

**3. [Rule 2 - Missing] getActiveListingCount catch graceful degradation**
- **Found during:** Task 3 구현 중
- **Issue:** 랜딩 페이지 Promise.all에서 count 쿼리 실패 시 전체 페이지 렌더 실패 위험
- **Fix:** `.catch(() => 0)` 추가로 배지 미표시 graceful degradation
- **Files modified:** `src/app/page.tsx`

## Known Stubs

없음 — 모든 UI는 실제 Supabase 쿼리에 연결됨. 데이터가 없으면 빈 상태 메시지 표시 (조건부 섹션).

## Threat Flags

없음 — 신규 네트워크 엔드포인트 없음. 모든 쿼리는 createReadonlyClient() (RLS 적용, public read).

## Self-Check: PASSED

- `src/lib/data/presale.ts` 수정 확인 (4개 신규 함수 + 3개 신규 타입)
- `src/lib/data/presale.test.ts` 수정 확인 (9개 test GREEN)
- `src/components/presale/PresaleCard.tsx` 수정 확인 (CheongyakListing props)
- `src/components/presale/RedevelopmentCard.tsx` 존재 확인
- `src/components/presale/NewBuildCard.tsx` 존재 확인
- `src/app/presale/page.tsx` 수정 확인 (3-tier RSC)
- `src/app/page.tsx` 수정 확인 (getActiveListingCount + 배지)
- Commits e389c8d, 1214cf2, 2b75819 존재 확인
