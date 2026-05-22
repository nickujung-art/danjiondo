# Phase 15: 커뮤니티 & 게이미피케이션 — Context

**Gathered:** 2026-05-22
**Status:** Ready for planning
**Source:** Conversational planning session

<domain>
## Phase Boundary

회원 활동 기반 5단계 등급 시스템 + TierBadge UI,
단지 비교 표 (플로팅 비교바 + /compare 페이지),
Naver Search API 카페 글 단지 매칭 + 일배치 수집.

이 Phase에서 다루지 않는 것:
- 카카오톡 채널 알리미 (DIFF-04) — 제외
- 카페 글 admin 발행 자동화 (OPS-02) — 제외
- GPS L2/L3 인증 (AUTH-01) — 별도

</domain>

<decisions>
## Implementation Decisions

### 회원 등급 시스템 (DIFF-01, DIFF-05)

- **D-01** [LOCKED] 5단계: 브론즈(Bronze) → 실버(Silver) → 골드(Gold) → 플래티넘(Platinum) → 다이아(Diamond)
- **D-02** [LOCKED] 점수 체계 — 활동 종합:
  - 후기(review) 작성: +50점
  - 댓글(comment) 작성: +10점
  - 즐겨찾기(bookmark) 단지 추가: +5점
  - 로그인 일수: +1점/일 (중복 방지 — 당일 최초 로그인만)
- **D-03** [LOCKED] 점수 적립은 DB 트리거(SECURITY DEFINER)로만 — 클라이언트 직접 UPDATE 절대 금지
- **D-04** [LOCKED] 등급 구간 (확정 필요 — 플래너가 적절한 임계값 제안):
  - 브론즈: 0~99점
  - 실버: 100~499점
  - 골드: 500~1,999점
  - 플래티넘: 2,000~4,999점
  - 다이아: 5,000점 이상
- **D-05** [LOCKED] TierBadge UI — profiles 페이지 + 후기 카드에 작은 배지로 표시
- **D-06** [LOCKED] AI 슬롭 금지 — backdrop-blur, gradient-text, glow, 보라/인디고 금지. 이모지 금지, 텍스트+색상만

### 단지 비교 표 (DIFF-06)

- **D-07** [LOCKED] 진입점: 단지 상세 페이지 하단 플로팅 비교바 ("비교에 추가" 버튼)
- **D-08** [LOCKED] 최대 4개 단지 비교
- **D-09** [LOCKED] 비교 페이지 URL: `/compare?ids=id1,id2,id3` (nuqs, URL 공유 가능)
- **D-10** [LOCKED] 비교 항목:
  - 실거래가 추이 그래프 (최근 1년, 동일 차트에 여러 라인)
  - 세대수, 준공연도, 대표 평형
  - 학군 점수·학원 등급 (hagwon_grade)
  - 관리비 월평균 (세대당, 만원)
- **D-11** [LOCKED] 비교 항목 없으면 "데이터 없음" fallback 셀
- **D-12** [LOCKED] 플로팅 바 상태는 Zustand 또는 localStorage — 페이지 이동 시 유지

### Naver 카페 글 매칭 (DIFF-02)

- **D-13** [LOCKED] Naver Search API — cafearticle 엔드포인트 사용 (`https://openapi.naver.com/v1/search/cafearticle.json`)
- **D-14** [LOCKED] 검색 쿼리: `{canonical_name} {si}` (단지명 + 시, 예: "창원자이 창원시")
- **D-15** [LOCKED] 일배치 cron — Vercel Cron 매일 04:30 KST (기존 04:00 cron과 분리)
- **D-16** [LOCKED] 수집 방침: API 제한 내 최대한 많이. Naver Search API 25,000 calls/day 한도 내
- **D-17** [LOCKED] cafe_articles 테이블 신설 (complex_id FK, naver_article_id UNIQUE, title, description, cafe_name, article_url, published_at)
- **D-18** [LOCKED] 단지 상세 페이지에 "관련 카페 글 N개" 섹션 추가 (최신 5개 표시 + 링크)
- **D-19** [LOCKED] Naver Client ID/Secret: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 환경변수
- **D-20** [LOCKED] 어댑터 위치: `src/services/naver-cafe.ts` (CLAUDE.md 아키텍처 규칙)

### Claude's Discretion

- 플로팅 비교바 상태관리 구현체 선택 (Zustand vs localStorage)
- TierBadge 컬러 스키마 (금속 계열 색상 권장 — 브론즈 갈색, 실버 회색, 골드 노랑, 플래티넘 청회색, 다이아 하늘색)
- 비교 페이지 모바일 레이아웃 (스크롤 vs 탭)
- 카페 글 수집 배치 크기 및 재시도 로직

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 아키텍처 규칙
- `CLAUDE.md` — 외부 API 어댑터 위치(src/services/), Supabase 쿼리 제한, RLS 필수, 광고 쿼리 조건

### 기존 패턴 참조
- `src/services/` — 외부 API 어댑터 패턴 (기존 kapt, cheongyak 어댑터 참고)
- `src/app/api/cron/` — 기존 cron 엔드포인트 패턴
- `src/components/complex/` — 단지 상세 컴포넌트 패턴 (EducationCard, ManagementCostCard)
- `src/app/complexes/[id]/page.tsx` — 단지 상세 페이지 (카페 글 섹션 추가 위치)
- `supabase/migrations/` — 마이그레이션 파일 패턴 (RLS 정책 포함 필수)

### 데이터 스키마
- `src/lib/data/complexes-map.ts` — ComplexMapItem 타입 (canonical_name, si, gu 필드)
- 기존 profiles 테이블 — activity_points, tier 컬럼 추가 대상

</canonical_refs>

<specifics>
## Specific Ideas

- 비교 차트: Recharts ComposedChart 사용 (기존 TransactionChart.tsx 패턴 재사용)
- 플로팅 바: 단지 상세 페이지 하단 fixed 위치, z-index 높게
- 카페 글 API: 결과당 최대 100건, display=100&start=1&sort=date
- 로그인 일수 추적: auth.users last_sign_in_at 기반 또는 별도 login_streaks 테이블

</specifics>

<deferred>
## Deferred Ideas

- 카카오톡 채널 알리미 (DIFF-04) — 이번 Phase 제외
- 카페 글 NLP 정확도 측정 (≥85% 목표) — API 검색 방식으로 대체, 정확도 측정 불필요
- 회원 등급별 우선 알림 혜택 실제 연동 — 등급 시스템만 구축, 혜택은 다음 Phase
- GPS 기반 실거주 인증 배지 연동 — 별도 Phase

</deferred>

---

*Phase: 15-community-gamification*
*Context gathered: 2026-05-22 via conversational planning*
