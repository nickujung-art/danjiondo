---
plan: 28-04
phase: 28-hagwon-recommendation
status: complete
completed: 2026-06-18
---

# Summary: 28-04 Server Actions + 데이터 레이어

## What Was Built

- **src/services/neis-hagwon.ts**: 타입 계약 파일
  - AgeGroup / SubjectCategory / TeachingStyle / FeeTier union 타입
  - HagwonResult / RecommendInput / ChildProfile 인터페이스 export

- **src/lib/data/hagwon-recommend.ts**: DB 쿼리 레이어
  - `fetchHagwonRecommendations(supabase, input)` → recommend_hagwons RPC 호출, 에러 시 []
  - `fetchChildProfile(supabase, userId)` → maybeSingle, 에러 시 null

- **src/app/actions/hagwon.ts**: Server Actions 3개
  - `recommendHagwons`: zod min(-90)/max(90) lat/lng 검증, RPC 호출, Groq llama-3.1-8b-instant 코멘트
  - `saveChildProfile`: auth.getUser() guard → upsert(기존) or insert(신규)
  - `loadChildProfile`: auth.getUser() guard → fetchChildProfile

- **테스트 12개 GREEN** (scoring 6개 + actions 6개)

## Self-Check: PASSED

- ✅ grep "recommend_hagwons\|createSupabaseServerClient" hagwon.ts ≥ 2
- ✅ grep "z.number().min(-90)" hagwon.ts ≥ 1
- ✅ npm run test -- --run hagwon-recommend.test.ts hagwon.test.ts: 12 passed
- ✅ npm run build 성공

## key-files

- created:
  - src/services/neis-hagwon.ts
  - src/lib/data/hagwon-recommend.ts
  - src/app/actions/hagwon.ts
- modified:
  - src/lib/hagwon-recommend.test.ts (todo → 6 passing)
  - src/app/actions/hagwon.test.ts (todo → 6 passing)
