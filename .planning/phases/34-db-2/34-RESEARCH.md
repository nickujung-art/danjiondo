# Phase 34: 전국 DB 확장 2단계 — 부산광역시 지역 확장 기반 구축 - Research

**Researched:** 2026-07-08
**Domain:** 지역 마스터 데이터 확장(부산 16개 구·군) + Phase 33 파이프라인 재사용 + 네이버 매핑 크롤러 프로세스 안정성 + Supabase 용량 리스크
**Confidence:** MEDIUM (코드베이스 감사·법정동코드 목록은 HIGH~MEDIUM, self-hosted runner가 실제로 근본원인을 해결하는지는 LOW — 현장 검증 전까지는 가설)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**대상 범위**
- D-01: 2단계는 부산광역시만 우선 진행(16개 구·군, 인구 약 330만). 울산광역시는 부산 완료 후 별도 phase(35)로 진행 여부 결정
- D-02: 부산+울산 동시 진행 기각 — 리스크 진단 어려워짐

**Supabase 용량/Pro 플랜 결정**
- D-03: 착수 전 Pro 전환 안 함 — 33-08과 동일하게 "백필 후 실측 기반 결정" 반복
- D-04: 현재 DB 420MB(84%)로 여유 적음 — 부산 백필 진행 중 주기적 용량 체크 태스크 필수, 450MB 도달 시 즉시 경고 + VACUUM FULL 또는 Pro 전환 그 자리에서 결정. 500MB 초과 쓰기 실패 없이 진행이 목표

**네이버 매핑 크롤러**
- D-05: 부산용 BBOX 신규 튜닝 + 실제 매핑까지 이번 phase 범위 포함
- D-06: 로컬 프로세스 불안정 종료 문제 구조적 재조사(GitHub Actions self-hosted runner 검토 등). GitHub Actions 자체는 네이버 IP 차단 확인됨 — self-hosted runner가 이를 우회할 수 있는지가 핵심 조사 대상
- D-07: 근본 원인 재조사가 시간 내 미해결이어도 phase 진행 막지 않음 — 기존 restart-loop 폴백
- D-08: `--diagnose` 진단 기능을 부산 BBOX 확정 직후 1회 실행, 실제 매핑 실행 전 문제 규모 파악
- D-09: `NAVER_COOKIE` 유효성 확인 태스크를 매핑 작업 시작 전에 포함. 만료 시 사용자에게 재로그인 요청

**중복 Golden Record 행**
- D-10: 경남 기존 111쌍/303건 중복 좌표 문제는 이번 phase에서 병합하지 않음 — 별도 후속 phase로 defer
- D-11: 부산 KAPT Golden Record 시딩 단계에서 좌표+이름유사 중복 후보 탐지 로그(병합 없음) 추가

### Claude's Discretion
- 부산 16개 구·군 법정동코드(sgg_code) 조사 방법 — 33-CONTEXT 경남 조사 방법론 재사용 → 본 RESEARCH.md에서 목록 확정
- 하드코딩 지역 필터 재스윕 범위 — `scripts/`·`card-news/` 포함 전체 저장소 sweep 방법론 재사용
- 학군 랭킹/`seo-hierarchy.ts`의 부산 "구 있는 광역시" 패턴 대응 여부 — 본 RESEARCH.md에서 확인, 결과에 따라 범위 포함 여부는 회귀 테스트로 판단

### Deferred Ideas (OUT OF SCOPE)
- 울산광역시 확장 — 부산 완료 후 별도 phase(35)
- 전국 확장(3단계) — 별도 phase
- 경남 기존 111쌍/303건 중복 Golden Record 행 병합 — 위험한 FK 재연결 작업, 별도 후속 phase
- `naver-cafe.ts` 지역별 카페 소스 다중화 — 기존과 동일 defer
- 학군 랭킹/`seo-hierarchy.ts` 전국형 일반화 — 코드 변경 필요시 별도 범위로 분리
- 프론트엔드 UI 변경 — 재기획 회의 결과 대기 중
</user_constraints>

<phase_requirements>
## Phase Requirements

Requirement ID가 아직 부여되지 않았으므로(ROADMAP.md: "TBD, 계획 시 REGION-1x로 부여 예정"), Phase 33의 REGION-01~11 시퀀스를 이어 **REGION-12~21**을 제안한다. planner가 최종 확정할 것.

| 제안 ID | Description | Research Support |
|----|-------------|------------------|
| REGION-12 | `regions` 테이블에 부산 16개 구·군 시딩 + 법정동코드 단발 검증 | Standard Stack, Code Examples §부산 regions 시딩 스켈레톤 |
| REGION-13 | 하드코딩 지역 필터 전체 재스윕(신규 발생분 대응) — `scripts/admin/region-expansion` 포함 | Runtime State Inventory, Common Pitfalls §1 |
| REGION-14 | 부산 KAPT Golden Record(complexes) 시딩 + 좌표+이름유사 중복 후보 탐지 로그 | Code Examples §KAPT 시딩 시 중복 탐지 쿼리 |
| REGION-15 | 부산 좌표 지오코딩(카카오) + `complexes-map.ts` BBOX 검증/확장 | Common Pitfalls §2, Architecture Patterns |
| REGION-16 | 부산 국토부 실거래가 10년 다회 분할 백필 `[CHECKPOINT]` | Common Pitfalls §3, Specifics §데이터 규모 리스크 |
| REGION-17 | 부산 관리비(K-apt)/학군/POI enrichment 파이프라인 실행 | Common Pitfalls §4(PostGREST 1000행 캡) |
| REGION-18 | 학군 랭킹 RPC 부산 "구 있는 광역시" 패턴 회귀 테스트 | Architecture Patterns §Pattern 2·3 |
| REGION-19 | `NAVER_COOKIE` 프리플라이트 유효성 검증 태스크 | Code Examples §NAVER_COOKIE 검증 |
| REGION-20 | 네이버 매핑 크롤러 부산 BBOX 신규 튜닝 + `--diagnose` 1회 실행 | Architecture Patterns §네이버 매핑 흐름 |
| REGION-21 | 네이버 매핑 실제 실행(`--new-only`) + 로컬 프로세스 안정성 재조사(self-hosted runner PoC, 시간 내 미해결시 restart-loop 폴백) | Don't Hand-Roll, Common Pitfalls §5 |
| REGION-22 | Supabase DB 용량 실측(고빈도 체크포인트) + Pro 플랜 전환 여부 결정 `[CHECKPOINT]` | Specifics §데이터 규모 리스크 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **CRITICAL** 외부 API(국토부·카카오·학교알리미·K-apt·네이버) 호출은 `src/services/` 어댑터 전용. 부산 확장도 기존 어댑터(`molit.ts`, `kapt.ts`) 그대로 재사용 — 신규 어댑터 불필요 (단, 미분양은 예외 — 아래 Open Questions 참고).
- **CRITICAL** Supabase 쿼리는 서버 컴포넌트·API Route 전용.
- **CRITICAL** `complexes`가 Golden Record. 좌표+이름 복합 매칭 유지, 이름 단독 매칭 금지 — D-11의 중복 탐지 로직도 이 원칙(좌표+이름유사) 그대로 따른다.
- **CRITICAL** 거래 조회 `WHERE cancel_date IS NULL AND superseded_by IS NULL` 필수.
- 커밋 컨벤션: `feat(34-db-2):`/`refactor:`/`docs:`/`chore:`
- TDD 원칙 — Phase 33에서 확립된 회귀 테스트 패턴(`school-ranking-regional.test.ts`, `seed-region.test.ts`)을 그대로 확장.

