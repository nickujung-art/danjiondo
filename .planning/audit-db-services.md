# DB·서비스 레이어 감사 보고서

날짜: 2026-06-18  
감사 범위: `supabase/migrations/` · `src/lib/data/` · `src/services/`

---

## 요약

**총 24건: CRITICAL 2 · HIGH 8 · MEDIUM 9 · LOW 5**

| 심각도 | 건수 | 설명 |
|---|---|---|
| CRITICAL | 2 | RLS 미설정 테이블 / search_path 미고정 SECURITY DEFINER 함수 |
| HIGH | 8 | server-only 누락 서비스 파일 / AbortSignal.timeout 누락 / Zod .parse() 직접 사용 / .single() 오용 |
| MEDIUM | 9 | .select('*') 과다 사용 / 에러 묵힘 / 타입 정밀도 문제 / N+1 유사 패턴 |
| LOW | 5 | 429 자동 재시도 미구현 / FLOAT 파라미터 주석 / FK ON DELETE 기본값 등 |

---

## 1. 마이그레이션 감사

### 1.1 RLS 누락

**CRITICAL**

`supabase/migrations/20260602000001_regional_income.sql`
- `regional_income` 테이블에 `ENABLE ROW LEVEL SECURITY` 없음
- 경남 5개년 가구소득 시드 데이터 포함, anon 포함 누구나 INSERT/UPDATE/DELETE 가능
- 수정 방법:
  ```sql
  ALTER TABLE public.regional_income ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "regional_income: public read"
    ON public.regional_income FOR SELECT USING (true);
  -- INSERT/UPDATE/DELETE는 service_role만 (RLS bypass로 별도 정책 불필요)
  ```

RLS가 정상 설정된 테이블 (이상 없음): `comments`, `new_listings`, `presale_transactions`, `notification_topics`, `cafe_join_codes`, `activity_logs`, `cafe_posts`, `school_districts`, `school_district_schools`, `cafe_articles`, `realtors`, `realtor_assignments`, `complex_gap_stats`, `complex_price_predictions`, `presale_discoveries`, `regional_unsold`, `regional_population`, `presale_enriched`, `region_population_cache`, `hagwon_db`, `user_child_profiles`

### 1.2 인덱스 누락

**MEDIUM**

`supabase/migrations/20260430000003_transactions.sql`
- partial index `transactions_valid_complex_date_idx WHERE cancel_date IS NULL AND superseded_by IS NULL` 존재 ✓
- 복합 필터 `(complex_id, deal_type, cancel_date, superseded_by)` partial index 없음 — 단지 상세 쿼리가 deal_type별 조회를 자주 수행하므로 성능 영향 가능

`supabase/migrations/20260602000001_regional_income.sql`
- `regional_income` 테이블에 인덱스 없음 — 현재 행 수 소량(5개 시군구 × 5년)이므로 LOW지만, 향후 데이터 증가 시 `(sgg_code, year)` 인덱스 권장

`supabase/migrations/20260528000003_complex_gap_stats.sql`
- `complex_gap_stats.computed_at` 컬럼 인덱스 없음 — cron 실행 이력 조회 시 필요할 수 있음 (LOW)

### 1.3 FK ON DELETE 설정

**LOW**

`supabase/migrations/20260530000002_presale_discoveries.sql`
- `presale_discoveries.confirmed_by` → `auth.users(id)` 참조에 `ON DELETE` 절 없음 (기본값 `NO ACTION` = `RESTRICT`)
- 운영자 계정 삭제 시 해당 `presale_discoveries` 행 삭제 불가 — `ON DELETE SET NULL` 권장

`supabase/migrations/20260430000003_transactions.sql`
- `transactions.complex_id` → `ON DELETE SET NULL` ✓ (의도적, 적절)

`supabase/migrations/20260619000001_phase28_hagwon_system.sql`
- `user_child_profiles.user_id` → `auth.users(id) ON DELETE CASCADE` ✓

### 1.4 컬럼 타입 문제

**MEDIUM**

`supabase/migrations/20260608000002_school_advancement_breakdown.sql`
- `advancement_science real`, `advancement_foreign real`, `advancement_private real` — `real` (FLOAT4, 23비트 가수부)은 백분율 계산 시 부동소수점 오차 발생 가능
- 예: `0.1 + 0.2 ≠ 0.3` 류의 누적 오차
- 수정 방법: `numeric(5,2)` (최대 999.99%, 소수 둘째자리)로 교체 권장

