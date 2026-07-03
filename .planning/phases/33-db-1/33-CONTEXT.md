# Phase 33: 전국 DB 확장 1단계 — 경남 전체 지역 확장 기반 구축 - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning
**Source:** 메인 세션 대화 (사용자 결정 + 사전 조사 에이전트 결과)

<domain>
## Phase Boundary

사이트 전면 재기획 회의가 진행 중이라 프론트엔드 코딩이 보류된 상태. 그 동안 백엔드/데이터 파이프라인 작업으로 전국 확장을 준비한다. 이 phase(1단계)는 **경남 전체**로 확장 범위를 넓히는 데 집중한다. 인접 광역시·전국 확장은 후속 phase(33b, 34...)로 분리한다.

이 phase가 하는 일:
1. `regions` 테이블에 경남 전체 시군구(현재 창원 5개 구 + 김해시 6행만 있음) 코드를 시딩
2. 하드코딩된 지역 필터 9곳을 `regions` 테이블 기반 동적 조회로 리팩터링
3. 경남 나머지 시군구에 대한 국토부 실거래가 + K-apt 백필 실행
4. Supabase DB 용량/비용 리스크 검토 및 플랜 전환 여부 결정

이 phase가 하지 않는 일: 인접 광역시(부산·울산 등) 확장, 전국 확장, 프론트엔드 UI 변경(재기획 회의 결과 대기 중이므로 UI는 건드리지 않음), naver-cafe.ts 등 지역 종속적 카페 크롤러 재설계(경남 확장 단계에서는 불필요 — 별도 phase).

</domain>

<decisions>
## Implementation Decisions

### 확장 범위 및 순서
- 1단계: 경남 전체 시군구 (이번 phase)
- 2단계: 인접 광역시 (부산·울산 등) — 후속 phase
- 3단계: 전국 — 후속 phase
- 각 단계마다 리스크(비용·매칭 품질)를 검증한 뒤 다음 단계로 진행

### 진행 방식
- GSD Phase로 정식 기획 (가벼운 ad-hoc 방식 아님) — PRD·리스크·태스크 분해를 문서화 후 실행
- 이번 대화에서 이미 아키텍처 조사가 완료됨 (아래 canonical_refs 참고)

### 하드코딩 지역 필터 제거 원칙
- `regions` 테이블(`sgg_code` PK, `is_active` 플래그)을 유일한 지역 마스터로 삼는다
- `ALLOWED_SGG_CODES`(invest.ts, gap-analysis.ts), `ACTIVE_SGG_CODES`(rankings-page.ts), `offiSggCodes`(api/cron/daily/route.ts), `LAWD_CODES`(molit-presale.ts) 등 인라인 배열 상수는 전부 `regions` 테이블에서 `is_active=true` 코드를 동적으로 조회하는 방식으로 교체
- 청약홈(cheongyak) 수집은 이미 전국 API 응답을 받으므로, 필터링 조건만 `regions.is_active` 기반으로 변경 (API 호출 자체는 변경 없음)
- 학군 랭킹 RPC / `seo-hierarchy.ts`의 `road_address LIKE '%구%'` 식 지역명 문자열 매칭은 이번 phase 범위에서는 **경남 시군구까지만 일반화** (전국 대응은 후속 phase). 김해시처럼 구(區)가 없는 시군구는 3단계 특수 케이스로 이미 분기되어 있으므로 그 패턴을 따른다
- `KakaoMap.tsx`의 `DEFAULT_CENTER`는 이번 phase에서 변경하지 않는다 (UI 변경은 재기획 대기 중이므로 보류) — 단, 향후 다지역 대응이 필요하다는 점만 RESEARCH.md에 기록

### 비용/리스크 결정 게이트
- Supabase 무료 티어(500MB) 초과가 확실시되는 시점(경남 전체 백필 완료 후 실측 용량)에 반드시 사용자에게 Pro 플랜 전환 여부를 확인 — 이 phase의 plan에 "실측 후 확인" 체크포인트를 포함할 것
- 국토부 API 일 10,000회 한도로 인해 경남 전체 10년 백필은 여러 날에 걸쳐 분할 실행 (기존 05-00 phase에서 "창원+김해 전체 3일 분할, timeout 300분" 선례 있음 — 이 패턴을 확장 규모에 맞게 재사용)

### 매칭 품질
- 신규 지역 실거래가 수집 시 `complex_match_queue`에 쌓이는 미매칭 건은 자동 승인하지 않는다 — 기존 창원·김해와 동일하게 검수 큐 방식 유지
- 창원·김해 전용 수동 별칭(`20260518000002_manual_aliases.sql`)과 같은 지역 특화 보정 작업은 이번 phase 범위 밖 (신규 지역은 자연 매칭률로 우선 진행, 필요 시 후속 보정)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 아키텍처 / 규칙
- `CLAUDE.md` — 프로젝트 아키텍처 규칙 (외부 API 어댑터 전용 경로, RLS, Golden Record 매칭 원칙 등)
- `docs/ARCHITECTURE.md` — 기술 스택, 외부 API 한도, 데이터 모델, 비용 가드레일(Supabase 500MB 등)
- `docs/ADR.md` — ADR-033(Golden Record), ADR-039(신뢰도 0.9 자동 임계) 등 매칭 설계 원칙