## Summary

이 phase는 Phase 33에서 이미 범용화된 파이프라인(`regions` 테이블 동적 조회, `molit.ts`/`kapt.ts` 어댑터, `backfill-realprice.ts`, `map-naver-complexes-playwright.ts`)의 **설정값 확장**이다. 새 라이브러리 도입은 없다. 핵심 조사 결과 6가지를 정리한다.

**1) 부산 16개 구·군 법정동코드는 확정 가능하다** — apt-info.github.io 목록과 개별 코드 교차검색(해운대구=26350, 기장군=26710)으로 2개 독립 출처에서 검증했다. 코드는 Phase 33과 동일하게 26xxx 5자리 형식이며, code.go.kr 원본 표는 미확인이므로 백필 실행 전 단발 검증(Pitfall 4와 동일 절차)을 권장한다(MEDIUM confidence).

**2) `seo-hierarchy.ts`의 "구 있는 광역시" 라우팅은 코드 변경 없이 이미 부산에 대응한다** — `getSiPageData()`의 `hasGu = data.some(c => c.gu)` 판별은 `complexes.gu` 컬럼 값으로 동작하며, 이 컬럼은 지오코딩 스크립트(`enrich-apt-unmatched.ts` 등)가 `regions` 테이블의 `si`/`gu`를 그대로 복사해 채운다(문자열 매칭 아님) — 부산 16개 구를 `regions`에 시딩하면 자동으로 창원(구 있음)과 동일한 코드 경로를 탄다 [VERIFIED: 코드 직접 읽기]. **단, `school_ranking` SQL RPC는 다르다** — 이 함수의 `gu` 출력 컬럼은 `road_address LIKE '%창원시 OO구%'` 형태의 하드코딩 5-CASE 패턴으로만 채워지며, 부산 학교의 road_address는 이 패턴에 전혀 매칭되지 않으므로 부산 학군 랭킹은 항상 `gu=NULL`을 반환한다(에러는 없음, 김해시와 동일한 안전 폴백 경로를 타지만 부산은 실제로 구가 있는데도 구분이 안 보이는 손실이 발생) — 코드 수정은 CONTEXT.md D-11 범위 밖(전국형 일반화 defer)이므로, **회귀 테스트 추가만 권장**(REGION-18, 33의 `school-ranking-regional.test.ts` 패턴 재사용).

**3) GitHub Actions self-hosted runner는 두 문제를 동시에 해결할 이론적 근거가 있으나 검증되지 않았다** — self-hosted runner는 사용자의 실제 Windows PC에서 실행되므로 네이버의 데이터센터 IP 차단을 우회할 근거가 있다(로컬 실행과 동일한 네트워크 경로). 또한 GitHub Actions의 `Runner.Listener`/`Runner.Worker` 프로세스 트리는 Claude Code 세션과 완전히 독립적으로 OS에 등록되므로, "harness 레벨의 불투명한 백그라운드 작업 수명 제약"으로 추정되는 현재의 kill 문제와는 다른 프로세스 관리 체계를 탄다 — 원인이 실제로 harness 쪽이라면 회피될 개연성이 높다. 다만 이 프로젝트의 GitHub 저장소는 **public**이며, GitHub 공식 문서와 보안 커뮤니티는 "self-hosted runner를 public 저장소에 연결하지 말 것"을 강하게 권고한다(fork PR이 러너에서 임의 코드 실행 가능) — 완화책: (a) 러너를 오직 `workflow_dispatch`에서만 트리거되는 워크플로에만 라벨링, `pull_request`/`pull_request_target` 트리거 워크플로에는 이 러너 라벨을 절대 사용하지 않음, (b) Settings → Actions → Fork pull request workflows에서 외부 기여자 승인 요구 설정 확인, (c) `--ephemeral` 플래그로 매 잡 실행 후 자동 등록 해제(잡 1회 실행 후 서비스 재시작 필요 — 상시 서비스보다는 필요 시 수동 기동 방식 권장), (d) 솔로 개발자 저장소로 외부 협업자가 없다는 전제 하에서는 실질 위험이 낮으나 "0"은 아님. **PoC 태스크로 시간 제한을 두고 시도, 실패 시 D-07에 따라 restart-loop로 폴백**하는 것이 타당하다(LOW confidence — 실제로 kill 문제를 해결하는지는 미검증 가설).

**4) Supabase Pro 플랜 요금은 변동 없음** — $25/월, 8GB DB 포함, 초과 GB당 $0.125 (공식 pricing 페이지 재확인, HIGH confidence).

**5) 부산의 데이터 볼륨이 인구비 추정치를 상당히 초과할 가능성이 높다** — 외부 소스(아파트미 서비스)에 따르면 부산 전체 아파트 단지 수는 약 4,300개로 추정된다(LOW-MEDIUM confidence, 단일 비정부 출처) — Phase 33에서 경남 신규 16개 시군구가 추가한 complexes는 788개뿐이었다(대부분 농어촌 소규모 지역이었기 때문). 부산은 순수 도심 광역시로 세대당 거래 빈도도 높을 것으로 예상되어, "인구가 비슷하니 데이터량도 비슷할 것"이라는 가정은 위험하다 — 현재 여유 용량이 500MB 중 80MB(420MB 사용 중)뿐이므로, D-04의 주기적 체크는 **문서 명시 이상으로 훨씬 촘촘한 간격**(예: 각 백필 배치 완료마다, 하루 단위가 아니라)으로 수행할 것을 강하게 권고한다.

**6) 부산 KAPT 시딩 시 좌표+이름유사 중복 탐지는 GROUP BY보다 ST_DWithin + trigram similarity가 더 안전하다** — `seedComplex()`는 `kapt_code`로만 upsert하므로 동일 좌표의 이름 변형체가 별도 행으로 계속 쌓인다(경남 111쌍 중복의 원인과 동일 메커니즘). 정확한 float 일치(`GROUP BY lat, lng`)는 사후 배치 분석에는 적합하지만, KAPT 시딩 루프 안에서 매 건마다 실행하는 log-only 체크에는 이미 존재하는 PostGIS `location` geography 컬럼과 `pg_trgm` GIN 인덱스를 활용한 `ST_DWithin` + `similarity()` 조합이 좌표 미세 오차까지 포괄해 더 견고하다.

**추가 발견(범위 밖이지만 기록 필요):** `molit-unsold.ts`의 `기존` 미분양 어댑터는 경남 전용 API(`apis.data.go.kr/6480000/gyeongnamunsold`)이며, 부산은 **완전히 다른 서비스 ID**(`apis.data.go.kr/6260000/UnSellStusService`)를 쓴다. `regions`에 부산을 추가해도 `resolveSggCode()`는 안전하게 null을 반환할 뿐(크래시 없음, `item.signgunm`이 애초에 경남 API 응답에만 존재하므로) 부산 미분양 데이터는 자동으로 채워지지 않는다 — CONTEXT.md에 명시적 언급이 없으므로 Open Questions에서 defer 여부를 planner가 확정할 것을 권고한다.