`supabase/migrations/20260619000001_phase28_hagwon_system.sql`
- `recommend_hagwons` RPC 파라미터 `p_lat FLOAT, p_lng FLOAT`는 FLOAT8 (64비트) — 좌표·거리·점수 계산에 충분. 이슈 없음 (LOW, 확인 차원 기록)

`supabase/migrations/20260430000003_transactions.sql`
- `transactions.price bigint` — 만원 단위 정수. 금액 정밀도 이슈 없음 ✓

### 1.5 뷰 정합성

해당 없음 — 이 코드베이스는 뷰(VIEW) 대신 RPC 함수 패턴을 사용. 정합성 이슈 없음.

### 1.6 RPC 보안 (SECURITY DEFINER + SET search_path)

**CRITICAL / HIGH**

PostgreSQL schema injection: `SECURITY DEFINER` 함수에 `SET search_path = ''` 없으면, 공격자가 `search_path`를 변조해 다른 스키마의 동명 함수를 실행시킬 수 있음.

#### CRITICAL — search_path 미고정 (현재 패치 미적용 상태)

| 파일 | 함수 | 위험 |
|---|---|---|
| `20260507000004_phase4_tables.sql` L132 | `check_gps_proximity` | GPS 검증 우회 가능 |
| `20260519000001_recent_complex_sales_rpc.sql` L11 | `get_recent_complex_sales` | 거래 데이터 조회 노출 |
| `20260519000003_get_hagwon_grade_rpc.sql` L3 | `get_hagwon_grade` | 학원 등급 계산 조작 가능 |
| `20260526000002_ai_chat_school_chunk.sql` L12 | `get_schools_for_point` | 학군 조회 조작 가능 |

수정 방법 예시:
```sql
CREATE OR REPLACE FUNCTION public.check_gps_proximity(...)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''   -- ← 추가
AS $$ ... $$;
```

#### 패치 완료 (참고)

Phase 8 → Phase 15 마이그레이션에서 아래 함수들은 `SET search_path = ''` 적용 완료:
- `add_activity_points` (20260520000003 → 20260522000001에서 재정의)
- `award_review_points`, `award_comment_points`, `award_favorite_points`, `award_daily_login_points` (20260522000001)

`search_complexes`, `match_complex_by_admin`, `match_complex_by_coord`: `SECURITY INVOKER` 사용 — search_path 문제 해당 없음 ✓

---

## 2. lib/data 감사

### 2.1 N+1 / 비효율 쿼리

**MEDIUM**

`src/lib/data/invest.ts` — `getComplexAreaTypes` 함수
- 평형 버킷(30평대 이하~80평 이상) 5개를 각각 별도 쿼리로 실행: `Promise.all([query1, query2, ..., query5])`
- 단일 GROUP BY 쿼리 + 클라이언트 분류로 교체 가능
- 현재 동작은 parallel이므로 N+1(순차 직렬)은 아니지만, 불필요한 왕복 5회 발생

`src/lib/data/map-panel.ts` — `getMapPanelData` 함수
- `if (hagwon_score !== null)` 조건부로 `supabase.rpc('get_hagwon_grade', ...)` 추가 호출 발생
- 단지 상세 fetch 이후 조건부 2차 RPC — 캐싱 전략 없음. 자주 호출되는 경로라면 `get_hagwon_grade`를 `complexes.hagwon_grade_cached` 컬럼으로 물질화 권장

### 2.2 .single() vs .maybeSingle() 오용

**HIGH**

`.single()`은 결과가 0건일 때 `PostgrestError`를 던지고, 2건 이상일 때도 에러. SELECT 쿼리에서 결과가 없을 수 있는 경우 `.maybeSingle()` 사용 필요.

| 파일 | 위치 | 상황 | 위험도 |
|---|---|---|---|
| `src/lib/data/member-tier.ts` | L68 | userId로 profiles 조회 (탈퇴 계정 조회 시 에러) | HIGH |

**적절한 .single() 사용 (이슈 없음):**
- `src/lib/data/complex-matching.ts` L79, L90: UPDATE/INSERT 후 `.select('id').single()` — 에러 핸들링 있음 (`if (error) throw`) ✓
- `src/lib/data/realprice.ts` L98, L294: `ingest_runs.insert().select('id').single()` — INSERT는 항상 반환 ✓

### 2.3 .select('*') 과다 사용

**MEDIUM**

