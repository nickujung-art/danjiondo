---
phase: 13-presale-redevelopment-dashboard
verified: 2026-05-20T11:38:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "REDV-01: setComplexRedevelopmentStatus Server Action 구현 완료 (redevelopment-actions.ts), /admin/redevelopment 단지 재건축 지정 카드 추가, redevelopment-actions.test.ts 7개 GREEN 전환 완료"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "실제 MOLIT_API_KEY 설정 후 daily cron 호출 — 응답에 cheongyakUpserted >= 0, competitionUpdated >= 0, expiredDeactivated >= 0 확인"
    expected: "창원(4812500000)·김해(4825000000) 분양 공고 new_listings 테이블에 upsert. MOLIT_API_KEY 미설정 시 errors 배열에 해당 에러만 추가되고 KAPT·MOLIT 블록은 정상 실행"
    why_human: "실제 data.go.kr API 키 없이는 청약홈 데이터 수집 검증 불가"
  - test: "/presale 페이지 브라우저 접속 — 3-tier 섹션 조건부 렌더링 확인"
    expected: "Tier 1 분양 공고 0건이면 섹션 헤더 숨김, Tier 2 재건축 예정 0건이면 섹션 헤더 숨김, Tier 3 신축 단지는 항상 헤더 표시 + 빈 상태 메시지"
    why_human: "실제 DB 데이터 유무에 따른 조건부 렌더링, 브라우저 확인 필요"
  - test: "/admin/redevelopment 접속 후 단지 재건축 지정 → /presale Tier 2 섹션 확인"
    expected: "단지 select → in_redevelopment 지정 → DB 반영, revalidatePath('/presale') 즉시 캐시 무효화, /presale 재건축 예정 섹션에 해당 단지 표시"
    why_human: "admin 권한 + 실 DB mutation + 캐시 무효화 동작 브라우저 확인 필요"
---

# Phase 13: 신축·분양·재건축 대시보드 검증 보고서

**Phase Goal:** 청약홈 API 연동으로 분양 공고를 일배치 자동 수집하고, /presale 페이지를 3-tier 우선순위 대시보드 (분양 공고 > 재건축 예정 > 신축 최신순)로 재설계한다.
**Verified:** 2026-05-20T11:38:00Z
**Status:** human_needed
**Re-verification:** Yes — 이전 gaps_found(5/6) 이후 재검증

## Re-verification 결과

이전 검증(2026-05-20T12:00:00Z)에서 REDV-01 갭이 보고됐으나, 실제 코드베이스 확인 결과 모든 구현이 완료된 상태였습니다. 이전 검증 시점과 현재 사이에 커밋 `8b45f51`, `717ff41`, `9cd1f80`이 추가됐으며, 이전 검증이 이를 누락한 것으로 판단됩니다.

