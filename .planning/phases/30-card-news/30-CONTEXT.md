# Phase 30: 인스타 카드뉴스 생성기 — Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Source:** 직접 기획 (사용자 요청 + CARDDESIGN.md 사양서)

<domain>
## Phase Boundary

이번 Phase는 `bds/card-news/` 서브프로젝트를 구성하는 것이다.
기존 bds Next.js 앱과 같은 Supabase DB를 공유하지만, 완전히 독립된 Node.js 스크립트 시스템이다.

**핵심 산출물:**
- 매주 실행되는 카드뉴스 생성기 (Node.js ESM)
- CARDDESIGN.md 규격의 PNG 파일 4장 세트 × 여러 시리즈
- GitHub Actions 주간 자동화

**Phase 2 (인스타그램 자동 업로드)는 이번 Phase에 포함하지 않는다.**

</domain>

<decisions>
## Implementation Decisions

### 엔진 선택
- HTML/Puppeteer 방식 확정 (한글 100% 정확, 무료, 수정 즉시 반영)
- Gemini 이미지 API 불사용 (비결정적, 비용 발생, 한글 오류 위험)

### 폴더 구조
- `bds/card-news/` 내부에 독립 Node.js ESM 프로젝트
- `scripts/` — 모든 실행 스크립트
- `templates/` — (사용 안 함, templates.js가 HTML string 반환)
- `fonts/` — Pretendard woff2 로컬 파일 (setup.js로 다운로드)
- `assets/logo.png` — 창원부동산랩 로고 (이미 배치됨)
- `output/YYYY-WW/series-id/` — 주차별 PNG 출력

### 캔버스 규격
- 1080×1080px (인스타 정사각형 피드)
- deviceScaleFactor: 1 (출력 = 정확히 1080×1080)
- Puppeteer headless Chromium

### 폰트 처리
- Pretendard 5개 웨이트 woff2 (Black/ExtraBold/Bold/SemiBold/Medium)
- jsDelivr CDN에서 setup.js로 자동 다운로드
- CSS @font-face에서 절대 경로 참조 (templates.js의 ROOT 변수)
- Puppeteer에서 `document.fonts.ready` + 300ms delay로 폰트 로드 보장

### 데이터 소스
- Supabase service_role key로 직접 쿼리
- `transactions` 테이블: `complex_id, price, area_m2, deal_date, deal_type, sgg_code, cancel_date, superseded_by`
- `complexes` 테이블: `id, canonical_name, si, gu`
- 필터: `cancel_date IS NULL AND superseded_by IS NULL AND deal_type='sale'`
- 기간: 지난 주 월~일 (deal_date 기준)
- 활성 SGG: `['48121','48123','48125','48127','48129','48250']`

### 생성 시리즈 (14개 기본 시리즈)
**구별 평형 랭킹 (12개):**
- 84㎡ × 6개 구 (성산/의창/마산합포/마산회원/진해/김해)
- 59㎡ × 6개 구
- 102㎡ × 성산/의창 (거래 많은 2개 구만)

**도시 전체 (3개):**
- city-overall: 창원+김해 전체 최고가 TOP 10
- city-volume: 거래량 TOP 10
- city-value-84: 84㎡ 기준 가성비(평당가↓) TOP 10

**특별 (1개):**
- district-champions: 구별 대장단지 비교 (6개 구 × 1위)

### CARDDESIGN.md 카드 구성 (4장)
1. **표지 (Cover B)**: 흰 배경, 파란 톱바(14px), 브랜드 락업, Eyebrow(WEEKLY REPORT·주차), 대제목 3줄(지역/평형/랭킹 TOP 10), 거대 고스트 숫자 "10", 카피, 위치 메타
2. **TOP 3 하이라이트**: 1위=네이비 카드+골드 배지+골드 가격, 2·3위=흰 카드
3. **전체 랭킹 1~10위**: 10행 표, 1위=골드-2 숫자, 빈 항목=플레이스홀더(회색)
4. **클로징 CTA**: 네이비 배경, 팔로우+저장하기 버튼, 면책 문구

### 컬러 토큰 (CARDDESIGN.md 확정값)
```
--brand: #0066FF  --brand-tint: #EAF2FE
--ink: #152038    --ink-2: #5B6677    --ink-3: #8A93A3
--gold: #FFC93C   --gold-2: #FFAB00
--surface: #FFFFFF  --surface-2: #F7F8FA
--line: rgba(112,115,124,0.18)  --placeholder: #C4CAD3
```
그라데이션·빨강·초록 사용 금지.

### GitHub Actions
- 트리거: 매주 월요일 00:10 KST (일요일 15:10 UTC)
- `workflow_dispatch`로 수동 실행 가능 (--dry-run, --series 옵션)
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- 출력: PNG artifact (30일 보존)

### Claude's Discretion
- 거래 없는 구/평형 조합의 시리즈는 플레이스홀더로 채워 생성 (스킵 안 함)
- Puppeteer 브라우저 인스턴스 재사용 (카드 4장 캡처 후 close)
- temp HTML 파일명: `temp-{timestamp}-{random}.html` (동시성 충돌 방지)
- 폰트 로드 실패 시 fallback: `-apple-system, 'Apple SD Gothic Neo', sans-serif`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 디자인 사양
- `bds/card-news/CARDDESIGN.md` — 1080×1080 카드 4장 전체 레이아웃·컬러·타이포 사양서

### 기존 구현 (이미 작성된 파일들 — 수정/완성 필요)
- `bds/card-news/scripts/fetch-data.js` — Supabase 집계 함수 (완성)
- `bds/card-news/scripts/templates.js` — HTML 템플릿 (완성 — 시각 검증 필요)
- `bds/card-news/scripts/capture.js` — Puppeteer 캡처 (완성)
- `bds/card-news/scripts/generate.js` — 오케스트레이터 (완성)
- `bds/card-news/scripts/setup.js` — 폰트 다운로드 (완성)
- `bds/card-news/assets/logo.png` — 창원부동산랩 로고
- `bds/card-news/package.json` — Node.js ESM + puppeteer + @supabase/supabase-js

### DB 패턴 참조
- `bds/src/lib/data/rankings.ts` — aggregateHighPrice/aggregateVolume/aggregatePricePerPyeong 패턴
- `bds/src/lib/data/complex-detail.ts` — RawTransaction 스키마, complexes 필드명

</canonical_refs>

<specifics>
## Specific Ideas

- 이미 작성된 스크립트 파일들이 `card-news/scripts/`에 있다. Plan에서 이 파일들을 **검증·테스트** 중심으로 접근해야 한다 (재작성이 아니라 확인 + 빈 부분 채우기).
- setup.js가 정상 동작하는지 실제 실행 테스트 필요 (fonts/ 폴더 채워지는지 확인)
- 드라이런 (`--dry-run`) 모드로 HTML 출력 확인 후 실제 PNG 캡처 진행
- 템플릿 시각 검증: 생성된 PNG 파일을 직접 확인해 CARDDESIGN.md 스펙과 일치하는지 체크

</specifics>

<deferred>
## Deferred Ideas

- Phase 2: Instagram Graph API 자동 업로드 (이번 Phase 범위 밖)
- Supabase Storage에 PNG 자동 저장 (Phase 2와 함께)
- 카드뉴스 미리보기 웹페이지 `/admin/card-news` (Phase 2와 함께)
- 102㎡ 시리즈 6개 구 전체 (현재 2개 구만)
- 115㎡ 시리즈 (현재 미구현)

</deferred>

---

*Phase: 30-card-news*
*Context gathered: 2026-06-24 — 직접 기획*
