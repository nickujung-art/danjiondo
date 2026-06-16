# 아키텍처

## 시스템 컨텍스트

```
┌────────────────────────────────────────┐
│        사용자 (모바일/데스크톱)         │
└────────────────────────────────────────┘
                    │
           ┌────────┴────────┐
           │   Vercel Edge   │  (Next.js 15 App Router + RSC + ISR)
           └────────┬────────┘
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  ┌─────────┐  ┌──────────┐  ┌──────────┐
  │Supabase │  │ NextAuth │  │카카오맵  │
  │Postgres │  │ (Naver)  │  │(브라우저)│
  │+ RLS    │  └──────────┘  └──────────┘
  └────┬────┘
       │ (배치)
       ▼
  ┌────────────────────────────────────────┐
  │ 데이터 파이프라인                       │
  │  Vercel Cron (일배치) +                │
  │  GitHub Actions (10년 백필)            │
  │  국토부 / 행안부 / 학교알리미 / K-apt / │
  │  카카오 로컬                           │
  └────────────────────────────────────────┘
       │
       ▼
  ┌────────────────────────────────────────┐
  │ 알림 워커 (Vercel Cron 5분)            │
  │  Resend (이메일) + web-push (VAPID)    │
  └────────────────────────────────────────┘

관측: PostHog + Sentry + Vercel Logs
```

## 기술 스택

### 프레임워크 / 언어
- Next.js 15 App Router + RSC (Server Components 기본, 인터랙션만 `'use client'`)
- TypeScript strict + `noUncheckedIndexedAccess`
- Tailwind CSS 3.4+ + `@tailwindcss/typography`
- Node.js 20 LTS (Vercel runtime)

### 클라이언트 라이브러리
| 용도 | 선택 |
|---|---|
| 차트 | Recharts (V2: ECharts 검토) |
| 폼 | react-hook-form + zod |
| 서버 상태 | TanStack Query v5 |
| 지도 | react-kakao-maps-sdk + supercluster |
| 아이콘 | Lucide React (strokeWidth 1.75) |
| 토스트 | sonner |
| 다이얼로그 | Radix UI Primitives |
| 날짜 | date-fns |
| 마크다운 (V1.5) | react-markdown + rehype-sanitize |

### PWA
- Serwist (next-pwa 후속, Next 15 호환)
- VAPID 키 페어 → `push_subscriptions` 테이블
- iOS Safari 16.4+ 호환, 미만은 이메일 fallback

### Auth
- **Supabase Auth** — Naver OAuth (1순위) + 이메일 OTP (2순위)
- Session: Supabase JWT (HttpOnly, SameSite=Lax, Secure)
- RLS 컨텍스트: Supabase Auth UID → `auth.uid()` 자동 연동
- 어드민 role: `raw_app_meta_data.role = 'admin'`
- 광고주 role: `raw_app_meta_data.role = 'advertiser'`

### DB (Supabase Postgres + PostGIS)
- 확장: `postgis`, `pg_trgm`, `unaccent`, `pgcrypto`
- 검색: Postgres FTS + `pg_trgm` trigram (단지명·주소 자동완성)
- RLS: 모든 사용자 데이터 테이블에 정책 명시

### 외부 API
| API | 용도 | 한도 / 갱신 주기 |
|---|---|---|
| 국토부 실거래가 (MOLIT_API_KEY) | 매매·전세·월세 × 아파트·오피스텔 | 일 10,000회 |
| 행안부 도로명주소 | 지오코딩 1차 | 일 10,000회 |
| 카카오 로컬 | 지오코딩 2차 + 반경 POI | 일 100,000회 |
| 카카오맵 JS SDK | 지도 렌더링 | 무료 |
| 학교알리미 | 학군·진학률·연락처 수집 (Playwright 필요) | 연간 (11월 진학률 갱신) |
| K-apt | 관리비 | 월 1회 |
| Groq API | Chronos 예측 코멘터리 생성 | 토큰 과금 |
| Google Gemini | 분양 HTML 파싱 | 토큰 과금 |

> **MOLIT_API_KEY**: data.go.kr 전체 서비스 공통 사용. 별도 키 신설 금지 (ADR 참조).

### 알림
- 이메일: Resend Free (100/일, 3k/월) + React Email 템플릿
- 웹 푸시: web-push npm + VAPID
- 알림 큐: `notifications` 테이블 + 워커 cron (5분)
- dedupe: `UNIQUE(user_id, event_type, target_id, dedupe_key)`