컬럼 명시 없이 `*`를 사용하면 불필요한 컬럼 전송, 타입 추론 불가, 스키마 변경 시 암묵적 버그 유입.

| 파일 | 위치 | 테이블 |
|---|---|---|
| `src/lib/data/ads.ts` | `getActiveAds`, `getAllAdCampaigns`, `getAdCampaignById` | `ad_campaigns` |
| `src/lib/data/realtors.ts` | L27, L38 | `realtors`, `realtor_assignments` |
| `src/lib/data/reviews.ts` | L18 | `complex_reviews` |
| `src/lib/data/comments.ts` | L90 | `comments` |
| `src/lib/data/presale.ts` | L216 | `presale_enriched` |
| `src/lib/data/hagwon-recommend.ts` | L43 | `user_child_profiles` |

**양호 (명시적 컬럼 사용):** `complex-detail.ts`, `rankings.ts`, `gap-label.ts`, `homepage.ts`, `facility-edu.ts` ✓

### 2.4 누락된 cancel/correction 필터

**이슈 없음** — 전수 검토 결과 거래(transactions) 조회 쿼리 전체에서 아래 패턴 정상 적용됨:
- `.is('cancel_date', null).is('superseded_by', null)` (Supabase JS 방식) ✓
- SQL 함수 내 `AND t.cancel_date IS NULL AND t.superseded_by IS NULL` ✓
- 해당 파일: `rankings.ts`, `rankings-page.ts`, `homepage.ts`, `gap-label.ts`, `map-panel.ts`, `invest.ts`, `realprice.ts` 외 다수

### 2.5 광고 쿼리 조건 누락

**이슈 없음** — `src/lib/data/ads.ts`의 `getActiveAds`:
```typescript
.eq('status', 'approved')
.lte('starts_at', now)
.gte('ends_at', now)
```
CLAUDE.md 요구 조건 `now() BETWEEN starts_at AND ends_at AND status='approved'` 충족 ✓

### 2.6 에러 처리 패턴

**MEDIUM**

`src/lib/data/ads.ts`
- `getActiveAds`, `getAllAdCampaigns`: `const { data } = await query` — error 구조분해 없음. DB 오류 발생 시 조용히 빈 배열/null 반환
- `getAdCampaignById`: 마찬가지로 에러 묵힘
- 광고 미노출 원인 디버깅 불가

`src/lib/data/invest.ts`
- 여러 함수에서 `if (error || !data) return []` 패턴 — 에러 로깅 없이 빈 배열 반환
- 투자 분석 데이터 누락 원인 추적 불가

`src/lib/data/gap-analysis.ts`
- `if (error || !data) return []` — 같은 패턴

권장 패턴:
```typescript
const { data, error } = await query
if (error) { console.error('[getActiveAds]', error); return [] }
```

### 2.7 React cache() 사용 현황

**이슈 없음**

`src/lib/data/complex-detail.ts`
- `export const getComplexByIdCached = cache(async (id: string) => ...)` ✓ — generateMetadata + page 함수 중복 호출 방지

`src/lib/data/seo-hierarchy.ts`
- `export const getComplexBySlugCached = cache(async (urlSlug: string) => ...)` ✓

다른 data 함수들은 캐싱 없음 — ISR/RSC 흐름에서 중복 호출이 없는 함수들이므로 현재 불필요. `getComplexFacilityEdu` 등 heavy 함수는 향후 캐싱 고려 가능 (LOW).

### 2.8 revalidatePath 호출 현황

`src/lib/data/` 내 `revalidatePath` 호출 없음 — 적절. `revalidatePath`는 Server Action 파일에서 mutation 이후 호출해야 하며, 데이터 조회 레이어에 있으면 안 됨 ✓

---

## 3. services/ 감사

### 3.1 server-only 누락

**HIGH**

`import 'server-only'`가 없으면 클라이언트 번들에 포함될 수 있어 API 키가 브라우저에 노출될 위험.

#### 명시적 의도로 server-only 제외 (스크립트에서도 import 가능하도록):

| 파일 | 비고 |
|---|---|
| `src/services/molit.ts` | 주석: `// scripts/에서도 import 가능하도록 설계` |
| `src/services/naver-land.ts` | 주석: `// NOTE: 'server-only' 미포함 — scripts/ 배치에서도 import 가능` |
| `src/services/presale-crawler.ts` | 주석: `// server-only는 생략 — 스크립트에서도 직접 임포트 가능하도록` |

