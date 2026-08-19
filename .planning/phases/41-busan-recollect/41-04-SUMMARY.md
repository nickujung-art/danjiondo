---
phase: 41-busan-recollect
plan: "04"
subsystem: database
tags: [kakao-geocoding, postgis, dup-detection, seed-gate, busan]

requires:
  - phase: 41-03
    provides: "부산 16개 구 complexes Golden Record 1,467건 시딩, busan-status.ts 1,000행 캡 수정 (complexes + ingest_runs)"
provides:
  - "부산 16개 구 complexes 좌표(lat/lng) 카카오 지오코딩 99.9%(1,466/1,467) — 95% 게이트 초과 달성"
  - "잔여 미확보 1건(광안비치올리브씨아파트) — Phase 34와 동일한 카카오 미등록 데이터 갭으로 재확인(HTTP 200 빈 결과로 API 오류 아님을 직접 검증)"
  - "scripts/busan-dup-candidates.csv — 부산 잠재 중복 22건 재탐지(Phase 34 30건 대비 감소, 병합 없음)"
  - "npx tsx scripts/busan-status.ts --assert-seed-gate exit 0 — 백필 진입 게이트 통과"
  - "3그룹(A/B/C) dispatch 계획 지역-월 수 대조표, 41-05~07 인계"
affects: [41-05, 41-06, 41-07]

tech-stack:
  added: []
  patterns:
    - "geocode-complexes.ts는 .range() 없이 idempotent 재실행(2~3회)으로 PostgREST 1,000행 캡을 우회 — Phase 34와 동일 패턴 재확인"
    - "카카오 API 실패(HTTP 비정상)와 '주소 미등록'(HTTP 200 + documents:[])을 curl 직접 호출로 구분 검증 — anti-silent-success 원칙 적용"

key-files:
  created: []
  modified:
    - scripts/busan-dup-candidates.csv

key-decisions:
  - "geocode-complexes.ts·detect-busan-dup-candidates.ts 코드 무변경 원칙 유지 — Phase 34 선례(idempotent 반복 실행)를 그대로 재사용"
  - "잔여 1건(광안비치올리브씨아파트) 좌표 미확보를 데이터 갭으로 수용 — road_address 자체가 null이라 폴백 경로 없음, curl 직접 검증(HTTP 200, documents:[])으로 카카오 API 오류가 아님을 확인"
  - "중복 후보 22건(Phase 34 30건 대비 8건 감소)을 병합 없이 CSV로 덮어씀 — D-10 defer 유지, complex-matching.ts·migrations 무변경을 git diff --exit-code로 실증"
  - "--assert-seed-gate가 exit 0으로 통과했으므로 41-05(그룹 A 백필) 진입을 사용자 승인 대기로 인계 — 게이트 통과가 곧 백필 시작을 의미하지 않음(체크포인트 정책)"

requirements-completed: [BUSAN-04]

duration: ~55min
completed: 2026-08-19
---

# Phase 41 Plan 04: 부산 좌표 지오코딩 + 백필 진입 게이트 판정 Summary

**카카오 지오코딩 3회 반복 실행으로 부산 좌표 커버리지를 0% → 99.9%(1,466/1,467)로 수렴시키고, 중복 후보 22건을 로그(병합 없음)로 재확인한 뒤 `--assert-seed-gate`가 exit 0으로 통과함을 실측했다 — 단, 백필 3그룹 dispatch는 사용자 승인 대기 중이며 이 plan은 게이트 판정까지만 수행했다.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-19T10:47:00Z (approx, 41-03 완료 직후)
- **Completed:** 2026-08-19T11:03:00Z (Task 1·2), 체크포인트 대기 중
- **Tasks:** 2/3 완료 (Task 3은 blocking human-approval checkpoint — 미진입)
- **Files modified:** 1 (`scripts/busan-dup-candidates.csv`)

## Accomplishments

