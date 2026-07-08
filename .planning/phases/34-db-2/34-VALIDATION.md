---
phase: 34
slug: db-2
status: draft
nyquist_compliant: false
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
| **Quick run command** | `npx vitest run src/__tests__/seed-region.test.ts src/__tests__/school-ranking-regional.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~ (기존 Vitest 스위트 실측치 참고, 이번 phase에서 크게 증가하지 않음) |

---

## Sampling Rate

- **After every task commit:** 해당 태스크 관련 유닛/통합 테스트 (예: regions 관련 → `seed-region.test.ts`)
- **After every plan wave:** `npm run test`(전체 Vitest) + `npm run lint`(tsc 포함)
- **Before `/gsd-verify-work`:** 전체 스위트 green + 부산 1개 구 샘플 백필 성공 확인 + DB 용량 체크포인트 통과
- **Max feedback latency:** 기존 CI 러너 기준과 동일 (수 분 이내)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-00-01 | 00 | 0 | REGION-12 | — | 부산 16개 sgg_code가 regions에 존재(is_active=true, gu 값 있음) | integration | `npx vitest run src/__tests__/seed-region.test.ts` | ✅ 기존 `count >= 22` 방어적 검증 유지, 부산 전용 assertion(38개, gu not null 16건) 추가 |
| 34-0x-01 | TBD | 1 | REGION-14 | — | KAPT 시딩 시 중복 탐지 로그(log-only)가 병합 없이 기록됨 | unit | `npx vitest run src/lib/data/complex-matching.test.ts` | ❌ W0 — 신규 함수·신규 테스트 작성 필요 |
| 34-0x-02 | TBD | 1 | REGION-18 | T-34-01 | `school_ranking` RPC가 `p_si='부산광역시'`에 에러 없이 응답, 모든 행 `gu=null` | integration | `npx vitest run src/__tests__/school-ranking-regional.test.ts` | ✅ 파일 존재, 부산 케이스만 추가 |
| 34-0x-03 | TBD | 2 | REGION-16 | — | 신규 sgg_code로 백필 시 `ingest_runs.status='success'` + `rowsUpserted>0` | integration (기존 패턴 재사용) | GitHub Actions workflow_dispatch 실행 + SQL 확인 | ✅ 기존 워크플로 재사용, 코드 테스트 불필요(운영 검증) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — Task ID는 planner가 실제 plan 파일 생성 시 확정*

---

## Wave 0 Requirements

- [ ] `src/__tests__/seed-region.test.ts` — 부산 16개 구 전용 assertion 추가 (기존 `count >= 22` 로직은 유지, 부산 케이스만 보강)
- [ ] `src/__tests__/school-ranking-regional.test.ts` — `p_si='부산광역시'` 케이스 추가 (REGION-18)
- [ ] KAPT 시딩 중복 탐지 신규 RPC(`find_nearby_similar_complexes`) + 대응 유닛 테스트 — 마이그레이션 + 테스트 둘 다 신규 작성

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| 네이버 매핑 크롤러 부산 BBOX 실제 매핑 성공 | REGION-2x (네이버) | Playwright 실제 브라우저 크롤링 + 실제 네이버 세션 쿠키 필요, CI에서 자동화 불가(GitHub Actions IP 차단 확인됨) | 로컬에서 `--diagnose` 1회 실행 후 결과 검토 → `--new-only` 실제 매핑 실행 → DB `naver_complex_no is not null` 카운트 증가 확인 |
| Self-hosted runner PoC (로컬 프로세스 불안정 근본 원인 재조사) | REGION-2x (네이버) | 인프라 설정 작업, 자동화된 pass/fail 기준 없음 | 러너 등록 → workflow_dispatch로 소규모 매핑 실행 → 성공/실패 여부 수동 확인, 시간 내 미해결 시 restart-loop 폴백 |
| Supabase DB 용량 체크포인트 | REGION-08 계열 (33-08 패턴 반복) | 실측값은 시점에 따라 달라짐, 자동화된 assert 없음 | 백필 중간중간 `pg_database_size` 조회, 450MB 도달 시 사용자에게 즉시 보고 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 수 분
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
