# 단지온도 (danjiondo)

창원·김해 실거래가 + 카페 커뮤니티 통합 부동산 사이트.

## 문서 참조
- `docs/FEATURES.json` — **기능 상태 레지스트리** (todo/in_progress/done/deferred/blocked)
- `docs/PRD.md` — 제품 목표·사용자·시나리오·KPI
- `docs/ARCHITECTURE.md` — 기술 스택·데이터 모델·시퀀스·에러 정책
- `docs/ADR.md` — 설계 결정 이력 (ADR-001 ~ ADR-055)
- `docs/UI_GUIDE.md` — 색상·타이포·컴포넌트 가이드

> **세션 시작 시 필수**: `docs/FEATURES.json`을 읽어 `todo`·`in_progress` 항목과 `done` feature의 미완료 checklist를 파악한 뒤 작업 시작. 배경(데이터 모델·ADR·UI 스펙)은 관련 docs 참조.
>
> **FEATURES.json 업데이트 규칙**: feature 완료 시 `status`·`checklist` 갱신 → `summary` 카운트 재계산. deferred/blocked 항목은 조건 충족 전까지 건드리지 않음.

### 세션 시작 체크리스트
1. `docs/FEATURES.json` 읽기 → `in_progress`·`todo` 항목 파악
2. `done` 항목 중 checklist에 `todo` 남은 것 확인 → 반구현 위험 포착
3. 해당 기능 관련 docs 읽기 (필요 시)

## 작업 방식

### 큰 작업 (Phase/기능 단위)
`/gsd-plan-phase` → PLAN.md 작성 → `/gsd-execute` (wave별 단계 커밋)
- wave 단위로 코드 작성 → 커밋 → 다음 wave 진행
- 각 wave 완료마다 커밋, phase 완료 시 SUMMARY 업데이트

### 간단한 수정·소형 기능
대화로 바로 실행 (plan 없이 직접 Edit/Write/Bash)
- 버그 수정, 단일 컴포넌트 수정, 스크립트 1회 실행, 스타일 조정 등

### 판단 기준
- 파일 3개 초과 변경 예상 → GSD Phase
- 마이그레이션 + 코드 + 스크립트 세트 → GSD Phase
- 파일 1~2개, 명확한 범위 → 대화로 직접

## 스택
Next.js 15 App Router · TypeScript strict · Tailwind 3.4 · Supabase (Postgres+PostGIS+RLS) · Supabase Auth (Naver OAuth + Email OTP) · Serwist PWA · Recharts · react-kakao-maps-sdk · Vitest + Playwright · Vercel Hobby + GitHub Actions CI

## 현재 구현 단계 (2026-06-16 기준)

### 완료된 주요 기능
| 기능 | 상태 |
|---|---|
| 단지 검색 (자동완성·슬러그 URL) | ✅ |
| 단지 상세 (10년 그래프·거래 내역·시설) | ✅ |
| 지도 검색 (카카오맵·평당가 핀·클러스터) | ✅ |
| 회원·즐겨찾기·알림 (Naver OAuth·이메일 OTP) | ✅ |
| 광고 시스템 (분양+중개·어드민 검수) | ✅ |
| 학군 (학교알리미·진학률·순위·연락처) | ✅ |
| 관리비 (K-apt) | ✅ |
| 분양 정보 (crawl-presale·Gemini 파서) | ✅ |
| AI 코멘트 (Chronos 12개월 예측 + Groq) | ✅ |
| 투자 분석 (Gap 분석·사분면·지역 인구) | ✅ |
| 단지 비교 | ✅ |
| PWA (Serwist·웹 푸시) | ✅ |
| 재건축 정보 (어드민 수동) | ✅ |
| 어드민 콘솔 (회원·광고·카드뉴스·공인중개사) | ✅ |

### 진행 중 / 예정
- 11월: 학교 진학률 데이터 갱신 (`scrape-school-advancement.ts` 중/고 재실행)

## 아키텍처 규칙
- **CRITICAL** 외부 API (국토부·카카오·학교알리미·K-apt) → `src/services/` 어댑터 전용. 컴포넌트·라우트 직접 호출 금지
- **CRITICAL** Supabase 쿼리 → 서버 컴포넌트·API Route 전용. `src/lib/supabase/client.ts`는 실시간 구독 전용
- **CRITICAL** 사용자 데이터 테이블은 RLS 정책 필수. `supabase/migrations/`에 포함
- **CRITICAL** `complexes`가 Golden Record. 단지명 단독 매칭 금지 — 항상 좌표+이름 복합 매칭. 별칭은 `complex_aliases`에 누적
- **CRITICAL** 광고 쿼리: `now() BETWEEN starts_at AND ends_at AND status='approved'` 필수
- 거래 조회: `WHERE cancel_date IS NULL AND superseded_by IS NULL` 필수 (취소·정정 제외)
- Server Action 우선 (폼·mutation). REST Route는 외부 노출 필요 시만
- 디렉토리: 컴포넌트 `src/components/` · 도메인 `src/lib/` · 어댑터 `src/services/` · 타입 `src/types/`

## 개발
- TDD: 테스트 먼저 작성 후 구현
- 커밋: `feat(scope): 설명` / `fix:` / `refactor:` / `docs:` / `chore:`
- Cron: 일배치 Vercel Cron (04:00 KST), 알림 워커 GitHub Actions `*/5 * * * *` (Vercel Hobby 1일 1회 한도 때문), cron endpoint는 `CRON_SECRET` 헤더 검증 필수

## 명령어
```
npm run dev      # localhost:3000
npm run build    # 프로덕션 빌드
npm run lint     # ESLint + tsc
npm run test     # Vitest
npm run test:e2e # Playwright
npm run db:push  # 마이그레이션 적용
```

## UI 규칙
- 금지: backdrop-blur · gradient-text · glow 애니메이션 · "Powered by AI" 배지 · 보라/인디고 브랜드색 · gradient orb
- 애니메이션은 compositor 속성만 (`transform` · `opacity` · `clip-path`). `width/height/top/margin` 등 layout 속성 애니메이션 금지
- Semantic HTML 우선 (`<header>`, `<main>`, `<section aria-labelledby>` 등). 의미없는 div 스택 금지
