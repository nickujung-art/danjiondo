# Phase 31: 어드민 카드뉴스 빌더 - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** 사용자와의 기획 논의 (discuss-phase equivalent)

<domain>
## Phase Boundary

어드민 콘솔(`/admin/cardnews/builder`)에 임시·이슈성 카드뉴스를 직접 생성하는 빌더를 추가한다.
기존 GitHub Actions 자동 주간 생성(18시리즈)은 유지하되, 빌더는 그 외 특별 카드를 만드는 보완 도구.
별도 메뉴(`/admin/cardnews/scheduler`)에서 자동 배포 스케줄러 on/off 관리 기능도 추가.

**포함 범위:**
- 데이터 집계 API (매매·전세·월세, 이상치 필터)
- 카드 HTML 생성 API (기존 templates.js 패턴 재사용)
- Groq AI 텍스트 생성 API (제목·캡션·SNS·해시태그)
- GitHub Actions workflow_dispatch 트리거 + artifact ZIP 다운로드
- 빌더 UI 페이지 (옵션 패널 + iframe 미리보기 + AI 에디터 + 다운로드)
- 스케줄러 관리 페이지 (enable/disable·수동 트리거·실행 이력)
- fetch-data.js 확장 (전세·월세·신고가·변동률 신규 쿼리)
- 법적 표기 강화 (모든 카드 출처 표기)

**제외 범위:**
- Instagram Graph API 자동 업로드 (Phase 2)
- 카드 이력 DB 저장 (미구현)
- on-demand Puppeteer 서버사이드 (Vercel Hobby 제약)

</domain>

<decisions>
## Implementation Decisions

### D-01 주 사용 케이스 [LOCKED]
임시/이슈성 카드 (규제 발표, 금리 변동 등 시의성 이슈) + 특정 요청 대응.
자동 주간 18시리즈와 보완 관계 — 겹쳐도 무방 (완전 독립 운영).

### D-02 PNG 생성 방식 [LOCKED]
GitHub Actions workflow_dispatch 트리거 방식. Vercel Hobby는 Puppeteer 실행 불가.
- 흐름: 빌더 옵션 설정 → "PNG 생성" 클릭 → Actions 트리거 → artifact ZIP 다운로드 URL 반환
- 브라우저 미리보기: iframe에 HTML 직접 렌더링 (스케일 다운)
- GitHub API 토큰: `GITHUB_TOKEN` 시크릿 사용 (workflow_dispatch 권한 필요)

### D-03 AI API [LOCKED]
Groq (기존 `GROQ_API_KEY` 환경변수 사용). 모델: `llama-3.3-70b-versatile`.
AI는 텍스트 창작만 담당 — 숫자는 코드로 계산 후 프롬프트에 주입.

### D-04 데이터 품질 필터 [LOCKED]
- 최소 거래 건수: 단지당 3건 미만이면 랭킹에서 제외
- 가격 이상치: 해당 단지 최근 12개월 평균가 대비 200% 초과 거래 제외
- 데이터 완결성 경고: 선택 기간 종료일이 현재 기준 7일 이내면 "데이터가 완전하지 않을 수 있습니다" 경고 표시
- UI: `DataQualityWarning` 컴포넌트로 경고 표시

### D-05 AI 텍스트 편집 [LOCKED]
AI 생성 텍스트는 수정 가능한 인라인 에디터 제공. "재생성" 버튼도 제공.
생성 후 수정 → 다운로드 워크플로우.

### D-06 이력 저장 [LOCKED]
없음. 단순 생성기 — 생성 후 다운로드, DB 저장 없음.

### D-07 자동 배포 관계 [LOCKED]
보완 관계. 스케줄러 관리 메뉴 (`/admin/cardnews/scheduler`) 별도 제공.
- GitHub Actions weekly-generate.yml enable/disable (via GitHub API)
- 마지막 실행 날짜·결과 조회
- 수동 트리거 버튼 (전체 또는 특정 시리즈)
- 다음 예정 실행 시각 표시

### D-08 법적 표기 [LOCKED]
모든 생성 카드에 필수 포함:
- 클로징 카드 하단: "출처: 국토교통부 실거래가 공개시스템"
- 면책 문구: "본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다"
- templates.js의 renderClosing() 함수에 하드코딩 (제거 불가)

