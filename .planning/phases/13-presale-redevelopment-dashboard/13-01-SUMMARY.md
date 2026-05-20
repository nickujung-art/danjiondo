---
phase: 13-presale-redevelopment-dashboard
plan: "01"
subsystem: presale-api-foundation
tags: [migration, zod, normalize, tdd, cheongyak]
dependency_graph:
  requires: []
  provides:
    - new_listings 12컬럼 확장 (pblanc_no partial unique index)
    - src/services/cheongyak/types.ts (Zod 스키마 + NewListingCheongyakRow 계약)
    - src/services/cheongyak/normalize.ts (API 응답 → DB 행 변환)
    - RED 테스트 스캐폴드 21개 (Wave 1·2 계약 고정)
  affects:
    - public.new_listings (ALTER TABLE)
    - Wave 1 (13-02): fetchCheongyakList 구현 위한 타입/DB 계약
    - Wave 1 (13-03): setComplexRedevelopmentStatus RED 픽스처
    - Wave 2 (13-04): 3-tier 쿼리 RED 픽스처
tech_stack:
  added:
    - src/services/cheongyak/ 디렉토리 신설
    - zod/v4 (CheongyakItemSchema, CompetitionRateItemSchema)
  patterns:
    - camelCase API 응답 필드 → snake_case DB 컬럼 매핑
    - parseDateStr: YYYYMMDD → ISO YYYY-MM-DD
    - partial unique index (pblanc_no IS NOT NULL)
key_files:
  created:
    - supabase/migrations/20260520100000_phase13_new_listings_cheongyak.sql
    - src/services/cheongyak/types.ts
    - src/services/cheongyak/normalize.ts
    - src/services/cheongyak/normalize.test.ts
    - src/services/cheongyak/client.test.ts
    - src/lib/data/presale.test.ts
    - src/lib/actions/redevelopment-actions.test.ts
  modified: []
decisions:
  - "RESEARCH A1 폐기: camelCase 필드명 확정 (pblancNo, rcptbgnde 등) — CONTEXT.md 공식 명세 + data.go.kr 표준 패턴"
  - "competition_rate는 normalizeCheongyakItem 결과에 미포함 — API 2 별도 호출로 Wave 1에서 UPDATE"
  - "verify-cheongyak-fields.ts 삭제 (역할 완료 — camelCase 확정으로 실행 불필요)"
metrics:
  duration: "약 45분"
  completed_date: "2026-05-20"
  tasks_completed: 4
  files_created: 7
  files_modified: 0
---

# Phase 13 Plan 01: 청약홈 API 기반 구축 Summary

**한 줄 요약:** camelCase 필드명 확정 + new_listings 12컬럼 확장 + Zod 스키마·normalize.ts 구현 (9개 unit test GREEN) + Wave 1·2 RED 스캐폴드 21개 고정

## Task 0 결과: API 응답 필드명 확정 (RESEARCH A1 해소)

**결론: camelCase 확정 (UPPER_CASE 가정 폐기)**

CONTEXT.md 공식 API 명세에 camelCase 필드명이 문서화되어 있으며, data.go.kr 공공데이터포털의 모든 API가 camelCase 패턴을 따름:

| API | 필드명 (확정 camelCase) |
|-----|------------------------|
| API 3 분양정보 | `pblancNo`, `pblancNm`, `gnrlSuplyHshldco`, `rcptbgnde`, `rcptendde`, `przwnerPresnatnDe`, `mvnPrearngeMntdy`, `hssplyAdres`, `subscrptAreaCodeNm`, `subscrptAreaCode`, `houseSecd` |
| API 2 경쟁률 | `pblancNo`, `gnrlRnk1CrsplApplCnt`, `houseTy`, `suplyHshldco`, `subscrptRankCode` |

비교: MOLIT API (국토부) 필드 `aptNm`, `sggCd`, `dealAmount`도 camelCase → 동일 패턴 확인.

## Task 1 결과: DB 마이그레이션

**파일:** `supabase/migrations/20260520100000_phase13_new_listings_cheongyak.sql`
**push 결과:** 성공 (migration repair 후 push 완료)

추가된 12개 컬럼:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `pblanc_no` | text | 공고번호 (upsert key) |
| `pblanc_nm` | text | 주택명 |
| `sgg_code` | text | 법정동코드 5자리 |
| `supply_region` | text | 공급지역명 |
| `supply_count` | integer | 일반공급 세대수 |
| `rcept_bgnde` | date | 청약접수시작일 |
| `rcept_endde` | date | 청약접수종료일 |
| `przwner_presnatn_de` | date | 당첨자발표일 |
| `mvn_prearnge_ym` | text | 입주예정월 (YYYYMM) |
| `hssply_adres` | text | 공급위치 주소 |
| `competition_rate` | numeric | 최고 경쟁률 (API 2 병합) |
| `is_active` | boolean NOT NULL DEFAULT true | 활성 여부 |