**Primary recommendation:** Phase 33 Wave 구조(Wave 0 regions 시딩 → Wave 1 재스윕/좌표/enrichment 병렬 → Wave 2 백필 체크포인트 → Wave 3 네이버 매핑 → Wave 4 용량 결정 체크포인트)를 그대로 재사용하되, 용량 체크 빈도를 높이고, self-hosted runner 조사는 시간박스(time-boxed) PoC로 별도 분리해 phase 전체를 blocking하지 않게 한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 부산 지역 마스터 시딩(regions) | Database / Storage | — | Phase 33과 동일 패턴, 마이그레이션으로 관리 |
| 하드코딩 지역 필터 재스윕 | API / Backend (data layer) | — | 대부분 이미 동적화 완료, 신규 발생분만 확인 |
| KAPT Golden Record 시딩 + 중복 탐지 로그 | API / Backend (배치 스크립트) | Database | `scripts/seed-complexes.ts` → `src/lib/data/complex-matching.ts` → Supabase upsert |
| 좌표 지오코딩 + 지도 BBOX | API / Backend (배치) | Database (PostGIS) | `enrich-apt-unmatched.ts`/`geocode-complexes.ts` → `complexes.lat/lng` → `complexes-map.ts` 쿼리 필터 |
| 국토부 실거래가 백필 | API / Backend (배치) | Database | `backfill-realprice.ts` GitHub Actions workflow_dispatch |
| 네이버 매핑 크롤러(Playwright) | Browser 자동화(로컬 또는 self-hosted runner) | Database | `map-naver-complexes-playwright.ts` — 유일하게 이 phase에서 실행 환경 자체가 조사 대상 |
| Supabase 용량 모니터링 | Database / Storage | — | 코드 변경 없음, SQL 실측 + Dashboard |
| 학군 랭킹 gu 라벨(부산 미대응) | Database (RPC) | — | 확인만 하고 코드 변경은 범위 밖 — 회귀 테스트로 현재 동작 고정 |

## Standard Stack

### Core
새 라이브러리 도입 없음 — Phase 33과 동일 스택 재사용.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 기존 유지 | regions/complexes CRUD, 백필 upsert | 이미 프로젝트 표준 |
| `playwright` | 기존 유지 | 네이버 매핑 크롤러(로컬 또는 self-hosted runner에서 동일하게 동작) | 기존 검증된 anti-bot 우회 패턴 |
| `zod/v4` | 기존 유지 | 국토부/K-apt API 응답 파싱 | 기존 어댑터 그대로 재사용 |
| `tsx` | 기존 유지 | 백필/시딩 스크립트 실행 | 변경 불필요 |

### Supporting
해당 없음 — 순수 데이터/설정 확장 작업.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions self-hosted runner(Windows) | 로컬 restart-loop 계속 유지(D-07 폴백) | self-hosted runner는 IP 차단 우회 가능성이 있지만 public repo 보안 리스크 존재. restart-loop는 검증됐고 안전하지만 근본 원인 미해결 상태 지속 |
| `ST_DWithin` + `similarity()` 중복 탐지 | 기존처럼 `GROUP BY lat, lng HAVING count(*)>1` 정확 일치만 사용 | GROUP BY는 사후 배치 분석엔 충분하지만 시딩 루프 내 실시간 체크에는 좌표 미세 오차(예: 카카오 재지오코딩으로 소수점 마지막 자리 차이)를 놓칠 수 있음 |

**Installation:** 불필요 (신규 패키지 없음)

**Version verification:** 불필요 (기존 의존성 재사용)

## Architecture Patterns

### System Architecture Diagram

```
[regions 테이블: 부산 16개 구·군 INSERT (si='부산광역시', gu=구명, is_active=true)]
        │
        ├─────────────────────────────────────────────────────────┐
        ▼ (동적 조회, 이미 33에서 범용화 완료)                          ▼ (재스윕 대상)
┌────────────────────────────────┐                    ┌──────────────────────────────┐
│ 기존 파이프라인 (변경 불필요)        │                    │ 신규 발생 하드코딩 확인 대상       │
│ - invest.ts/gap-analysis.ts     │                    │ - admin/region-expansion/     │
│ - rankings.ts/rankings-page.ts  │                    │   page.tsx (임시 대시보드,      │
│ - cron/daily/route.ts           │                    │   Phase33 완료 후 삭제 예정)   │
│ - molit-presale.ts              │                    │ - Phase 33 종료 후 신규 커밋된   │
│ - seo-hierarchy.ts (hasGu)      │                    │   지역 배열 재검색 필요          │
└────────────────────────────────┘                    └──────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 순차 파이프라인 (Golden Record → 좌표 → 백필 → enrichment → 매핑)      │
│                                                                    │
│  1. seed-complexes.ts (KAPT) → complexes 시딩                        │
│     └─ [NEW] 좌표+이름유사 중복 후보 탐지 로그(D-11, log-only)          │
│  2. geocode-complexes.ts / enrich-apt-unmatched.ts → lat/lng 채움    │
│     └─ complexes-map.ts BBOX 확장 검증 필요(부산 동단 lng 129.3 근접)   │
│  3. backfill-realprice.ts → transactions 10년 백필 (다회 분할)         │
│     └─ [CHECKPOINT] DB 용량 고빈도 체크 (450MB 경고)                   │
│  4. collect-facility-edu.ts / kapt-facility-enrich → 학군·POI·관리비  │
│  5. map-naver-complexes-playwright.ts → naver_complex_no 매핑        │
│     ├─ [NEW] BBOX 튜닝 (좌표 완료 후 실측 min/max + padding)           │
│     ├─ --diagnose 1회 (D-08)                                        │
│     ├─ NAVER_COOKIE 프리플라이트 검증 (D-09)                          │
│     └─ 실행 환경: 로컬 restart-loop(검증됨) 또는 self-hosted runner PoC │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
   [CHECKPOINT] Supabase DB 용량 실측 + Pro 플랜 전환 결정 (D-03, D-04)
```

### Pattern 1: 부산 16개 구·군 regions 시딩 — Phase 33과 동일 패턴
**What:** `si='부산광역시'`, `gu=<구명>`으로 16행 INSERT. 창원(구 있음)과 동일 구조 — 김해(구 없음)와 다름.
**When to use:** Wave 0 최초 태스크.
**검증 근거:** `supabase/migrations/20260430000010_regions.sql` 스키마(`sgg_code`, `sgg_name`, `si`, `gu`, `is_active`) [VERIFIED: 코드베이스 직접 읽기]

### Pattern 2: `seo-hierarchy.ts`의 hasGu 판별 — 코드 변경 없이 부산 대응
**What:** `getSiPageData()`의 `const hasGu = data.some(c => c.gu)`가 `complexes.gu` 컬럼(실제 DB 값, 문자열 매칭 아님)을 기준으로 창원형(구 목록 집계)/김해형(동 목록 집계) 분기.
**When to use:** 부산은 16개 구 전부가 `gu` 값을 가지므로 자동으로 "창원형" 경로를 탄다 — 코드 수정 불필요.
**검증 근거:** `src/lib/data/seo-hierarchy.ts:58`, `scripts/enrich-apt-unmatched.ts:268-272`(`SGG_MAP[c.sgg_code]`로 si/gu를 regions에서 그대로 복사) [VERIFIED: 코드베이스 직접 읽기]

