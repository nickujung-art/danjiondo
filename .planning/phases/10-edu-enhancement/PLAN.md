# Phase 10 학군 고도화 업그레이드 — 실행 플랜

**작성일:** 2026-06-04
**대상 플랜 파일:** `10-04-PLAN.md` ~ `10-07-PLAN.md`
**기존 Phase 10:** 10-00~03 완료 (배정학교 배지·도보색깔·학원탭·유치원분리)

---

## Phase 목표

`facility_school`에 학교 품질 지표(학급당학생수·교원비율·특목고진학률)를 추가하고,
NEIS API로 school_code를 매핑한 뒤 학교알리미 파일데이터를 연간 배치로 수집한다.
창원·김해 내 백분위로 학교를 등급화하고 EducationCard에 표시한다.
P2에서는 배정학교 학군 내 단지들의 평균 평당가 vs 시 전체 평균을 RPC로 계산하여
EducationCard 배정학교 행에 "+30%" 형태로 노출한다.

---

## 현재 상태 (기준선)

| 항목 | 상태 |
|------|------|
| `facility_school` 스키마 | id, complex_id, school_name, school_type, school_code(null), distance_m, is_assignment |
| `school_code` 데이터 | 17,927행 전부 NULL |
| `students_per_class` 등 품질 컬럼 | **미존재** |
| `school_districts` 폴리곤 | 적재 완료 |
| EducationCard 학교 탭 | 이름·거리·배정 배지만 표시 |

---

## P1 플랜 목록

```
Wave 1 (독립)
  10-04-PLAN.md  DB 마이그레이션 — facility_school 컬럼 확장 + 학교 백분위 RPC
  10-05-PLAN.md  NEIS API school_code 매핑 스크립트 (school_name+school_type → B000XXXXX)

Wave 2 (10-04 완료 후)
  10-06-PLAN.md  학교알리미 파일데이터 배치 수집 스크립트 (CSV → upsert)

Wave 3 (10-04, 10-06 완료 후)
  10-07-PLAN.md  EducationCard 학교 품질 지표 UI (SchoolList 확장)
```

---

## P2 플랜 목록

```
Wave 4 (10-07 완료 후)
  10-08-PLAN.md  school_district_avg_price RPC + EducationCard 배정학교 평당가 비교 표시
```

---

## 태스크 상세

---

### 10-04-PLAN.md — DB 마이그레이션 (Wave 1)

**목적:** 품질 컬럼 추가 + 백분위 계산 RPC 정의. 이후 모든 플랜의 기반.

**파일:**
- `supabase/migrations/20260606000001_school_quality_columns.sql` (신규)

**태스크:**

**Task 1: facility_school 컬럼 확장 마이그레이션**

```sql
ALTER TABLE public.facility_school
  ADD COLUMN IF NOT EXISTS students_per_class  numeric(5,1),
  ADD COLUMN IF NOT EXISTS teachers_ratio      numeric(5,1),
  ADD COLUMN IF NOT EXISTS advancement_rate    numeric(5,2),   -- 특목고 진학률 % (중학교)
  ADD COLUMN IF NOT EXISTS advancement_science smallint,       -- 과학고 진학자 수
  ADD COLUMN IF NOT EXISTS advancement_foreign smallint,       -- 외고·국제고 진학자 수
  ADD COLUMN IF NOT EXISTS advancement_private smallint,       -- 자사고 진학자 수
  ADD COLUMN IF NOT EXISTS data_year           smallint;       -- 데이터 기준 연도 (예: 2024)
```

**Task 2: 학교 품질 백분위 RPC 2개 정의**

`school_quality_percentile_by_si(p_metric text, target_value numeric, p_si text)`
- `p_metric`: `'students_per_class'` 또는 `'advancement_rate'`
- `students_per_class` → 낮을수록 좋음 (COUNT < target / 역방향 백분위)
- `advancement_rate` → 높을수록 좋음 (COUNT < target / 정방향 백분위)
- `WHERE school_type = 'middle'` 조건은 advancement_rate 전용
- 패턴: `hagwon_score_percentile_by_si` 함수와 동일 구조

