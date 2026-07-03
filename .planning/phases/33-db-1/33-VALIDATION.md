---
phase: 33
slug: db-1
status: approved
nyquist_compliant: true
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
| 33-01-T1 | 33-01 | 1 | /invest 동적 필터 전환 | T-33-03 | mitigate — allowedSggCodes.includes(rawSgg) 유지 | unit + tsc | `npx tsc --noEmit --pretty false \| grep -i "invest"` | 확인 필요 | ⬜ pending |
| 33-01-T2 | 33-01 | 1 | /gap-analysis 동적 필터 전환 | T-33-04 | mitigate — 데이터 레이어 재검증(defense-in-depth) | unit + tsc | `npx tsc --noEmit --pretty false \| grep -i "gap-analysis"` | 확인 필요 | ⬜ pending |
| 33-01-T3 | 33-01 | 1 | `scripts/seed-kosis-population.ts` --sgg CLI 오버라이드 + regions 동적 기본값 (리비전 Gap 2) | T-33-14 | accept — service_role 전용 CLI, 사용자 입력 경로 없음 | integration (실행) | `npx dotenv-cli -e .env.local npx tsx scripts/seed-kosis-population.ts --sgg=48170,48250` | ✅ 존재 (기존 파일 수정) | ⬜ pending |
| 33-02-* | 33-02 | 1 | rankings.ts/rankings-page.ts 동적 필터 전환 | T-33-05 | accept — 사용자 입력 없는 서버 내부 필터 | unit | `npx vitest run src/lib/data/rankings.test.ts` | 확인 필요 | ⬜ pending |
| 33-03-* | 33-03 | 1 | cron/청약홈/분양권전매 동적 필터 전환 | T-33-06 | accept — cron 내부 전용, 사용자 입력 경로 없음 | integration | `npx vitest run src/services/cheongyak/client.test.ts` | 확인 필요 | ⬜ pending |
| 33-04-* | 33-04 | 1 | 학군 RPC·seo-hierarchy 무구 시군구 회귀 | T-33-07 | accept — 읽기 전용 RPC, 파라미터 바인딩 | unit | `npx vitest run src/lib/data/seo-hierarchy.test.ts` (신규 school-ranking-regional.test.ts 포함) | ❌ 신규 작성 | ⬜ pending |
| 33-05-* | 33-05 | 1 | UI SGG_LABEL 라벨 추가 (7개 파일) | T-33-08 | accept — 공개 정보(지역명) | manual | 스냅샷/시각 확인 — 신규 지역 이름이 라벨에 노출되는지 | manual-only | ⬜ pending |
| 33-06-* | 33-06 | 1 | KAPT 단지목록으로 complexes 경남 신규 시딩 | T-33-09 | accept — upsert, service_role 전용 | integration | `npm run db:seed:complexes -- --dry-run` (있다면) 또는 실행 로그 확인 | 확인 필요 | ⬜ pending |
| 33-09-T1 | 33-09 | 1 | `map/page.tsx` TARGET_SGG 동적 전환 (리비전 Gap 1) | T-33-13 | accept — 사용자 입력 경로 없음, 서버 컴포넌트 내부 | tsc | `npx tsc --noEmit --pretty false \| grep -i "app/map/page"` | 확인 필요 (기존 파일 수정) | ⬜ pending |
| 33-09-T2 | 33-09 | 1 | `ads/sidebar/route.ts` VALID_SGG_CODES 동적 전환 (리비전 Gap 1) | T-33-12 | mitigate — activeSggCodes.has(raw) 검증 유지 | tsc | `npx tsc --noEmit --pretty false \| grep -i "api/ads/sidebar"` | 확인 필요 (기존 파일 수정) | ⬜ pending |
| 33-10-T1 | 33-10 | 1 | `molit-unsold.ts` resolveSggCode CHANGWON_GU_MAP 동적 전환 (2차 리비전 Fix 1) | T-33-15 | accept — data.go.kr 공식 API 응답, 사용자 입력 아님 | unit | `npx vitest run src/services/molit-unsold.test.ts` | ❌ 신규 작성 (molit-unsold.test.ts) | ⬜ pending |
| 33-10-T2 | 33-10 | 1 | `realprice-officetel.ts` SGG_TO_ADDR 동적 전환 (2차 리비전 Fix 2) | T-33-16 | accept — service_role 전용 파이프라인, 공개 지역명 | tsc | `npx tsc --noEmit --pretty false \| grep -i "realprice-officetel"` | 확인 필요 (기존 파일 수정) | ⬜ pending |
| 33-07-* | 33-07 | 2 `[CHECKPOINT]` | 국토부 실거래가 10년 다회 분할 백필 | T-33-10 | mitigate — cron 시간대 회피 + --resume 재개 | manual | GitHub Actions workflow_dispatch 로그 + `ingest_runs` 테이블 조회 | manual-only (multi-day) | ⬜ pending |
| 33-08-* | 33-08 | 3 `[CHECKPOINT]` | Supabase 용량 실측 + Pro 플랜 결정 | T-33-11 | accept — 운영 메타데이터, service_role 전용 | manual | `SELECT pg_size_pretty(pg_database_size(current_database()))` 실행 후 사용자 확인 | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*참고: 이 phase는 백엔드/데이터 파이프라인 성격이라 Threat Ref/Secure Behavior 컬럼은 대부분 N/A~accept — 이번 phase에 인증·인가·PII 처리 변경 없음 (33-RESEARCH.md Security Domain 섹션 참고). 리비전(33-09, 33-01-T3, 33-10)에서 발견된 하드코딩 지점들도 동일하게 사용자 입력 경로가 제한적이어서 위험도 낮음.*

