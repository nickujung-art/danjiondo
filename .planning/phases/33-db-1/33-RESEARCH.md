# Phase 33: 전국 DB 확장 1단계 — 경남 전체 지역 확장 기반 구축 - Research

**Researched:** 2026-07-03
**Domain:** 지역 마스터 데이터 확장 (regions 테이블 시딩) + 하드코딩 지역 필터 리팩터링 + 국토부/K-apt 백필 파이프라인 확장 + Supabase 용량/비용 검토
**Confidence:** MEDIUM (코드베이스 감사는 HIGH, 법정동코드 목록·백필 소요시간 추정은 검증 필요)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**확장 범위 및 순서**
- 1단계: 경남 전체 시군구 (이번 phase)
- 2단계: 인접 광역시 (부산·울산 등) — 후속 phase
- 3단계: 전국 — 후속 phase
- 각 단계마다 리스크(비용·매칭 품질)를 검증한 뒤 다음 단계로 진행

**진행 방식**
- GSD Phase로 정식 기획 (가벼운 ad-hoc 방식 아님) — PRD·리스크·태스크 분해를 문서화 후 실행
- 이번 대화에서 이미 아키텍처 조사가 완료됨

**하드코딩 지역 필터 제거 원칙**
- `regions` 테이블(`sgg_code` PK, `is_active` 플래그)을 유일한 지역 마스터로 삼는다
- `ALLOWED_SGG_CODES`(invest.ts, gap-analysis.ts), `ACTIVE_SGG_CODES`(rankings-page.ts), `offiSggCodes`(api/cron/daily/route.ts), `LAWD_CODES`(molit-presale.ts) 등 인라인 배열 상수는 전부 `regions` 테이블에서 `is_active=true` 코드를 동적으로 조회하는 방식으로 교체
- 청약홈(cheongyak) 수집은 이미 전국 API 응답을 받으므로, 필터링 조건만 `regions.is_active` 기반으로 변경 (API 호출 자체는 변경 없음)
- 학군 랭킹 RPC / `seo-hierarchy.ts`의 `road_address LIKE '%구%'` 식 지역명 문자열 매칭은 이번 phase 범위에서는 **경남 시군구까지만 일반화** (전국 대응은 후속 phase). 김해시처럼 구(區)가 없는 시군구는 3단계 특수 케이스로 이미 분기되어 있으므로 그 패턴을 따른다
- `KakaoMap.tsx`의 `DEFAULT_CENTER`는 이번 phase에서 변경하지 않는다 (UI 변경은 재기획 대기 중이므로 보류) — 단, 향후 다지역 대응이 필요하다는 점만 RESEARCH.md에 기록

**비용/리스크 결정 게이트**
- Supabase 무료 티어(500MB) 초과가 확실시되는 시점(경남 전체 백필 완료 후 실측 용량)에 반드시 사용자에게 Pro 플랜 전환 여부를 확인 — 이 phase의 plan에 "실측 후 확인" 체크포인트를 포함할 것
- 국토부 API 일 10,000회 한도로 인해 경남 전체 10년 백필은 여러 날에 걸쳐 분할 실행 (05-00 phase "창원+김해 전체 3일 분할, timeout 300분" 선례 재사용)

**매칭 품질**
- 신규 지역 실거래가 수집 시 `complex_match_queue`에 쌓이는 미매칭 건은 자동 승인하지 않는다 — 검수 큐 방식 유지
- 창원·김해 전용 수동 별칭(`20260518000002_manual_aliases.sql`) 같은 지역 특화 보정 작업은 이번 phase 범위 밖

### Claude's Discretion
- (CONTEXT.md에 명시적 discretion 섹션 없음 — 위 Decisions가 사실상 전 범위를 고정함. 단, 아래 "새로 발견된 항목"에 대한 처리 방식은 planner가 판단해야 함 — Open Questions 참고)

### Deferred Ideas (OUT OF SCOPE)
- 인접 광역시(부산·울산 등) 확장 — Phase 33b 이후로 분리
- 전국 확장 — 별도 phase로 분리
- `naver-cafe.ts` 지역별 카페 소스 다중화 — 별도 phase
- 학군 랭킹/`seo-hierarchy.ts`의 전국형 지역명 매칭 일반화 — 경남까지만 이번에 처리
- `KakaoMap.tsx` `DEFAULT_CENTER` 다지역 대응 — 프론트엔드 재기획 대기 중
- 창원·김해처럼 신규 지역에 대한 수동 별칭(manual_aliases) 보정 작업 — 자연 매칭률 관찰 후 필요 시 별도 진행
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **CRITICAL** 외부 API(국토부·카카오·학교알리미·K-apt) 호출은 `src/services/` 어댑터 전용 — 컴포넌트/라우트 직접 호출 금지. 이번 phase는 기존 어댑터(`molit.ts`, `kapt.ts`)를 그대로 재사용하며 신규 어댑터 불필요.
- **CRITICAL** Supabase 쿼리는 서버 컴포넌트·API Route 전용.
- **CRITICAL** 사용자 데이터 테이블 RLS 필수 — `regions`는 이미 public read 정책 보유 (write는 명시 정책 없음 = service_role만 가능, 정상).
- **CRITICAL** `complexes`가 Golden Record. 좌표+이름 복합 매칭 유지 — 신규 지역도 동일 매칭 로직(`match_complex_by_admin` RPC, 유사도 0.9 임계) 그대로 적용됨.
- **CRITICAL** 거래 조회는 `WHERE cancel_date IS NULL AND superseded_by IS NULL` 필수 — 기존 쿼리 패턴 유지, 신규 지역도 동일.
- Server Action 우선. REST Route는 외부 노출 필요 시만 — 이번 phase는 백필 스크립트(Node CLI) + cron route 리팩터 중심이라 해당 없음.
- 커밋 컨벤션: `feat(scope):` / `fix:` / `refactor:` / `docs:` / `chore:` — regions 시딩은 `feat(33-db-1)`, 하드코딩 제거는 `refactor(33-db-1)` 권장.
- TDD 원칙 — 하드코딩 필터 리팩터링은 기존 테스트(`ALLOWED_SGG_CODES` 관련 유닛 테스트가 있다면) 먼저 갱신 후 구현.