### D-09 빌더 옵션 스펙 [LOCKED]
```
■ 기간: 주간(지난주) | 월간 | 분기 | 연간 | 직접지정(날짜범위)
■ 주제: 매매최고가 | 전세최고가 | 월세최고보증금 | 거래량 | 평당가가성비 | 신고가경신 | 가격변동률 | 구별대장단지
■ 지역: 전체 | 성산구(48123) | 의창구(48121) | 마산합포구(48125) | 마산회원구(48127) | 진해구(48129) | 김해시(48250) (복수선택)
■ 평형: 전체 | 소형59㎡(55~65) | 국민84㎡(80~95) | 준대형102㎡(98~110) | 직접입력(min/max)
■ 제목: AI자동생성(Groq) | 직접입력
■ AI추가: □커버캡션 □인사이트코멘트 □SNS캡션 □해시태그
```

### D-10 카드 세트 구성 [LOCKED]
기본 4장: [커버] → [하이라이트 TOP3] → [랭킹 TOP10] → [클로징]
선택시 5번째: [AI 시황 카드] (텍스트 위주 인사이트)

### D-11 DB 데이터 현황 [LOCKED - 확인 완료]
- transactions.deal_type: 'sale'(197,606건), 'jeonse'(57,138건), 'monthly'(40,619건)
- 기존 fetch-data.js: 매매(sale)만 지원 → jeonse/monthly 신규 추가 필요

### D-12 어드민 네비게이션 [LOCKED]
- 기존 /admin/cardnews: 텍스트 복사 페이지 (유지)
- 신규 /admin/cardnews/builder: 카드뉴스 빌더
- 신규 /admin/cardnews/scheduler: 자동 배포 관리

### Claude's Discretion
- 컴포넌트 파일 분리 단위 (300~500줄 기준)
- iframe 스케일링 방식 (CSS transform scale)
- AI 프롬프트 한국어 톤 (친근한 대화체, 부동산 전문 어휘)
- Groq API 에러 시 폴백 처리 (재시도 버튼만)
- GitHub Actions artifact 만료(30일) 안내 방식

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 카드뉴스 스크립트 (기존 구현 참조 필수)
- `card-news/scripts/fetch-data.js` — Supabase 집계 쿼리 패턴 (5종 함수, 이상치 없음)
- `card-news/scripts/templates.js` — HTML 카드 템플릿 4종 + renderClosing (법적 표기 추가 필요)
- `card-news/scripts/generate.js` — 시리즈 정의 패턴 (18개)
- `card-news/CARDDESIGN.md` — 컬러·타이포·레이아웃 규격

### 어드민 현황 (기존 패턴 준수)
- `src/app/admin/cardnews/page.tsx` — 기존 어드민 카드뉴스 페이지 (권한 검증 패턴)
- `src/app/admin/layout.tsx` — 어드민 레이아웃 (있으면)
- `src/lib/supabase/` — Supabase 클라이언트 패턴 (server vs client)

### AI 통합 (Groq 기존 패턴)
- `src/services/` — 외부 API 어댑터 패턴 (CLAUDE.md CRITICAL 규칙)
- 기존 Groq 사용 파일 — API 호출 패턴 참조

### GitHub Actions
- `.github/workflows/weekly-generate.yml` — 기존 워크플로우 (trigger/artifact 패턴)

### 프로젝트 규칙
- `CLAUDE.md` — 아키텍처 규칙 (서비스 어댑터, 서버 컴포넌트, RLS 등)
- `docs/ARCHITECTURE.md` — 기술 스택·데이터 모델

</canonical_refs>

<specifics>
## Specific Ideas

- iframe 미리보기: `<iframe srcDoc={htmlString} style={{transform: 'scale(0.4)', transformOrigin: 'top left', width: '1080px', height: '1080px'}} />`
- 신고가 경신 쿼리: 최근 기간 내 거래가 > 해당 단지 이전 모든 거래 최고가
- 가격 변동률 쿼리: 이번 기간 평균가 vs 직전 동일 기간 평균가 비율
- GitHub API: `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
- GitHub API: `GET /repos/{owner}/{repo}/actions/runs` (실행 이력)
- 스케줄러 enable/disable: `PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable|disable`

</specifics>

<deferred>
## Deferred Ideas

- Instagram Graph API 자동 업로드 (Phase 2)
- 카드 이력 저장 및 조회
- on-demand Puppeteer (서버사이드 PNG, @sparticuz/chromium)
- AI 시황 카드 (5번째 카드) — 기획은 완료, 구현은 나중에
- 월세 카드뉴스 (월세 보증금+월세 이중 표기 복잡 — 추후 별도 Phase)

</deferred>

---
*Phase: 31-admin-cardnews-builder*
*Context gathered: 2026-06-25 via 기획 논의*
