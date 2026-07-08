# Phase 34: 전국 DB 확장 2단계 — 인접 광역시(부산·울산) 지역 확장 기반 구축 - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning
**Source:** 메인 세션 대화 (AskUserQuestion 논의 + Phase 33 사후 검토 결과 반영)

<domain>
## Phase Boundary

Phase 33(경남 전체 확장, 완료)의 후속 phase. 33-CONTEXT.md에 명시된 3단계 확장 시퀀스(1단계 경남 → 2단계 인접 광역시 → 3단계 전국)의 2단계 중 **부산광역시만** 다룬다. 울산광역시는 부산 완료 후 리스크(용량·매칭 품질) 검증을 거쳐 별도 phase(35)로 진행 여부를 결정한다.

이 phase가 하는 일:
1. `regions` 테이블에 부산광역시 16개 구·군 코드 시딩
2. Phase 33과 동일한 패턴으로 하드코딩 지역 필터 전체 재스윕 및 제거 (Phase 33에서 동일 버그 클래스가 20+건 발견됐음 — 착수 전 전체 sweep 재수행 필수)
3. 부산 KAPT 단지목록 API로 Golden Record(complexes) 시딩 — 시딩 시 좌표+이름유사 중복 후보 탐지 로그 추가(병합은 안 함, 로그만)
4. 부산 국토부 실거래가 10년 백필 (진행 중 DB 용량 주기적 체크 태스크 포함, 450MB 도달 시 경고)
5. 관리비·학군·POI 등 기존 enrichment 파이프라인 부산 적용
6. 네이버 매핑 크롤러 부산용 BBOX 신규 튜닝 + `--diagnose` 1회 실행 + 실제 매핑(`--new-only` 방식) 실행
7. 로컬 크롤러 프로세스 불안정 종료 문제의 근본 원인 재조사 (예: GitHub Actions self-hosted runner 등) — 시간 내 해결 안 되면 기존 restart-loop로 폴백, 이 문제가 phase 전체를 blocking하지 않음
8. Supabase DB 용량 실측 + Pro 플랜 전환 여부 결정 체크포인트 (33-08과 동일 패턴)

이 phase가 하지 않는 일: 울산광역시 확장(후속 phase), 전국 확장(3단계, 후속 phase), 경남 기존 데이터의 111쌍/303건 중복 Golden Record 행 병합(별도 후속 phase로 defer), `naver-cafe.ts` 지역별 카페 소스 다중화(기존과 동일하게 defer), 학군 랭킹/`seo-hierarchy.ts` 전국형 일반화(부산이 "구 있는 광역시" 패턴이라 창원과 유사할 수 있으나 이번 phase 범위 밖 — 필요 시 RESEARCH.md에서 확인), 프론트엔드 UI 변경(재기획 회의 결과 대기 중).

</domain>

<decisions>
## Implementation Decisions

### 대상 범위
- **D-01:** 2단계는 부산광역시만 우선 진행 (16개 구·군, 인구 약 330만 — 경남 전체와 비슷한 규모). 울산광역시(5개 구·군, 인구 약 110만)는 부산 백필 완료 후 DB 용량 실측·매칭 품질 검증을 거쳐 별도 phase(35)로 진행 여부 결정
- **D-02:** 부산+울산을 한 번에 묶어서 진행하지 않는다 — 리스크(용량 초과, 데이터 품질) 진단이 어려워지기 때문에 명시적으로 기각됨

### Supabase 용량/Pro 플랜 결정
- **D-03:** 착수 전에 미리 Pro 플랜으로 전환하지 않는다 — 33-08과 동일하게 "백필 후 실측 기반 결정" 패턴을 반복한다
- **D-04:** 단, 현재 DB가 이미 420MB(84%)로 여유가 적으므로, 부산 백필 진행 중 주기적으로 DB 용량을 체크하는 태스크를 plan에 명시적으로 포함한다. 450MB 도달 시 사용자에게 즉시 경고하고, VACUUM FULL 재실행 또는 Pro 전환 중 하나를 그 자리에서 결정하게 한다. 500MB 초과로 인한 쓰기 실패(서비스 장애) 없이 진행하는 것이 목표