위 3개 파일은 의도적 결정이므로 **경고 수준(LOW)**: scripts/ 에서만 사용되는 경우 문제없으나, 향후 `src/app/` 컴포넌트에서 직접 import될 경우 키 노출 위험. 최소한 주석에 "서버 컴포넌트·Route에서 직접 import 금지" 규칙을 명시 권장.

#### server-only 미포함 + 별도 주석 없음 (HIGH):

| 파일 | 사용 API 키 | 위험 |
|---|---|---|
| `src/services/sgis.ts` | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | 인구통계 서비스 키 노출 |
| `src/services/kapt.ts` | `KAPT_API_KEY` | K-apt 관리비 API 키 노출 |
| `src/services/bld-rgst.ts` | `MOLIT_API_KEY` | 국토부 API 키 노출 |

수정 방법: 각 파일 최상단에 `import 'server-only'` 추가. scripts/에서 사용하는 경우 해당 함수를 별도 파일로 분리.

#### server-only 정상 설정:

`src/services/ecos.ts`, `src/services/reb.ts`, `src/services/kosis.ts`, `src/services/naver-cafe.ts`, `src/services/kakao-channel.ts` ✓

### 3.2 fetch timeout 누락

**HIGH**

`AbortSignal.timeout()`이 없으면 외부 API 응답 무한 대기로 서버리스 함수 타임아웃 초과 → 504 에러 발생 가능.

| 파일 | 함수 | 현황 |
|---|---|---|
| `src/services/ecos.ts` | `fetchMortgageRateSeries` | `fetch(url, { next: { revalidate: 86400 } })` — timeout 없음 |
| `src/services/reb.ts` | `fetchOneIdx` | `fetch(url, { next: { revalidate: 86400 } })` — timeout 없음 |
| `src/services/kosis.ts` | `fetchPopulationBySgg` | 내부 fetch — timeout 없음 |

수정 방법:
```typescript
// 예시 (ecos.ts)
const res = await fetch(url, {
  next: { revalidate: 86400 },
  signal: AbortSignal.timeout(15_000),  // ← 추가
})
```

**정상 설정된 파일:** `src/services/sgis.ts`, `src/services/kapt.ts`, `src/services/molit.ts`, `src/services/naver-land.ts`, `src/services/presale-crawler.ts`, `src/services/bld-rgst.ts` (AbortSignal.timeout 10~15초 설정) ✓

### 3.3 재시도 로직 (429/503)

**LOW**

`src/services/sgis.ts` — `withRetry` 없음 (plain fetch). 429/503 발생 시 즉시 에러 반환.

`src/services/naver-land.ts`
- `NaverRateLimitError` 클래스 정의 및 429 감지 로직 있음 ✓
- 단, 자동 재시도는 없음 — 호출자 쪽에서 `withRetry` 래핑 필요

**정상 설정된 파일:** `src/services/molit.ts`, `src/services/bld-rgst.ts` (`withRetry` 사용) ✓

### 3.4 응답 파싱 안전성 (Zod)

**HIGH**

`.parse()`는 파싱 실패 시 예외를 던짐. 외부 API 응답은 언제든 스펙 변경 가능하므로 `.safeParse()` 권장.

`src/services/sgis.ts`
- `TokenResponseSchema.parse(json)` — 토큰 갱신 실패 시 미처리 예외 발생
- `PopulationItemSchema.parse(item)` — 인구 데이터 항목별 파싱 예외 가능
- `HouseholdItemSchema.parse(item)` — 가구 데이터 항목별 파싱 예외 가능

수정 방법:
```typescript
const parsed = TokenResponseSchema.safeParse(json)
if (!parsed.success) {
  console.error('[SGIS] token parse error', parsed.error)
  return null
}
```

**정상 설정된 파일:** `src/services/molit.ts`, `src/services/kapt.ts`, `src/services/naver-land.ts` (`.safeParse()` 사용) ✓

### 3.5 API 키 노출 점검

**CRITICAL → 1.1과 합산 (별도 항목)**

위 3.1에서 서술. `sgis.ts`, `kapt.ts`, `bld-rgst.ts`의 `server-only` 미설정 시 Next.js 클라이언트 번들러가 환경변수를 포함한 모듈을 클라이언트 번들에 포함시킬 수 있음. 단, 현재 이 파일들이 클라이언트 컴포넌트에서 직접 import되는 경로가 없다면 실제 노출은 되지 않음 — 그러나 향후 실수 방지를 위해 추가 필수.