### Pattern 3: `school_ranking` RPC의 gu 라벨 — 부산은 항상 NULL (기능적 손실이지만 안전)
**What:** SQL 함수의 `gu` 출력 컬럼이 `road_address LIKE '%창원시 OO구%'` 5-CASE 하드코딩. 부산 학교의 `road_address`(`'부산광역시 해운대구 ...'`)는 이 패턴에 매칭되지 않아 `ELSE NULL`로 폴백.
**When to use:** 코드 수정은 범위 밖(전국형 일반화, CONTEXT.md deferred). `p_si='부산광역시'`로 호출 시 에러 없이 빈 gu 컬럼(전부 NULL)으로 순위 리스트는 정상 반환됨 — "구별 순위" 세부 기능만 부산에서 동작 안 함.
**검증 근거:** `supabase/migrations/20260616000004_school_ranking_rpc.sql:58-65`, 기존 회귀 테스트 `src/__tests__/school-ranking-regional.test.ts` [VERIFIED: 코드베이스 직접 읽기]
**권장:** 33의 `school-ranking-regional.test.ts` 패턴을 확장해 "p_si='부산광역시' 호출 시 에러 없음 + 모든 행 gu=null" 회귀 테스트 추가(REGION-18) — 코드 변경이 아니라 "현재 동작을 의도적으로 고정"하는 안전장치.

### 네이버 매핑 크롤러 BBOX 확정 절차 (부산 신규)
**What:** 기존 BBOXES 배열은 창원/김해는 수동 지도 확인, 경남 16개 신규 지역은 "이미 지오코딩된 complexes.lat/lng 실측 min/max + padding"으로 산출됐다(행정구역 전체 추측보다 스윕 효율 높음).
**부산 적용 순서:** (1) 부산 KAPT 시딩 + 좌표 지오코딩 완료 → (2) `SELECT gu, min(lat), max(lat), min(lng), max(lng) FROM complexes WHERE si='부산광역시' GROUP BY gu`로 구별 실측 범위 산출 → (3) 각 구(또는 인접 구 묶음)마다 padding을 더해 `BBOXES` 배열에 항목 추가 → (4) `--diagnose` 1회 실행(D-08)으로 매핑 전 문제 규모 파악.
**검증 근거:** `scripts/map-naver-complexes-playwright.ts:44-70` 주석("신규 16개 지역은 수동 지도 확인 대신 이미 지오코딩된 complexes.lat/lng의 실측 min/max에 여유(padding)를 더해 산출") [VERIFIED: 코드베이스 직접 읽기]

### Anti-Patterns to Avoid
- **인구비만으로 부산 데이터량 추정:** 부산은 순수 도심 광역시로 창원·김해 이상으로 밀도가 높다 — 경남 16개 군·시(대부분 농어촌)의 788개 complexes 대비 부산 단독 예상치(외부 추정 ~4,300개 단지, LOW confidence)가 훨씬 큼. 용량 체크 주기를 "다음 확장 전 1회"가 아니라 "백필 배치마다"로 촘촘히 잡을 것.
- **self-hosted runner를 `pull_request`/`pull_request_target` 트리거 워크플로와 같은 러너 라벨로 묶기:** public 저장소이므로 fork PR을 통한 임의 코드 실행 경로가 열림 — `workflow_dispatch` 전용 워크플로에만 self-hosted 라벨을 격리할 것.
- **KAPT 시딩 시 정확한 float 일치(`GROUP BY lat, lng`)만으로 중복 판정:** 좌표 소수점 미세 오차를 가진 근접 중복(같은 단지, 재지오코딩으로 살짝 다른 좌표)을 놓칠 수 있음 — `ST_DWithin` 반경 기반 체크 권장.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 부산 좌표+이름유사 중복 탐지 | 신규 배치 스크립트 + 커스텀 유사도 알고리즘 | 기존 PostGIS `location` geography 컬럼(`ST_DWithin`) + 기존 `pg_trgm` GIN 인덱스(`similarity()`) | 이미 스키마에 존재하는 인덱스 재사용, 신규 인프라 불필요 |
| 네이버 매핑 크롤러 재작성 | 신규 크롤링 스크립트 | `map-naver-complexes-playwright.ts`의 `BBOXES` 배열에 항목 추가만 | 구조 변경 불필요, D-05가 명시 |
| self-hosted runner 잡 수명 관리 | 커스텀 프로세스 감시 스크립트 | GitHub Actions 러너 앱의 `--ephemeral` 플래그(공식 지원) | 이미 GitHub이 제공하는 표준 메커니즘 |
| NAVER_COOKIE 유효성 검증 | 별도 로그인 자동화 스크립트 | 기존 `map-naver-complexes-playwright.ts`의 쿠키 주입 로직 재사용 + `--limit=1` 소규모 스모크런 | 이미 검증된 쿠키 주입 코드(304-312행)를 그대로 재사용 가능 |

**Key insight:** 이 phase도 Phase 33과 마찬가지로 신규 인프라가 아니라 "기존에 이미 지역코드 파라미터화되어 있는 파이프라인의 설정값 확장"이다. 유일하게 진짜 새로운 조사가 필요한 영역은 (a) 네이버 크롤러 실행 환경의 근본 원인 재조사와 (b) 부산의 실제 데이터 볼륨 규모다.

## Runtime State Inventory

> 이 phase는 하드코딩 배열 재스윕을 포함하므로 트리거 조건에 해당. Phase 33에서 이미 20건 이상 발견·수정된 상태이므로, 이번 재스윕의 초점은 "Phase 33 종료(2026-07-08) 이후 신규로 추가된 하드코딩"이다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (DB) | `regions` 테이블 현재 22행(경남 전체) — 부산 16개 미시딩. `data_sources`는 소스 단위(molit_trade 등)라 부산 추가 시 신규 행 불필요(Phase 33에서 이미 확인된 설계) | 코드 편집(마이그레이션 INSERT) — 데이터 마이그레이션 아님 |
| Live service config | `.github/workflows/molit-backfill-once.yml`, `map-naver-complexes-once.yml` — 둘 다 `workflow_dispatch`로 값은 실행 시점 입력, git 하드코딩 아님. 문제 없음 | 없음 |
| OS-registered state | **신규 발견**: self-hosted runner 도입 시 Windows 서비스(`runasservice`) 또는 수동 콘솔 프로세스로 러너가 로컬 OS에 등록됨 — 이는 이 phase에서 처음 생기는 신규 OS 레벨 등록 상태. 임시로만 사용(PoC)할지 상시 서비스로 남길지는 D-06/D-07 결정에 따름 | PoC 실패 시 러너 등록 해제(`config.cmd remove`) 필요 — 방치하면 불필요한 공격 표면 잔존 |
| Secrets/env vars | `NAVER_COOKIE`는 GitHub Secrets에 저장된 실제 사용자 세션 쿠키, 만료 가능성 있음(D-09) — 코드 변경 없음, 유효성 검증 태스크만 추가 | 없음(검증 절차만 추가) |
| Build artifacts / 테스트 | `src/__tests__/seed-region.test.ts`가 이미 `count >= 22`(정확히 아님)로 작성되어 있어 **부산 38행(22+16) 확장에도 깨지지 않음** — Phase 33에서 이미 이 방어적 설계를 해둔 것으로 확인 [VERIFIED: 33-00-SUMMARY.md] | 없음 — 다만 부산 전용 신규 회귀 테스트(REGION-18) 추가는 필요 |

