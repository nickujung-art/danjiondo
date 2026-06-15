# Phase 18 — 공인중개사 추천 섹션 ✅ 완료 (2026-05)

## 구현 내용
- DB: `realtors` 테이블 (name, agency_name, phone, description, license_no, image_url, is_active)
- DB: `realtor_assignments` 테이블 — `UNIQUE(complex_id, display_order)` 로 단지당 최대 2명 DB 레벨 강제
- RLS: 두 테이블 모두 공개 SELECT, admin만 쓰기
- 어드민 `/admin/realtors`: CRUD (목록·등록·수정·삭제), 단지 배정 UI 인라인 포함
- `RealtorCard` RSC 컴포넌트: tel: URI 링크, 이미지 없을 때 이니셜 아바타 fallback
- 단지 상세 페이지: `in_feed` 광고 섹션 완전 제거 → 공인중개사 카드 섹션으로 교체
- 배정된 공인중개사 없으면 섹션 자체 숨김

## 특이사항 / 유지보수
- `image_url`은 외부 URL 직접 사용 → `next.config.ts`에 허용 도메인 추가 권장 (T-18-03-02)
- 마이그레이션: `supabase/migrations/20260528000001_phase18_realtors.sql`
- 핵심 파일: `src/lib/data/realtors.ts`, `src/components/realtors/RealtorCard.tsx`, `src/app/admin/realtors/page.tsx`
- `supabase db query --linked --file` 로 적용 (`db push` 미사용)
