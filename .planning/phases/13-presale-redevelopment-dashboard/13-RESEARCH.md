# Phase 13: 신축·분양·재건축 대시보드 - Research

**Researched:** 2026-05-20
**Domain:** 청약홈 API 연동, new_listings DB 확장, 3-tier 우선순위 대시보드 UI
**Confidence:** MEDIUM — API 응답 필드명은 공식 기술문서(Word) 직접 열람 불가로 일부 ASSUMED, 나머지는 코드베이스 검증 HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **3-tier 우선순위 로직**: Tier 1 분양 공고(new_listings 활성) → Tier 2 재건축 예정(complexes.status='in_redevelopment') → Tier 3 신축(built_year >= 2021, ORDER BY built_year DESC). Tier 1·2 없어도 Tier 3 항상 표시.
2. **분양 데이터 소스**: 메인 = 청약홈 API 3 (`/getAPTLttotPblancList`), 보조 = 청약홈 API 2 (경쟁률), 파일데이터(API 1) 스킵.
3. **재건축 데이터 소스**: admin 수동 입력. `complexes.status = 'in_redevelopment'`, `predecessor_id`, `successor_id` 기존 스키마 활용.
4. **DB 변경**: `new_listings` 테이블에 컬럼 추가 (`pblanc_no`, `pblanc_nm`, `sgg_code`, `supply_region`, `supply_count`, `rcept_bgnde`, `rcept_endde`, `przwner_presnatn_de`, `mvn_prearnge_ym`, `hssply_adres`, `competition_rate`, `is_active`).
5. **어댑터 위치**: `src/services/cheongyak/` 신설 (`client.ts`, `types.ts`, `normalize.ts`).
6. **Cron 통합**: 기존 `/api/cron/daily/route.ts`에 통합. 별도 endpoint 불필요.
7. **/presale 페이지 UI**: 3개 섹션 헤더. 데이터 없으면 해당 섹션 헤더도 숨김 (신축 제외).
8. **랜딩 페이지 섹션 강화**: 분양 공고 건수 배지 추가.
9. **재건축 admin UI**: `/admin/redevelopment` 또는 `/admin/complexes/[id]` 신설.

### Claude's Discretion
- API 키 발급 전 mock 데이터로 개발 스캐폴드 구성 방식
- 분양 공고 카드 구체적 레이아웃 및 디자인 (CLAUDE.md AI 슬롭 금지 규칙 준수)
- 경쟁률이 없는 경우 카드 표시 처리 (null safe)
- `new_listings` 기존 컬럼 일부 삭제/rename 여부 (마이그레이션 전략)

