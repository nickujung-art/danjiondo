---
phase: 10-edu-enhancement
plan: "00"
wave: 0
status: complete
completed: 2026-05-15
---

# Wave 0 Summary

## What Was Built

- `supabase/migrations/20260515000001_school_districts.sql`: school_districts + school_district_schools 테이블, PostGIS GIST 인덱스, RLS (public read + service_role write), hagwon_score_percentile_by_si RPC 함수
- `src/lib/hagwon-category.ts`: classifyHagwon(), walkColor(), WALK_COLOR_HEX 순수 유틸
- `src/lib/hagwon-category.test.ts`: 9/9 GREEN
- `src/lib/data/facility-edu.test.ts`: 4/4 RED (Wave 2에서 GREEN 예정)

## DB State

- school_districts 테이블: remote에 존재 확인
- school_district_schools 테이블: remote에 존재 확인
- hagwon_score_percentile_by_si 함수: remote에 존재 확인

## Migration Notes

migration repair 필요했음: 이전 세션에서 MCP로 직접 적용된 원격 마이그레이션(20260513065649 등)과 로컬 마이그레이션 히스토리 불일치. `supabase migration repair --status reverted`로 원격 전용 항목 처리, `--status applied`로 이미 적용된 로컬 항목 처리 후 push 성공.

## Tests

| File | Status |
|------|--------|
| hagwon-category.test.ts | 9/9 GREEN |
| facility-edu.test.ts | 4/4 RED (정상 — Wave 2에서 GREEN) |

## Next

Wave 1: `scripts/import-school-districts.ts` 작성 → 학구도 SHP/CSV → school_districts + school_district_schools 적재
