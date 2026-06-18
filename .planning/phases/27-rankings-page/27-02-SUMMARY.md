# Plan 02 Summary — 데이터 레이어

**완료일:** 2026-06-18
**파일:** `src/lib/data/rankings-page.ts`

## 구현된 exports

| export | 설명 |
|--------|------|
| `REGION_TABS` | 7개 탭 (창원전체·의창·성산·마산합포·마산회원·진해·김해) |
| `getRecentDailyFeed(supabase, days=7)` | 2-query, ±5㎡ is_new_high |
| `getChampionComplexes(supabase)` | 90일 거래량×평당가 점수 |
| `getRegionalPriceRanking(supabase, sggCodes)` | 평당가 TOP 20 |
| `getWeeklyHighlights(supabase)` | 최고가TOP3·거래량TOP5·급등TOP3 |
| Types | `DailyFeedGroup`, `RegionalRankingRow`, `ChampionComplexes`, `WeeklyHighlights` |

## 핵심 결정

- `transactions.id` bigint → `String()` 변환 처리
- `cancel_date IS NULL AND superseded_by IS NULL` 전체 쿼리 적용
- histByComplex Map: 자기 자신 제외 (`h.id !== txId`)
- `tsc --noEmit` 오류 없음