### Deferred Ideas (OUT OF SCOPE)
- NOTIF-02 분양 알림 구독 — 별도 phase
- 분양권 상세 페이지 (`/presale/[id]`) — 별도 phase
- 무순위·잔여세대 분양 별도 섹션 — V3.0 이후 검토
- 청약 캘린더 UI — 향후 검토

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRESALE-01 | 청약홈 API 3 (data.go.kr #15098547) 어댑터 + 일배치 cron — 경남 지역 분양 공고 자동 수집, new_listings upsert | 어댑터 패턴: molit.ts / molit-presale.ts 참고, daily cron 통합 위치 확인 |
| PRESALE-02 | 청약홈 API 2 (data.go.kr #15098905) 경쟁률 병합 — new_listings.competition_rate 컬럼 추가 | competition_rate NUMERIC 컬럼, PBLANC_NO 조인 키 확인 |
| PRESALE-03 | /presale 페이지 3-tier 재설계 — 분양 공고(1순위) → 재건축 예정(2순위) → 신축 최신순(3순위) 섹션, 랜딩 페이지 신축·분양 섹션 강화 | 기존 presale/page.tsx + PresaleCard.tsx 재설계 대상 확인 |
| REDV-01 | 재건축 admin UI — complexes.status = 'in_redevelopment' 수동 지정 화면 (predecessor/successor 연결 포함) | admin listing-prices 패턴 + complex_status enum 확인 |

</phase_requirements>

---

## Summary

Phase 13은 두 가지 독립된 작업축으로 구성된다. **첫 번째 축(PRESALE-01/02)**은 청약홈 공공 API와 연동하여 경남 지역 분양 공고를 일배치로 자동 수집하는 파이프라인이다. 기존 `src/services/molit.ts`와 동일한 Zod 스키마 + fetch wrapper 패턴으로 `src/services/cheongyak/` 어댑터를 신설하고, 기존 `daily` cron에 호출을 추가한다. **두 번째 축(PRESALE-03/REDV-01)**은 `/presale` 페이지를 3-tier 우선순위 대시보드로 재설계하고 admin에서 재건축 상태를 수동 입력하는 UI를 추가한다.

핵심 리스크는 청약홈 API 응답 필드명이다. 공식 기술문서가 Word 파일로만 제공되어 Swagger UI 또는 실제 API 호출 없이는 정확한 필드명을 확인하기 어렵다. 이 점은 Wave 0에서 mock 스캐폴드 + 실제 API 연결 직전 필드명 검증으로 처리해야 한다. API 2(경쟁률)는 `PBLANC_NO` 기준으로 API 3 결과에 사후 병합하는 구조이므로 API 3 수집이 완료된 후에 실행한다.

기존 `new_listings` 테이블은 MOLIT 분양권전매 데이터 용도로 만들어졌으며 현재 `UNIQUE(name, region)` 제약이 있다. 청약홈 연동 후에는 `pblanc_no`를 upsert 키로 쓰는 신규 공고와, 기존 MOLIT 전매 데이터가 혼재하게 된다. 이 두 소스의 공존 전략이 migration 설계의 핵심이다.

**Primary recommendation:** molit.ts 패턴을 그대로 복사한 cheongyak 어댑터를 먼저 만들어 mock 데이터로 검증하고, `new_listings`에 청약홈 전용 컬럼을 `ADD COLUMN IF NOT EXISTS`로 추가(기존 MOLIT 행은 null 허용)한 뒤 daily cron에 통합한다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 청약홈 API 호출·파싱 | API/Backend (`src/services/`) | — | CLAUDE.md: 외부 API 호출은 services/ 에서만 |
| new_listings upsert | API/Backend (cron route) | — | service_role 클라이언트, RLS 우회 필요 |
| 경쟁률 병합 | API/Backend (cron route) | — | pblanc_no 기준 JOIN, DB 직접 접근 |
| /presale 3-tier 데이터 조회 | Frontend Server (RSC) | — | createReadonlyClient() + revalidate ISR |
| 분양 카드·섹션 렌더링 | Browser/Client | — | 'use client' 없이 RSC 컴포넌트 가능 |
| 재건축 admin 상태 변경 | API/Backend (Server Action) | — | admin role check + createSupabaseAdminClient() |
| 랜딩 페이지 분양 건수 표시 | Frontend Server (RSC) | — | getActiveListingCount() 신규 함수 |

---

## Standard Stack

### Core (기존 프로젝트 스택 그대로 사용)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 15.3.1 | RSC + Server Actions | 프로젝트 기준 스택 |
| Supabase JS | 기존 | DB 접근 | 프로젝트 기준 스택 |
| Zod v4 | 4.4.1 | API 응답 스키마 검증 | 기존 services/*.ts 패턴 |
| TypeScript strict | 기존 | 타입 안전성 | `noUncheckedIndexedAccess` 포함 |

[VERIFIED: 코드베이스 grep — package.json, vitest.config.ts, molit.ts]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortSignal.timeout | Node.js 내장 | 청약홈 API 타임아웃 | fetchPage 패턴 동일 |
| withRetry | 기존 `@/lib/api/retry` | API 재시도 | molit.ts에서 사용 중 |

[VERIFIED: 코드베이스 — src/services/molit.ts 참고]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ADD COLUMN IF NOT EXISTS` 마이그레이션 | 테이블 분리 (`listings_cheongyak`) | 기존 UI/쿼리 하위호환 유지를 위해 컬럼 추가 선택. 단, 두 소스 혼재로 코드 복잡도 증가. 분리는 Claude's Discretion |
| daily cron 통합 | 별도 cron endpoint | Vercel Hobby 1일 1회 한도 → 통합 필수 (LOCKED) |

---

## Architecture Patterns

### System Architecture Diagram

```
[Vercel Cron 04:00 KST]
        │
        ▼
GET /api/cron/daily
        │
        ├── [기존] fetchKaptBasicInfo → facility_kapt upsert
        │
        ├── [기존] fetchPresaleTrades (MOLIT) → new_listings upsert (name,region 키)
        │
        ├── [신규] fetchCheongyakList (API 3)
        │         └── 지역 필터: sgg_code IN ('48125','48250') (창원·김해)
        │                   ↓
        │         normalize() → new_listings upsert (pblanc_no 키)
        │
        ├── [신규] fetchCompetitionRates (API 2)
        │         └── pblanc_no 목록 → CMPET_RATE 조회
        │                   ↓
        │         new_listings.competition_rate UPDATE
        │
        └── [기존] refresh_complex_price_stats RPC
                    ↓
              Response: { ok, totalUpserted, errors[] }

[사용자 브라우저]
        │
        ▼
GET /presale (RSC, revalidate=3600)
        │
        ├── getActiveListings() → new_listings WHERE is_active=true
        │   (Tier 1 — 분양 공고)
        │
        ├── getRedevelopmentComplexes() → complexes WHERE status='in_redevelopment'
        │   (Tier 2 — 재건축 예정)
        │
        └── getNewBuiltComplexes() → complexes WHERE built_year>=2021 ORDER BY built_year DESC
            (Tier 3 — 신축, 항상 표시)
```

### Recommended Project Structure

```
src/
├── services/
│   └── cheongyak/
│       ├── client.ts       # fetchCheongyakList, fetchCompetitionRates
│       ├── types.ts        # Zod 스키마 + 추론 타입
│       └── normalize.ts    # API 응답 → new_listings row 변환
├── lib/
│   └── data/
│       └── presale.ts      # 기존 확장: getActiveListings + getRedevelopmentComplexes + getNewBuiltComplexes
├── components/
│   └── presale/
│       ├── PresaleCard.tsx         # 기존 리팩터 (청약홈 필드 추가)
│       ├── RedevelopmentCard.tsx   # 신규
│       └── NewBuildCard.tsx        # 신규 (기존 PresaleCard 분리 검토)
├── app/
│   ├── presale/page.tsx            # 3-tier 재설계
│   └── admin/
│       └── redevelopment/page.tsx  # 신규 admin UI
└── supabase/
    └── migrations/
        └── 20260520XXXXXX_phase13_new_listings_cheongyak.sql
```

### Pattern 1: 청약홈 어댑터 (molit.ts 패턴 복사)

**What:** Zod 스키마로 응답 검증 + AbortSignal.timeout + withRetry
**When to use:** 외부 API 호출 시 항상

```typescript
// Source: src/services/molit.ts (기존 패턴 참고, VERIFIED: 코드베이스)
import { z } from 'zod/v4'
import { withRetry } from '@/lib/api/retry'

const BASE_URL = 'https://apis.data.go.kr/B552555/APTLttotPblancDetail/getAPTLttotPblancList'

const CheongyakItemSchema = z.object({
  // 필드명은 API 2(경쟁률) 문서 확인 결과 UPPER_CASE 사용 확인됨
  // API 3 필드명도 동일 규칙으로 UPPER_CASE 예상 [ASSUMED: 미직접검증]
  PBLANC_NO: z.string(),
  PBLANC_NM: z.string(),
  SUBSCRPT_AREA_CODE_NM: z.string().optional(),
  HSSPLY_ADRES: z.string().optional(),
  TOT_SUPLY_HSHLDCO: z.coerce.number().optional(),
  RCEPT_BGNDE: z.string().optional(),   // YYYYMMDD
  RCEPT_ENDDE: z.string().optional(),
  PRZWNER_PRESNATN_DE: z.string().optional(),
  MVN_PREARNGE_MNTDY: z.string().optional(), // YYYYMM
  HOUSE_SECD: z.string().optional(),   // 주택구분 (APT 필터용)
})

export type CheongyakItem = z.infer<typeof CheongyakItemSchema>

export async function fetchCheongyakList(
  sggCode: string,
): Promise<CheongyakItem[]> {
  const apiKey = process.env.CHEONGYAK_API_KEY
  if (!apiKey) throw new Error('CHEONGYAK_API_KEY not set')

  const url = new URL(BASE_URL)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('RoadNmSggCd', sggCode)
  url.searchParams.set('numOfRows', '100')
  url.searchParams.set('_type', 'json')

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Cheongyak API ${res.status}`)
    // ... 파싱 로직
    return []
  })
}
```

[VERIFIED: 패턴은 molit.ts에서 확인, 청약홈 API 3 파라미터는 CONTEXT.md specifics 인용]

### Pattern 2: daily cron 통합

**What:** 기존 daily cron에 청약홈 수집 블록 추가
**When to use:** 새 외부 데이터 소스 추가 시

```typescript
// Source: src/app/api/cron/daily/route.ts (기존 패턴, VERIFIED)
// ── 청약홈 분양 공고 수집 (PRESALE-01) ─────────────────────
const CHEONGYAK_SGG_CODES = ['4812500000', '4825000000'] // 창원, 김해

let cheongyakUpserted = 0
for (const sggCode of CHEONGYAK_SGG_CODES) {
  try {
    const items = await fetchCheongyakList(sggCode)
    for (const item of items) {
      const row = normalizeCheongyakItem(item)
      const { error } = await supabase
        .from('new_listings')
        .upsert(row, { onConflict: 'pblanc_no' })
      if (!error) cheongyakUpserted++
    }
  } catch (err) {
    errors.push(`cheongyak sgg=${sggCode}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── 청약홈 경쟁률 병합 (PRESALE-02) ──────────────────────────
// API 3 수집 후 pblanc_no 목록으로 API 2 조회
```

### Pattern 3: 3-tier 데이터 레이어 (presale.ts 확장)

**What:** 3개 독립 쿼리를 서버 컴포넌트에서 병렬 실행
**When to use:** /presale RSC 페이지

```typescript
// Source: 기존 getActiveListings() 확장 설계
export async function getActiveListings(supabase, limit = 20) {
  // 기존 쿼리에 is_active=true 필터 + 신규 컬럼 select 추가
  const { data } = await supabase
    .from('new_listings')
    .select('id, name, region, pblanc_nm, supply_region, supply_count, rcept_bgnde, rcept_endde, mvn_prearnge_ym, competition_rate, hssply_adres')
    .eq('is_active', true)
    .order('rcept_bgnde', { ascending: false })
    .limit(limit)
  return (data ?? [])
}

export async function getRedevelopmentComplexes(supabase, limit = 20) {
  const { data } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, dong, household_count, predecessor_id, successor_id')
    .eq('status', 'in_redevelopment')
    .order('canonical_name')
    .limit(limit)
  return (data ?? [])
}

export async function getNewBuiltComplexes(supabase, limit = 30) {
  const { data } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, built_year, household_count')
    .eq('status', 'active')
    .gte('built_year', 2021)
    .order('built_year', { ascending: false })
    .limit(limit)
  return (data ?? [])
}
```

### Pattern 4: Admin Server Action (listing-prices 패턴)

**What:** Server Action으로 `complexes.status` + predecessor/successor 변경
**When to use:** admin 수동 입력 (재건축 지정)

```typescript
// Source: src/app/admin/listing-prices/page.tsx 패턴, VERIFIED
// listing-price-actions.ts 패턴 동일
'use server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin' // 기존 또는 신규

export async function setRedevelopmentStatus(data: {
  complexId: string
  predecessorId: string | null
  successorId: string | null
}) {
  await requireAdmin()
  const supabase = createSupabaseAdminClient()
  await supabase
    .from('complexes')
    .update({
      status: 'in_redevelopment',
      predecessor_id: data.predecessorId,
      successor_id: data.successorId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.complexId)
}
```

### Anti-Patterns to Avoid

- **클라이언트 컴포넌트에서 Supabase 직접 쿼리**: CLAUDE.md CRITICAL 규칙. `/presale` 데이터는 RSC에서만 fetch.
- **단지명 단독 매칭**: CLAUDE.md CRITICAL 규칙. 청약홈 공고를 complexes에 매칭 시 좌표+이름 복합 또는 manual 매칭만.
- **기간 만료 분양 공고 노출**: `is_active = true` 필터 필수. cron에서 `rcept_endde < today` 기준으로 `is_active = false` 처리.
- **MOLIT 기존 데이터 충돌**: `new_listings`의 기존 MOLIT row에는 `pblanc_no = NULL`. upsert 시 `onConflict: 'pblanc_no'`는 NULL 행에는 작동하지 않음 → 청약홈 행에만 pblanc_no 값이 있어 충돌 없음.
- **global fetch 타임아웃 없음**: 반드시 `AbortSignal.timeout(15_000)` 사용.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API 응답 검증 | 수동 if-check | Zod safeParse | 미지 필드 무시 + 타입 추론 자동화 |
| API 재시도 | setTimeout loop | `withRetry` (`@/lib/api/retry`) | 이미 존재, 지수 백오프 |
| DB admin 클라이언트 | createClient inline | `createSupabaseAdminClient()` | SEC-02 준수, 단일 경로 |
| 날짜 비교 | 직접 string 비교 | `new Date() >= new Date(rcept_endde)` | ISO 포맷 일관성 |

---

## DB 스키마 분석

### 기존 `new_listings` 테이블 현황

[VERIFIED: supabase/migrations/20260507000004_phase4_tables.sql]

```sql
CREATE TABLE public.new_listings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id   uuid REFERENCES public.complexes(id) ON DELETE SET NULL,
  name         text NOT NULL,          -- MOLIT: aptNm
  region       text NOT NULL,          -- MOLIT: umdNm
  price_min    integer,                -- MOLIT: dealAmount min
  price_max    integer,                -- MOLIT: dealAmount max
  total_units  integer,                -- 미사용 또는 수동
  move_in_date date,                   -- 미사용
  source_code  text,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, region)                 -- MOLIT upsert 키
);
```

**주의사항**: `UNIQUE(name, region)` 제약은 MOLIT 전매 upsert용. 청약홈 행은 이 제약을 공유하지만, 청약홈의 `pblanc_no`를 새로운 upsert 키로 사용할 때 `pblanc_no` NULL 허용으로 기존 MOLIT 행과 충돌하지 않음.

### Phase 13 신규 Migration 설계

```sql
-- 파일: supabase/migrations/20260520XXXXXX_phase13_new_listings_cheongyak.sql
ALTER TABLE public.new_listings
  ADD COLUMN IF NOT EXISTS pblanc_no       text,       -- 청약홈 공고번호 (upsert key)
  ADD COLUMN IF NOT EXISTS pblanc_nm       text,       -- 주택명
  ADD COLUMN IF NOT EXISTS sgg_code        text,       -- 법정동코드
  ADD COLUMN IF NOT EXISTS supply_region   text,       -- 공급지역명
  ADD COLUMN IF NOT EXISTS supply_count    integer,    -- 공급규모(세대수)
  ADD COLUMN IF NOT EXISTS rcept_bgnde     date,       -- 청약접수 시작일
  ADD COLUMN IF NOT EXISTS rcept_endde     date,       -- 청약접수 종료일
  ADD COLUMN IF NOT EXISTS przwner_presnatn_de date,   -- 당첨자 발표일
  ADD COLUMN IF NOT EXISTS mvn_prearnge_ym text,       -- 입주예정월 YYYYMM
  ADD COLUMN IF NOT EXISTS hssply_adres    text,       -- 공급위치 주소
  ADD COLUMN IF NOT EXISTS competition_rate numeric,   -- 경쟁률 (API 2 병합)
  ADD COLUMN IF NOT EXISTS is_active       boolean NOT NULL DEFAULT true;

-- 청약홈 공고번호 유니크 인덱스 (NULL 제외 — MOLIT 행과 공존)
CREATE UNIQUE INDEX IF NOT EXISTS new_listings_pblanc_no_idx
  ON public.new_listings(pblanc_no)
  WHERE pblanc_no IS NOT NULL;
```

**설계 근거**:
- `pblanc_no`에 NULL 허용 유니크 인덱스(`WHERE pblanc_no IS NOT NULL`) → MOLIT 기존 행(pblanc_no=NULL)은 제약 영향 없음 [VERIFIED: PostgreSQL NULL 처리 패턴]
- `is_active DEFAULT true` → 신규 행은 즉시 표시, cron에서 마감 후 false 처리

### `complex_status` enum 현황

[VERIFIED: 20260430000002_complexes.sql + 20260520000001_extend_complex_status_enum.sql]

현재 값: `pre_sale`, `under_construction`, `recently_built`, `active`, `in_redevelopment`, `demolished`, `merged`, `rental`

`in_redevelopment`는 이미 존재. Phase 13에서 enum 변경 불필요.

### 재건축 관련 complexes 컬럼

[VERIFIED: 20260430000002_complexes.sql]

- `predecessor_id uuid` — 재건축 이전 단지 FK (self-referencing)
- `successor_id uuid` — 재건축 이후 단지 FK (self-referencing)
- `status complex_status` — `in_redevelopment` 사용

---

## 청약홈 API 상세

### API 3: 분양정보 조회 서비스

[VERIFIED: data.go.kr #15098547 페이지 접근]

- **엔드포인트**: `https://apis.data.go.kr/B552555/APTLttotPblancDetail/getAPTLttotPblancList`
- **요청 파라미터**:
  - `serviceKey` — API 키 (URL encoded)
  - `pageNo` — 페이지 번호
  - `numOfRows` — 페이지당 행 수
  - `RoadNmSggCd` — 법정동코드 (창원: `4812500000`, 김해: `4825000000`) [VERIFIED: CONTEXT.md]
  - `HouseSecd` — 주택구분 (APT = `01`) [ASSUMED: 공식문서 미직접검증]
  - `_type` — `json`

- **응답 필드** (PublicDataReader 문서 + CONTEXT.md 기준):

| 필드명 | 한국어 | 타입 | 신뢰도 |
|--------|--------|------|--------|
| `PBLANC_NO` | 공고번호 | TEXT | [ASSUMED] |
| `PBLANC_NM` | 주택명 | TEXT | [ASSUMED] |
| `SUBSCRPT_AREA_CODE_NM` | 공급지역명 | TEXT | [VERIFIED: PublicDataReader] |
| `HSSPLY_ADRES` | 공급위치 | TEXT | [ASSUMED] |
| `TOT_SUPLY_HSHLDCO` | 총 공급세대수 | INTEGER | [VERIFIED: PublicDataReader] |
| `RCEPT_BGNDE` | 청약접수 시작일 | DATE(YYYYMMDD) | [ASSUMED] |
| `RCEPT_ENDDE` | 청약접수 종료일 | DATE(YYYYMMDD) | [ASSUMED] |
| `PRZWNER_PRESNATN_DE` | 당첨자 발표일 | DATE | [ASSUMED] |
| `MVN_PREARNGE_MNTDY` | 입주예정월 | TEXT(YYYYMM) | [ASSUMED] |
| `HOUSE_SECD` | 주택구분코드 | TEXT | [ASSUMED] |

**CRITICAL**: 위 ASSUMED 필드명들은 Swagger UI 또는 실제 API 호출로 Wave 0에서 반드시 검증 필요.

CONTEXT.md specifics의 필드명(소문자, snake_case) vs PublicDataReader 확인 결과(UPPER_CASE)가 불일치함. **실제 응답은 UPPER_CASE일 가능성이 높음** (API 2 경쟁률 응답이 UPPER_CASE로 확인됨).

### API 2: 경쟁률 조회 서비스

[VERIFIED: PublicDataReader 문서 — PBLANC_NO, CMPET_RATE 필드 확인]

- **엔드포인트**: `https://apis.data.go.kr/B552555/APTRcritPblancDetail/getAPTRcritPblancList`
- **요청 파라미터**: `serviceKey`, `PBLANC_NO`, `_type`

- **응답 필드**:

| 필드명 | 한국어 | 신뢰도 |
|--------|--------|--------|
| `PBLANC_NO` | 공고번호 (join key) | [VERIFIED: PublicDataReader] |
| `CMPET_RATE` | 경쟁률 | [VERIFIED: PublicDataReader] |
| `HOUSE_TY` | 주택형 | [VERIFIED: PublicDataReader] |
| `SUPLY_HSHLDCO` | 공급세대수 | [VERIFIED: PublicDataReader] |
| `SUBSCRPT_RANK_CODE` | 청약 순위 코드 | [VERIFIED: PublicDataReader] |

**병합 전략**: API 3 수집 후 `pblanc_no` 목록으로 API 2 일괄 조회 → `MAX(CMPET_RATE)` 또는 전체 평균을 `competition_rate`에 저장. 주택형별 여러 행이 오면 집계 필요.

### API 인증

- **키 관리**: `CHEONGYAK_API_KEY` 환경변수 (data.go.kr 개발계정 발급)
- **한도**: 개발계정 40,000건/일 (일배치 경남 2개 시군구 조회에 충분)
- **Cron 보안**: 기존 `CRON_SECRET` 헤더 검증 패턴 유지

---

## Common Pitfalls

### Pitfall 1: API 응답 필드명 케이스 불일치

**What goes wrong:** CONTEXT.md specifics의 `pblancNo` (camelCase) vs 실제 응답 `PBLANC_NO` (UPPER_CASE). Zod 파싱 실패 → 빈 배열 반환, 에러 없음.
**Why it happens:** data.go.kr API 서비스별로 케이스 규칙이 다름.
**How to avoid:** Wave 0에서 테스트 API 키로 실제 호출 후 응답 JSON 로깅. Zod `z.string().optional()` + `safeParse` 사용하여 미지 필드 무시.
**Warning signs:** fetchCheongyakList가 빈 배열 반환하면서 에러 없음.

### Pitfall 2: UNIQUE(name, region) 제약과 pblanc_no 충돌

**What goes wrong:** 청약홈 공고명이 기존 MOLIT 전매 행의 `name`과 동일하고 `region`도 같으면 upsert시 `onConflict: 'pblanc_no'`가 아닌 `UNIQUE(name, region)` 제약에 걸릴 수 있음.
**Why it happens:** PostgreSQL upsert의 `onConflict` 는 지정한 제약만 처리, 다른 제약 위반은 에러.
**How to avoid:** `pblanc_no`가 있는 청약홈 행은 `name`을 `pblanc_nm` (주택명 전체)으로, `region`을 `supply_region`으로 채워 MOLIT 전매 데이터와 충분히 구분되게 설정. 또는 `pblanc_no` 전용 upsert 분기 처리.
**Warning signs:** cron에서 `duplicate key value violates unique constraint "new_listings_name_region_key"` 에러.

### Pitfall 3: is_active 마감 처리 누락

**What goes wrong:** `rcept_endde`가 지난 공고가 계속 Tier 1에 표시됨.
**Why it happens:** `is_active` 컬럼은 삽입 시 `true`이고, 마감 후 자동으로 `false`가 되지 않음.
**How to avoid:** daily cron에서 수집 후 `UPDATE new_listings SET is_active=false WHERE rcept_endde < current_date AND pblanc_no IS NOT NULL AND is_active=true` 실행. 또는 `getActiveListings()` 쿼리에 `rcept_endde >= current_date OR rcept_endde IS NULL` 조건 추가.
**Warning signs:** 마감된 분양 공고가 /presale Tier 1에 계속 표시됨.

### Pitfall 4: getActiveListings() 기존 쿼리 하위호환성

**What goes wrong:** `getActiveListings()`를 수정하면 기존 MOLIT 기반 행(신규 컬럼 모두 NULL)이 다르게 렌더링됨.
**Why it happens:** 기존 `PresaleCard`는 `name`, `region`, `price_min/max`, `total_units`, `move_in_date` 만 사용. 새 필드는 NULL.
**How to avoid:** 청약홈 카드와 MOLIT 카드를 구분 렌더링: `pblanc_no IS NOT NULL` → 청약홈 카드, `pblanc_no IS NULL` → 기존 카드 유지. 또는 `pblanc_no IS NOT NULL` 행만 Tier 1로 사용.
**Warning signs:** 기존 분양권전매 행이 청약홈 카드처럼 렌더링됨.

### Pitfall 5: admin 단지 검색 N+1 쿼리

**What goes wrong:** admin redevelopment 페이지에서 모든 단지를 로드하면 수천 행 쿼리.
**Why it happens:** listing-prices admin은 `SELECT id, canonical_name, si, gu FROM complexes WHERE status='active' LIMIT 500` 패턴.
**How to avoid:** `/admin/redevelopment`는 검색 입력 → 서버 액션으로 `ilike` 검색, 초기 로드 시 전체 목록 로드하지 않음. 또는 `use server` 폼 액션 + 서버사이드 검색.
**Warning signs:** admin 페이지 로드 시간 > 2s.

---

## Code Examples

### 1. 법정동코드 필터 (창원·김해)

```typescript
// Source: CONTEXT.md specifics (VERIFIED)
// 창원: 4812500000, 김해: 4825000000
// API 파라미터 RoadNmSggCd 기준
export const CHEONGYAK_SGG_CODES = ['4812500000', '4825000000'] as const
```

### 2. normalize.ts 패턴

```typescript
// Source: CONTEXT.md decisions + 기존 molit-presale.ts 패턴
// [ASSUMED: 실제 필드명은 API 호출 후 검증 필요]
export function normalizeCheongyakItem(item: CheongyakItem): NewListingCheongyakRow {
  return {
    name: item.PBLANC_NM ?? '',
    region: item.SUBSCRPT_AREA_CODE_NM ?? '',
    pblanc_no: item.PBLANC_NO,
    pblanc_nm: item.PBLANC_NM ?? null,
    supply_region: item.SUBSCRPT_AREA_CODE_NM ?? null,
    supply_count: item.TOT_SUPLY_HSHLDCO ?? null,
    rcept_bgnde: parseDateStr(item.RCEPT_BGNDE) ?? null,
    rcept_endde: parseDateStr(item.RCEPT_ENDDE) ?? null,
    hssply_adres: item.HSSPLY_ADRES ?? null,
    mvn_prearnge_ym: item.MVN_PREARNGE_MNTDY ?? null,
    is_active: true,
    fetched_at: new Date().toISOString(),
  }
}

function parseDateStr(s: string | undefined): string | null {
  if (!s || s.length !== 8) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
```

### 3. /presale 페이지 3-tier RSC 패턴

```typescript
// Source: 기존 presale/page.tsx + CONTEXT.md decisions
export const revalidate = 3600

export default async function PresalePage() {
  const supabase = createReadonlyClient()
  const [listings, redevelopments, newBuilds] = await Promise.all([
    getActiveListings(supabase, 20),
    getRedevelopmentComplexes(supabase, 20),
    getNewBuiltComplexes(supabase, 30),
  ])
  // ...
}
```

### 4. 섹션 조건부 렌더 패턴

```typescript
// CONTEXT.md decision: 데이터 없으면 헤더도 숨김 (신축 제외)
{listings.length > 0 && (
  <section>
    <h2>분양 공고</h2>
    {listings.map(l => <PresaleCard key={l.id} listing={l} />)}
  </section>
)}

{redevelopments.length > 0 && (
  <section>
    <h2>재건축 예정</h2>
    {/* ... */}
  </section>
)}

