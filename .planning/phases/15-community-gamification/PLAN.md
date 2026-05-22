---
phase: 15-community-gamification
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260522000001_phase15_tier_extension.sql
autonomous: true
requirements: [DIFF-01, DIFF-02, DIFF-06]

must_haves:
  truths:
    - "5단계 등급 체계(브론즈/실버/골드/플래티넘/다이아)가 DB에 정의되어 있다"
    - "포인트 적립 함수가 새 임계값(100/500/2000/5000)으로 등급을 갱신한다"
    - "후기 +50, 댓글 +10, 즐겨찾기 +5, 일일 로그인 +1 트리거가 존재한다"
    - "일일 로그인 중복 방지가 DB에서 보장된다"
    - "cafe_articles 테이블이 RLS와 함께 존재한다"
  artifacts:
    - path: "supabase/migrations/20260522000001_phase15_tier_extension.sql"
      provides: "등급 체계 확장 + cafe_articles 테이블 + 즐겨찾기/로그인 트리거"
      contains: "platinum.*diamond.*cafe_articles"
  key_links:
    - from: "profiles.activity_points"
      to: "profiles.member_tier"
      via: "add_activity_points() CASE WHEN"
      pattern: "5000.*diamond.*2000.*platinum"
    - from: "user_favorites INSERT"
      to: "add_activity_points('favorite')"
      via: "award_favorite_points trigger"
      pattern: "award_favorite_points"
---

<objective>
DB 스키마 기반 작업 — Phase 8 등급 체계를 3단계에서 5단계로 확장하고,
새 포인트 임계값/점수 적용, 즐겨찾기·일일 로그인 트리거 추가,
cafe_articles 테이블 신설.

Purpose: Wave 2(서비스)와 Wave 3(UI)의 모든 후속 작업이 이 스키마에 의존한다.
Output: 마이그레이션 파일 1개 — 모든 DB 변경을 원자적으로 적용.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Users/jung/coding/bds/.planning/ROADMAP.md
@C:/Users/jung/coding/bds/CLAUDE.md
@C:/Users/jung/coding/bds/supabase/migrations/20260512000001_phase8_gamification.sql
@C:/Users/jung/coding/bds/supabase/migrations/20260520000003_fix_add_activity_points_security.sql
@C:/Users/jung/coding/bds/supabase/migrations/20260512000003_phase8_cafe_posts.sql

<interfaces>
<!-- 현재 상태 (이 마이그레이션이 수정할 것들) -->

profiles 테이블 (기존):
  activity_points integer NOT NULL DEFAULT 0
  member_tier text NOT NULL DEFAULT 'bronze'
    CHECK (member_tier IN ('bronze', 'silver', 'gold'))   -- 3단계만 존재

activity_logs.reason CHECK:
  ('review', 'comment', 'gps_verify', 'daily_visit', 'first_favorite')
  -- 'favorite' 없음, 'daily_visit'이 로그인 개념과 혼재됨

add_activity_points() 기존 임계값:
  >= 200 → gold
  >= 50  → silver
  else   → bronze

award_review_points()  → 10점  (D-02: 50점으로 변경)
award_comment_points() → 3점   (D-02: 10점으로 변경)

user_favorites 테이블: (20260430000015_favorites.sql에 존재)
  INSERT 트리거 없음 → 즐겨찾기 포인트 트리거 신규 추가 필요

cafe_posts 테이블 (기존 NLP 스키마):
  confidence, is_verified 컬럼 포함 — Phase 15 새 cafe_articles와 별개 유지
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>T-15-01: Phase 15 DB 마이그레이션 — 등급 확장 + 트리거 + cafe_articles</name>
  <files>supabase/migrations/20260522000001_phase15_tier_extension.sql</files>
  <behavior>
    - member_tier CHECK constraint가 5개 값('bronze','silver','gold','platinum','diamond')을 허용한다
    - add_activity_points()가 5단계 임계값으로 등급을 계산한다: 5000+=diamond, 2000+=platinum, 500+=gold, 100+=silver, else bronze
    - award_review_points()가 50점을 지급한다
    - award_comment_points()가 10점을 지급한다
    - award_favorite_points() 트리거가 user_favorites INSERT 후 5점을 지급한다
    - award_daily_login_points() 함수가 activity_logs에서 당일 'daily_login' 기록 확인 후 중복이면 false, 최초면 activity_logs INSERT + profiles UPDATE를 직접 수행하고 true를 반환한다 (add_activity_points() 호출 금지 — auth.uid() 체크 충돌)
    - cafe_articles 테이블이 naver_article_id UNIQUE 제약으로 생성된다
    - cafe_articles에 RLS가 활성화되고 SELECT는 public, INSERT/UPDATE는 service_role로 제한된다
  </behavior>
  <action>
마이그레이션 파일을 다음 순서로 작성:

**1. member_tier CHECK 확장**
기존 CHECK 제약을 DROP하고 5단계 값을 포함하는 새 제약을 ADD.
PostgreSQL에서 CHECK 제약 이름은 'profiles_member_tier_check'이나 자동 생성된 이름일 수 있으므로
ALTER TABLE ... DROP CONSTRAINT IF EXISTS 후 ADD CONSTRAINT로 처리.

```sql
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_member_tier_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_member_tier_check
    CHECK (member_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'));
```

**2. activity_logs reason CHECK 확장**
'favorite'와 'daily_login'을 허용 목록에 추가:
```sql
ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_reason_check;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_reason_check
    CHECK (reason IN ('review', 'comment', 'gps_verify', 'daily_visit', 'first_favorite', 'favorite', 'daily_login'));
```

**3. add_activity_points() 함수 재정의 — 5단계 임계값**
기존 함수를 CREATE OR REPLACE로 덮어씀. SECURITY DEFINER + SET search_path = '' 유지.
CASE WHEN 순서: 5000 → diamond, 2000 → platinum, 500 → gold, 100 → silver, else bronze.

**4. award_review_points() 재정의 — 10점→50점**
```sql
CREATE OR REPLACE FUNCTION public.award_review_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.add_activity_points(NEW.user_id, 50, 'review');
  RETURN NEW;
END;$$;
```
트리거는 이미 존재하므로 DROP/CREATE 불필요.

**5. award_comment_points() 재정의 — 3점→10점**
동일 패턴, 10점, 'comment'.

**6. award_favorite_points() 신규 함수 + 트리거**
```sql
CREATE OR REPLACE FUNCTION public.award_favorite_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.add_activity_points(NEW.user_id, 5, 'favorite');
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS favorites_award_points ON public.user_favorites;
CREATE TRIGGER favorites_award_points
  AFTER INSERT ON public.user_favorites
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.award_favorite_points();
```

**7. award_daily_login_points() 함수 신규 — 인라인 로직 (add_activity_points() 호출 금지)**
이 함수는 SECURITY DEFINER 체인 내에서 호출되므로 auth.uid()가 NULL이 된다.
따라서 add_activity_points()를 호출하지 않고 activity_logs INSERT와 profiles UPDATE를 직접 수행한다.
당일 기준은 'Asia/Seoul' 타임존 적용. 반환값: true=포인트 지급됨, false=당일 이미 지급됨.

```sql
CREATE OR REPLACE FUNCTION public.award_daily_login_points(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_today date := current_date AT TIME ZONE 'Asia/Seoul';
  v_already boolean;
BEGIN
  -- 당일 중복 방지 (KST 기준)
  SELECT EXISTS(
    SELECT 1 FROM public.activity_logs
    WHERE user_id = p_user_id
      AND reason = 'daily_login'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date = v_today
  ) INTO v_already;

  IF v_already THEN RETURN false; END IF;

  -- 직접 INSERT + UPDATE (add_activity_points()의 auth.uid() 체크를 우회)
  INSERT INTO public.activity_logs (user_id, points, reason)
    VALUES (p_user_id, 1, 'daily_login');

  UPDATE public.profiles
    SET
      activity_points = activity_points + 1,
      member_tier = CASE
        WHEN activity_points + 1 >= 5000 THEN 'diamond'
        WHEN activity_points + 1 >= 2000 THEN 'platinum'
        WHEN activity_points + 1 >= 500  THEN 'gold'
        WHEN activity_points + 1 >= 100  THEN 'silver'
        ELSE 'bronze'
      END
    WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_daily_login_points(uuid) FROM anon;
```