**신규 발견된 부분 하드코딩 (Phase 33 종료 후 추가됨, 재스윕 확장 필요):**
- `src/app/admin/region-expansion/page.tsx` — `NEW_CODES`/`OLD_CODES` 배열에 경남 16개 sgg_code가 하드코딩되어 있다. 단, 파일 상단 주석에 "임시 운영 대시보드 — Phase 33 완료 후 삭제 예정"이라 명시되어 있어 **프로덕션 데이터 경로가 아니다** — 재스윕 grep(`ALLOWED_SGG_CODES` 등)에는 걸리지 않는 패턴(`NEW_CODES`/`OLD_CODES`라는 다른 변수명)이므로 grep 패턴에 이 변수명도 추가하거나, 이 파일 자체를 삭제(용도 소멸 확인 후) 처리할지 planner가 결정할 것. [VERIFIED: 코드 직접 읽기, `git show 61d8623`]

## Common Pitfalls

### Pitfall 1: 재스윕 grep 패턴이 변수명 변형을 놓칠 수 있음
**What goes wrong:** Phase 33에서 20+건을 찾은 grep 패턴(`ALLOWED_SGG_CODES|ACTIVE_SGG_CODES|TARGET_SGG|VALID_SGG_CODES|LAWD_CODES|offiSggCodes`)은 `NEW_CODES`/`OLD_CODES`(admin 대시보드) 같은 새로운 변수명은 잡지 못한다.
**Why it happens:** 각 개발자가 임시 코드를 작성할 때마다 새로운 변수명을 쓰기 때문에 grep 패턴이 계속 진화해야 한다.
**How to avoid:** 변수명 패턴뿐 아니라 리터럴 sgg_code 값(`'48121'`, `'48250'` 등 경남 6자리 코드, `'26xxx'` 패턴은 아직 코드베이스에 없으므로 이번엔 신규)으로도 재검색: `grep -rn "'481[0-9][0-9]'\|'482[0-9][0-9]'" src/ scripts/`. 부산 시딩 후에는 `'26[0-9]{3}'` 패턴도 함께 검색 대상에 추가.
**Warning signs:** 특정 어드민/디버그 페이지에서만 부산 지역이 목록에 없음.

### Pitfall 2: `complexes-map.ts`의 지도 BBOX가 부산 동쪽 끝을 미세하게 벗어날 수 있음
**What goes wrong:** 현재 bbox(`lat 34.7~35.8, lng 127.7~129.3`, commit b59bd01로 경남 전체 커버 확장됨)의 `lng` 상한 129.3은 부산 기장군·해운대구 동쪽 해안 지역(대략 lng 129.29~129.32)과 거의 맞닿아 있어, 좌표 지오코딩 오차나 해안 인접 단지에 따라 일부가 걸러질 위험이 있다.
**Why it happens:** 이 bbox는 "창원·김해 유효 좌표 범위, 잘못된 지오코딩 결과 제외"용 안전장치로 설계되어 경남 범위에 맞춰 확장된 것이지, 부산을 고려해 산출된 값이 아니다.
**How to avoid:** 부산 좌표 지오코딩 완료 후 실측 `SELECT min(lng), max(lng) FROM complexes WHERE si='부산광역시'`로 확인하고, 129.3을 초과하면 상한을 129.4 정도로 여유있게 확장. (33-CONTEXT의 "이 bbox 수정은 좌표가 실제로 채워지기 전까지는 효과가 없다"는 교훈도 동일하게 적용됨 — 좌표 지오코딩이 선행되어야 함.)
**Warning signs:** 부산 지도 페이지에서 기장군·해운대 동쪽 끝 단지가 지도에 표시되지 않음.

### Pitfall 3: 국토부 API 일일 호출 한도는 계정 공유 자원 (Phase 33과 동일)
**What goes wrong:** 백필 workflow_dispatch가 일배치 cron(04:00 KST)과 같은 날 겹치면 두 파이프라인이 10,000회/일 한도를 경합.
**How to avoid:** Phase 33과 동일 — 백필은 일배치 전후 시간대를 피하거나 실패 리스크를 명시적으로 감수.

### Pitfall 4: PostgREST 1,000행 기본 캡이 enrichment 스크립트에서 재발할 가능성
**What goes wrong:** Phase 33에서 이미 3건(`fetch-sports-facilities.ts`, `kapt-code-lookup.ts`, `import-management-cost.ts`) 발견된 별도 버그 클래스 — "regions 동적 조회"가 되어 있어도 단지 조회 쿼리 자체에 `.range()` 페이지네이션이 없으면 1,000행 초과 시 나머지가 조용히 누락된다. 부산은 도심 밀집지라 전체 complexes 수가 1,000행을 넘는 시점에서 이 문제가 다시 발생할 여지가 크다(이미 22개 지역 시점에 발생했으므로 부산 추가 후엔 더 확실).
**How to avoid:** enrichment 스크립트(`collect-facility-edu.ts`, `kapt-facility-enrich`, 학교 관련 스크립트 등) 실행 전 각각의 단지 조회 쿼리에 `.range()`/페이지네이션이 있는지 재확인. 처리 건수 로그를 항상 `SELECT count(*) FROM complexes WHERE ...`의 예상치와 대조.
**Warning signs:** 처리 완료 로그의 건수가 실제 대상 단지 수보다 눈에 띄게 적음(특히 1,000의 배수 근처에서 끊김).

### Pitfall 5: self-hosted runner PoC가 "해결됨"으로 성급히 판단될 위험
**What goes wrong:** self-hosted runner로 1~2회 성공적으로 실행되었다고 해서 근본 원인이 해결됐다고 단정하면 안 된다 — 현재 로컬 프로세스가 죽는 원인 자체가 불투명(harness 추정, OS/백신 개입 흔적 없음)하므로, self-hosted runner에서도 동일하거나 다른 이유로 장시간 실행 후 실패할 가능성이 남아있다.
**Why it happens:** 근본 원인이 확정되지 않은 상태에서의 우회 시도이므로, "다른 환경에서 몇 번 성공"이 "문제 해결"과 동치가 아니다.
**How to avoid:** PoC 태스크에 명확한 성공 기준(예: 실제 매핑 대상 규모에 준하는 장시간 실행 1회를 처음부터 끝까지 중단 없이 완료)을 정하고, 실패 시 즉시 D-07 restart-loop 폴백으로 전환 — 시간을 무한정 투입하지 않는다.

## Code Examples

