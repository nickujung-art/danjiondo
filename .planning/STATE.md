---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: milestone
status: Phase 38 In Progress (1/2 plans — Wave 0 완료)
last_updated: "2026-07-31T00:00:00.000Z"
progress:
  total_phases: 34
  completed_phases: 7
  total_plans: 52
  completed_plans: 46
  percent: 21
---

# Project State — 단지온도

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** 창원·김해 실수요자가 "이 단지 사도 되는지" 데이터와 이웃 의견으로 30분 안에 결정 짓게 한다.
**Current focus:** Phase 38 🔄 진행 중 (1/2 plans) — Wave 0 ✅ 완료 (2026-07-31). 🔴 **보안 수정 HARD-01 완료**: `ad_images_service_write` 정책에 역할 검사가 없어 anon 키 보유자가 `ad-images` 버킷(`public=true`)에 임의 파일을 업로드할 수 있던 취약점을 닫았다. 수정 전 `--expect=allow` 실측에서 **anon 업로드 성공**(취약점 실증) → 수정 후 `--expect=deny`에서 **403 RLS 거부**로 뒤집힘 확인. positive control 2건(공개 읽기·service_role 업로드) 양쪽 실행 모두 통과 — 어드민 업로드(`uploadAdImage()`) 회귀 없음. `npm run db:push` 정상 경로 적용(Phase 37 복구 실증 첫 사례), 원장 0/0 유지.

> ⚠️ **Wave 1 남은 작업** — HARD-02(`hagwon_db.blog_*` ADD COLUMN DDL 복원 + `db reset` 실측), HARD-03(`recommend_hagwons` 구버전 오버로드 DROP), HARD-04(`CLAUDE.md`에 신규 RLS `TO` 절 + `CREATE INDEX CONCURRENTLY` repair 규약 추가).
> 🔴 Wave 0 시점에 **Docker Desktop이 실행 중이 아니었다** — `supabase db reset` 실측은 Wave 1에서 별도 확인이 필요하며, 실행 불가 시 "통과"가 아니라 **미검증으로 명시**해야 한다(Phase 37이 이 실수로 `gaps_found`).

## Current Phase

**Phase 33: 전국 DB 확장 1단계 — 경남 전체 지역 확장 기반 구축** 🔄 In Progress

Goal: `regions` 테이블에 경남 전체 시군구를 시딩하고, 하드코딩된 지역 필터를 regions 테이블 기반 동적 조회로 전환하며, 경남 나머지 시군구에 대한 국토부 실거래가·K-apt 백필을 실행한 뒤 실측 DB 용량 기반으로 Supabase Pro 플랜 전환 여부를 결정한다.

Requirements: REGION-01~11

Plans: 10/11 complete (33-00~33-07, 33-09, 33-10 done) — Wave 0·1 완료 2026-07-03, Wave 2(33-07 국토부 백필: 4,080/4,080 combo, 249,574건) 완료 2026-07-08. 남은: 33-08(Wave 3, Supabase 용량 결정 체크포인트 — 진행 중)

Wave 1 결과 하이라이트: regions 22행 시딩, complexes 788개 신규(2,031→2,822), KAPT enrich 99.5%, kapt.ts/regions.ts의 `server-only` import 버그 2건 발견·수정(스크립트 6개+CI 워크플로 2개 차단 해소), prediction-commentary route의 ALLOWED_SGG 하드코딩 추가 발견·수정

Waves:

- Wave 0: 33-00 (regions 22개 시군구 시딩 + 법정동코드 단발 검증 + getActiveSggCodes/getActiveCityNames 공용 헬퍼) ✅
- Wave 1 (blocked on Wave 0, 병렬 실행 가능): 33-01~33-06, 33-09, 33-10 — 하드코딩 지역 필터 8곳 동적 전환
- Wave 2 (blocked on 33-06): 33-07 국토부 실거래가 다회 분할 백필 `[CHECKPOINT]`
- Wave 3 (blocked on Wave 2): 33-08 Supabase DB 용량 실측 + Pro 플랜 결정 `[CHECKPOINT]`