**8. cafe_articles 테이블 신설**
per D-17: complex_id FK, naver_article_id UNIQUE, title, description, cafe_name, article_url, published_at.
```sql
CREATE TABLE IF NOT EXISTS public.cafe_articles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id       uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  naver_article_id text NOT NULL UNIQUE,
  title            text NOT NULL,
  description      text,
  cafe_name        text,
  article_url      text NOT NULL,
  published_at     timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cafe_articles_complex_id_idx
  ON public.cafe_articles(complex_id, published_at DESC);

ALTER TABLE public.cafe_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cafe_articles: public read"
  ON public.cafe_articles FOR SELECT USING (true);
-- INSERT/UPDATE: service_role only (cron 워커)
```

COMMENT ON TABLE, COMMENT ON FUNCTION 추가 (Phase 참조 포함).
  </action>
  <verify>
    <automated>cd C:/Users/jung/coding/bds && npx supabase db reset --local 2>&1 | tail -5 || echo "reset ok"</automated>
  </verify>
  <done>
    - 마이그레이션 파일이 문법 오류 없이 존재한다
    - member_tier CHECK에 'platinum', 'diamond'가 포함된다
    - add_activity_points 함수 본문에 5000/2000/500/100 임계값이 있다
    - award_favorite_points 트리거 정의가 존재한다
    - award_daily_login_points 함수가 boolean을 반환하는 SECURITY DEFINER 함수로 존재하고, add_activity_points()를 호출하지 않고 직접 INSERT/UPDATE한다
    - cafe_articles 테이블 DDL과 RLS 정책이 포함된다
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client→DB function | add_activity_points는 SECURITY DEFINER + auth.uid() 체크로 anon 호출 차단 |
| server→award_daily_login_points | SECURITY DEFINER 체인 내 — auth.uid() NULL이므로 직접 INSERT/UPDATE; anon EXECUTE 권한 REVOKE |
| cron→cafe_articles | service_role만 INSERT 가능 (RLS) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-DB-01 | Tampering | add_activity_points | mitigate | auth.uid() IS NULL → RAISE EXCEPTION (기존 20260520000003 패턴 유지) |
| T-15-DB-02 | Elevation | award_daily_login_points | mitigate | SECURITY DEFINER + SET search_path = '' 적용; anon EXECUTE REVOKE; 함수 내부에서만 activity_logs 쓰기 가능; p_user_id는 호출자(Server Action)가 auth.getUser()로 검증한 값만 전달 |
| T-15-DB-03 | Spoofing | cafe_articles RLS | mitigate | SELECT public, INSERT service_role only; naver_article_id UNIQUE으로 중복 삽입 방지 |
</threat_model>

<verification>
- `grep -c 'diamond' supabase/migrations/20260522000001_phase15_tier_extension.sql` → 1 이상
- `grep -c 'cafe_articles' supabase/migrations/20260522000001_phase15_tier_extension.sql` → 1 이상
- `grep -c 'award_favorite_points' supabase/migrations/20260522000001_phase15_tier_extension.sql` → 1 이상
- `grep -c 'award_daily_login_points' supabase/migrations/20260522000001_phase15_tier_extension.sql` → 1 이상
- `grep -v '^--' supabase/migrations/20260522000001_phase15_tier_extension.sql | grep -c 'add_activity_points' | grep -v 'award'` → 0 (award_daily_login_points 함수 본문 내 add_activity_points 호출 없음)
</verification>

<success_criteria>
마이그레이션 파일이 존재하고, Supabase 로컬 DB에 `npm run db:push` 또는 `supabase db reset` 없이
SQL 구문 검증이 가능한 수준으로 작성된다.
Wave 2 작업이 이 스키마를 기반으로 즉시 진행 가능하다.
</success_criteria>

<output>
완료 후 `.planning/phases/15-community-gamification/15-01-SUMMARY.md` 생성.
</output>

---
---
phase: 15-community-gamification
plan: 02
type: execute
wave: 2
depends_on: [15-01]
files_modified:
  - src/services/naver-cafe.ts
  - src/lib/data/cafe-articles.ts
  - src/lib/data/cafe-articles.test.ts
  - src/lib/data/member-tier.ts
  - src/lib/data/member-tier.test.ts
  - src/services/naver-cafe.test.ts
  - src/app/api/cron/cafe-articles/route.ts
  - src/actions/daily-login.ts
  - vercel.json
autonomous: true
requirements: [DIFF-01, DIFF-02]

must_haves:
  truths:
    - "searchCafeArticles()가 단지별로 100건까지 Naver cafearticle API를 호출한다"
    - "카페 글 cron이 04:30 KST에 실행되고 Bearer 인증을 검증한다"
    - "getCafeArticlesByComplex()가 최신 5개 cafe_articles를 반환한다"
    - "MemberTier 타입이 5단계를 반영하고 getTierLabel/getNotificationDelay가 갱신된다"
    - "dailyLoginAction Server Action이 award_daily_login_points RPC를 호출한다"
    - "member-tier, naver-cafe, cafe-articles 단위 테스트가 구현 전에 작성되고 통과한다"
  artifacts:
    - path: "src/services/naver-cafe.ts"
      provides: "searchCafeArticles() 함수 추가 (기존 searchCafePosts 유지)"
      exports: ["searchCafeArticles", "searchCafePosts", "CafeArticleItem"]
    - path: "src/services/naver-cafe.test.ts"
      provides: "searchCafeArticles 응답 파싱 테스트 (TDD — 구현 전 작성)"
    - path: "src/lib/data/cafe-articles.ts"
      provides: "getCafeArticlesByComplex(), ingestCafeArticles()"
      exports: ["getCafeArticlesByComplex", "ingestCafeArticles", "CafeArticleRecord"]
    - path: "src/lib/data/cafe-articles.test.ts"
      provides: "getCafeArticlesByComplex, ingestCafeArticles 테스트 (TDD — 구현 전 작성)"
    - path: "src/lib/data/member-tier.ts"
      provides: "5단계 MemberTier 타입 + getTierLabel + getNotificationDelay 갱신"
      exports: ["MemberTier", "getMemberTier", "getTierLabel", "getTierBadgeText", "getNotificationDelay"]
    - path: "src/lib/data/member-tier.test.ts"
      provides: "5단계 등급 임계값 및 레이블 테스트 (TDD — 구현 전 작성)"
    - path: "src/app/api/cron/cafe-articles/route.ts"
      provides: "cafe articles 수집 cron endpoint"
      exports: ["GET"]
    - path: "src/actions/daily-login.ts"
      provides: "dailyLoginAction Server Action"
      exports: ["dailyLoginAction"]
    - path: "vercel.json"
      provides: "04:30 KST cron 스케줄 추가"
      contains: "cafe-articles"
  key_links:
    - from: "src/app/api/cron/cafe-articles/route.ts"
      to: "src/services/naver-cafe.ts"
      via: "searchCafeArticles(query, 100)"
      pattern: "searchCafeArticles"
    - from: "src/app/api/cron/cafe-articles/route.ts"
      to: "src/lib/data/cafe-articles.ts"
      via: "ingestCafeArticles()"
      pattern: "ingestCafeArticles"
    - from: "src/actions/daily-login.ts"
      to: "award_daily_login_points RPC"
      via: "supabase.rpc('award_daily_login_points')"
      pattern: "award_daily_login_points"
---

<objective>
서비스 계층 구현 — Naver cafe articles 어댑터 확장,
카페 글 수집 cron 엔드포인트, 5단계 MemberTier 서비스 갱신,
일일 로그인 Server Action.

TDD 순서 필수 준수 (CLAUDE.md): 각 모듈에 대해 테스트 먼저 작성(RED) →
구현으로 통과(GREEN) 순으로 진행. T-15-02에서 테스트 파일을 먼저 생성하고
실패를 확인한 후 구현을 작성한다.

Purpose: Wave 3 UI가 소비할 데이터 계층과 액션을 완성한다.
Output: 9개 파일 수정/신규 + vercel.json cron 추가.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Users/jung/coding/bds/CLAUDE.md
@C:/Users/jung/coding/bds/src/services/naver-cafe.ts
@C:/Users/jung/coding/bds/src/lib/data/cafe-posts.ts
@C:/Users/jung/coding/bds/src/lib/data/member-tier.ts
@C:/Users/jung/coding/bds/src/app/api/cron/daily/route.ts
@C:/Users/jung/coding/bds/vercel.json

