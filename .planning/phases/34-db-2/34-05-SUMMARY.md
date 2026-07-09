---
phase: 34-db-2
plan: "05"
subsystem: database
tags: [kakao-geocoding, postgis, dup-detection, complexes-map, bbox]

requires:
  - phase: 34-03
    provides: find_nearby_similar_complexes RPC + detectPotentialDuplicate 헬퍼 + 부산 16개 구·군 Golden Record 1,463건 시딩
provides:
  - 부산 16개 구·군 complexes 좌표(lat/lng) 카카오 지오코딩 완료 — 99.9%(1,462/1,463) 커버리지
  - scripts/detect-busan-dup-candidates.ts — 좌표 확보 후 실행하는 D-11 log-only 중복 후보 탐지 스크립트, 30건 발견
  - scripts/busan-dup-candidates.csv — 잠재 중복 30건 로그 (병합 없음)
  - complexes-map.ts BBOX lng 상한 129.4로 확장 — 부산 실측 범위 포함
affects: [34-06, 34-07, 34-08]

tech-stack:
  added: []
  patterns:
    - "PostgREST 1,000행 캡 대응: geocode-complexes.ts는 페이지네이션이 없어 1회 실행이 최대 1,000건만 처리 — 잔여분까지 idempotent 재실행 필요(2~3회)"

key-files:
  created:
    - scripts/detect-busan-dup-candidates.ts
    - scripts/busan-dup-candidates.csv
  modified:
    - src/lib/data/complexes-map.ts

key-decisions:
  - "geocode-complexes.ts를 코드 수정 없이 3회 반복 실행 — 1회당 PostgREST 1,000행 캡에 걸려 대상 전체(부산 1,463 + 비-부산 잔여 44건)를 한 번에 처리하지 못함. 이 스크립트는 sgg_code 필터가 없어(전역 lat IS NULL 대상) Busan 외 기존 경남 잔여 44건도 함께 시도됐으나 실패(카카오 DB 미등록 소규모 건물, 이 phase 범위 밖 기존 데이터 갭)"
  - "부산 1건(광안비치올리브씨아파트, 34-03 SUMMARY에서 이미 si/household_count 미보강으로 flagged된 KAPT 데이터 갭 11건 중 하나)은 road_address도 없고 카카오 키워드/주소 검색 모두 매칭 실패 — enrich-apt-unmatched.ts로 재시도 시도했으나 이 스크립트가 무조건 import하는 src/services/bld-rgst.ts의 'server-only' 최상단 import가 tsx 직접 실행 환경에서 크래시(TDZ 아님, 모듈 로드 시점 에러) — 이 phase 범위 밖의 기존 버그이므로 코드 수정 없이 99.9% 커버리지(목표 95% 초과 달성)로 수용, 잔여 1건은 KAPT API 데이터 갭으로 문서화만"
  - "complexes-map.ts BBOX lat 범위(34.7~35.8)는 부산 실측 lat max(35.34)를 이미 크게 상회해 변경하지 않음 — lng 상한만 129.3→129.4로 조정(실측 max 129.284 + 0.05 이상 여유)"

patterns-established: []

requirements-completed: [REGION-16, REGION-15]

duration: ~35min
completed: 2026-07-09
---

# Phase 34 Plan 05: 부산 좌표 지오코딩 + D-11 중복 탐지 로그 + BBOX 확장 Summary

**카카오 지오코딩으로 부산 16개 구·군 complexes 99.9%(1,462/1,463) 좌표 확보 후 detectPotentialDuplicate 헬퍼로 실좌표 순회 중복 탐지(30건 로그, 병합 없음), complexes-map.ts BBOX lng 상한을 129.3→129.4로 확장해 지도 표시 누락 위험 제거**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-09T08:20:00Z (추정)
- **Completed:** 2026-07-09T08:56:06Z
- **Tasks:** 3/3 완료
- **Files modified:** 3 (신규 2 — detect-busan-dup-candidates.ts, busan-dup-candidates.csv / 수정 1 — complexes-map.ts)