---

**Phase 32: 카드뉴스 어드민 관리 대시보드** ✅ Complete (2026-06-26)

**Phase 31: 어드민 카드뉴스 빌더** ✅ Complete (2026-06-25)

Goal: complex_price_predictions.ai_commentary 월간 Gemini 배치 + 투자 랭킹 카드 코멘트 표시

Plans: 5/5 complete (24-01~24-05) — 2026-06-11

---

**Phase 23: SEO URL 구조 최적화** ✅ Complete

Goal: 한글 디렉토리 URL + 계층별 페이지 + BreadcrumbList + 사이트맵·RSS — 네이버 검색 노출 최대화

Requirements: SEO-01~06

Plans: 4/4 complete (23-00, 23-01, 23-02, 23-03 done) — 2026-06-10

---

**Phase 21: 투자 분석 통합 페이지** ✅ Complete

Goal: 실거래 2년 시세 흐름 차트 + 갭투자 랭킹을 /invest 페이지로 통합

Requirements: INVEST-01~04

Plans: 4/4 complete (21-00 ~ 21-03) — verified 2026-05-29

Waves:

- Wave 1: 21-00 (DB RPC 마이그레이션 + 301 redirect), 21-01 (데이터 레이어 + 차트 컴포넌트) ✅
- Wave 2: 21-02 (/invest RSC 페이지), 21-03 (단지 상세 시세 차트 섹션) ✅

---

**Phase 5: 데이터 확장·운영 안정성** ✅ Complete

Goal: 단지 데이터 깊이 확장 (재건축·가성비·갭) + 운영 백업 자동화로 V1.5 완성

Requirements: DATA-03~05, OPS-01

Plans: 5/5 complete (05-00 ~ 05-04) — verified 2026-05-08

---

**Phase 6: AI·차별화 기술** ✅ Complete

Goal: Claude API RAG 봇 + SGIS 통계 + 광고 고도화 + GPS L2/L3 인증

Requirements: DIFF-03, DATA-06~07, AD-01~02, AUTH-01

Plans: 5/5 complete (06-00 ~ 06-04) — verified 2026-05-14

Waves:

- Wave 0: 06-00 (DB 마이그레이션 + @anthropic-ai/sdk + env vars) ✅
- Wave 1: 06-01 (ratelimit·events·ROI·SGIS·갭 라벨), 06-02 (RAG chat·카피 검토·배치 스크립트) ✅
- Wave 2: 06-03 (GapLabel·DistrictStatsCard·AiChatPanel·AdRoiTable·AdCopyReviewer UI) ✅
- Wave 3: 06-04 (GPS L2/L3 인증·어드민 승인 UI·Phase 6 E2E 테스트) ✅

---

**Phase 7: 데이터 파이프라인 수리** ✅ Complete

Goal: KAPT 단지정보 적재 + transactions↔complexes 연결 + ingestMonth 수정 — 서비스 데이터 기반 완성

Requirements: DATA-08~10

Plans: 3/3 complete (07-01 ~ 07-03) — verified 2026-05-11

---

**Phase 8: 커뮤니티 심화·자동화** ✅ Complete

Goal: 게이미피케이션 + 카페 NLP 연동 + 카카오톡 채널 + 비교 모드 + 카페 자동 발행. V2.0 완성.

Requirements: DIFF-01~02, DIFF-04~06, OPS-02

Plans: 7/7 complete (08-00 ~ 08-06) — completed 2026-05-13

Waves:

- Wave 0: 08-00 (DB 마이그레이션) ✅
- Wave 1: 08-01 (TierBadge), 08-03 (비교 모드) ✅
- Wave 2: 08-02 (알림 우선순위), 08-04 (Naver 카페 NLP), 08-05 (카카오 채널 구독) ✅
- Wave 3: 08-06 (어드민 복사 버튼) ✅

## Phase Progress

