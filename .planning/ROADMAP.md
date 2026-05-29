# Roadmap — 단지온도

**21 phases** | **65+ requirements mapped** | v1~v7 requirements covered ✓

## Overview

| # | Phase | Version | Goal | Requirements | Status |
|---|-------|---------|------|--------------|--------|
| 1 | 보안·인프라·배포 | V1.0 | 프로덕션 배포 가능 상태 + 보안 기반 확립 | INFRA-01~03, SEC-01~04 | ✅ Complete |
| 2 | 랭킹·랜딩·공유 | V1.0 | 핵심 UX 완성 — 사용자가 처음 봐야 할 화면 | RANK-01~03, SHARE-01~02 | ✅ Complete |
| 3 | 카드뉴스·법적·운영 | V1.0 | V1.0 정식 출시 가능 상태 | SHARE-03~04, LEGAL-01~05, ADMIN-01~04, A11Y-01~03 | ✅ Complete (5/5 plans) |
| 4 | 커뮤니티 기초 | V1.5 | 참여·소통 기능 + 데이터 확장 | COMM-01~05, DATA-01~02, NOTIF-01~02 | ✅ Complete |
| 5 | 데이터 확장·운영 | V1.5 | V1.5 완성 — 데이터 깊이 + 운영 안정성 | DATA-03~05, OPS-01 | ✅ Complete |
| 6 | AI·차별화 기술 | V2.0 | 기술 차별화 — AI 봇 + 고도화 분석 | DIFF-03, DATA-06~07, AD-01~02, AUTH-01 | ✅ Complete (DATA-07 Phase 7 이월) |
| 7 | 데이터 파이프라인 수리 | V2.0 | 단지↔거래 연결 + KAPT 단지정보 적재 — 서비스 데이터 기반 완성 | DATA-08~10 | ✅ Complete |
| 8 | 커뮤니티 심화 | V2.0 | V2.0 완성 — 게이미피케이션 + 자동화 | DIFF-01~02, DIFF-04~06, OPS-02 | ✅ Complete (OPS-02 복사버튼으로 축소) |
| 9 | 단지 상세 UX 고도화 | V2.1 | 실거래가 그래프·시설·관리비 실수요자 관점 개선 | UX-01~04 | ✅ Complete |
| 10 | 교육 환경 고도화 | V2.2 | 학구도 기반 배정학교 + 교육 카드 UX 전면 개선 | EDU-01~05 | ✅ Complete |
| 11 | 지도 고도화 | V2.3 | 카카오맵 게임화 — 클러스터 줌인·평당가 라벨·사이드 패널·배지 마커 | MAP-01~05 | 🚫 Dropped |
| 12 | 지도 마커·클러스터 개편 | V2.4 | 로고 기반 집 모양 SVG 마커 + 동 단위 최고가 클러스터 칩 + hover 툴팁으로 지도 UX 호갱노노 수준 고도화 | MAP-06~09 | 🚫 Dropped |
| 13 | 신축·분양·재건축 대시보드 | V2.5 | 청약홈 API 연동 + 신축/분양/재건축 3-tier 우선순위 대시보드 구현 | PRESALE-01~03, REDV-01 | ✅ Complete |
| 14 | 지도 줌 중간 레벨 — 동 클러스터 | V2.5 | 구 클러스터→개별 마커 사이 동 단위 칩 중간 레벨 추가로 줌인 UX 개선 | MAP-10~12 | ✅ Complete |
| 15 | 커뮤니티 & 게이미피케이션 | V3.0 | 회원 등급 5단계 + 단지 비교 표 + Naver 카페 글 단지 연결 | DIFF-01, DIFF-02, DIFF-06 | ✅ Completed 2026-05-22 |
| 16 | 광고 플랫폼 MVP | V3.0 | 홈 배너 캐러셀 + 광고주 문의 페이지 + 어드민 캠페인 관리 | AD-03~05 | ✅ Completed 2026-05-27 |
| 17 | 광고 게재 확장 | V3.0 | map_popup 신규 placement + 지역 매칭 sidebar + SidePanel in_feed 렌더링 | AD-06~09 | ✅ Completed 2026-05-27 |
| 18 | 공인중개사 추천 섹션 | V3.1 | 단지 상세 공인중개사 카드 + 어드민 CRUD + 단지 배정 UI | ADMIN-14~16 | ✅ Completed 2026-05-27 |
| 19 | 어드민 UI/UX 전면 개선 | V3.1 | 공유 레이아웃 + 사이드바 네비게이션으로 13개 어드민 기능 통합, 운영자 접근성 전면 개선 | ADMIN-10~13 | ✅ Completed 2026-05-28 |
| 20 | 갭투자 분석 | V3.2 | 매매/전세 실거래 데이터 기반 갭투자 지표 계산 + 단지 상세 + 전용 분석 페이지 | GAP-01~04 | ✅ Completed 2026-05-28 |
| 21 | 투자 분석 통합 페이지 | V3.3 | 실거래 2년 시세 흐름 차트 + 갭투자 랭킹을 /invest 페이지로 통합 | INVEST-01~04 | 🟡 Planned |

---

## Phase Details

### Phase 1: 보안·인프라·배포

**Goal:** V0.9 로컬 코드를 프로덕션에서 안전하게 운영 가능한 상태로 전환. 보안 취약점 제거, CI 자동화, E2E 골든패스 확보.

**Version:** V1.0 (1주차 목표)

**Requirements:**
- INFRA-01: Vercel 프로덕션 배포 + 환경 변수 검증 + `.env.local.example` 최신화
- INFRA-02: GitHub Actions CI — PR마다 lint/build/test 자동 실행
- INFRA-03: Playwright E2E — 골든패스 5종 자동화
- SEC-01: 광고 이벤트 rate limiting + IP hash
- SEC-02: createSupabaseAdminClient() 통합 (3곳 inline 교체)
- SEC-03: 지도 쿼리 status='active' 필터
- SEC-04: Sentry 초기화 또는 플레이스홀더 제거

**Plans:** 5 plans / 3 waves

**Wave 1** *(독립 실행 가능)*
- [x] 01-01-PLAN.md — 보안 패치 (SEC-01 rate limit + SEC-02 admin client + SEC-03 status filter)
- [x] 01-02-PLAN.md — Sentry 에러 트래킹 초기화 (SEC-04)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md — GitHub Actions CI 워크플로우 + .env.local.example 최신화 (INFRA-02, INFRA-01)
- [x] 01-04-PLAN.md — Playwright E2E 골든패스 5종 (INFRA-03)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-05-PLAN.md — Vercel 프로덕션 배포 + branch protection 활성화 (INFRA-01) `[CHECKPOINT]`

**Cross-cutting constraints:**
- 모든 Wave의 서버 코드: `createSupabaseAdminClient()` 경유 필수
- 커밋 전 `npm run lint && npm run build && npm run test` 통과 필수

**Success Criteria:**
1. `main` 브랜치 PR에서 lint/build/test가 자동 실행되고 통과한다
2. Vercel 프로덕션 URL이 존재하고 단지 상세 페이지가 정상 렌더된다
3. `/api/ads/events`에 1분 내 100회 이상 POST 시 rate limit 429가 반환된다
4. E2E 5종 테스트가 CI에서 자동 실행되고 통과한다
5. 서비스 역할 클라이언트 생성이 `createSupabaseAdminClient()` 단일 경로로만 이뤄진다

**UI hint**: no

---

### Phase 2: 랭킹·랜딩·공유

**Goal:** 사용자가 처음 방문했을 때 보는 화면(랜딩)과 카카오톡 공유 링크를 완성. 신규 유입의 첫 인상 결정.

**Version:** V1.0 (2주차 목표)

