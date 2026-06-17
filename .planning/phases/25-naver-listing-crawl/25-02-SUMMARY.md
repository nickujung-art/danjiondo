---
phase: 25-naver-listing-crawl
plan: "02"
subsystem: scripts/data-ingestion
tags: [naver-land, listing-prices, batch-script, crawling]
dependency_graph:
  requires:
    - 25-01 (fetchNaverListings, ArticleListItem in src/services/naver-land.ts)
    - 25-00 (RESEARCH.md, listing_prices 테이블 스키마)
  provides:
    - scripts/crawl-naver-listings.ts (호가 수집 → listing_prices upsert)
  affects:
    - listing_prices 테이블 (naver source 행 추가)
tech_stack:
  added: []
  patterns:
    - 동시성 패턴: processInChunks (CONCURRENCY=2, map-naver-complexes.ts 동일 패턴)
    - 중앙값 평당가: priceMan / (areaM2 / 3.3058), sorted array median
    - upsert onConflict: complex_id,recorded_date,source (당일 재실행 덮어쓰기)
key_files:
  created:
    - scripts/crawl-naver-listings.ts
  modified: []
decisions:
  - "MIN_ITEMS=3: 매물 3건 미만 단지 skip — 중앙값 신뢰도 부족"
  - "MAX_PAGES=3: 최대 3페이지 수집 — 최신 매물 중심, rate limit 고려"
  - "created_by=null: service_role 배치 실행, FK nullable 허용"
  - "price_per_py BETWEEN 100 AND 99999: DB CHECK 조건 사전 필터로 upsert 오류 방지"
metrics:
  duration: "~5분"
  completed: "2026-06-17"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 25 Plan 02: crawl-naver-listings.ts 구현 Summary

naver_complex_no 매핑 단지의 현재 매물 호가를 수집하여 listing_prices 테이블에 source='naver'로 upsert하는 배치 스크립트 구현.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | crawl-naver-listings.ts 크롤링 스크립트 구현 | 442f335 | scripts/crawl-naver-listings.ts |

## What Was Built

`scripts/crawl-naver-listings.ts` — 네이버 부동산 매물 호가 수집 배치 스크립트:

1. `complexes WHERE naver_complex_no IS NOT NULL` 조회
2. 각 단지에서 `fetchNaverListings(complexNo)` 호출 (최대 3페이지)
3. 평당가(만원/평) = `priceMan / (areaM2 / 3.3058)` 계산
4. 유효 매물 수 < `MIN_ITEMS(3)` 시 skip
5. 중앙값 평당가 계산
6. `listing_prices` upsert (`source='naver'`, `recorded_date=오늘`)

실행 방법:
```bash
npx tsx scripts/crawl-naver-listings.ts [--dry-run] [--limit=50]
```

## Verification Results

- `--dry-run --limit=1` 실행: `[crawl-naver-listings] 시작 — 2026-06-17 (dry-run: true)` 정상 출력
- `source: 'naver'` 구문 확인
- `onConflict: 'complex_id,recorded_date,source'` 구문 확인
- `MIN_ITEMS = 3` 구문 확인
- `npm run lint` 통과 (exit code 0)

## Deviations from Plan

None - 계획 명세대로 정확히 구현됨.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-25-02-01 | `price_per_py >= 100 && price_per_py <= 99999` 조건으로 극단값 삽입 차단 |
| T-25-02-03 | `SLEEP_MS=1500`, `CONCURRENCY=2` rate limit 제한 |
| T-25-02-04 | 환경변수 키 console 출력 없음, `.env.local` gitignore |

## Known Stubs

None.

## Self-Check: PASSED

- `scripts/crawl-naver-listings.ts` 존재 확인
- 커밋 442f335 존재 확인
- `--dry-run --limit=1` 정상 실행
- lint 통과