## Summary

이 phase는 새로운 라이브러리나 프레임워크를 도입하지 않는다. 핵심은 (1) `regions` 테이블에 경남 전체 시군구 16개를 추가 시딩하고, (2) 이미 지역코드 파라미터 기반으로 설계된 범용 파이프라인(`molit.ts`, `kapt.ts`, `backfill-realprice.ts`)이 `regions.is_active`를 동적으로 읽도록 되어 있는 구조를 그대로 활용하며, (3) 지역을 인라인 배열 상수로 하드코딩한 **데이터 레이어 파일들**을 `regions` 테이블 동적 조회로 리팩터링하는 작업이다.

코드베이스 감사 결과, CONTEXT.md가 사전 조사에서 식별한 9개 하드코딩 지점 외에 **추가로 최소 1개의 런타임 데이터 레이어 하드코딩**(`src/lib/data/rankings.ts`의 `ACTIVE_SGG_CODES` — 코드 내 주석에 "확장 시 regions 테이블에서 동적 조회로 변경 가능"이라고 이미 명시됨)과, UI 레이어에 흩어진 다수의 `SGG_LABEL` 객체·`ALLOWED_SGG`류 배열(예: `invest/page.tsx`, `gap-analysis/page.tsx`, `AdCreateForm.tsx`, `EnrichedPresaleCard.tsx` 등)이 발견되었다. CONTEXT.md는 "UI 변경 없음"을 명시했지만, `invest.ts`/`gap-analysis.ts`의 `ALLOWED_SGG_CODES`를 동적으로 바꾸면 이 UI 파일들의 `SGG_LABEL` 매핑에 없는 신규 코드가 원본 코드 그대로 노출되는 부작용이 발생한다 — Open Questions 참고.

법정동코드(경남 16개 추가 시군구) 목록은 WebSearch로 2개 독립 출처에서 교차 검증했으나 code.go.kr 원본 표에서 직접 확인하지 못했다 (MEDIUM confidence) — 백필 실행 전 `scripts/backfill-realprice.ts --sgg=<code> --from=<최근월> --to=<최근월>` 단발 테스트로 API 응답이 정상인지(즉, 코드가 유효한지) 검증할 것을 권장한다.

Supabase Pro 플랜 요금(8GB $25/월, 초과 GB당 $0.125, egress 250GB 포함 초과 GB당 $0.09)은 공식 pricing 페이지에서 확인했다 (HIGH confidence). 국토부 API 일 10,000회 한도 하의 정확한 백필 소요일수는 예측 불가능한 변수(신규 지역별 실제 거래량)에 의존하므로 계산 방법론만 제시하고, 실측 기반 반복 실행을 권장한다.

**Primary recommendation:** 새 라이브러리 도입 없이 기존 어댑터·백필 스크립트를 재사용한다. Wave 구성은 (a) regions 시딩 마이그레이션 + 하드코딩 제거 리팩터(데이터 레이어만, UI 라벨 맵은 방어적 처리), (b) 신규 16개 지역 국토부/K-apt 백필 실행 및 모니터링, (c) 용량 실측 + Pro 플랜 결정 체크포인트 순으로 진행한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 지역 마스터 데이터 관리 (regions 테이블 시딩) | Database / Storage | — | `regions`가 유일한 SoT(source of truth), 마이그레이션으로 관리 |
| 하드코딩 지역 필터 → 동적 조회 전환 | API / Backend (data layer) | — | `src/lib/data/*.ts`는 서버 전용(`server-only`) 데이터 레이어, RSC/Route에서 호출 |
| 국토부/K-apt 백필 실행 | API / Backend (배치 스크립트) | Database | `scripts/backfill-realprice.ts` Node CLI, GitHub Actions에서 트리거, Supabase에 적재 |
| Supabase 용량/비용 모니터링 | Database / Storage | — | Supabase 프로젝트 설정(Dashboard/Billing), 코드 변경 없음 |
| 학군 랭킹 지역명 매칭 일반화 | Database (RPC) | API / Backend | `school_ranking` SQL 함수 — `p_si` 파라미터가 이미 임의 문자열 허용, 코드 변경 불필요 확인됨 |
| UI 지역 라벨 표시 (SGG_LABEL 등) | Browser / Client (RSC 렌더) | — | 이번 phase 범위 밖(재기획 대기) — 단, 신규 코드가 노출될 경우 fallback 필요 |

## Standard Stack

### Core
새 라이브러리 도입 없음. 기존 스택을 그대로 재사용한다.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 기존 버전 유지 | regions 테이블 CRUD, 백필 upsert | 이미 프로젝트 표준 |
| `zod/v4` | 기존 버전 유지 | 국토부/K-apt API 응답 파싱(`molit.ts`, `kapt.ts`) — 신규 지역도 동일 스키마 | 이미 검증된 어댑터, 변경 불필요 |
| `tsx` | 기존 버전 유지 | `scripts/backfill-realprice.ts` 실행 | 기존 백필 워크플로 재사용 |

### Supporting
해당 없음 — 이 phase는 순수 데이터/리팩터 작업.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `regions` 테이블 동적 조회 | 하드코딩 배열 유지 + 지역 추가 시마다 배열 수정 | CONTEXT.md에서 명시적으로 배제됨 (유지보수 부채 누적) |
| GitHub Actions workflow_dispatch 반복 트리거로 백필 | 단일 초장기 실행 스크립트(로컬 nohup) | GitHub Actions가 이미 검증된 패턴(05-00 선례), 타임아웃/재개(`--resume`) 내장 |

