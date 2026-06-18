---
plan: 28-05
phase: 28-hagwon-recommendation
status: complete
completed: 2026-06-18
---

# Summary: 28-05 HagwonRecommendSheet UI

## What Was Built

- **src/components/complex/HagwonRecommendSheet.tsx**
  - createPortal 기반 3단계 Bottom Sheet
  - Step 1: 자녀 연령(AgeGroup 칩) + 과목(복수선택 칩) + 수강료 선호(3버튼)
  - Step 2: CSS animation 로딩 스피너
  - Step 3: Groq 코멘트(회색 박스) + HagwonCard 순위 목록 (1~10위) + '조건 다시 설정' 버튼

- **src/components/complex/EducationCard.tsx 수정**
  - Props: `lat?`, `lng?` 추가
  - HagwonSection: `lat`, `lng` prop 전달
  - HagwonSection 내부: lat/lng가 있을 때 '내 아이 맞춤 학원 추천 받기' 버튼 렌더링
  - showRecommend state → HagwonRecommendSheet 마운트/언마운트

- **src/app/complexes/[id]/page.tsx 수정**
  - FacilityEduSection: `lat?`, `lng?` prop 추가
  - 호출부: `complex.lat ?? undefined`, `complex.lng ?? undefined` 전달

## Self-Check: PASSED

- ✅ grep "HagwonRecommendSheet\|lat.*lng" EducationCard.tsx
- ✅ grep "complex.lat.*complex.lng" page.tsx
- ✅ npm run build 성공
- ✅ npm run test: 12 passed

## key-files

- created:
  - src/components/complex/HagwonRecommendSheet.tsx
- modified:
  - src/components/complex/EducationCard.tsx
  - src/app/complexes/[id]/page.tsx

## human-verify

단지 상세 → 학원·교육 탭 → '내 아이 맞춤 학원 추천 받기' 버튼 확인
(lat/lng 없는 단지는 버튼 숨김 — 정상 동작)