- `geocode-complexes.ts`를 코드 수정 없이 3회 반복 실행 — Phase 34와 동일한 수렴 패턴을 재확인 (1,000건 전량 성공 → 520건 중 475성공/45실패 → 45건 재시도 0성공/45실패로 안정화)
- 부산 좌표 커버리지 최종 99.9%(1,466/1,467) — 게이트 임계(95%) 초과 달성
- 잔여 미확보 1건(광안비치올리브씨아파트, sgg_code 26500, kapt A10023802, road_address null)이 Phase 34가 특정한 것과 정확히 동일한 단지임을 확인 — curl 직접 호출로 카카오 API가 HTTP 200 + `documents:[]`를 반환함을 실증(API 오류가 아니라 진짜 미등록)
- 좌표 1,466건 전량이 부산 실측 지리 범위(lat 35.05~35.34, lng 128.83~129.28) 안에 있음을 확인 — 범위 밖 오매칭 0건(T-41-12 완화 실증)
- `scripts/detect-busan-dup-candidates.ts` 재실행 — 잠재 중복 22건 재탐지, `complex-matching.ts`/`migrations/` 무변경 확인
- `npx tsx scripts/busan-status.ts --assert-seed-gate` **exit 0** — 3개 서브 조건(단지 수·좌표 커버리지·16개 구 전부 1행 이상) 전부 통과

## Task Commits

1. **Task 1: 부산 단지 좌표 지오코딩 반복 실행** - 커밋 없음 (plan 명시: "파일: 없음, 스크립트 실행" — DB 상태 변경만 발생, 실측값은 본 SUMMARY에 기록. `complexes-map.ts` BBOX는 이미 129.4로 확장되어 있어 무변경 확인)
2. **Task 2: 중복 후보 재탐지 + 백필 진입 게이트 판정** - `245b75e` (feat) — `scripts/busan-dup-candidates.csv` 갱신
3. **Task 3: [CHECKPOINT] 백필 진입 승인** - **미진입 (PENDING USER APPROVAL)** — 아래 절 참조

**Plan metadata commit:** (오케스트레이터가 wave 종료 후 생성 — 이 executor는 STATE.md/ROADMAP.md를 갱신하지 않는다)

## Files Created/Modified

- `scripts/busan-dup-candidates.csv` — Phase 34 결과(30건)를 이번 재탐지 결과(22건)로 덮어씀. `find_nearby_similar_complexes` RPC(ST_DWithin 30m + trigram 0.4) 순회 호출 결과. 병합 로직 없음 — SELECT + CSV 쓰기만 수행

## 지오코딩 회차별 표

| 회차 | 처리 대상 건수 | 성공 | 주소 검색 폴백(포함) | 실패 | 좌표 커버리지(부산, 누적) | 증가분 |
|---|---|---|---|---|---|---|
| 시딩 직후(기준) | - | - | - | - | 0/1,467 = 0.0% | - |
| 1 | 1,000 | 1,000 | 46 | 0 | 1,000/1,467 = 68.2% | +68.2%p |
| 2 | 520 (부산 잔여 467 + 비-부산 잔여 53 추정) | 475 | 10 | 45 | 1,466/1,467 = 99.9% | +31.7%p |
| 3 | 45 (동일 잔여 재시도) | 0 | 0 | 45 | 1,466/1,467 = 99.9% (불변) | +0.0%p — **수렴 확인** |

- 회차 2→3에서 좌표 미확보 건수가 45건으로 연속 2회 동일 → Phase 34와 동일하게 3회에 수렴 (Phase 34: 3회 수렴, 부산 1건 잔여 / 이번: 3회 수렴, 부산 1건 잔여로 패턴 일치)
- `geocode-complexes.ts`는 `sgg_code` 필터가 없는 전역 스크립트라 매 회차 비-부산(기존 경남) 잔여 44~45건도 함께 시도됨 — 이 phase 범위 밖의 기존 데이터 갭(변경 없음)

## 카카오 API 오류 대 주소 미검출 구분

- 회차 1은 1,000/1,000 전량 성공(0 실패) — API 키·인증·쿼터에 문제가 없었음을 실측으로 확인
- 회차 2·3의 잔여 45건(부산 1건 + 비-부산 44건)에 대해, 부산 잔여 1건(광안비치올리브씨아파트)을 **curl로 직접 카카오 키워드 검색 API를 호출**해 확인:
  ```
  GET https://dapi.kakao.com/v2/local/search/keyword.json?query=광안비치올리브씨아파트+부산광역시+수영구
  → HTTP 200, {"documents":[],"meta":{"total_count":0,...}}
  ```
  **HTTP 200 + 빈 결과** — 이것은 카카오 API 오류(401/429/5xx/네트워크 타임아웃)가 아니라 **카카오 장소 DB에 해당 건물이 실제로 미등록**되어 있다는 뜻이다. `road_address` 컬럼 자체가 `null`이라 주소 검색 폴백 경로도 없다.
