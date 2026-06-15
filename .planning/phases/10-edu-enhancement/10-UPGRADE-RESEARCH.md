# Phase 10 학군 고도화 업그레이드 리서치

**작성일:** 2026-06-04
**도메인:** 학교 데이터 고도화, 학교알리미 API, 경쟁사 분석
**신뢰도:** MEDIUM (학교알리미 API 세부 스펙은 인증키 발급 전 직접 확인 불가 — 아래 Assumptions Log 참조)

---

## 요약

Phase 10에서 학구도 PostGIS 적재, 배정학교 배지, 학원 카테고리·백분위, 도보 색상 아이콘 등 기초 인프라는 완성됐다.
현재 `facility_school` 테이블은 이름·거리·배정여부만 저장하며, 리치고·호갱노노가 보여주는 **학교 품질 지표**(학급당 학생수·교원 비율·특목고 진학률)가 전혀 없다.

업그레이드 방향은 두 축이다:
1. **학교알리미 공시 데이터** 수집으로 품질 지표 추가 — 학급당 학생수, 교원 1인당 학생수, 방과후 수강 현황
2. **창원·김해 특화 지표** — 서울 기준이 아닌 로컬 백분위로 중학교 특목고 진학률 의미화

창원시 중학교 특목고 진학률 데이터는 이미 공개 집계 수준에서 의미가 있다(상위교 삼정자중 17%, 하위교 0%대로 편차 존재). 김해시도 율하중·관동중이 상위권을 형성한다. 이 데이터를 수집하여 리치고·호갱노노 대비 **창원·김해 기준 상위%** 표시로 차별화가 가능하다.

**핵심 권고:** facility_school에 컬럼 5개(students_per_class, teachers_ratio, advancement_rate_science, advancement_rate_foreign, afterschool_count)를 추가하고, 학교알리미 파일데이터(data.go.kr) 연간 1회 배치 수집으로 채운다.

---

## 현재 구현 상태

### facility_school 테이블 현재 스키마

[VERIFIED: supabase/migrations/20260430000004_facility.sql 및 20260514000003_facility_edu.sql 직접 확인]

```sql
create table public.facility_school (
  id              uuid primary key default gen_random_uuid(),
  complex_id      uuid not null references public.complexes(id) on delete cascade,
  school_name     text not null,
  school_type     text not null check (school_type in ('elementary', 'middle', 'high')),
  school_code     text,          -- 학교코드 (있으면 학교알리미 조회 키)
  distance_m      integer,
  is_assignment   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  UNIQUE(complex_id, school_name)
);
```

### 현재 UI (EducationCard.tsx)

[VERIFIED: 코드 직접 확인]

| 표시 항목 | 구현 상태 |
|-----------|----------|
| 초/중/고 탭 | 완료 |
| 배정학교 "배정" 배지 | 완료 (is_assignment = true 기반) |
| 도보 거리 + 도보 시간 색깔 | 완료 |
| 학원 카테고리 태그 | 완료 |
| 학원 밀도 A/B/C 등급 + 시 기준 상위% | 완료 |
| 학교 품질 지표 (학급당학생수 등) | **미구현** |
| 특목고 진학률 | **미구현** |
| 배정학교 학군 내 다른 단지 | **미구현** |

### school_districts 테이블

[VERIFIED: supabase/migrations/20260515000001_school_districts.sql 직접 확인]

- `school_districts` (hakgudo_id, school_level, geometry): 창원+김해 학구도 폴리곤 적재 완료
- `school_district_schools` (district_id, school_name, school_level): 폴리곤-학교명 연결 완료
- `get_schools_for_point(lat, lng)` RPC: 좌표로 배정학교 조회 완료

---

## 경쟁사 분석

### 리치고 vs 호갱노노 vs 단지온도 비교표

| 기능 | 리치고 | 호갱노노 | 단지온도(현재) | 단지온도(목표) |
|------|--------|---------|--------------|--------------|
| 초/중/고 탭 분리 | O | O | O | O |
| 배정학교 강조 | O | O | O (배지) | O |
| 도보 거리/시간 | O | O (슬라이더) | O (색깔) | O |
| 학교 등급 (A/B/C) | O | X | X | O (추가 예정) |
| 학급당 학생수 | O (bar 차트) | X | X | O (단순 숫자) |
| 교원 1인당 학생수 | O (bar 차트) | X | X | O (단순 숫자) |
| 특목고 진학률 | O (상위%) | O (창원시 기준 %) | X | O |
| 서울/구/학교 3단 비교 | O | X | 해당 없음 | 창원/김해/학교 비교 |
| 배정학교→주변아파트 | O | O | X | 중기 목표 |
| 학원가 탭 | O | O | O (카테고리 태그) | O |
| 방과후 프로그램 정보 | O (유무) | X | X | O (단순 유무) |
| 급식 운영방식 | O | X | X | 저우선순위 |
| 특수학급 여부 | O | X | X | 저우선순위 |