```sql
CREATE OR REPLACE FUNCTION public.school_quality_percentile_by_si(
  p_metric text,
  target_value numeric,
  p_si text
)
RETURNS double precision LANGUAGE plpgsql STABLE AS $$
DECLARE
  result double precision;
BEGIN
  IF p_metric = 'students_per_class' THEN
    -- 낮을수록 좋음 → 나보다 학생수 많은 학교 수 / 전체 (역백분위)
    SELECT
      COUNT(*) FILTER (WHERE students_per_class > target_value)::double precision
      / NULLIF(COUNT(*) FILTER (WHERE students_per_class IS NOT NULL), 0)
    INTO result
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE c.si = p_si AND fs.students_per_class IS NOT NULL;
  ELSIF p_metric = 'advancement_rate' THEN
    SELECT
      COUNT(*) FILTER (WHERE advancement_rate < target_value)::double precision
      / NULLIF(COUNT(*) FILTER (WHERE advancement_rate IS NOT NULL), 0)
    INTO result
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE c.si = p_si AND fs.school_type = 'middle'
      AND fs.advancement_rate IS NOT NULL;
  ELSE
    RETURN 0.5;
  END IF;
  RETURN COALESCE(result, 0.5);
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_quality_percentile_by_si(text, numeric, text)
  TO authenticated, anon;
```

**검증:**
```bash
grep -c "students_per_class\|advancement_rate\|school_quality_percentile_by_si" \
  supabase/migrations/20260606000001_school_quality_columns.sql
# 기대값: 3 이상
```

**완료 기준:** 마이그레이션 적용 후 `SELECT column_name FROM information_schema.columns WHERE table_name = 'facility_school'`에 7개 신규 컬럼 포함.

---

### 10-05-PLAN.md — NEIS school_code 매핑 스크립트 (Wave 1)

**목적:** facility_school.school_code(현재 전부 NULL)를 NEIS API로 채운다.

**파일:**
- `scripts/map-school-codes.ts` (신규)

**NEIS API 패턴:**

```
GET https://open.neis.go.kr/hub/schoolInfo
  ?KEY=           (무인증 — 빈값 또는 생략)
  &Type=json
  &pIndex=1
  &pSize=1000
  &ATPT_OFCDC_SC_CODE=J10   (경남교육청 코드)
  &SCHUL_KND_SC_NM=중학교   (선택)
```

응답 필드: `SD_SCHUL_CODE` (예: `S100000730`) → `school_code`로 저장
매핑 키: `SCHUL_NM` (학교명) + `SCHUL_KND_SC_NM` (학교종별명)

**태스크:**

**Task 1: NEIS API 전체 학교 목록 조회 + facility_school UPDATE**

```typescript
// scripts/map-school-codes.ts

/**
 * NEIS 교육정보 개방 포털에서 경남(J10) 학교 코드를 조회하여
 * facility_school.school_code를 업데이트한다.
 *
 * 실행: npx tsx scripts/map-school-codes.ts [--dry-run]
 *
 * 매핑 로직:
 * 1. NEIS에서 경남 전체 학교 목록 수집 (pIndex 반복)
 * 2. facility_school에서 school_code IS NULL인 행 조회
 * 3. school_name exact match → school_type 확인
 *    school_type 매핑: elementary→초등학교, middle→중학교, high→고등학교
 * 4. 매칭된 경우 UPDATE, 미매칭은 unmatched_log에 기록
 * 5. --dry-run: DB 수정 없이 매칭 결과만 콘솔 출력
 */

const NEIS_BASE = 'https://open.neis.go.kr/hub/schoolInfo'
const ATPT_CODE = 'J10'  // 경남교육청

// NEIS 학교종별명 → facility_school.school_type 매핑
const SCHOOL_TYPE_MAP: Record<string, string> = {
  '초등학교': 'elementary',
  '중학교':   'middle',
  '고등학교': 'high',
}
```