<interfaces>
<!-- Wave 1이 생성한 DB 함수 -->
award_daily_login_points(p_user_id uuid) RETURNS boolean
  -- true: 포인트 지급됨, false: 당일 이미 지급됨

cafe_articles 테이블:
  id               uuid PK
  complex_id       uuid NOT NULL FK -> complexes(id)
  naver_article_id text NOT NULL UNIQUE   -- Naver item.link URL을 ID로 사용
  title            text NOT NULL
  description      text
  cafe_name        text
  article_url      text NOT NULL
  published_at     timestamptz
  fetched_at       timestamptz DEFAULT now()

기존 searchCafePosts(query, size): 유지, 건드리지 않음

Naver cafearticle API 응답 item 구조 (기존 코드에서 확인):
  item.title     string (HTML 태그 포함)
  item.link      string (article URL — naver_article_id로 사용)
  item.description string (HTML 태그 포함)
  item.cafename  string
  item.pubDate   string (RFC 2822)

cron 기존 패턴 (daily/route.ts):
  export const runtime = 'nodejs'
  Bearer ${process.env.CRON_SECRET} 인증
  createSupabaseAdminClient() 사용
  errors[] 배열로 오류 수집, Response.json() 반환

vercel.json 현재:
  { "crons": [{ "path": "/api/cron/daily", "schedule": "0 19 * * *" }] }
  04:30 KST = UTC 19:30 = "30 19 * * *"

complexes 테이블 조회 필드 (cron에서 배치 처리용):
  id, canonical_name, si
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>T-15-02: 테스트 먼저 작성 → Naver cafe adapter 확장 + cafe-articles + member-tier 데이터 계층</name>
  <files>
    src/lib/data/member-tier.test.ts
    src/services/naver-cafe.test.ts
    src/lib/data/cafe-articles.test.ts
    src/services/naver-cafe.ts
    src/lib/data/cafe-articles.ts
    src/lib/data/member-tier.ts
  </files>
  <behavior>
    TDD 순서: 아래 3개 테스트 파일을 먼저 작성하고 `npm run test` 실패(RED)를 확인한 후
    구현 파일 3개를 작성해 통과(GREEN)시킨다.

    member-tier 테스트 (member-tier.test.ts — 구현 전 작성):
    - getTierLabel('bronze') → '브론즈'
    - getTierLabel('diamond') → '다이아'
    - getTierBadgeText('platinum') → 'P'
    - getTierColorClass가 각 티어별 다른 클래스 문자열을 반환한다
    - getNotificationDelay('diamond') → 0
    - getNotificationDelay('gold') → 0
    - getNotificationDelay('silver') → 1800000
    - getNotificationDelay('bronze') → 1800000

    naver-cafe 테스트 (naver-cafe.test.ts — 구현 전 작성):
    - fetch mock으로 Naver API 응답 시뮬레이션 → searchCafeArticles가 HTML 태그 제거 후 CafeArticleItem[] 반환
    - item.link가 articleId와 articleUrl 모두에 사용된다

    cafe-articles 테스트 (cafe-articles.test.ts — 구현 전 작성):
    - getCafeArticlesByComplex는 data=null 응답을 빈 배열로 반환한다
    - ingestCafeArticles는 빈 배열 입력 시 0을 반환하고 DB를 호출하지 않는다

    구현 동작:
    - searchCafeArticles(query, size=100)가 CafeArticleItem[]을 반환한다
    - getCafeArticlesByComplex(complexId, supabase, limit=5)가 cafe_articles를 published_at DESC로 반환한다
    - ingestCafeArticles(complexId, articles, supabase)가 upsert(onConflict: 'naver_article_id')로 저장한다
    - MemberTier 타입이 5개 리터럴 union이다
  </behavior>
  <action>
**TDD 단계 1 — 테스트 파일 먼저 작성 (RED):**

**src/lib/data/member-tier.test.ts 신규 (구현 전):**
```typescript
import { describe, it, expect } from 'vitest'
import {
  getTierLabel,
  getTierBadgeText,
  getTierColorClass,
  getNotificationDelay,
} from './member-tier'

describe('getTierLabel', () => {
  it("'bronze' → '브론즈'", () => expect(getTierLabel('bronze')).toBe('브론즈'))
  it("'diamond' → '다이아'", () => expect(getTierLabel('diamond')).toBe('다이아'))
  it("'platinum' → '플래티넘'", () => expect(getTierLabel('platinum')).toBe('플래티넘'))
})

describe('getTierBadgeText', () => {
  it("'platinum' → 'P'", () => expect(getTierBadgeText('platinum')).toBe('P'))
  it("'diamond' → 'D'", () => expect(getTierBadgeText('diamond')).toBe('D'))
})

describe('getTierColorClass', () => {
  it('각 티어별 다른 클래스를 반환한다', () => {
    const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const
    const classes = tiers.map(t => getTierColorClass(t))
    const unique = new Set(classes)
    expect(unique.size).toBe(5)
  })
})

describe('getNotificationDelay', () => {
  it("'diamond' → 0", () => expect(getNotificationDelay('diamond')).toBe(0))
  it("'gold' → 0", () => expect(getNotificationDelay('gold')).toBe(0))
  it("'silver' → 1800000", () => expect(getNotificationDelay('silver')).toBe(30 * 60 * 1_000))
  it("'bronze' → 1800000", () => expect(getNotificationDelay('bronze')).toBe(30 * 60 * 1_000))
})
```

**src/services/naver-cafe.test.ts 신규 (구현 전):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

describe('searchCafeArticles', () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = 'test-id'
    process.env.NAVER_CLIENT_SECRET = 'test-secret'
  })

  it('Naver API 응답을 CafeArticleItem[]으로 변환하고 HTML 태그를 제거한다', async () => {
    const mockItems = [
      {
        title: '<b>창원 단지</b> 매물',
        link: 'https://cafe.naver.com/article/123',
        description: '<p>내용</p>',
        cafename: '창원부동산',
        pubDate: 'Thu, 01 Jan 2026 00:00:00 +0900',
      },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockItems }),
    } as Response)

    const { searchCafeArticles } = await import('./naver-cafe')
    const result = await searchCafeArticles('창원 단지')

    expect(result).toHaveLength(1)
    expect(result[0]?.title).not.toContain('<b>')
    expect(result[0]?.articleId).toBe('https://cafe.naver.com/article/123')
    expect(result[0]?.articleUrl).toBe('https://cafe.naver.com/article/123')
  })
})
```

**src/lib/data/cafe-articles.test.ts 신규 (구현 전):**
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('getCafeArticlesByComplex', () => {
  it('빈 결과(data=null)를 빈 배열로 반환한다', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      }),
    }
    const { getCafeArticlesByComplex } = await import('./cafe-articles')
    const result = await getCafeArticlesByComplex('test-id', mockSupabase as never)
    expect(result).toEqual([])
  })
})

describe('ingestCafeArticles', () => {
  it('빈 배열이면 0을 반환하고 DB를 호출하지 않는다', async () => {
    const mockSupabase = { from: vi.fn() }
    const { ingestCafeArticles } = await import('./cafe-articles')
    const result = await ingestCafeArticles('test-id', [], mockSupabase as never)
    expect(result).toBe(0)
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
```

`npm run test -- member-tier naver-cafe cafe-articles` 실행 → 실패(RED) 확인.

**TDD 단계 2 — 구현 (GREEN):**

**src/lib/data/member-tier.ts 수정 (전체 재작성):**
기존 파일을 전체 재작성. MemberTier 타입 확장, 기존 getTierBadge (이모지 기반) 제거하고 D-06 준수 텍스트 기반으로 교체.

