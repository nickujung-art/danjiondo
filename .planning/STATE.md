---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: milestone
status: in_progress
last_updated: "2026-06-25T16:25:00Z"
last_activity: 2026-06-25 — Phase 31 Plan 02 완료: github-actions.ts + card-templates.ts + data/generate-html/ai-text API 3개 (BILD-01~03)
progress:
  total_phases: 26
  completed_phases: 24
  total_plans: 69
  completed_plans: 68
  percent: 99
---

# Project State — 단지온도

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** 창원·김해 실수요자가 "이 단지 사도 되는지" 데이터와 이웃 의견으로 30분 안에 결정 짓게 한다.
**Current focus:** Phase 24 완료 — 단지별 AI 코멘트 배치 구현. 다음 phase 미기획.

## Current Phase

**Phase 24: 단지별 AI 코멘트 배치** ✅ Complete

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
| 12 | 지도 마커·클러스터 개편 | 🔄 In Progress (3/4 plans complete) |
| 13 | 신축·분양·재건축 대시보드 | ✅ Complete |

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

---
*Initialized: 2026-05-06*