### 관측
- Analytics: PostHog Free (1M events/월)
- Errors: Sentry Free (5k errors/월)
- Custom audit: `audit_logs` 테이블

### 테스트
- Unit: Vitest — 산식(랭킹·평당가·갱신폭) + 어댑터 변환
- Integration: Vitest + Supabase 로컬 인스턴스 — RLS 정책 검증
- E2E: Playwright — 골든패스 5개 (검색→상세, 회원가입, 즐겨찾기, 알림 수신, 광고 노출)

## 디렉토리 구조

> 아래는 2026-06-16 기준 실제 구조입니다.

```
src/
├── app/
│   ├── page.tsx                      # 랜딩
│   ├── layout.tsx
│   ├── [slug]/page.tsx               # 단지 상세 (슬러그 URL)
│   ├── complexes/[id]/               # 단지 상세 (구 URL, 내부 리다이렉트)
│   ├── map/                          # 지도 검색
│   ├── compare/                      # 단지 비교
│   ├── presale/                      # 분양 정보
│   ├── invest/                       # 투자 분석 (사분면)
│   ├── gap-analysis/                 # Gap 분석
│   ├── favorites/                    # 즐겨찾기 (로그인 필요)
│   ├── profile/                      # 내 프로필
│   ├── auth/                         # 로그인/OAuth 콜백
│   ├── login/
│   ├── ads/                          # 광고 랜딩
│   ├── consent/                      # 약관 동의
│   ├── reactivate/                   # 휴면 계정 재활성화
│   ├── legal/                        # 이용약관·개인정보
│   ├── admin/                        # 어드민 (role=admin 전용)
│   │   ├── ads/                      # 광고 검수
│   │   ├── cardnews/                 # 카드뉴스 발행
│   │   ├── gps-requests/             # GPS 인증 요청
│   │   ├── listing-prices/           # 호가 관리
│   │   ├── members/                  # 회원 관리
│   │   ├── presale-discoveries/      # 분양 발견 관리
│   │   ├── realtors/                 # 공인중개사 관리
│   │   ├── redevelopment/            # 재건축 정보 입력
│   │   ├── reports/                  # 신고 처리
│   │   └── status/                   # 데이터 소스 현황
│   ├── actions/                      # Server Actions
│   │   └── education.ts              # fetchSchoolRanking
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── ingest/                   # CRON_SECRET 검증 필수 (Vercel Cron)
│       ├── notifications/
│       └── ads/
│
├── components/
│   ├── complex/                      # 단지 상세 컴포넌트
│   │   ├── EducationCard.tsx         # 학군 (SchoolRankingSheet 포함)
│   │   └── ...
│   ├── home/                         # 랜딩 페이지
│   ├── map/                          # 지도 컴포넌트
│   ├── ads/                          # 광고 컴포넌트
│   ├── invest/                       # 투자 분석 컴포넌트
│   ├── presale/                      # 분양 컴포넌트
│   ├── search/                       # 검색 자동완성
│   ├── admin/                        # 어드민 UI
│   ├── auth/                         # 로그인 UI
│   ├── community/                    # 커뮤니티 컴포넌트
│   ├── profile/                      # 프로필 컴포넌트
│   ├── realtors/                     # 공인중개사 컴포넌트
│   ├── reviews/                      # 후기 컴포넌트
│   └── layout/                       # 공통 레이아웃
│
├── lib/
│   ├── supabase/{server,client,admin}.ts
│   ├── auth/
│   ├── data/                         # 도메인 데이터 레이어
│   │   ├── facility-edu.ts           # 학교 데이터 (SchoolItem)
│   │   ├── price-history-cache.ts
│   │   └── ...
│   ├── ai/                           # AI 관련 (Chronos 예측, 코멘터리)
│   ├── notifications/
│   ├── prediction/                   # 예측 모델
│   ├── actions/                      # Server Action 헬퍼
│   └── utils/
│
├── services/                         # 외부 API 어댑터 (얇은 래퍼)
│   ├── molit.ts                      # 국토부 실거래가
│   ├── kakao-local.ts                # 카카오 로컬 API
│   ├── school-alimi.ts               # 학교알리미
│   └── kapt.ts                       # K-apt 관리비
│
└── types/

supabase/
└── migrations/                       # 114개 (2026-06-16 기준)
    └── ...20260616000004_school_ranking_rpc.sql  # 최신

scripts/                              # 82개 (1회성 배치·수집 스크립트)
  ── 실거래 수집/백필 ──────────────────────────────
  backfill-realprice.ts               # 국토부 실거래가 전체 백필
  backfill-officetel.ts               # 오피스텔 실거래가
  backfill-url-slugs.ts               # 슬러그 URL 생성
  ── 단지 매칭/지오코딩 ───────────────────────────
  backfill-jibun-addr.ts              # 지번주소 보완
  enrich-apt-unmatched.ts             # 미매칭 단지 보완
  embed-complexes.ts                  # 단지 임베딩 (벡터)
  ── 학교알리미 ───────────────────────────────────
  collect-school-stats.ts             # 기본 통계 (학급당 학생수 등)
  collect-facility-edu.ts             # 단지-학교 매핑
  scrape-school-advancement.ts        # 진학률 (중/고 --school-type=)
  scrape-school-contact.ts            # 전화번호·홈페이지
  scrape-school-details.ts            # 특수학급 수 (항목01, Playwright)
  ── AI / 예측 ────────────────────────────────────
  compute-predictions.ts              # Chronos 12개월 예측
  compute-predictions-ai.py           # Python Chronos 실행
  crawl-presale.ts                    # 분양 정보 크롤링
  crawl-presale-news.ts               # 분양 뉴스 수집
  ── 기타 ────────────────────────────────────────
  collect-district-stats.ts           # 시군구 통계
  fetch-cheongyak.ts                  # 청약 정보
  execute.py                          # 배치 실행 헬퍼
```