**이전 gaps 해소 증거:**
- `setComplexRedevelopmentStatus` — `src/lib/actions/redevelopment-actions.ts` line 101에 export 존재
- `/admin/redevelopment` 단지 재건축 지정 카드 — `src/app/admin/redevelopment/page.tsx` line 169-276 존재
- `redevelopment-actions.test.ts` 7개 it.todo → it 전환 + GREEN 확인 (`npx vitest run` 7 passed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | 경남 지역 청약홈 분양 공고가 일배치 cron으로 new_listings에 upsert된다 | ✓ VERIFIED | `client.ts` fetchCheongyakList + `normalize.ts` normalizeCheongyakItem + `daily/route.ts` 청약홈 수집 블록 연결 확인 |
| 2 | competition_rate 컬럼이 daily cron에서 API 2 경쟁률 MAX값으로 업데이트된다 | ✓ VERIFIED | `client.ts` fetchCompetitionRate(MAX 집계) + `daily/route.ts` `.update({ competition_rate: rate })` 블록 |
| 3 | /presale 페이지가 분양 공고 → 재건축 예정 → 신축 3-tier로 렌더된다 | ✓ VERIFIED | `presale/page.tsx`: Promise.all 3-tier 병렬 fetch, Tier 1·2 조건부 헤더(length>0), Tier 3 항상 표시 |
| 4 | admin에서 complexes.status=in_redevelopment 지정 가능하다 | ✓ VERIFIED | `redevelopment-actions.ts`: `setComplexRedevelopmentStatus` export, requireAdmin → Zod safeParse → complexes UPDATE → revalidatePath 3경로 |
| 5 | 비admin 호출 시 admin guard가 차단한다 | ✓ VERIFIED | requireAdmin() FIRST (Zod 이전), test 1·2: 비로그인/일반사용자 모두 error 반환 GREEN |
| 6 | 신축 섹션은 built_year >= 2021 단지를 준공연도 최신순으로 표시한다 | ✓ VERIFIED | `getNewBuiltComplexes`: `.eq('status','active').gte('built_year',2021).order('built_year',{ascending:false})` |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260520100000_phase13_new_listings_cheongyak.sql` | 12컬럼 + partial unique index | ✓ VERIFIED | `pblanc_no` 외 11개 컬럼, `new_listings_pblanc_no_idx WHERE pblanc_no IS NOT NULL` |
| `src/services/cheongyak/types.ts` | CheongyakItemSchema + CompetitionRateItemSchema + NewListingCheongyakRow | ✓ VERIFIED | camelCase 11개 필드 Zod 스키마(pblancNo 필수, 나머지 optional), NewListingCheongyakRow 14개 필드 |
| `src/services/cheongyak/normalize.ts` | parseDateStr + normalizeCheongyakItem | ✓ VERIFIED | YYYYMMDD→ISO 변환, sgg_code 5자리 prefix, 14개 필드 반환 |
| `src/services/cheongyak/client.ts` | fetchCheongyakList + fetchCompetitionRate + CHEONGYAK_SGG_CODES | ✓ VERIFIED | withRetry 2곳, AbortSignal.timeout(15_000) 2곳, MAX_PAGES=5, MOLIT_API_KEY not set throw |
| `src/app/api/cron/daily/route.ts` | 청약홈 3블록(수집·경쟁률·만료) + 기존 보존 | ✓ VERIFIED | cheongyakUpserted/competitionUpdated/expiredDeactivated 3블록, onConflict:'pblanc_no', 기존 MOLIT onConflict:'name,region' + refresh_complex_price_stats RPC 보존 |
| `src/lib/data/presale.ts` | 4개 신규 함수 + 3개 신규 타입 + 기존 보존 | ✓ VERIFIED | CheongyakListing/RedevelopmentComplex/NewBuiltComplex + 4개 함수, getPresaleTransactions 보존 |
| `src/components/presale/PresaleCard.tsx` | CheongyakListing props + competition_rate 표시 | ✓ VERIFIED | `listing: CheongyakListing`, formatDateRange/formatMoveInYM/formatCompetitionRate, card-flat, aria-label |
| `src/components/presale/RedevelopmentCard.tsx` | 재건축 예정 카드 (신규) | ✓ VERIFIED | RedevelopmentComplex props, "재건축 예정" badge, predecessor_name 표시, card-flat, aria-label |
| `src/components/presale/NewBuildCard.tsx` | 신축 카드 (신규) | ✓ VERIFIED | NewBuiltComplex props, built_year 주황색 표시, card-flat, aria-label |
| `src/app/presale/page.tsx` | 3-tier RSC 페이지 | ✓ VERIFIED | Promise.all, aria-labelledby 3개, revalidate=3600 |
| `src/app/page.tsx` | 랜딩 활성 분양 건수 배지 | ✓ VERIFIED | getActiveListingCount import, Promise.all에 포함, `.catch(()=>0)` graceful degradation |
| `src/lib/actions/redevelopment-actions.ts` | setComplexRedevelopmentStatus 추가 + 기존 보존 | ✓ VERIFIED | line 101: export 존재, complexStatusSchema z.enum(['active','in_redevelopment']), complexes UPDATE, revalidatePath 3경로, upsertRedevelopmentProject 기존 보존 |
| `src/app/admin/redevelopment/page.tsx` | 단지 재건축 지정 카드 + 기존 단계 입력 보존 | ✓ VERIFIED | setComplexRedevelopmentStatusFromForm 서버액션 래퍼, allComplexes 조회(limit 500), predecessorId/successorId select, 기존 upsertRedevelopmentProjectFormAction 보존 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `daily/route.ts` | `cheongyak/client.ts` | import fetchCheongyakList | ✓ WIRED | line 9 import 확인 |
| `daily/route.ts` | `cheongyak/normalize.ts` | import normalizeCheongyakItem | ✓ WIRED | line 10 import 확인 |
| `cheongyak/client.ts` | `cheongyak/types.ts` | import schemas + types | ✓ WIRED | CheongyakItemSchema, CompetitionRateItemSchema import |
| `presale/page.tsx` | `lib/data/presale.ts` | Promise.all 3-tier fetch | ✓ WIRED | Promise.all([getActiveListings, getRedevelopmentComplexes, getNewBuiltComplexes]) |
| `PresaleCard.tsx` | CheongyakListing 타입 | props | ✓ WIRED | `import type { CheongyakListing }` + `listing: CheongyakListing` |
| `page.tsx (랜딩)` | `lib/data/presale.ts` | getActiveListingCount | ✓ WIRED | line 5 import, line 74 Promise.all 포함 |
| `admin/redevelopment/page.tsx` | `redevelopment-actions.ts` | import + form action | ✓ WIRED | line 6 import, setComplexRedevelopmentStatusFromForm에서 호출 |
| `redevelopment-actions.ts` | `public.complexes` | UPDATE status/predecessor_id/successor_id | ✓ WIRED | `.from('complexes').update({status, predecessor_id, successor_id, updated_at}).eq('id', ...)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `PresaleCard.tsx` | `listing: CheongyakListing` | getActiveListings → new_listings DB | is_active=true + pblanc_no IS NOT NULL 실 쿼리 | ✓ FLOWING (cron 실행 후 데이터 채워짐) |
| `RedevelopmentCard.tsx` | `complex: RedevelopmentComplex` | getRedevelopmentComplexes → complexes DB | status=in_redevelopment 실 쿼리 | ✓ FLOWING (admin 지정 후 표시) |
| `NewBuildCard.tsx` | `complex: NewBuiltComplex` | getNewBuiltComplexes → complexes DB | built_year>=2021 + active 실 쿼리 | ✓ FLOWING |
| `page.tsx (랜딩)` | `activeListingCount` | getActiveListingCount → new_listings count | count 쿼리 + .catch(()=>0) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| normalize 9개 unit test | `npx vitest run normalize.test.ts` | 9 passed | ✓ PASS |
| client 6개 unit test | `npx vitest run client.test.ts` | 6 passed | ✓ PASS |
| presale data 9개 unit test | `npx vitest run presale.test.ts` | 9 passed | ✓ PASS |
| redevelopment-actions 7개 unit test | `npx vitest run redevelopment-actions.test.ts` | 7 passed | ✓ PASS |
| 전체 31개 테스트 | `npx vitest run` (4개 파일) | 31 passed, 0 failed | ✓ PASS |
| AI 슬롭 금지 (presale 컴포넌트 4개) | grep backdrop-blur/gradient-text/glow/indigo/purple | 0 matches | ✓ PASS |
| 실 API 호출 (MOLIT_API_KEY) | 실제 API 키 없이 검증 불가 | N/A | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PRESALE-01 | 13-01, 13-02 | 청약홈 API 3 어댑터 + 일배치 cron upsert | ✓ SATISFIED | fetchCheongyakList + normalizeCheongyakItem + cron 수집 블록 |
| PRESALE-02 | 13-01, 13-02 | 청약홈 API 2 경쟁률 병합 (competition_rate) | ✓ SATISFIED | fetchCompetitionRate(MAX) + cron competition_rate UPDATE |
| PRESALE-03 | 13-04 | /presale 3-tier 재설계 + 랜딩 강화 | ✓ SATISFIED | 3-tier RSC 페이지 + 카드 3종 + 랜딩 배지 |
| REDV-01 | 13-03 | admin complexes.status in_redevelopment 수동 지정 | ✓ SATISFIED | setComplexRedevelopmentStatus Server Action + admin UI |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|---------|--------|
| `redevelopment-actions.ts` | 3 | `import { z } from 'zod'` (v3) vs `types.ts`의 `from 'zod/v4'` | ⚠️ Warning | 동일 프로젝트 내 zod v3/v4 혼용. CLAUDE.md는 `zod/v4` 권장. 단, 기존 `upsertRedevelopmentProject`도 동일 파일에서 zod v3를 사용했으므로 Phase 13 이전부터 존재한 패턴. 런타임 오류는 없을 가능성 높으나 일관성 미흡 |
| `client.ts` | 102 | `url.searchParams.set('PBLANC_NO', pblancNo)` — API 2 query param만 UPPER_CASE | ℹ️ Info | types.ts는 camelCase로 확정됐으나 API 2 요청 파라미터는 UPPER_CASE. 공공데이터포털 API 2 실제 파라미터 명세에 따른 것으로 의도적일 가능성 높음 |

### Human Verification Required

#### 1. 청약홈 API 실호출 + cron 동작 검증

**Test:** 로컬 `.env.local`에 실제 MOLIT_API_KEY 설정 후:
```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```
**Expected:** 응답 JSON에 `cheongyakUpserted >= 0`, `competitionUpdated >= 0`, `expiredDeactivated >= 0`, `errors: []` (또는 청약홈 외 에러가 없어야 함)
**Why human:** data.go.kr MOLIT_API_KEY 없이는 실제 API 호출 결과 확인 불가

#### 2. /presale 3-tier 렌더링 확인

**Test:** 브라우저에서 `/presale` 접속
**Expected:**
- Tier 1: 청약홈 데이터 0건 → 분양 공고 섹션 헤더+카드 전체 숨김
- Tier 2: in_redevelopment 단지 0건 → 재건축 예정 섹션 헤더+카드 전체 숨김
- Tier 3: 항상 "신축 단지" 헤더 표시, 데이터 없으면 "2021년 이후 준공된 단지가 등록되지 않았습니다" 메시지
**Why human:** 실 DB 데이터 유무에 따른 조건부 렌더링 브라우저 확인 필요

#### 3. Admin 재건축 지정 → /presale Tier 2 연동

**Test:** admin 계정으로 `/admin/redevelopment` 접속 → "단지 재건축 지정" 카드에서 단지 선택 → `in_redevelopment` 상태로 변경 → `/presale` 재방문
**Expected:** 지정 단지가 재건축 예정 섹션에 표시. revalidatePath('/presale') 즉시 캐시 무효화 동작
**Why human:** 실 admin 권한 + DB mutation + 캐시 무효화 동작 확인 필요

### Gaps Summary

자동 검증 가능한 6/6 truths 모두 VERIFIED됐습니다.

**이전 갭(REDV-01) 해소 확인:**
- `setComplexRedevelopmentStatus` Server Action: requireAdmin → complexStatusSchema.safeParse → `.from('complexes').update(...)` → revalidatePath 3경로 — 완전 구현
- `/admin/redevelopment` 단지 재건축 지정 카드: allComplexes 쿼리(limit 500), complexId/status/predecessorId/successorId 4개 select, btn-orange 제출 버튼 — 완전 구현
- 7개 unit test GREEN: mockAdminFrom, mockAdminUpdate, mockRevalidatePath 목 체인으로 전부 PASS

**주의사항(non-blocking):**
- `redevelopment-actions.ts`의 zod v3 사용 (기존 코드 패턴 유지, Phase 13 이전부터 존재)
- 청약홈 API 실 데이터 수집은 MOLIT_API_KEY 발급·설정 후 cron 실행으로만 검증 가능

---

_Verified: 2026-05-20T11:38:00Z_
_Verifier: Claude (gsd-verifier)_