{/* 신축: 항상 표시 */}
<section>
  <h2>신축 단지</h2>
  {newBuilds.map(c => <NewBuildCard key={c.id} complex={c} />)}
</section>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MOLIT 분양권전매 API (전매 실거래) | 청약홈 API 3 (분양 공고 원본) | Phase 13 신규 | 공고 단계부터 수집 가능 |
| 단일 분양 목록 (new_listings 미분류) | 3-tier 우선순위 (공고→재건축→신축) | Phase 13 신규 | 실수요자 관점 정보 계층화 |
| 재건축 정보 없음 | admin 수동 입력 (in_redevelopment) | Phase 5 스키마, Phase 13 UI | 창원·김해 맞춤 (API 없음) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 청약홈 API 3 응답 필드명이 UPPER_CASE (PBLANC_NO, RCEPT_BGNDE 등) | Standard Stack, Code Examples | Zod 스키마 전면 수정 필요 |
| A2 | `HouseSecd=01` 파라미터로 APT만 필터링 가능 | Architecture Patterns | 오피스텔 등 불필요 데이터 포함 |
| A3 | `RoadNmSggCd=4812500000`이 창원 전체 조회 파라미터로 작동 | Architecture Patterns | 지역 필터 누락으로 전국 조회 → 한도 초과 |
| A4 | API 2 경쟁률은 pblanc_no 1개당 복수 행(주택형별) 반환 | Common Pitfalls | 단순 최솟값 사용 시 경쟁률 오표시 |
| A5 | `requireAdmin()` 헬퍼 또는 동등한 admin 체크 함수가 이미 존재하거나 listing-prices 패턴 복사로 구현 가능 | Code Examples | admin guard 신규 구현 필요 |