---

## Wave 0 Requirements

- [ ] `src/__tests__/seed-region.test.ts` — `TARGET_SGG_CODES` 6개 하드코딩을 "22개 존재" 또는 "6개 이상 존재"로 갱신 (기존 파일 수정)
- [ ] `src/lib/data/regions.test.ts` — 신규 `getActiveSggCodes`/`getActiveCityNames` 헬퍼 유닛 테스트 (신규 작성)
- [ ] 데이터 레이어 리팩터 대상 파일(`invest.ts`, `gap-analysis.ts`, `rankings.ts`, `rankings-page.ts`, `complexes-map.ts`는 해당 없음 — `map/page.tsx`/`ads/sidebar/route.ts`는 33-09에서 직접 처리)에 "동적 조회 함수가 regions 테이블 결과를 올바르게 반환하는지" 검증하는 유닛 테스트 — 기존 테스트 유무는 planner 리비전 단계에서 확정

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| 법정동코드 단발 검증 | 33-00 Task 2 | 국토부 실 API 응답은 CI에서 재현 어려움 (요청 한도 소모) | 신규 16개 sgg_code 각각에 대해 국토부 API 1회 호출, 200 응답 + 정상 페이로드 확인 |
| 국토부 실거래가 다회 분할 백필 | 33-07 `[CHECKPOINT]` | 며칠에 걸친 workflow_dispatch 수동 트리거, `autonomous: false` | GitHub Actions 실행 로그 + `ingest_runs` 테이블에서 신규 sgg_code 성공 건수 확인 |
| Supabase 용량 실측 + Pro 결정 | 33-08 `[CHECKPOINT]` | 사용자 비즈니스 결정 필요, 자동화 불가 | `pg_database_size` 쿼리 결과를 사용자에게 제시하고 Pro 전환 여부 확답 받기 |
| UI SGG_LABEL 신규 지역 노출 | 33-05 | 시각적 확인 필요 (라벨 텍스트 렌더링) | 브라우저에서 invest/gap-analysis/광고 폼 열어 신규 시군구 이름이 원시 코드 대신 표시되는지 확인 |
| `/map` 신규 지역 노출 | 33-09-T1 | 지도 마커 렌더링은 시각적 확인이 더 신뢰도 높음 | `/map`에서 신규 시군구 좌표로 이동 시 단지 마커가 표시되는지 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-03 — plan-checker 3차 검증에서 마지막 블로커(`scripts/backfill-officetel.ts` 하드코딩) 1건 발견, 오케스트레이터가 동일 패턴(getSggCodes) 적용해 직접 수정(33-10-PLAN.md addendum 참고). 나머지 3건(카드뉴스 자동화, 수동 유지보수 스크립트, lh/client.ts)은 informational로 CONTEXT.md에 문서화, 계획 변경 불필요. 11개 plan 최종 확정.
