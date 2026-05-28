# Phase 18 — 공인중개사 추천 섹션

## Goal

아파트 단지 상세 페이지의 "이 지역 관련 광고(in_feed)" 섹션을 **공인중개사 추천 섹션**으로 교체한다.

단지별로 담당 공인중개사 최대 2명을 배정하고, 방문자가 전화 문의 링크를 통해 직접 연락할 수 있게 한다.  
운영자는 `/admin/realtors`에서 공인중개사를 등록·수정·삭제하고, 단지별 배정 UI를 통해 매핑을 관리한다.

---

## Background

현재 단지 상세 페이지(`src/app/complexes/[id]/page.tsx`)에는 `in_feed` 광고 섹션이 있다.  
이 섹션을 제거하고 공인중개사 추천 카드로 대체한다.

광고주 입장에서 "공인중개사 추천 광고"이지만, 사용자 경험 상으로는 광고처럼 보이지 않게 한다.  
UI는 "이 단지 담당 공인중개사" 타이틀과 함께 공인중개사 카드(이름·상호·전화·소개)를 표시한다.

---

## Scope

### In Scope

1. **DB 마이그레이션**
   - `realtors` 테이블: id, name, agency_name, phone, description, license_no (공인중개사 자격번호), image_url, is_active, created_at, updated_at
   - `realtor_assignments` 테이블: id, realtor_id (FK → realtors), complex_id (FK → complexes), display_order (1 or 2), created_at
   - RLS: realtors는 누구나 읽기 가능, 쓰기는 admin만. realtor_assignments도 동일.
   - 단지당 최대 2명 제약: CHECK 또는 애플리케이션 레벨

2. **어드민 CRUD — `/admin/realtors`**
   - 공인중개사 목록 (페이지네이션)
   - 등록 폼: name, agency_name, phone, description, license_no, image_url, is_active
   - 수정 폼
   - 삭제 (soft: is_active=false 또는 hard delete)
   - Server Actions: `createRealtor`, `updateRealtor`, `deleteRealtor`

3. **단지 배정 UI — `/admin/realtors/[id]/assignments` 또는 `/admin/realtors` 내 인라인**
   - 특정 공인중개사에 단지 배정 (complex 검색 → 추가)
   - 배정 해제
   - display_order 설정 (1 또는 2)

4. **아파트 상세 페이지 "이 단지 담당 공인중개사" 섹션**
   - `src/app/complexes/[id]/page.tsx`에서 `in_feed` 광고 섹션 교체
   - `getRealtorsByComplexId(complexId, supabase)` 데이터 레이어 함수
   - `RealtorCard` 컴포넌트: 사진·이름·상호·전화·소개
   - 전화 문의 링크: `tel:` scheme
   - 배정된 공인중개사가 없으면 섹션 자체를 숨김 (광고 없을 때 패턴 동일)

### Out of Scope

- 광고비 처리, 결제 연동
- 공인중개사 자격 자동 검증 (license_no는 입력란만 제공)
- 공인중개사 자체 로그인/포털
- 단지 상세 페이지 외 다른 위치 노출 (랜딩, 지도 등)
- 클릭·임프레션 통계 (Phase 16 `ad_events` 패턴 별도 필요 시 다음 Phase)

---

## DB Changes

```sql
-- 공인중개사 마스터
CREATE TABLE realtors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  agency_name   text NOT NULL,
  phone         text NOT NULL,
  description   text,
  license_no    text,
  image_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 단지-공인중개사 배정
CREATE TABLE realtor_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realtor_id     uuid NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
  complex_id     uuid NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  display_order  smallint NOT NULL DEFAULT 1 CHECK (display_order IN (1, 2)),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(complex_id, display_order)   -- 단지당 1번, 2번 각 1명
);

-- RLS
ALTER TABLE realtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtor_assignments ENABLE ROW LEVEL SECURITY;

-- 공개 읽기
CREATE POLICY "realtors_select_all" ON realtors FOR SELECT USING (true);
CREATE POLICY "realtor_assignments_select_all" ON realtor_assignments FOR SELECT USING (true);
```

---

## Architecture Decisions

| ID | Decision |
|----|----------|
| D-01 | `in_feed` 광고 섹션은 단지 상세에서 완전 제거. `getActiveAds('in_feed')` 호출도 제거 |
| D-02 | `realtors`/`realtor_assignments` 쿼리는 서버 컴포넌트(RSC) 에서만 — `createReadonlyClient()` 사용 |
| D-03 | 어드민 write는 기존 `requireAdmin()` + `createSupabaseAdminClient()` 패턴 동일 |
| D-04 | 단지 배정 UI는 `/admin/realtors` 페이지 내 인라인 (별도 라우트 불필요) |
| D-05 | `RealtorCard` — `'use client'` 불필요, 순수 표현 컴포넌트 (RSC) |
| D-06 | 이미지 없을 때 fallback: 이니셜 기반 텍스트 아바타 (Supabase 이미지 있으면 표시) |
| D-07 | `tel:` 링크는 `<a href="tel:...">` — Next.js `Link` 불필요 |
| D-08 | Supabase MCP로 마이그레이션 적용 — `npm run db:push` 금지 |

---

## Wave Structure

| Wave | Plan | Description |
|------|------|-------------|
| 0 | 18-00 | DB 마이그레이션 (realtors + realtor_assignments + RLS) — BLOCKING |
| 1 | 18-01 | 데이터 레이어 (realtors.ts) + Server Actions (realtor-actions.ts) + 테스트 |
| 2 | 18-02 | 어드민 CRUD UI (`/admin/realtors`) |
| 3 | 18-03 | 단지 상세 섹션 교체 (RealtorCard + page.tsx 연결) |

Plans 18-01, 18-02, 18-03은 Wave 0(마이그레이션) 완료 후 순차 실행.

---

## Reference Patterns

- `src/lib/auth/ad-actions.ts` — requireAdmin, createAdCampaign 패턴 참고
- `src/lib/data/ads.ts` — getActiveAds 데이터 레이어 패턴 참고
- `src/components/admin/AdCreateForm.tsx` — 어드민 폼 UI 패턴 참고
- `src/app/admin/ads/page.tsx` — 어드민 목록+액션 패턴 참고
- `src/app/complexes/[id]/page.tsx` — 단지 상세 섹션 추가/교체 위치
- `src/components/ads/AdminCampaignActions.tsx` — 인라인 액션 버튼 패턴
