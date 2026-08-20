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

### ADR-062 — 수집 범위를 경남 22개 시군으로 축소, 부산 16개 구 정리
**결정**: 부산광역시 16개 자치구 데이터를 전부 삭제하고 `regions.is_active = false` 로 수집을 중단한다. 경남 22개 시군은 유지한다  
**이유**: Supabase Free 한도(500MB)를 초과한 상태였다(565MB). realtrade-story 는 창원 5구+김해만 서비스하고, **단지온도(danjiondo) 사이트는 더 이상 사용하지 않기로 확정**했다(2026-08-10 사용자) — 이제 이 DB 는 API·수집 용도다. 부산은 danjiondo 시절의 확장 범위였고 realtrade-story 는 애초에 조회하지 않는다  
**왜 경남 기타는 남겼나**: 진주·양산 등으로 권역을 넓힐 여지를 유지하기 위함. 부산만 정리해도 한도 아래로 내려간다(실측 403MB)  
**삭제 전 확인**: `complexes` 를 참조하는 FK 25개를 전수 조사했다. **사용자가 만든 데이터는 전부 0건**(favorites·complex_reviews·gps_visits·realtor_assignments·ai_estimates·content_complexes). 지운 것은 transactions 282,444 / complex_price_predictions 11,611 / cafe_articles 1,654 / complexes 1,594 / facility_kapt 1,463 / complex_rankings 330 / complex_gap_stats 299  
**롤백 경로를 먼저 만들었다**: 삭제 직전 백업을 확인하니 6주째 스키마만 담고 있었다(ADR-061). **삭제를 중단하고 백업부터 고쳤다.** 되돌릴 수 없는 작업 전에 롤백 경로를 확인하는 절차가 실제로 사고를 막았다  
**결과**: DB 565MB → **403MB**(한도의 80.5%). 운영권역 거래 303,837 / 활성단지 1,895 / 즐겨찾기 4 — 전부 그대로  
**부수 발견 — FK 인덱스 부재**: 삭제가 두 번 타임아웃 났고 에러 CONTEXT 가 원인을 알려줬다. `transactions.superseded_by`(자기참조 FK)와 `complexes.successor_id`/`predecessor_id` 에 인덱스가 없어 삭제 1건마다 전체 스캔이 돌았다. **Postgres 는 FK 생성 시 참조받는 쪽만 자동 인덱싱하고 참조하는 쪽은 만들어주지 않는다.** 부분 인덱스(non-NULL 만)로 넣으니 거의 0바이트에 배치가 즉시 끝났다(20260810053853, 20260810054257)  
**교훈 — DELETE 만으로는 용량이 줄지 않는다**: 28만건 삭제 직후 DB 가 565 → **567MB 로 오히려 늘었다.** 일반 `VACUUM` 은 공간을 재사용 가능으로 표시할 뿐 OS 에 반환하지 않는다. `VACUUM FULL` 이 필요하다(배타 락 — 사용자 0명이라 수행 가능했다)  
**되돌리려면**: `regions.is_active = true` 후 MOLIT 백필로 재수집. 백업 복원보다 이쪽이 안전하다 — 백업 복원은 그 시점 이후의 창원·김해 데이터까지 되돌린다  
**상태**: 확정 (2026-08-10)

### ADR-063 — ad_campaigns DELETE 정책 누락: 어드민 삭제가 "0행 성공"으로 조용히 끝나고 있었다

**결정**: `ad_campaigns` 에 realtrade-story 사이트 관리자용 DELETE RLS 정책을 추가한다
(`20260811012345`). 조건은 기존 insert/update/select 세 정책과 **완전히 동일**하다 —
`site_id = 'realtrade-story'` 이고 호출자가 그 사이트의 `site_admin_roles` 에 있을 것.

**왜 없었나**: `20260728074553` 이 realtrade-story 어드민 정책을 만들 때 insert/update/select
셋만 넣고 delete 를 빠뜨렸다. 그런데 realtrade-story 어드민 화면에는 삭제 버튼이 있다.

