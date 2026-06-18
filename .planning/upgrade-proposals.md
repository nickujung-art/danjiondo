# 단지온도 고도화 제안서

> 작성일: 2026-06-18  
> 기준 브랜치: main (커밋 3a07dcd)  
> 현재 상태: V1.0 오픈베타 운영 중. FEATURES.json — done 25건 / in_progress 1건 / deferred 5건 / blocked 2건

---

## 즉시 구현 가능 (1–2일)

### I-1. 단지 상세 페이지 — 모바일 레이아웃 수정

**문제**: `src/app/[...slug]/page.tsx` 메인 그리드가 `gridTemplateColumns: '1fr 360px'` 인라인 스타일 고정. 모바일에서 우측 360px 컬럼이 잘림. 상단 sticky nav도 `padding: '0 32px'` 고정.

**수정**: Tailwind 반응형 클래스로 교체 — `grid-cols-1 lg:grid-cols-[1fr_360px]`, 패딩 `px-4 md:px-8`.

**구현 난이도**: 낮음 (CSS 교체)  
**예상 임팩트**: 높음 — 모바일 유입 비중이 높은 카페 회원 경험 직결  
**선결 조건**: 없음

---

### I-2. `useSearchParams` Suspense 경계 누락 수정

**문제**: `src/app/login/page.tsx`에 `useSearchParams()` Client Component가 포함됐을 경우 Next.js 15 빌드 시 경고 또는 런타임 에러. `useSearchParams`는 반드시 `<Suspense>` 경계 안에 있어야 함.

**수정**: login page에서 `useSearchParams`를 사용하는 컴포넌트를 `<Suspense fallback={null}>`으로 감싸기.

**구현 난이도**: 낮음  
**예상 임팩트**: 중간 — 빌드/런타임 안정성  
**선결 조건**: 없음

---

### I-3. 광고 사이드바 API 캐시 헤더 추가

**문제**: `src/app/api/ads/sidebar/route.ts`가 `Cache-Control: no-store`. 광고는 시간 기반(starts_at/ends_at)으로 바뀌므로 CDN 5분 캐시 적용 가능.