**Installation:** 불필요 (신규 패키지 없음)

**Version verification:** 불필요 (기존 의존성 재사용, 버전 변경 없음)

## Architecture Patterns

### System Architecture Diagram

```
[regions 테이블: sgg_code, sgg_name, si, gu, is_active]
        │
        │ (동적 조회, is_active=true)
        ▼
┌───────────────────────────────────────────────────────────┐
│  데이터 레이어 (src/lib/data/*.ts, server-only)             │
│  ── 현재: 인라인 하드코딩 배열 (ALLOWED_SGG_CODES 등)         │
│  ── 목표: regions 테이블 SELECT is_active=true 로 대체        │
└───────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│ RSC/Route (읽기)       │   │ 백필 스크립트 (쓰기)             │
│ invest, gap-analysis, │   │ scripts/backfill-realprice.ts │
│ rankings-page, cron   │   │  → src/services/molit.ts      │
│ daily route 등        │   │  → src/services/kapt.ts       │
└──────────────────────┘   └──────────────────────────────┘
        │                              │
        ▼                              ▼
   사용자에게 렌더           Supabase: transactions, complexes,
   (이번 phase 범위 밖:      complex_match_queue, ingest_runs
    UI 라벨 매핑은 보류)
```

### 신규 시군구 백필 흐름 (region-month 단위)

```
GitHub Actions workflow_dispatch(sgg_codes=신규코드1,신규코드2,...)
  → scripts/backfill-realprice.ts --resume --sgg=...
      → getSggCodes(): --sgg 인자 있으면 그대로, 없으면 regions(is_active=true) 조회
      → monthRange(10년치) × [apt, villa] × [sale, rent] 조합 순회
          → src/services/molit.ts: fetchSalePage/fetchRentPage/fetchVillaSalePage/fetchVillaRentPage
              → LAWD_CD=sgg_code, DEAL_YMD=yearMonth, pageNo 페이지네이션
          → src/lib/data/realprice.ts: processSaleItem/processRentItem
              → match_complex_by_admin RPC (유사도 0.9 임계) → complex_id 자동 연결
              → 매칭 실패 시 complex_match_queue 적재 (자동 승인 안 함, CONTEXT.md 결정)
          → transactions upsert (dedupe_key 멱등성)
      → ingest_runs 테이블에 sgg_code+year_month+status 기록 (재개 가능)
  → API 한도(10,000회/일) 도달 예상 시 워크플로 재실행 (다음 날 --resume)
```

### Pattern 1: regions 테이블 기반 동적 지역 조회
**What:** 인라인 배열 상수(`const ALLOWED_SGG_CODES = ['48121', ...]`)를 `regions` 테이블에서 `is_active=true`인 행을 조회하는 함수로 교체
**When to use:** `src/lib/data/invest.ts`, `gap-analysis.ts`, `rankings-page.ts`, `rankings.ts`(신규 발견), `api/cron/daily/route.ts`의 `offiSggCodes`, `src/services/molit-presale.ts`의 `LAWD_CODES`
**Example (이미 검증된 패턴 — `scripts/backfill-realprice.ts`에 이미 구현됨):**
```typescript
// Source: scripts/backfill-realprice.ts (기존 코드, 이미 프로덕션에서 검증된 패턴)
async function getSggCodes(): Promise<string[]> {
  if (sggArg) return sggArg.split(',').map(s => s.trim())
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r: { sgg_code: string }) => r.sgg_code)
}
```
이 패턴을 RSC 데이터 레이어에도 그대로 적용 가능. `next: { revalidate: N }` 또는 React `cache()`로 요청 단위 캐싱하여 매 렌더마다 regions 테이블을 재조회하는 비용을 줄이는 것을 권장(신규 — 기존 코드엔 없음, 성능 최적화 discretion 항목).

### Pattern 2: 지역명 없는(구가 없는) 시군구 처리 — 이미 일반화되어 있음
**What:** `src/lib/data/seo-hierarchy.ts`의 `getSiPageData`는 `hasGu = data.some(c => c.gu)`로 구 존재 여부를 런타임에 판별한다 — 창원/김해라는 이름을 하드코딩하지 않는다.
**When to use:** 경남 나머지 16개 시군구(대부분 구 없음)는 이 함수를 그대로 재사용 가능, 코드 변경 불필요.
**검증 근거:** `src/lib/data/seo-hierarchy.ts:58` — `const hasGu = data.some(c => c.gu)` [VERIFIED: 코드베이스 직접 읽기]

### Pattern 3: 학군 랭킹 RPC의 지역명 매칭 — 이미 부분 일반화, gu 추출부만 창원 5개 구로 제한
**What:** `school_ranking(p_si, p_school_type, p_metric)` SQL 함수는 `p_si` 파라미터를 임의 문자열로 받는다(허용 목록 없음). `gu` 컬럼은 `road_address LIKE '%창원시 OO구%'` 5개 CASE WHEN 패턴으로만 추출하고, 매칭 안 되면 `ELSE NULL`로 자동 폴백한다.
**결론:** 경남 나머지 시군구(구 없는 시/군)에 대해 **SQL 함수 자체는 수정 없이도 정상 동작**한다 — `road_address`가 5개 창원 패턴에 안 걸리면 자동으로 `gu=NULL` 반환, 이는 김해시와 동일한 처리 흐름.
**검증 근거:** `supabase/migrations/20260616000004_school_ranking_rpc.sql:58-65`, `src/app/actions/education.ts:19` (metric만 allowlist, si는 자유 입력) [VERIFIED: 코드베이스 직접 읽기]
**주의:** CONTEXT.md는 "경남까지만 일반화"를 명시했지만, 실제로는 코드 변경이 필요 없다 — 이 phase의 태스크는 "확인 및 회귀 테스트 추가"로 축소될 수 있음 (Open Questions 참고).