**왜 아무도 몰랐나 — 이게 핵심이다**: RLS 는 매칭 정책이 없으면 기본 거부인데, **거부된
DELETE 는 에러가 아니라 0행 결과**로 끝난다. 앱의 `deleteAdCampaign()` 은 `error` 가 null 인
걸 보고 성공으로 처리했고, 관리자는 광고를 지웠다고 믿었지만 광고는 그대로 게재됐다.
만료·부적절 광고를 "지웠다"고 믿고 방치하게 되는 실질 위험이었다.

라이브 확인(2026-08-10): INSERT 2 / SELECT 3 / UPDATE 2 / **DELETE 0**.

**같은 부류의 세 번째다**: `increment_view_count` 가 RLS 에 막혀 전 단지 `view_count=0` 이던
일, realtrade-story 어드민 조회 실패가 "존재하지 않는 광고예요"라는 거짓 문구로 나가던 일,
그리고 이번. 공통점은 전부 **실패가 예외가 아니라 정상 응답의 모습으로 온다**는 것이다.
사람이 코드 리뷰로 잡기 구조적으로 어렵다 — 코드만 보면 아무 문제가 없어 보인다.

**앱 쪽 대응(realtrade-story)**: `.delete()` 가 반드시 `.select()` 로 실제 삭제 행을 확인하도록
바꾸고, 소스 전수 정적 게이트(`unconfirmed-delete-audit`)로 강제했다. 그 게이트를 붙이자마자
`removeFavorite`/`removeAreaTypeAlert` 두 곳을 더 찾았다. **정책을 고친 지금도 그 확인은 남긴다**
— 정책이 있다고 0행이 안 나오는 게 아니다(이미 지워진 id, 다른 사이트 광고, 권한 빠진 계정).

**거부한 대안**: advertiser(광고주)에게도 삭제 권한 부여. 승인·게재 이력이 남아야 하는
데이터라 셀프 삭제는 별도 논의가 필요하고, 지금 고치려는 문제도 아니다.

**공유 DB 안전성 검증**: 적용 후 실제 데이터로 확인했다 — 현재 `ad_campaigns` 9건이 전부
danjiondo 소유인데, 새 정책의 조건식을 그 행들에 평가하면 전부 `false` 다. `site_id` 조건이
막아주므로 이 정책으로 danjiondo 광고를 건드릴 수 없다.

**상태**: 확정 (2026-08-11, 적용 완료)

### ADR-064 — 부산 16개 구 수집 재개 (ADR-062 의 역방향)

**결정**: 2026-08-10 에 용량(Supabase Free 500MB 한도 / 실제 565MB) 때문에 끈 부산 16개
자치구 데이터 수집을 재개한다. 전제였던 용량 제약이 Pro 전환(8GB)으로 사라졌다.
`regions.is_active` 스위치는 이번엔 **정식 마이그레이션**(`20260819080000_reactivate_busan_scope.sql`)
으로 원장에 남겼다 — ADR-062 의 삭제는 statement timeout 때문에 `.applied-manually` 로
수동 배치했던 것과 다르다. `regions` 는 데이터 테이블이라 멱등 조건(`sgg_code LIKE '26%'`,
법정동코드 26 = 부산광역시 전용, 16행 전수 확인)으로 재실행에도 안전하다.
노출·도메인·`site_id` 의미는 realtrade-story ADR-012 소관이며 **이 저장소는 수집만 한다**
— bds 코드 변경은 이 Phase(41) 전체에서 `src/` 0건이다.

**`--resume` 함정과 그 발견**: 삭제 때 `ingest_runs` 를 지우지 않아 부산 4,006행(success
3,868 = apt 1,903 + villa 1,853 + offi 112)이 원장에 남아 있었다. `molit-backfill-once.yml`
이 `--resume` 를 하드코딩하므로, 원장을 그대로 두고 재실행했다면 **3,868건이 skip 되고
0건 적재로 초록불**이 됐을 것이다 — 이 저장소가 반복해서 겪은 "잡은 성공, 데이터는 없음"
부류(ADR-063 과 같은 모양). `--resume` 을 끄는 방식은 다음 중단·재개 때 같은 함정이
재발하므로 배제하고, **원장을 실제 데이터 상태(0행)와 일치시키는 것**을 근본 해결로
택해 부산 `ingest_runs` 4,006행을 삭제했다(오피스텔 112행 포함 — 오피스텔 재수집 자체는
범위 밖이나 기록만 남고 데이터가 없는 상태는 남기지 않았다). 첫 dispatch 의 skip 이
정확히 20(창원·김해 대칭 원리로 202607·202608 만) 이었던 것으로 실증했다.

