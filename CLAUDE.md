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

### 소형 작업 — FIX LOOP

버그 수정·소소한 수정 요청 시 아래 루프를 **항상** 실행한다.

#### STEP 1: 복잡도 분류 (GSD 차단 게이트)

아래 항목 중 하나라도 해당하면 FIX LOOP를 **즉시 중단**하고 사용자에게 묻는다.
> "이 작업은 GSD Phase 범위입니다. `/gsd-plan-phase`로 시작하시겠습니까?"

**GSD 강제 전환 트리거**
- 새 페이지 / 라우트 생성
- DB 스키마 변경 (migration 파일 필요)
- 새 API 엔드포인트 추가
- 외부 서비스 신규 연동
- 신규 컴포넌트 3개 이상 동시 생성
- 변경 파일 예상 4개 초과
- `FEATURES.json`에 없는 신규 기능

**분류 결과**

| 분류 | 조건 | 처리 |
|---|---|---|
| **Trivial** | 파일 1개 + 변경 5줄 이하 + 로직 없음 (텍스트·오타·단순 스타일) | 실행 → tsc+lint → 커밋 → 완료 알림 |
| **Small** | 파일 1~3개, 기존 로직 수정, DB/API 변경 없음 | 전체 FIX LOOP 실행 |

#### STEP 2: 컨텍스트 파악 (Small만)
1. `.planning/fix-loop/error-notes.md` 먼저 스캔 (과거 실수 확인)
2. 영향 파일·컴포넌트 파악 — 범위가 2개 이상 컴포넌트에 걸치면 병렬 스킬 호출

#### STEP 3: 기획안 작성
1. `error-notes.md` 재참조 후 `.planning/fix-loop/active-fix.md` 작성
   ```
   ## 문제 정의 / 수정 범위 (파일 목록) / 해결 접근법 / 예상 변경 사항 / 루프 카운터: 0
   ```

#### STEP 4: 검증
`code-reviewer` 에이전트로 기획안 및 코딩 계획 검증.

#### STEP 5: 승인 요청
검증 결과를 포함하여 사용자에게 기획안 제안 → 승인 후 실행.

#### STEP 6: 실행
승인된 기획안대로 코드 수정.

#### STEP 7: QA 루프 (최대 3회)
**점수 계산**: tsc+lint 에러 0 → 70점 / 관련 테스트 전부 통과 → +20점 / 기획안 의도 충족 → +10점

- **< 90점** → `error-notes.md`에 오답 기록 → `active-fix.md` 루프 카운터 +1 → STEP 3 복귀
- **3회 초과** → GSD Phase 전환 권장 알림, `active-fix.md` 보존 후 중단
- **≥ 90점** → 다음 단계

#### STEP 8: Playwright 시각 검증
1. `localhost:3000` 상태 확인 → 미실행 시 `npm run dev` 자동 시작
2. 수정된 기능·화면 직접 클릭 확인 (기능 + 디자인 모두)

#### STEP 9: 커밋
`fix: 설명` 타입으로 커밋.

#### STEP 10: UAT 요청
1. `active-fix.md` 기획안 기반으로 UAT 체크리스트 자동 생성 후 사용자에게 전달
2. `active-fix.md` → `.planning/fix-loop/archive/YYYYMMDD-HHmm.md` 이동

---

**오답노트 규칙** — `.planning/fix-loop/error-notes.md` (영구 누적)
```
## #NNN · YYYY-MM-DD · [컴포넌트/페이지]
상황 / 실수 / 교훈
```
QA 실패 시 반드시 기록. STEP 2·3에서 항상 참조.

## 스택
Next.js 15 App Router · TypeScript strict · Tailwind 3.4 · Supabase (Postgres+PostGIS+RLS) · Supabase Auth (Naver OAuth + Email OTP) · Serwist PWA · Recharts · react-kakao-maps-sdk · Vitest + Playwright · Vercel Hobby + GitHub Actions CI

## 현재 구현 단계 (2026-06-24 기준)

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
| 인스타 카드뉴스 생성기 (Puppeteer·주간 PNG 자동화·창원부동산랩) | 🔄 |

### 진행 중 / 예정
- 11월: 학교 진학률 데이터 갱신 (`scrape-school-advancement.ts` 중/고 재실행)