핵심 로직:
1. `pIndex=1`부터 `rows=[]`가 빌 때까지 반복 fetch → 전체 경남 학교 Map 구성 (`school_name:school_type` → `school_code`)
2. `supabase.from('facility_school').select('id, school_name, school_type').is('school_code', null)` 조회
3. 매칭된 행: `supabase.from('facility_school').update({ school_code }).eq('id', row.id)` (dry-run 시 skip)
4. 미매칭 행: 콘솔 warn + 별도 CSV 출력 (`unmatched-school-codes.csv`)

**검증:**
```bash
npx tsx scripts/map-school-codes.ts --dry-run 2>&1 | head -30
# "매칭: N건 / 미매칭: M건" 출력 기대
```

**완료 기준:**
- `--dry-run` 실행 시 에러 없이 매칭 리포트 출력
- 실제 실행 후: `SELECT COUNT(*) FROM facility_school WHERE school_code IS NOT NULL` → 0보다 커야 함 (중학교 5,103행 중 상당수 매핑 기대)

**환경 변수:** NEIS API는 무인증. `SUPABASE_SERVICE_ROLE_KEY` 필요 (기존 스크립트 패턴 동일).

---

### 10-06-PLAN.md — 학교알리미 파일데이터 배치 수집 스크립트 (Wave 2)

**목적:** data.go.kr 학교알리미 CSV를 다운로드 파싱하여 facility_school의 품질 컬럼을 채운다.

**파일:**
- `scripts/collect-school-stats.ts` (신규)

**전제조건:** 10-04 마이그레이션 완료(컬럼 존재), 10-05 실행(school_code 매핑됨).

**태스크:**

**Task 1: CSV 파싱 + facility_school upsert**

```typescript
/**
 * 학교알리미 공시 데이터 파일(data.go.kr)을 파싱하여
 * facility_school의 품질 컬럼을 업데이트한다.
 *
 * 실행: npx tsx scripts/collect-school-stats.ts [--dry-run]
 *
 * 입력 파일 (수동 다운로드 → data/ 디렉토리에 배치):
 *   data/school-stats-students.csv    (학급당 학생수: 학교코드, 학교명, 학교종류, 학급당학생수)
 *   data/school-stats-teachers.csv   (교원 1인당 학생수: 학교코드, 교원1인당학생수)
 *   data/school-stats-advancement.csv (진학현황: 학교코드, 과학고, 외국어고, 자사고 진학자수)
 *
 * 파일이 없으면 SKIP 메시지 출력 후 종료.
 *
 * 매핑: school_code(B000XXXXX 형식) → facility_school WHERE school_code = ?
 * 지역 필터: ATPT_OFCDC_SC_CODE = 'J10' (경남) 또는 도시명에 '창원'/'김해' 포함
 *
 * upsert 전략: UPDATE SET ... WHERE school_code = ? (INSERT 아님 — 기존 행 갱신)
 */
```

핵심 로직:
1. `data/school-stats-students.csv` 존재 시: `students_per_class` UPDATE (school_code 기준)
2. `data/school-stats-teachers.csv` 존재 시: `teachers_ratio` UPDATE
3. `data/school-stats-advancement.csv` 존재 시: `advancement_science`, `advancement_foreign`, `advancement_private` UPDATE + `advancement_rate` 계산 (과학고+외고+자사고 합계 / 전체 졸업생 수 × 100, 졸업생 수 없으면 NULL)
4. `data_year` = CSV 파일의 기준 연도 (파일명 또는 파라미터로 주입: `--year=2024`)
5. 각 파일 처리 후 "업데이트: N건 / 스킵: M건(school_code 미매핑)" 리포트