**Requirements:**
- RANK-01: 지역 인기 단지 풀 정의 SQL + 일배치 갱신
- RANK-02: 랭킹 4종 산식 (신고가·거래량·평당가·관심도) + 1시간 cron
- RANK-03: 랜딩 페이지 완성 — 오늘 신고가 카드 + 4종 랭킹 탭 (ISR 60s)
- SHARE-01: 단지별 동적 OG 이미지 (`next/og` 내장)
- SHARE-02: 카카오톡·네이버 공유 버튼 + 단지 상세 공유 UX

**Plans:** 5 plans / 3 waves

**Wave 1** *(독립 실행 가능)*
- [x] 02-01-PLAN.md — DB 마이그레이션 + TTF 폰트 + 테스트 스캐폴드 (RANK-01 전제조건)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — 랭킹 데이터 레이어 + cron endpoint + GitHub Actions (RANK-01, RANK-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — 랜딩 페이지 ISR 완성 — 신고가 카드 + 4종 랭킹 탭 (RANK-03)
- [x] 02-04-PLAN.md — 단지별 동적 OG 이미지 opengraph-image.tsx (SHARE-01)
- [x] 02-05-PLAN.md — 카카오톡·네이버·링크복사 공유 버튼 ShareButton (SHARE-02)

**Cross-cutting constraints:**
- `createSupabaseAdminClient()` — cron route에서만 사용
- `createReadonlyClient()` — page.tsx, opengraph-image.tsx에서 유지 (ISR 조건)
- 모든 transactions 쿼리: `cancel_date IS NULL AND superseded_by IS NULL` 필수
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고, gradient orb

**Success Criteria:**
1. 랜딩 페이지에 오늘 신고가 카드 ≥ 3개가 표시된다
2. 랭킹 탭 4종이 데이터와 함께 정상 렌더된다 (ISR 60s 확인)
3. 단지 URL을 카카오톡으로 공유 시 단지명·가격이 담긴 OG 카드가 노출된다
4. 랭킹 cron이 1시간마다 데이터를 갱신한다 (ingest_runs 기록 확인)

**UI hint**: yes

---

### Phase 3: 카드뉴스·법적·운영

**Goal:** V1.0 정식 출시에 필요한 법적 요건 충족, 운영 어드민 완성, a11y 기준 통과, 카드뉴스 파이프라인 완성.

**Version:** V1.0 (3~4주차 목표)

**Requirements:**
- SHARE-03: 카드뉴스 자동 생성 (Recharts SSR + @vercel/og)
- SHARE-04: 어드민 카드뉴스 1-click 발행 UI
- LEGAL-01: 이용약관 + 가입 동의 흐름
- LEGAL-02: 개인정보처리방침
- LEGAL-03: 광고 정책 + 표시광고법 고지
- LEGAL-04: 탈퇴 플로우 (30일 grace + hard delete cron)
- LEGAL-05: 이메일 지원 채널 설정
- ADMIN-01: 회원 관리 (카페 닉네임·계정 정지)
- ADMIN-02: 광고 검수 상태 머신
- ADMIN-03: 신고 큐 운영자 처리 UI
- ADMIN-04: 시스템 상태 모니터링 메뉴
- A11Y-01: axe-core CI (critical 0건)
- A11Y-02: 키보드 탐색 검증
- A11Y-03: 스크린리더 라벨 검증

**Plans:** 5/5 plans executed

**Wave 0** *(독립 실행)*
- [x] 03-01-PLAN.md — 마이그레이션 + RED 테스트 + @axe-core/playwright 설치 + [BLOCKING] supabase db push (SHARE-03/04, LEGAL-01/04/05, ADMIN-01/03/04, A11Y-01/02/03 기반)

**Wave 1** *(blocked on Wave 0)*
- [x] 03-02-PLAN.md — 동의·탈퇴·재활성화 + auth/callback + 법적 페이지 + Footer + hard delete cron (LEGAL-01/02/03/04/05)

**Wave 2** *(blocked on Wave 0; 03-03/04 병렬 실행 가능 — files_modified 무중복)*
- [x] 03-03-PLAN.md — 카드뉴스 Route Handler + /admin/cardnews UI (SHARE-03, SHARE-04)
- [x] 03-04-PLAN.md — admin-actions.ts + 회원/신고/시스템 상태 페이지 (ADMIN-01, ADMIN-02 회귀, ADMIN-03, ADMIN-04) `completed 2026-05-07`

**Wave 2** *(blocked on Wave 1)*
- [x] 03-05-PLAN.md — accessibility E2E GREEN + CI 게이트 (A11Y-01/02/03) `completed 2026-05-07`

**Success Criteria:**
1. 이용약관·개인정보·광고 정책 페이지가 존재하고 가입 흐름에 동의 체크가 포함된다
2. 탈퇴 요청 후 30일 이내 계정이 소프트 삭제되고 30일 후 hard delete cron이 실행된다
3. axe-core CI에서 critical 접근성 이슈 0건으로 통과한다
4. 어드민에서 광고를 등록→검수→승인까지 상태 전환할 수 있다
5. 카드뉴스를 어드민에서 1-click으로 생성·발행할 수 있다
6. `npm run lint && npm run build && npm run test` + E2E 전부 통과한다

**UI hint**: yes

---

### Phase 4: 커뮤니티 기초

**Goal:** 후기·댓글·외부 연결 등 커뮤니티 참여 기능 + 데이터 깊이 확장. Persona A(실수요자)의 "이웃 의견" 수요 충족.

**Version:** V1.5

**Requirements:**
- COMM-01: 후기 댓글 (텍스트, RLS, 신고)
- COMM-02: GPS L1 인증 배지 활성화
- COMM-03: 단지 페이지 → 카페 검색 외부 링크
- COMM-04: 신고 통합 큐 + SLA ≤ 24h 운영
- COMM-05: 주간 회전 카페 가입 코드
- DATA-01: K-apt 부대시설 데이터 (단지 상세 시설 탭)
- DATA-02: 신축 분양 정보 + 분양권 거래 분리 UI
- NOTIF-01: 주간 다이제스트 이메일
- NOTIF-02: 알림 토픽 채널 구독

**Plans:** 9 plans / 4 waves

**Wave 0** *(독립 실행 — BLOCKING)*
- [ ] 04-00-PLAN.md — DB 마이그레이션 (enum + 5 테이블 + RLS + PostGIS RPC) + supabase db push + RED 테스트 스캐폴드

**Wave 1** *(blocked on Wave 0; 04-01/02/03 병렬 실행 가능)*
- [ ] 04-01-PLAN.md — 후기 댓글 시스템 (COMM-01)
- [ ] 04-02-PLAN.md — GPS L1 인증 배지 활성화 (COMM-02)
- [ ] 04-03-PLAN.md — 카페 외부 링크 + 신고 SLA 배지 (COMM-03, COMM-04)

**Wave 2** *(blocked on Wave 0; Wave 1과 병렬 실행 가능)*
- [ ] 04-04-PLAN.md — K-apt 부대시설 + 단지 상세 시설 탭 (DATA-01)
- [ ] 04-05-PLAN.md — MOLIT 신축 분양 정보 + presale UI (DATA-02)

**Wave 2** *(blocked on Wave 1)*
- [ ] 04-06-PLAN.md — 주간 카페 가입 코드 + admin/status 표시 (COMM-05)
- [ ] 04-07-PLAN.md — 주간 다이제스트 이메일 + GitHub Actions cron (NOTIF-01)
- [ ] 04-08-PLAN.md — 알림 토픽 구독 + 프로필 UI (NOTIF-02)

**Cross-cutting constraints:**
- 모든 transactions 쿼리: `cancel_date IS NULL AND superseded_by IS NULL` (presale_transactions 포함)
- cron/worker endpoint: `x-cron-secret` 헤더 검증 필수
- ISR 페이지: `createReadonlyClient()` + `export const revalidate = N` (cookies() 금지)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고, gradient orb

**Success Criteria:**
1. 후기에 댓글을 달 수 있고, 댓글 신고 시 신고 큐에 쌓인다
2. GPS L1 인증(단지 ±100m)을 통과한 후기에 배지가 표시된다
3. 단지 상세에 카페 검색 외부 링크가 표시된다
4. 구독 회원에게 매주 관심 단지 다이제스트 이메일이 발송된다
5. 카페 가입 코드가 매주 갱신되고 어드민에서 확인 가능하다

**UI hint**: yes

---

### Phase 5: 데이터 확장·운영 안정성

**Goal:** 단지 데이터 깊이 확장 (재건축·가성비·갭) + 운영 백업 자동화로 V1.5 완성.

**Version:** V1.5

**Requirements:**
- DATA-03: 재건축 단계 운영자 수동 입력 + 타임라인
- DATA-04: 가성비 분석 4분면 (평당가 × 학군 점수)
- DATA-05: 매물가 vs 실거래가 갭 라벨
- OPS-01: DB 백업 자동화 (pg_dump + GitHub private repo 주간)

**Plans:** 5 plans / 3 waves

**Wave 0** *(BLOCKING — autonomous: false, 운영자 직접 실행)*
- [x] 05-00-PLAN.md — supabase link + db push (22개 마이그레이션 적용) + molit-backfill-once.yml 생성 ✅ COMPLETE (2026-05-07)

**Wave 1** *(blocked on Wave 0; 05-01/02/03 병렬 실행 가능 — files_modified 무중복)*
- [x] 05-01-PLAN.md — 재건축 타임라인 (RLS + 데이터 레이어 + RedevelopmentTimeline + 어드민) (DATA-03) ✅ COMPLETE (2026-05-07)
- [x] 05-02-PLAN.md — 가성비 4분면 차트 (getQuadrantData + ValueQuadrantChart + 단지 상세 연결) (DATA-04) ✅ COMPLETE (2026-05-07)
- [x] 05-03-PLAN.md — listing_prices 마이그레이션 + Server Action + 어드민 입력 UI (DATA-05) ✅ COMPLETE (2026-05-07)

**Wave 1 (continued)** *(blocked on Wave 0; 05-04도 05-01/02/03과 병렬 실행 가능 — files_modified 무중복)*
- [x] 05-04-PLAN.md — pg_dump 주간 백업 GitHub Actions + danjiondo-backup repo (OPS-01) ✅ COMPLETE (2026-05-08)

**Cross-cutting constraints:**
- 모든 transactions 쿼리: `cancel_date IS NULL AND superseded_by IS NULL` 필수
- admin write: `createSupabaseAdminClient()` + requireAdmin() guard 필수
- ISR 페이지: `export const revalidate = 86400` 유지 (page.tsx)
- 'use client' 차트 컴포넌트: data는 RSC에서만 fetch, 컴포넌트에 props로 전달
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고
- D-08 준수: 갭 라벨 UI 표시 Phase 6으로 defer (listing_prices 테이블만 생성)
- SUPABASE_DB_URL GitHub Secrets에만 저장 — log 출력 절대 금지

**Success Criteria:**
1. 재건축 단계가 있는 단지 상세에 진행 타임라인이 표시된다
2. 가성비 4분면 차트에서 단지 위치를 확인할 수 있다
3. 단지 상세에 매물가 대비 실거래가 갭 라벨이 표시된다 (Phase 5: 인프라만, Phase 6: UI)
4. 매주 pg_dump가 실행되고 GitHub private repo에 백업이 저장된다

**UI hint**: yes

---

### Phase 6: AI·차별화 기술

**Goal:** Claude API RAG 봇 + SGIS 통계 + 광고 고도화 + GPS L2/L3 인증. 기술 차별화 자산 구축.

**Version:** V2.0

**Requirements:**
- DIFF-03: Claude API + RAG 단지 상담 봇 (환각률 ≤ 5%)
- DATA-06: SGIS 인구·세대 통계 분기 적재
- DATA-07: 재개발 행정 데이터 자동 적재 (출처 확보 시) — Phase 7로 defer
- AD-01: 광고 통계 고도화 (전환·ROI·이상 트래픽)
- AD-02: 광고주 카피 AI 어시스트 + 표시광고법 감지
- AUTH-01: GPS L2+L3 인증 (다회+시간패턴 / 우편·관리비)

**Plans:** 5 plans / 4 waves (Wave 0→1→2→3)

**Wave 0** *(BLOCKING — autonomous: false, 마이그레이션 적용 + 패키지 설치)*
- [ ] 06-00-PLAN.md — DB 마이그레이션 4개 + @anthropic-ai/sdk 설치 + 환경변수 등록 (DIFF-03, DATA-06, AD-01, AUTH-01) `planned 2026-05-08`

**Wave 1** *(blocked on Wave 0; 06-01/02 병렬 실행 가능 — files_modified 무중복)*
- [ ] 06-01-PLAN.md — Ratelimit 확장 + AD-01 이벤트 고도화 + SGIS 어댑터 + 갭 라벨 쿼리 (AD-01, DATA-06, DATA-05) `planned 2026-05-08`
- [ ] 06-02-PLAN.md — RAG 채팅 API + AD-02 카피 검토 API + 임베딩/SGIS 배치 스크립트 (DIFF-03, DATA-06, AD-02) `planned 2026-05-08`

**Wave 2** *(blocked on Wave 1)*
- [ ] 06-03-PLAN.md — 프론트엔드 UI — 갭 라벨 + 지역 통계 탭(AnalysisSection) + AI 상담 패널 + 어드민 ROI + 카피 검토 폼 (DATA-05, DATA-06, DIFF-03, AD-01, AD-02) `planned 2026-05-08`

**Wave 3** *(blocked on Wave 0·2)*
- [ ] 06-04-PLAN.md — GPS L2+L3 인증 + 어드민 승인 UI + E2E 테스트 (AUTH-01) `planned 2026-05-08`

**Cross-cutting constraints:**
- 모든 transactions 쿼리: `cancel_date IS NULL AND superseded_by IS NULL` 필수
- admin write: `createSupabaseAdminClient()` + admin role check 필수
- ISR 페이지: `export const revalidate = 86400` 유지 (complexes/[id]/page.tsx)
- Anthropic SDK: claude-haiku-4-5-20251001 사용 (AD-02, DIFF-03 채팅)
- 임베딩: Voyage AI voyage-4-lite 1024dim (Anthropic 임베딩 미지원)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고, "Powered by AI" 배지
- SGIS adm_cd 코드: ASSUMED — 첫 실행 전 stage API로 검증 필수

**Success Criteria:**
1. 단지 상담 봇이 단지 데이터 기반으로 답변하고, human eval 100건 기준 환각률 ≤ 5%
2. SGIS 통계가 분기마다 자동 적재되고 단지 상세에 표시된다
3. 광고주 대시보드에서 전환율·ROI를 확인할 수 있다
4. GPS L2 인증(다회 방문 패턴)을 통과한 후기에 상위 배지가 표시된다

**UI hint**: yes

---

### Phase 7: 데이터 파이프라인 수리

**Goal:** KAPT API로 단지 상세정보(주소·세대수·준공연도·난방방식) 적재, MOLIT transactions↔complexes 연결, 향후 ingest 시 complex_id 자동 매핑 — 서비스 전체의 데이터 기반 완성.

**Version:** V2.0

**Depends on:** Phase 6 (pgvector, complex_embeddings 테이블 존재)

**Requirements:**
- DATA-08: KAPT API로 complexes 상세정보 채우기 (si, gu, dong, road_address, household_count, built_year, heat_type)
- DATA-09: transactions.complex_id 일괄 연결 (sgg_code + 이름 매칭 → 불확실 건은 unmatched 로그)
- DATA-10: ingestMonth 수정 — aptSeq → molit_complex_code 저장 + complex_id 자동 lookup

**Plans:** 3 plans / 1 wave

**Wave 1** *(모두 독립 실행 가능 — 병렬 실행)*
- [x] 07-01-PLAN.md — KaptBasicInfoSchema 확장 + kapt-enrich.ts 스크립트 + GitHub Actions (DATA-08)
- [x] 07-02-PLAN.md — name-aliases.json 작성 + link-transactions.ts 스크립트 + GitHub Actions (DATA-09)
- [x] 07-03-PLAN.md — ingestMonth 수정 (complex_id 자동 연결 + molit_complex_code 저장) + 테스트 (DATA-10)

**Cross-cutting constraints:**
- 단지명 단독 매칭 절대 금지 — 항상 sgg_code + pg_trgm 복합 매칭 (CLAUDE.md)
- 배치 스크립트는 WHERE si IS NULL / WHERE complex_id IS NULL 조건으로 idempotent하게 실행
- GitHub Actions secrets 경유 — 환경변수 절대 로그 출력 금지
- molit_complex_code UPDATE 시 .is('molit_complex_code', null) guard 필수

**Success Criteria:**
1. complexes 테이블 669개 중 90% 이상 si/gu/dong이 채워진다
2. transactions 186,765건 중 80% 이상 complex_id가 연결된다
3. 단지 상세 페이지에서 세대수·준공연도가 표시된다
4. AI 채팅 봇이 실거래 데이터를 포함한 답변을 제공한다
5. 신규 ingestMonth 실행 시 complex_id가 자동으로 채워진다

**UI hint**: no

---

### Phase 8: 커뮤니티 심화·자동화

**Goal:** 게이미피케이션 + 카페 NLP 연동 + 카카오톡 채널 + 비교 모드 + 카페 자동 발행. V2.0 완성.

**Version:** V2.0

**Requirements:**
- DIFF-01: 게이미피케이션 마크 (👑🔥💬) + 회원 등급 UI
- DIFF-02: 카페 글 NLP 단지 매칭 (정확도 ≥ 85%)
- DIFF-04: 카카오톡 채널 알리미 (푸시 거부 대안)
- DIFF-05: 회원 등급 시스템 + 우선 알림 혜택
- DIFF-06: 즐겨찾기 단지 2~4개 비교 표
- OPS-02: 카카오 카페 매니저 OAuth 카드뉴스 자동 발행 (법무 승인 후)

**Success Criteria:**
1. 활동 기반으로 회원 등급이 부여되고 마크가 후기에 표시된다
2. 카페 글이 NLP로 단지에 매칭되어 단지 페이지에 연동 표시된다 (정확도 ≥ 85%)
3. 카카오톡 채널을 통해 알림이 발송된다
4. 즐겨찾기 단지 2~4개를 선택해 비교 표를 볼 수 있다
5. 카드뉴스가 카페에 자동 발행된다 (법무 승인 조건부)

**UI hint**: yes

**Plans:** 7 plans / 4 waves

**Wave 0** *(BLOCKING — autonomous: false, supabase db push + SOLAPI 계정 선행)*
- [ ] 08-00-PLAN.md — DB 마이그레이션 (게이미피케이션/카카오채널/카페글) + 패키지 설치 + RED 테스트 [BLOCKING]

**Wave 1** *(blocked on Wave 0; 08-01/08-03 병렬 실행 가능 — files_modified 무중복)*
- [ ] 08-01-PLAN.md — 게이미피케이션 백엔드 (getMemberTier) + TierBadge UI (DIFF-01)
- [ ] 08-03-PLAN.md — 즐겨찾기 단지 비교 표: compare.ts + CompareTable + CompareAddButton (DIFF-06)

**Wave 2** *(blocked on Wave 1; 08-02/08-04 병렬 실행 가능 — files_modified 무중복)*
- [ ] 08-02-PLAN.md — 회원 등급 알림 우선순위 + deliverKakaoChannelNotifications (DIFF-05)
- [ ] 08-04-PLAN.md — 카페 NLP 파이프라인: naver-cafe.ts + cafe-ingest cron (DIFF-02)
- [ ] 08-05-PLAN.md — 카카오 채널 알림: kakao-channel.ts + KakaoChannelSubscribeForm (DIFF-04)

**Wave 3** *(blocked on Wave 2)*
- [ ] 08-06-PLAN.md — 어드민 카드뉴스 1-click 복사 버튼 (OPS-02 scope 축소: Naver 카페 글쓰기 API 미공개)

**Cross-cutting constraints:**
- activity_points UPDATE는 DB 트리거(SECURITY DEFINER) 경유 필수 — 클라이언트 직접 수정 금지
- SOLAPI API key, Naver Search API key: src/services/ 어댑터만 호출 — 컴포넌트/라우트 직접 사용 금지
- 카페 글 단지 매칭: matchComplex() 파이프라인 필수 — 단지명 단독 매칭 절대 금지
- 전화번호 저장: RLS owner-only + 로그 출력 금지
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고 (TierBadge, CompareTable 포함)

---

### Phase 9: 단지 상세 UX 고도화

**Goal:** 실거래가 그래프·시설 정보·관리비 섹션을 실수요자 관점으로 재설계. 평형별 데이터 분리, 기간 필터, 이상치 처리로 신뢰성 높은 단지 상세 완성.

**Version:** V2.1

**Requirements:**
- UX-01: 실거래가 그래프 — 월세 탭 제거 + 기간 필터(1년/3년/5년/전체) + IQR 이상치 투명 점 표시
- UX-02: 실거래가·관리비 평형별 필터 — 전용면적 기준 칩 셀렉터(nuqs URL 상태), 기본값 최다 거래 평형
- UX-03: 시설 정보 표시 개선 — 주차 세대당 대수(총주차÷세대수) + 엘리베이터 동당 대수(총엘리베이터÷동수)
- UX-04: 관리비 계절별 표시 — 상세내역 제거 + 하절기/동절기 월평균 + 세대당 평균 (단지 합계 ÷ 세대수, 평형별 분리 없음)

**Plans:** 5 plans / 3 waves

**Wave 0** *(BLOCKING — autonomous: false, supabase db push 필요)*
- [ ] 09-00-PLAN.md — DB 마이그레이션 (building_count + complex_transactions_for_chart RPC) + kapt-facility-enrich.ts 갱신 + RED 테스트 스캐폴드

**Wave 1** *(blocked on Wave 0; 09-01/09-03 병렬 실행 가능 — files_modified 무중복)*
- [ ] 09-01-PLAN.md — 데이터 레이어 + 순수 유틸리티 (iqr.ts, period-filter.ts, area-groups.ts, facility-format.ts, getComplexRawTransactions, getSeasonalAverages) (UX-01/02/03/04)
- [ ] 09-03-PLAN.md — 시설 카드 주차/엘리베이터 표시 개선 (page.tsx) (UX-03)

**Wave 2** *(blocked on Wave 1; 09-02/09-04 병렬 실행 가능 — files_modified 무중복)*
- [ ] 09-02-PLAN.md — DealTypeTabs + TransactionChart 재작성 (월세 제거 + nuqs period/area + 평형 칩 + IQR 투명 점) + page.tsx raw fetch 연결 (UX-01, UX-02)
- [ ] 09-04-PLAN.md — ManagementCostCard 재작성 (계절별 표시 + 상세 항목 제거 + fallback) (UX-04)

**Success Criteria:**
1. 실거래가 그래프에 월세 탭이 없고, 기간 필터(1/3/5/전체)가 URL 상태로 동작한다
2. IQR 1.5배 기준 이상치가 투명 점으로 구분 표시된다
3. 평형 칩 선택 시 그래프·목록이 해당 평형 데이터만 표시된다 (URL 공유 가능)
4. 시설 카드에 주차가 "세대당 N.N대", 엘리베이터가 "동당 N대"로 표시된다
5. 관리비 카드에 하절기/동절기 월평균이 표시된다

**UI hint**: yes

---

### Phase 10: 교육 환경 고도화

**Goal:** 학구도 shapefile 기반 배정학교 정확 표시 + 교육 카드 UX 전면 개선으로 실수요자의 "이 동네 학교 어때?" 질문에 정확하게 답한다.

**Version:** V2.2

**Requirements:**
- EDU-01: 배정학교 표시 — 학구도 shapefile(초/중/고) PostGIS import + ST_Within 매핑 + facility_school.is_assignment 플래그 업데이트 + UI에서 배정학교 강조/구분 표시
- EDU-02: 어린이집/유치원 분리 표시 — facility_poi.poi_name 기반 유치원 분리 + 어린이집 3개·유치원 3개 각각 표시 (현재 혼합 10개)
- EDU-03: 학원 UX 개선 — "외 N개" 클릭 시 전체 목록 펼치기 + 시군구 단위 상위 X% 라벨 (현재 창원+김해 통합)
- EDU-04: 학교 도보 시간 색깔 아이콘 — distance_m÷67 도보 분 계산 + 10분 이내(녹색)/10~15분(노랑)/15분 초과(빨강) 3단계 색상 표시
- EDU-05: 학원 종류별 분류 표시 — poi_name 파싱으로 수학/영어/예체능 등 카테고리 태그 표시

**Plans:** 4 plans / 4 waves

**Wave 0** *(BLOCKING — autonomous: false, supabase db push 필요)*
- [ ] 10-00-PLAN.md — DB 마이그레이션 (school_districts + RLS + hagwon_score_percentile_by_si) + 순수 유틸(hagwon-category.ts) + RED 테스트 [BLOCKING supabase db push] (EDU-01~05)

**Wave 1** *(blocked on Wave 0)*
- [ ] 10-01-PLAN.md — Shapefile import 스크립트 (SHP/DBF 파싱 → school_districts 적재) (EDU-01)

**Wave 2** *(blocked on Wave 1)*
- [ ] 10-02-PLAN.md — is_assignment 업데이트 스크립트 (ST_Within) + facility-edu.ts 수정 (유치원 분리 + si 백분위) (EDU-01, EDU-02, EDU-03)

**Wave 3** *(blocked on Wave 2)*
- [ ] 10-03-PLAN.md — EducationCard.tsx UI 전면 개선 (도보 색깔 + 유치원 분리 + 학원 펼치기 + 카테고리 태그 + si 백분위) + page.tsx 타입 수정 (EDU-01~05)

**Success Criteria:**
1. 배정 초등학교가 단지 좌표 기반으로 정확히 표시되고 UI에서 "배정" 배지로 구분된다
2. 어린이집 3개·유치원 3개가 분리 표시된다 (기존 혼합 최대 10개 → 분리 각 3개)
3. 학원 목록에서 "외 N개"를 클릭하면 전체 펼쳐보기가 된다
4. 학교 목록에 도보 시간 색깔 아이콘이 3단계(녹/노/빨)로 표시된다
5. 학원 목록에 수학/영어/예체능 등 카테고리 태그가 표시된다

**UI hint**: yes

---

### Phase 11: 지도 고도화

**Goal:** 카카오맵을 단순 핀 지도에서 게임화된 인터랙티브 지도로 전환. 클러스터 줌인·평당가 라벨·사이드 패널·배지 마커 시스템으로 지도 체류 시간과 정보 밀도를 높인다.

**Version:** V2.3

**Requirements:**
- MAP-01: 클러스터 클릭 줌인 + 마커 hover 미리보기 카드
- MAP-02: 평당가 라벨 마커 (avg_sale_per_pyeong 컬럼 추가 포함)
- MAP-03: 사이드 패널 (PC 우측 슬라이드인 / 모바일 바텀 시트)
- MAP-04: 게임화 마커 배지 시스템 (SVG 일체형, 1~3순위 배지)
- MAP-05: 지도 마커 DB 확장 (view_count, price_change_30d, view_count RPC)

**Plans:** 5 plans / 4 waves

**Wave 0** *(BLOCKING — autonomous: false, supabase db push)*
- [ ] 11-00-PLAN.md — DB 마이그레이션 (4컬럼 + 2함수 + GRANT) + [BLOCKING] supabase db push + 테스트 스캐폴드 (MAP-01~05)

**Wave 1** *(blocked on Wave 0; 11-01/11-02 병렬 실행 가능 — files_modified 무중복)*
- [ ] 11-01-PLAN.md — ComplexMapItem 확장 + getComplexesForMap 쿼리 확장 + badge-logic.ts 순수 함수 (MAP-02, MAP-04, MAP-05)
- [ ] 11-02-PLAN.md — map-panel.ts 데이터 레이어 + GET /api/complexes/[id]/map-panel Route Handler (MAP-03)

**Wave 2** *(blocked on Wave 1)*
- [ ] 11-03-PLAN.md — BadgeMarker.tsx + ClusterMarker 줌인 + ComplexMarker CustomOverlayMap 전환 + KakaoMap 통합 (MAP-01, MAP-02, MAP-04)

**Wave 3** *(blocked on Wave 2)*
- [ ] 11-04-PLAN.md — MapSidePanel.tsx + KakaoMap 연결 + incrementViewCount Server Action + daily cron 연결 (MAP-03, MAP-05)

**Cross-cutting constraints:**
- 모든 transactions 쿼리: `cancel_date IS NULL AND superseded_by IS NULL` 필수 (배치 SQL 함수 포함)
- 클라이언트 컴포넌트에서 Supabase 직접 쿼리 금지 — 반드시 API Route 경유 (CLAUDE.md)
- 이모지 아이콘 금지 — SVG path만 사용 (CLAUDE.md)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고, gradient orb
- useMap()은 Map 컴포넌트 children 내에서만 호출 가능 (ClusterMarker만 해당)
- view_count 증가는 클라이언트 useEffect + Server Action (ISR 빌드 타임 실행 방지)

**Success Criteria:**
1. 클러스터 클릭 시 해당 단지들이 뷰포트에 들어오도록 자동 줌인된다
2. 줌 레벨 충분 시 마커에 평당가 라벨이 표시되고 가격대별로 색상이 다르다
3. 마커 클릭 시 사이드 패널(PC) 또는 바텀 시트(모바일)가 슬라이드인된다
4. 분양 단지는 골드 마커, 신축(2021년 이후)은 민트 마커로 구분된다
5. 상위 5% 거래량 단지는 왕관 형태 SVG 마커, 조회수 상위 5%는 불꽃 곡선 마커로 표시된다
6. 급등/급락 단지는 마커 색으로 구분되어 한눈에 식별된다

**UI hint**: yes

---

### Phase 12: 지도 마커·클러스터 개편

**Goal:** 로고 기반 집 모양 SVG 마커로 핀 마커를 완전 교체하고, 동/구 단위 사각형 클러스터 칩(최근 최고 실거래가 표시)과 hover 툴팁을 추가하여 지도 UX를 호갱노노 수준으로 고도화한다.

**Version:** V2.4

**Requirements:**
- MAP-06: 로고 기반 집 모양 SVG 마커 — 회색 지붕+굴뚝+오렌지 C형 바디 (일반), 빨간 바디 (분양), 민트 바디 (신축 2021+), hot 왕관 SVG 추가. 기존 핀/티어드롭 완전 교체
- MAP-07: hover 툴팁 — 단지명·시/구·최근 실거래 1건(가격·날짜·평수)·세대수·준공 표시. 클릭 전 카드 형태
- MAP-08: 동/구 단위 클러스터 칩 — supercluster 숫자 클러스터를 사각형 칩으로 교체, 구/동 이름 + 최근 3개월 최고 실거래가 표시, 클릭 시 줌인 유지
- MAP-09: 줌 레벨 정책 재정의 + 배지 단순화 — level ≥10(클러스터만), 7~9(집 마커+실거래가), ≤6(집 마커+단지명+실거래가). 배지 3종으로 단순화(pre_sale/new_build/hot-왕관), 기존 10종 제거

**Plans:** 4 plans / 2 waves

**Wave 1** *(독립 실행 가능 — 병렬 실행)*
- [x] 12-01-PLAN.md — HouseMarker SVG 집 마커 + badge-logic.ts 3종 단순화 (MAP-06, MAP-09) `completed 2026-05-15`
- [x] 12-02-PLAN.md — DongClusterChip 동/구 사각형 클러스터 칩 (MAP-08) `completed 2026-05-15`
- [x] 12-03-PLAN.md — ComplexMapItem 확장 (si/gu/recent_price 추가) + ComplexMarker hover 툴팁 개선 (MAP-07) `completed 2026-05-15`

**Wave 2** *(blocked on Wave 1; 12-04)*
- [ ] 12-04-PLAN.md — KakaoMap 통합: 줌 레벨 3단계 정책 + DongClusterChip 교체 + ComplexMarker 연결 (MAP-09) [CHECKPOINT]

**Success Criteria:**
1. 지도에 핀 모양 마커가 사라지고 로고 기반 집 모양 SVG 마커가 표시된다
2. 마커 hover 시 단지명·최근 실거래(가격·날짜·평수)·세대수·준공 툴팁이 나타난다
3. 줌 레벨 ≥10에서 동/구 이름과 최근 최고 실거래가를 표시하는 사각형 클러스터 칩이 보인다
4. 분양 단지는 빨간 바디, 신축(2021+)은 민트 바디, hot 단지는 왕관 SVG 마커를 표시한다
5. 줌 레벨 ≤6에서는 마커에 단지명이 함께 표시된다
6. 이모지/backdrop-blur/gradient-text/glow/보라색 없이 순수 SVG path로만 구성된다

**UI hint**: yes

---

### Phase 13: 신축·분양·재건축 대시보드

**Goal:** 청약홈 API 연동으로 분양 공고를 자동 수집하고, 분양 공고 → 재건축 예정 → 신축 최신순 3-tier 우선순위 대시보드를 구현한다.

**Version:** V2.5

**Requirements:**
- PRESALE-01: 청약홈 API 3 (data.go.kr #15098547) 어댑터 + 일배치 cron — 경남 지역 분양 공고 자동 수집, new_listings upsert
- PRESALE-02: 청약홈 API 2 (data.go.kr #15098905) 경쟁률 병합 — new_listings.competition_rate 컬럼 추가
- PRESALE-03: /presale 페이지 3-tier 재설계 — 분양 공고(1순위) → 재건축 예정(2순위) → 신축 최신순(3순위) 섹션, 랜딩 페이지 신축·분양 섹션 강화
- REDV-01: 재건축 admin UI — complexes.status = 'in_redevelopment' 수동 지정 화면 (predecessor/successor 연결 포함)

**Plans:** 4 plans / 3 waves

**Wave 0** *(BLOCKING — autonomous: false, supabase db push + 청약홈 API 키 검증)*
- [x] 13-01-PLAN.md — DB 마이그레이션 (new_listings 12컬럼 + partial unique index) + cheongyak types/normalize + RED 테스트 4종 + [BLOCKING] supabase db push + API 3 필드명 실호출 검증 (PRESALE-01, PRESALE-02) `completed 2026-05-20`

**Wave 1** *(blocked on Wave 0; 13-02/13-03 병렬 실행 가능 — files_modified 무중복)*
- [x] 13-02-PLAN.md — cheongyak/client.ts (fetchCheongyakList + fetchCompetitionRate) + daily cron 통합 (수집 + 경쟁률 + is_active 만료) (PRESALE-01, PRESALE-02) `completed 2026-05-20`
- [x] 13-03-PLAN.md — setComplexRedevelopmentStatus Server Action + /admin/redevelopment 단지 status 변경 폼 (REDV-01) `completed 2026-05-20`

**Wave 2** *(blocked on Wave 1)*
- [x] 13-04-PLAN.md — presale.ts 3-tier 쿼리 + PresaleCard 리팩터 + RedevelopmentCard/NewBuildCard 신규 + /presale 페이지 재설계 + 랜딩 분양 건수 배지 (PRESALE-03) `completed 2026-05-20`

**Cross-cutting constraints:**
- 외부 API 호출은 src/services/cheongyak/ 어댑터만 — 컴포넌트/라우트 직접 호출 금지 (CLAUDE.md)
- 클라이언트 컴포넌트에서 Supabase 직접 쿼리 금지 — /presale 데이터는 모두 RSC + createReadonlyClient
- new_listings 청약홈 upsert: onConflict: pblanc_no 만 사용 (기존 MOLIT name/region 제약과 partial unique index로 공존)
- admin Server Action: requireAdmin guard FIRST (Zod 이전) + createSupabaseAdminClient + revalidatePath 필수
- daily cron CRON_SECRET 헤더 검증 유지 (기존 패턴)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고 (PresaleCard, RedevelopmentCard, NewBuildCard 포함)
- 만료 공고: rcept_endde < today AND pblanc_no IS NOT NULL → is_active=false 자동 갱신
- Tier 1 필터: pblanc_no IS NOT NULL AND is_active=true (MOLIT 전매 행 자동 제외)

**Success Criteria:**
1. 경남 지역 청약홈 분양 공고가 일배치 cron으로 new_listings에 upsert된다
2. /presale 페이지에 분양 공고 → 재건축 예정 → 신축 3단계 섹션이 렌더된다
3. 분양 공고 카드에 경쟁률(competition_rate)이 표시된다
4. 데이터가 없는 섹션은 자동으로 숨겨지고 하위 tier가 올라온다
5. admin에서 단지 status를 in_redevelopment로 변경하면 재건축 섹션에 노출된다
6. 신축 섹션은 built_year >= 2021 단지를 준공연도 최신순으로 표시한다

**UI hint**: yes

---

### Phase 14: 지도 줌 중간 레벨 — 동 클러스터

**Goal:** 구 클러스터(level ≥9)에서 개별 마커(level ≤6)로 전환될 때 핀 폭발 문제 해결. level 7~8 구간에 동(dong) 단위 칩 + pre_sale 단지 마커만 표시하는 중간 레벨 삽입, 클릭 시 level 6 드릴다운.

**Version:** V2.5

**Depends on:** Phase 12 (DongClusterChip 컴포넌트, GuChip 타입 존재)

**Requirements:**
- MAP-10: 동 단위 중간 줌 레벨 — complexes.dong 필드 기반 groupBy, key=`${gu}_${dong}`, 칩 표시(동이름+단지수+최고가), null='기타'
- MAP-11: 동 칩 클릭 드릴다운 — setLevel(6) + setCenter(동 중심)
- MAP-12: pre_sale 마커 level 7~8 노출 — 동 클러스터 레벨에서 pre_sale 단지는 개별 마커로 항상 표시

**Plans:** 2 plans / 1 wave

**Wave 1** *(독립 실행 가능 — 병렬 실행)*
- [ ] 14-01-PLAN.md — DongChip 타입 + computeDongChips 함수 + DongClusterChip mode='dong' 확장 (MAP-10, MAP-11)
- [ ] 14-02-PLAN.md — KakaoMap.tsx 4단계 줌 레벨 정책 재편 + dongChips/preSaleComplexes useMemo + Vitest 테스트 (MAP-10, MAP-11, MAP-12)

**Cross-cutting constraints:**
- AI 슬롭 금지: backdrop-blur, gradient, glow (DongClusterChip 동 모드 포함)
- 이모지 금지 — 텍스트만 사용
- GuChip 하위 호환 필수 — mode 미전달 시 기존 구 칩 동작 유지
- pre_sale 필터: `c.status === 'pre_sale'` (DB 쿼리 없음, 클라이언트 필터)

**Success Criteria:**
1. level 9 이상에서 구 칩만 표시되고 동 칩·개별 마커가 없다
2. level 7~8에서 동 칩이 표시되고 pre_sale 단지의 개별 마커만 추가로 보인다
3. level 6 이하에서 개별 마커 전체 + 단지명이 표시된다
4. 동 칩 클릭 시 level 6으로 줌인되며 해당 동 중심으로 지도가 이동한다
5. complexes.dong=null 단지는 '기타' 동 칩으로 묶인다

**UI hint**: no

---

### Phase 16: 광고 플랫폼 MVP

**Goal:** 단지온도 홈페이지에 실제 광고를 노출하고 광고주 문의 흐름을 완성. 운영자는 `/admin/ads`에서 캠페인을 관리하고, 광고주는 `/ads`에서 상품을 보고 문의를 남기며, 방문자는 홈 상단 배너에서 승인된 광고를 볼 수 있다.

**Version:** V3.0

**Depends on:** Phase 15

**Requirements:**
- AD-03: 홈 상단 `banner_top` 캐러셀 — 승인된 광고 순환 노출
- AD-04: 광고주 문의 페이지 `/ads` + 문의 폼 + Server Action
- AD-05: 어드민 캠페인 관리 — 목록·ROI 통계·생성·승인/거절/일시정지

**Plans:** 2 plans / 1 wave

**Wave 1** *(독립 실행 가능 — 병렬)*
- [x] 16-01-PLAN.md — 홈 배너 캐러셀 (`AdBannerCarousel`) + 홈 통합 (AD-03)
- [x] 16-02-PLAN.md — 광고주 문의 페이지 + 문의 폼 Server Action (AD-04)

**Success Criteria:**
1. 홈 상단에 승인된 banner_top 광고가 캐러셀로 순환 표시된다
2. `/ads` 페이지에서 광고 상품 소개 + 문의 폼이 동작한다
3. 광고 문의 제출 시 Resend 이메일이 발송된다
4. 어드민에서 캠페인 생성·승인·거절·일시정지가 동작한다

**UI hint**: no

---

### Phase 17: 광고 게재 확장

**Goal:** 광고 placement를 3종(banner_top·sidebar·in_feed)에서 5종으로 확장. 신규 `map_popup` + 지역 매칭 sidebar + SidePanel in_feed 실제 렌더링 추가.

**Version:** V3.0

**Depends on:** Phase 16

**Requirements:**
- AD-06: DB 마이그레이션 — `map_popup` placement + `target_sgg_code/lat/lng` 컬럼
- AD-07: `AdMapPopup` 컴포넌트 (CustomOverlayMap, 5초 자동 닫힘, impression/click)
- AD-08: `GET /api/ads/sidebar?sgg_code=` + MapSidePanel 광고 통합
- AD-09: SidePanel ComplexList in_feed 광고 + 단지 상세 사이드바 광고

**Plans:** 4 plans / 2 waves

**Wave 1** *(독립 실행 가능 — 병렬)*
- [x] 17-01-PLAN.md — DB 마이그레이션 + `getActiveAds` sggCode 필터 + `AdCreateForm` 확장 (AD-06)
- [x] 17-02-PLAN.md — `AdMapPopup` 컴포넌트 + KakaoMap 통합 (AD-07)

**Wave 2** *(blocked on Wave 1)*
- [x] 17-03-PLAN.md — `GET /api/ads/sidebar` route + MapSidePanel 통합 (AD-08)
- [x] 17-04-PLAN.md — SidePanel in_feed 광고 + 단지 상세 사이드바 광고 (AD-09)

**Success Criteria:**
1. 지도에서 단지 클릭 시 해당 sgg_code 매칭 sidebar 광고가 사이드 패널에 표시된다
2. 지도 위에 `map_popup` 광고 오버레이가 5초 후 자동 닫힘된다
3. SidePanel 검색 결과 5번째 이후에 in_feed 광고가 삽입된다
4. 모든 impression/click 이벤트가 `/api/ads/events`에 기록된다

**UI hint**: no

---

### Phase 18: 공인중개사 추천 섹션

**Goal:** 아파트 단지 상세 페이지의 in_feed 광고 섹션을 공인중개사 추천 섹션으로 교체. 단지별 담당 공인중개사 최대 2명 배정 + 방문자 전화 문의 링크 제공.

**Version:** V3.1

**Depends on:** Phase 17

**Requirements:**
- ADMIN-14: `realtors` + `realtor_assignments` 테이블 + RLS 마이그레이션
- ADMIN-15: 어드민 `/admin/realtors` CRUD (목록·등록·수정·삭제·단지 배정)
- ADMIN-16: 단지 상세 페이지 "이 단지 담당 공인중개사" 섹션 + `RealtorCard` 컴포넌트

**Plans:** 4 plans / 2 waves

**Wave 0** *(독립 실행 가능)*
- [x] 18-00-PLAN.md — DB 마이그레이션 (realtors + realtor_assignments 테이블 + RLS) (ADMIN-14)
- [x] 18-01-PLAN.md — 데이터 레이어 + Server Actions + RealtorCard 컴포넌트 (ADMIN-15, ADMIN-16)

**Wave 1** *(blocked on Wave 0)*
- [x] 18-02-PLAN.md — 어드민 CRUD 페이지 (목록·등록·수정·단지 배정) (ADMIN-15)
- [x] 18-03-PLAN.md — 단지 상세 페이지 섹션 교체 + 테스트 (ADMIN-16)

**Success Criteria:**
1. `/admin/realtors`에서 공인중개사 등록·수정·삭제 및 단지 배정이 동작한다
2. 단지 상세 페이지에 배정된 공인중개사 카드가 최대 2개 표시된다
3. 배정된 공인중개사가 없으면 섹션이 숨겨진다
4. `tel:` 링크로 전화 문의가 가능하다
5. npm run lint && npm run build && npm run test 모두 PASS

**UI hint**: no

---


### Phase 19: 어드민 UI/UX 전면 개선

**Goal:** 공유 레이아웃 + 사이드바 네비게이션으로 13개 어드민 기능 통합, 운영자 접근성 전면 개선.

**Version:** V3.1

**Requirements:**
- ADMIN-10: 공유 어드민 레이아웃 — 사이드바 네비게이션 + /admin 진입점 + 공통 권한 검증
- ADMIN-11: 회원·신고·광고·중개사 목록 검색·필터 — 텍스트 검색 + 상태 드롭다운 필터
- ADMIN-12: 사이드바 미처리 항목 뱃지 — pending 신고·광고·GPS 요청 카운트 표시
- ADMIN-13: 어드민 페이지 공통 UX 개선 — 모바일 햄버거 메뉴 + 현재 페이지 active 표시

**Plans:** 4 plans / 3 waves

**Wave 0** *(BLOCKING — 공유 레이아웃 + 기존 header 제거)*
- [x] 19-00-PLAN.md — 공유 어드민 레이아웃 (layout.tsx + AdminSidebar/Links/Drawer) + /admin 리다이렉트 + 기존 9개 페이지 header 제거 + 테스트 (ADMIN-10, ADMIN-13)

**Wave 1** *(blocked on Wave 0; 19-01/19-02 병렬 실행 가능 — files_modified 무중복)*
- [x] 19-01-PLAN.md — 회원 + 신고 목록 검색·필터 (ADMIN-11, ADMIN-12)
- [x] 19-02-PLAN.md — 광고 + 중개사 목록 검색·필터 (ADMIN-11)

**Wave 2** *(blocked on Wave 1)*
- [x] 19-03-PLAN.md — 에지케이스·에러 처리·고도화 (중복 auth 제거, searchParams 화이트리스트, DB 에러 표시, 인메모리→DB 필터, 페이지네이션, Server Action revalidate, 편집 페이지 레이아웃, 정렬)

**Cross-cutting constraints:**
- RSC-first: layout.tsx RSC, AdminSidebarLinks + AdminSidebarDrawer만 'use client'
- Supabase 쿼리는 서버 컴포넌트에서만 (AdminSidebarLinks/Drawer에서 Supabase 직접 쿼리 금지)
- AI 슬롭 금지: backdrop-blur, gradient, glow, 보라/인디고 없음
- 기존 각 페이지 auth guard 유지 (defense in depth — CONTEXT.md D-05)
- 필터 폼: method="get" (Server Action 아님 — GET은 조회 전용)

**Success Criteria:**
1. /admin 접속 시 /admin/status로 리다이렉트된다
2. 모든 어드민 페이지 왼쪽에 240px 사이드바가 표시되고 현재 페이지가 active 강조된다
3. 사이드바 신고/광고/GPS 메뉴에 pending 카운트 뱃지가 표시된다
4. 768px 이하 모바일에서 햄버거 버튼 → overlay drawer로 사이드바가 제공된다
5. /admin/members, /admin/reports, /admin/ads, /admin/realtors 에서 검색·필터가 URL searchParams로 동작한다
6. npm run lint && npm run build && npm run test 모두 PASS

**UI hint**: no

### Phase 20: 갭투자 분석

**Goal:** 기존 국토부 실거래 데이터(매매/전세)를 활용해 단지별 갭투자 지표를 계산하고, 단지 상세 페이지와 전용 /gap-analysis 랭킹 페이지에 신호등 배지 + 숫자 형태로 위험도를 노출한다.

**Version:** V3.2

**Requirements:**
- GAP-01: `complex_gap_stats` DB 뷰/캐시 — 단지별 갭 금액·갭 비율·전세가율 집계 (매매/전세 중위값 기반)
- GAP-02: 일배치 cron 갱신 — 갭 통계를 daily-batch에 포함, data_sources 상태 추적
- GAP-03: 단지 상세 페이지 갭투자 카드 — 갭 금액·비율 + 신호등 배지(안전/주의/위험)
- GAP-04: /gap-analysis 전용 페이지 — 지역별 갭 비율 랭킹 테이블 (필터·정렬)

**Plans:** TBD (연구 후 결정)

**Cross-cutting constraints:**
- 거래 데이터 조회: `cancel_date IS NULL AND superseded_by IS NULL` 필수
- Supabase 쿼리는 서버 컴포넌트 또는 API Route에서만 (CLAUDE.md)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고 없음
- 이모지 금지 — CSS dot 또는 SVG path로 신호등 표현

**Success Criteria:**
1. 단지 상세 페이지에 갭 금액·비율·전세가율 + 신호등 배지가 표시된다
2. 거래 데이터가 부족한 단지(3건 미만)는 갭투자 섹션이 숨겨진다
3. /gap-analysis 페이지에서 창원·김해 단지 갭 비율 랭킹을 확인할 수 있다
4. 일배치 cron 실행 후 갭 통계가 갱신된다
5. npm run lint && npm run build && npm run test 모두 PASS

**UI hint**: yes


### Phase 21: 투자 분석 통합 페이지

**Goal:** 실거래 2년 시세 흐름 차트 + 갭투자 랭킹을 /invest 페이지로 통합. 'AI 예측'이 아닌 '실거래 흐름 기반 참고 지수'로 포지셔닝.

**Version:** V3.3

**Requirements:**
- INVEST-01: invest_regional_price_history RPC -- sgg_code + area_bucket + months 기반 지역 전체 매매 시세 월별 집계
- INVEST-02: invest_price_history RPC -- 단지별 + area_bucket 타입별 24개월 매매 시세 집계
- INVEST-03: /invest 통합 페이지 -- 상단 지역 시세 Recharts AreaChart + 하단 갭투자 랭킹 테이블
- INVEST-04: /complexes/[id] 시세 차트 섹션 추가 + /gap-analysis -> /invest 301 redirect

**Plans:** 4 plans / 2 waves

**Wave 1** *(병렬 실행 가능)*
- [ ] 21-00-PLAN.md -- DB 마이그레이션 (invest_regional_price_history + invest_price_history RPC) + next.config.ts 301 redirect (INVEST-01, INVEST-04)
- [ ] 21-01-PLAN.md -- src/lib/data/invest.ts 데이터 함수 3종 + RegionalPriceChart/ComplexPriceChart Wrapper (INVEST-01, INVEST-02, INVEST-03, INVEST-04)

**Wave 2** *(Wave 1 완료 후; 21-02/21-03 병렬 실행 가능)*
- [ ] 21-02-PLAN.md -- /invest RSC 통합 페이지 (시세 차트 + 갭투자 랭킹 테이블) (INVEST-03)
- [ ] 21-03-PLAN.md -- /complexes/[id] 시세 차트 섹션 추가 (INVEST-02, INVEST-04)

**Cross-cutting constraints:**
- 거래 데이터 조회: cancel_date IS NULL AND superseded_by IS NULL 필수 (RPC SQL 포함)
- Supabase 쿼리는 서버 컴포넌트에서만 (CLAUDE.md)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고 없음
- formatPrice는 src/lib/format.ts에서 import (로컬 복사 금지)
- /invest ISR: revalidate = 3600 / /complexes/[id]: revalidate = 86400 유지
- 법적 면책 문구 필수: '투자 결정에 직접 활용하지 마세요' (D-01)

**Success Criteria:**
1. /invest 페이지에 지역+타입 필터 탭 + Recharts AreaChart 시세 차트가 렌더된다
2. /invest 하단 갭투자 랭킹 테이블이 표시되고 단지 클릭 시 /complexes/[id]로 이동한다
3. /gap-analysis 접근 시 /invest로 301 redirect된다
4. 단지 상세 페이지에 시세 흐름 차트 섹션이 GapAnalysisCard 아래 존재한다
5. 법적 면책 문구가 두 페이지 모두 존재한다
6. npm run lint && npm run build && npm run test 통과

**UI hint**: yes

---
## Milestone Summary

| Milestone | Phases | Gate |
|-----------|--------|------|
| **V1.0 정식 출시** | Phase 1~3 | lint + build + test + E2E 5종 + axe-core 0 critical + 법적 페이지 존재 + Vercel 배포 |
| **V1.5 커뮤니티** | Phase 4~5 | Phase 1~3 gate + 후기 댓글 + 신고 SLA ≤ 24h + DB 백업 |
| **V2.0 차별화** | Phase 6~8 | Phase 4~5 gate + AI 봇 환각률 ≤ 5% + NLP 정확도 ≥ 85% + 광고 AI 법무 승인 |