### 리치고 차별점 분석

리치고는 학교를 독립 콘텐츠 페이지(`/realty/place/middle/S010000736`)로 구성하여 단지 상세와 분리한다. 학교별 페이지에서 `배정아파트 탭`으로 역방향 조회(학교 → 아파트 목록 + 평당가)가 가능하다. [VERIFIED: 리치고 URL 패턴 확인]

서울 중심 서비스이므로 창원·김해 지역 학교는 데이터 밀도가 낮을 가능성이 높다. [ASSUMED]

### 호갱노노 차별점 분석

"창원시 기준 상위 N%" 레이블이 이미 중학교 특목고 진학에 적용된다. 도보 거리 슬라이더(5/10/20분)로 반경 필터링이 가능하다. 단지 상세 내에 임베드되는 방식이다. [ASSUMED: 실제 앱 UI는 직접 확인 안됨]

---

## 데이터 소스 가용성

### A. 학교알리미 OpenAPI (공시정보 조회)

**URL:** `https://www.schoolinfo.go.kr/openApi.do`
**인증:** 소셜 로그인(Naver/Kakao) 후 API 키 발급, 비상업적 목적 무료
**데이터 보존:** 최근 3년치만 공개 (구데이터는 EDSS 신청)

[CITED: https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_m0.do]

**확인된 공시 영역 (2026년 기준 16개):**

| 공시 영역 | 관련 항목 | 부동산 유용성 |
|----------|----------|-------------|
| 학생현황 | 학년별 학급수, 학급당 학생수 | 높음 (핵심 지표) |
| 교원현황 | 교원 1인당 학생수 | 높음 |
| 교육과정 | 방과후학교 수강 현황 | 중간 |
| 학업성취 | 학교폭력 발생현황 | 낮음 (민감) |
| 진학현황 | 상급학교 진학 현황 | 높음 (중학교) |
| 급식 | 운영방식, 급식업체 | 낮음 |
| 시설 | 시설 현황, 도서관 유무 | 낮음 |
| 특수교육 | 특수학급 수 | 중간 |