**파일 없을 때 동작:**
```
[SKIP] data/school-stats-students.csv 없음 — 학급당 학생수 업데이트 건너뜀
[SKIP] data/school-stats-teachers.csv 없음 — 교원비율 업데이트 건너뜀
[SKIP] data/school-stats-advancement.csv 없음 — 진학현황 업데이트 건너뜀
[INFO] 처리할 파일 없음. data/ 디렉토리에 CSV 파일을 배치 후 재실행하세요.
```

**검증:**
```bash
npx tsx scripts/collect-school-stats.ts --dry-run 2>&1
# CSV 없으면 SKIP 메시지, 있으면 파싱 리포트 출력
```

**완료 기준:**
- dry-run 에러 없이 완료
- CSV 파일 배치 후 실행 시: `SELECT COUNT(*) FROM facility_school WHERE students_per_class IS NOT NULL` > 0

**NOTE:** data.go.kr CSV 컬럼명은 파일 버전마다 다를 수 있다. 스크립트 상단에 컬럼명 상수를 선언하여 교체 용이하게 작성할 것:
```typescript
const COL_SCHOOL_CODE = '학교코드'        // 실제 컬럼명 확인 후 수정
const COL_STUDENTS_PER_CLASS = '학급당학생수'
const COL_TEACHERS_RATIO = '교원1인당학생수'
```

---

### 10-07-PLAN.md — EducationCard 학교 품질 지표 UI (Wave 3)

**목적:** SchoolList에 학급당학생수·진학률·창원/김해 기준 백분위를 표시한다.

**파일:**
- `supabase/migrations/20260606000002_school_district_avg_price.sql` ← P2 RPC (아래 참조)
- `src/lib/data/facility-edu.ts` (수정 — SchoolItem 타입 확장 + DB 쿼리 확장)
- `src/components/complex/EducationCard.tsx` (수정 — SchoolList 컴포넌트 확장)
- `src/lib/data/facility-edu.test.ts` (수정 — 신규 필드 테스트 추가)

**전제조건:** 10-04 마이그레이션 완료, 10-06 실행으로 일부 데이터 존재.

**태스크:**

**Task 1: facility-edu.ts 타입 + 쿼리 확장**

`SchoolItem` 인터페이스에 추가:
```typescript
export interface SchoolItem {
  school_name:         string
  school_type:         'elementary' | 'middle' | 'high'
  distance_m:          number | null
  is_assignment:       boolean
  // 신규 (null = 데이터 미수집)
  students_per_class:  number | null
  teachers_ratio:      number | null
  advancement_rate:    number | null  // 중학교 전용
  advancement_science: number | null
  advancement_foreign: number | null
  advancement_private: number | null
  data_year:           number | null
  // 계산 (서버에서 RPC로 조회)
  students_percentile: number | null  // 0-100, 높을수록 좋음 (낮은 학급당학생수)
  advancement_percentile: number | null  // 0-100
}
```

`getComplexFacilityEdu` 변경:
1. `facility_school` select에 7개 신규 컬럼 추가
2. 배정학교(`is_assignment = true`) 중 `students_per_class != null`인 학교에 대해
   `school_quality_percentile_by_si` RPC 호출 (Promise.all로 병렬)
3. 비배정학교도 데이터 있으면 백분위 계산 (최대 탭당 3개)

**Task 2: EducationCard SchoolList 컴포넌트 학교 품질 지표 행 추가**

배정학교 행에 품질 지표 표시 (데이터 있을 때만):

```
[학교아이콘] 반송중       [배정]
             도보 8분
             학급당 23명 · 창원 상위 8%
             진학률 12.4% · 창원 상위 5%     ← school_type === 'middle'만
```