### 지역 마스터 / 파이프라인 (범용 구조 — 확장의 기반)
- `supabase/migrations/20260430000010_regions.sql` — `regions` 테이블 스키마 (현재 6행만 시딩)
- `scripts/backfill-realprice.ts` — 국토부 실거래가 백필 메인 스크립트. `--sgg` 인자 없으면 `regions` 테이블(`is_active=true`)에서 동적 조회 (범용, 하드코딩 없음)
- `src/services/molit.ts` — 국토부 실거래가 어댑터 (LAWD_CD 파라미터 기반, 하드코딩 없음)
- `src/services/kapt.ts` — K-apt 관리비 어댑터 (sigunguCode 파라미터 기반, 하드코딩 없음)
- `.github/workflows/molit-daily.yml` — 국토부 일배치 GitHub Actions (04:00 KST)

### 하드코딩 지역 필터 (이번 phase에서 리팩터링 대상)
- `src/lib/data/invest.ts` — `ALLOWED_SGG_CODES`
- `src/lib/data/gap-analysis.ts` — `ALLOWED_SGG_CODES`
- `src/lib/data/rankings-page.ts` — `ACTIVE_SGG_CODES` + 구 이름 하드코딩 배열
- `src/app/api/cron/daily/route.ts` — `offiSggCodes` (오피스텔), 청약홈 지역 필터링 로직
- `src/services/molit-presale.ts` — `LAWD_CODES` (분양권전매 대상)
- `supabase/migrations/20260616000004_school_ranking_rpc.sql` — `road_address LIKE '%구%'` 패턴 (경남까지만 일반화, 전국은 후속)
- `src/lib/data/seo-hierarchy.ts` — 지역명 문자열 매칭 (창원 4단계/김해 3단계 분기 패턴 참고)

### 데이터 모델
- `complexes` 테이블 — `sgg_code`, `si`/`gu`/`dong`, `road_address`, PostGIS `location` — 이미 전국형 스키마
- `transactions` 테이블 — `dedupe_key = (sgg_code, deal_ym, complex_code, deal_date, price, area)` 기반 멱등성
- `ingest_runs` 테이블 — 적재 런 추적 (재개 가능한 백필 설계에 활용)

### 참고 선례 (동일 패턴의 이전 백필 작업)
- `.planning/phases/05-data-expansion-ops/` — 창원·김해 전체 3일 분할 백필 (timeout-minutes: 300) 선례. Decisions Log 2026-05-07 항목 참고

</canonical_refs>

<specifics>
## Specific Ideas

### 현재 데이터 규모 (2026-07-03 기준, Supabase 프로덕션 실측)
- `complexes`: 2,031행
- `transactions`: 300,163행
- `regions`: 6행 (창원 5개 구 + 김해시)

### 알려진 리스크
1. **Supabase 무료 티어 500MB DB 한도**: 창원+김해(인구 약 157만) 기준 현재 규모 대비, 경남 전체(인구 약 330만)로 확장 시에도 무료 한도 초과 가능성이 높음 — 백필 전 용량 예측, 백필 후 실측 후 Pro 플랜 전환 여부 결정 필요
2. **국토부 API 일 10,000회 한도**: 경남 전체 시군구 × 다년치 백필은 하루 안에 끝나지 않음 — 여러 날 분할 실행 필요 (05-00 phase 선례 참고)
3. **매칭 큐 물량 증가**: 신규 지역 실거래가 유입 시 `complex_match_queue`에 쌓이는 미매칭 건 수가 급증할 수 있음 — 검수 프로세스가 병목이 될 수 있음

### 조사 필요 항목 (RESEARCH.md에서 다뤄야 할 것)
- 경상남도 전체 시군구 법정동코드(5자리 sgg_code) 정확한 목록 — data.go.kr 법정동코드 표준 또는 행안부 자료 기준
- Supabase Pro 플랜 요금제 및 용량/비용 (8GB 기준 등)
- 경남 전체 인구 대비 예상 데이터량(단지 수·거래 건수) 추정 방법

</specifics>

<deferred>
## Deferred Ideas

- 인접 광역시(부산·울산 등) 확장 — Phase 33b 이후로 분리
- 전국 확장 — 별도 phase로 분리
- `naver-cafe.ts` 지역별 카페 소스 다중화 (현재 "창원부동산이야기" 카페 1개 구조적 종속) — 별도 phase, 이번 범위 아님
- 학군 랭킹/`seo-hierarchy.ts`의 전국형 지역명 매칭 일반화 — 경남까지만 이번에 처리, 전국 대응은 후속
- `KakaoMap.tsx` `DEFAULT_CENTER` 다지역 대응 — 프론트엔드 재기획 회의 결과 대기 중이므로 이번 phase에서 변경하지 않음
- 창원·김해처럼 신규 지역에 대한 수동 별칭(manual_aliases) 보정 작업 — 자연 매칭률 관찰 후 필요 시 별도 진행

</deferred>

---

*Phase: 33-db-1*
*Context gathered: 2026-07-03 via 메인 세션 대화 (AskUserQuestion 결정 + 사전 조사 에이전트)*