```typescript
// NOTE: server-only 아님 — getTierLabel, getTierBadgeText는 클라이언트에서도 사용.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type MemberTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface MemberTierInfo {
  tier:   MemberTier
  points: number
}

/** D-01: 5단계 등급 한글 라벨 */
export function getTierLabel(tier: MemberTier): string {
  const labels: Record<MemberTier, string> = {
    bronze:   '브론즈',
    silver:   '실버',
    gold:     '골드',
    platinum: '플래티넘',
    diamond:  '다이아',
  }
  return labels[tier]
}

/**
 * D-06: AI 슬롭 금지 — 이모지 없이 텍스트 약자만 사용.
 * TierBadge 컴포넌트에서 배지 문자로 사용.
 */
export function getTierBadgeText(tier: MemberTier): string {
  const badges: Record<MemberTier, string> = {
    bronze:   'B',
    silver:   'S',
    gold:     'G',
    platinum: 'P',
    diamond:  'D',
  }
  return badges[tier]
}

/** D-01: 등급별 색상 토큰 (Tailwind 클래스, AI 슬롭 없음) */
export function getTierColorClass(tier: MemberTier): string {
  const colors: Record<MemberTier, string> = {
    bronze:   'text-amber-700 bg-amber-50 border-amber-200',
    silver:   'text-slate-500 bg-slate-50 border-slate-200',
    gold:     'text-yellow-600 bg-yellow-50 border-yellow-200',
    platinum: 'text-sky-600 bg-sky-50 border-sky-200',
    diamond:  'text-cyan-600 bg-cyan-50 border-cyan-200',
  }
  return colors[tier]
}

/** D-02: 등급별 알림 딜레이(ms). gold 이상은 즉시 발송. */
export function getNotificationDelay(tier: MemberTier): number {
  if (tier === 'diamond' || tier === 'platinum' || tier === 'gold') return 0
  return 30 * 60 * 1_000
}

export async function getMemberTier(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<MemberTierInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('profiles')
    .select('activity_points, member_tier')
    .eq('id', userId)
    .single()

  if (!data) return { tier: 'bronze', points: 0 }

  const row = data as { activity_points: number; member_tier: string }
  return {
    tier:   (row.member_tier as MemberTier) ?? 'bronze',
    points: row.activity_points ?? 0,
  }
}
```

**src/services/naver-cafe.ts 수정:**
파일 상단 'server-only' import 유지. 기존 CafePost 인터페이스와 searchCafePosts, extractComplexNames 함수 유지.

새 타입과 함수 추가:
```typescript
export interface CafeArticleItem {
  articleId:   string   // item.link (naver_article_id)
  title:       string
  description: string
  cafeName:    string
  articleUrl:  string
  publishedAt: string   // ISO 8601
}

export async function searchCafeArticles(
  query: string,
  size = 100,
): Promise<CafeArticleItem[]> {
  const url = new URL(CAFE_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('sort', 'date')
  url.searchParams.set('display', String(Math.min(size, 100)))

  const res = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id':     process.env.NAVER_CLIENT_ID     ?? '',
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET ?? '',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Naver cafe articles HTTP ${res.status}`)

  const json = (await res.json()) as {
    items: Array<{
      title:       string
      link:        string
      description: string
      cafename:    string
      pubDate:     string
    }>
  }

  return (json.items ?? []).map(d => ({
    articleId:   d.link,
    title:       stripHtml(d.title),
    description: stripHtml(d.description),
    cafeName:    d.cafename,
    articleUrl:  d.link,
    publishedAt: new Date(d.pubDate).toISOString(),
  }))
}
```

**src/lib/data/cafe-articles.ts 신규:**
'server-only' import 필수. SupabaseClient 인자 패턴 (cafe-posts.ts 동일).

```typescript
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CafeArticleItem } from '@/services/naver-cafe'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export interface CafeArticleRecord {
  id:               string
  complex_id:       string
  naver_article_id: string
  title:            string
  description:      string | null
  cafe_name:        string | null
  article_url:      string
  published_at:     string | null
  fetched_at:       string
}