**기간을 `201501` 로 넓힌 결정**: 부산은 원래 201607 부터만 수집돼 있었다(`ingest_runs
.year_month` 실측). 창원·김해(201501)와 대칭으로 맞추면서 삭제분(201607~202608)보다
576 지역-월 넓게 수집했다 — 랭킹·갭·예측의 시계열 길이가 지역별로 갈리는 것을 피하기
위함이다. 🔴 **이 "대칭" 전제가 사실이 아니었다** — 아래 "계획이 틀렸던 것" 참조.

**연결률 기준을 65% 로 정한 근거**: 운영권역(창원·김해) 94.6% 는 별칭 보정
(`complex_aliases`, 매칭 로직 개선, 토월성원 병합 등)이 누적된 결과이고, K-apt 시딩만
받은 경남 기타 16곳은 64.7% 다. 90% 를 요구하면 상시 빨간불이 되어 감시가 무력화된다.
부산 실측(아파트 67.2%)은 이 65% 임계를 통과했다.

**감시 기준선**: 미리 바꾸지 않고 부산 유입 후 실측해 판정했다. `complex-integrity.yml`
재dispatch 결과 `multi_jibun` 이 9→10 으로 움직였으나 **원인은 부산이 아니다** —
`complex_integrity_counts(text[])` 가 운영권역 6곳(`48121`~`48250`)으로만 배열 스코프돼
부산(26xxx)은 이 함수 인자에 들어가지 않는다(41-01 이 PostgREST OpenAPI 스펙의 실제
파라미터명 `p_sgg` 로 대조 확인). `turnover_anomaly`(23, 불변)·`empty_kapt`(59, 불변)가
그 스코프 격리를 재확인한다. 9→10 상향은 운영권역 내부의 **별개 신규 오염 1건**을
인지한 것이며, 원인 조사는 이 Phase 범위 밖으로 남겼다. `complex_integrity_counts(text[])`
는 **저장소에 `CREATE FUNCTION` 이 없다**(전수 grep 결과 참조 3곳뿐, 정의 0곳 — 프로덕션
전용 함수, 마이그레이션 drift). 파일화는 Phase 37 계열 후속 과제로 남긴다.

**미복원 항목**: `facility_kapt`(0/1,463, 0%) — K-apt 시설 enrichment(Phase 34-07 계열)는
이 Phase 범위 밖이라 재실행 경로가 없다. `complex_price_predictions`(0/11,611, 0%) —
아래 "가격예측 미실행" 참조. `cafe_articles` 는 예상과 달리 1,285/1,654(78%)가 이미
회복돼 있었다 — 지역 스코프 없이 전체 `complexes` 를 대상으로 매칭하는 별개 상시
크론(`cafe-ingest.yml`)이 41-03 의 K-apt 재시딩 이후 자연스럽게 매칭을 재개한 것이지,
이 Phase 가 복원한 것이 아니다.

**가격예측(`compute-predictions.yml`) 미실행**: 부산 단지 1,643개에 Chronos 예측 + Groq
해설을 채우는 작업으로, 이 Phase 에서 유일하게 외부 API 비용과 긴 실행시간이 드는
항목이라 오케스트레이터 지시로 실행하지 않았다. 예상 규모는 단지 수 비례로 약
11,500~13,500행. 최근 실행(2026-08-19, 부산 complexes 존재·거래 대부분 미존재 시점)이
이미 24m15s 로 `timeout-minutes: 30` 에 근접했고, 부산 거래 811,996건이 전부 들어간
지금 실행하면 30분 타임아웃을 넘길 위험이 실측 근거로 존재한다. 뒤이어 AI 코멘트까지
채우려면 GROQ 키 재발급도 선행돼야 한다(현재 재발급 필요 상태). 둘 다 후속 Phase 판단
사항으로 남긴다.

