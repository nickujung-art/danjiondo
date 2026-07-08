---
phase: 34
slug: db-2
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-08
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (기존 `vitest.config.ts`, 변경 없음) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/seed-region.test.ts src/__tests__/school-ranking-regional.test.ts src/lib/data/complex-matching.test.ts` |
| **Full suite command** | `npm run test` |
| **Lint/typecheck** | `npm run lint` (ESLint + tsc) |

---

## Sampling Rate

- **After every task commit:** 해당 태스크 관련 유닛/통합 테스트 (regions → `seed-region.test.ts`, dup-check → `complex-matching.test.ts`, school → `school-ranking-regional.test.ts`)
- **After every plan wave:** `npm run test`(전체 Vitest) + `npm run lint`(tsc 포함)
- **Before `/gsd-verify-work`:** 전체 스위트 green + 부산 1개 구 샘플 백필 성공 + DB 용량 체크포인트 통과
- **Max feedback latency:** 수 분 이내 (기존 CI 러너 기준)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-00-03 | 00 | 0 | REGION-12 | T-34-01/02 | 부산 16개 sgg_code가 regions에 존재(is_active=true, gu non-null 16건, count>=38) | integration | `npx vitest run src/__tests__/seed-region.test.ts` | ✅ 기존 파일, 부산 assertion 추가 | ⬜ |
| 34-01-01 | 01 | 1 | REGION-13 | T-34-03/04 | 하드코딩 지역 배열 3-pass 재스윕 + 동적 전환, admin 대시보드 부산 추적 | static+lint | `npm run lint` + grep 재스윕 | ✅ 기존 파일 수정 | ⬜ |
| 34-02-01 | 02 | 1 | REGION-14 | T-34-05/06 | 부산 16개 구 라벨 추가, prediction-commentary 동적 allowlist 유지 | lint | `npm run lint` + grep 26350 | ✅ 기존 파일 수정 | ⬜ |
| 34-03-01 | 03 | 1 | REGION-15 | T-34-07 | dup-detection RPC 라이브 적용(BLOCKING, 시딩 전) | integration | `select find_nearby_similar_complexes(...)` 에러 없음 | ❌ W1 신규 마이그레이션 | ⬜ |
| 34-03-02 | 03 | 1 | REGION-15 | T-34-07/08 | detectPotentialDuplicate log-only, coord null 시 스킵, error 시 빈 배열 | unit | `npx vitest run src/lib/data/complex-matching.test.ts` | ❌ W1 신규 테스트 | ⬜ |
| 34-04-01 | 04 | 1 | REGION-18 | T-34-10 | school_ranking RPC `p_si='부산광역시'` 에러 없음 + 모든 행 gu=null | integration | `npx vitest run src/__tests__/school-ranking-regional.test.ts` | ✅ 기존 파일, 부산 케이스 추가 | ⬜ |
| 34-05-02 | 05 | 2 | REGION-16 | T-34-11 | complexes-map BBOX 부산 실측 범위 포함(과확장 금지) | lint | `npm run lint` + grep 129.4 | ✅ 기존 파일 수정 | ⬜ |
| 34-06-01 | 06 | 2 | REGION-17 | T-34-13/14 | 백필 각 배치마다 DB 용량 체크(450MB 경고, 500MB 초과 방지) | ops (checkpoint) | `gh run list` + `pg_database_size` SQL | ✅ 기존 워크플로 재사용 | ⬜ |
| 34-07-01 | 07 | 3 | REGION-19 | T-34-15/16 | enrichment 스크립트 1,000행 캡 방어, 처리 건수 예상치 대조 | static+ops | `grep -c "\.range(" scripts/collect-facility-edu.ts` | ✅/❌ 확인·보강 | ⬜ |
| 34-08-01 | 08 | 3 | REGION-20 | T-34-17/18 | OLD_ZONE_NAMES 21개 갱신, 부산 BBOX, --check-cookie 값 로그 금지 | lint+ops | `npm run lint` + `--check-cookie` 스모크런 | ✅ 기존 파일 수정 | ⬜ |
| 34-09-01 | 09 | 3 | REGION-22 | T-34-19 | DB 용량 실측 + Pro 전환 명시적 결정 | ops (checkpoint) | `pg_database_size`/`pg_total_relation_size` SQL | ✅ 읽기 전용 | ⬜ |
| 34-10-02 | 10 | 4 | REGION-21 | T-34-20/21/22 | self-hosted runner workflow_dispatch 전용(pull_request 트리거 0), --ephemeral, PoC 후 정리 | ops (checkpoint) | `grep -c "pull_request" .github/workflows/map-naver-self-hosted.yml` == 0 | ❌ W4 신규 워크플로 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 / 신규 테스트 Gaps

- [ ] `src/__tests__/seed-region.test.ts` — 부산 16개 구 assertion 추가 (count>=38, gu non-null) — **34-00**
- [ ] `src/lib/data/complex-matching.test.ts` — detectPotentialDuplicate 신규 유닛 테스트 (신규 파일) — **34-03**
- [ ] `supabase/migrations/20260708000001_find_nearby_similar_complexes.sql` — dup-detection RPC 신규 마이그레이션 [BLOCKING, 시딩 전 적용] — **34-03**
- [ ] `src/__tests__/school-ranking-regional.test.ts` — `p_si='부산광역시'` 케이스 추가 — **34-04**

*(nyquist_validation 기본 활성화 — 모든 auto 태스크에 `<automated>` verify 존재, checkpoint 태스크는 ops 검증)*

---

## Manual-Only / Checkpoint Verifications

| Behavior | Plan | Why Manual | Test Instructions |
|----------|------|------------|--------------------|
| 부산 국토부 실거래가 10년 백필 (다일 소요) | 34-06 | API 일 10,000회 한도로 다일 실물 시간 경과 필요 | workflow_dispatch 트리거 → ingest_runs status='success' 확인 → 각 배치마다 pg_database_size 체크(450MB 경고) |
| NAVER 매핑 --diagnose + 실제 매핑 | 34-08/34-10 | Playwright 실브라우저 + 실제 네이버 세션 쿠키, CI IP 차단 확인됨 | `--check-cookie` → `--dry-run --new-only --diagnose` → `--new-only` 실제 매핑, restart-loop 폴백 |
| self-hosted runner PoC | 34-10 | 인프라 설정, 자동 pass/fail 기준 없음(시간박스) | 러너 등록(--ephemeral) → workflow_dispatch → 장시간 무중단 완주 성공 기준, 실패 시 restart-loop 폴백 + 러너 정리 |
| Supabase DB 용량 + Pro 전환 결정 | 34-06/34-09 | 실측값은 시점 의존, 자동 assert 없음 | pg_database_size 조회 → 임계값 비교 → 사용자 Pro 전환 결정 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or checkpoint ops verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 / 신규 테스트 gaps 식별됨 (seed-region, complex-matching, school-ranking, dup-RPC 마이그레이션)
- [x] No watch-mode flags
- [x] Feedback latency < 수 분
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
