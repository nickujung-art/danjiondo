---
phase: 15-community-gamification
plan: "01"
subsystem: database
tags: [migration, gamification, rls, triggers, supabase]
dependency_graph:
  requires: []
  provides:
    - "profiles.member_tier 5단계 CHECK 제약"
    - "activity_logs.reason CHECK 확장(favorite/daily_login)"
    - "add_activity_points() 5단계 임계값"
    - "award_review_points() 50점"
    - "award_comment_points() 10점"
    - "award_favorite_points() 트리거"
    - "award_daily_login_points() SECURITY DEFINER boolean 함수"
    - "cafe_articles 테이블 + RLS"
  affects:
    - "Wave 2 서비스 계층 (15-02)"
    - "Wave 3 UI 계층 (15-03)"
tech_stack:
  added: []
  patterns:
    - "SECURITY DEFINER + SET search_path = '' (보안 패치 패턴 유지)"
    - "REVOKE EXECUTE FROM anon"
    - "KST 타임존 기준 일일 중복 방지"
    - "RLS: public SELECT + service_role INSERT"
key_files:
  created:
    - supabase/migrations/20260522000001_phase15_tier_extension.sql
  modified: []
decisions:
  - "award_daily_login_points()는 add_activity_points()를 호출하지 않고 직접 INSERT/UPDATE — SECURITY DEFINER 체인 내 auth.uid() NULL 문제 회피"
  - "award_daily_login_points()에 REVOKE EXECUTE FROM anon 적용 (T-15-DB-02)"
  - "cafe_articles는 기존 cafe_posts(NLP 결과)와 별개 테이블 유지"
metrics:
  duration: "~5분"
  completed: "2026-05-22"
  tasks_completed: 1
  files_changed: 1
---

# Phase 15 Plan 01: DB 마이그레이션 — 5단계 등급 체계 + cafe_articles

5단계 멤버 등급(브론즈/실버/골드/플래티넘/다이아) DB 확장, 새 포인트 임계값(100/500/2000/5000)/배점(후기 50, 댓글 10, 즐겨찾기 5, 일일 로그인 1), 즐겨찾기·일일 로그인 트리거 추가, cafe_articles 테이블 신설.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| T-15-01 | Phase 15 DB 마이그레이션 | 4f4b0be | supabase/migrations/20260522000001_phase15_tier_extension.sql |

## What Was Built

### 스키마 변경

**1. member_tier CHECK 제약 확장 (3단계 → 5단계)**
- `profiles_member_tier_check`: `'bronze', 'silver', 'gold', 'platinum', 'diamond'`

**2. activity_logs reason CHECK 확장**
- 기존: `review, comment, gps_verify, daily_visit, first_favorite`
- 추가: `favorite, daily_login`

**3. add_activity_points() 5단계 임계값 재정의**
- `>= 5000 → diamond`
- `>= 2000 → platinum`
- `>= 500 → gold`
- `>= 100 → silver`
- `else → bronze`
- SECURITY DEFINER + SET search_path = '' + auth.uid() IS NULL 차단 유지

**4. 포인트 배점 변경**
- `award_review_points()`: 10 → 50점
- `award_comment_points()`: 3 → 10점

**5. 즐겨찾기 포인트 트리거 (신규)**
- `award_favorite_points()`: user_favorites INSERT 후 +5점
- `favorites_award_points` 트리거: user_favorites AFTER INSERT

**6. 일일 로그인 포인트 함수 (신규, 핵심)**
- `award_daily_login_points(p_user_id uuid) RETURNS boolean`
- KST 기준 당일 중복 방지: `(created_at AT TIME ZONE 'Asia/Seoul')::date`
- `add_activity_points()` 호출 없이 직접 INSERT + UPDATE (auth.uid() NULL 우회)
- `REVOKE EXECUTE FROM anon` 적용
- 반환값: `true` = 지급됨, `false` = 당일 이미 지급됨

**7. cafe_articles 테이블 신설**
- `naver_article_id TEXT NOT NULL UNIQUE` (item.link URL)
- `complex_id UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE`
- RLS: SELECT public, INSERT service_role only
- `cafe_articles_complex_id_idx(complex_id, published_at DESC)` 인덱스

## Deviations from Plan

None — 계획대로 정확히 실행됨.

## Security Notes

| Threat ID | Mitigation |
|-----------|-----------|
| T-15-DB-01 | add_activity_points()에 auth.uid() IS NULL 체크 유지 |
| T-15-DB-02 | award_daily_login_points()에 SECURITY DEFINER + anon REVOKE 적용 |
| T-15-DB-03 | cafe_articles RLS: SELECT public, INSERT service_role only; naver_article_id UNIQUE |

## Known Stubs

없음.

## Threat Flags

없음 — 모든 신규 trust boundary가 PLAN.md threat_model에 명시되어 있음.

## Self-Check: PASSED

- [x] `supabase/migrations/20260522000001_phase15_tier_extension.sql` 존재
- [x] 'diamond', 'platinum' in member_tier CHECK
- [x] award_daily_login_points SECURITY DEFINER 함수 존재
- [x] award_daily_login_points가 add_activity_points() 호출 없이 직접 INSERT/UPDATE
- [x] cafe_articles 테이블 + RLS 정책 포함
- [x] 커밋 4f4b0be 존재
