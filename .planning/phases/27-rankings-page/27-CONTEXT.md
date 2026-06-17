# Phase 27: 랭킹 페이지 — Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Source:** 사용자 대화 (discuss-phase 대체)

<domain>
## Phase Boundary

`/rankings` 전용 페이지 신설. 핵심 가치: **"실거래가가 가장 빠른 사이트"** + **"공유하고 싶은 콘텐츠"**.

- 일별 실거래 피드로 데이터 신선도를 시각화
- 신고가·대장단지 등 흥미로운 지표로 바이럴 유도
- 카페(네이버) 공유 CTA로 유입 순환 구조 형성
- 이 페이지는 단독 URL로 공유·캡처·링크 공유 최적화

**Out of scope:**
- 카페 아티클 자동 작성/발행 (별도 phase)
- 실시간 스트리밍 (SSR polling)
- 관리자 큐레이션 UI (수동 대장단지 지정)

</domain>

<decisions>
## Implementation Decisions

### D-01 라우트 구조
- `/rankings` — 메인 랭킹 페이지 (ISR revalidate 3600)
- `/rankings/[date]` — 날짜별 퍼머링크 (날짜 공유용, SSG)
- 네비게이션 헤더에 "랭킹" 링크 추가

### D-02 일별 실거래 피드 (RANK-02)
- `deal_date` 기준 내림차순 그룹핑 (최근 7일)
- 하루 페이지: 고가순 정렬, 최대 50건 표시
- 표시 필드: 단지명(링크) · 전용면적 · 층 · 거래가(억원) · 동 이름
- `deal_type='sale'` 만 (전월세 제외)
- `cancel_date IS NULL AND superseded_by IS NULL` 필터 필수

### D-03 신고가 마크 (RANK-03)
- `complexes.all_time_high` 컬럼 추가 (`INTEGER` — 만원 단위, nullable)
- 매일 배치(daily cron) 또는 ingest 시점에 갱신
- 신고가 갱신된 거래는 `NEW HIGH` 뱃지 표시 (오렌지 #ea580c)
- 비교 기준: 해당 단지의 같은 평형대(±5㎡) 역대 최고가

### D-04 지역 랭킹 (RANK-04)
- `complex_price_stats.price_per_py` 기준 (이미 존재)
- 탭: 창원 전체 / 마산합포·의창·성산·진해 구 / 김해
- 각 탭: 평당가 TOP 20 단지 테이블 (순위·단지명·평당가·최근거래가·거래수)
- 30일 이내 거래 있는 단지만 포함

### D-05 대장단지 섹션 (RANK-05)
- 상단 고정 섹션: 지역별 대장단지 1위 카드 3개 (창원/마산/김해)
- 기준: 최근 3개월 거래량 × 평당가 가중 점수 (자동 계산)
- 카드: 단지명·사진(없으면 아이콘)·평당가·지난달 대비 변동률·거래량

### D-06 이번 주 흥미 지표 (RANK-08)
- 최고가 거래 TOP 3 (이번 주, 실거래 기준)
- 거래량 가장 많은 단지 TOP 5 (이번 달)
- 전월 대비 평당가 급등 단지 TOP 3 (20% 이상)

### D-07 공유 최적화 (RANK-06)
- OG 메타: `og:title="[날짜] 창원·김해 실거래 TOP 10"`, `og:description` 1위 거래 요약
- 카카오·네이버 링크 미리보기 정상 동작
- 각 날짜별 URL: `/rankings/2026-06-17` — 영구 보존

### D-08 카페 공유 유도 (RANK-07)
- 날짜 피드 상단: "카페에 공유하기" 버튼 (네이버 카페 링크 직접 연결)
- 각 거래 행: 단지 상세 링크 (`/complex/[slug]`)
- 하단 고정: "단지온도 카페에서 더 많은 정보 보기"

### D-09 DB 변경
- `complexes.all_time_high INTEGER` 컬럼 추가 (마이그레이션)
- 신고가 배치 갱신 함수 또는 스크립트 추가
- `complex_price_stats` 뷰는 이미 존재 → 추가 뷰 불필요

### Claude's Discretion
- 탭 UI: shadcn Tabs vs 커스텀 버튼 탭 — 프로젝트 패턴 따라 결정
- 신고가 배치: daily cron 포함 vs 별도 스크립트 — daily cron에 포함 권장
- 페이지네이션: 날짜 피드는 무한 스크롤 vs 날짜 탭 — 날짜 탭 권장 (SEO)
- 데이터 캐싱: ISR 1시간 revalidate

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DB 스키마 & 아키텍처
- `docs/ARCHITECTURE.md` — 데이터 모델, 시퀀스, 에러 정책
- `docs/ADR.md` — ADR-001~055 설계 결정 이력
- `supabase/migrations/` — 마이그레이션 패턴

### UI 가이드
- `docs/UI_GUIDE.md` — 색상·타이포·컴포넌트 가이드
- `src/app/globals.css` — CSS 변수 정의

### 기존 패턴 참조
- `src/app/(main)/map/page.tsx` — 지도 페이지 (서버 컴포넌트 패턴)
- `src/components/complex/TransactionHistory.tsx` — 실거래 리스트 UI 패턴
- `src/lib/supabase/server.ts` — Supabase 서버 클라이언트
- `src/app/(main)/layout.tsx` — 메인 레이아웃 (헤더 네비게이션)
- `src/app/api/cron/daily/route.ts` — daily cron 패턴 (신고가 배치 추가 위치)

### 실거래 데이터
- `src/lib/data/realprice.ts` — ingestMonth 패턴 (신고가 비교 로직 참조)

</canonical_refs>

<specifics>
## Specific Ideas

사용자가 명시한 기능 외 추가 제안 (플래너 참고용):

1. **"오늘의 최고가" 공유 카드** — SNS 공유용 이미지 스타일 카드 컴포넌트
   - 배경: 어두운 그라디언트 X (UI 규칙) → 흰 배경 + 강조 오렌지 테두리
   - 캡처하기 좋은 고정 크기 (375×200px)

2. **신고가 알림 연동** — 즐겨찾기 단지 신고가 갱신 시 푸시 알림 (기존 알림 시스템 활용)

3. **거래 없는 날 표시** — "이 날은 창원·김해 거래가 없었습니다" (데이터 신뢰도)

4. **검색엔진 최적화** — `sitemap.xml`에 `/rankings` + 최근 30일 날짜별 URL 포함

</specifics>

<deferred>
## Deferred Ideas

- 관리자 수동 대장단지 지정 UI (현재 자동 계산으로 충분)
- 실거래 카드뉴스 자동 생성 + SNS 발행 (별도 phase)
- 카페 아티클 자동 작성 봇 (별도 phase)
- 전국 비교 (창원 vs 부산 vs 서울) — 데이터 범위 초과
- 오피스텔·빌라 별도 랭킹 탭 — 거래 적어 의미 없음

</deferred>

---

*Phase: 27-rankings-page*
*Context gathered: 2026-06-17 via discuss-phase (대화 기반)*