## 아키텍처 규칙
- **CRITICAL** 외부 API (국토부·카카오·학교알리미·K-apt) → `src/services/` 어댑터 전용. 컴포넌트·라우트 직접 호출 금지
- **CRITICAL** Supabase 쿼리 → 서버 컴포넌트·API Route 전용. `src/lib/supabase/client.ts`는 실시간 구독 전용
- **CRITICAL** 사용자 데이터 테이블은 RLS 정책 필수. `supabase/migrations/`에 포함
- **CRITICAL** 신규 RLS 정책은 `TO` 절을 명시한다 (`TO anon, authenticated` · `TO authenticated` 등)
  - 생략 시 `TO public`이 되어 anon까지 포함된다
  - 쓰기 정책(INSERT/UPDATE/DELETE)은 `auth.role() = 'service_role'` · `auth.uid()` · `profiles.role` 검사 중 하나를 반드시 갖는다
  - 단서: 기존 정책의 일괄 수정은 범위 밖 (Phase 38 D-04 — 읽기 정책의 `TO public`은 공개 읽기 의도와 일치, 쓰기 정책은 전수 확인 결과 제한 조건 보유)
- **CRITICAL** `CREATE INDEX CONCURRENTLY`는 `npm run db:push`로 적용 불가하다 (`CONCURRENTLY`는 트랜잭션 블록에서 실행 불가한데 Supabase CLI가 마이그레이션을 트랜잭션으로 감싼다)
  - 별도 경로로 적용한 뒤 `npx supabase migration repair --status applied <version>`을 반드시 실행해 원장에 기록한다
  - 누락하면 마이그레이션 원장 drift가 된다 (선례: `20260728120000`·`20260731000001`)
- **CRITICAL** UNIQUE 제약·인덱스를 바꾸는 마이그레이션은 **같은 커밋에서** 해당 테이블의 `.upsert(…, { onConflict: '…' })` 호출부를 함께 갱신한다 (Phase 39 고장 4건이 전부 이 누락에서 나왔다)
  - `onConflict`는 **비부분(non-partial) UNIQUE 인덱스**만 추론할 수 있다. 부분 인덱스(`WHERE …`)를 만들면 컬럼 목록을 어떻게 맞춰도 PostgREST upsert는 `42P10`으로 실패한다 → 그 테이블은 upsert 대신 명시적 select→insert/update를 쓴다
  - 검증 2층: ① `src/lib/db/onconflict-audit.test.ts` — **DB 불필요·항상 실행.** 부분 인덱스 오판 방지 + 실물 `src/` 스캐너 건전성 ② `src/__tests__/onconflict-constraint-gate.test.ts` — 실제 카탈로그 대조. **라이브 DB 필요하고 CI에는 자격증명이 없어 skip된다** → `TEST_SUPABASE_URL=… TEST_SUPABASE_SKEY=… npx vitest run src/__tests__/onconflict-constraint-gate.test.ts`로 수동 실행
- **CRITICAL** `complexes`가 Golden Record. 단지명 단독 매칭 금지 — 항상 좌표+이름 복합 매칭. 별칭은 `complex_aliases`에 누적
- **CRITICAL** 거래→단지 연결은 **지번을 넘긴다.** `lookupComplexIdCached(sgg, name, umdNm, jibun)` 의 4번째 인자를 생략하면 지번 게이트가 꺼지고 이름 단독 매칭으로 되돌아간다
  - 2026-08-21 전수 조사에서 이름만으로 붙은 오연결 1,659건이 나왔다 (시영장미 ← 7.5km 떨어진 양덕동 거래 67건 등). 이 규약이 거래 연결 경로에서 지켜지지 않고 있었다
  - 게이트는 `complex_canonical_jibun`(거래 다수결로 만든 단지별 확정 지번)을 본다. 지번이 **유일하게** 한 단지를 가리킬 때만 작동하고, 1차·2차가 같은 지번을 쓰는 충돌 그룹에서는 꺼져 이름에 맡긴다
  - **두 근거는 상호 보완한다** — 이름 같고 지번 다르면 지번이, 지번 같고 차수 다르면 이름이 가른다. 어느 한쪽만으로는 못 푼다
  - 배경·함정·잔여 과제: `.planning/data-quality/matching-integrity-20260821.md`
- **CRITICAL** 매칭 RPC(`match_complex_by_admin`)를 바꾸면 **반드시 호출해서 확인한다.** `db push` 성공은 검증이 아니다 — plpgsql 은 지연 바인딩이라 본문 오류가 실행 시점에야 드러난다 (선례: `min(uuid)` 부재로 함수가 통째로 죽음 / `search_path=''` + 미수식 참조로 즉시 죽음 `20260819030000`)
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