## Accomplishments
- 부산 16개 구·군 complexes 1,463건 중 1,462건(99.9%)의 lat/lng를 카카오 키워드+주소 검색 폴백으로 채움 — 목표(95%) 대비 초과 달성, 좌표 범위 lat 35.05~35.34 / lng 128.83~129.28로 실측 확인
- `scripts/detect-busan-dup-candidates.ts` 신규 작성 — 34-03이 라이브 적용한 `find_nearby_similar_complexes` RPC(ST_DWithin 30m + trigram similarity ≥0.4)를 `detectPotentialDuplicate` 헬퍼로 호출, 좌표 보유 부산 1,462건 전량 순회해 잠재 중복 30건을 `scripts/busan-dup-candidates.csv`에 log-only 기록(병합 없음, D-10 defer 유지) — N==0 가드로 지오코딩 미선행 재발 방지
- `complexes-map.ts`의 지도 쿼리 BBOX lng 상한을 129.3→129.4로 확장 — 부산 실측 lng max(129.284, 기장군·해운대 동쪽 해안)가 기존 상한과 0.016 여유밖에 없어 RESEARCH.md Pitfall 2가 우려한 지도 누락 위험을 사전 제거

## Task Commits

1. **Task 1: 부산 단지 카카오 지오코딩 실행** - 커밋 없음 (plan 명시: "파일: 없음, 기존 스크립트 실행" — DB 상태 변경만 발생)
2. **Task 2: [D-11] 좌표 확보 후 부산 중복 후보 탐지 로그** - `6ef4581` (feat)
3. **Task 3: complexes-map.ts BBOX 부산 실측 범위로 확장** - `be958c7` (fix)

## Files Created/Modified
- `scripts/detect-busan-dup-candidates.ts` - 부산 실좌표 row 순회 → detectPotentialDuplicate 호출 → CSV append (log-only), 페이지네이션(.range())으로 PostgREST 1,000행 캡 대응, 처리 건수 N==0 가드 포함
- `scripts/busan-dup-candidates.csv` - 잠재 중복 30건 (`sgg,kapt,name,dup_kapt,dup_name,dist_m` 헤더, 대부분 dist_m=0.0 — 동일 좌표에 다른 KAPT 코드로 중복 시딩된 이름 변형체, 예: "해운대현대하이페리온"/"해운대현대", "삼정그린코아스카이"/"삼정그린코아마운틴"(29.9m))
- `src/lib/data/complexes-map.ts` - `.lte('lng', 129.3)` → `.lte('lng', 129.4)` (line 88), lat 범위는 변경 없음

## Decisions Made
- **geocode-complexes.ts 3회 반복 실행 (코드 수정 없음)**: 이 스크립트는 `.range()` 페이지네이션이 없어 `.is('lat', null)` 쿼리가 PostgREST 1,000행 캡에 걸림(RESEARCH.md Pitfall 4와 동일 클래스). 부산 1,463건을 전량 커버하기 위해 idempotent 특성(매 실행마다 남은 null만 재조회)을 활용해 1000건→507건(462성공/45실패)→45건(0성공/45실패, 안정화 확인) 순으로 3회 실행. 이 스크립트는 sgg_code 필터가 없어 비-부산(기존 경남) 잔여 44건도 함께 시도되었으나 이 phase 범위 밖.
- **1건(광안비치올리브씨아파트) 좌표 미확보를 수용**: 카카오 키워드+주소 검색 모두 매칭 실패(road_address 자체가 null). `enrich-apt-unmatched.ts`로 재시도를 시도했으나 이 스크립트가 무조건 import하는 `src/services/bld-rgst.ts`의 `import 'server-only'`가 tsx 직접 실행 시 크래시하는 기존 버그(이 phase 파일 범위 밖, Phase 33에서 발견된 동일 클래스의 server-only import 버그와 유사)를 만나 우회하지 않고 커버리지 목표(95%) 초과 달성(99.9%)을 근거로 수용. 34-03 SUMMARY가 이미 이 단지를 KAPT si/household_count 미보강 11건 중 하나로 flagged — 이번에도 동일 단지가 데이터 갭으로 확인되어 일관성 있음.
- **BBOX lat 범위는 변경하지 않음**: 부산 실측 lat max(35.34)가 기존 상한(35.8)을 크게 하회해 조정 불필요 — lng 상한만 조정.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] geocode-complexes.ts의 PostgREST 1,000행 캡으로 1회 실행이 부산 1,463건 전체를 처리하지 못함**
- **Found during:** Task 1
- **Issue:** `.is('lat', null)`에 `.range()` 페이지네이션이 없어 응답이 최대 1,000행으로 잘림(RESEARCH.md Pitfall 4가 예견한 클래스, 다른 enrichment 스크립트에서 Phase 33에 3건 이미 발견됨)
- **Fix:** 코드 수정 없이 idempotent 재실행 3회로 완주(1000건 전량 성공 → 507건 중 462성공/45실패 → 45건 재시도 0성공/45실패로 안정화 확인). 최종 부산 커버리지 99.9%(1,462/1,463)로 목표(95%) 초과 달성
- **Files modified:** 없음 (DB 상태 변경만, 코드 변경 없음)
- **Verification:** `SELECT count(*) FROM complexes WHERE sgg_code LIKE '26%' AND lat IS NOT NULL` = 1,462, 좌표 범위 lat 35.05~35.34 / lng 128.83~129.28로 부산 실제 지리 범위와 일치 확인
- **Committed in:** 해당 없음 (Task 1은 코드 변경 없음, DB 상태만 변경 — plan 명시와 일치)

