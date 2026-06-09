---
plan_id: 23-00
phase: 23
plan: 00
subsystem: database
tags: [url-slug, seo, migration, backfill, postgresql]
dependency_graph:
  requires: []
  provides: [complexes.url_slug, complexes_url_slug_idx, backfill-url-slugs.ts]
  affects: [Wave 1 data layer, Wave 2 routing]
tech_stack:
  added: []
  patterns: [idempotent-backfill, partial-unique-index, loadEnvConfig]
key_files:
  created:
    - supabase/migrations/20260609000001_phase23_url_slug.sql
    - scripts/backfill-url-slugs.ts
  modified: []
decisions:
  - "D-01: 한글 URL — si/gu/dong/canonical_name 그대로, 로마자 변환 없음"
  - "D-02: 창원 4단계(si/gu/dong/name) / 김해 3단계(si/dong/name), catch-all로 처리"
  - "D-08: url_slug 사전 계산 — 마이그레이션에서 초기 backfill 수행"
  - "D-09: si/dong=NULL인 ~143개 단지는 url_slug=NULL 유지, 기존 UUID URL 그대로"
  - "D-10: si+gu+dong+canonical_name 조합 충돌 0건 확인 — suffix 불필요"
metrics:
  duration_minutes: 15
  completed_date: "2026-06-09"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 0
---

# Phase 23 Plan 00: url_slug DB 컬럼 추가 + Backfill 스크립트 Summary

## One-liner

PostgreSQL UNIQUE PARTIAL INDEX + 초기 UPDATE backfill로 창원/김해 1,887개 단지에 한글 계층 url_slug 확립, 재실행용 TypeScript 스크립트 포함.

## What Was Built

### T-01: url_slug 마이그레이션 SQL
**Commit:** `896f5fe`

`supabase/migrations/20260609000001_phase23_url_slug.sql` 생성:
- `ALTER TABLE complexes ADD COLUMN IF NOT EXISTS url_slug TEXT`
- `CREATE UNIQUE INDEX IF NOT EXISTS complexes_url_slug_idx ON complexes(url_slug) WHERE url_slug IS NOT NULL` (partial index — NULL 제외)
- 초기 backfill UPDATE: 창원 4단계/김해 3단계 분기, `url_slug IS NULL` idempotent guard

### T-02: supabase db push (수동 완료)
원격 DB 적용 + 검증 결과:
- `url_slug TEXT` 컬럼 존재 확인
- `with_slug: 1,887` / `without_slug: 143`
- 중복 slug 0건
- UNIQUE PARTIAL INDEX 존재 확인

### T-03: backfill-url-slugs.ts 스크립트
**Commit:** `81ffad4`

`scripts/backfill-url-slugs.ts` 생성:
- 인라인 `buildUrlSlug(si, gu, dong, canonicalName)` — Wave 1 유틸과 독립 실행 가능
- `.is('url_slug', null)` 이중 guard (조회 filter + UPDATE 동시성 guard)
- `--dry-run` / `--limit` 파라미터
- `loadEnvConfig(@next/env)` + SUPABASE_SERVICE_ROLE_KEY 키 노출 없음 (T-23-00-01 mitigate)
- `--dry-run --limit=5` 실행 검증 완료: 에러 없음, DRY_RUN=true 출력 확인

## Verification Results

| Check | Result |
|-------|--------|
| with_slug count | 1,887 (≥ 1,700) |
| without_slug count | 143 (100~160 범위) |
| 중복 slug | 0건 |
| UNIQUE PARTIAL INDEX | 존재 확인 |
| --dry-run 실행 | 에러 없이 완료 |

## Deviations from Plan

None - 플랜대로 정확히 실행됨.

*참고: 플랜 acceptance_criteria에 `grep -c "loadEnvConfig" → 1`이라 명시되었으나, import 1줄 + call 1줄 = 2줄이 정상 패턴이므로 수용. 기능은 완전히 구현됨.*

## Security Notes (Threat Model)

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-23-00-01 (Information Disclosure) | mitigate | SUPABASE_SERVICE_ROLE_KEY console.error 출력 없음, loadEnvConfig 사용 |
| T-23-00-02 (Tampering) | accept | PostgreSQL `||` 연산자 타입 안전, SQL injection 불가 |
| T-23-00-03 (DoS) | mitigate | --limit 파라미터 + .is('url_slug', null) guard 적용 |

## Known Stubs

None.

## Threat Flags

None. 새로운 네트워크 엔드포인트 없음 (스크립트 + 마이그레이션만).

## Downstream Dependencies

이 플랜이 제공하는 것:
- `complexes.url_slug` 컬럼 (Wave 1 데이터 레이어 전제조건)
- `complexes_url_slug_idx` UNIQUE PARTIAL INDEX (O(1) 단지 조회 보장)
- `buildUrlSlug` 로직 패턴 (Wave 1에서 `src/lib/utils/url-slug.ts`로 추출 예정)

RERUN NOTE (D-08): 신규 단지 추가 후 url_slug 채우기:
```
npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts
```

## Self-Check: PASSED

- [x] `supabase/migrations/20260609000001_phase23_url_slug.sql` 존재
- [x] `scripts/backfill-url-slugs.ts` 존재
- [x] Commit `896f5fe` (T-01) 존재
- [x] Commit `81ffad4` (T-03) 존재
- [x] DB 검증: with_slug=1,887 / without_slug=143 / duplicates=0
