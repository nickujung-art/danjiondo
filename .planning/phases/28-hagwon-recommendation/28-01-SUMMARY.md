---
plan: 28-01
phase: 28-hagwon-recommendation
status: complete
completed: 2026-06-18
---

# Summary: 28-01 DB 스키마 + 테스트 스캐폴드

## What Was Built

Phase 28 학원 추천 시스템의 DB 기반을 구축했다.

- **hagwon_db 테이블**: aca_asnum UNIQUE, PostGIS geometry(Point, 4326) location 컬럼, age_groups text[], fee_tier/subject_category/teaching_style CHECK 제약, RLS 2정책
- **user_child_profiles 테이블**: auth.users 외래키 CASCADE, age_group CHECK 제약, RLS owner-all 정책
- **recommend_hagwons RPC**: ST_DWithin(2000m) + age_groups @> + subject_category 필터, 거리(40%)+인기도(30%)+tier(30%) 가중치 스코어링, anon/authenticated GRANT EXECUTE
- **인덱스 3개**: GiST(location), B-tree(is_active WHERE true), GIN(age_groups)
- **테스트 스캐폴드 2개**: hagwon-recommend.test.ts (6 todo), hagwon.test.ts (6 todo) — Wave 4(28-04)에서 GREEN 예정

## Key Decisions

- `supabase db push` CLI 대신 MCP apply_migration 사용 — 로컬 중복 타임스탬프 파일(20260618000001_fix_*)로 인한 CLI 충돌 우회
- PostGIS extension은 기존 DB에 활성화됨 — CREATE EXTENSION 생략

## Self-Check: PASSED

- ✅ hagwon_db, user_child_profiles 테이블 DB 존재 확인 (MCP execute_sql)
- ✅ idx_hagwon_db_location, idx_hagwon_db_is_active, idx_hagwon_db_age_groups 인덱스 존재
- ✅ recommend_hagwons 문자열 SQL 파일에 포함 (grep 확인)
- ✅ RLS CREATE POLICY 3개 포함
- ✅ 테스트 스캐폴드 2개 실행 시 12 todo (실패 없음)

## key-files

- created:
  - supabase/migrations/20260619000001_phase28_hagwon_system.sql
  - src/lib/hagwon-recommend.test.ts
  - src/app/actions/hagwon.test.ts