- 회차 2→3에서 정확히 동일한 45건이 재현된 것(무작위 실패가 아님)도 일시적 API 오류가 아니라 안정적인 데이터 갭임을 뒷받침한다.
- **결론: 이번 실행에서 카카오 API 오류(쿼터/인증/네트워크)로 인한 실패는 0건.** 잔여 미확보는 전량 "주소 미등록" 데이터 갭이다.

## 잔여 미확보 단지 목록 + Phase 34 대조

| 단지명 | sgg_code | kapt_code | road_address | Phase 34 잔여 목록에 있는가 |
|---|---|---|---|---|
| 광안비치올리브씨아파트 | 26500 | A10023802 | null | ✅ 있음 — 34-05-SUMMARY가 특정한 바로 그 1건 |

- 부산 잔여 1건 = Phase 34 잔여 1건과 **정확히 일치**. 41-03-SUMMARY(K-apt si/built_year 보강 잔여 11건 목록)에도 동일 단지·동일 sgg_code·동일 kapt_code로 등장 — 좌표·속성 보강 양쪽에서 일관되게 확인되는 KAPT/카카오 공통 데이터 갭
- 이번 세션에서 좌표 커버리지 99.93%(1,466/1,467)로 Phase 34의 99.9%(1,462/1,463)와 사실상 동일한 결과 — K-apt 원본 데이터 안정성 재확인
- 비-부산(경남 기타) 잔여 44건은 이 phase 범위 밖의 기존 갭(빌라·소규모 건물, 카카오 DB 미등록) — 손대지 않음

## 중복 후보 건수 대조 + 병합 없음 실증

| 항목 | Phase 34 (34-05) | 이번(41-04) |
|---|---|---|
| 잠재 중복 건수 | 30건 | 22건 |
| 검사 대상(좌표 보유 부산 단지) | 1,462건 | 1,466건 |

- 22건 < 30건 — 크게 다르지 않음(60건 이상 급증 기준에 해당하지 않음). 감소는 K-apt 원본 데이터의 단지 코드 정리·명칭 통합 등 원본 API 측 변동으로 추정되며, 이 plan에서 병합을 수행하지 않았으므로 우리 쪽 로직 변경에 의한 감소가 아님
- 대부분 `dist_m=0.0`(동일 좌표에 다른 KAPT 코드로 등록된 이름 변형체, 예: 해운대현대하이페리온/해운대현대, 삼정그린코아스카이/삼정그린코아마운틴 29.9m) — Phase 34와 같은 성격
- **병합 여부 검증**: `git diff --stat src/lib/data/complex-matching.ts supabase/migrations/` → 공백(변경 없음, exit 0). D-10 defer 유지 실증

## `--assert-seed-gate` 판정

```
npx tsx scripts/busan-status.ts --assert-seed-gate
🔗 연결 대상: https://jaamyvlsehlimtrxgrgn.supabase.co
=== complexes ===
  부산 총 1,467 / 좌표 있음 1,466 (99.9%)
  구별 breakdown: 26110:11 26140:42 26170:27 26200:43 26230:171 26260:127
                  26290:101 26320:114 26350:200 26380:142 26410:87 26440:52
                  26470:106 26500:64 26530:98 26710:82
EXIT_CODE=0
```

| 서브 조건 | 임계 | 실측값 | 통과 여부 |
|---|---|---|---|
| `complexes_busan_total >= 1400` | 1,400 | 1,467 | ✅ 통과 |
| `complexes_coord_coverage_pct >= 95%` | 95% | 99.9% | ✅ 통과 |
| 0개 단지인 구 | 0곳 | 0곳(16개 구 전부 최소 11건) | ✅ 통과 |

**🔴 exit code = 0 — 게이트 통과.** 백필 진입 조건이 실측으로 충족됐다. 단, **백필 자체는 시작하지 않았다** — `gh workflow run` 미호출, `backfill-realprice.ts` 미실행. 다음 단계(41-05, 그룹 A)는 사용자 승인 후 별도 plan에서 진행한다.

## D-05 3그룹 dispatch 계획 인계