### 부산 16개 구·군 regions 시딩 마이그레이션 스켈레톤
```sql
-- Source: 기존 supabase/migrations/20260430000010_regions.sql 스키마 재사용, INSERT만 추가
-- 코드는 apt-info.github.io + 개별 교차검증(해운대구=26350, 기장군=26710)으로 확인 (MEDIUM confidence)
-- ⚠ 백필 실행 전 각 코드 단발 검증 필수 (Pitfall 4, 33-RESEARCH.md와 동일 절차)
insert into public.regions (sgg_code, sgg_name, si, gu, is_active) values
  ('26110', '중구',     '부산광역시', '중구',     true),
  ('26140', '서구',     '부산광역시', '서구',     true),
  ('26170', '동구',     '부산광역시', '동구',     true),
  ('26200', '영도구',   '부산광역시', '영도구',   true),
  ('26230', '부산진구', '부산광역시', '부산진구', true),
  ('26260', '동래구',   '부산광역시', '동래구',   true),
  ('26290', '남구',     '부산광역시', '남구',     true),
  ('26320', '북구',     '부산광역시', '북구',     true),
  ('26350', '해운대구', '부산광역시', '해운대구', true),
  ('26380', '사하구',   '부산광역시', '사하구',   true),
  ('26410', '금정구',   '부산광역시', '금정구',   true),
  ('26440', '강서구',   '부산광역시', '강서구',   true),
  ('26470', '연제구',   '부산광역시', '연제구',   true),
  ('26500', '수영구',   '부산광역시', '수영구',   true),
  ('26530', '사상구',   '부산광역시', '사상구',   true),
  ('26710', '기장군',   '부산광역시', '기장군',   true)
on conflict (sgg_code) do nothing;
```

### 부산 KAPT 시딩 시 좌표+이름유사 중복 후보 탐지 (log-only, D-11)
```typescript
// scripts/seed-complexes.ts의 runWithApi() 루프 내 seedComplex() 호출 전후에 삽입
// 기존 PostGIS location(geography) 컬럼 + pg_trgm GIN 인덱스(name_normalized) 재사용
// Source: complexes 스키마(location geography, name_normalized + gin_trgm_ops) — 33-RESEARCH.md Pitfall 5 참고
async function detectPotentialDuplicate(
  supabase: SupabaseClient,
  candidate: { lat: number; lng: number; nameNormalized: string; kaptCode: string; sggCode: string },
): Promise<Array<{ id: string; canonical_name: string; kapt_code: string; dist_m: number }>> {
  if (candidate.lat == null || candidate.lng == null) return []
  const { data, error } = await supabase.rpc('find_nearby_similar_complexes', {
    p_lat: candidate.lat,
    p_lng: candidate.lng,
    p_name_normalized: candidate.nameNormalized,
    p_exclude_kapt_code: candidate.kaptCode,
    p_radius_m: 30,          // 좌표 미세 오차 허용 반경
    p_similarity_threshold: 0.4,
  })
  if (error) { console.warn(`[dup-check] RPC 실패: ${error.message}`); return [] }
  return data ?? []
}

// 신규 RPC (마이그레이션 필요) — log-only, 병합 없음
// create or replace function find_nearby_similar_complexes(
//   p_lat double precision, p_lng double precision, p_name_normalized text,
//   p_exclude_kapt_code text, p_radius_m double precision, p_similarity_threshold real
// ) returns table(id uuid, canonical_name text, kapt_code text, dist_m double precision)
// language sql stable as $$
//   select c.id, c.canonical_name, c.kapt_code,
//          ST_Distance(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as dist_m
--   from complexes c
--   where c.kapt_code != p_exclude_kapt_code
--     and c.location is not null
--     and ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
--     and similarity(c.name_normalized, p_name_normalized) > p_similarity_threshold
--   order by dist_m;
// $$;

// 시딩 루프에서: 결과가 있으면 콘솔 로그 + scripts/busan-dup-candidates.csv에 append (DB 변경 없음)
```

