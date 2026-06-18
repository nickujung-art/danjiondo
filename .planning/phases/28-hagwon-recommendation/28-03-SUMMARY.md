---
plan: 28-03
phase: 28-hagwon-recommendation
status: complete
completed: 2026-06-18
---

# Summary: 28-03 Groq 분류 + Naver 인기도 스크립트

## What Was Built

- **scripts/classify-hagwon-groq.ts**: Groq llama-3.1-8b-instant 학원 분류 배치
  - json_object 모드로 age_groups / subject_category / teaching_style 분류
  - VALID_AGE/CAT/STY 허용목록으로 모델 출력 검증 (Pitfall 5)
  - try/catch → DEFAULT_RESULT fallback (스크립트 중단 방지)
  - concurrency=3, 300ms 딜레이, 50건 배치 upsert
  - --dry-run(첫 3건 출력) / --missing-only(기본) / --limit=N

- **scripts/collect-hagwon-popularity.ts**: Naver 블로그 인기도 + fee_tier 분위
  - Step 1: Naver 블로그 검색 total 수집, log1p(count)/log1p(max) 정규화 → popularity_score
  - Step 2: fee_amount IS NOT NULL 전체를 DESC 정렬 후 분위 계산 (상위30%=premium, 30~80%=standard, 나머지=budget)
  - 100ms 딜레이, 50건 upsert 배치
  - --dry-run / --skip-naver(fee_tier만 재계산) / --limit=N

## Self-Check: PASSED

- ✅ grep "llama-3.1-8b-instant" ≥ 1, "json_object" ≥ 1, "} catch" ≥ 1, "VALID_AGE" ≥ 1
- ✅ grep "log1p\|popularity_score" ≥ 1, "fee_tier\|premium\|standard\|budget" ≥ 3
- ✅ npm run build 성공

## key-files

- created:
  - scripts/classify-hagwon-groq.ts
  - scripts/collect-hagwon-popularity.ts

## 실행 순서 (28-02 완료 후)

1. `npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts --dry-run`
2. `npx tsx --env-file=.env.local scripts/classify-hagwon-groq.ts`
3. `npx tsx --env-file=.env.local scripts/collect-hagwon-popularity.ts`