**수정**: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` 추가.

**구현 난이도**: 낮음 (헤더 1줄)  
**예상 임팩트**: 중간 — Supabase egress 절감 + 응답 속도 향상  
**선결 조건**: 없음

---

### I-4. AI 채팅 컨텍스트에 호가(listing_prices) 데이터 추가

**문제**: `src/lib/ai/context-builder.ts`의 `buildComplexContext()`에 Phase 25에서 수집한 `listing_prices` 461건이 포함되지 않음. 사용자가 "현재 매물 가격이 얼마예요?" 물으면 AI가 답 못함.

**수정**: `buildComplexContext()`에 `listing_prices` 쿼리 추가 (최근 5건 + 평당가 평균).

**구현 난이도**: 낮음  
**예상 임팩트**: 높음 — AI 채팅 질 즉시 향상  
**선결 조건**: listing_prices 테이블에 데이터 적재 확인 (Phase 25 완료)

---

### I-5. 동명 컴포넌트 이름 명확화

**문제**: `TierBadge`가 `src/components/complex/TierBadge.tsx`와 `src/components/reviews/TierBadge.tsx` 두 군데 존재. `ShareButton`도 `complex/`와 `rankings/` 양쪽에 다른 기능으로 존재. Import 경로 혼동 가능.

**수정**: `reviews/TierBadge.tsx` → `CafeVerifiedBadge.tsx`, `rankings/ShareButton.tsx` → `RankingShareButton.tsx`로 rename.

**구현 난이도**: 낮음 (rename + import 수정)  
**예상 임팩트**: 낮음 — 코드 유지보수성  
**선결 조건**: 없음

---

### I-6. 주요 라우트 `error.tsx` 추가

**문제**: `src/app/[...slug]/error.tsx` 하나만 존재. `/invest`, `/presale`, `/rankings`, `/gap-analysis`, `/admin/*` 등 주요 라우트에 error 경계 없음. RSC 렌더 실패 시 전체 페이지 빈 화면.

**수정**: 각 주요 라우트에 `error.tsx` 추가 (공통 `ErrorFallback` 컴포넌트 재사용).

**구현 난이도**: 낮음  
**예상 임팩트**: 중간 — 운영 안정성  
**선결 조건**: 없음

---

## 단기 (1–2주)

### S-1. 호가(listing_prices) 공인중개사 입력 UI 구현 — deferred V1.5

**현황**: 어드민에서만 수동 입력 가능 (`admin/listing-prices/page.tsx`). 공인중개사 입력 폼 및 단지 상세 표시가 FEATURES.json `listing-prices` 항목에 `todo`로 남음.

**구현 내용**:
1. 공인중개사 전용 호가 입력 폼 (`/realtors/listing-prices/new`)
2. 단지 상세 우측 컬럼 — "현재 호가" 섹션 (평형별 최근 5건 테이블)
3. 시세 차트에 호가 레이어 오버레이 (점선으로 실거래 vs 호가 구분)

**구현 난이도**: 중간  
**예상 임팩트**: 높음 — V1.5 핵심 기능, 중개사 참여 유도  
**선결 조건**: 공인중개사 인증 role 확인 (`raw_app_meta_data.role = 'realtor'`)

---

### S-2. 익명 후기 시스템 구현 — deferred V1.5

**현황**: `reviews`, `review_verifications` 테이블 스키마 설계됨. GPS 인증 흐름(`gps-requests` 어드민 연동) 일부 존재. FEATURES.json `anonymous-reviews` 전 체크리스트 `todo`.

**구현 내용**:
1. `reviews` + `review_verifications` 마이그레이션 실행
2. 단지 상세 하단 `NeighborhoodOpinion` 섹션 활성화 (현재 컴포넌트 존재 확인 필요)
3. GPS 인증 흐름 L1 (1회 방문 인증) 구현
4. 신고 + 어드민 처리 연동 (admin/reports 기존 활용)

**구현 난이도**: 높음  
**예상 임팩트**: 높음 — "단지온도만의" 차별화 콘텐츠. PRD 북극성 KPI 직결  
**선결 조건**: ADR-046 GPS 다단계 정책 재확인, 개인정보 처리 방침 업데이트

---

### S-3. Phase 28 완료 — 학원 추천 데이터 실행

**현황**: `classify-hagwon-groq.ts` 4,570건 분류 중. 이후 `collect-hagwon-popularity.ts` 실행 필요.

**구현 내용**:
1. `npx tsx scripts/collect-hagwon-popularity.ts` 실행 (네이버 블로그 언급 수 + fee_tier)
2. `popularity_score` null 데이터 검증 후 `recommend_hagwons` RPC 스코어 재확인
3. FEATURES.json `hagwon-recommendation` → `done`으로 업데이트

**구현 난이도**: 낮음 (스크립트 실행)  
**예상 임팩트**: 높음 — Phase 28 마무리, 학원 추천 기능 완성  
**선결 조건**: Naver 블로그 검색 API 할당량 확인

---

### S-4. Supabase TypeScript 타입 재생성 — `as any` 109건 제거

**문제**: `src/lib/data/rankings-page.ts` 13건, `src/lib/data/invest.ts` 12건 등 총 45개 파일 109건의 `as any` 캐스팅. 근본 원인은 커스텀 RPC 함수(`invest_regional_price_history`, `school_ranking` 등)가 자동 생성 타입에 포함되지 않음.

**수정**:
1. `npx supabase gen types typescript --project-id xxx > src/types/supabase.ts` 최신화
2. 커스텀 RPC 반환 타입을 `src/types/rpc-types.ts`에 수동 정의
3. `(supabase as any).rpc(...)` → `supabase.rpc<RpcReturnType>(...)` 교체

**구현 난이도**: 중간 (타입 정의 작업)  
**예상 임팩트**: 중간 — 타입 안전성, 런타임 에러 사전 차단  
**선결 조건**: 없음

---

### S-5. 지도 페이지 필터 UI 추가

**현황**: 지도에 평당가 뱃지, 동 클러스터만 있음. 필터 없이 전체 단지가 표시.

**구현 내용** (모바일 바텀 시트 패턴):
- 평당가 범위 슬라이더 (min/max)
- 준공연도 필터 (신축 10년 이내 / 20년 이내 / 전체)
- 세대수 필터 (300세대 이상 / 전체)
- 전세가율 오버레이 토글 (갭 데이터 활용)

**구현 난이도**: 중간  
**예상 임팩트**: 높음 — 지도 사용률 + 임장러(Persona B) UX  
**선결 조건**: 없음

---

### S-6. `regional-commentary.ts` Groq fallback 추가

**문제**: `src/lib/ai/regional-commentary.ts`가 Gemini 전용. `GEMINI_API_KEY` 미설정 시 지역 AI 분석 전체 비활성화. 단지별 commentary는 Groq 우선인데 비대칭.

**수정**: Gemini 실패 시 `llama-3.1-8b-instant`(Groq)로 fallback하는 이중 provider 패턴 추가 (`src/lib/ai/generate-complex-commentary.ts` 참조).

**구현 난이도**: 낮음  
**예상 임팩트**: 중간 — AI 기능 가용성 향상  
**선결 조건**: Groq 키 재발급 (memory: GROQ 키 재발급 필요)

---

### S-7. MOLIT 서비스 에러 핸들링 강화

**문제**: `src/services/molit.ts`, `molit-officetel.ts`, `molit-presale.ts`, `molit-unsold.ts`에 `try/catch` 없음. 국토부 API 장애 시 uncaught exception이 배치 전체를 중단시킬 수 있음.

**수정**: ADR-053 정책(5회 지수 백오프 + 부분 실패 허용)을 `molit.ts` 계열에 적용.

**구현 난이도**: 중간  
**예상 임팩트**: 중간 — 데이터 파이프라인 안정성  
**선결 조건**: 없음

---

## 중기 (1개월)

### M-1. 공인중개사 셀프 포털 구축

**현황**: 중개사는 전적으로 어드민 수동 등록. `RealtorCard`에 전화번호만 있고 자기신청·매물 등록·문의 수신 없음.

**구현 내용**:
1. `/realtors/apply` — 자기신청 폼 (중개사 자격번호 인증, 사무소 정보)
2. `/realtors/dashboard` — 담당 단지 목록, 호가 등록, 문의 알림 수신함
3. 단지 상세 — "이 단지 담당 중개사 없음" → "담당 중개사로 등록" CTA
4. 어드민 검수 → `role='realtor'` 승인 플로우

**구현 난이도**: 높음  
**예상 임팩트**: 높음 — 중개사 월정액 수익 모델 직결 (PRD KPI: 중개 월정액 갱신율)  
**선결 조건**: 중개사 월정액 상품 정의, 자격번호 검증 API 검토(공공데이터포털)

---

### M-2. 광고주 셀프 서비스 포털

**현황**: 광고주가 `/ads`에서 문의 폼 제출 → 어드민 수동 캠페인 생성. 광고주에게 노출/클릭 대시보드 없음.

**구현 내용**:
1. `/advertiser/dashboard` — 본인 캠페인 목록, 실시간 노출/클릭/CTR (데이터 이미 수집 중)
2. `/advertiser/campaigns/new` — 소재 업로드(이미지), 기간·지면 선택, 결제 요청
3. 결제: V1은 토스페이먼츠 인보이스 링크 또는 계좌이체 요청 버튼 (ADR-048 전략 유지)
4. 어드민 검수 후 승인 통보 이메일 (Resend)

**구현 난이도**: 높음  
**예상 임팩트**: 높음 — 광고 운영 자동화, 광고주 신뢰도 향상  
**선결 조건**: 광고 상품 메뉴 확정 (지면·기간·가격표), `role='advertiser'` 플로우 확인

---

### M-3. 카페 글 NLP 단지 매칭 — deferred V2 조기 검토

**현황**: `cafe_post_queue` 테이블 존재. FEATURES.json `cafe-nlp` deferred V2.

**제안**: V2 대신 V1.5에서 경량 버전 구현 가능. 네이버 카페 API 대신 카페 RSS 또는 공개 URL 파싱.

**구현 내용 (경량)**:
1. 카페 새 글 → 단지명 키워드 매칭 (기존 `complex_aliases` 활용)
2. 단지 상세 → "카페에서 이 단지 얘기 중" 섹션 (글 제목 + 날짜 + 링크, 본문 인용 X)
3. 감성 분석은 V2로 보류, 링크만 먼저 노출

**구현 난이도**: 중간  
**예상 임팩트**: 높음 — PRD 핵심 가치 명제 "카페 의견을 단지 페이지에서" 직결  
**선결 조건**: 네이버 카페 약관 재확인 (ADR-004), 크롤링 범위 법적 검토

---

### M-4. 단지 상세 SEO 강화

**현황**: ISR 적용 중. 구조화 데이터(schema.org) 미확인.

**구현 내용**:
1. `src/app/[...slug]/page.tsx` — `RealEstateListing` schema.org JSON-LD 추가 (단지명, 주소, 최근 거래가, 학군 정보)
2. OG 이미지 자동 생성 (`@vercel/og` — 단지명 + 최근 실거래가 + 브랜드)
3. 단지 상세 `<title>` 패턴 최적화: `"창원 OO 아파트 실거래가 | 단지온도"` → 검색 의도 매칭
4. `sitemap.ts` — 842개 단지 전체 포함 여부 확인 및 priority 차등 적용

**구현 난이도**: 중간  
**예상 임팩트**: 높음 — 비회원 SEO 유입(Persona C) 채널 확장  
**선결 조건**: 없음

---

### M-5. 가격 예측 모델 고도화

**현황**: `src/lib/prediction/engine.ts` — linear/double-exp/holt-winters 자동 선택. Grid search 5단계(`[0.1, 0.3, 0.5, 0.7, 0.9]`). 모델 드리프트 감지 없음.

**구현 내용**:
1. Grid search 세분화 (0.05 단계로 250개 → MAPE 개선 예상)
2. `training_mape`가 임계값(예: 15%) 초과 시 Sentry alert + 재학습 트리거
3. 거래 희소 단지(data.length < 6) → 지역 평균 트렌드 보간 fallback (ADR-042 ai_estimates 패턴 활용)
4. 예측 신뢰 구간(`predicted_price_lower/upper`)을 `AiChatPanel` 컨텍스트에 포함

**구현 난이도**: 중간  
**예상 임팩트**: 중간 — AI 기능 신뢰도 향상  
**선결 조건**: Python 배치 환경 확인

---

### M-6. 지역 인구 통계 상세화

**현황**: `district_stats`에 연령대별 인구(`pop_under20`, `pop_20s`~`pop_60plus`) 수집 중이지만 `AnalysisSection`은 총 인구/세대수만 표시.

**구현 내용**:
1. 단지 상세 AnalysisSection — 인구 피라미드 미니 차트 (Recharts BarChart 활용)
2. "학령 인구 비중 X%" — 학군 선택자 Persona A 타깃
3. 인구 변화율 트렌드 (최근 3년) — 투자자 Persona B 타깃

**구현 난이도**: 중간  
**예상 임팩트**: 중간 — 정보 밀도 향상, 차별화 데이터 시각화  
**선결 조건**: KOSIS TTL 갱신 로직 추가 (현재 TTL 없음)

---

### M-7. 체육시설 탭 추가 (수집 완료 데이터 UI 노출)

**현황**: `scripts/fetch-sports-facilities.ts` 구현됨, `src/services/localdata-sports.ts` 어댑터 존재. 그러나 `EducationCard` 내 체육시설 탭 없음. 수집된 태권도·검도·축구 등 체육도장 데이터가 미노출.

**구현 내용**:
1. `EducationCard` — "체육시설" 탭 추가 (반경 1km 내 체육도장 목록)
2. 종목별 아이콘 + 거리 표시 (카카오맵 POI 패턴 동일)

**구현 난이도**: 낮음 (데이터 있음, UI만 추가)  
**예상 임팩트**: 낮음~중간 — 어린이·청소년 자녀 둔 가족 Persona A 타깃  
**선결 조건**: `fetch-sports-facilities.ts` 실행 완료 및 DB 적재 확인

---

### M-8. KOSIS/REB 캐싱 레이어 개선

**현황**: `src/services/reb.ts` — 24개월 기준 72개 HTTP 요청(달별×3). `src/services/kosis.ts` — `region_population_cache`에 TTL 없어 stale 데이터 영구 반환 가능.

**구현 내용**:
1. REB: 월별 루프를 날짜 범위 파라미터로 교체 → 72개 → 1개 요청으로 축소
2. KOSIS: `region_population_cache.fetched_at` 기준 TTL 체크 추가 (1년 임계치)
3. SGIS 토큰 캐싱: `fetchSgisToken()` 결과를 메모리/Redis에 캐시 (현재 매 호출마다 재발급)

**구현 난이도**: 중간  
**예상 임팩트**: 중간 — 외부 API 할당량 절감, 배치 속도 향상  
**선결 조건**: REB API 날짜 범위 파라미터 지원 여부 확인

---

## 장기 전략

### L-1. 카페 글 감성 분석 + 단지 평판 지수

**PRD V2 계획**: `cafe-nlp` 카페 글 NLP 매칭 · 감성 분석.

**아이디어**: 카페 글에서 해당 단지 언급을 감지하고, Groq(무료 고속)으로 긍/부정/중립 분류 → "단지 커뮤니티 온도 지수" 생성. 실거래 가격 + 커뮤니티 온도를 함께 표시하면 PRD 핵심 가치 명제 완성.

**구현 난이도**: 높음  
**예상 임팩트**: 매우 높음 — 경쟁사(호갱노노) 미보유 차별화  
**선결 조건**: 네이버 약관 검토(ADR-004), V2 일정

---

### L-2. 한국어 검색 고도화 (자모 분해 + 초성 검색)

**현황**: `pg_trgm` trigram 기반. "OP" → "올림픽파크" 검색 불가. ADR-032에서 V2 예정.

**구현 내용**:
1. `name_normalized`에 한국어 자모 분해 인덱스 추가 (PostgreSQL `immutable` 함수)
2. 초성 검색: "현삼" → "현대아이파크삼" 매칭
3. 오타 보정: edit distance ≤ 2 허용

**구현 난이도**: 높음  
**예상 임팩트**: 높음 — 검색 전환율 직결  
**선결 조건**: Meilisearch 셀프호스팅 검토 (ADR-015 롤백 옵션)

---

### L-3. 알림 시스템 고도화 — 스마트 알림

**현황**: 즐겨찾기 단지의 신고가 갱신 알림만 있음. GitHub Actions 5분 워커.

**구현 내용**:
1. 알림 타입 확장:
   - "전세가율 X% 돌파" (갭 투자 신호)
   - "거래량 전월 대비 50% 증가" (시장 과열 신호)
   - "AI 예측 방향 변경" (상승→하락 전환 포착)
   - "관심 지역 신규 분양 공고"
2. 알림 빈도 설정 (즉시/일간 다이제스트/주간)
3. Vercel Pro 전환 시 5분 → Vercel Cron으로 통합 (ADR-049 롤백 옵션)

**구현 난이도**: 중간~높음  
**예상 임팩트**: 높음 — PRD KPI 7일·30일 리텐션 직결  
**선결 조건**: Vercel Pro 전환 여부 결정

---

### L-4. 게이미피케이션 기초 — ADR-010 V1.5 조기 검토

**PRD V2 계획**: 게이미피케이션. ADR-010에서 V2 보류.

**경량 V1.5 버전 제안**:
1. 방문한 단지 "임장 기록" 뱃지 (지도 GPS 방문 기록)
2. 즐겨찾기 15개 달성 시 "관심 투자자" 뱃지
3. 후기 작성 + GPS 인증 → "동네 주민 인증" 뱃지
4. 뱃지는 프로필 페이지에만 표시 (마케팅 배지 남발 금지)

**구현 난이도**: 중간  
**예상 임팩트**: 중간 — 리텐션 + 커뮤니티 형성  
**선결 조건**: 익명 후기(S-2) 완료

---

### L-5. 모바일 네이티브 앱 — deferred V2

**현황**: PWA로 운영 중. FEATURES.json `mobile-native` deferred V2. ADR-006.

**조건부 전환 기준**:
- PWA 설치율 < 10% + iOS 푸시 거부율 > 60% → React Native (Expo) 검토
- PWA 성능으로 LCP ≤ 2.5s 달성 가능하면 V2에서도 PWA 유지

**구현 난이도**: 매우 높음  
**예상 임팩트**: 높음 (조건부)  
**선결 조건**: PostHog PWA 설치율/푸시 수신율 데이터 6개월 수집 후 판단

---

### L-6. 광고 결제 자동화 — PG 연동 (ADR-048 V2)

**현황**: V1은 계좌이체 + 수동 청구서. ADR-048에서 PG 연동 V2 예정.

**구현 내용**: 토스페이먼츠 또는 KG이니시스 정기결제 연동. 광고주가 캠페인 등록 시 즉시 결제.

**구현 난이도**: 높음  
**예상 임팩트**: 높음 — 광고 매출 자동화  
**선결 조건**: 광고주 수 10명 이상, 월 광고비 500만원 이상 시 투자 타당

---

### L-7. 추가 공공 데이터 소스 통합

현재 미통합이지만 가치 있는 데이터:

| 데이터 | API | 활용처 | 우선순위 |
|---|---|---|---|
| 전국학원표준데이터 (창원 버스 정류장) | 국토부 버스 API | 지도 도보 접근성 | 낮음 |
| 소상공인 상가 정보 | SBIZ API | 반경 편의시설 품질 보강 | 중간 |
| 종합병원·응급실 거리 | 보건복지부 | 의료 접근성 지표 | 낮음 |
| 전세자금대출 금리 | ECOS `BECBLA0401` | 전세 투자 분석 강화 | 높음 |
| 소비자물가지수(CPI) | ECOS `010Y001` | 실질 가격 변화율 | 중간 |
| 도시정비구역 정보 | data.go.kr | 재개발·재건축 구역 지도 오버레이 | 중간 |

**전세자금대출 금리(ECOS) 추가가 가장 즉각적 가치**: 현재 주담대 금리만 있음. 전세 투자자(Persona B)가 전세금 대출 이자 부담을 계산할 수 있음.

---

## 기술 부채 목록

| # | 위치 | 문제 | 심각도 | 수정 방법 |
|---|---|---|---|---|
| T-1 | `src/lib/data/rankings-page.ts` (13건), `invest.ts` (12건) | `as any` RPC 타입 캐스팅 — 총 109건/45파일 | 중간 | `supabase gen types` + 커스텀 RPC 타입 수동 정의 |
| T-2 | `src/app/[...slug]/page.tsx` | 모바일 레이아웃 인라인 스타일 고정 | 높음 | Tailwind 반응형 클래스 교체 (I-1) |
| T-3 | `src/services/molit.ts` 계열 4파일 | `try/catch` 없음 — API 장애 시 uncaught exception | 높음 | ADR-053 패턴 적용 |
| T-4 | `src/services/naver-land.ts` | `try/catch` 없음 | 중간 | try/catch + graceful degradation |
| T-5 | `src/services/bld-rgst.ts` | `console.error` + throw 패턴 (try 없음) | 중간 | try/catch 래핑 |
| T-6 | `src/services/sgis.ts` | `fetchSgisToken()` 결과 캐싱 없음 (매 호출 재발급) | 낮음 | in-memory 캐시 추가 |
| T-7 | `src/services/kosis.ts:126` | `writeCachedPopulation().catch(() => {})` — 캐시 쓰기 실패 묻힘 | 낮음 | Sentry warn 추가 |
| T-8 | `TierBadge` (complex + reviews), `ShareButton` (complex + rankings) | 동명 컴포넌트 import 혼동 | 낮음 | rename (I-5) |
| T-9 | `/invest`, `/presale`, `/rankings` 등 | `error.tsx` 없음 | 중간 | 공통 ErrorFallback 컴포넌트 + 라우트별 error.tsx |
| T-10 | `src/services/reb.ts` | 달별 72개 HTTP 요청 | 낮음~중간 | 날짜 범위 파라미터로 배치화 |
| T-11 | `src/lib/ai/regional-commentary.ts` | Gemini 전용 — Groq fallback 없음 | 중간 | 이중 provider 패턴 추가 (S-6) |
| T-12 | `src/lib/ai/context-builder.ts` | `listing_prices`, 예측 CI 미포함 | 중간 | AI 채팅 컨텍스트 보강 (I-4) |
| T-13 | `scripts/backfill-*.log`, `scripts/commentary-*.log` | 25개 로그 파일 git에 포함 (약 2,000줄) | 낮음 | `.gitignore`에 `scripts/*.log` 추가 + `git rm --cached` |
| T-14 | `src/lib/prediction/engine.ts` | Grid search 5단계(coarse) + 모델 드리프트 감지 없음 | 낮음 | Grid 세분화 + MAPE 임계치 알림 |
| T-15 | 전체 앱 | `next/image` 미사용 — `AdBanner.tsx`, `RealtorCard.tsx` 등 raw `<img>` | 중간 | `next/image` 교체 (WebP/AVIF + lazy loading) |

---

## 우선순위 매트릭스 요약

```
임팩트↑  │  I-1(모바일)  S-2(후기)  M-1(중개사포털)  L-1(카페NLP)
         │  I-4(AI호가)  S-1(호가UI) M-2(광고포털)   L-3(스마트알림)
         │  S-3(학원완료) S-5(지도필터) M-4(SEO)
임팩트↓  │  I-5(rename) I-6(error.tsx) S-4(타입) M-7(체육시설)
         └─────────────────────────────────────────→ 난이도↑
           낮음           중간           높음        매우높음
```

**즉시 착수 권고 TOP 5**:
1. **I-1** 모바일 레이아웃 수정 — 1일, 임팩트 높음
2. **S-3** 학원 추천 데이터 실행 완료 — Phase 28 마무리, 스크립트 실행만
3. **I-4** AI 채팅 호가 컨텍스트 추가 — 반일, AI 채팅 가치 즉시 향상
4. **S-1** 호가 공인중개사 입력 UI — V1.5 핵심, 중개사 수익 모델 첫 단계
5. **M-4** SEO 강화(JSON-LD + OG 이미지) — 비회원 유입 채널 확장
```
