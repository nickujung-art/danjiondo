# Architecture Decision Records

## 철학
MVP 속도 최우선. 무료 티어로 가능한 한 늘림. 외부 의존성 최소화. 데이터 자산(실거래 + 카페 신호)은 lock-in으로 보호. 광고 표기·법규는 V1.0 출시 게이트.

---

### ADR-001 — Next.js 15 App Router
**결정**: Next.js 15 App Router + RSC  
**이유**: SEO(SSG/ISR), 단일 코드베이스(서버+클라), Vercel 통합  
**대안**: Remix, SvelteKit, Astro+React  
**트레이드오프**: RSC 학습 곡선  
**롤백**: 만약 RSC 한계로 불가피해지면 Pages Router 회귀 (페이지 단위)

### ADR-002 — Supabase Free Tier
**결정**: Supabase Postgres + Auth + Storage(V1.5)  
**이유**: 무료 + Postgres 표준 + RLS 내장  
**대안**: Firebase, PlanetScale, Neon + Clerk  
**트레이드오프**: 500MB 한도. Naver OAuth 미지원 (NextAuth로 우회)  
**롤백**: 한도 초과 시 Pro $25/월

### ADR-003 — 카카오맵 (vs 네이버 / Mapbox)
**결정**: 카카오맵 JS SDK + 카카오 로컬 API  
**이유**: 국내 좌표 정합성, 무료 한도 충분, POI 데이터 풍부  
**대안**: 네이버 지도(유료 전환 빠름), Mapbox(국내 데이터 약)  
**트레이드오프**: SDK 크기  
**롤백**: 한도 초과 시 네이버 지도 마이그레이션 (어댑터 패턴 유지)

### ADR-004 — 카페 글 백포팅 V2 보류
**결정**: V1에서 카페 글 직접 임베드 안 함  
**이유**: 약관·동의 리스크. V1은 사이트 약관에서 직접 동의 받음  
**대안**: 즉시 백포팅(법적 리스크), 외부 링크만  
**트레이드오프**: 차별화 일부 지연  
**롤백**: V2 시 카페 약관 개정 + 회원별 동의

### ADR-005 — 분양+중개 광고 동시
**결정**: 두 모델 동시 운영, UI 영역 분리  
**이유**: 기존 광고주 풀 활용 + 영역 분리로 어수선함 방지  
**대안**: 분양 only, 중개 only  
**트레이드오프**: 어드민 복잡성  
**롤백**: 한쪽 status 토글로 일시 중단

### ADR-006 — PWA + 모바일 퍼스트
**결정**: 반응형 + PWA. 네이티브 앱 V2  
**이유**: 카페 회원 모바일 비중 + 웹 푸시 요건 + 비용  
**대안**: React Native (V1.5 동시), Capacitor 래핑  
**트레이드오프**: iOS Safari 16.4+ 전용  
**롤백**: 푸시 거부율 높으면 이메일 only

### ADR-007 — 비회원 전체 공개
**결정**: 단지·검색·지도·시설 모두 비회원 접근  
**이유**: SEO 최대화. 전환은 즐겨찾기·알림에서  
**대안**: 단지 상세 일부 가림 (전환↑, SEO↓)  
**트레이드오프**: 데이터 노출  
**롤백**: 스크래핑 발견 시 Cloudflare 보호 추가

### ADR-008 — 출시 단계 (V0.9 → V1.0 → V1.5 → V2)
**결정**: 4단계 cut  
**이유**: 가설 검증 + 광고 본격화 분리  
**대안**: 단일 V1.0 빅뱅  
**트레이드오프**: 베타 운영 부담  
**롤백**: V0.9 가설 실패 시 plan 자체 재검토

### ADR-009 — 랭킹 = 지역 인기 단지 풀 + 4종 탭
**결정**: 풀 정의(세대수≥100 + 거래량or즐겨찾기 게이트) 후 4종 산식  
**이유**: 노이즈 제거 + 회원 관심도 정렬  
**대안**: 단순 갱신폭 정렬(노이즈), 머신러닝(데이터 부족)  
**트레이드오프**: 파라미터 튜닝 필요  
**롤백**: 파라미터는 환경변수 — 즉시 변경

### ADR-010 — 게이미피케이션 V2 보류
**결정**: 마크 V2  
**이유**: V1.0은 광고/랜딩 핵심  
**롤백**: V1.5 일부 마크 조기 출시 가능

### ADR-011 — NextAuth.js v5 + Naver + Supabase JWT
**결정**: NextAuth로 OAuth 처리 + Supabase JWT 동기화  
**이유**: Supabase Auth 네이버 미지원  
**대안**: 자체 OAuth (구현 부담), 카카오 로그인만  
**트레이드오프**: JWT 동기화 복잡성  
**롤백**: Supabase Auth 이메일 only로 V1 시작

### ADR-012 — Recharts (V2 ECharts 검토)
**결정**: V1 Recharts  
**이유**: React 친화 + V1 충분  
**롤백**: V2에서 ECharts (어댑터 분리)

### ADR-013 — Serwist (vs next-pwa)
**결정**: Serwist  
**이유**: next-pwa 후속, Next 15 App Router 호환  
**대안**: 자체 SW, workbox 직접  
**롤백**: 자체 service worker