### 네이버 매핑 크롤러
- **D-05:** 부산용 네이버 매핑(BBOX 신규 튜닝 + 실제 매핑 실행)까지 이번 phase 범위에 포함한다 — 경남과 동일한 완성도로 마무리
- **D-06:** 로컬 프로세스가 불안정하게 죽는 문제(이번 세션에서 근본 원인 미해결 — Windows Event Viewer 조사 결과 OS/백신 개입 흔적 없음, harness 레벨의 불투명한 백그라운드 작업 수명 제약으로 추정됨)를 이번 phase에서 구조적으로 재조사한다 (예: GitHub Actions self-hosted runner 도입 검토 등, 단 GitHub Actions 자체는 네이버 IP 차단이 이번 세션에 확인됐으므로 self-hosted runner가 이 문제를 우회할 수 있는지가 핵심 조사 대상)
- **D-07:** 근본 원인 재조사가 시간 내에 해결되지 않아도 phase 진행을 막지 않는다 — 기존에 검증된 restart-loop(incremental flush + 좀비 프로세스 정리 + `--new-only` 재시작) 패턴으로 폴백
- **D-08:** 이번 세션에 추가한 `--diagnose` 진단 기능(미매핑 target마다 이름불일치/지오코딩오차의심/커버리지밖 버킷 분류, DB 변경 없음)을 부산 BBOX 확정 직후 1회 실행하여, 실제 매핑 실행 전에 문제 규모(이름 정규화 이슈 vs 지오코딩 정밀도 vs 순수 커버리지 공백)를 먼저 파악한다
- **D-09:** `NAVER_COOKIE`(실제 사용자 세션 쿠키, GitHub secret으로 저장됨)는 만료될 수 있으므로, 부산 매핑 작업 시작 전에 쿠키 유효성을 확인하는 태스크를 plan에 포함한다. 만료 시 사용자에게 재로그인을 요청

### 중복 Golden Record 행
- **D-10:** 이번 세션에 발견된 경남 기존 데이터의 111쌍/303건 중복 좌표(Golden Record) 문제는 이번 phase에서 병합하지 않는다 — 병합은 여러 테이블 FK 재연결이 필요한 위험한 작업이라 별도 후속 phase로 명시적으로 defer
- **D-11:** 단, 부산 KAPT Golden Record 시딩 단계에서는 좌표+이름유사 중복 후보를 탐지해 로그만 남기는 가벼운 로직을 추가한다 (병합 없음) — SUMMARY.md에 "잠재 중복 N건" 형태로 기록해 후속 phase 규모 파악에 활용

### Claude's Discretion
- 부산 16개 구·군의 정확한 법정동코드(sgg_code) 목록 조사 방법은 RESEARCH.md에서 다룸 (33-CONTEXT.md의 경남 조사 방법론 재사용)
- 하드코딩 지역 필터 재스윕의 정확한 범위(어느 디렉토리까지 grep할지)는 planner/researcher 재량 — 단, Phase 33에서 `scripts/`와 `card-news/`까지 포함한 전체 저장소 sweep을 이미 완료했으므로 그 sweep 방법론을 그대로 재사용할 것
- 학군 랭킹/`seo-hierarchy.ts`가 부산의 "구 있는 광역시" 패턴에 코드 변경 없이 대응 가능한지 여부는 RESEARCH.md에서 확인만 하고, 결과에 따라 범위 포함 여부를 회귀 테스트로 판단 (33-04 plan과 동일 패턴)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 33 선례 (동일 패턴 — 가장 중요한 참고자료)
- `.planning/phases/33-db-1/33-CONTEXT.md` — 경남 확장의 결정 사항 전체, 특히 "확장 범위 및 순서"·"비용/리스크 결정 게이트"·"동일 버그 클래스 누적 발생" 섹션
- `.planning/phases/33-db-1/33-RESEARCH.md` — 경남 확장 기술 조사 (법정동코드 조사 방법론, Supabase Pro 플랜 요금제 조사 등 재사용 가능)
- `.planning/phases/33-db-1/33-07-SUMMARY.md` — 국토부 백필 다회 분할 실행 결과 (4,080/4,080 combo, 249,574건)
- `.planning/phases/33-db-1/33-08-PLAN.md` — Supabase 용량 실측 + Pro 플랜 결정 체크포인트 설계 (임계값: <400MB 여유, 400~500MB 다음 확장 전 검토 필요, >500MB 필수 전환)
- `.planning/phases/05-data-expansion-ops/` — 창원·김해 3일 분할 백필 선례 (timeout-minutes: 300 패턴의 최초 출처)