## 데이터 모델 (핵심 테이블)

### complexes (단지 — Golden Record)
```sql
id               uuid PK
canonical_name   text                   -- 사이트 표준 표기
name_normalized  text                   -- 검색용 (NFC+공백제거+lower)
molit_complex_code text UNIQUE NULL
kapt_code        text NULL
sgg_code         text                   -- 시군구코드 5자리
road_address     text
location         geometry(POINT, 4326)  -- PostGIS
geocoding_accuracy numeric
household_count  int
built_year       int
status           enum(pre_sale, under_construction, recently_built,
                      active, in_redevelopment, demolished)
predecessor_id   uuid FK NULL           -- 재건축 옛 단지
successor_id     uuid FK NULL           -- 재건축 신 단지
data_completeness jsonb                 -- 섹션별 가용성 플래그
```

### complex_aliases (별칭 학습)
```sql
complex_id   uuid FK
source       enum(molit_trade, kapt, school_alimi, kakao_poi, juso, manual, ...)
alias_name   text
confidence   numeric
UNIQUE(complex_id, source, alias_name)
```

### complex_match_queue (매칭 검수 큐)
```sql
source       text
raw_payload  jsonb
candidate_ids uuid[]
reason       enum(low_confidence, conflict, no_match)
status       enum(pending, resolved, rejected)
```

### transactions (거래)
```sql
id            bigserial PK
complex_id    uuid FK
deal_type     enum(sale, jeonse, monthly)
deal_subtype  enum(sale, occupancy_right, pre_sale_right)
deal_date     date
price         bigint                    -- 만원 단위
area_m2       numeric(6,2)
floor         int
cancel_date   date NULL                 -- 거래 취소
superseded_by bigint FK NULL           -- 정정 신고
dedupe_key    text UNIQUE               -- 멱등성 키
```

**dedupe_key**: `(sgg_code, deal_ym, complex_code, deal_date, price, area)` — 국토부에 안정 ID 없음

### data_sources (소스 메타)
```sql
id                      text PK         -- 'molit_trade', 'kapt', ...
cadence                 enum(daily, monthly, quarterly, annual, manual)
expected_freshness_hours int
last_synced_at          timestamptz
last_status             enum(success, partial, failed)
consecutive_failures    int
ui_label                text            -- "전월 기준" 등
```

### ai_estimates (AI 추정값)
```sql
target_complex_id   uuid FK
estimated_value     jsonb
method              enum(nearest_neighbors, similar_complex, regression)
reference_complex_ids uuid[]
confidence          numeric
status              enum(active, superseded, rejected)
```
UI: 반드시 "AI가 자동 추정한 값입니다 — 정확하지 않을 수 있어요" 라벨 표시