**다운스트림 — `complex_rankings.price_change`**: 부산 유입으로 `price_change` 랭킹 최신
배치(2026-08-20, 23행) 지역 분포가 창원 9 · **부산 7** · 김해 4 · 양산 2 · 사천 1 로
돌아왔다(2026-08-03 실측은 22행 중 부산 12행=54.5%). 창부레터·실거래이야기가
`getRankingsByType()` 결과를 `si` 필터 없이 최상위 행 그대로 `hotArea` 로 쓰면 부산
지역명이 노출될 수 있다 — 이번 스냅샷은 1위가 우연히 김해시라 안전했을 뿐 구조적으로
막혀 있지 않다. **bds 코드 변경은 0건**이며 이 필터링은 realtrade-story 소관이다
(Phase 40-04 인계 ① 재확인, 41-08 실측).

**용량 실측**: 최종 DB 867.9MB / 8,192MB Pro 한도(**10.6%**). 착수 전 448.5MB(5.5%) 대비
+419.4MB. 41-CONTEXT 의 사용자 산정(650MB=8%)보다 크다 — 545 bytes/행(41-CONTEXT
실측 원단위) × 부산 811,996행 ≈ 442.5MB 로 역산하면 실측 증가분과 5.5% 오차로
근접해, 산정 시점에 D-04(기간 확장)·전월세 포함이 아직 확정 전이라 더 적은
`transactions` 를 전제했을 가능성으로 설명된다. `VACUUM FULL` 은 이 Phase 범위 밖이라
실행하지 않았다.

**결과 실측 (2026-08-20)**:

```
regions    부산 16/16 활성 · 전체 38/38
complexes  1,643 (좌표 99.9%) · avg_sale_per_pyeong 1,169/1,643 (71%)
거래       811,996 — 아파트 631,612 (연결률 67.2%) / 연립다세대 180,103 (2.1%)
커버리지   apt 2,240/2,240 · villa 2,240/2,240 · 누락 0 · 실패 0.0%
deal_date  2015-01-01 ~ 2026-08-19
파생값     complex_rankings 323 · complex_gap_stats 466 · complex_price_predictions 0(미실행)
DB         867.9MB / 8,192MB (10.6%)
```

**계획이 틀렸던 것과 왜 — 이 ADR 의 가장 큰 가치**:

1. **소요시간을 8배 과소추정했다.** 원 계획(D-05)은 지역-월당 11.5초를 전제로 3그룹
   순차 dispatch(5시간 job 한도 안에 들어온다고 가정)를 설계했다. 그 11.5초는
   `molit_trade` **최근 성공 40건의 중간값**이었는데, 그 40건은 전부 **일배치**(당월
   1개월, 대부분 dedupe) 실행이었다. 백필은 월당 수백 행을 새로 넣고 행마다
   `complex_id` RPC + upsert 왕복이 붙는 — 이름은 같지만 다른 작업이었다. 진짜 값은
   삭제 전 `ingest_runs` 백업에 있었다: `molit_trade` 평균 80.2초(p90 159.4초),
   `molit_villa_trade` 평균 23.8초(p90 52.2초) — **과거 부산 전체가 실제로 54.7시간
   걸렸다.** `molit-backfill-once.yml` 직전 5회 실행이 **전부 정확히 5시간에
   cancelled** 였던 이력이 이미 이 사실을 말하고 있었다 — 계획 단계에서 이 이력을
   봤어야 했다. 최종적으로 로컬 8병렬(국내 IP, 5시간 job 한도 없음, `npm ci` 재시작
   비용 없음)로 전환해 약 10시간(그중 GitHub Actions 시행착오 약 45분)에 완주했다.
2. **`complexes` ≥ 1,500 은 도달 불가능한 목표였다.** K-apt 시딩 실측 상한은
   1,463(Phase 34)·1,467(이번)이고, 삭제 시점 1,594 는 그 위에 시딩 이후 한 달간
   다른 경로로 127건이 얹힌 값이다. 게이트를 1,400 으로 완화한 근거다.
3. **연결률 90% 요구도 비현실적이었다.** 운영권역 94.6% 는 별칭 보정 누적 결과이지
   신규 지역의 자연 수준이 아니다. 실제 신규 지역 기준은 경남 기타 64.7% 다.
4. **`complex_price_stats` 라는 테이블은 존재하지 않는다.** 가격 파생값은 `complexes`
   의 4컬럼(`avg_sale_per_pyeong`·`price_change_30d`·`tx_count_30d`·
   `is_new_record_30d`)이다.