---

## Open Questions

1. **청약홈 API 필드명 케이스 확인**
   - What we know: API 2(경쟁률) 응답은 UPPER_CASE 확인 (PublicDataReader 문서). API 3는 동일 규칙으로 추정.
   - What's unclear: API 3의 정확한 필드명 리스트 (Word 기술문서 직접 열람 불가).
   - Recommendation: Wave 0에서 테스트 API 키로 실제 호출 후 `JSON.stringify` 로깅으로 확인.

2. **경쟁률 집계 방식**
   - What we know: API 2는 주택형별 복수 행 반환 (`HOUSE_TY`, `SUPLY_HSHLDCO`).
   - What's unclear: 카드에 표시할 대표 경쟁률 = 전체 평균? 최고? 1순위?
   - Recommendation: CONTEXT.md에 명시 없음 → Claude's Discretion. 일반 사용자 관점에서 전체 평균 또는 1순위 평균을 추천.

3. **기존 MOLIT 분양권전매 행 처리**
   - What we know: 기존 daily cron이 MOLIT 전매 데이터를 new_listings에 계속 upsert함.
   - What's unclear: Phase 13 이후 MOLIT 전매 행을 Tier 1에 표시할 것인지, 숨길 것인지. `pblanc_no IS NOT NULL` 조건으로 청약홈 공고만 Tier 1에 표시하는 것이 자연스러움.
   - Recommendation: `getActiveListings()`에 `pblanc_no IS NOT NULL` 조건 추가로 청약홈 공고만 필터링.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 전체 | ✓ | v24.14.0 | — |