[CITED: https://www.schoolinfo.go.kr/si/pi/pnsipi_a01_l0.do]

**API 제약사항 (중요):**
- API 키 신청 후 사용 가능, 인증키 발급까지 수일 소요 가능 [ASSUMED]
- 학교별 공시자료 조회 시 학교코드(B000XXXXX 형식) 필요 → facility_school.school_code가 채워져 있어야 함
- 현재 facility_school.school_code: 마이그레이션에 컬럼 정의는 있으나 실제 데이터 채워진 여부 미확인 [ASSUMED — 검증 필요]

### B. 학교알리미 파일데이터 (data.go.kr)

연간 1-2회 전체 덤프를 공공데이터포털에서 CSV로 공개.

[CITED: https://www.data.go.kr/data/15014351/fileData.do]
[CITED: https://www.data.go.kr/data/15106331/fileData.do] — 학년별학급별 학생수 파일

**파일데이터 방식의 장점:**
- API 키 불필요 (직접 다운로드)
- 전국 데이터를 한 번에 획득
- 창원·김해 필터링 후 배치 적재

**파일데이터 방식의 단점:**
- 연 1-2회 갱신 (최신성 낮음)
- 파일 크기 수십 MB, 파싱 스크립트 필요

### C. 진학현황 데이터 — 공개 집계 서비스

학교알리미 공시정보에 진학현황이 포함되나, data.go.kr에서는 별도 파일로 공개하지 않는 것으로 보인다.
[ASSUMED — data.go.kr 파일 목록 전체 확인 안됨]

**대안 경로:**
- 올인포/아파트미 등 민간 집계 서비스에서 학교별 특목고 진학자 수가 공개된다.
  - 창원시 64개 중학교 2023년 기준: 삼정자중 17.23%, 반송중 12.42%, 반송여중 10.12%가 상위권
  - 김해시 33개 중학교 2024년 기준: 율하중 7.94%, 관동중 9.12%(2023)가 상위권
  - [CITED: https://blog.allinfo.today/724 — 2023년 창원]
  - [CITED: https://blog.allinfo.today/973 — 2024년 김해]
  - 이 블로그의 원천 데이터 출처는 명시되지 않음 [LOW confidence]

- 학교알리미 공식 사이트 화면 스크래핑도 가능하나 이용약관 위반 위험
- **권장:** 학교알리미 API의 진학현황 공시항목을 직접 조회 (인증키 필요)

### D. NEIS 교육정보 개방 포털 (open.neis.go.kr)

학교 기본정보 API(학교코드·주소·종별) 제공, 학교코드(B000XXXXX) 매핑에 활용 가능.
진학현황·학급당 학생수는 학교알리미 공시정보 API에 있고 NEIS에는 없다.
[CITED: https://open.neis.go.kr/hub/schoolInfo]

---

## facility_school 미사용·미구현 컬럼 목록

현재 스키마에서 있으나 미사용이거나, 추가 필요한 컬럼:

| 컬럼명 | 현재 상태 | 내용 |
|--------|----------|------|
| `school_code` | 정의됨, 데이터 미입력 의심 | 학교알리미 API 조회 키 (`B000XXXXX` 형식) |
| `students_per_class` | **미정의** | 학급당 학생수 (학교알리미) |
| `teachers_ratio` | **미정의** | 교원 1인당 학생수 (학교알리미) |
| `advancement_rate` | **미정의** | 특목고/자사고 진학률 % (중학교 전용) |
| `advancement_science` | **미정의** | 과학고 진학자 수 (중학교 전용) |
| `advancement_foreign` | **미정의** | 외고/국제고 진학자 수 (중학교 전용) |
| `advancement_private` | **미정의** | 자사고 진학자 수 (중학교 전용) |
| `afterschool_programs` | **미정의** | 방과후 수강 프로그램 수 (선택적) |
| `school_grade` | **미정의** | 종합 학교 등급 A+~D (계산 컬럼) |
| `school_grade_percentile` | **미정의** | 창원시/김해시 내 백분위 (계산 컬럼) |
| `data_year` | **미정의** | 데이터 기준 연도 (학교알리미 연간 갱신) |
| `updated_year` | **미정의** | 최종 수집 연도 |

**school_code 상태 검증 필요:**
facility_school.school_code 컬럼이 정의되어 있으나(facility.sql 확인), 실제 데이터가 입력됐는지는 DB 쿼리로 확인해야 한다. school_code가 없으면 학교알리미 API 조회 불가 → NEIS API로 학교코드 먼저 보완 필요.

---

## 창원·김해 특목고 진학 데이터 현황

[CITED: https://blog.allinfo.today/724, https://blog.allinfo.today/973]
[주의: 원천 출처 명시 없음 — LOW confidence. 학교알리미 API 직접 확인 권장]

### 창원시 중학교 (2023년 기준)
- 총 64개 중학교, 학생 약 10,154명
- 전체 특목고 진학률: 3.7% (376명)
  - 과학고 0.99%(101명), 외고 1.77%(180명), 자사고 0.94%(95명)
- **상위 3개교:** 삼정자중 17.23% → 반송중 12.42% → 반송여중 10.12%
- **하위교:** 0%대 다수 존재 → 창원시 내 편차 매우 큼 → 백분위 표시 의미 있음

### 김해시 중학교 (2024년 기준)
- 총 33개 중학교, 학생 약 5,700명
- 전체 특목고 진학률: 2.77% (158명)
  - 과학고 0.68%(39명), 외고 1.43%(81명), 자사고 0.66%(38명)
- **상위 2개교:** 율하중 7.94% → 관동중 9.12%(2023)
- 상위-하위 격차가 창원보다 작은 편

### 지역 특화 의미

- 창원/김해는 서울 대치동(20-30%대)과 비교 무의미 → "창원시 내 상위 X%"로 표시해야 실용적
- 학군 개념이 부동산 가격에 반영되는지 검증 필요 — 반송중 학군(반송동, 감계동)의 실거래 평당가가 실제로 높은지 우리 DB로 검증 가능 [우리만의 차별점]

---

## 우리만의 차별점 3가지

### 차별점 1: 실거래 연동 학군 가치 검증 (독보적)

리치고·호갱노노는 학군 정보와 실거래가를 **별도 탭**으로 보여준다.
단지온도는 같은 DB에 실거래(transactions)와 학군(facility_school)이 모두 있으므로,
배정학교가 같은 단지들의 **평균 평당가**를 즉시 계산·비교할 수 있다.

예시 표시: "삼정자중 배정 단지 평균 평당가 1,850만원 — 창원시 평균(1,420만원) 대비 +30%"

이 기능은 타 서비스 대비 명확한 차별화이며, 별도 API 없이 기존 DB로 구현 가능하다.

### 차별점 2: 창원·김해 기준 백분위 (지역 특화)

리치고는 서울 기준 백분위를 제공한다(창원·김해에서 의미 없음).
호갱노노는 창원시 기준 %를 제공하나 앱 전용이다.

단지온도는 학원 밀도 백분위에서 이미 `hagwon_score_percentile_by_si` 패턴을 구축했다.
동일한 패턴으로 학교 품질 지표도 창원시/김해시 별도 백분위를 계산할 수 있다.

표시 예시: "삼정자중 — 창원시 상위 5% · 진학률 17.2%"

### 차별점 3: 학군 변화 추적 (시계열)

data_year 컬럼을 추가하면 연간 학교 지표 변화를 저장할 수 있다.
"이 학교 학급당 학생수 3년간 감소 추세 → 지역 인구 감소 신호"를 투자 관점에서 의미화할 수 있다.

Phase 22 투자 분석 페이지와 연계하면 "학군 약화 지역 = 인구 감소 선행 지표"로 활용 가능하다.

---

## 구현 우선순위 매트릭스

### 임팩트 × 난이도 평가

| 기능 | 사용자 임팩트 | 구현 난이도 | 우선순위 |
|------|-------------|-----------|---------|
| 학급당 학생수 표시 | 높음 (리치고 핵심 지표) | 낮음 (파일 배치 + 컬럼 추가) | **P1 즉시** |
| 특목고 진학률 (중학교) | 높음 (부동산 주요 관심사) | 중간 (API 인증키 + 수집 스크립트) | **P1 즉시** |
| 창원/김해 기준 학교 백분위 | 높음 (차별화) | 낮음 (기존 percentile 패턴 재사용) | **P1 즉시** |
| 실거래 × 학군 연동 평당가 | 매우 높음 (독보적) | 중간 (SQL 집계 RPC + UI) | **P2 다음 스프린트** |
| 교원 1인당 학생수 | 중간 | 낮음 (같은 파일에서 추출) | P2 |
| 배정학교 → 학군 내 단지 역조회 | 높음 | 높음 (별도 UI, RPC 설계 필요) | P3 |
| 방과후 수강 현황 | 낮음 | 중간 | P4 |
| 특수학급/급식 운영방식 | 낮음 | 중간 | P5 (보류) |
| 시계열 학군 변화 추적 | 중간 (투자 페이지 연계) | 높음 (data_year 관리) | P4 |

### P1 작업 상세 (즉시 착수 가능)

**P1-A: facility_school 컬럼 확장 마이그레이션**
```sql
ALTER TABLE public.facility_school
  ADD COLUMN IF NOT EXISTS students_per_class  numeric(5,1),  -- 학급당 학생수
  ADD COLUMN IF NOT EXISTS teachers_ratio      numeric(5,1),  -- 교원 1인당 학생수
  ADD COLUMN IF NOT EXISTS advancement_rate    numeric(5,2),  -- 특목고 진학률 % (중학교)
  ADD COLUMN IF NOT EXISTS advancement_science smallint,      -- 과학고 진학자 수
  ADD COLUMN IF NOT EXISTS advancement_foreign smallint,      -- 외고 진학자 수
  ADD COLUMN IF NOT EXISTS advancement_private smallint,      -- 자사고 진학자 수
  ADD COLUMN IF NOT EXISTS data_year           smallint;      -- 데이터 기준 연도
```

**P1-B: 학교알리미 배치 수집 스크립트**
- `scripts/collect-school-stats.ts`: 파일데이터 CSV 다운로드 → 창원/김해 필터 → facility_school upsert
- school_code 기준으로 매칭 (없으면 school_name + school_type 복합 매칭)
- 연 1회 cron 또는 수동 실행

**P1-C: 학교 등급 계산 RPC + UI**
- 학급당 학생수·진학률 기반으로 창원시/김해시 내 백분위 계산
- EducationCard.tsx SchoolList 컴포넌트에 지표 표시 추가

---

## Assumptions Log

| # | 주장 | 섹션 | 틀렸을 때 위험 |
|---|------|------|--------------|
| A1 | 학교알리미 API가 학급당학생수·진학현황을 개별 조회 가능한 공시항목으로 제공한다 | 데이터 소스 | API 명세 다를 경우 파일데이터(CSV) 방식으로 전환 필요 |
| A2 | facility_school.school_code 컬럼에 실제 학교코드 데이터가 없다 (수집 스크립트에서 미입력) | DB 현재 상태 | 이미 채워졌다면 API 수집 즉시 시작 가능 |
| A3 | 리치고가 창원·김해 학교 데이터를 서울 수준으로 커버하지 않는다 | 경쟁사 분석 | 리치고가 지방 데이터도 충실하다면 차별화 약화 |
| A4 | 진학현황 파일이 data.go.kr에 별도 공개되지 않는다 | 데이터 소스 | data.go.kr 전체 목록 재확인 필요 |
| A5 | 블로그(allinfo.today) 집계 데이터의 원천이 학교알리미 공시정보이다 | 창원/김해 진학 데이터 | 원천 출처 불명확 — 학교알리미 직접 확인으로 대체 권장 |

---

## 구현 전 필수 검증 체크리스트

1. **DB 확인**: `SELECT school_code, COUNT(*) FROM facility_school WHERE school_code IS NOT NULL GROUP BY school_code IS NOT NULL` — school_code 실제 입력 여부
2. **API 키 발급**: 학교알리미 소셜 로그인 → API 키 신청 (1-3일 소요 가능)
3. **파일데이터 컬럼 확인**: data.go.kr "학년별학급별 학생수" CSV 다운로드 → 컬럼 목록 확인 → 학교코드 필드명 확인
4. **진학현황 파일 존재 여부**: data.go.kr에서 "진학현황" 키워드 검색 → 파일 존재 시 직접 활용 가능
5. **실거래 연동 가능성**: `SELECT fs.school_name, AVG(t.price_per_area) FROM facility_school fs JOIN transactions t ON t.complex_id = fs.complex_id WHERE fs.is_assignment = true GROUP BY fs.school_name` — 데이터 충분한지 확인

---

## 소스

### PRIMARY (HIGH confidence)
- `src/components/complex/EducationCard.tsx` — 현재 UI 구조 [VERIFIED: 직접 코드 확인]
- `src/lib/data/facility-edu.ts` — 데이터 레이어 현재 구현 [VERIFIED]
- `supabase/migrations/20260430000004_facility.sql` — facility_school 스키마 [VERIFIED]
- `supabase/migrations/20260514000003_facility_edu.sql` — UNIQUE 제약 추가 [VERIFIED]
- `supabase/migrations/20260515000001_school_districts.sql` — school_districts 테이블 [VERIFIED]
- `supabase/migrations/20260526000002_ai_chat_school_chunk.sql` — get_schools_for_point RPC [VERIFIED]
- `.planning/phases/10-edu-enhancement/10-03-SUMMARY.md` — Phase 10 완료 상태 [VERIFIED]

### SECONDARY (MEDIUM confidence)
- [학교알리미 공시항목 소개 2026년](https://www.schoolinfo.go.kr/si/pi/pnsipi_a01_l0.do) — 16개 공시 영역 목록 확인
- [학교알리미 OpenAPI 이용안내](https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_m0.do) — API 구조 확인
- [창원시 중학교 특목고 진학 2023](https://blog.allinfo.today/724) — 상위교 데이터 (원천 불명)
- [김해시 중학교 특목고 진학 2024](https://blog.allinfo.today/973) — 상위교 데이터 (원천 불명)

### TERTIARY (LOW confidence)
- [공공데이터포털 학교알리미 공시정보](https://www.data.go.kr/data/15098092/openapi.do) — API 제공 여부 (접근 실패)
- [공공데이터포털 학년별학급별학생수](https://www.data.go.kr/data/15106331/fileData.do) — 파일 존재 확인 (내용 미확인)

---

## 메타데이터

**신뢰도 분류:**
- 현재 DB/코드 상태: HIGH (직접 파일 확인)
- 학교알리미 API 스펙 상세: LOW (인증키 없이 실제 응답 확인 불가)
- 창원/김해 진학률 수치: MEDIUM (공개 집계 데이터, 원천 불명확)
- 경쟁사 기능 분석: MEDIUM (공개 URL 기반, 앱 내부 기능 일부 ASSUMED)

**리서치 날짜:** 2026-06-04
**유효 기간:** 2026-09-04 (학교알리미 연간 갱신 전까지)