### 아키텍처 / 규칙
- `CLAUDE.md` — 프로젝트 아키텍처 규칙 (외부 API 어댑터 전용 경로, RLS, Golden Record 매칭 원칙)
- `docs/ARCHITECTURE.md` — 기술 스택, 외부 API 한도, 비용 가드레일(Supabase 500MB 등)
- `docs/ADR.md` — ADR-033(Golden Record 좌표+이름 복합 매칭)

### 지역 마스터 / 파이프라인 (Phase 33에서 이미 범용화 완료)
- `src/lib/data/regions.ts` — `getActiveSggCodes()`/`getActiveCityNames()`/`getActiveRegionAddrs()` 공용 헬퍼 (regions 테이블 기반 동적 조회, 부산 추가 시 코드 변경 불필요)
- `scripts/backfill-realprice.ts` — 국토부 실거래가 백필 메인 스크립트 (범용, `--sgg` 없으면 regions 테이블 동적 조회)
- `.github/workflows/molit-backfill-once.yml` — 국토부 다회 분할 백필 workflow_dispatch (임의 `sgg_codes` 입력 받음, 코드 변경 불필요)

### 네이버 매핑 (이번 세션에 대폭 수정됨)
- `scripts/map-naver-complexes-playwright.ts` — BBOX 추가 방식·`flushMatches()` 증분 저장·`--new-only`·`--diagnose` 플래그 전부 이번 세션에 구현됨. 부산 BBOX 추가 시 이 파일의 `BBOXES` 배열에 항목만 추가하면 됨 (구조 변경 불필요)
- `.github/workflows/map-naver-complexes-once.yml` — GitHub Actions 실행 시도했으나 네이버가 GH Actions IP 대역을 차단하는 것으로 확인됨(이번 세션). 로컬 실행이 유일한 현재 검증된 경로

### 중복 Golden Record 관련
- 이번 세션 대화 기록 — 111쌍/303건 중복 좌표 발견 경위 및 원인 분석(KAPT 이름 변형체가 동일 좌표로 중복 시딩됨). 별도 문서화된 파일 없음 — STATE.md Decisions Log 2026-07-08 항목 참고

