# Phase 16 Context — 광고 플랫폼 MVP

## Phase Goal

단지온도 홈페이지에 실제 광고를 노출하고, 광고주 문의 흐름을 완성한다.

운영자는 `/admin/ads`에서 캠페인을 관리하고, 광고주는 `/ads`에서 상품을 보고 문의를 남기며, 방문자는 홈 상단 배너에서 승인된 광고를 볼 수 있다.

---

## 상태 요약 — 이미 구현된 것

### DB 스키마 (건드리지 말 것)
- `ad_campaigns` 테이블: id, advertiser_id, advertiser_name, title, image_url, link_url, placement (banner_top|sidebar|in_feed), starts_at, ends_at, status (draft|pending|approved|ended|rejected|paused), budget_won
- `ad_events` 테이블: id, campaign_id, event_type (impression|click|conversion), ip_hash, user_id, is_anomaly
- `ad_campaigns_active_idx` 인덱스: (placement, starts_at, ends_at) WHERE status='approved'

### 데이터 레이어
- `src/lib/data/ads.ts`: `getActiveAds(placement, supabase)`, `getAllAdCampaigns(supabase)`, `getAdRoiStats(adminClient)`, `AdCampaign` 타입, `AdRoiRow` 타입

### Server Actions
- `src/lib/auth/ad-actions.ts`: `approveAdCampaign(id)`, `rejectAdCampaign(id)`, `pauseAdCampaign(id)`, `createAdCampaign(formData)`

### API Route
- `src/app/api/ads/events/route.ts`: POST `{campaign_id, event_type}` → IP hash + anomaly 감지 + rate limit (이미 완전히 구현됨)

### 컴포넌트
- `src/components/ads/AdBanner.tsx`: 단일 광고 렌더링 + impression/click 이벤트 로깅 (이미 완전히 구현됨)
- `src/components/ads/AdminCampaignActions.tsx`: approve/reject/pause 버튼
- `src/components/admin/AdRoiTable.tsx`: ROI 집계 테이블
- `src/components/admin/AdCreateForm.tsx`: 관리자용 캠페인 생성 폼

### 어드민 페이지
- `src/app/admin/ads/page.tsx`: 캠페인 목록 + ROI 테이블 + AdminCampaignActions (이미 완전히 구현됨)
- `src/app/admin/ads/new/page.tsx`: AdCreateForm 래퍼 페이지 (이미 완전히 구현됨)

### 테스트
- `src/__tests__/ads.test.ts`: getActiveAds + admin actions 가드 테스트
- `src/app/api/ads/events/route.test.ts`: 이벤트 API 테스트 (rate limit, IP hash, anomaly)

---

## 이번 Phase에서 구현할 것

### Plan 16-01: AdBanner 홈페이지 연결
- `src/app/page.tsx`에 `AdBanner` 컴포넌트 삽입 (banner_top placement, ISR 적용)
- 복수 광고일 때 자동 로테이션 (client-side 캐러셀)
- `src/components/ads/AdBannerCarousel.tsx` 생성 (복수 광고 처리 wrapper)

### Plan 16-02: 광고 문의 페이지
- `src/app/ads/page.tsx` 생성 — 가격 테이블 + 문의 폼
- `src/lib/auth/ad-inquiry-action.ts` 생성 — 폼 검증 + Resend 이메일 발송

---

## 결정 사항 (Locked)

| ID | 결정 |
|----|------|
| D-01 | 광고 이벤트 API `/api/ads/events`는 이미 구현됨. 수정 불필요 |
| D-02 | AdBanner 컴포넌트는 이미 구현됨. 수정 불필요 |
| D-03 | 어드민 페이지(`/admin/ads`, `/admin/ads/new`)는 이미 완전히 구현됨. 이번 Phase 범위 외 |
| D-04 | 가격 패키지: 7일 / 30일 / 90일 — 실제 금액은 운영자가 이메일에서 안내 (폼에 표시 안 함) |
| D-05 | 문의 처리: Resend → `OPERATOR_EMAIL`로 이메일 발송. 자동화 결제 없음 |
| D-06 | 복수 광고 처리: 클라이언트 캐러셀 컴포넌트. 없을 때는 빈 상태 (에러 없음) |
| D-07 | CRITICAL: 광고 쿼리는 반드시 `now() BETWEEN starts_at AND ends_at AND status='approved'` 조건 포함 (CLAUDE.md) |

---

## 범위 외 (Out of Scope)

- 광고 단지 타겟팅 (complex targeting)
- 자동화 결제 / PG 연동
- 광고 소재 업로드 (이미지 URL 입력으로 대체)
- 어드민 캠페인 관리 UI (이미 완성됨, 재구현 금지)

---

## 아키텍처 제약

- Supabase 쿼리는 서버 컴포넌트 또는 Server Action에서만
- `'use client'` 최소화 — AdBannerCarousel만 클라이언트 컴포넌트
- 홈페이지(`src/app/page.tsx`)는 `export const revalidate = 60` 유지
- Resend 패턴: `deliver.ts`와 동일하게 `const resend = new Resend(process.env.RESEND_API_KEY)`
- 문의 Server Action: `'use server'` + zod 검증 + Resend 이메일

---

## 환경 변수 (이미 존재)

- `RESEND_API_KEY` — Resend 이메일 발송 키
- `RESEND_FROM_EMAIL` — 발신 주소 (기본값: `danjiondo <onboarding@resend.dev>`)
- `OPERATOR_EMAIL` — 운영자 이메일 (문의 수신)
- `RATE_LIMIT_SECRET` — IP hash용 HMAC secret
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Upstash Redis (rate limit)