### Anti-Patterns to Avoid
- **regions 테이블과 하드코딩 배열의 이중 관리:** 리팩터 후에도 일부 파일에 배열이 남아있으면(예: 이번 감사에서 발견된 `rankings.ts`) 신규 지역 데이터가 일부 페이지에서만 보이는 불일치 발생 — 전수 감사 필요.
- **UI 라벨 맵(`SGG_LABEL`)을 데이터 레이어 필터와 동시에 확장:** CONTEXT.md는 UI 변경을 명시적으로 배제했다. `ALLOWED_SGG_CODES`를 동적으로 만들면서 `SGG_LABEL` 객체(정적)를 그대로 두면, 신규 지역 선택 시 라벨이 `undefined` 또는 원본 코드로 노출되는 회귀가 발생한다 — 최소한 fallback(`SGG_LABEL[code] ?? code`는 이미 일부 파일에 존재)이 안전망 역할을 하지만 사용자 경험은 나쁨. 명시적으로 범위 밖 처리하거나, `regions.sgg_name`을 fallback 소스로 사용하는 절충안을 planner가 결정해야 함.
- **API 한도 무시한 일괄 백필:** 16개 신규 지역을 한 번의 workflow_dispatch로 전체 10년치 시도 시 300분 타임아웃 또는 10,000회/일 한도 초과로 실패·부분 완료 가능성 높음 — `--resume` 플래그와 `ingest_runs` 상태 기반 재실행 필수.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 법정동코드 유효성 검증 | 자체 파싱/검증 로직 | 기존 `regions.sgg_code` CHECK 제약(`~ '^\d{5}$'`) + 백필 스크립트 단발 실행으로 API 응답 검증 | 이미 스키마 레벨 제약 존재, 추가 검증 로직 불필요 |
| 백필 재개/멱등성 | 커스텀 체크포인트 파일 | 기존 `ingest_runs` 테이블 + `--resume` 플래그 | 이미 프로덕션에서 검증된 패턴(05-00), dedupe_key UNIQUE 제약으로 중복 upsert 안전 |
| 지역별 API 호출 속도 제한 | 커스텀 rate limiter 라이브러리 | 기존 `await new Promise(r => setTimeout(r, 200))` 패턴 | 이미 스크립트에 내장, 라이브러리 도입 불필요 |

**Key insight:** 이 phase는 신규 인프라가 아니라 기존에 이미 범용적으로 설계된 파이프라인의 "설정값 확장"에 가깝다. `molit.ts`/`kapt.ts`/`backfill-realprice.ts`는 처음부터 하드코딩 없이 지역코드 파라미터를 받도록 설계되어 있었다 — 이는 우연이 아니라 이전 phase(05-00)에서 이미 "확장 가능한 구조"로 의도적으로 설계된 것으로 보인다(코드 주석 "확장 시 regions 테이블에서 동적 조회로 변경 가능" 참고).

## Runtime State Inventory

> 이 phase는 하드코딩 상수 → DB 동적 조회 리팩터를 포함하므로 트리거 조건에 해당.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (DB) | `regions` 테이블 현재 6행(창원 5구+김해) — 경남 16개 시군구 미시딩. `data_sources` 테이블은 지역별이 아닌 소스별(molit_trade 등)이라 신규 지역 추가 시 별도 행 불필요(확인 완료: `data_sources.id`는 `molit_trade`, `molit_villa_trade` 등 소스 단위, sgg 단위 아님) | 코드 편집(마이그레이션 INSERT) — 데이터 마이그레이션 아님, 순수 시딩 |
| Live service config | GitHub Actions `molit-backfill-once.yml`의 `sgg_codes` 입력은 매 실행 시 수동 입력(워크플로 자체는 git 관리됨, 값만 실행 시점 입력) — git에 하드코딩된 상태 아님, 문제 없음 | 없음 — 실행 시 파라미터로 신규 코드 전달 |
| OS-registered state | 없음 — cron/workflow는 모두 git 관리 파일(`.github/workflows/*.yml`), OS 레벨 등록 없음 | 없음 |
| Secrets/env vars | `MOLIT_API_KEY`, `KAPT_API_KEY`는 전국 공통 키 — 지역 확장과 무관하게 그대로 사용 (CLAUDE.md: "모든 data.go.kr 서비스는 MOLIT_API_KEY 공통 사용") | 없음 |
| Build artifacts / 테스트 | `src/__tests__/seed-region.test.ts`가 `TARGET_SGG_CODES`를 6개로 하드코딩하고 `expect(data).toHaveLength(6)`으로 regions 행 수를 정확히 6으로 검증 — **경남 확장 시 이 테스트가 깨진다** | 코드 편집 — 테스트를 "6개 이상 포함" 또는 "경남 전체 22개" 검증으로 갱신 필요 |

**추가로 확인된 부분 일반화 상태:** `src/lib/data/rankings.ts`(CONTEXT.md의 9개 목록에 없음)는 자체 주석으로 "확장 시 regions 테이블에서 동적 조회로 변경 가능"이라 명시하고 있어 이번 리팩터 대상에 포함해야 한다 — Open Questions 참고.

## Common Pitfalls

