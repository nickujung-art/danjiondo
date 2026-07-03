---
phase: 33
slug: db-1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (기존 `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/__tests__/seed-region.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30초 (quick) / 수 분 (full suite) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/__tests__/seed-region.test.ts` (regions 관련 태스크) 또는 해당 데이터 레이어 파일의 유닛 테스트
- **After every plan wave:** `npm run test` (전체 Vitest 스위트) + `npm run lint` (tsc 포함)
- **Before `/gsd-verify-work`:** 전체 스위트 green + 실제 GitHub Actions workflow_dispatch 1회 성공 확인 (신규 지역 1곳 샘플)
- **Max feedback latency:** 60초

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|--------------------|-------------|--------|
| 33-00-T1 | 33-00 | 0 | regions 경남 16개 시딩 | — | N/A | integration | `npx vitest run src/__tests__/seed-region.test.ts` | ✅ 존재 (수정 필요 — 6행 하드코딩 검증 중) | ⬜ pending |
| 33-00-T2 | 33-00 | 0 | 법정동코드 단발 검증 (MEDIUM confidence) | — | N/A | manual | 국토부 API 실호출 1회 (LAWD_CD별 응답 200 확인) | ❌ Wave 0 manual | ⬜ pending |
| 33-00-T3 | 33-00 | 0 | `getActiveSggCodes`/`getActiveCityNames` 공용 헬퍼 | — | N/A | unit | `npx vitest run src/lib/data/regions.test.ts` | ❌ Wave 0에서 신규 작성 필요 | ⬜ pending |
| 33-01-* | 33-01 | 1 | invest/gap-analysis 동적 필터 전환 | — | N/A | unit | `npx vitest run src/lib/data/invest.test.ts src/lib/data/gap-analysis.test.ts` | 확인 필요 (기존 테스트 유무 planner 단계 미확정) | ⬜ pending |
| 33-02-* | 33-02 | 1 | rankings.ts/rankings-page.ts 동적 필터 전환 | — | N/A | unit | `npx vitest run src/lib/data/rankings.test.ts` | 확인 필요 | ⬜ pending |
| 33-03-* | 33-03 | 1 | cron/청약홈/분양권전매 동적 필터 전환 | — | N/A | integration | `npx vitest run src/services/cheongyak/client.test.ts` | 확인 필요 | ⬜ pending |
| 33-04-* | 33-04 | 1 | 학군 RPC·seo-hierarchy 무구 시군구 회귀 | — | N/A | unit | `npx vitest run src/lib/data/seo-hierarchy.test.ts` (신규 school-ranking-regional.test.ts 포함) | ❌ 신규 작성 | ⬜ pending |
| 33-05-* | 33-05 | 1 | UI SGG_LABEL 라벨 추가 (7개 파일) | — | N/A | manual | 스냅샷/시각 확인 — 신규 지역 이름이 라벨에 노출되는지 | manual-only | ⬜ pending |
| 33-06-* | 33-06 | 1 | KAPT 단지목록으로 complexes 경남 신규 시딩 | — | N/A | integration | `npm run db:seed:complexes -- --dry-run` (있다면) 또는 실행 로그 확인 | 확인 필요 | ⬜ pending |
| 33-07-* | 33-07 | 2 `[CHECKPOINT]` | 국토부 실거래가 10년 다회 분할 백필 | — | N/A | manual | GitHub Actions workflow_dispatch 로그 + `ingest_runs` 테이블 조회 | manual-only (multi-day) | ⬜ pending |
| 33-08-* | 33-08 | 3 `[CHECKPOINT]` | Supabase 용량 실측 + Pro 플랜 결정 | — | N/A | manual | `SELECT pg_size_pretty(pg_database_size(current_database()))` 실행 후 사용자 확인 | manual-only | ⬜ pending |
| (신규, 리비전 예정) | 33-03 또는 33-09 | 1 | `map/page.tsx` TARGET_SGG, `ads/sidebar/route.ts` VALID_SGG_CODES 동적 전환 | — | N/A | integration + manual | `npx vitest run src/lib/data/complexes-map.test.ts` + `/map` 페이지 신규 지역 1곳 수동 확인 | ❌ Wave 0/1에서 신규 작성 필요 (plan-checker 지적 사항, 리비전 대상) | ⬜ pending |
| (신규, 리비전 예정) | 33-01 확장 또는 신규 | 1 | `scripts/seed-kosis-population.ts` 신규 sgg_code 대응 | — | N/A | manual | 스크립트 실행 로그에서 16개 신규 코드 population 값 확인 | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*참고: 이 phase는 백엔드/데이터 파이프라인 성격이라 Threat Ref/Secure Behavior 컬럼은 대부분 N/A — 이번 phase에 인증·인가·PII 처리 변경 없음 (33-RESEARCH.md Security Domain 섹션 참고).*

---

## Wave 0 Requirements

- [ ] `src/__tests__/seed-region.test.ts` — `TARGET_SGG_CODES` 6개 하드코딩을 "22개 존재" 또는 "6개 이상 존재"로 갱신 (기존 파일 수정)
- [ ] `src/lib/data/regions.test.ts` — 신규 `getActiveSggCodes`/`getActiveCityNames` 헬퍼 유닛 테스트 (신규 작성)
- [ ] 데이터 레이어 리팩터 대상 파일(`invest.ts`, `gap-analysis.ts`, `rankings.ts`, `rankings-page.ts`, `complexes-map.ts` — 리비전 후 추가)에 "동적 조회 함수가 regions 테이블 결과를 올바르게 반환하는지" 검증하는 유닛 테스트 — 기존 테스트 유무는 planner 리비전 단계에서 확정

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| 법정동코드 단발 검증 | 33-00 Task 2 | 국토부 실 API 응답은 CI에서 재현 어려움 (요청 한도 소모) | 신규 16개 sgg_code 각각에 대해 국토부 API 1회 호출, 200 응답 + 정상 페이로드 확인 |
| 국토부 실거래가 다회 분할 백필 | 33-07 `[CHECKPOINT]` | 며칠에 걸친 workflow_dispatch 수동 트리거, `autonomous: false` | GitHub Actions 실행 로그 + `ingest_runs` 테이블에서 신규 sgg_code 성공 건수 확인 |
| Supabase 용량 실측 + Pro 결정 | 33-08 `[CHECKPOINT]` | 사용자 비즈니스 결정 필요, 자동화 불가 | `pg_database_size` 쿼리 결과를 사용자에게 제시하고 Pro 전환 여부 확답 받기 |
| UI SGG_LABEL 신규 지역 노출 | 33-05 | 시각적 확인 필요 (라벨 텍스트 렌더링) | 브라우저에서 invest/gap-analysis/광고 폼 열어 신규 시군구 이름이 원시 코드 대신 표시되는지 확인 |
| `/map` 신규 지역 노출 (리비전 대상) | 신규 태스크 | 지도 마커 렌더링은 시각적 확인이 더 신뢰도 높음 | `/map`에서 신규 시군구 좌표로 이동 시 단지 마커가 표시되는지 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — plan-checker(1차) ISSUES FOUND 상태, 리비전 후 재검증 필요
