# Plan 01 Summary — 스키마 확인

**완료일:** 2026-06-18

## 결과

transactions 테이블 8개 필수 컬럼 전부 확인 (DB 마이그레이션 불필요):

| 컬럼 | 타입 |
|------|------|
| id | bigint |
| complex_id | uuid |
| area_m2 | numeric |
| price | bigint |
| deal_type | USER-DEFINED (enum) |
| cancel_date | date |
| superseded_by | bigint |
| deal_date | date |

## is_new_high 구현 방식 (→ Plan 02 전달)

TypeScript 2-query 방식:
1. Query 1: 최근 피드 거래 조회
2. Query 2: 단지별 전체 이력 (limit 10000)
3. `Math.abs(h.area_m2 - area_m2) <= 5` 로 같은 면적대 비교
4. 비교 대상 없으면 `is_new_high = false` (보수적 처리)