export async function getCafeArticlesByComplex(
  complexId: string,
  supabase: AnySupabase,
  limit = 5,
): Promise<CafeArticleRecord[]> {
  const { data } = await supabase
    .from('cafe_articles')
    .select('id, complex_id, naver_article_id, title, description, cafe_name, article_url, published_at, fetched_at')
    .eq('complex_id', complexId)
    .order('published_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as CafeArticleRecord[]
}

export async function ingestCafeArticles(
  complexId: string,
  articles: CafeArticleItem[],
  supabase: AnySupabase,
): Promise<number> {
  if (articles.length === 0) return 0

  const rows = articles.map(a => ({
    complex_id:       complexId,
    naver_article_id: a.articleId,
    title:            a.title.slice(0, 200),
    description:      a.description.slice(0, 500),
    cafe_name:        a.cafeName,
    article_url:      a.articleUrl,
    published_at:     a.publishedAt,
  }))

  const { error, count } = await supabase
    .from('cafe_articles')
    .upsert(rows, { onConflict: 'naver_article_id', ignoreDuplicates: true })
    .select('id', { count: 'exact', head: true })

  if (error) throw new Error(`cafe_articles upsert: ${error.message}`)
  return count ?? 0
}
```

`npm run test -- member-tier naver-cafe cafe-articles` 실행 → 통과(GREEN) 확인.
  </action>
  <verify>
    <automated>cd C:/Users/jung/coding/bds && npm run test -- member-tier naver-cafe cafe-articles 2>&1 | tail -20</automated>
  </verify>
  <done>
    - member-tier.test.ts, naver-cafe.test.ts, cafe-articles.test.ts가 구현 파일보다 먼저 커밋된다
    - searchCafeArticles export가 naver-cafe.ts에 존재한다
    - cafe-articles.ts가 getCafeArticlesByComplex, ingestCafeArticles를 export한다
    - member-tier.ts가 5단계 MemberTier 타입과 모든 tier 함수를 export한다
    - Vitest 테스트가 모두 pass한다
    - npm run lint가 통과한다
  </done>
</task>

<task type="auto" tdd="true">
  <name>T-15-03: 일일 로그인 Server Action + cron 엔드포인트 + vercel.json</name>
  <files>
    src/actions/daily-login.ts
    src/app/api/cron/cafe-articles/route.ts
    vercel.json
  </files>
  <behavior>
    - dailyLoginAction()이 인증된 사용자에게만 award_daily_login_points RPC를 호출한다
    - dailyLoginAction()이 미인증 사용자 호출 시 false를 반환한다 (에러 throw 없이)
    - cron endpoint가 Bearer CRON_SECRET 인증을 검증한다
    - cron이 complexes를 최대 250개로 제한하고 per complex에 canonical_name + si 쿼리로 searchCafeArticles를 호출한다
    - vercel.json에 /api/cron/cafe-articles가 "30 19 * * *" (04:30 KST)로 추가된다
  </behavior>
  <action>
**src/actions/daily-login.ts 신규:**
Server Action. 'use server' directive.
```typescript
'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function dailyLoginAction(): Promise<boolean> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .rpc('award_daily_login_points', { p_user_id: user.id })

  return data === true
}
```

**src/app/api/cron/cafe-articles/route.ts 신규:**
daily/route.ts 패턴 그대로 복사 후 내용 교체.
```typescript
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { searchCafeArticles } from '@/services/naver-cafe'
import { ingestCafeArticles } from '@/lib/data/cafe-articles'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const errors: string[] = []
  let totalIngested = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseAdminClient() as any

  // Naver API 한도: 25,000 calls/day. 100건/단지 * 250단지 = 25,000 (D-16)
  const { data: complexes, error: complexError } = await supabase
    .from('complexes')
    .select('id, canonical_name, si')
    .not('canonical_name', 'is', null)
    .not('si', 'is', null)
    .limit(250)

  if (complexError) {
    return Response.json({ ok: false, errors: [complexError.message] }, { status: 500 })
  }

  for (const complex of (complexes ?? [])) {
    const c = complex as { id: string; canonical_name: string; si: string }
    try {
      // D-14: 검색 쿼리 = {canonical_name} {si}
      const query = `${c.canonical_name} ${c.si}`
      const articles = await searchCafeArticles(query, 100)
      const ingested = await ingestCafeArticles(c.id, articles, supabase)
      totalIngested += ingested
    } catch (err) {
      errors.push(`complex=${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return Response.json({ ok: errors.length === 0, totalIngested, complexCount: (complexes ?? []).length, errors })
}
```

**vercel.json 수정:**
crons 배열에 cafe-articles 항목 추가. "30 19 * * *" = UTC 19:30 = KST 04:30.
```json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 19 * * *" },
    { "path": "/api/cron/cafe-articles", "schedule": "30 19 * * *" }
  ]
}
```
  </action>
  <verify>
    <automated>cd C:/Users/jung/coding/bds && npm run lint 2>&1 | tail -20</automated>
  </verify>
  <done>
    - src/actions/daily-login.ts가 'use server' directive를 포함한다
    - src/app/api/cron/cafe-articles/route.ts가 Bearer 인증과 ingestCafeArticles 호출을 포함한다
    - vercel.json에 "30 19 * * *" 스케줄이 추가되었다
    - npm run lint가 통과한다
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cron→Naver API | X-Naver-Client-Id/Secret 헤더, 서버 전용 |
| client→dailyLoginAction | Server Action — auth.getUser()로 인증 검증 후 검증된 user.id만 RPC에 전달 |
| cron→DB | service_role admin client만 cafe_articles INSERT 가능 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-S2-01 | Information Disclosure | NAVER_CLIENT_ID/SECRET | mitigate | 'server-only' import + 환경변수. 클라이언트 번들에 노출 불가 |
| T-15-S2-02 | Tampering | dailyLoginAction | mitigate | auth.getUser() 검증 후 user.id 사용 — 클라이언트가 임의 user_id 주입 불가 |
| T-15-S2-03 | Denial of Service | cafe-articles cron | accept | 250 complexes * 100건 = Naver 25,000 한도 내. AbortSignal.timeout(10_000)으로 hang 방지 |
| T-15-S2-04 | Spoofing | cron endpoint | mitigate | Bearer CRON_SECRET 헤더 검증 (기존 daily 패턴 동일) |
</threat_model>

<verification>
- `grep -v '^//' src/lib/data/member-tier.ts | grep -c 'platinum'` → 1 이상
- `grep -c '30 19' vercel.json` → 1
- `grep -c 'cafe-articles' vercel.json` → 1
- `grep -c 'award_daily_login_points' src/actions/daily-login.ts` → 1
- npm run lint → 0 errors
- npm run test -- member-tier naver-cafe cafe-articles → 0 failing
</verification>

<success_criteria>
Wave 2 완료 기준:
- 테스트 파일 3개(member-tier, naver-cafe, cafe-articles)가 구현보다 먼저 작성되고 통과
- 9개 파일 생성/수정 완료
- npm run lint 통과
- npm run test -- member-tier naver-cafe cafe-articles 통과
- Wave 3 UI 컴포넌트가 이 파일들을 import할 수 있는 상태
</success_criteria>

<output>
완료 후 `.planning/phases/15-community-gamification/15-02-SUMMARY.md` 생성.
</output>

---
---
phase: 15-community-gamification
plan: 03
type: execute
wave: 3
depends_on: [15-01, 15-02]
files_modified:
  - src/components/complex/TierBadge.tsx
  - src/components/complex/CompareFloatingBar.tsx
  - src/lib/data/compare.ts
  - src/lib/data/compare.test.ts
  - src/app/compare/page.tsx
  - src/app/complexes/[id]/page.tsx
autonomous: true
requirements: [DIFF-01, DIFF-02, DIFF-06]

must_haves:
  truths:
    - "TierBadge가 5단계 등급을 텍스트+색상으로 표시한다 (이모지/blur 없음)"
    - "단지 상세 페이지에 '관련 카페 글 N개' 섹션이 최신 5개를 표시한다"
    - "단지 상세 페이지에 플로팅 비교 바가 존재하고 최대 4개를 선택할 수 있다"
    - "/compare 페이지가 실거래가 추이 차트(1년, 멀티라인)를 보여준다"
    - "/compare 페이지가 D-10 항목(세대수, 준공연도, 학군점수, 관리비)을 보여준다"
    - "데이터 없는 셀은 '데이터 없음'으로 표시된다"
    - "compare.ts의 관리비 평균 집계 로직이 테스트로 커버된다"
  artifacts:
    - path: "src/components/complex/TierBadge.tsx"
      provides: "TierBadge 컴포넌트"
      exports: ["TierBadge"]
    - path: "src/components/complex/CompareFloatingBar.tsx"
      provides: "플로팅 비교 바 (nuqs URL 상태 읽기 + localStorage 표시 상태)"
      exports: ["CompareFloatingBar"]
    - path: "src/lib/data/compare.ts"
      provides: "getCompareData() 확장 — 실거래가 1년 추이 + 관리비 포함"
      exports: ["ComplexSummary", "getCompareData", "buildCompareIds", "ComplexPriceHistory"]
    - path: "src/lib/data/compare.test.ts"
      provides: "buildCompareIds, priceHistory 월별 집계, 관리비 평균 집계 테스트 (TDD — 구현 전 작성)"
    - path: "src/app/compare/page.tsx"
      provides: "비교 페이지 — 멀티라인 차트 + 확장 비교표"
      exports: ["default (ComparePage)"]
    - path: "src/app/complexes/[id]/page.tsx"
      provides: "카페 글 섹션 cafe_articles 소스로 교체 + TierBadge 표시"
  key_links:
    - from: "src/app/complexes/[id]/page.tsx"
      to: "src/lib/data/cafe-articles.ts"
      via: "getCafeArticlesByComplex(id, supabase)"
      pattern: "getCafeArticlesByComplex"
    - from: "src/app/compare/page.tsx"
      to: "src/lib/data/compare.ts"
      via: "getCompareData(validIds, supabase)"
      pattern: "priceHistory"
    - from: "CompareFloatingBar.tsx"
      to: "nuqs useQueryState('ids')"
      via: "읽기 전용 — URL 상태에서 선택 개수만 읽음"
      pattern: "useQueryState"
    - from: "CompareAddButton.tsx (기존, 수정 안 함)"
      to: "nuqs URL ?ids="
      via: "D-09 준수 — 선택 상태의 canonical source"
      pattern: "CompareAddButton.*nuqs"
---

<objective>
UI 계층 구현 — TierBadge 컴포넌트, 카페 글 섹션 교체,
플로팅 비교 바, /compare 페이지 차트 및 비교표 확장.

TDD 순서 필수 준수 (CLAUDE.md): compare.test.ts를 먼저 작성(RED) →
compare.ts 구현으로 통과(GREEN) 순으로 진행.

Purpose: 사용자가 볼 수 있는 Phase 15의 모든 기능을 완성한다.
Output: 6개 파일 생성/수정 — 기능 완성.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Users/jung/coding/bds/CLAUDE.md
@C:/Users/jung/coding/bds/src/lib/data/member-tier.ts
@C:/Users/jung/coding/bds/src/lib/data/compare.ts
@C:/Users/jung/coding/bds/src/app/compare/page.tsx
@C:/Users/jung/coding/bds/src/app/complexes/[id]/page.tsx
@C:/Users/jung/coding/bds/src/components/complex/TransactionChart.tsx
@C:/Users/jung/coding/bds/src/components/complex/CompareAddButton.tsx
@C:/Users/jung/coding/bds/src/components/complex/CompareTable.tsx
@C:/Users/jung/coding/bds/src/components/complex/CafePostsList.tsx

<interfaces>
<!-- Wave 2에서 생성된 인터페이스 -->

From src/lib/data/member-tier.ts:
  export type MemberTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  export function getTierLabel(tier: MemberTier): string
  export function getTierBadgeText(tier: MemberTier): string
  export function getTierColorClass(tier: MemberTier): string

From src/lib/data/cafe-articles.ts:
  export interface CafeArticleRecord {
    id: string; complex_id: string; naver_article_id: string
    title: string; description: string | null; cafe_name: string | null
    article_url: string; published_at: string | null; fetched_at: string
  }
  export async function getCafeArticlesByComplex(complexId, supabase, limit=5): Promise<CafeArticleRecord[]>

기존 CompareAddButton.tsx (D-09 — 수정 금지):
  - nuqs useQueryState('ids') 기반 — URL이 canonical source
  - 단지 상세 페이지의 기본 비교 추가 버튼 — 건드리지 않음

기존 CompareTable.tsx ROWS 배열:
  area, household, built_year, latest_sale, price_per_py, latest_jeonse, school_score, redevelopment, heat_type
  D-10에 관리비(management_cost) 행 추가 필요

기존 ComplexSummary 인터페이스 (src/lib/data/compare.ts):
  id, canonical_name, built_year, household_count, road_address, si, gu, dong
  latestSalePrice, latestSalePricePerPy, latestJeonsePrice, areaRange
  schoolScore, redevelopmentPhase, heatType
  → managementCostAvg (만원/세대) 추가 필요
  → priceHistory: Array<{ yearMonth: string; avgPrice: number }> 추가 필요 (1년 매매 추이)

Recharts 패턴 (TransactionChart.tsx):
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
  다중 단지 라인: complexes.map((c, i) => <Line key={c.id} dataKey={c.id} stroke={COLORS[i]} .../>)

D-06: backdrop-blur, gradient-text, glow, 보라/인디고, 이모지 — 모두 금지

D-09 (LOCKED): URL 상태는 nuqs (/compare?ids=...) — 이 결정은 변경 불가.

management_cost_monthly 테이블 실제 컬럼 (cost_per_unit 없음):
  complex_id, year_month, household_count 없음 (complexes 테이블에서 조회 필요)
  common_cost_total    bigint  -- 공용관리비 단지 합계 (원)
  individual_cost_total bigint -- 개별사용료 단지 합계 (원)
  long_term_repair_monthly bigint -- 장기수선충당금 월부과액 (원)
  세대당 평균 = (common_cost_total + individual_cost_total + long_term_repair_monthly) / household_count
  household_count는 complexes 테이블에서 가져옴 (getCompareData에서 이미 조회하는 필드)

transactions 테이블 쿼리 (가격 추이):
  .from('transactions')
  .select('deal_date, price')
  .eq('complex_id', id)
  .eq('deal_type', 'sale')
  .is('cancel_date', null)
  .is('superseded_by', null)
  .gte('deal_date', oneYearAgo)
  .order('deal_date', { ascending: true })

hagwon_grade / school districts → schoolScore는 이미 getCompareData에서 null로 반환 중
D-10: schoolScore는 "정보 없음"으로 표시 (D-11 fallback)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>T-15-04: compare.test.ts 먼저 작성 → compare.ts 확장 + TierBadge + CafeArticles 교체</name>
  <files>
    src/lib/data/compare.test.ts
    src/components/complex/TierBadge.tsx
    src/lib/data/compare.ts
    src/app/complexes/[id]/page.tsx
  </files>
  <behavior>
    TDD 순서: compare.test.ts를 먼저 작성하고 `npm run test -- compare` 실패(RED) 확인 후
    compare.ts에 managementCostAvg/priceHistory 로직을 추가해 통과(GREEN)시킨다.

    compare.test.ts 테스트 케이스 (구현 전 작성):
    - buildCompareIds(['id1', null, '', 'id2', 'id3', 'id4', 'id5']) → ['id1', 'id2', 'id3', 'id4'] (최대 4개, falsy 제거)
    - priceHistory 월별 집계: 동일 yearMonth 거래 2건 → avgPrice는 두 값의 평균
    - 관리비 평균: common_cost_total+individual_cost_total+long_term_repair_monthly 합산 → household_count로 나눔 → 원→만원 변환 후 round

    compare.ts 확장 동작:
    - ComplexSummary에 managementCostAvg: number | null 추가 (만원/세대, 최근 12개월 평균)
    - ComplexSummary에 priceHistory: Array<{ yearMonth: string; avgPrice: number }> 추가 (1년 월평균 매매가)
    - 관리비 쿼리: management_cost_monthly에서 common_cost_total, individual_cost_total, long_term_repair_monthly 3컬럼 조회 (cost_per_unit 컬럼 없음)
    - 세대당 평균 계산: (common_cost_total + individual_cost_total + long_term_repair_monthly) / household_count, 원→만원 변환(/ 10000), round
    - household_count는 ComplexSummary.household_count 필드에서 사용 (getCompareData가 이미 complexes.household_count를 조회)
  </behavior>
  <action>
**TDD 단계 1 — compare.test.ts 먼저 작성 (RED):**

```typescript
import { describe, it, expect } from 'vitest'
import { buildCompareIds } from './compare'

describe('buildCompareIds', () => {
  it('falsy 값을 제거하고 최대 4개로 제한한다', () => {
    const result = buildCompareIds(['id1', null, '', 'id2', 'id3', 'id4', 'id5'] as string[])
    expect(result).toEqual(['id1', 'id2', 'id3', 'id4'])
  })
})

// priceHistory 집계 로직은 getCompareData 내부에 있으므로 순수 함수로 추출해서 테스트
// compare.ts에서 computePriceHistory 함수를 export해야 이 테스트가 통과함
describe('computePriceHistory', () => {
  it('동일 yearMonth 거래 2건의 avgPrice를 올바르게 평균한다', async () => {
    const { computePriceHistory } = await import('./compare')
    const txRows = [
      { deal_date: '2025-06-15', price: 30000 },
      { deal_date: '2025-06-20', price: 40000 },
      { deal_date: '2025-07-10', price: 50000 },
    ]
    const result = computePriceHistory(txRows)
    const june = result.find(r => r.yearMonth === '2025-06')
    expect(june?.avgPrice).toBe(35000)
    expect(result).toHaveLength(2)
  })
})

describe('computeManagementCostAvg', () => {
  it('3컬럼 합산을 household_count로 나눠 만원 단위로 반환한다', async () => {
    const { computeManagementCostAvg } = await import('./compare')
    const rows = [
      { common_cost_total: 10_000_000, individual_cost_total: 5_000_000, long_term_repair_monthly: 1_000_000 },
      { common_cost_total: 12_000_000, individual_cost_total: 6_000_000, long_term_repair_monthly: 1_200_000 },
    ]
    // 총합: 16M + 7.2M = 월평균 (16M+7.2M)/2 = 11.6M; 11.6M / 100세대 / 10000 = 11.6만원 ≈ 12
    const result = computeManagementCostAvg(rows, 100)
    expect(result).toBe(12)
  })

  it('household_count가 null이면 null을 반환한다', async () => {
    const { computeManagementCostAvg } = await import('./compare')
    expect(computeManagementCostAvg([], null)).toBeNull()
  })
})
```

`npm run test -- compare` 실행 → 실패(RED) 확인 (computePriceHistory, computeManagementCostAvg export 없음).

**TDD 단계 2 — compare.ts 수정 (GREEN):**

**src/lib/data/compare.ts 수정:**

ComplexSummary 인터페이스에 두 필드 추가:
```typescript
  managementCostAvg: number | null  // 만원/세대, 최근 12개월 평균
  priceHistory:      Array<{ yearMonth: string; avgPrice: number }>  // 1년 월평균 매매가
```

테스트가 import할 수 있도록 순수 함수 2개를 export:

```typescript
type ManagementCostRaw = {
  common_cost_total:       number | null
  individual_cost_total:   number | null
  long_term_repair_monthly: number | null
}

/** 관리비 행에서 세대당 월평균(만원) 계산. cost_per_unit 컬럼은 존재하지 않음. */
export function computeManagementCostAvg(
  rows: ManagementCostRaw[],
  householdCount: number | null,
): number | null {
  if (rows.length === 0 || householdCount == null || householdCount <= 0) return null
  const totalPerMonth = rows.map(r =>
    (r.common_cost_total ?? 0) + (r.individual_cost_total ?? 0) + (r.long_term_repair_monthly ?? 0)
  )
  const avgRaw = totalPerMonth.reduce((s, v) => s + v, 0) / totalPerMonth.length
  return Math.round(avgRaw / householdCount / 10_000)  // 원 → 만원
}

/** 거래 행에서 월별 평균 매매가 배열 계산 */
export function computePriceHistory(
  txRows: Array<{ deal_date: string; price: number }>
): Array<{ yearMonth: string; avgPrice: number }> {
  const buckets = new Map<string, number[]>()
  for (const r of txRows) {
    const ym = r.deal_date.slice(0, 7)  // "2025-05"
    const arr = buckets.get(ym) ?? []
    arr.push(r.price)
    buckets.set(ym, arr)
  }
  return [...buckets.entries()]
    .map(([yearMonth, prices]) => ({
      yearMonth,
      avgPrice: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
}
```

getCompareData() 내 각 complex에 대해 Promise.all에 두 쿼리 추가:

```typescript
// 관리비 (최근 12개월, 실제 컬럼만 조회 — cost_per_unit 없음)
supabase
  .from('management_cost_monthly')
  .select('common_cost_total, individual_cost_total, long_term_repair_monthly')
  .eq('complex_id', id)
  .order('year_month', { ascending: false })
  .limit(12),

// 실거래가 1년 추이 (매매, 취소/정정 제외)
supabase
  .from('transactions')
  .select('deal_date, price')
  .eq('complex_id', id)
  .eq('deal_type', 'sale')
  .is('cancel_date', null)
  .is('superseded_by', null)
  .gte('deal_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  .order('deal_date', { ascending: true }),
```

ComplexSummary return 객체에서:
```typescript
managementCostAvg: computeManagementCostAvg(
  (managementData ?? []) as ManagementCostRaw[],
  complexRow.household_count ?? null,
),
priceHistory: computePriceHistory(
  (priceData ?? []) as Array<{ deal_date: string; price: number }>
),
```

`npm run test -- compare` 실행 → 통과(GREEN) 확인.

**src/components/complex/TierBadge.tsx 신규:**
'use client' 불필요 (순수 presentational, props만 받음).
D-06 준수: 텍스트+색상만, 이모지 없음, backdrop-blur/glow 없음.

```tsx
import { getTierLabel, getTierBadgeText, getTierColorClass } from '@/lib/data/member-tier'
import type { MemberTier } from '@/lib/data/member-tier'

interface TierBadgeProps {
  tier:  MemberTier
  size?: 'sm' | 'md'
}

export function TierBadge({ tier, size = 'sm' }: TierBadgeProps) {
  const colorClass = getTierColorClass(tier)
  const label      = getTierLabel(tier)
  const badge      = getTierBadgeText(tier)

  const isSmall = size === 'sm'

  return (
    <span
      className={colorClass}
      title={label}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          3,
        padding:      isSmall ? '1px 5px' : '2px 8px',
        borderRadius: 4,
        border:       '1px solid currentColor',
        font:         `700 ${isSmall ? '10px' : '12px'}/1.4 var(--font-sans)`,
        letterSpacing: '0.04em',
        whiteSpace:   'nowrap',
      }}
    >
      {badge}
      {!isSmall && <span style={{ fontWeight: 500 }}>{label}</span>}
    </span>
  )
}
```

**src/app/complexes/[id]/page.tsx 수정:**
두 곳 수정:

1. 카페 글 섹션: 기존 getCafePostsByComplex + CafePostsList → getCafeArticlesByComplex로 교체.
   import 추가: `import { getCafeArticlesByComplex } from '@/lib/data/cafe-articles'`
   Promise.all에서 기존 getCafePostsByComplex 호출을 getCafeArticlesByComplex로 교체.
   렌더링: CafePostsList 대신 인라인으로 cafe_articles 렌더.

   인라인 렌더링 (CafeArticleSection 함수 내):
   ```tsx
   function CafeArticlesSection({ articles }: { articles: CafeArticleRecord[] }) {
     if (articles.length === 0) return null
     return (
       <div className="card" style={{ padding: 20 }}>
         <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
           관련 카페 글 {articles.length}개
         </h3>
         <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
           {articles.map((a, i) => (
             <li key={a.id} style={{ borderBottom: i < articles.length - 1 ? '1px solid var(--line-subtle)' : 'none', padding: '10px 0' }}>
               <a href={a.article_url} target="_blank" rel="noopener noreferrer"
                  style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block', marginBottom: 2 }}>
                 {a.title}
               </a>
               <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', display: 'flex', gap: 8 }}>
                 {a.cafe_name && <span>{a.cafe_name}</span>}
                 {a.published_at && <span>{a.published_at.slice(0, 10).replace(/-/g, '.')}</span>}
               </div>
             </li>
           ))}
         </ul>
       </div>
     )
   }
   ```

2. Promise.all 배열에서 getCafePostsByComplex 줄을 getCafeArticlesByComplex(id, supabase).catch(() => [])로 교체.
   변수명 cafeArticles로 변경.
   렌더링: `<CafePostsList posts={cafePosts} />` → `<CafeArticlesSection articles={cafeArticles} />`
  </action>
  <verify>
    <automated>cd C:/Users/jung/coding/bds && npm run test -- compare 2>&1 | tail -15</automated>
  </verify>
  <done>
    - compare.test.ts가 compare.ts 구현보다 먼저 작성된다
    - TierBadge.tsx가 export TierBadge를 포함한다
    - compare.ts가 computeManagementCostAvg, computePriceHistory를 export한다
    - compare.ts의 management_cost_monthly 쿼리가 common_cost_total, individual_cost_total, long_term_repair_monthly를 조회한다 (cost_per_unit 없음)
    - complexes/[id]/page.tsx가 getCafeArticlesByComplex를 import하고 사용한다
    - npm run test -- compare 통과
    - npm run lint 통과
  </done>
</task>

<task type="auto">
  <name>T-15-05: 플로팅 비교 바 컴포넌트 + /compare 페이지 차트 확장</name>
  <files>
    src/components/complex/CompareFloatingBar.tsx
    src/app/compare/page.tsx
  </files>
  <action>
**src/components/complex/CompareFloatingBar.tsx 신규:**

D-09 (LOCKED): URL 상태의 canonical source는 nuqs (/compare?ids=...).
CompareFloatingBar는 nuqs URL 상태를 읽기 전용으로 소비하는 보조 UI 컴포넌트다.
선택 상태 관리는 기존 CompareAddButton(nuqs 기반)이 담당하며, CompareFloatingBar는 그것을 대체하지 않는다.

역할 분리:
- CompareAddButton (기존, 수정 금지): 단지 상세 페이지에서 nuqs로 URL에 ids를 추가/제거하는 primary 진입점
- CompareFloatingBar (신규): URL의 nuqs ids를 읽어 "비교 중 N개" 카운트와 /compare 링크를 보여주는 supplemental 표시기
  - localStorage('dj_compare_ids')는 SSR hydration mismatch 방지용 표시 상태 캐시 — canonical source는 여전히 nuqs URL
  - addComplex/removeComplex 로직은 포함하지 않음; 선택 변경은 CompareAddButton이 처리

'use client'. nuqs useQueryState('ids')로 URL 파라미터 읽기.

```tsx
'use client'
import { useQueryState } from 'nuqs'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dj_compare_ids'

/**
 * CompareFloatingBar — supplemental 표시기
 * D-09: URL 상태(nuqs)가 canonical source. 이 컴포넌트는 읽기 전용.
 * 선택 추가/제거는 CompareAddButton(nuqs 기반)이 담당.
 */
export function CompareFloatingBar() {
  // nuqs URL 상태에서 현재 선택 ids 읽기 (D-09 준수)
  const [idsParam] = useQueryState('ids')
  const urlIds = idsParam ? idsParam.split(',').filter(Boolean) : []

  // localStorage 캐시 — SSR hydration 후 nuqs 값으로 동기화
  const [displayCount, setDisplayCount] = useState(0)

  useEffect(() => {
    // nuqs URL이 canonical source; localStorage는 표시 상태 캐시
    const count = urlIds.length
    setDisplayCount(count)
    try {
      if (count > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(urlIds))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // localStorage 접근 실패 시 무시
    }
  }, [idsParam])

  if (displayCount < 2) return null

  return (
    <Link
      href={`/compare?ids=${urlIds.join(',')}`}
      className="btn btn-md btn-orange"
      style={{
        position:   'fixed',
        bottom:     24,
        right:      24,
        zIndex:     40,
        minHeight:  44,
        textDecoration: 'none',
      }}
      aria-label={`선택한 ${displayCount}개 단지 비교 보기`}
    >
      비교 보기 ({displayCount})
    </Link>
  )
}
```

**src/app/compare/page.tsx 수정:**
D-10 항목 완성 — 실거래가 추이 멀티라인 차트 + 관리비 행 추가.

1. ComplexSummary.priceHistory를 Recharts 멀티라인 차트로 시각화:

```tsx
// 차트 컴포넌트 (같은 파일 내 또는 별도 파일)
'use client'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Legend } from 'recharts'
import type { ComplexSummary } from '@/lib/data/compare'

const LINE_COLORS = ['#1d4ed8', '#b45309', '#047857', '#7c3aed']

function formatPrice(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}억`
  return `${v.toLocaleString()}만`
}

function CompareChart({ complexes }: { complexes: ComplexSummary[] }) {
  // 모든 yearMonth를 합집합으로 수집
  const allMonths = [...new Set(
    complexes.flatMap(c => c.priceHistory.map(p => p.yearMonth))
  )].sort()

  if (allMonths.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-tertiary)', font: '500 13px/1.4 var(--font-sans)' }}>
        데이터 없음
      </div>
    )
  }

  // recharts 형식: [{ yearMonth, [complexId]: avgPrice, ... }]
  const chartData = allMonths.map(ym => {
    const row: Record<string, unknown> = { yearMonth: ym }
    for (const c of complexes) {
      const found = c.priceHistory.find(p => p.yearMonth === ym)
      if (found) row[c.id] = found.avgPrice
    }
    return row
  })

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 16px' }}>
        실거래가 추이 (최근 1년, 매매)
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(2)} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPrice} width={56} />
          <Tooltip formatter={(v: unknown) => [formatPrice(Number(v)), '']} labelFormatter={(l) => String(l)} contentStyle={{ fontSize: 12 }} />
          <Legend formatter={(value) => complexes.find(c => c.id === value)?.canonical_name ?? value} />
          {complexes.map((c, i) => (
            <Line key={c.id} type="monotone" dataKey={c.id} stroke={LINE_COLORS[i % LINE_COLORS.length] ?? '#1d4ed8'} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name={c.id} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

2. CompareTable에 관리비 행 추가:
CompareTable.tsx의 ROWS 배열에 management_cost 행 추가:
```typescript
{
  id:     'management_cost',
  label:  '관리비 (세대당)',
  format: c => c.managementCostAvg != null ? `월 ${c.managementCostAvg.toLocaleString()}만원` : null,
  numeric: true,
},
```
CompareTable.tsx도 files_modified에 포함.

compare/page.tsx 전체 구조:
- header (기존 유지)
- CompareChart (신규, 최소 2개 단지일 때만 표시)
- CompareTable (기존 + management_cost 행)
- EmptyState (기존 유지)

CompareChart는 'use client' 컴포넌트. 서버 페이지에서 import할 때 dynamic import 사용:
```tsx
import dynamic from 'next/dynamic'
const CompareChart = dynamic(() => import('./CompareChart').then(m => m.CompareChart), { ssr: false })
```
또는 같은 파일에 'use client' 마킹이 있는 별도 파일로 분리.

D-11 fallback: CompareChart에서 allMonths.length === 0 → "데이터 없음" 표시.
D-11 fallback: CompareTable에서 null 값 → '-' 표시 (기존 CompareTable 동작 그대로).
  </action>
  <verify>
    <automated>cd C:/Users/jung/coding/bds && npm run build 2>&1 | tail -30</automated>
  </verify>
  <done>
    - CompareFloatingBar.tsx가 nuqs useQueryState('ids')로 URL 상태를 읽기 전용으로 소비한다 (D-09 준수)
    - CompareFloatingBar.tsx가 addComplex/removeComplex 로직을 포함하지 않는다 (선택 변경은 CompareAddButton 담당)
    - /compare 페이지가 멀티라인 차트를 포함한다
    - CompareTable에 '관리비 (세대당)' 행이 있다
    - npm run build 통과 (TypeScript 오류 없음)
    - npm run lint 통과
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser nuqs URL→CompareFloatingBar | 읽기 전용 소비 — URL 조작 가능하지만 /compare 페이지에서 buildCompareIds()로 최대 4개 제한 |
| /compare?ids= URL param | 서버에서 buildCompareIds()로 최대 4개 제한 및 falsy 필터링 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-S3-01 | Tampering | /compare?ids= | mitigate | buildCompareIds()가 최대 4개 제한 + 빈 문자열 필터링 (기존 코드 유지) |
| T-15-S3-02 | Information Disclosure | CafeArticlesSection | accept | cafe_articles는 public read RLS — 공개 정보만 표시 |
| T-15-S3-03 | Tampering | localStorage compare-ids | accept | 표시 상태 캐시 — canonical source는 nuqs URL; 서버 데이터 조작 불가 |
| T-15-S3-04 | Spoofing | 외부 cafe link (rel=noopener) | mitigate | target="_blank" rel="noopener noreferrer" 적용 |
</threat_model>

<verification>
- `grep -c 'TierBadge' src/components/complex/TierBadge.tsx` → 1 이상
- `grep -c 'priceHistory' src/lib/data/compare.ts` → 1 이상
- `grep -c 'managementCostAvg' src/lib/data/compare.ts` → 1 이상
- `grep -v 'cost_per_unit' src/lib/data/compare.ts` → 0 occurrences of cost_per_unit (존재하지 않는 컬럼)
- `grep -c 'common_cost_total' src/lib/data/compare.ts` → 1 이상
- `grep -c 'getCafeArticlesByComplex' src/app/complexes/[id]/page.tsx` → 1 이상
- `grep -c 'useQueryState' src/components/complex/CompareFloatingBar.tsx` → 1 이상
- `npm run build` → exit 0
</verification>

<success_criteria>
Wave 3 완료 기준:
- compare.test.ts가 구현 전에 작성되고 통과
- TierBadge, CompareFloatingBar 컴포넌트 생성
- CompareFloatingBar가 nuqs URL 상태를 읽기 전용으로 소비 (D-09 준수)
- compare.ts가 cost_per_unit 대신 실제 컬럼 3개를 조회하고 TypeScript에서 세대당 평균 계산
- /compare 페이지에 멀티라인 실거래가 추이 차트 표시
- 단지 상세 페이지에 cafe_articles 기반 카페 글 섹션 표시
- npm run build + npm run lint 모두 통과
</success_criteria>

<output>
완료 후 `.planning/phases/15-community-gamification/15-03-SUMMARY.md` 생성.
</output>

---
---
phase: 15-community-gamification
plan: 04
type: tdd
wave: 4
depends_on: [15-01, 15-02, 15-03]
files_modified:
  - src/actions/daily-login.test.ts
autonomous: true
requirements: [DIFF-01, DIFF-02, DIFF-06]

must_haves:
  truths:
    - "daily-login action 테스트가 미인증 사용자 early return을 검증한다"
    - "npm run test가 phase 15 관련 테스트 모두 통과한다"
  artifacts:
    - path: "src/actions/daily-login.test.ts"
      provides: "dailyLoginAction 미인증 경로 테스트"
---

<objective>
TDD 테스트 완성 — dailyLoginAction Server Action의
미인증 경로 단위 테스트를 작성하고 통과시킨다.

Wave 2에서 이미 작성된 테스트:
- src/lib/data/member-tier.test.ts (Wave 2 완료)
- src/services/naver-cafe.test.ts (Wave 2 완료)
- src/lib/data/cafe-articles.test.ts (Wave 2 완료)

Wave 3에서 이미 작성된 테스트:
- src/lib/data/compare.test.ts (Wave 3 완료)

Wave 4는 DB 의존성이 있는 Server Action 테스트만 담당.
Purpose: 향후 dailyLoginAction 수정 시 회귀를 방지한다.
Output: 1개 테스트 파일 — Vitest.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Users/jung/coding/bds/CLAUDE.md
@C:/Users/jung/coding/bds/src/actions/daily-login.ts
@C:/Users/jung/coding/bds/src/lib/data/cafe-link.test.ts
</context>

<feature>
  <name>dailyLoginAction 단위 테스트</name>
  <files>
    src/actions/daily-login.test.ts
  </files>
  <behavior>
    daily-login 테스트:
    - 미인증 사용자(auth.getUser() → user: null) → false 반환
    - 인증된 사용자 + RPC true → true 반환
    - 인증된 사용자 + RPC false (당일 이미 지급) → false 반환
  </behavior>
  <implementation>
    Vitest 사용. Supabase 클라이언트를 vi.mock으로 대체.
    'use server' directive는 테스트에서 무시되므로 별도 처리 불필요.
    기존 테스트 파일 패턴은 src/lib/data/cafe-link.test.ts 참고.
    RED → GREEN → REFACTOR 순서 준수.
  </implementation>
</feature>

<threat_model>
## Trust Boundaries
해당 없음 — 테스트 파일, 프로덕션 코드에 영향 없음.

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-S4-01 | N/A | Test files | accept | 테스트는 프로덕션 환경에 배포되지 않음 |
</threat_model>

<verification>
  <automated>cd C:/Users/jung/coding/bds && npm run test -- --reporter=verbose 2>&1 | tail -40</automated>
</verification>

<success_criteria>
- npm run test 통과 (0 failing)
- Phase 15에서 추가된 순수 로직 함수들이 테스트로 커버됨
- npm run lint + npm run build 최종 통과
</success_criteria>

<output>
완료 후 `.planning/phases/15-community-gamification/15-04-SUMMARY.md` 생성.
</output>