### NAVER_COOKIE 프리플라이트 검증 (D-09) — 기존 스크립트 재사용
```typescript
// map-naver-complexes-playwright.ts에 --check-cookie 플래그 추가 (또는 별도 scripts/check-naver-cookie.ts)
// 이미 검증된 쿠키 주입 로직(304-312행)을 재사용, 알려진 창원북부 존(밀도 높음, 항상 마커 다수 존재)에서
// 소규모 스모크런(--limit=1, 단일 center)을 수행해 마커 개수로 실질 유효성 판단
// (순수 로그인 상태 체크보다 "실제로 매핑이 되는가"를 직접 검증하는 것이 더 신뢰도 높음)
const SMOKE_TEST_BBOX = { name: '창원북부', lat: 35.26, lng: 128.66 }  // 기존 BBOXES[0] 중심점 재사용

async function checkCookieValidity(page: Page): Promise<boolean> {
  const url = `https://new.land.naver.com/complexes?ms=${SMOKE_TEST_BBOX.lat},${SMOKE_TEST_BBOX.lng},14&a=APT&b=A1`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null)
  await page.waitForTimeout(3000)
  // 로그인 페이지로 리다이렉트됐는지 URL로 1차 확인
  if (page.url().includes('nid.naver.com')) return false
  // 마커 존재 여부로 2차 확인 (anti-bot 차단 시 마커가 아예 안 뜨는 현상과 동일한 시그널)
  const markerCount = await page.locator('[class*="marker"], [class*="Marker"]').count().catch(() => 0)
  return markerCount > 0
}
// 실패 시: "NAVER_COOKIE 만료 추정 — 재로그인 후 GitHub Secret 갱신 필요" 메시지로 사용자에게 중단 알림
```

## State of the Art

해당 없음 — Phase 33과 동일하게 기존 패턴 확장 작업. 프레임워크/라이브러리 트렌드 변화 없음.

**참고 (Phase 33에서 이미 기록됨, 재확인 불필요):** 국토부 아파트 매매 실거래가 API는 `RTMSDataSvcAptTradeDev` 엔드포인트 사용 중 — 3단계(전국 확장) 시점에 최신 엔드포인트 유효성 재확인 권장(이번 phase 범위 아님).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 부산 16개 구·군의 5자리 법정동코드(26110, 26140, 26170, 26200, 26230, 26260, 26290, 26320, 26350, 26380, 26410, 26440, 26470, 26500, 26530, 26710) | Code Examples §regions 시딩 | 코드가 틀리면 마이그레이션 INSERT는 성공(형식 검증만)하지만 백필 시 빈 데이터만 쌓임 — Phase 33과 동일한 단발 검증 절차로 완화 가능 |
| A2 | 부산 전체 아파트 단지 수가 약 4,300개(외부 비정부 소스, 아파트미) | Summary §5, Common Pitfalls §5MB 관련 | 실제 KAPT 등록 단지 수는 이보다 적거나(도로/재개발 등으로 통합) 많을 수 있음 — 정확한 값은 실제 `fetchComplexList()` API 호출로만 확인 가능, 용량 리스크의 방향성(경남 대비 훨씬 큼)은 유지될 가능성 높음 |
| A3 | GitHub Actions self-hosted runner가 harness의 백그라운드 작업 킬 문제를 회피할 것이라는 아키텍처적 추론 | Summary §3 | 근본 원인이 확정되지 않았으므로 실제로는 회피되지 않을 수 있음 — PoC로 시간박스 검증 필요, 실패 시 D-07 폴백 |
| A4 | `regions.gu` 값이 부산 16개 구 전부에 대해 정확한 한글 구명으로 채워질 것(Code Examples 스켈레톤 그대로 사용 시) | Code Examples | 오탈자나 특수문자 이슈 시 `road_address LIKE` 매칭이나 UI 라벨에 영향 — plan 단계에서 시딩 직후 `select * from regions where si='부산광역시'` 확인 권장 |
| A5 | Busan 미분양(regional_unsold) 데이터는 이번 phase 범위에 포함되지 않는다(CONTEXT.md에 명시적 언급 없음) | Summary §추가 발견, Open Questions | 만약 사용자가 미분양도 포함하길 원한다면 신규 어댑터(`apis.data.go.kr/6260000/UnSellStusService`) 개발이 별도로 필요 — 이번 phase 범위·기간 추정에 영향 |

**A1, A2는 2개 이상의 독립 웹 소스 교차검증을 거쳤으나 정부 원본 표(code.go.kr) 미확인 상태로 MEDIUM(A1)/LOW-MEDIUM(A2) confidence 유지. A3은 코드 상 이해에 기반한 아키텍처 추론이며 실측 검증 전까지 LOW confidence.**

## Open Questions

1. **Busan 미분양(regional_unsold) 데이터 파이프라인을 이번 phase 범위에 포함할 것인가?**
   - What we know: 기존 `molit-unsold.ts`는 경남 전용 API(`6480000/gyeongnamunsold`)를 쓰며, 부산은 별도 서비스(`6260000/UnSellStusService`)가 존재함(WebSearch로 확인, MEDIUM confidence).
   - What's unclear: CONTEXT.md 어디에도 미분양이 부산 phase의 명시적 deliverable로 언급되지 않았다 — 사용자가 의도적으로 제외했는지, 아니면 놓친 것인지 불명확.
   - Recommendation: `reb.ts`(R-ONE 가격지수)를 처리한 것과 동일한 패턴으로 명시적으로 defer 처리하고 RESEARCH.md에 기록만 남기는 것을 권장(이번 phase는 이미 범위가 크다) — 사용자 확인 후 planner가 최종 결정.

2. **school_ranking RPC의 "부산 구별 순위" 미지원을 이번 phase에서 코드로 고칠 것인가, 회귀 테스트로만 고정할 것인가?**
   - What we know: CONTEXT.md는 "전국형 일반화는 범위 밖"이라 명시했고, 프로젝트 메모리(`project_school_ranking_next.md`)에도 "구별 순위 + 시 전체 순위 동시 표시"가 이미 별도 미해결 과제로 기록돼 있어 창원조차 완성되지 않은 기능이다.
   - What's unclear: 부산은 16개 구 전부가 구 있는 지역이라 이 제약이 창원보다 훨씬 크게 체감될 수 있음(부산 전체 학군 랭킹에서 지역 구분이 전혀 안 보임).
   - Recommendation: 이번 phase는 회귀 테스트 추가(REGION-18)로 "현재 동작이 안전하게 유지됨"만 확정하고, 실제 구별 라벨 지원은 기존 미해결 과제(`project_school_ranking_next.md`)와 통합해 별도 phase로 처리 권장.

3. **`src/app/admin/region-expansion/page.tsx`(임시 대시보드)를 삭제할 것인가, 부산 대응까지 확장할 것인가?**
   - What we know: 파일 자체 주석이 "Phase 33 완료 후 삭제 예정"이라 명시함. 아직 삭제되지 않았고, 최근 커�밋(61d8623)에서 오히려 기능이 추가됨(데이터 완성도 섹션).
   - What's unclear: 사용자가 이 대시보드를 부산 확장 진행 상황 추적용으로 계속 쓰고 싶어할 수도 있음(현재도 진행 상황 참고용으로 유용해 보임).
   - Recommendation: planner가 사용자에게 "삭제 vs 부산 지원 확장" 중 선택하도록 짧게 확인 — 만약 유지한다면 재스윕 grep 패턴에 `NEW_CODES`/`OLD_CODES` 변수명도 추가해야 함(Pitfall 1).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `MOLIT_API_KEY` (data.go.kr) | 국토부 실거래가 백필 | ✓ (기존 GitHub Secrets, Phase 05/33에서 검증됨) | — | 없음(필수) |
| `KAPT_API_KEY` (data.go.kr) | K-apt 단지 목록/기본정보 백필 | ✓ (기존 크론에서 사용 중) | — | 없음(필수) |
| `KAKAO_REST_API_KEY` | 좌표 지오코딩 | ✓ (기존 크론/스크립트에서 사용 중) | — | 없음(필수) |
| `SUPABASE_SERVICE_ROLE_KEY` | 백필/시딩 스크립트 DB 쓰기 | ✓ (기존 환경변수) | — | 없음(필수) |
| `NAVER_COOKIE` (GitHub Secret) | 네이버 매핑 크롤러 | ⚠ (존재하나 유효성 미확인 — D-09 프리플라이트 검증 대상) | — | 만료 시 사용자 재로그인 요청(D-09) |
| GitHub Actions `workflow_dispatch` | 백필/매핑 실행 트리거 | ✓ (기존 워크플로 재사용) | timeout-minutes: 300(백필)/120(매핑) | 없음 |
| GitHub Actions self-hosted runner(Windows, 신규) | 로컬 프로세스 안정성 우회 PoC(D-06) | ✗ (미구성 — 이번 phase에서 신규 설치·등록 필요) | — | 실패 시 기존 restart-loop로 완전 대체 가능(D-07) |
| Supabase Pro 플랜 | 500MB 초과 시 필요 | ✗ (현재 Free tier, 420MB/500MB) | — | 백필 진행 중 실측 후 전환 결정(D-03/D-04 체크포인트) |

**Missing dependencies with no fallback:** 없음 — 모든 필수 자격증명은 Phase 05/33에서 이미 검증됨.

**Missing dependencies with fallback:** self-hosted runner(PoC 실패 시 restart-loop 폴백), Supabase Pro 플랜(실측 기반 결정), NAVER_COOKIE(만료 시 재로그인).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (기존 `vitest.config.ts`, 변경 없음) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/__tests__/seed-region.test.ts src/__tests__/school-ranking-regional.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REGION-12 | 부산 16개 sgg_code가 regions에 존재(is_active=true, gu 값 있음) | integration | `npx vitest run src/__tests__/seed-region.test.ts` | ✅ 이미 `count >= 22` 방어적 검증이라 확장에도 안 깨짐 — 부산 전용 assertion(38개, gu not null 16건) 추가만 필요 |
| REGION-14 | KAPT 시딩 시 중복 탐지 로그(log-only)가 병합 없이 기록됨 | unit | 신규 테스트 필요 — `npx vitest run src/lib/data/complex-matching.test.ts`(신규 함수 대상 케이스 추가) | ❌ Wave 0/1에서 신규 작성 필요 |
| REGION-18 | `school_ranking` RPC가 `p_si='부산광역시'`에 에러 없이 응답, 모든 행 `gu=null` | integration | `npx vitest run src/__tests__/school-ranking-regional.test.ts`(부산 케이스 추가) | ✅ 파일 존재, 부산 케이스만 추가 |
| REGION-16 | 신규 sgg_code로 백필 시 `ingest_runs.status='success'` + `rowsUpserted>0` | integration (기존 패턴 재사용) | GitHub Actions workflow_dispatch 실행 + SQL 확인 | ✅ 기존 워크플로 재사용, 코드 테스트 불필요(운영 검증) |

### Sampling Rate
- **Per task commit:** 해당 태스크의 유닛/통합 테스트 (예: regions 관련 → `seed-region.test.ts`)
- **Per wave merge:** `npm run test`(전체 Vitest) + `npm run lint`(tsc 포함)
- **Phase gate:** 전체 스위트 green + 부산 1개 구 샘플 백필 성공 확인 + DB 용량 체크포인트 통과

### Wave 0 Gaps
- [ ] `src/__tests__/seed-region.test.ts` — 부산 16개 구 전용 assertion 추가(기존 `count >= 22` 로직은 유지, 부산 케이스만 보강)
- [ ] `src/__tests__/school-ranking-regional.test.ts` — `p_si='부산광역시'` 케이스 추가(REGION-18)
- [ ] KAPT 시딩 중복 탐지 신규 RPC(`find_nearby_similar_complexes`) + 대응 유닛 테스트 — 마이그레이션 + 테스트 둘 다 신규

*(nyquist_validation 기본 활성화 — `.planning/config.json`의 `workflow.nyquist_validation: true` 확인됨)*

## Security Domain

> `security_enforcement` 설정이 config.json에 명시되지 않아 기본 활성화로 간주.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 인증 흐름 변경 없음 |
| V3 Session Management | no | 해당 없음(단, `NAVER_COOKIE`는 애플리케이션 세션이 아니라 외부 서비스 접근용 자격증명 — GitHub Secrets로 이미 안전하게 보관) |
| V4 Access Control | yes | `regions` 테이블 RLS(public read, write는 service_role만) 기존 모델 그대로 유지. **신규**: self-hosted runner 도입 시 GitHub Actions의 러너 등록 권한(repo owner/admin) 및 "Fork pull request workflows" 승인 설정이 실질적 접근 통제 경계가 됨 |
| V5 Input Validation | yes | `sgg_code` 형식은 `regions.sgg_code CHECK (sgg_code ~ '^\d{5}$')`로 이미 검증됨. 부산 26xxx 코드도 동일 제약 통과 |
| V6 Cryptography | no | 해당 없음 |

### Known Threat Patterns for 이 phase의 스택

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Public 저장소에 등록된 self-hosted runner를 fork PR로 침해 | Tampering / Elevation of Privilege | self-hosted 러너 라벨을 `workflow_dispatch` 전용 워크플로에만 사용, `pull_request`/`pull_request_target` 트리거 워크플로에는 절대 이 라벨 미사용. `--ephemeral`로 잡 실행 후 자동 등록 해제. Settings → Actions → Fork pull request workflows에서 외부 기여자 승인 요구 확인(공식 GitHub 권고, 이번 세션 WebSearch로 확인) |
| `NAVER_COOKIE`가 실제 사용자 로그인 세션이므로 유출 시 계정 탈취 위험 | Information Disclosure | 기존과 동일하게 GitHub Secrets에만 저장, 워크플로 로그에 노출 금지(`console.log`에 쿠키 값 출력 금지 — 기존 코드는 쿠키 이름만 로그, 값은 로그 안 함 — 302행 확인됨) |
| KAPT 시딩 중복 탐지 RPC가 사용자 입력이 아닌 API 응답 좌표만 사용 | (해당 없음) | 신규 RPC 파라미터(`p_lat`, `p_lng`, `p_name_normalized`)는 모두 서버 사이드에서 KAPT API 응답으로 산출된 값이며 사용자 직접 입력 경로 없음 — 인젝션 리스크 낮음 |

## Sources

### Primary (HIGH confidence)
- Supabase 공식 Pricing 페이지(https://supabase.com/pricing) — Pro $25/월, 8GB 포함, 초과 GB당 $0.125 [CITED: supabase.com/pricing, 2026-07-08 재확인]
- 코드베이스 직접 읽기: `supabase/migrations/20260430000010_regions.sql`, `supabase/migrations/20260616000004_school_ranking_rpc.sql`, `src/lib/data/seo-hierarchy.ts`, `src/app/actions/education.ts`, `src/__tests__/school-ranking-regional.test.ts`, `scripts/enrich-apt-unmatched.ts`, `scripts/seed-complexes.ts`, `src/lib/data/complex-matching.ts`, `scripts/map-naver-complexes-playwright.ts`, `.github/workflows/map-naver-complexes-once.yml`, `src/services/molit-unsold.ts`, `src/app/admin/region-expansion/page.tsx`, `src/lib/data/complexes-map.ts` [VERIFIED: 코드베이스]
- GitHub 공식 문서(docs.github.com/en/actions) — self-hosted runner 보안 권고, fork PR 승인 정책, `--ephemeral` 플래그 [CITED: docs.github.com]

### Secondary (MEDIUM confidence)
- 부산광역시 16개 구·군 법정동코드 — apt-info.github.io(프로그래밍/5) 목록 + 개별 코드 2건(해운대구=26350, 기장군=26710) WebSearch 교차검증 [CITED: apt-info.github.io, land.koreacharts.com 참조 언급] — code.go.kr 원본 표 미확인, 백필 전 단발 검증 권장
- 부산 미분양 API 서비스 ID(`6260000/UnSellStusService`) 존재 확인 [CITED: data.go.kr 검색 결과]
- Sysdig/Wiz/GitHub Community Discussion — self-hosted runner를 public repo에 연결하는 것의 위험성 일반론 [CITED: sysdig.com, wiz.io, github.com/orgs/community/discussions/26722]

### Tertiary (LOW confidence)
- 부산 전체 아파트 단지 수 ~4,300개 — 아파트미(apt2.me) 단일 비정부 출처, 정의 기준(KAPT 등록 vs 실거래 발생 단지 등) 불명확 [단일 출처, 정부 데이터 아님]
- self-hosted runner가 harness의 백그라운드 작업 킬 문제를 실제로 회피할 것이라는 주장 — 근본 원인이 확정되지 않은 상태에서의 아키텍처적 추론, 실제 검증 없음

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 신규 라이브러리 없음, Phase 33 스택 그대로 재사용 확인
- Architecture(regions/seo-hierarchy 자동 대응): HIGH — 코드베이스 직접 감사로 검증
- Architecture(school_ranking RPC gu 라벨 미대응): HIGH — 코드 직접 읽기 + 기존 회귀 테스트로 확인된 사실
- 법정동코드 목록: MEDIUM — 2개 독립 웹 소스 교차검증, 정부 원본 표 미확인
- self-hosted runner가 실제 문제를 해결하는지: LOW — 근본 원인 자체가 불확정 상태의 아키텍처적 추론
- 부산 데이터 볼륨 리스크: MEDIUM(방향성) / LOW(정확한 수치) — 단일 비정부 출처지만 "경남 농어촌 대비 훨씬 크다"는 방향성 자체는 상식적으로 매우 신뢰도 높음
- Pitfalls: HIGH — 코드 감사 기반 실제 리스크 다수 발견(BBOX 경계, admin 대시보드 신규 하드코딩)

**Research date:** 2026-07-08
**Valid until:** 2026-07-22 (14일 — Supabase 요금제·법정동코드는 안정적이나, self-hosted runner PoC 결과와 부산 실측 데이터량은 실행 즉시 갱신될 정보이므로 표준 30일보다 짧게 설정)