### Pitfall 1: CONTEXT.md의 "9개 하드코딩 필터" 목록이 불완전함
**What goes wrong:** CONTEXT.md canonical_refs에 나열된 9곳만 리팩터하면 `src/lib/data/rankings.ts`의 `ACTIVE_SGG_CODES`(랜딩 페이지 랭킹 데이터에 사용)가 누락되어, 신규 지역 데이터가 백필되어도 랭킹 페이지에는 나타나지 않는 불일치가 발생한다.
**Why it happens:** 사전 조사가 `invest.ts`/`gap-analysis.ts`/`rankings-page.ts`/`cron/daily/route.ts`/`molit-presale.ts`/`school_ranking RPC`/`seo-hierarchy.ts` 중심으로 진행되었고, 같은 패턴의 `rankings.ts`(파일명이 `rankings-page.ts`와 유사해 혼동 가능)를 놓쳤다.
**How to avoid:** 리팩터 태스크 시작 전 `grep -rn "ALLOWED_SGG_CODES\|ACTIVE_SGG_CODES\|TARGET_SGG\|VALID_SGG_CODES\|LAWD_CODES\|offiSggCodes" src/` 전수 재검색을 첫 태스크로 포함.
**Warning signs:** 특정 페이지(랭킹/투자/갭분석/지도/광고)에서만 신규 지역 데이터가 누락되는 현상.

### Pitfall 2: 데이터 레이어 리팩터가 UI 레이어의 정적 라벨 맵과 충돌
**What goes wrong:** `invest.ts`/`gap-analysis.ts`의 `ALLOWED_SGG_CODES`를 동적으로 바꾸면, 이를 import하는 `invest/page.tsx`·`gap-analysis/page.tsx`의 로컬 `SGG_LABEL` 객체(정적, 6개 항목만)에 신규 코드가 없어 `SGG_LABEL[code] ?? code`가 원본 5자리 코드를 그대로 노출한다. `PredictionSection.tsx`, `prediction-commentary/route.ts`, `AdCreateForm.tsx`, `AdEditForm.tsx`, `EnrichedPresaleCard.tsx`, `BuilderOptionsPanel.tsx`도 동일한 정적 `SGG_LABEL`/드롭다운 배열을 갖고 있다.
**Why it happens:** CONTEXT.md가 "UI 변경 없음"을 명시했으나, 데이터 레이어의 allowlist를 걷어내는 순간 UI가 암묵적으로 새 입력값을 받게 되는 부작용을 사전 조사에서 충분히 짚지 않았다.
**How to avoid:** planner는 다음 중 하나를 명시적으로 선택해야 한다 — (a) `invest.ts`/`gap-analysis.ts`의 allowlist를 동적으로 바꾸되 UI 컴포넌트의 allowlist는 **별도로 유지**(즉 데이터는 수집되지만 이 특정 UI 필터 드롭다운에는 아직 노출 안 함 — "수집은 전국형, 노출은 창원·김해 유지"), 또는 (b) 이 UI 파일들도 최소한의 라벨 fallback만 추가(레이아웃 변경 없이 `regions.sgg_name` 조회로 라벨만 대체). CONTEXT.md 취지(재기획 대기 중 UI 미변경)를 존중하면 (a)가 안전.
**Warning signs:** `/invest`, `/gap-analysis` 페이지의 지역 드롭다운에 "48170" 같은 원본 코드가 노출됨.

### Pitfall 3: 국토부 API 일일 호출 한도는 프로젝트 전체 공유 자원
**What goes wrong:** `MOLIT_API_KEY`는 일배치 cron(`molit-daily.yml`), 분양권전매(`molit-presale.ts`), 오피스텔(`realprice-officetel.ts`), 청약홈 등 여러 워크플로가 공유한다. 백필 workflow_dispatch를 일배치 cron과 같은 날 대량 실행하면 두 파이프라인이 같은 10,000회/일 한도를 경합하여 일배치가 실패할 수 있다.
**Why it happens:** API 키가 서비스 단위가 아닌 계정 단위 한도이기 때문(data.go.kr 공통 정책).
**How to avoid:** 백필 workflow_dispatch는 일배치 cron(04:00 KST) 실행 전후 시간대를 피해서 트리거하거나, 백필 진행 중에는 일배치 실패를 허용 가능한 리스크로 명시. `ingest_runs`의 `status='failed'` 발생 시 원인이 rate limit인지 로그로 구분 가능하도록 에러 메시지에 HTTP 상태코드 포함 확인.
**Warning signs:** 백필 실행 중인 날 일배치 cron이 `partial`/`failed` 상태로 종료.

### Pitfall 4: 법정동코드 오탐 시 무의미한 API 호출로 한도 소진
**What goes wrong:** 검증되지 않은 법정동코드로 10년치 백필을 시작하면, 코드가 틀렸을 경우(예: 시/군 통합 이력으로 코드가 변경된 지역) 빈 응답을 반복 수신하며 한도만 소진하고 데이터는 하나도 안 쌓인다.
**Why it happens:** 국토부 API는 잘못된 LAWD_CD에도 200 OK + 빈 items를 반환하는 경우가 있어(HTTP 에러로 드러나지 않음) 조용히 실패한다.
**How to avoid:** 신규 지역 각각에 대해 최근 1개월치만 먼저 백필(`--sgg=<code> --from=<YYYYMM> --to=<YYYYMM>`)하여 `rowsFetched > 0`을 확인한 후 10년 전체 백필을 트리거하는 2단계 검증 절차를 태스크에 포함.
**Warning signs:** `ingest_runs.status='success'`인데 `rowsUpserted=0`이 다수 지역에서 반복.