---

## 4. 우선순위별 수정 목록

### 즉시 수정 (CRITICAL)

1. **`regional_income` RLS 활성화**
   - 파일: 신규 마이그레이션 생성
   - 내용: `ALTER TABLE public.regional_income ENABLE ROW LEVEL SECURITY` + SELECT 공개 정책
   - 이유: anon 포함 누구나 경제 데이터 조작 가능

2. **search_path 미고정 SECURITY DEFINER 함수 4개 패치**
   - 파일: 신규 마이그레이션 생성
   - 대상: `check_gps_proximity`, `get_recent_complex_sales`, `get_hagwon_grade`, `get_schools_for_point`
   - 이유: schema injection → 데이터 조작 및 권한 우회 가능

### 단기 수정 (HIGH, 이번 스프린트)

3. **`sgis.ts`, `kapt.ts`, `bld-rgst.ts` — `import 'server-only'` 추가**
   - 파일: `src/services/sgis.ts`, `src/services/kapt.ts`, `src/services/bld-rgst.ts`
   - 이유: API 키 클라이언트 번들 노출 방지

4. **`ecos.ts`, `reb.ts`, `kosis.ts` — `AbortSignal.timeout()` 추가**
   - 파일: `src/services/ecos.ts`, `src/services/reb.ts`, `src/services/kosis.ts`
   - 이유: 외부 API 무한 대기 → 504 에러 방지

5. **`sgis.ts` — Zod `.parse()` → `.safeParse()` 교체**
   - 파일: `src/services/sgis.ts`
   - 대상: `TokenResponseSchema.parse`, `PopulationItemSchema.parse`, `HouseholdItemSchema.parse`
   - 이유: API 스펙 변경 시 미처리 예외로 서버 크래시

6. **`member-tier.ts` — `.single()` → `.maybeSingle()` 교체**
   - 파일: `src/lib/data/member-tier.ts` L68
   - 이유: 탈퇴 계정 조회 시 PostgrestError 발생

### 중기 수정 (MEDIUM, 다음 스프린트)

7. **`school_advancement_breakdown` — `real` → `numeric(5,2)`**
   - 파일: 신규 마이그레이션 (ALTER COLUMN TYPE)
   - 대상: `advancement_science`, `advancement_foreign`, `advancement_private`
   - 이유: FLOAT4 부동소수점 오차 → 진학률 계산 부정확

8. **`ads.ts` 에러 처리 추가**
   - 파일: `src/lib/data/ads.ts`
   - 대상: `getActiveAds`, `getAllAdCampaigns`, `getAdCampaignById`
   - 내용: `const { data, error } = await query; if (error) console.error(...)` 패턴 적용

9. **`invest.ts` 에러 처리 개선**
   - 파일: `src/lib/data/invest.ts`
   - 내용: 조용한 `return []` 패턴에 에러 로깅 추가

10. **`.select('*')` → 컬럼 명시**
    - 파일: `ads.ts`, `realtors.ts`, `reviews.ts`, `comments.ts`, `presale.ts`, `hagwon-recommend.ts`
    - 이유: 불필요한 데이터 전송 + 타입 안전성 향상

11. **`getComplexAreaTypes` 5개 쿼리 → 단일 GROUP BY**
    - 파일: `src/lib/data/invest.ts`
    - 이유: 불필요한 DB 왕복 5회 → 1회로 감소

### 장기 개선 (LOW)

12. **`presale_discoveries.confirmed_by` — `ON DELETE SET NULL` 추가**
    - 파일: 신규 마이그레이션
    - 이유: 운영자 계정 삭제 시 행 삭제 불가 방지

13. **`sgis.ts` — `withRetry` 래핑 추가**
    - 파일: `src/services/sgis.ts`
    - 이유: 429/503 일시적 오류 복구

14. **`naver-land.ts` — 호출 측 `withRetry` 래핑**
    - 이유: `NaverRateLimitError` 감지만 있고 자동 재시도 없음

15. **`molit.ts`, `naver-land.ts`, `presale-crawler.ts` — 주석에 import 금지 규칙 명시**
    - 이유: server-only 제외 의도 있으나 `src/app/` 직접 import 방지를 코드 수준에서 명시

---

*감사 도구: 전수 파일 정적 분석 (grep 패턴 + 수동 코드 리뷰)*  
*감사 범위: migrations 70+개 파일, lib/data 50+개 파일, services 28개 파일*