| # | Phase | Status |
|---|-------|--------|
| 1 | 보안·인프라·배포 | ✅ Complete |
| 2 | 랭킹·랜딩·공유 | ✅ Complete |
| 3 | 카드뉴스·법적·운영 | ✅ Complete (5/5 plans) |
| 4 | 커뮤니티 기초 | ✅ Complete |
| 5 | 데이터 확장·운영 안정성 | ✅ Complete |
| 6 | AI·차별화 기술 | ✅ Complete |
| 7 | 데이터 파이프라인 수리 | ✅ Complete |
| 8 | 커뮤니티 심화·자동화 | ✅ Complete (7/7 plans) |
| 9 | 단지 상세 UX 고도화 | ✅ Complete (5/5 plans) |
| 10 | 교육 환경 고도화 | ✅ Complete |
| 11 | 지도 고도화 | ✅ Complete (5/5 plans) |
| 12 | 지도 마커·클러스터 개편 | ✅ Complete (3/4 plans; 12-04 dropped — 통합 완료) |
| 13 | 신축·분양·재건축 대시보드 | ✅ Complete |
| 14 | 지도 줌 중간 레벨 (동 클러스터) | ✅ Complete |
| 15 | 커뮤니티 & 게이미피케이션 | ✅ Complete |
| 16 | 광고 플랫폼 MVP | ✅ Complete |
| 17 | 광고 게재 확장 | ✅ Complete |
| 18 | 공인중개사 추천 섹션 | ✅ Complete |
| 19 | 어드민 UI/UX 전면 개선 | ✅ Complete |
| 20 | 갭투자 분석 | ✅ Complete |
| 21 | 투자 분석 통합 페이지 | ✅ Complete |
| 22 | AI 가격 예측 | ✅ Complete |
| 23 | SEO URL 구조 최적화 | ✅ Complete |
| 24 | 단지별 AI 코멘트 배치 | ✅ Complete |
| 25 | 네이버 매물 크롤링 (호가·area_type) | ✅ Complete |
| 26 | Cron 개편 | ✅ Complete |
| 27 | 랭킹 페이지 + 평형 정규화 | ✅ Complete |
| 28 | 학원 추천 시스템 | ✅ Complete |
| 29 | 모바일 최적화 | ✅ Complete (하단탭바 + invest 모바일카드 + 전체 중복헤더 제거) |
| 30 | 인스타 카드뉴스 생성기 | ✅ Complete |
| 31 | 어드민 카드뉴스 빌더 | ✅ Complete |
| 32 | 카드뉴스 어드민 대시보드 | ✅ Complete |
| 33 | 전국 DB 확장 1단계 — 경남 전체 지역 확장 기반 구축 | 🔄 In Progress (10/11 plans — 33-08 용량 결정 체크포인트만 남음) |
| 34 | 전국 DB 확장 2단계 — 부산광역시 지역 확장 기반 구축 | 📋 Planned (0/11 plans executed, 계획 완료·검증 통과) |
| 36 | 창부레터 DB 기반 구축 — 공유 Supabase 콘텐츠 스키마 | ✅ Complete (3/3 plans — CHECK 확장 + 테이블 5개 + RLS 7정책, anon 실측 10항목 PASS) |
| 37 | 마이그레이션 원장·저장소 정합성 회복 | ✅ Complete (2/2 plans — local-only 0 / remote-only 0, `db push` 정상 복구) |
| 38 | 스토리지 정책 보안 수정 · db reset 복구 · 데드 오버로드 정리 | 🔄 In Progress (1/2 plans — Wave 0 완료: HARD-01 anon 업로드 차단 실측 대조 5/5 PASS. Wave 1 대기, Docker 미실행으로 `db reset` 미검증) |

---

**Phase 9: 단지 상세 UX 고도화** ✅ Complete

Goal: 실거래가 그래프·시설 정보·관리비 섹션을 실수요자 관점으로 재설계

Requirements: UX-01~04

Plans: 5/5 complete (09-00 ~ 09-04) — UAT complete 2026-05-14

Waves:

