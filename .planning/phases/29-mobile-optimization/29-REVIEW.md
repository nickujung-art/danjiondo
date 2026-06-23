---
phase: 29-mobile-optimization
status: issues_found
reviewed_at: 2026-06-23
depth: standard
files_reviewed: 14
blocker: 1
warning: 6
info: 7
---

# Phase 29 코드 리뷰 — 모바일 최적화

## BLOCKER

### CR-01: JSON-LD Stored XSS — `dangerouslySetInnerHTML` + `JSON.stringify` 미이스케이프
**파일:** `src/app/complexes/[id]/page.tsx`

`JSON.stringify`는 `</script>` 시퀀스를 이스케이프하지 않아 DB에 저장된 문자열에 해당 패턴이 포함된 경우 임의 JS 실행 가능.

```tsx
// 수정: .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
```

## WARNING

### WR-01: AppHeader 알림 버튼 비기능적
`src/components/layout/AppHeader.tsx` — onClick/href 없는 빈 버튼.

### WR-02: `aria-labelledby` ID 불일치
`src/app/rankings/page.tsx` — SectionHeader에 id prop 없어 스크린 리더가 제목 참조 불가.

### WR-03: CompareFloatingBar localStorage 타입 검증 없음
`src/components/complex/CompareFloatingBar.tsx` — JSON.parse 결과 Array 검증 없음.

### WR-04: HagwonRecommendSheet ageGroup 미선택 submit 가능
`src/components/complex/HagwonRecommendSheet.tsx` — handleAgeNext()에 가드 없음.

### WR-05: `console.error` 프로덕션 잔존
`src/components/complex/HagwonRecommendSheet.tsx:386`

### WR-06: `supabase as any` 타입 우회
`src/app/rankings/page.tsx` — 런타임 shape 불일치 위험.

## INFO

- IN-01: AppHeader 불필요한 `'use client'` → Server Component 전환 가능
- IN-02: BottomTabBar `aria-current="page"` 미적용
- IN-03: `SCHOOL_TYPE_LABEL` 두 파일에 중복 정의
- IN-04: `CAFE_URL` 하드코딩 (환경 변수 `NAVER_TARGET_CAFE` 존재)
- IN-05: `key={i}` 인덱스 키 (EducationCard, HagwonRecommendSheet, rankings)
- IN-06: IIFE async 패턴 → 명명 함수 권장
- IN-07: `safe-area-inset-bottom` 폴백 불일치 (BottomSheet: 20px vs 나머지: 0px)