| CHEONGYAK_API_KEY | PRESALE-01/02 | ✗ | — | Mock 데이터로 스캐폴드 개발, 키 발급 후 실 연결 |
| Supabase (로컬) | DB 마이그레이션 | ✓ (기존 사용 중) | — | — |
| MOLIT_API_KEY | 기존 daily cron | ✓ (기존) | — | — |

**Missing dependencies with no fallback:** 없음.

**Missing dependencies with fallback:**
- `CHEONGYAK_API_KEY`: Wave 0 개발 시 mock fetch로 스캐폴드 구성 가능. 실 API 키는 Wave 1 cron 통합 전에 등록.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run src/services/cheongyak` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRESALE-01 | CHEONGYAK_API_KEY 미설정 시 throw | unit | `npm run test -- --run src/services/cheongyak/client.test.ts` | ❌ Wave 0 |
| PRESALE-01 | API 정상 응답 → new_listings row 변환 | unit | `npm run test -- --run src/services/cheongyak/normalize.test.ts` | ❌ Wave 0 |
| PRESALE-01 | API ok=false 시 throw | unit | (client.test.ts에 포함) | ❌ Wave 0 |
| PRESALE-02 | 경쟁률 null safe 처리 (없으면 null 반환) | unit | `npm run test -- --run src/services/cheongyak/client.test.ts` | ❌ Wave 0 |
| PRESALE-03 | getActiveListings pblanc_no 필터 | unit | `npm run test -- --run src/lib/data/presale.test.ts` | ❌ Wave 0 |
| PRESALE-03 | getRedevelopmentComplexes 반환 | unit | (presale.test.ts에 포함) | ❌ Wave 0 |
| PRESALE-03 | getNewBuiltComplexes built_year>=2021 | unit | (presale.test.ts에 포함) | ❌ Wave 0 |
| REDV-01 | setRedevelopmentStatus admin guard | unit | `npm run test -- --run src/lib/actions/redevelopment-actions.test.ts` | ❌ Wave 0 |

기존 패턴: `molit-presale.test.ts` → `vi.stubGlobal('fetch', ...)` + `process.env` 조작

### Sampling Rate

- **Per task commit:** `npm run test -- --run src/services/cheongyak`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/services/cheongyak/client.test.ts` — PRESALE-01, PRESALE-02
- [ ] `src/services/cheongyak/normalize.test.ts` — PRESALE-01 변환 검증
- [ ] `src/lib/data/presale.test.ts` — PRESALE-03 3-tier 쿼리 (Supabase mock 필요)
- [ ] `src/lib/actions/redevelopment-actions.test.ts` — REDV-01 admin action

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin UI) | Supabase Auth + requireAdmin() role check |
| V3 Session Management | no | — |
| V4 Access Control | yes (admin write) | `profiles.role IN ('admin', 'superadmin')` RLS + Server Action guard |
| V5 Input Validation | yes | Zod safeParse on API responses + Server Action inputs |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 만료 광고 노출 | Tampering | `is_active = true` 필터 + 기존 `now() BETWEEN starts_at AND ends_at` 패턴 준수 |
| admin action 권한 우회 | Elevation of Privilege | Server Action 내 `requireAdmin()` + RLS 이중 방어 |
| CHEONGYAK_API_KEY 노출 | Information Disclosure | 환경변수만 사용, `process.env.CHEONGYAK_API_KEY` 로그 출력 금지 |
| cron endpoint 무인증 호출 | Tampering | 기존 `CRON_SECRET` 헤더 검증 패턴 유지 (daily route.ts 동일) |