표시 규칙:
- `students_per_class` 있을 때: `학급당 {N}명` + 백분위 레이블 (`{si} 상위 {X}%`)
- `advancement_rate` 있을 때 (middle only): `진학률 {N}%` + 백분위 레이블
- `data_year` 있을 때: 행 하단에 `{year}년 기준` 출처 표시 (font-size 10px, fg-tertiary)
- 데이터 없는 학교: 현재 UI 유지 (거리·도보만)
- `GRADE_COLOR`/`GRADE_BG` 기존 상수 재사용 금지 — 학교 품질은 별도 색상 없음, 텍스트만

UI 레이아웃 (기존 SchoolList 행 내부 하단에 추가):
```tsx
{(s.students_per_class != null || (s.school_type === 'middle' && s.advancement_rate != null)) && (
  <div style={{ font: '500 11px/1.6 var(--font-sans)', color: 'var(--fg-sec)', marginTop: 3 }}>
    {s.students_per_class != null && (
      <span>학급당 {s.students_per_class}명{s.students_percentile != null && ` · ${si ?? '지역'} 상위 ${100 - s.students_percentile}%`}</span>
    )}
    {s.school_type === 'middle' && s.advancement_rate != null && (
      <span style={{ marginLeft: s.students_per_class != null ? 8 : 0 }}>
        진학률 {s.advancement_rate.toFixed(1)}%{s.advancement_percentile != null && ` · ${si ?? '지역'} 상위 ${100 - s.advancement_percentile}%`}
      </span>
    )}
  </div>
)}
```

**검증:**
```bash
npm run test -- src/lib/data/facility-edu.test.ts
npm run lint
```

**완료 기준:**
- `SchoolItem`에 7개 신규 필드 포함, 기존 타입과 호환
- `getComplexFacilityEdu` 반환값에 `students_percentile`/`advancement_percentile` 포함
- 테스트 통과, lint 통과
- 단지 상세 페이지 학교 탭에서 데이터 있는 학교에 품질 지표 표시 (checkpoint: 수동 확인)

---

### 10-08-PLAN.md — school_district_avg_price RPC + UI (Wave 4, P2)

**목적:** 배정학교 학군 내 단지들의 평균 평당가 vs 시 전체 평균 비교를 EducationCard에 표시한다.

**파일:**
- `supabase/migrations/20260606000002_school_district_avg_price.sql` (신규)
- `src/lib/data/facility-edu.ts` (수정 — assignedSchoolPriceCompare 추가)
- `src/components/complex/EducationCard.tsx` (수정 — 배정학교 행에 평당가 비교 뱃지)

**태스크:**

**Task 1: school_district_avg_price RPC 정의**

```sql
-- 배정학교 기준 단지 평균 평당가 vs 시 전체 평균 비교
CREATE OR REPLACE FUNCTION public.school_district_avg_price(
  p_school_name text,
  p_months      int DEFAULT 12
)
RETURNS TABLE (
  school_name       text,
  district_avg_py   numeric,   -- 배정학교 단지들 평균 평당가 (만원/평)
  si_avg_py         numeric,   -- 해당 시 전체 평균 평당가
  complex_count     bigint,    -- 집계 단지 수
  si                text
)
LANGUAGE sql STABLE AS $$
  WITH school_complexes AS (
    -- 해당 배정학교가 배정된 모든 단지
    SELECT DISTINCT fs.complex_id, c.si
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE fs.school_name = p_school_name
      AND fs.is_assignment = true
  ),
  district_prices AS (
    SELECT
      sc.si,
      ROUND(AVG(t.price / NULLIF(t.area_m2, 0) * 3.3058)::numeric, 0) AS avg_py,
      COUNT(DISTINCT t.complex_id) AS cnt
    FROM public.transactions t
    JOIN school_complexes sc ON sc.complex_id = t.complex_id
    WHERE t.deal_type = 'sale'
      AND t.deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
      AND t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
    GROUP BY sc.si
  ),
  si_prices AS (
    SELECT
      c.si,
      ROUND(AVG(t.price / NULLIF(t.area_m2, 0) * 3.3058)::numeric, 0) AS avg_py
    FROM public.transactions t
    JOIN public.complexes c ON c.id = t.complex_id
    WHERE t.deal_type = 'sale'
      AND t.deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
      AND t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
      AND c.si IN (SELECT DISTINCT si FROM school_complexes)
    GROUP BY c.si
  )
  SELECT
    p_school_name          AS school_name,
    dp.avg_py              AS district_avg_py,
    sp.avg_py              AS si_avg_py,
    dp.cnt                 AS complex_count,
    dp.si                  AS si
  FROM district_prices dp
  JOIN si_prices sp ON sp.si = dp.si;
$$;

GRANT EXECUTE ON FUNCTION public.school_district_avg_price(text, int)
  TO authenticated, anon;
```