### Pitfall 5: Supabase 무료 티어 500MB는 DB 전체 용량(인덱스 포함) 기준
**What goes wrong:** "실측 후 확인" 체크포인트를 transactions 행 수 증가만으로 판단하면, 인덱스(특히 `USING gist(location)`, `USING gin(name_normalized gin_trgm_ops)`, `dedupe_key UNIQUE`)가 차지하는 용량을 과소평가하게 된다.
**Why it happens:** 개발자가 "테이블 데이터"와 "DB 용량"을 혼동하기 쉬움 — Postgres에서 인덱스는 종종 테이블 데이터 크기의 30~100%에 달할 수 있다.
**How to avoid:** 실측 시 `SELECT pg_size_pretty(pg_database_size(current_database()))` (전체) 뿐 아니라 `SELECT pg_size_pretty(pg_total_relation_size('transactions'))` (테이블+인덱스+TOAST)로 개별 테이블도 확인 — Supabase Dashboard의 Database → Database Size 메뉴에서도 확인 가능.
**Warning signs:** 백필 완료 직후 갑자기 무료 티어 한도(400MB 알람 임계)를 초과.

## Code Examples

### regions 테이블 동적 조회 (기존 백필 스크립트 패턴 — 데이터 레이어로 이식)
```typescript
// Source: scripts/backfill-realprice.ts (검증된 기존 패턴)
export async function getActiveSggCodes(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map(r => r.sgg_code)
}
```

### regions 테이블 지역명 조회 (UI 라벨 fallback 용, Pitfall 2 대응 시 참고)
```sql
-- regions.sgg_name은 이미 스키마에 존재 (창원시 시딩 시 '의창구' 등으로 채워짐 — 확인 필요)
select sgg_code, sgg_name, si, gu from public.regions where is_active = true order by sgg_code;
```

### 경남 신규 시군구 시딩 마이그레이션 스켈레톤
```sql
-- Source: 기존 supabase/migrations/20260430000010_regions.sql 스키마 그대로 사용, INSERT만 추가
insert into public.regions (sgg_code, sgg_name, si, gu, is_active) values
  ('48170', '진주시', '진주시', null, true),
  ('48220', '통영시', '통영시', null, true),
  ('48240', '사천시', '사천시', null, true),
  ('48270', '밀양시', '밀양시', null, true),
  ('48310', '거제시', '거제시', null, true),
  ('48330', '양산시', '양산시', null, true),
  ('48720', '의령군', '의령군', null, true),
  ('48730', '함안군', '함안군', null, true),
  ('48740', '창녕군', '창녕군', null, true),
  ('48820', '고성군', '고성군', null, true),
  ('48840', '남해군', '남해군', null, true),
  ('48850', '하동군', '하동군', null, true),
  ('48860', '산청군', '산청군', null, true),
  ('48870', '함양군', '함양군', null, true),
  ('48880', '거창군', '거창군', null, true),
  ('48890', '합천군', '합천군', null, true)
on conflict (sgg_code) do nothing;
-- ⚠ 코드는 MEDIUM confidence — 백필 실행 전 각 코드 단발 검증 필수 (Pitfall 4)
```

## State of the Art

해당 없음 — 이 phase는 기존 패턴을 확장하는 작업이며, 프레임워크/라이브러리 트렌드 변화와 무관하다.

**참고 (미변경이지만 향후 확장 시 고려):**
- 현재 국토부 아파트 매매 실거래가 상세 API는 `RTMSDataSvcAptTradeDev`(Dev 버전) 엔드포인트 사용 중 — data.go.kr이 주기적으로 API 버전을 갱신하므로(예: K-apt 기본정보는 이미 V1→V4 전환 경험 있음, `kapt.ts` 참고), 전국 확장(3단계) 시점에는 최신 엔드포인트 유효성 재확인 권장.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 경남 16개 신규 시군구의 5자리 법정동코드(48170, 48220, 48240, 48270, 48310, 48330, 48720, 48730, 48740, 48820, 48840, 48850, 48860, 48870, 48880, 48890) | Code Examples, Summary | 코드가 틀리면 마이그레이션 INSERT 자체는 성공(형식만 검증)하지만 백필 시 빈 데이터만 쌓임 — Pitfall 4의 단발 검증 절차로 완화 가능 |
| A2 | 경남 전체 10년 백필이 "5~8 영업일" 내외로 소요될 것이라는 추정 | Open Questions | 신규 지역별 실제 거래량을 모르므로 순수 추정치 — 과소/과대 추정 시 일정 계획에만 영향, 기능 자체엔 영향 없음(재개 가능 설계이므로) |
| A3 | `regions.sgg_name` 컬럼이 이미 창원·김해 6행에 대해 올바른 한글명으로 채워져 있음 | Code Examples | 실제로는 `sgg_name`이 비어있거나 다른 형식일 수 있음 — plan 단계에서 `select * from regions` 1회 확인 필요 |
| A4 | Supabase 프로젝트가 현재 무료 티어(Free)이며 아직 Pro로 전환되지 않았다 | Summary, Runtime State Inventory | CONTEXT.md·ARCHITECTURE.md 모두 "500MB 무료 한도" 기준으로 서술하고 있어 근거 있음, 하지만 실제 플랜 상태는 Supabase Dashboard에서 직접 확인 필요 |

**A1은 두 개의 독립 웹 소스(apt-info.github.io, land.koreacharts.com)에서 교차 검증되었고 리서치 담당자의 학습 지식과도 일치하나, code.go.kr 원본 표를 직접 열람하지 못했으므로 MEDIUM confidence로 유지한다.**

## Open Questions