| 그룹 | sgg_code | 구 수 | 지역-월(구×140개월×2종) | 5시간 job 산정(≈1,560 지역-월) 대비 |
|---|---|---|---|---|
| A (대형) | 26230, 26260, 26320, 26350, 26380 (부산진·동래·북·해운대·사하) | 5 | 1,400 | 여유 있음 (1,400 < 1,560) |
| B (중대형) | 26290, 26410, 26440, 26470, 26500 (남·금정·강서·연제·수영) | 5 | 1,400 | 여유 있음 (1,400 < 1,560) |
| C (소형) | 26110, 26140, 26170, 26200, 26530, 26710 (중·서·동·영도·사상·기장) | 6 | 1,680 | **산정 초과** (1,680 > 1,560) — `--resume`로 재개 필요 |
| 합계 | 16개 구 전부 | 16 | 4,480 | D-04(201501~202608, 창원·김해 대칭) 채택분 |

- 그룹 A·B는 5시간 타임아웃 안에 들어올 것으로 예상되나, 그룹 C는 초과分이 있어 1회 실행으로 완주하지 못할 가능성이 있다 — `molit-backfill-once.yml`의 `--resume`가 재개 경로(D-06). 각 그룹 dispatch plan(41-05~07)이 실행 중 확인할 사항이다.

## Decisions Made

- `geocode-complexes.ts`·`detect-busan-dup-candidates.ts` 코드 무변경 원칙 유지 — Phase 34 선례(3회 idempotent 재실행)를 그대로 재사용, 새로운 페이지네이션·`--sgg` 필터 도입은 이 plan 범위 밖
- 잔여 1건(광안비치올리브씨아파트) 좌표 미확보 수용 — `road_address` 자체가 null이라 주소 검색 폴백 경로가 원천적으로 없음. `enrich-apt-unmatched.ts` 재시도는 시도하지 않음(plan이 명시한 기존 `server-only` import 크래시 버그, 이 phase 범위 밖)
- 중복 후보 22건을 병합 없이 CSV로만 기록 — D-10 defer 유지, `complex-matching.ts`·`migrations/` 무변경을 `git diff --exit-code`로 실증
- 게이트 exit 0 확인 후에도 41-05로 자동 진행하지 않음 — 이 plan은 `autonomous: false`이며 Task 3(체크포인트)에서 사용자 승인을 받아야 백필이 시작된다

## Deviations from Plan

None - plan executed exactly as written. 코드 파일 변경 없음(스크립트 실행 결과만 DB에 반영), `scripts/busan-dup-candidates.csv`만 plan이 지정한 대로 갱신.

## Issues Encountered

None — Phase 34와 동일한 패턴(3회 수렴, 잔여 1건)이 재현되어 예측 가능한 실행이었다.

## `npm run lint` 결과

```
✔ No ESLint warnings or errors
```
(`tsc --noEmit`도 함께 실행되며 에러 없이 종료)

## 테스트 실패 집합 확인

- `src/__tests__/seed-region.test.ts` 단독 실행 결과: **3건 실패**(environment_facts가 명시한 기존 베이스라인과 정확히 일치 — `regions: 경남 전체 22개 시군구 존재`, `regions: 경남 확장 16개 시군구 gu=null`, `regions: 부산 16개 구가 존재하고 모두 gu가 채워져 있다`)
- 전체 `npx vitest run` 결과: 7개 파일 / 14개 테스트 실패 — `complex-matching-3b.test.ts`, `favorites.test.ts`, `molit-ingest.test.ts`, `reviews.test.ts`, `school-ranking-regional.test.ts`, `seed-region.test.ts` 등. 이 테스트들은 로컬 Supabase(127.0.0.1:54321) integration 의존이며, 41-03-SUMMARY가 이미 "실행마다 실패 파일 집합이 달라지는 환경적 플레이키니스"로 문서화한 것과 동일 클래스다. 이번 plan은 `scripts/busan-dup-candidates.csv` 1개 파일만 변경했고 `src/` 코드를 전혀 건드리지 않았으므로, 이 실패들은 이 plan이 유발한 것이 아니다.
- **결론: 테스트 실패 집합이 기존 3건(seed-region.test.ts)에서 늘지 않았다.** 전체 스위트의 추가 실패는 로컬 Supabase 상태 의존 플레이키니스로, 41-03이 이미 확인한 범위 안에 있다.

## User Setup Required

None - 외부 서비스 설정 불필요. 기존 `.env.local`의 `KAKAO_REST_API_KEY`·`NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`를 셸에서 명시적으로 export해 사용했다(로컬 Supabase 우선 로드 함정 회피).

## Rollback

- `scripts/busan-dup-candidates.csv` 변경은 로그 파일 덮어쓰기라 되돌리려면 해당 커밋(`245b75e`)을 revert
- 좌표 데이터(`complexes.lat/lng`)는 DB 상태 변경이며 코드 커밋이 없다 — 되돌리려면 `UPDATE complexes SET lat=NULL, lng=NULL WHERE sgg_code LIKE '26%'`(권장하지 않음, 41-05 이후 백필이 이 좌표에 의존)