### 데이터 완성도 참고
- `.planning/phases/33-db-1/33-CONTEXT.md`의 "데이터 완성도 점검" 섹션 — 경남 신규 지역에서 좌표 지오코딩 100% 완료까지 겪은 함정들(카카오 키워드 검색만으로는 부족, 주소 검색 API 폴백 필요 등) 그대로 부산에도 적용될 가능성 높음

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/data/regions.ts`의 `getActiveSggCodes()`/`getActiveCityNames()`/`getActiveRegionAddrs()` — Phase 33에서 이미 범용화 완료, 부산 regions 행만 추가하면 모든 하드코딩 제거 지점이 자동으로 부산을 포함
- `scripts/map-naver-complexes-playwright.ts`의 `flushMatches()` 증분 저장 + `--new-only` + `--diagnose` — 이번 세션에 구현된 안전장치, 부산에도 그대로 재사용 가능

### Established Patterns
- Phase 33의 Wave 구조(Wave 0 regions 시딩 → Wave 1 하드코딩 제거 병렬 실행 → Wave 2 백필 체크포인트 → Wave 3 용량 결정 체크포인트) — 동일 구조를 부산에 재사용 권장
- "동일 버그 클래스 반복 발생" 패턴 — Phase 33에서 2차례 전체 sweep에도 매번 신규 발견이 나왔으므로, 부산 착수 전 반드시 최신 상태로 전체 재스윕할 것

### Integration Points
- `regions` 테이블에 부산 16개 구·군 INSERT만으로 대부분의 동적 조회 파이프라인이 자동 확장됨 (Phase 33에서 이미 검증된 설계)
- 네이버 매핑은 `BBOXES` 배열에 항목 추가만 필요 (코드 구조 변경 없음)

</code_context>

<specifics>
## Specific Ideas

### 현재 데이터 규모 (2026-07-08 기준, Supabase 프로덕션 실측)
- DB 전체 용량: 420MB / 500MB (VACUUM FULL 적용 후, 84%)
- `transactions`: 202MB (VACUUM FULL 후), 550,341행
- `regions`: 22행 (경남 전체, 부산 미포함)
- 부산 인구 약 330만 — 경남 전체(약 330만)와 비슷한 규모이므로, 부산 백필 완료 시 DB가 다시 최소 380~420MB 추가 증가할 가능성 높음(정확한 값은 실측 필요) → 500MB 한도 초과 리스크가 매우 높음, D-04의 주기적 용량 체크가 특히 중요

### 알려진 리스크 (Phase 33 경험 기반)
1. **Supabase 무료 티어 500MB 한도** — 이미 84% 사용 중, 부산 추가 시 초과 가능성 매우 높음 (D-03, D-04 참고)
2. **하드코딩 지역 배열 재발** — Phase 33에서 20건 이상 발견됨, 동일 클래스 버그가 부산 확장에서도 재발할 가능성 높음
3. **PostgREST 1,000행 캡** — Phase 33에서 3건 발견(fetch-sports-facilities.ts, kapt-code-lookup.ts, kapt-facility-enrich.ts, import-management-cost.ts) — 부산 데이터 처리 시에도 유사 캡이 다른 스크립트에서 발견될 수 있음, 처리 건수 로그를 항상 예상치와 대조할 것
4. **네이버 GitHub Actions IP 차단** — 로컬 실행 필수, 로컬 프로세스 불안정성 문제 재조사 필요 (D-06, D-07)
5. **매칭 큐 물량 증가** — `complex_match_queue`에 미매칭 건 급증 가능성, 검수 프로세스 병목 우려 (Phase 33 문서에서도 동일 우려 있었음)

</specifics>

<deferred>
## Deferred Ideas

- 울산광역시 확장 — 부산 완료 후 DB 용량·매칭 품질 검증 결과에 따라 별도 phase(35)로 진행 여부 결정
- 전국 확장(3단계) — 별도 phase로 분리, 부산+울산 완료 후 검토
- 경남 기존 데이터 111쌍/303건 중복 Golden Record 행 병합 — 여러 테이블 FK 재연결이 필요한 위험 작업이라 별도 후속 phase로 명시적 defer
- `naver-cafe.ts` 지역별 카페 소스 다중화 — 기존과 동일하게 defer, 이번 phase 범위 아님
- 학군 랭킹/`seo-hierarchy.ts` 전국형 일반화 — RESEARCH.md에서 부산 케이스 확인만 하고, 코드 변경이 필요하면 별도 범위로 분리 검토

</deferred>

---

*Phase: 34-db-2*
*Context gathered: 2026-07-08 via 메인 세션 대화 (AskUserQuestion 논의)*