1. **`rankings.ts`의 `ACTIVE_SGG_CODES`를 이번 phase 리팩터 범위에 포함할 것인가?**
   - What we know: CONTEXT.md의 canonical_refs 9개 목록에는 없지만, 랜딩 페이지 랭킹(`getRecentDailyFeed`, `getChampionComplexes`, `getRegionalPriceRanking` 등 4곳에서 사용)에 직접 영향을 미치는 동일 패턴의 하드코딩이다. 코드 자체 주석이 이미 확장을 예견하고 있다.
   - What's unclear: 사용자가 이 파일을 의도적으로 제외했는지(예: 랜딩 랭킹은 여전히 창원·김해로 한정 유지하고 싶어서), 단순히 사전 조사에서 누락된 것인지 불명확.
   - Recommendation: planner가 discuss 단계 없이 진행한다면, `rankings.ts`도 동일 리팩터 대상에 포함하되 "랭킹 데이터 노출 범위가 경남 전체로 확대된다"는 것을 실행 전 사용자에게 한 줄 컨펌 받는 것을 권장 (CONTEXT.md 취지상 "UI 변경 없음"이지만 이건 UI가 아니라 노출되는 데이터 범위의 변경이므로 별개 이슈).

2. **데이터 레이어 allowlist 동적화 시 UI `SGG_LABEL` 정적 맵을 어떻게 처리할 것인가?** (Pitfall 2 참고)
   - What we know: 최소 6개 파일(`invest/page.tsx`, `gap-analysis/page.tsx`, `PredictionSection.tsx`, `prediction-commentary/route.ts`, `AdCreateForm.tsx`, `AdEditForm.tsx`, `EnrichedPresaleCard.tsx`, `BuilderOptionsPanel.tsx`)이 창원·김해 6개 지역명을 정적으로 하드코딩하고 있다.
   - What's unclear: CONTEXT.md의 "UI 변경 없음" 원칙을 그대로 적용하면 이 파일들의 allowlist는 6개로 유지해야 하는데, 그러면 `invest.ts`/`gap-analysis.ts`의 데이터 레이어 allowlist를 동적으로 바꿔도 실질적으로 UI에서 필터링 가능한 지역은 여전히 6개로 제한된다 — 이게 사용자의 의도인지(즉 "데이터는 수집하되 이번엔 노출 안 함") 확인 필요.
   - Recommendation: plan 단계에서 "이번 phase는 데이터 수집·저장까지만, 신규 지역 데이터의 UI 노출은 프론트엔드 재기획 이후 별도 phase"라는 원칙을 PLAN.md에 명시적으로 기록해 향후 혼란을 방지.

3. **경남 신규 16개 시군구의 실제 국토부 실거래 데이터 존재 시점(농어촌 지역은 아파트 거래 자체가 희소할 수 있음)**
   - What we know: 의령군·산청군·합천군 등은 인구 3만 미만의 농어촌 군 지역으로, 아파트 단지 수 자체가 매우 적을 가능성이 높다 (K-apt/국토부 데이터가 애초에 희소할 수 있음).
   - What's unclear: 정확한 단지 수·거래량은 API를 실제로 호출해봐야 알 수 있다.
   - Recommendation: Pitfall 4의 단발 검증 단계에서 자연스럽게 확인됨 — 거래가 거의 없는 지역은 백필 우선순위를 낮추거나(선택적 defer) 시간 예산에서 무시 가능한 수준으로 처리.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `MOLIT_API_KEY` (data.go.kr) | 국토부 실거래가 백필 | ✓ (GitHub Secrets에 등록됨, 05-00에서 검증됨) | — | 없음(필수) |
| `KAPT_API_KEY` (data.go.kr) | K-apt 단지 목록/기본정보 백필 | ✓ (기존 크론에서 이미 사용 중) | — | 없음(필수) |
| `SUPABASE_SERVICE_ROLE_KEY` | 백필 스크립트 DB 쓰기 | ✓ (기존 환경변수) | — | 없음(필수) |
| GitHub Actions `workflow_dispatch` | 백필 실행 트리거 | ✓ (`molit-backfill-once.yml` 기존 존재) | timeout-minutes: 300 | 없음 — 이미 검증된 워크플로 재사용 |
| Supabase Pro 플랜 | 500MB 초과 시 필요 | ✗ (미확인 — A4 참고) | — | 무료 티어로 시작 후 실측 기반 전환 결정(CONTEXT.md 체크포인트) |

**Missing dependencies with no fallback:** 없음 — 모든 필수 자격증명은 기존 파이프라인에서 이미 검증됨.