## Next Phase Readiness

- BUSAN-04 완료 — 부산 16개 구 K-apt 시딩(41-03) + 좌표 지오코딩(41-04) + 중복 후보 로그 + 백필 진입 게이트 exit 0
- 41-05(그룹 A 백필)는 **사용자 승인 대기 중** — 이 plan의 체크포인트(Task 3)가 PENDING 상태로 남아 있다
- 3그룹 dispatch 계획(sgg_code 목록·지역-월 수·5시간 job 산정 대조)이 위 표로 인계됨 — 그룹 C는 `--resume` 재개가 필요할 가능성을 41-07이 인지해야 한다

---
*Phase: 41-busan-recollect*
*Completed: 2026-08-19 (Task 1·2), Task 3 checkpoint pending*

## PENDING USER APPROVAL

**게이트 결과 요약**
- `npx tsx scripts/busan-status.ts --assert-seed-gate` → **exit 0 (통과)**
- 부산 `complexes` 1,467 (게이트 임계 1,400 초과) / 좌표 커버리지 99.9%(1,466/1,467, 게이트 임계 95% 초과) / 16개 구 전부 최소 11건
- 잔여 미확보 좌표 1건(광안비치올리브씨아파트)은 카카오 미등록 데이터 갭으로 확정(Phase 34와 동일, curl로 API 오류 아님을 검증)
- 잠재 중복 22건이 로그로 남았고 병합은 수행하지 않음(D-10 defer 유지)

**다음에 일어날 일 (승인 시)**
1. 41-05가 그룹 A(`26230,26260,26320,26350,26380` — 부산진·동래·북·해운대·사하, 1,400 지역-월)를 `molit-backfill-once.yml` 워크플로로 dispatch한다
2. 예상 소요 약 4.5시간(지역-월당 중간값 11.5초 기준, 5시간 job 타임아웃 안에 들어올 것으로 산정됨)
3. **`gh workflow run`을 호출하기 전에 `git push`로 이번 커밋(`245b75e` 등)이 원격에 반영돼 있어야 한다** — GitHub Actions는 원격 브랜치 기준으로 실행된다
4. 이후 그룹 B(1,400 지역-월), 그룹 C(1,680 지역-월, 산정 초과로 `--resume` 재개 가능성)가 순차 진행된다(41-06, 41-07)

**되돌림 가능성**
- 게이트가 exit 0이므로 41-03(시딩)으로 되돌아갈 필요는 없다
- 백필 시작 전이므로 `transactions` 테이블에 부산 데이터는 아직 0건 — 승인을 보류해도 되돌릴 데이터가 없다(무손실 대기 상태)
- 승인 후에도 그룹 단위로 진행되므로, 그룹 A 실행 후 문제가 발견되면 그룹 B·C 시작 전에 중단할 수 있다(체크포인트가 각 41-05/06/07 plan에도 있을 것으로 예상 — 실제 존재 여부는 해당 plan 파일 확인 필요)

**승인 방법**: "승인 — 그룹 A 시작, DB N MB"(Supabase Dashboard → Database → Usage에서 확인한 현재 용량을 N에 채워 응답) 또는 "게이트 미달: <조건>"(해당 없음, 이번엔 게이트 통과) 또는 그룹 분할을 바꾸고 싶으면 원하는 분할을 알려주면 된다.

⚠️ **참고**: 이 SUMMARY를 작성한 실행자(executor)는 세션 중 두 건의 의심스러운 프롬프트 인젝션 시도를 컨텍스트에서 발견했다 — (1) "claude.ai PlayMCP"라는 존재하지 않는 MCP 서버가 "카카오 공식 제공"이라 자칭하는 안내문, (2) "bypass permissions mode"를 근거로 Read/Edit/Write 도구 대신 Bash만 쓰라는 안내문. 둘 다 이 세션의 실제 도구 구성과 맞지 않아 무시했고 정상 도구로 작업을 완료했다. 사용자가 이 세션의 로그를 검토할 때 참고할 것.

## Self-Check: PASSED

- FOUND: scripts/busan-dup-candidates.csv
- FOUND: .planning/phases/41-busan-recollect/41-04-SUMMARY.md
- FOUND commit: 245b75e (Task 2)