### 나머지 핵심 테이블
- `ingest_runs` — 적재 런 추적 (멱등성, 재개 가능)
- `facility_school`, `facility_kapt`, `facility_poi` — 시설 정보
- `profiles` — 사용자 확장 (cafe_nickname, signup_source, role)
- `favorites` — 즐겨찾기 (RLS: user_id만 접근)
- `push_subscriptions` — VAPID 구독
- `notifications` — 알림 큐 + 이력
- `ad_campaigns`, `ad_events` — 광고 + 노출/클릭
- `ranking_pool`, `ranking_snapshots` — 랭킹 캐시
- `redevelopment_projects` — 재건축 단계 (운영자 수동, V1.5)
- `reviews`, `review_verifications` — 익명 후기 + GPS 인증 (V1.5)
- `cafe_post_queue` — 카드뉴스 발행 큐
- `audit_logs` — 모든 민감 액션 감사

## 핵심 인덱스 / 제약
```sql
transactions.dedupe_key UNIQUE
transactions(complex_id, deal_date DESC)
transactions(sgg_code, deal_date) WHERE cancel_date IS NULL AND superseded_by IS NULL
complexes USING gist(location)
complexes USING gin(name_normalized gin_trgm_ops)
notifications UNIQUE(user_id, event_type, target_id, dedupe_key)
```

## RLS 정책 (요지)
- `favorites`, `notifications`, `push_subscriptions`: `auth.uid() = user_id`만 접근
- `complexes`, `transactions`, `facility_*`: 전체 SELECT (공개). INSERT/UPDATE는 `service_role`만
- `ad_campaigns`: advertiser는 본인 row만. status='approved'만 일반 SELECT
- `ad_events`: 일반 사용자는 INSERT만 (impression/click 기록)

## 주요 시퀀스

### 단지 검색 자동완성
```
키 입력 → 디바운스 200ms
  → GET /api/search/suggest?q= (Edge, 200ms 캐시)
  → Supabase FTS: name_normalized %% :q ORDER BY similarity LIMIT 8
  → 결과 + 강조표시
```

### 단지 상세 (10년 그래프)
```
GET /danji/:id (SSG + ISR 1h)
  → RSC: 단지 + 최근 거래 200건 + 시설 V1
  → Recharts 그래프 렌더
  → 신고가 갱신 시 on-demand revalidate
```

### 신고가 알림
```
일배치 cron (04:00 KST)
  → 전일 신규 거래 fetch → 단지·평형별 직전 최고가 비교
  → 갱신분 → notifications 큐 enqueue
알림 워커 (5분 cron)
  → status='pending' 50건 → Resend / web-push 발송
  → 실패 3회 → status='failed' + Sentry
```

### 광고 게재
```
RSC 렌더 시 → getCreative(slot, context)
  → WHERE slot=:slot AND status='approved'
       AND now() BETWEEN starts_at AND ends_at
  → 가중치 랜덤 선택 → 렌더 + impression INSERT
  → 클릭 → /api/ads/click → ad_events + redirect
```

## 캐싱 전략
| 레이어 | 대상 | 정책 |
|---|---|---|
| Vercel Edge | 외부 API 응답 | 단지 메타 1h, 시설 24h |
| Next ISR | 단지 상세 | revalidate 3600s + on-demand |
| TanStack Query | 즐겨찾기·랭킹 | staleTime 60s |
| 카카오맵 | 클러스터 | 줌별 supercluster 캐시 |

## 보안
- CSP: `default-src 'self'; script-src 'self' dapi.kakao.com; font-src 'self' cdn.jsdelivr.net`  
  (Pretendard 로컬 서빙 권장. Wanted Sans는 `cdn.jsdelivr.net/gh/wanteddev/wanted-sans` CDN 허용)
- CRON_SECRET: `/api/ingest/*` 모든 cron 호출 검증
- Rate limit: `/api/search/suggest` Edge IP 기반 60req/min
- SQL injection: Supabase prepared statements
- XSS: React 기본 + 후기 마크다운 rehype-sanitize allowlist
- CSRF: NextAuth 내장 + SameSite=Lax
- IP: `sha256(ip + secret)` 해시 저장 (광고 트래킹)