**Task 2: facility-edu.ts에 assignedSchoolPriceCompare 추가 + EducationCard UI**

`getComplexFacilityEdu` 내에서 배정학교(`is_assignment = true`)에 대해
`school_district_avg_price` RPC를 병렬 호출.

결과를 `SchoolItem`에 추가:
```typescript
district_avg_py: number | null   // 학군 평균 평당가
si_avg_py:       number | null   // 시 전체 평균 평당가
price_premium:   number | null   // (district_avg_py - si_avg_py) / si_avg_py * 100
```

EducationCard SchoolList 배정학교 행에 뱃지 추가:
```
[배정]  [창원 평균 대비 +30%]   ← price_premium > 5% → 녹색
        [창원 평균 대비 -8%]    ← price_premium < -5% → 회색
        (|premium| < 5% → 뱃지 미표시)
```

뱃지 스타일:
- +5% 이상: `color: #15803d, background: #dcfce7`
- -5% 이하: `color: #9ca3af, background: #f9fafb`
- 텍스트: `{si} 평균 대비 {premium > 0 ? '+' : ''}{premium.toFixed(0)}%`

**검증:**
```bash
# RPC 직접 테스트 (supabase db query)
supabase db query --linked \
  "SELECT * FROM school_district_avg_price('반송중') LIMIT 1"
# district_avg_py, si_avg_py, price_premium 컬럼 반환 기대

npm run test -- src/lib/data/facility-edu.test.ts
npm run lint
```

**완료 기준:**
- RPC가 `district_avg_py`, `si_avg_py`, `complex_count`, `si` 반환
- 배정학교 행에 "+N%" 뱃지 표시 (premium 절댓값 5% 이상일 때만)
- `npm run lint && npm run test` 통과

---

## 파일 변경 목록

### 신규 생성

| 파일 | 용도 |
|------|------|
| `supabase/migrations/20260606000001_school_quality_columns.sql` | facility_school 컬럼 7개 추가 + school_quality_percentile_by_si RPC |
| `supabase/migrations/20260606000002_school_district_avg_price.sql` | school_district_avg_price RPC (P2) |
| `scripts/map-school-codes.ts` | NEIS API → school_code 매핑 배치 스크립트 |
| `scripts/collect-school-stats.ts` | 학교알리미 CSV → facility_school upsert 배치 스크립트 |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/data/facility-edu.ts` | SchoolItem 타입 확장 + RPC 호출 추가 (P1), price_premium 추가 (P2) |
| `src/components/complex/EducationCard.tsx` | SchoolList 품질 지표 행 추가 (P1), 배정학교 평당가 뱃지 추가 (P2) |
| `src/lib/data/facility-edu.test.ts` | 신규 필드 테스트 추가 |

---

## 의존성 그래프

```
10-04 (마이그레이션)  ──┐
                        ├──→ 10-07 (UI)
10-05 (NEIS 코드)       │
                        │
10-06 (CSV 배치)   ─────┘