- Wave 0: 09-00 (DB 마이그레이션 — management_cost_kapt, facility_kapt 스키마) ✅
- Wave 1: 09-01 (IQR 이상치 필터·기간 필터·평형 칩 URL 상태 — nuqs shallow), 09-02 (ManagementCostCard 3-column) ✅
- Wave 2: 09-03 (FacilitiesCard 세대당/동당 표시), 09-04 (K-apt building_count 적재 — 669개) ✅

Key fixes (UAT): nuqs shallow:true, Recharts Scatter dataKey, building_count 667/669 DB 적재

---

**Phase 11: 지도 고도화** ✅ Complete

Goal: 클러스터 줌인 + SVG 배지 마커 + 평당가 라벨 + 사이드 패널 + view_count 파이프라인으로 지도를 게임화된 인터랙티브 지도로 전환

Requirements: MAP-01~MAP-05

Plans: 5/5 complete (11-00 ~ 11-04) — verified 2026-05-16

Waves:

- Wave 0: 11-00 (DB 마이그레이션 — avg_sale_per_pyeong/view_count/price_change_30d/tx_count_30d + RPC 2개) ✅
- Wave 1: 11-01 (ComplexMapItem 확장 + badge-logic.ts), 11-02 (map-panel API Route) ✅
- Wave 2: 11-03 (BadgeMarker SVG + ComplexMarker CustomOverlayMap + ClusterMarker 줌인 + KakaoMap 통합) ✅
- Wave 3: 11-04 (MapSidePanel 슬라이드인/바텀시트 + ViewCountTracker + daily cron 연결) ✅

**Phase 13: 신축·분양·재건축 대시보드** ✅ Complete

Goal: 청약홈 API 연동으로 분양 공고를 자동 수집하고, 3-tier 우선순위 대시보드 구현

Requirements: PRESALE-01~03, REDV-01

Plans: 4/4 complete (13-01 ~ 13-04) — verified 2026-05-20

Waves:

- Wave 0: 13-01 (DB 마이그레이션 12컬럼 + partial unique index + types/normalize + 9개 test) ✅
- Wave 1: 13-02 (cheongyak/client.ts + daily cron 통합 + 6개 test), 13-03 (setComplexRedevelopmentStatus + admin UI + 7개 test) ✅
- Wave 2: 13-04 (presale.ts 3-tier 쿼리 + PresaleCard 리팩터 + RedevelopmentCard/NewBuildCard + /presale 재설계 + 랜딩 배지 + 9개 test) ✅

Key notes: MOLIT_API_KEY (기존 data.go.kr 키) 재사용. B552555 청약홈 서비스 활성화 후 실데이터 수집 시작. SUPABASE_SERVICE_ROLE_KEY JWT 키로 교체 완료.

---

## Key Context for Agents

- **Brownfield**: V0.9 MVP 완성 (로컬). 인증은 Supabase Auth (`@supabase/ssr`) — NextAuth 없음
- **보안 우선**: CONCERNS.md에 Critical 3건 문서화 — Phase 1에서 전부 수정
- **Vercel Hobby 한도**: 1일 cron 1회. 5분 알림 워커는 GitHub Actions `.github/workflows/notify-worker.yml`
- **Golden Record**: `complexes` 테이블. 이름 단독 매칭 금지 — 항상 좌표+이름 복합
- **거래 쿼리**: `WHERE cancel_date IS NULL AND superseded_by IS NULL` 항상 포함
- **광고 쿼리**: `now() BETWEEN starts_at AND ends_at AND status='approved'` 항상 포함
- **서비스 롤**: `createSupabaseAdminClient()` 단일 경유 — SEC-02 완료 후

## Decisions Log