**2. [Rule 2 - Missing Critical, 발견만] enrich-apt-unmatched.ts가 server-only import 크래시로 실행 불가**
- **Found during:** Task 1 (잔여 1건 좌표 확보 시도)
- **Issue:** `enrich-apt-unmatched.ts`가 최상단에서 무조건 `import { fetchBldTitleInfo } from '../src/services/bld-rgst'`를 하는데, 이 파일이 `import 'server-only'`를 최상단에 갖고 있어 `--skip-bldrgst` 플래그와 무관하게 모듈 로드 시점에 `Error: This module cannot be imported from a Client Component module`로 크래시함
- **Fix:** 코드 수정 없음(이 phase의 `files_modified` 범위 밖, Phase 33에서 발견된 동일 클래스 버그— 광범위한 영향 우려로 이 phase에서는 우회하지 않음). 대신 카카오 키워드 검색을 직접 curl로 3가지 쿼리 변형으로 시도했으나 카카오 장소 DB에 미등록 확인 — 이미 99.9% 커버리지로 목표 초과 달성했으므로 잔여 1건은 데이터 갭으로 문서화만
- **Files modified:** 없음
- **Verification:** curl 직접 호출 3회(원본명/원본명+지역/축약명) 전부 빈 결과 확인, 34-03 SUMMARY의 KAPT si 미보강 11건 목록과 대조해 동일 단지임을 확인(일관된 데이터 갭)
- **Committed in:** 해당 없음 — 향후 phase에서 `bld-rgst.ts`의 `server-only` import를 스크립트 실행 가능하게 조건부로 개선하는 것을 권장(코드 수정은 하지 않음, 기록만)

---

**Total deviations:** 2 (1 Rule 3 blocking 재실행 워크어라운드, 1 Rule 2 기존 버그 발견·수용)
**Impact on plan:** 둘 다 plan이 지정한 파일 범위(`scripts/detect-busan-dup-candidates.ts`, `src/lib/data/complexes-map.ts`)를 벗어나지 않음. 목표 커버리지(95%)를 99.9%로 초과 달성했으며, 미해결 1건은 KAPT API 자체 데이터 갭으로 별도 조치 불필요.

## Issues Encountered
- 비-부산(기존 경남) 잔여 44건도 `geocode-complexes.ts`(sgg_code 필터 없음)에 의해 함께 지오코딩 시도되었으나 전량 실패(빌라/소규모 건물, 카카오 DB 미등록) — 이 phase 범위 밖의 기존 데이터 상태이므로 별도 조치 없음, 후속 phase에서 참고용으로만 기록

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 부산 16개 구·군 complexes의 lat/lng가 99.9% 확보되어 34-06(국토부 실거래가 백필)이 Golden Record 매칭 기반으로 착수 가능
- `scripts/busan-dup-candidates.csv`(잠재 중복 30건)가 확보되어 후속 병합 phase의 규모 산정에 활용 가능 — 이번 phase에서는 병합하지 않음(D-10 defer 유지)
- `complexes-map.ts` BBOX가 부산 실측 범위를 포함해 34-06 이후 `/map` 페이지에서 부산 단지 표시 시 지오코딩 오차로 인한 누락 위험 제거됨
- 잔여 미해결: 부산 1건(광안비치올리브씨아파트) 좌표 미확보 — KAPT API 데이터 갭, 후속 조치 불필요(34-03 SUMMARY와 일관)

---
*Phase: 34-db-2*
*Completed: 2026-07-09*