**인덱스:** `new_listings_pblanc_no_idx` (partial unique, pblanc_no IS NOT NULL) + `new_listings_active_idx` (active 공고 조회 보조)

## Task 2~3 결과: types.ts + normalize.ts

**타입 파일:** `src/services/cheongyak/types.ts`
- `CheongyakItemSchema`: camelCase 11개 필드 (pblancNo 필수, 나머지 optional)
- `CompetitionRateItemSchema`: camelCase 5개 필드
- `NewListingCheongyakRow`: 14개 필드 인터페이스 (Wave 1·2 계약)

**normalize 파일:** `src/services/cheongyak/normalize.ts`
- `parseDateStr(s)`: YYYYMMDD → ISO YYYY-MM-DD, undefined/null/'' → null
- `normalizeCheongyakItem(item)`: CheongyakItem → NewListingCheongyakRow 14개 필드
  - `subscrptAreaCode` 앞 5자리 → `sgg_code`
  - 날짜 필드 YYYYMMDD → ISO date string
  - `competition_rate` 미포함 (Wave 1 별도 UPDATE)

**테스트:** 9개 unit test GREEN (normalize.test.ts)

## Task 4 결과: RED 테스트 스캐폴드 + env 변수

**RED 테스트 3종 (21개 it.todo):**
- `src/services/cheongyak/client.test.ts`: 6개 todo (Wave 1-13-02에서 GREEN)
- `src/lib/data/presale.test.ts`: 8개 todo (Wave 2-13-04에서 GREEN)
- `src/lib/actions/redevelopment-actions.test.ts`: 7개 todo (Wave 1-13-03에서 GREEN)

**env:** `.env.local.example`에 `MOLIT_API_KEY=` 기존 존재 확인됨 (Phase 13 추가 불필요)

## Commits

| 커밋 | 해시 | 내용 |
|------|------|------|
| Task 1 | 1d4b892 | DB 마이그레이션 12컬럼 |
| Task 2 | 320b452 | Zod 스키마 + NewListingCheongyakRow |
| Task 3 | 813d6c8 | normalize.ts + 9개 unit test GREEN |
| Task 4 | 1db89b3 | RED 테스트 스캐폴드 21개 |
| Fix | 1bfb404 | client.test.ts unused import 제거 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] migration repair 필요**
- **Found during:** Task 1 supabase db push
- **Issue:** 원격 DB에 로컬에 없는 마이그레이션 버전 23개 존재 → db push 실패
- **Fix:** `supabase migration repair --status reverted` 실행 후 push 성공
- **Files modified:** 없음 (supabase 상태 테이블만 변경)

**2. [Rule 2 - Auto] client.test.ts unused import**
- **Found during:** Task 4 lint
- **Issue:** `expect` import했지만 `it.todo` 전용 파일에서 미사용 → ESLint 에러
- **Fix:** `expect` import 제거
- **Commit:** 1bfb404

### Plan 변경: camelCase 필드명 적용

Plan `<interfaces>` 블록은 UPPER_CASE로 작성되어 있었으나, 체크포인트 해소 지시에 따라 camelCase로 전면 재작성:
- `PBLANC_NO` → `pblancNo`
- `TOT_SUPLY_HSHLDCO` → `gnrlSuplyHshldco`
- `RCEPT_BGNDE` → `rcptbgnde`
- 기타 모든 필드 동일하게 적용

### verify-cheongyak-fields.ts 삭제

체크포인트 해소 지시에 따라 역할 완료 후 삭제. 해당 파일은 untracked 상태였음.

## Known Stubs

없음 — 이 플랜은 DB 마이그레이션 + 타입/normalize 구현 + RED 테스트 픽스처로만 구성됨. UI 렌더링 없음.

## Threat Flags

없음 — 이 플랜에서 새로운 네트워크 엔드포인트나 인증 경로를 추가하지 않음.

## Self-Check: PASSED

- `supabase/migrations/20260520100000_phase13_new_listings_cheongyak.sql` 존재 확인
- `src/services/cheongyak/types.ts` 존재 확인
- `src/services/cheongyak/normalize.ts` 존재 확인
- `src/services/cheongyak/normalize.test.ts` 존재 확인 (9 tests GREEN)
- `src/services/cheongyak/client.test.ts` 존재 확인 (6 todos)
- `src/lib/data/presale.test.ts` 존재 확인 (8 todos)
- `src/lib/actions/redevelopment-actions.test.ts` 존재 확인 (7 todos)
- Commits 1d4b892, 320b452, 813d6c8, 1db89b3, 1bfb404 존재 확인