10-07 ──→ 10-08 (P2 RPC+UI)
```

10-05, 10-06은 Wave 1에서 병렬 실행 가능. 단, 10-06은 실제 데이터 수집 효과를 내려면 10-05 완료 후 실행 권장 (school_code 매핑 후 CSV upsert 시 매칭률 높아짐).

---

## Assumptions

| # | 가정 | 틀렸을 때 대응 |
|---|------|--------------|
| A1 | NEIS API `ATPT_OFCDC_SC_CODE=J10`이 경남교육청 코드이다 | open.neis.go.kr 콘솔에서 교육청코드 목록 조회 후 수정 |
| A2 | NEIS API 응답 필드가 `SD_SCHUL_CODE`, `SCHUL_NM`, `SCHUL_KND_SC_NM`이다 | API 첫 호출 응답으로 실제 필드명 확인 후 상수 수정 |
| A3 | data.go.kr 학교알리미 CSV에 `학교코드` 컬럼이 존재한다 | CSV 다운로드 후 헤더 확인, `COL_SCHOOL_CODE` 상수 수정 |
| A4 | data.go.kr 진학현황 파일이 존재한다 | 없으면 학교알리미 OpenAPI 인증키 발급 경로로 전환 |
| A5 | 학군 내 단지 수가 평당가 집계에 충분하다 (최소 3건 이상) | complex_count < 3인 경우 뱃지 미표시로 처리 |
| A6 | facility_school UNIQUE(complex_id, school_name) 제약으로 UPDATE 가능하다 | 현재 마이그레이션에서 확인됨 (VERIFIED) |

---

## 성공 기준 (검증 가능)

### P1 완료 기준

1. **마이그레이션:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'facility_school' ORDER BY ordinal_position` → `students_per_class`, `teachers_ratio`, `advancement_rate`, `advancement_science`, `advancement_foreign`, `advancement_private`, `data_year` 7개 컬럼 포함
2. **RPC 존재:** `SELECT proname FROM pg_proc WHERE proname = 'school_quality_percentile_by_si'` → 1행 반환
3. **school_code 매핑:** `SELECT COUNT(*) FROM facility_school WHERE school_code IS NOT NULL` → 스크립트 실행 후 0보다 큰 값 (중학교 기준 최소 100건 이상 기대)
4. **CSV 수집:** CSV 파일 배치 + 스크립트 실행 후 `SELECT COUNT(*) FROM facility_school WHERE students_per_class IS NOT NULL` → 0보다 큰 값
5. **UI:** 단지 상세 학교 탭에서 `students_per_class` 있는 학교에 "학급당 N명 · {시} 상위 X%" 표시
6. **테스트:** `npm run test -- src/lib/data/facility-edu.test.ts` 통과
7. **빌드:** `npm run lint && npm run build` 에러 없음

### P2 완료 기준

8. **RPC:** `SELECT * FROM school_district_avg_price('반송중')` → `district_avg_py`, `si_avg_py`, `complex_count` 반환
9. **UI:** 배정학교 행에서 premium ±5% 이상인 경우 "+N%"/"−N%" 뱃지 표시, 미만은 뱃지 없음
10. **빌드:** `npm run lint && npm run build` 에러 없음

---

## 실행 순서 요약

```bash
# Wave 1 (병렬 가능)
# [10-04] DB 마이그레이션 작성 + 적용
npx supabase db push

# [10-05] NEIS school_code 매핑 (10-04와 독립)
npx tsx scripts/map-school-codes.ts --dry-run
npx tsx scripts/map-school-codes.ts

# Wave 2
# [10-06] 학교알리미 CSV 다운로드 → data/ 에 배치 후
npx tsx scripts/collect-school-stats.ts --year=2024

# Wave 3
# [10-07] UI 작업 (코드 변경 → 테스트 → 확인)
npm run test -- src/lib/data/facility-edu.test.ts

# Wave 4 (P2)
# [10-08] RPC 마이그레이션 + UI 추가
npx supabase db push
```