| Date | Decision | Phase |
|------|----------|-------|
| 2026-05-06 | Supabase Auth 유지 (NextAuth 전환 안 함) | Init |
| 2026-05-06 | 카드뉴스 파이프라인 V1.0 포함 | Init |
| 2026-05-06 | 비교 모드·주간 다이제스트·DB 백업을 V1.5로 defer | Init |
| 2026-05-07 | JSX extracted from route.ts to CardnewsLayout.tsx for Vitest/esbuild compat | 03-03 |
| 2026-05-07 | cardnews.test.ts mocks @/lib/supabase/server (same pattern as consent-actions) | 03-03 |
| 2026-05-07 | visible h1 in SidePanel (not sr-only) — Playwright toBeVisible() requires non-zero bounding box | 03-05 |
| 2026-05-07 | global-setup warn-not-throw on Supabase unavailability — enables a11y tests without DB | 03-05 |
| 2026-05-07 | map page .catch(()=>[]) for Supabase errors — 200 with empty state vs 500 | 03-05 |
| 2026-05-07 | MOLIT 백필 workflow_dispatch 전용 (schedule 없음) — 1회성이므로 자동 실행 불필요 | 05-00 |
| 2026-05-07 | timeout-minutes: 300 — API 한도(일 10,000회)로 창원+김해 전체 3일 분할 실행 최대 5시간 | 05-00 |
| 2026-05-07 | MOLIT 백필 실행은 Wave 1과 병행하여 별도로 진행 — 05-00 COMPLETE, Wave 1 블로킹 해제 | 05-00 |