5. **GitHub Actions 가 이 규모의 백필에 부적합했다.** data.go.kr 의 러너 IP 차단률이
   상수임을 재확인했다 — 초회 16개 중 **12개가 `exit 75`**(차단), 자동 재시도도 같은
   확률로 차단되고 같은 구가 3~4회 반복 차단됐다. `npm ci`(약 1분) 재시작 비용까지
   겹쳐 50분 경과 시점 진척이 4.3%(완주 추정 19시간+)였다. 차단률은 예외가 아니라
   **상수**다(코드 주석의 "성공 확률 회당 약 2/3"와 일치). 로컬 국내 IP 8병렬 전환이
   근본 해결이었다 — **향후 대량 MOLIT 백필은 로컬이 기본이어야 한다.**
6. **연결률은 apt/villa 를 나눠 읽어야 한다.** 합산 52.8% 만 보면 "매칭 악화"로
   오판한다. `complexes` 가 K-apt 기반 **아파트 단지 마스터**라 연립·다세대엔 대응
   단지가 구조적으로 없다 — 아파트만 보면 67.2%(경남 기타 64.7% 상회), 연립은 2.1%
   (구조적, 매칭 고장 아님). `scripts/busan-status.ts` 에 이 구분을 반영했다
   (커밋 `a2a8fcc`).
7. **삭제분의 2.9배(811,996 vs 282,444)가 된 것은 이상이 아니다.** 기간 18개월 확대
   (143,346건) + 전월세 포함(286,335건) + 부산이 더 큰 시장(잔여 약 99,871건) 세
   요인으로 분해된다.

**🔴 D-04 의 "창원·김해와 대칭" 전제가 사실이 아니었다 — 그 발견이 뒤집은 것**:
부산 백필 완료 시점을 추정하려고 연도별 거래 분포를 보다가, **운영권역(창원·김해)
자체가 2015-01~2016-06 구간의 실거래를 대부분 갖고 있지 않다**는 것이 드러났다
(`.planning/phases/41-busan-recollect/FINDING-changwon-gimhae-gap.md`). 월별 거래량이
2016-07 을 경계로 약 10배 뛰고, 창원·김해 `molit_trade` 2015년 성공 run 이 12건뿐
(기대: 6구 × 12개월 = 72건) — **6개 구 중 1개 구만 2015년이 수집돼 있었다.** 정상
월 2,000~2,800건 대비 관측 200~290건이면 약 90% 결손으로, 18개월 × 약 2,300건 ×
0.9 ≈ **3만~4만 건**이 추정 누락 규모다. **결정 자체(201501 부터 수집)는 옳았지만,
근거로 든 대칭 전제는 틀렸다** — 그리고 그 결과 **부산이 운영권역보다 더 완전한
10년 이력을 갖게 됐다.** 10년 그래프·랭킹·갭 분석·AI 예측처럼 장기 시계열에
의존하는 기능 전부가 영향권이다. 이 발견은 **이 Phase 범위 밖**(수집 대상이 부산이지
운영권역이 아니다)이라 손대지 않았고, 별건으로 남긴다 — 제안된 복구 규모는 216
지역-월(부산의 5%), 로컬 8병렬 기준 1~2시간.

**범위 밖으로 남긴 것**: 부산 화면 노출·도메인·`site_id`(realtrade-story ADR-012 의
미정 4건) / 네이버 호가 크롤링 부산 확장 / 부산 미분양(`regional_unsold`, API 자체
고장으로 이미 보류) / 오피스텔 부산 재수집 / 별칭 보정으로 연결률 90% 달성 /
`complex_integrity_counts` 마이그레이션 파일화 / 창원·김해 2015-01~2016-06 결손 복구 /
울산 등 추가 지역 / `VACUUM FULL`.

**되돌리려면**: ADR-062 의 삭제 절차(`regions.is_active = false` + `transactions`·
`complexes`·`ingest_runs` 등 부산 행 삭제)를 다시 실행한다. 이번엔 `regions` 스위치가
정식 마이그레이션으로 원장에 있으므로 되돌리는 마이그레이션도 원장 재현성을 유지한 채
작성할 수 있다.

**상태**: 확정 (2026-08-20, 실행 완료 — push 는 별도 사용자 결정 대기)