---

## Sources

### Primary (HIGH confidence)

- 코드베이스 직접 검증 — `src/services/molit.ts`, `src/services/molit-presale.ts`, `src/app/api/cron/daily/route.ts`, `src/lib/data/presale.ts`, `src/components/presale/PresaleCard.tsx`, `src/app/presale/page.tsx`, `src/app/admin/listing-prices/page.tsx`
- DB 마이그레이션 파일 — `20260507000004_phase4_tables.sql`, `20260430000002_complexes.sql`, `20260520000001_extend_complex_status_enum.sql`
- 프로젝트 설정 — `vitest.config.ts`, `package.json`, `.env.local.example`
- CONTEXT.md — Phase 13 설계 결정사항 (사용자 직접 결정)

### Secondary (MEDIUM confidence)

- [data.go.kr #15098547](https://www.data.go.kr/data/15098547/openapi.do) — 청약홈 분양정보 조회 서비스 개요 (서비스 설명, 한도, 포맷 확인)
- [data.go.kr #15098905](https://www.data.go.kr/data/15098905/openapi.do) — 청약홈 경쟁률 조회 서비스 개요
- [PublicDataReader Reb.md](https://github.com/WooilJeong/PublicDataReader/blob/main/assets/docs/portal/Reb.md) — API 2 경쟁률 응답 필드명 확인 (PBLANC_NO, CMPET_RATE, UPPER_CASE 규칙)

### Tertiary (LOW confidence — ASSUMED 태그 부착)

- 청약홈 API 3 응답 필드명 (PBLANC_NO, RCEPT_BGNDE 등) — 기술문서 Word 파일 접근 불가, UPPER_CASE 규칙으로 추정
- `HouseSecd=01` APT 필터 파라미터 — 공식 문서 미직접검증

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 기존 코드베이스와 동일 패턴
- Architecture: HIGH — daily cron + services/ 패턴 직접 검증
- DB 스키마: HIGH — migration SQL 직접 확인
- 청약홈 API 3 필드명: LOW — 기술문서 Word 미접근, UPPER_CASE 추정
- 청약홈 API 2 필드명: MEDIUM — PublicDataReader 문서 확인
- Pitfalls: HIGH — PostgreSQL NULL unique constraint, MOLIT/청약홈 혼재 패턴

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (안정적 API, 30일)