| 2026-05-15 | badge-logic 10종 → 4종(pre_sale/new_build/hot/none) 단순화 — crown=hot 통합, surge/drop/school 제거 | 12-01 |
| 2026-05-15 | getPriceColor를 badge-logic에서 분리 → BadgeMarker/ComplexMarker 로컬 함수로 이관 | 12-01 |
| 2026-05-15 | avgSalePerPyeong 제거 — recentPrice(최근 실거래)로 대체, hover 툴팁에서 직접 사용 | 12-03 |
| 2026-05-15 | KakaoMap 줌 레벨 3단계 정책: level≥10 마커 숨김 / level7-9 가격만 / level≤6 이름+가격 | 12-03 |
| 2026-05-15 | DongClusterChip 구 이름 추출: 첫 번째 leave의 gu 우선 → dong → '기타' (다수결 불필요) | 12-02 |
| 2026-05-20 | 청약홈 API 응답 필드명 camelCase 확정 (RESEARCH A1 폐기) — CONTEXT.md 명세 + data.go.kr 표준 패턴 | 13-01 |
| 2026-05-20 | competition_rate는 normalizeCheongyakItem 미포함 — API 2 별도 호출로 Wave 1에서 UPDATE | 13-01 |
| 2026-05-20 | 경쟁률 집계 MAX 확정 — 단일 numeric 컬럼, 카드 "최고 경쟁률 X:1" 표시 목적 | 13-02 |
| 2026-05-20 | withRetry mock 패스스루 — res.ok=false throw 시 재시도 루프 방지를 위해 vi.mock 적용 | 13-02 |
| 2026-05-20 | setComplexRedevelopmentStatus와 upsertRedevelopmentProject 분리 — 각각 complexes vs redevelopment_projects 담당 | 13-03 |
| 2026-05-20 | complexes.status enum 전환 범위를 active|in_redevelopment로 제한 — 다른 상태는 별도 마이그레이션·UI | 13-03 |
| 2026-05-26 | app-level is_active filter over PostgREST foreign table filter — unreliable in current Supabase version | 18-01 |
| 2026-05-26 | assignRealtorToComplex uses upsert onConflict to handle UNIQUE(complex_id, display_order) without error | 18-01 |
| 2026-05-28 | getGapRankings uses ALLOWED_SGG_CODES/RISK_LEVELS allowlists before .eq() — prevents injection via URL params | 20-03 |
| 2026-05-28 | /gap-analysis filter tabs are Link hrefs (not form selects) — no JS required, fully URL-driven | 20-03 |
| 2026-06-09 | 한글 URL — si/gu/dong/canonical_name 그대로 (로마자 변환 없음) — 네이버 키워드 매칭 보존 | 23-00 |
| 2026-06-09 | 창원 4단계/김해 3단계 catch-all 라우트 (D-02) — 김해 구 없음, 유지보수 단순 | 23-00 |
| 2026-06-09 | url_slug 사전 계산 (D-08) — 런타임 slug 생성 방지, backfill 스크립트로 신규 단지 대응 | 23-00 |
| 2026-06-09 | si/dong=NULL인 ~143개 단지 url_slug=NULL 유지 (D-09) — 기존 UUID URL 그대로 | 23-00 |
| 2026-06-09 | buildUrlSlug server-only 없음 — scripts/backfill-url-slugs.ts에서도 직접 import 가능 | 23-01 |
| 2026-06-09 | getSiPageData hasGu 분기로 창원/김해 자동 감지, getComplexBySlug empty guard (Pitfall 6 방어) | 23-01 |
| 2026-06-10 | scripts/ tsconfig exclude — 독립 Node.js 스크립트는 Next.js 빌드에서 제외 (TS2393 해결) | 23-02 |
| 2026-06-10 | noUncheckedIndexedAccess slug dispatch: s0/s1/s2 ?? '' fallback 변수 패턴 | 23-02 |
| 2026-06-10 | encodeSlug를 src/lib/data/sitemap.ts에서 export — sitemap.ts와 테스트 양쪽에서 재사용 | 23-03 |
| 2026-06-10 | sitemap.ts force-dynamic 제거 — revalidate=86400 ISR만 사용 (RESEARCH Pattern 4) | 23-03 |
| 2026-06-11 | get_complex_commentary_batch_inputs: 3일 신선도 윈도우(invest_prediction_ranking과 동일 패턴) | 24-01 |
| 2026-06-11 | price_change_30d SQL에서 ×100 변환 — 스크립트에서 % 표시 가능하게 반환 | 24-01 |
| 2026-06-11 | buildComplexPrompt module-level export + isMain guard — 테스트 import 시 사이드이펙트 없음 | 24-02 |
| 2026-06-25 | getDateRange: toISOString(UTC) 대신 getFullYear/getMonth/getDate 로컬 시간 기반 포맷 (UTC+9 시차 해결) | 31-01 |
| 2026-06-25 | filterOutliers: 집계 기간 외 12개월 전체 평균 별도 쿼리로 Pitfall-6 해결 | 31-01 |
| 2026-06-25 | BrandLockupPreview: /logo-cardnews.png 상대 경로 — 브라우저 iframe file:// 차단 해결 | 31-01 |
| 2026-06-25 | weekly-generate.yml git 추적 등록 — 로컬에 존재했으나 미추적 상태, PITFALL-1 완전 해결 | 31-01 |
| 2026-06-25 | DealTypeEnum('sale'|'jeonse'|'monthly') 타입 alias 정의 — Supabase 컬럼 유니온 타입과 매칭 (TS strict) | 31-02 |
| 2026-06-25 | AiTextResult 인터페이스 명시적 정의 — FALLBACK const null 추론 타입 좁힘 문제 해결 | 31-02 |
| 2026-06-25 | Groq D-05 패턴: try/catch에서 fallback:true 반환 (500 throw 안 함) — 생성 API 안정성 | 31-02 |
| 2026-06-25 | getAdminGuard 헬퍼 함수 패턴: scheduler 3핸들러 공통 인증 로직 추출 — 중복 제거 | 31-03 |
| 2026-06-25 | artifact/route.ts run_id 없으면 getLatestWorkflowRun 자동 조회 — UX 편의성 | 31-03 |
| 2026-06-25 | CardNewsBuilderClient: 데이터 조회 직후 HTML 생성 자동 연계 — 추가 사용자 클릭 불필요 | 31-04 |
| 2026-06-25 | AdminSidebar: 카드뉴스 3개 항목 flat 추가 — buildNavItems 배열 통일성 유지 (들여쓰기/그룹 없음) | 31-04 |
| 2026-06-25 | DataQualityWarning: ranking.length > 0 조건 추가 — 데이터 조회 전 빈 배열에 "0건 미만" 경고 방지 | 31-04 |
| 2026-07-03 | regions 동적 조회 공용 헬퍼(getActiveSggCodes/getActiveCityNames)를 backfill-realprice.ts 기존 검증 패턴 그대로 이식 — Wave 1 8개 plan(33-01~33-06,33-09,33-10) 공용 계약 | 33-00 |
| 2026-07-03 | seed-region.test.ts count>=22 검증(정확히 =22 아님) — upsert 기반 시딩 특성상 향후 재확장(2단계 인접 광역시 등) 대비 | 33-00 |
| 2026-07-08 | Supabase Free tier DB 488MB/500MB 도달 확인 (transactions 271MB) — Pro 전환 대신 VACUUM FULL 우선 실행, transactions 271MB→202MB, DB 전체 488MB→420MB. Pro 전환은 보류, 재모니터링으로 대응 | 33-08 |
| 2026-07-08 | Phase 34(부산) 대상범위·Pro전환타이밍·네이버크롤러·중복행 4개 영역 논의 완료 — 부산 우선 단독 진행(울산 후속 phase), 33-08과 동일하게 백필후 실측 결정 반복(단 450MB 경고 태스크 추가), 네이버 매핑 이번 phase 포함(로컬 프로세스 불안정 근본원인 재조사, 실패시 restart-loop 폴백), 111쌍 중복행 병합은 defer(탐지로그만 추가) | 34-db-2 |
| 2026-07-08 | Phase 34 계획 완료 — 11 plans/5 waves. plan-checker 1차 검증에서 블로커 발견(34-03이 KAPT API에 없는 coordX/coordY로 dup-check를 시딩 루프에 배선 — TS2339 컴파일 에러 + null-guard로 인해 항상 0건 출력되는 논리 결함): 지오코딩 이후(34-05)로 실제 탐지 로직 이동, 34-03은 RPC+헬퍼만 남기는 것으로 수정 후 재검증 PASS(경고 2건은 직접 수정 — grep 대상 오류, 부산 미분양 defer 명시 누락) | 34-db-2 |
| 2026-07-30 | 마이그레이션 원장 drift로 `npm run db:push` 사용 불가 확인 → 적용 경로를 MCP `execute_sql`(단일 트랜잭션) + `npx supabase migration repair --status applied <파일과 같은 버전>` 조합으로 변경. MCP `apply_migration`은 자기 타임스탬프를 버전으로 기록해 drift를 만들므로 금지. 별건: 저장소에 파일이 없는 프로덕션 스키마 6건 발견(36-00-SUMMARY.md 참조) | 36-00, 36-01 |
| 2026-07-30 | 창부레터 콘텐츠 스키마 5개 테이블 + 인덱스 4개 프로덕션 적용 완료(D-03 DDL 전 항목 일치, `complexes` 4,285행 무영향). `src/types/database.ts` CLI 재생성 4,180→4,394행. **RLS는 미적용 상태(relrowsecurity=false 5건)로 36-02 즉시 후속 실행 필요** | 36-01 |
| 2026-07-30 | 신규 5개 테이블 RLS 정책 7개 적용 완료(전부 `TO` 절 명시 → `roles={public}` 0건, `subscribers` SELECT 정책 0건, `contents`에 `using (true)` 미사용). **테이블 레벨 `grant`/`revoke`는 쓰지 않았다**(plan-checker BLOCKER로 제거, 커밋 `ee62402`) — 이 프로젝트는 Supabase 기본 권한이 `anon`에 부여된 상태(`has_table_privilege('anon','subscribers','select')=true`)이므로 차단은 전적으로 RLS가 담당. 재도입 시 D-04 개정 + 창부레터 `ADR-003` 동기화 선행 필수(bds 단독 추가 금지 — 저장소 간 드리프트) | 36-02 |
| 2026-07-30 | RLS 검증은 `anon` 키 클라이언트 실측만이 증거라는 원칙 확립 — `scripts/verify-cbl-rls.ts`(admin/anon 클라이언트 분리 + positive control 3건 + `finally` cleanup). 10항목 전부 PASS. `TO` 절 누락 버그·권한 회수 없는 차단은 DDL·`has_table_privilege` 조회로는 판정 불가 | 36-02 |
| 2026-07-30 | 별건 발견: 프로덕션 `ad_events` 정책이 이미 `{authenticated}` + `with check (auth.uid() IS NOT NULL)`로 수정돼 있다(로컬 `20260430000009_rls.sql:151-153`은 여전히 `TO` 절 없는 버그 버전). 저장소에 없는 remote 전용 마이그레이션(`20260728074553 realtrade_story_ads_admin` 추정)이 적용한 것 — `36-00-SUMMARY.md`의 "저장소에 없는 프로덕션 스키마 6건" 후속에 포함. `db reset` 시 버그 버전으로 회귀 | 36-02 |
| 2026-07-10 | 부산 백필(34-06) 중 VACUUM FULL 효과 급감 확인(68MB→8MB→2MB 회수, 25% 진행 시점) — real data growth가 지배적 요인으로 판단. 사용자 확인 후 `complex_embeddings`(55MB, AI챗 fallback 전용·실사용 안 됨·5월 이후 stale) TRUNCATE로 45MB 즉시 회수, DB 448MB→403MB. Pro 전환은 계속 보류, 백필 재개 | 34-06 |
| 2026-07-30 | Wave 0 복원 5건을 `execute_sql` MCP 대신 `supabase db query --linked`(Management API, DB 비밀번호 불필요)로 조회 — D-07 재량 범위. baseline 11항목·원장 md5 전부 CONTEXT와 일치 확인, 스키마 변경 0건으로 5개 파일 복원 완료(커밋 `4e70a7e`). remote-only 18→13이 D-04 표와 완전 일치 — Wave 1(reverted 처리)이 안전하게 시작 가능 | 37-00 |
| 2026-07-31 | 🔴 **보안**: `ad_images_service_write`에 `auth.role() = 'service_role'` 추가 + `TO authenticated`로 역할 좁힘. 정책 DROP(등가 대안 b)이 아니라 조건 추가(a)를 채택 — `realtor_profiles_service_insert`·`cardnews-payloads service insert` 패턴과 일치하고 "여기는 서버만 쓴다"는 의도가 코드에 남는다. `ad-images` 버킷·정책 2개는 로컬 마이그레이션 기록이 아예 없었으므로 `20260731000003`이 최초 로컬 기록. `public=true`는 유지(공개 읽기는 의도) | 38-00 |
| 2026-07-31 | 스토리지 RLS도 테이블 RLS와 동일하게 **anon 키 실측만이 증거**라는 원칙 확장 적용 — `scripts/verify-ad-images-rls.ts`(admin/anon 분리 + `--expect=allow\|deny` 전후 대조 + positive control 2건 + `finally` cleanup + `zz-ad-verify-` 접두어). service_role은 `BYPASSRLS`라 그걸로 검증하면 전부 통과로 보인다. 최종 권한 구조: anon은 `TO authenticated` 미매칭으로 거부, 일반 authenticated는 `auth.role()`이 `'authenticated'`라 check 실패로 거부, service_role만 RLS 우회로 업로드 가능 | 38-00 |
| 2026-07-31 | `npm run db:push` 정상 경로 사용 — Phase 36의 `execute_sql`+`repair` 우회를 쓰지 않은 첫 사례로, Phase 37의 원장 복구가 실제로 유효함을 실증. `--dry-run`에 신규 파일 1건만 떴고 push 후 원장 0/0 유지 | 38-00 |

---

## Accumulated Context

### Roadmap Evolution

- Phase 33 added: 전국 DB 확장 1단계 — 경남 전체 지역 확장 기반 구축 (regions 테이블 시딩 + 하드코딩 지역 필터 9곳 제거 + 경남 나머지 시군구 백필 + Supabase 비용 검토). 재기획 회의로 프론트엔드 작업이 보류된 동안 백엔드/데이터 파이프라인 확장으로 진행.

---
*Initialized: 2026-05-06*