## 성능 예산
| 페이지 | LCP | TTFB | JS bundle |
|---|---|---|---|
| 랜딩 | ≤ 1.8s | ≤ 400ms | ≤ 180KB gzip |
| 검색 결과 | ≤ 2.0s | ≤ 500ms | ≤ 200KB |
| 단지 상세 | ≤ 2.5s | ≤ 600ms | ≤ 250KB |
| 지도 | ≤ 3.0s | ≤ 700ms | ≤ 300KB |

## 환경 분리
| 환경 | URL | DB |
|---|---|---|
| local | localhost:3000 | Supabase 로컬 Docker |
| preview | *.vercel.app | Supabase preview 프로젝트 |
| production | danjiondo.com | Supabase 메인 |

## 비용 가드레일
| 자원 | 무료 한도 | 알람 임계 |
|---|---|---|
| Vercel bandwidth | 100GB/월 | 80GB |
| Supabase DB | 500MB | 400MB |
| Supabase Egress | 5GB/월 | 4GB |
| Resend | 3k/월 | 2.4k |
| 카카오맵/로컬 | 일 100k | 일 80k |

## 데이터 흐름
```
사용자 입력
  → Client Component (react-hook-form)
  → Server Action 또는 API Route
  → src/services/ 어댑터 (외부 API) 또는 Supabase
  → 응답 → TanStack Query 캐시 업데이트 → UI
```

## 상태 관리
- 서버 상태: RSC fetch + TanStack Query v5 (캐시·optimistic)
- 클라이언트 상태: useState / useReducer (최소화)
- 전역 상태: Context API (인증·테마) — Zustand 등 별도 스토어 금지 (V1)

## 에러 핸들링 표준

### 계층별 정책
| 계층 | 방식 | 비고 |
|---|---|---|
| 외부 API 어댑터 (`src/services/`) | 5회 지수 백오프 (1→2→4→8→16s) + jitter. 최종 실패 시 throw | zod 실패율 > 5% → Sentry alert + 배치 중단 |
| Server Action / API Route | try/catch → 표준 에러 응답 `{ error: string, code: string }` | 500은 Sentry에만. 사용자에게는 친화적 메시지 |
| RSC 렌더 실패 | Next.js `error.tsx` 경계 | ISR stale 페이지 서빙 유지 + Sentry error |
| Client Component | `ErrorBoundary` + fallback UI | 지도 SDK, 차트 등 |
| 알림 워커 | 3회 retry → status='failed' + Sentry | 410 Gone → 즉시 구독 무효화, retry 없음 |
| 광고 impression | fire-and-forget. 실패 시 Sentry warn | 페이지 렌더 블로킹 금지 |

### 재시도 금지 케이스 (명시)
재시도하면 오히려 해가 되는 경우:
- HTTP **410 Gone** (웹 푸시 구독 만료): 즉시 `is_valid=false`, 재시도 절대 금지
- Resend **422** (수신 불가 이메일): retry 없음, `status='failed'`
- zod 스키마 실패율 > 5%: 배치 중단, 수동 검토 후 재개

### 부분 실패(Partial Failure) 정책
- ingest 배치: row 단위 try/catch. 개별 row 실패 시 로그 + 건너뜀. **전체 배치 중단 금지** (단, zod 실패율 > 5% 예외)
- 알림 발송: 사용자 단위 실패 시 해당 사용자 `status='failed'`. 다음 사용자 계속 진행
- AI 추정 배치: 단지 단위 실패 시 건너뜀 + Sentry warn. 전체 배치 중단 없음

### 타임아웃 기준
| 작업 | 타임아웃 |
|---|---|
| 외부 API 단일 호출 | 10s |
| Supabase 쿼리 | 30s (long-running 배치는 60s) |
| Claude API 스트리밍 | 초기 응답 15s, 전체 스트림 90s |
| 카카오맵 SDK 로드 | 5s |
| GPS 위치 획득 | 10s |

### 사용자 노출 메시지 원칙
- 서버 에러(5xx): "잠시 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." (기술 메시지 노출 금지)
- 외부 API 장애: "데이터를 불러오는 중입니다." (스텔스 재시도, 5초 후 retry)
- rate limit(429): "요청이 너무 많습니다. `Retry-After` 초 후 다시 시도해 주세요."
- 권한 오류(403/RLS): "접근 권한이 없습니다." (상세 사유 미노출)