### ADR-014 — TanStack Query v5
**결정**: 클라 서버 상태 관리  
**이유**: 즐겨찾기·랭킹 캐시 + optimistic 표준  
**대안**: SWR, Zustand+fetch  
**롤백**: SWR로 교체

### ADR-015 — Postgres FTS + pg_trgm (vs Meilisearch)
**결정**: V1 Postgres만  
**이유**: 무료 + V1 자동완성 충분  
**대안**: Meilisearch, Algolia  
**트레이드오프**: 한국어 형태소 부족  
**롤백**: V2 트래픽 시 Meilisearch 셀프호스팅

### ADR-016 — GitHub Actions 백필 cron
**결정**: 백필은 GitHub Actions, 일배치만 Vercel Cron  
**이유**: Vercel Hobby Cron 한도 회피, 5,760회 분할 호출  
**대안**: 로컬 스크립트 수동  
**롤백**: 로컬 cron으로 회귀

### ADR-017 — PostHog Free Analytics
**결정**: PostHog Cloud Free  
**이유**: 1M events/월 + 펀넬 + 세션 리플레이 무료  
**대안**: GA4(개인정보 이슈), Plausible(유료)  
**롤백**: 자체 호스팅 PostHog

### ADR-018 — 오렌지 액센트 #ea580c
**결정**: 단일 액센트  
**이유**: "단지온도" 메타포 + 호갱노노 블루와 차별  
**대안**: 무채색 only, 블루  
**롤백**: 톤 조정 (#f97316 등)

### ADR-019 — TypeScript strict + noUncheckedIndexedAccess
**결정**: 양 옵션 모두 활성  
**이유**: 런타임 에러 사전 차단  
**롤백**: 부분 비활성

### ADR-020 — RSC 기본 + Client 최소
**결정**: 데이터 페치는 RSC, 인터랙션만 Client  
**이유**: 번들 축소, SEO  
**롤백**: 페이지 단위 Client 회귀

### ADR-021 — 지오코딩 2단계 (도로명 → 카카오 보완)
**결정**: 행안부 도로명주소 1차, 실패분만 카카오 로컬 2차  
**이유**: 정확도 + 카카오 한도 절약  
**롤백**: 한쪽 only

### ADR-022 — 거래 멱등 키 = (시군구, 연월, 단지코드, 거래일, 가격, 면적)
**결정**: 6필드 복합 키  
**이유**: 국토부 API에 안정 ID 없음  
**트레이드오프**: 거래 정정 시 별도 처리 필요  
**롤백**: 정정 케이스 발견 시 `superseded_by` 컬럼으로 보정

### ADR-023 — 알림 큐 = Postgres 테이블 + GitHub Actions 5분 워커
**결정**: `notifications` 테이블 + GitHub Actions cron `"*/5 * * * *"` 워커  
**이유**: Vercel Hobby cron은 1일 1회 한도 — 5분 폴링 불가. GitHub Actions 5분 간격은 무료 한도 내 가능. 알림 latency ≤ 10분(베타 기준) 허용  
**대안 검토**: Upstash QStash(무료 500req/일, 충분하나 외부 의존 추가), Vercel Pro($20/월)  
**트레이드오프**: cold-start ~30s 지연. Actions 장애 시 알림 중단(Sentry로 모니터링)  
**롤백**: V2 트래픽 급증 시 Upstash QStash로 전환

### ADR-024 — IP 해시 저장 (광고 트래킹)
**결정**: `ad_events.ip_hash = sha256(ip + secret)`  
**이유**: 개인정보 위험 회피 + fraud 탐지 가능  
**롤백**: salt 회전 정책 추가

### ADR-025 — 광고 상태 머신 (draft → pending → approved → ended)
**결정**: 명시적 status enum + 상태 전이  
**이유**: 검수 누락 방지, 표시광고법 게이트  
**롤백**: 단순 boolean으로 회귀

### ADR-026 — Server Action 우선
**결정**: 폼·mutation은 Server Action. 인터랙션만 Client  
**이유**: 번들 축소  
**롤백**: API Route + fetch

### ADR-027 — 이메일 = Resend
**결정**: V1 Resend Free  
**이유**: 한도 도달 전까지 무료. React Email 통합  
**롤백**: SES 마이그레이션 (어댑터 인터페이스 유지)

### ADR-028 — 모니터링 = PostHog + Sentry 분리
**결정**: 분석 PostHog, 에러 Sentry  
**이유**: 각 영역 무료 한도 풍부  
**롤백**: 한쪽 자체 호스팅

### ADR-029 — 백업 = Supabase + 주간 pg_dump
**결정**: Supabase 7일 + 주간 GitHub private repo dump  
**트레이드오프**: RPO 24h  
**롤백**: 매출 발생 시 일간 외부 백업 추가

### ADR-030 — Conventional Commits + feat-{phase} 브랜치
**결정**: Harness `scripts/execute.py` 패턴 그대로  
**이유**: step 단위 commit + Stop hook 게이트  
**롤백**: 직접 main commit (긴급 패치)

### ADR-031 — A11y = WCAG 2.1 AA + axe-core CI
**결정**: PR마다 axe-core + 테스트 페이지 4개 통과  
**트레이드오프**: CI 시간 증가  
**롤백**: AA 일부 항목만 강제

### ADR-032 — 한국어 검색 = 자모 분해 + 초성 (단계적)
**결정**: V1 = `name_normalized` + `pg_trgm`. V2 = 자모/초성 인덱스  
**롤백**: pg_trgm threshold 조정

### ADR-033 — 단지 Golden Record 패턴 + 별칭 학습
**결정**: `complexes`를 단일 진실로 정의. 외부 표기는 `complex_aliases`에 누적  
**이유**: 5+ 출처가 같은 단지를 다르게 표기. 출처별 코드로 PK 불가 (신축 부재·개명 처리)  
**대안**: 국토부 단지코드 PK, 매번 fuzzy 조회  
**트레이드오프**: 매칭 파이프라인 복잡 + 별칭 테이블 부피  
**롤백**: 매칭 신뢰도 임계 조정 (0.9 → 0.85)

### ADR-034 — 단지 매칭 = 좌표·이름·시기 3축 복합 + 신뢰도 임계
**결정**: ① 도로명+건축연도 → ② 좌표±200m + trigram ≥ 0.7 → ③ 행정동+지번+fuzzy → ④ 운영자 큐  
신뢰도: 0.9+ 자동 / 0.7~0.9 운영자 큐 / 0.7- 차단  
**이유**: 단지명 단독 매칭은 동음이의·표기변동·신축에서 모두 실패  
**롤백**: 임계 조정

### ADR-035 — 단지 라이프사이클 status enum + 신축 사전 등록
**결정**: 6단계 enum. 신축은 분양 단계부터 운영자 수동 등록 (임시 ID + 가칭)  
**이유**: 신축 1~2년 데이터 다층 부재 처리  
**롤백**: 입주 후만 등록

### ADR-036 — 재건축 모델: predecessor/successor + deal_subtype 분리
**결정**: `complexes` self-FK + `redevelopment_projects` 별도 단계 테이블 + `deal_subtype(sale/occupancy_right/pre_sale_right)`  
**이유**: 같은 위치 시간순 다른 단지 + 입주권/분양권 의미 다름  
**롤백**: 입주권/분양권 토글 OFF + status 단순화

### ADR-037 — 데이터 소스별 차등 갱신 정책 (data_sources 메타)
**결정**: `data_sources` 메타 테이블 + 소스별 cron 분리 (일/월/분기/연) + UI "기준일" 라벨  
**이유**: 실거래 일별·관리비 월별·학군 분기 → 단일 cron은 무의미  
**롤백**: 단일 일배치로 회귀

### ADR-038 — 거래 정정 처리 = superseded_by + cancel_date
**결정**: 정정 신고 = 새 row + 이전 row `superseded_by` 표시. 취소 = `cancel_date` 채움  
**이유**: 감사 추적 필수. 멱등 키에 가격 포함되어 정정은 새 row만 가능  
**트레이드오프**: 모든 산식 쿼리에 `WHERE superseded_by IS NULL` 강제  
**롤백**: history 테이블 마이그레이션

### ADR-039 — 매칭 신뢰도 자동 임계 = 0.9
**결정**: 0.9 이상만 자동. 그 외 운영자 큐  
**이유**: 사용자 의지 = 자동화 최대화. 잘못된 매칭은 신뢰성 영구 훼손  
**롤백**: 운영자 부담 과다 시 0.85로 완화

### ADR-040 — 신축 사전 등록 = 운영자 수동 (분양 자동 적재 V2)
**결정**: V1~V1.5는 운영자 어드민에서 수동 등록  
**이유**: 분양 공고 데이터 정형화 부족  
**롤백**: V1.5 분양 API 자동화 추가

### ADR-041 — 재건축 행정 데이터 자동 적재 = V2 보류
**결정**: V1~V1.5는 운영자 수동 입력. 창원시·김해시 행정 데이터 접근 미확인  
**롤백**: V2 출처 확인되면 어댑터 추가

### ADR-042 — 신축 데이터 부재 → AI 자동 추정 + 명시 라벨
**결정**: K-apt 등 부재 시 인근 유사 단지(거리·세대수·연식·평형) 통계 기반 추정. UI에 "AI가 자동 추정한 값입니다" 라벨 + 참고 단지 표시. `ai_estimates` 테이블 보존  
**이유**: 빈 화면 vs 추정치 — 추정치가 사용자 가치↑. 단, 라벨 필수  
**롤백**: 라벨 명시 + 사용자 신고 시 즉시 hide

### ADR-043 — 어드민 콘솔 = 별도 경로 + 2FA + audit_logs
**결정**: `/admin` + NextAuth 2FA (TOTP 또는 이메일 OTP) + IP allowlist + 모든 액션 audit_logs  
**이유**: 슈퍼어드민 = 모든 데이터 접근 → 보안·감사 최우선  
**롤백**: 핵심 메뉴부터 단계 출시

### ADR-044 — 카페 회원 인증 = 자가 신고 + 운영자 수동 검증
**결정**: 가입 후 카페 닉네임 옵션 입력 → 운영자 카페 회원 명단 대조 → `cafe_verified_at` 마킹  
**이유**: 네이버는 카페 회원 정보 API 미제공  
**롤백**: 인증 X로 회귀

### ADR-045 — 카드뉴스 자동 발행 = 자동 생성 + 운영자 1-click 수동 발행
**결정**: 일배치로 PNG + 카피 자동 생성 → 어드민 1-click 다운로드/복사 → 카페 1분 수동 발행. 완전 자동 발행 V2  
**이유**: 네이버 카페 봇 정책·약관 검토 필요. 1분 수동 발행이 V1 현실  
**롤백**: 자동 생성 OFF, 수동 운영

### ADR-046 — 익명 리뷰 위치 인증 = GPS 다단계 (L0~L3)
**결정**: GPS 1회=L1, 다회+시간패턴=L2, 우편/관리비=L3(V2). 원좌표 저장 X, 검증 결과만. 1년 만료  
**이유**: 호갱노노 미보유 콘텐츠 + 익명+신뢰성 = 진솔한 후기  
**롤백**: L0/L1만 단순화

### ADR-047 — 카드뉴스 이미지 생성 = `@vercel/og` + Recharts SSR
**결정**: 표지·단지 카드는 `@vercel/og` (JSX→PNG). 그래프 sparkline은 Recharts 서버 렌더 → SVG → PNG  
**이유**: 무료 + 빠름 + Vercel 통합  
**트레이드오프**: `@vercel/og`는 flex CSS만 지원  
**롤백**: Puppeteer로 회귀

### ADR-048 — 광고 결제 모델 V1 = 수동 청구 (PG 연동 V2)
**결정**: V1.0은 계좌이체 + 수동 청구서(거래명세서) PDF 발행. PG 연동은 V2.  
**이유**: V1.0 MVP에서 PG 계약·연동 시간 비용 > 초기 광고주 수. 수동 청구로 충분  
**트레이드오프**: 운영자 청구 수작업. 광고주 즉시 결제 불가  
**구현**: `ad_invoices` 테이블 + React PDF 청구서 + Resend 발송 (1-launch step8-5)  
**롤백**: PG 계약 완료 후 `ad_invoices.payment_method = 'pg'` 추가 + V2 PG 어댑터

### ADR-049 — Vercel Hobby Cron 한도 = 일 1회. 알림 워커는 GitHub Actions
**결정**: Vercel Hobby는 cron job당 최대 1회/일. CLAUDE.md의 "5분 간격 알림 워커"는 GitHub Actions cron `"*/5 * * * *"`으로 구현 (V0.9 베타 latency ≤ 10분 허용)  
**이유**: Hobby에서 분 단위 cron 불가. GitHub Actions 무료 한도 내 가능 (월 2,000분)  
**트레이드오프**: GitHub Actions cold-start ~30s. 트래픽 증가 시 Vercel Pro($20/월) 또는 Upstash QStash로 전환  
**롤백**: 알림 latency 10분 초과 시 Upstash QStash Free(500req/일) 도입

### ADR-050 — 백업·복구 = Supabase 7일 + 주간 pg_dump GitHub private
**결정**: Supabase Free 7일 자동 백업 + 주간 GitHub Actions pg_dump → private repo  
**이유**: Supabase Free는 PITR 미지원. RPO 7일 독립 외부 백업 필요  
**트레이드오프**: RPO 7일. 매출 발생 후 일간 외부 백업 전환 권장  
**구현**: `.github/workflows/backup.yml` 주간 cron (1-launch step17)  
**롤백**: Supabase Pro($25/월) — PITR + 일간 자동 백업 지원

### ADR-051 — 단지 마스터 시드 = K-apt 단지 목록 API (cold-start 부트스트랩)
**결정**: `complexes` Golden Record 초기 적재는 K-apt 단지 목록 API 사용. step3a에서 창원·김해 전 단지 일괄 시드  
**이유**: step3b 매칭이 작동하려면 `complexes`에 후보 단지가 있어야 함. step16 어드민 등록만으로는 ingest 전 cold-start 차단  
**트레이드오프**: K-apt 미등록 신축·소규모 단지 누락 → 운영자 수동 등록 보완  
**롤백**: MOLIT 첫 ingest 결과로 역으로 단지 추출 (정확도 낮음)

### ADR-052 — 보안 패치 SLA = npm audit 주 1회 + dependabot + CVE 대응 24h
**결정**: GitHub Actions 주 1회 `npm audit --audit-level=high` CI + dependabot 자동 PR. Critical/High CVE는 24h 내 핫픽스 배포  
**이유**: 오픈소스 의존성 공급망 취약점이 V1.0 출시 후 보안 위협  
**트레이드오프**: dependabot PR 관리 부담  
**구현**: `.github/dependabot.yml` (npm 주간) + `.github/workflows/audit.yml` (주 1회 High+)  
**롤백**: 패치 불가 패키지는 `npm audit ignore` + 이슈 트래킹

### ADR-053 — 에러 핸들링 표준 = 계층별 정책 + 부분 실패 허용
**결정**: (1) 외부 API 어댑터는 5회 지수 백오프. (2) HTTP 410 / Resend 422 는 재시도 금지. (3) ingest 배치는 row 단위 부분 실패 허용 (전체 중단 없음). (4) zod 실패율 > 5% → 배치 중단 + Sentry alert. (5) 사용자에게 기술 에러 메시지 노출 금지  
**이유**: 외부 API 장애가 전체 서비스를 멈추지 않도록. 재시도가 오히려 해가 되는 케이스(410, 422)는 명시적으로 금지. 스키마 변경 조기 감지  
**트레이드오프**: 부분 실패 허용 시 데이터 불완전 적재 가능 — 운영자가 `data_source_runs` 로그로 확인 필요  
**구현**: `docs/ARCHITECTURE.md` "에러 핸들링 표준" 섹션. 각 step 가드레일에 반영  
**롤백**: 배치 완전 실패 정책으로 전환 시 `ingest_runs.policy = 'all_or_nothing'` enum 추가

### ADR-054 — 광고 UTC/KST = DB는 UTC, UI는 KST 표시
**결정**: `ad_campaigns.starts_at`, `ends_at`는 UTC로 DB 저장. 어드민 UI에서 KST 입력 → 저장 시 UTC 변환. 게재 쿼리 `now() BETWEEN starts_at AND ends_at`는 변환 없이 올바름  
**이유**: Postgres `now()`는 UTC. DB 내 시간대 혼재 방지  
**트레이드오프**: 어드민 UI에서 변환 로직 필요. 광고주가 KST로 기대하므로 UI에 "(KST)" 명시 필수  
**롤백**: `timestamptz`가 이미 타임존 정보를 포함하므로 코드 수정 없이 정책 변경 가능

### ADR-055 — 매직링크 보안 = 단회용 + 15분 TTL + brute force 방어
**결정**: 매직링크 토큰은 1회 클릭 시 즉시 소비(one-shot). TTL 15분. 동일 이메일 5분/3회 초과 요청 시 429 + 5분 cooldown  
**이유**: 링크 재사용 공격 및 이메일 인박스 접근 공격 방어  
**트레이드오프**: 링크 만료 시 재발급 UX 마찰  
**구현**: NextAuth EmailProvider의 `generateVerificationToken`에 rate limit 래퍼. `magic_link_requests` 테이블 또는 Redis 슬라이딩 윈도우  
**롤백**: Supabase Auth OTP로 전환 (NextAuth EmailProvider 대체)

### ADR-056 — data.go.kr 러너 IP 차단 대응 = 새 job 으로 재시도 (프록시·self-hosted 아님)
**결정**: MOLIT 수집을 재사용 워크플로(`molit-ingest-attempt.yml`)로 분리하고, 차단 러너를 뽑으면 즉시 exit 75 후 **새 job**에서 최대 3회까지 재시도한다  
**이유**: data.go.kr 은 GitHub Actions(Azure) IP 중 **일부를 TCP 레벨에서 차단**한다. 러너 6대를 동시에 띄워 같은 키·같은 요청·같은 DNS(27.101.236.63)로 확인한 결과 2대는 `UND_ERR_CONNECT_TIMEOUT`(10.5초), 4대는 HTTP 200 이었다(2026-08-04). 같은 /16 안에서도 갈리므로 대역 차단이 아니라 개별 IP 차단이고, 러너 IP 는 전 세계가 공유하니 **우리 트래픽과 무관하게** 이미 막힌 IP 를 배정받는다. 한 job 은 수명 내내 IP 하나를 유지하므로 결과가 0 아니면 100 이 된다 — 08-02·08-03 이틀 다 152/152 실패, 0건 적재였다. 반면 같은 밤 20:02 에 돈 오피스텔 배치는 **동일 호스트에 성공**했다(다른 job = 다른 IP). IP 를 바꾸는 유일한 방법이 새 job 이라, 재시도 단위를 요청이 아니라 job 으로 올렸다  
**트레이드오프**: 워크플로 파일이 2개로 늘고 재시도 시 러너 시간이 최대 3배. 대신 프록시(Vercel)·self-hosted 러너 같은 신규 인프라가 필요 없고, 프록시 IP 역시 차단될 수 있다는 위험을 지지 않는다. 회당 차단 확률 1/3 기준 3회면 전부 실패할 확률 약 4%  
**구현**: `describeError`/`isConnectivityError`(`src/lib/api/describe-error.ts`) + `backfill-realprice.ts` preflight 1회 및 연속 3회 연결 불가 시 중단 + `molit-daily.yml` 의 attempt1→2→3 체인. 3회 모두 차단이면 워크플로를 실패(빨간불)로 남긴다  
**롤백**: `molit-daily.yml` 을 단일 job 으로 되돌린다. preflight 와 describeError 는 남겨둔다 — 진단 가치가 재시도와 독립적이다

> **부수 교훈**: undici(Node fetch)는 실제 원인을 전부 `err.cause` 에 넣고 겉면은 항상 `TypeError: fetch failed` 로 통일한다. `String(err)` 로 로그를 찍으면 DNS·커넥트 타임아웃·TLS·소켓 끊김이 **전부 같은 글자로 보인다**. 이 한 줄 때문에 이틀짜리 전면 장애를 "원인 불명"으로 방치했다. 네트워크 에러 로깅은 반드시 `describeError` 를 쓴다.

### ADR-057 — 배치 감시 = 데이터 신선도 + 잡 상태 2층, 출처는 `source_run_id`로 판별
**결정**: `check-data-freshness.ts`가 (1) 테이블별 최신 타임스탬프와 (2) `data_sources.last_status='failed'` 두 층을 함께 본다. 한 테이블을 여러 배치가 공유하면 `source_run_id → ingest_runs.source_id`로 **출처를 갈라** 배치별로 따로 잰다  
**이유**: 한 층만으로는 각각 구멍이 있다. 데이터 층은 테이블 공유에 가려진다 — 08-02·08-03 아파트 실거래가 152/152 실패로 0건이었는데 오피스텔 배치가 같은 `transactions`에 29행을 넣어 "0.2일 신선" 초록이 나왔다. 반대로 잡 층은 실패를 보고조차 안 하는 침묵 실패를 놓친다(네이버 크롤러가 두 달째 그 상태). 두 층이 서로의 사각지대를 덮는다  
**왜 `building_type`이 아니라 `source_run_id`인가**: 처음엔 `complexes.building_type <> 'officetel'`로 거르려 했는데 **그것도 못 잡는다**. 오피스텔 배치가 넣은 08-03자 33행 중 4행이 `building_type='apt'` 단지에 붙어 있었다(오피스텔 건물이 `complexes`에 apt로 등록된 경우가 있다). 건물 유형은 출처의 근사치일 뿐이라 감시 기준이 될 수 없다. `source_run_id`가 유일하게 정확하다 — 이 기준으로는 `molit_trade` 최종 적재가 08-01에 멈춰 있던 게 즉시 드러난다  
**트레이드오프**: 조인 때문에 실거래 점검이 3.4→4.6초로 느려진다. 일 1회 감시라 무의미한 비용이다. `ingest_runs`에 출처를 안 남기는 배치는 이 방식으로 감시할 수 없다 — 새 배치는 `source_run_id`를 반드시 채워야 한다  
**구현**: `Check.embeddedFilter`(PostgREST `!inner` 임베딩) + `checkFailedJobs()`. 위반 시 exit 1, `--warn-only`로 보고만 가능  
**롤백**: `embeddedFilter`를 빼면 기존 테이블 단위 점검으로 되돌아간다. 다만 그 순간 실거래 감시가 다시 무력해진다

> **상태 어휘 규칙**: 배치 상태에 `failed`가 **반드시** 있어야 한다. `success|partial` 두 값뿐이면 전량 실패가 구조적으로 표현 불가능해져 초록불로 묻힌다 — MOLIT(ADR-056)와 K-apt가 같은 이유로 각각 이틀·한 달을 묻혔다. "대상이 있었는데 0건 적재"는 언제나 `failed`다.

### ADR-058 — 배포 리전 = syd1 (DB와 같은 대륙), iad1 기본값 탈출
**결정**: `vercel.json`에 `"regions": ["syd1"]`을 명시한다. 이전에는 이 키가 아예 없어 Vercel 기본값 `iad1`(미국 동부 워싱턴 D.C.)에서 함수가 돌았다  
**이유**: Supabase 프로젝트는 `ap-southeast-2`(시드니)인데 함수는 `iad1`이었다 — **모든 DB 왕복이 태평양을 건넜다**(`vercel inspect` 출력의 `λ index (4.01MB) [iad1]`로 확인, 2026-08-07). `/api/cron/daily`는 분양권전매·청약홈·잔여세대·경쟁률·오피스텔·K-apt를 **순차로** 처리하며 단건 upsert를 수백 번 날리는 구조라, 편도 지연이 그대로 곱해진다. 실제 증상: `data_sources.daily-batch`가 2026-08-06 04:04 이후 보고를 멈춰 SLA 28시간을 넘겼고, 08-07 실행에서는 K-apt가 **36행을 성공적으로 쓰고도** 상태 기록에 도달하지 못한 채 죽었다(성공했는데 `failed`로 남는다)  
**전례**: 같은 DB를 쓰는 `realtrade-story`가 동일한 이동을 먼저 했고 실측이 남아 있다 — `/ranking?sort=new_record&period=3m` 4.75초 → 0.54초, 단지상세 약 2.1초 → 0.71초. 우려했던 "한국 사용자 TTFB 편도 +150ms"는 DB 왕복 절감이 압도해 문제가 되지 않았다  
**트레이드오프**: 한국 사용자 기준 엣지 지연이 iad1보다 오히려 짧고(시드니가 가깝다), 이 저장소는 memory 기준 수집 전용이라 사용자 대면 지연 민감도도 낮다. 리전 이동으로 잃는 것이 사실상 없다  
**측정하지 못한 것**: 함수 실제 실행시간과 플랜 한도는 확인하지 못했다 — 런타임 로그 보존 기간이 지났다. 그래서 "몇 초를 줄인다"가 아니라 **"왕복 비용의 지배적 원인을 제거한다"**까지만 주장한다. 효과 판정은 다음 04:00 KST 배치의 `data_sources.daily-batch` 보고 여부로 한다  
**남은 위험**: 리전으로 빨라져도 외부 API(MOLIT·청약홈·K-apt) 응답이 느려지면 같은 증상이 재발한다. 근본 방어는 라우트 전역 데드라인(각 단계가 남은 시간을 보고 진행 여부를 정하고 상태 기록용 시간을 남기는 것)이고, 이번에는 넣지 않았다. `finally`로는 못 고친다 — 플랫폼이 강제 종료하면 `finally`도 실행되지 않는다  
**롤백**: `regions` 키를 지우면 기본값으로 돌아간다. 코드 변경이 없어 되돌리기 비용이 0이다

### ADR-059 — 네이버 크롤러 2종 = 차단 확인 후 "보류(paused)"로 분리, 끄지 않고 감시에서 뺀다
**결정**: `naver-listings-biweekly.yml`·`naver-area-types-monthly.yml`의 `schedule`을 주석 처리하고(`workflow_dispatch`는 유지), `check-data-freshness.ts`의 해당 두 `Check`에 `pausedReason`을 달아 **위반으로 세지 않되 목록에는 계속 표기**한다  
**이유**: 네이버가 GitHub Actions IP를 차단해 200개 단지가 전부 매물 0건으로 돌아온다(`error: 0`). 두 번 독립 확인했다 — 2026-08-03 국내 로컬에서 정상 수집(AK휴웰아파트 10건), 2026-08-07 프로브에서 `/api/articles/complex/{no}`가 쿠키 없이 200 + `articleList` 20건 정상 반환. **API 경로도 응답 형태(`articleList`/`tradeTypeName`/`dealOrWarrantPrc`/`area2`)도 그대로였고, 쿠키를 빼거나 무효값을 넣어도 결과가 같아 세션 만료도 원인이 아니다.** 남는 차이는 실행 환경뿐이다(Azure 러너 IP·6탭 동시·200개 연속). ADR-056의 data.go.kr 차단과 같은 부류다  
**왜 끄지 않고 "보류"인가**: 고칠 수 없는 항목이 주 2회(+월 1회) 확정 실패를 내면 감시기 전체가 무의미해진다 — 이 저장소가 이미 겪은 실패 모드다(ADR-057, `school_alimi`). 실제로 2026-08-07 신선도 점검 위반 4건 중 2건이 이 크롤러였고, **같은 날 이 감시기가 찾아낸 진짜 고장(gap-stats 타임아웃·kapt 상태 정지)이 그 소음에 묻힐 뻔했다.** 그래서 끄는 게 아니라 **분리**한다: 목록과 경과일은 그대로 보이고, 위반 집계에서만 뺀다  
**보류가 실명이 되지 않게**: 보류 항목이 다시 신선해지면 `▶️ 보류 해제 후보`로 알린다. 이 장치의 유일한 실패 모드가 "차단이 풀렸는데 아무도 모르는 것"이라, 복구 감지를 같이 넣었다  
**영향 범위**(2026-08-07 실측): 운영권역 활성 1,895곳 중 평형정보 보유 965곳(51%). 평형정보가 없으면 화면은 공식 평형명 대신 "전용 N㎡"로 폴백한다(설계된 동작, realtrade-story `peak-gap.ts`·`FloorPremiumCard` 규칙). 수집이 멈춘 2026-06-19 이후 운영권역 신규 단지는 **1곳**뿐이라 보류 중에 더 나빠지지는 않는다. `listing_prices`는 realtrade-story가 아예 쓰지 않는다  
**하지 않은 것**: 자체 호스팅 러너(상시 가동 PC 필요)와 프록시. 프록시는 ADR-056에서 이미 기각했다 — 프록시 IP도 차단될 수 있어 위험만 옮긴다  
**롤백**: 두 워크플로의 `schedule` 주석을 풀고 `pausedReason`을 지운다. 차단 해제 확인은 `workflow_dispatch` 수동 실행(limit=10 권장)으로 한다

### ADR-060 — transactions autovacuum = scale_factor 0.05 (기본 0.2 는 이 테이블에 안 맞는다)
**결정**: `ALTER TABLE public.transactions SET (autovacuum_vacuum_scale_factor = 0.05)`. 일회성 `VACUUM (ANALYZE)`도 함께 실행했다(2026-08-07 08:20 UTC)  
**이유**: dead tuple 151,452건(18%)이 쌓였는데 마지막 autovacuum이 2026-07-25였다. **처음엔 "autovacuum이 죽었다"고 봤으나 아니었다** — 설정은 전부 정상이고(`autovacuum=on`, threshold 50, scale_factor 0.2 기본값, 테이블 개별 설정 없음), 발동 임계값이 `50 + 0.2 × 837,661 = 167,582`건이라 **아직 때가 아니라고 판단하고 있었을 뿐**이다. 문제는 그 20%를 기다리는 동안 visibility map이 낡아 **Index Only Scan이 index-only가 아니게 된다**는 것이다  
**실측**(`compute_gap_stats` 내부 스캔): VACUUM 전 `Heap Fetches 95,417` / 5,482ms → 후 `Heap Fetches 0` / 3,818ms. **Heap Fetches를 판정 지표로 쓴 이유는 캐시 상태에 흔들리지 않기 때문이다** — 실행시간만 봤으면 warm/cold 차이와 구분할 수 없었다(같은 날 `compute_gap_stats`를 cold 한 번만 재고 오판할 뻔한 전례가 있다)  
**파급**: gap-stats만의 문제가 아니다. `transactions`를 Index Only Scan하는 모든 경로가 함께 느려진다 — realtrade-story의 전고점 조회(`complex_historical_max_before`, 20260731000001 부분 인덱스)도 포함된다  
**왜 transactions만인가**: `n_live_tup > 20000` 테이블을 전수 확인했다. dead 비율이 눈에 띄는 건 `complex_price_predictions`(10.1%)·`facility_school`(10.9%)인데 둘 다 22MB·10MB로 작고 각자 임계값(8,736/4,767)에 근접해 곧 정리된다. **크고 변경이 잦아 20%가 16만 건이 되는 테이블은 `transactions` 하나뿐**이다  
**값 선택**: 0.05 → 임계값 약 41,933건(약 4배 자주). 이 테이블 VACUUM은 실측 몇 초 수준이고 384MB라 비용이 문제되지 않는다. 더 낮추지 않은 이유는 테이블이 매일 자라기 때문이다 — 200만 행이 돼도 10만 건이라 여전히 지금보다 낫고 과도한 vacuum I/O도 피한다  
**하지 않은 것**: `VACUUM FULL`. 배타 락으로 테이블을 재작성해 운영 중 위험하다. 일반 `VACUUM`은 읽기·쓰기를 막지 않는다  
**롤백**: `ALTER TABLE public.transactions RESET (autovacuum_vacuum_scale_factor);` — 데이터 영향이 없어 비용 0

### ADR-061 — backup_agent 에 BYPASSRLS = 백업이 6주째 스키마만 담기던 근본 원인
**결정**: `ALTER ROLE backup_agent BYPASSRLS`(마이그레이션 `20260810...`). 함께 `db-backup.yml` 에서 stderr 를 백업 파일 밖으로 빼고, 크기 가드를 10KB → 10MB 로 올리고, `COPY` 블록 20개 이상 검사를 추가했다  
**증상**: 주간 DB 백업이 6주 넘게 **초록불이면서 데이터가 없었다**. 덤프가 38~43KB 로 고정이었고, 실제로 열어보니 `CREATE TABLE` 99개는 다 있는데 `COPY` 는 1개뿐이며 `auth.audit_log_entries` 한가운데서 끊겨 있었다 — 첫 데이터 테이블에서 죽은 것이다  
**원인**: `pg_dump: error: query failed: ERROR: query would be affected by row-level security policy for table "audit_log_entries"`. `backup_agent` 는 `pg_read_all_data` 멤버라 SELECT 는 되지만 **그 역할은 BYPASSRLS 를 주지 않는다**(PostgreSQL 문서 명시). `pg_dump` 는 `row_security=off` 로 접속하는데 그 설정은 "RLS 가 결과를 거르면 조용히 넘기지 말고 **에러를 내라**"는 뜻이라 RLS 걸린 첫 테이블에서 즉사한다. 이 DB 의 RLS 테이블은 public 64 + auth 16 + storage 8 = **88개**  
**왜 6주 동안 몰랐나 — 세 결함이 겹쳤다**: ① `2>&1 | gzip` 이 stderr 를 **백업 파일 안으로** 밀어넣어 Actions 로그가 깨끗했다 ② `set -e` 는 파이프라인 중간 명령의 실패를 못 잡는다(최종 종료코드는 `gzip` 의 0) ③ 크기 하한 10KB 가 무의미했다 — 스키마만 담긴 43KB 가 그대로 통과. **가드가 있다고 지켜지는 게 아니다. 임계값이 실제 실패를 걸러야 가드다**  
**거부한 대안**: `pg_dump --enable-row-security`. RLS 에 보이는 행만 담아 **조용히 부분 백업**을 만든다 — 크기·종료코드가 정상이라 아무도 모르고, 복구할 때 알게 되는데 그때는 늦다. 이 저장소가 반복해서 당한 부류다(ADR-056/057)  
**보안 판단**: `backup_agent` 는 이미 `pg_read_all_data` 로 전 테이블 SELECT 권한이 있다. BYPASSRLS 가 추가로 여는 것은 "RLS 로 걸러지던 행"뿐이고 백업은 정의상 그게 필요하다. superuser·createrole·createdb 는 전부 false 유지, 쓰기 권한 없음  
**검증**: 수정 후 실행 — raw 318MB / 압축 66MB / `COPY` 블록 **100개**(이전 1개). 릴리즈 업로드 확인  
**발견 경위**: 부산 데이터 28만건 삭제를 준비하다 **롤백 경로를 확인하는 과정**에서 드러났다. 백업이 없어 삭제는 중단했다 — 되돌릴 수 없는 삭제 전에 백업을 확인하는 절차가 실제로 사고를 막았다  
**롤백**: `ALTER ROLE backup_agent NOBYPASSRLS;` — 단, 그러면 백업이 다시 스키마만 담긴다