**Missing dependencies with fallback:** Supabase Pro 플랜 — 무료 티어로 시작, 실측 후 전환 여부는 사용자 결정 게이트(CONTEXT.md 명시).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (기존 `vitest.config.ts`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/__tests__/seed-region.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (미부여) regions 시딩 | 경남 22개 sgg_code가 regions 테이블에 존재, 형식(5자리) 유효 | integration | `npx vitest run src/__tests__/seed-region.test.ts` | ✅ 존재하나 **6개 하드코딩 검증이라 수정 필요** (Runtime State Inventory 참고) |
| (미부여) 하드코딩 필터 제거 | `ALLOWED_SGG_CODES` 등이 정적 배열이 아닌 함수 호출로 대체됨 | unit | 신규 테스트 필요 — `npx vitest run src/lib/data/*.test.ts` | ❌ Wave 0에서 신규 작성 필요 |
| (미부여) 백필 파이프라인 확장 | 신규 sgg_code로 `ingestMonth` 호출 시 정상 upsert | integration (기존 패턴 재사용) | `npx vitest run src/__tests__/molit-ingest.test.ts` | ✅ 존재 — 신규 sgg_code 케이스 추가 여부는 discretion |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/seed-region.test.ts` (regions 관련 태스크), 해당 데이터 레이어 파일의 유닛 테스트
- **Per wave merge:** `npm run test` (전체 Vitest 스위트) + `npm run lint` (tsc 포함)
- **Phase gate:** 전체 스위트 green + 실제 GitHub Actions workflow_dispatch 1회 성공 확인 (신규 지역 1곳 샘플)

### Wave 0 Gaps
- [ ] `src/__tests__/seed-region.test.ts` — `TARGET_SGG_CODES` 6개 하드코딩을 "경남 전체 22개" 또는 "6개 이상 존재"로 갱신 (기존 파일 수정, 신규 아님)
- [ ] 데이터 레이어 리팩터 대상 파일들(`invest.ts`, `gap-analysis.ts`, `rankings-page.ts`, `rankings.ts`)에 대한 "동적 조회 함수가 regions 테이블 결과를 올바르게 반환하는지" 검증하는 유닛 테스트 신규 작성 — 기존에 이 파일들에 대한 전용 테스트 존재 여부 미확인, plan 단계에서 확인 필요

*(nyquist_validation 기본 활성화 상태로 판단 — `.planning/config.json`의 `workflow.nyquist_validation: true` 확인됨)*

## Security Domain

> `security_enforcement` 설정이 config.json에 명시되지 않아 기본 활성화로 간주.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 이 phase는 인증 흐름 변경 없음 |
| V3 Session Management | no | 해당 없음 |
| V4 Access Control | yes | `regions` 테이블 RLS: 이미 public read 정책만 존재, write는 정책 없음(= service_role만 가능) — 신규 INSERT도 마이그레이션(service_role 권한)으로 수행되므로 기존 RLS 모델 그대로 안전 |
| V5 Input Validation | yes | `sgg_code` 파라미터가 백필 스크립트(`--sgg=` CLI 인자), API route(`offiSggCodes` 등)에 전달됨 — 기존 `regions.sgg_code CHECK (sgg_code ~ '^\d{5}$')` 제약이 형식 검증을 담당. `invest.ts`/`gap-analysis.ts`의 `ALLOWED_SGG_CODES.includes()` allowlist 패턴은 SQL 인젝션 방지 목적으로 이미 존재(Decisions Log 2026-05-28 "prevents injection via URL params") — 동적 조회로 바꿀 때도 이 방어선(파라미터를 regions 테이블 조회 결과와 대조)을 유지해야 함, 사용자 입력을 직접 쿼리에 꽂으면 안 됨 |
| V6 Cryptography | no | 해당 없음 |

### Known Threat Patterns for 이 phase의 스택 (Next.js + Supabase + 외부 API 어댑터)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL 쿼리 파라미터로 전달된 `sggCode`가 `regions` allowlist 없이 직접 `.eq('sgg_code', userInput)`에 사용됨 | Tampering | 기존 `ALLOWED_SGG_CODES.includes(filter.sggCode)` 검증 패턴을 동적 조회 버전에서도 유지 — regions 테이블에서 가져온 유효 코드 집합과 대조 후에만 쿼리에 사용 (Decisions Log 2026-05-28 패턴 계승) |
| GitHub Actions `workflow_dispatch`의 `sgg_codes` 입력값이 검증 없이 쉘 명령에 전달 | Tampering / Injection | 기존 워크플로가 `npx tsx scripts/backfill-realprice.ts --sgg=${{ inputs.sgg_codes }}`로 입력을 그대로 전달 — Actions는 신뢰된 관리자만 트리거 가능(repo write 권한 필요)하므로 낮은 리스크지만, 스크립트 내부의 `CHECK` 제약 및 API 실패 시 조용한 무시(빈 응답)로 사실상 안전 |

## Sources

### Primary (HIGH confidence)
- Supabase 공식 Pricing 페이지 (https://supabase.com/pricing) — Pro 플랜 $25/월, 8GB DB 포함, 초과 $0.125/GB, Egress 250GB 포함 초과 $0.09/GB [CITED: supabase.com/pricing]
- 코드베이스 직접 읽기: `supabase/migrations/20260430000010_regions.sql`, `scripts/backfill-realprice.ts`, `src/services/molit.ts`, `src/services/kapt.ts`, `src/lib/data/invest.ts`, `src/lib/data/gap-analysis.ts`, `src/lib/data/rankings-page.ts`, `src/lib/data/rankings.ts`, `src/app/api/cron/daily/route.ts`, `src/services/molit-presale.ts`, `supabase/migrations/20260616000004_school_ranking_rpc.sql`, `src/lib/data/seo-hierarchy.ts`, `src/app/actions/education.ts`, `.github/workflows/molit-backfill-once.yml`, `.github/workflows/molit-daily.yml`, `src/__tests__/seed-region.test.ts` [VERIFIED: 코드베이스]

### Secondary (MEDIUM confidence)
- 경남 16개 신규 시군구 법정동코드 — apt-info.github.io "아파트 실거래가 API에서 사용하는 법정동 코드 목록" + land.koreacharts.com (거제시=48310 URL로 교차 확인) [CITED: apt-info.github.io/프로그래밍/5/, land.koreacharts.com/land/list/48310.html] — code.go.kr 원본 표는 미확인, 백필 실행 전 단발 검증 권장 (Pitfall 4)

### Tertiary (LOW confidence)
- 없음

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 신규 라이브러리 없음, 기존 스택 재사용만 확인
- Architecture: HIGH — 코드베이스 직접 감사로 검증(regions 동적 조회, seo-hierarchy 일반화, school_ranking RPC 동작 확인)
- 법정동코드 목록: MEDIUM — 2개 독립 웹 소스 교차 검증했으나 정부 원본 표 미확인, 실행 전 검증 절차 권장
- 백필 소요 시간 추정: LOW — 신규 지역 실제 거래량 미지수, 방법론만 제시
- Pitfalls: HIGH — 코드 감사로 CONTEXT.md 목록 밖의 실제 리스크(rankings.ts, UI 라벨 맵 충돌) 발견

**Research date:** 2026-07-03
**Valid until:** 2026-08-02 (30일 — 법정동코드·Supabase 요금제는 안정적이나 프로젝트 코드 상태는 빠르게 변할 수 있어 표준 기간 적용)
