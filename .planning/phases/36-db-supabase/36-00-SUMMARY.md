---
phase: 36-db-supabase
plan: "00"
subsystem: database
tags: [supabase, changbuletter, site-scoping, rls-prep, migration-drift]

requires: []
provides:
  - site_id CHECK 제약 2건(favorites_site_id_check, ad_campaigns_site_id_check)에 'changbuletter' 허용
  - profiles_role_check에 'cbl_editor' 허용 — 창부레터 편집자용 신규 role
  - 창부레터 저장소가 site_id='changbuletter' / role='cbl_editor'를 사용 가능한 상태
affects: [36-01, 36-02]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - supabase/migrations/20260730000001_cbl_site_id_role_check.sql
  modified: []

key-decisions:
  - "적용 경로가 `npm run db:push`가 아니라 `execute_sql`(단일 트랜잭션) + `migration repair --status applied 20260730000001`이었다. plan Task 2의 `<resume-signal>`은 drift 발견 이전 전제였고, db:push가 실제로 실패하는 것이 확인돼 사용자 결정으로 경로를 변경했다. 결과는 db:push와 동일 — 스키마 적용 + 파일명과 같은 버전으로 원장 기록 → 신규 drift 없음"
  - "`src/app/admin/layout.tsx`를 수정하지 않았다. `role in ('admin','superadmin')` 게이트를 그대로 두는 것이 권한 격리의 구현이다(D-02)"
  - "CLI가 제안한 `migration repair --status reverted <18건>`을 실행하지 않았다. 그 18건 중 6건은 로컬 파일이 없는 고유 스키마 변경이라, reverted 처리하면 유일한 기록이 사라진다"

patterns-established: []

requirements-completed: [CBL-01, CBL-02]

duration: ~50min (drift 조사 포함 — 계획 대비 초과분 전부 drift 진단)
completed: 2026-07-30
---

# Phase 36-00: CBL site_id·role CHECK 제약 확장 Summary

**CHECK 제약 3건 확장 완료. 기존 행 무변경. 다만 실행 중 마이그레이션 원장 drift가 발견돼 적용 경로를 변경했고, 저장소에 없는 프로덕션 스키마 6건이라는 별도 사안을 발견했다.**

## 적용 결과 (라이브 검증)

```
favorites_site_id_check    → CHECK ((site_id = ANY (ARRAY['danjiondo','realtrade-story','changbuletter'])))
ad_campaigns_site_id_check → CHECK ((site_id = ANY (ARRAY['danjiondo','realtrade-story','changbuletter'])))
profiles_role_check        → CHECK ((role = ANY (ARRAY['user','admin','superadmin','advertiser','cbl_editor'])))

행수 전후 불변: favorites 4→4, ad_campaigns 9→9, profiles 5→5
convalidated = true (3/3)
최종 판정: PASS
```

`src/app/admin/layout.tsx` 무변경 확인 — 창부레터 `cbl_editor`는 bds 어드민 콘솔에 구조적으로 진입 불가.

## 적용 경로 변경 — `npm run db:push` 대신 `execute_sql` + `repair`

Task 2 실행 중 executor가 마이그레이션 원장 drift를 발견했고, 검증 결과 사실이었다.

**증상**: 로컬 마이그레이션 17개 파일이 "pending"(local만 있고 remote 매칭 없음)으로 표시되는데,
**전부 이미 적용돼 있었다.**

| 검증 항목 | 결과 | 해당 마이그레이션 |
|---|---|---|
| `hagwon_db` | 4,601행 | `20260619000001~3` |
| `complex_area_types` | 3,472행 | `20260618000001`, `20260619000000`, `20260624000001` |
| `transactions.area_type_id` + `auto_assign_area_type` 트리거 | 존재 | `20260624000002` |
| `find_nearby_similar_complexes` | 존재 | `20260708000001` |
| `recommend_hagwon_candidates` | 존재 | `20260619000002/3` |
| `transactions_valid_dealtype_date_idx` | 존재 | `20260728120000` |
| `favorites.site_id`, `ad_campaigns.site_id` | 존재 | `20260715000001` |
| `refresh_complex_price_stats` (3.3058 공식) | APPLIED | `20260618000001` |
| `invest_prediction_ranking` (preferred_model) | APPLIED | `20260618000002` |
| `hagwon_db_subject_category_check` (other_language) | APPLIED | `20260619000002` |
| `complex_transactions_for_chart` (exclusive_area_m2) | APPLIED | `20260624000003` |
| `auto_assign_area_type` (0.3 임계) | APPLIED | `20260707000000` |

**원인**: 6/18 이후 로컬 파일마다 **시각이 다른 remote 짝**이 있다
(로컬 `20260619000000` ↔ remote `20260619062830`, 로컬 `20260715000001` ↔ remote `20260715030221`).
파일명이 아니라 **적용 시각을 버전으로 기록하는 경로**(MCP `apply_migration` 또는 대시보드
SQL 에디터)로 스키마가 적용돼 왔다. 스키마는 최신이고 CLI 원장만 뒤처진 상태.

**조치 순서**:
1. 위 검증으로 17건 전부 적용 확인 → `migration repair --status applied` 로 로컬 14개 버전 기록
2. `db push --dry-run` → `LegacyDbPushMissingLocalError` (remote 전용 18건이 로컬 파일과 미매칭)
3. 그 18건의 `supabase_migrations.schema_migrations.statements` 조회 → 분류 (아래 참고)
4. 사용자 결정으로 `execute_sql` 단일 트랜잭션 적용 + `migration repair --status applied 20260730000001`

이 경로는 db:push와 결과가 동일하고(스키마 적용 + 파일명과 같은 버전 기록) **신규 drift를
만들지 않는다.**

---

## 🔴 후속 작업: 저장소에 없는 프로덕션 스키마 6건

**Phase 36 범위 밖. 별도 처리 필요.**

remote 전용 18개 버전을 분류한 결과, 12건은 로컬 파일의 중복 기록이지만 **6건은 로컬
마이그레이션 파일이 아예 없는 고유 스키마 변경**이다.

| remote 버전 | name | 내용 | 위험 |
|---|---|---|---|
| `20260728074553` | `realtrade_story_ads_admin` | `site_admin_roles` 테이블 + `ad_campaigns`/`presale_discoveries`/`new_listings` RLS | **보안 관련 테이블이 저장소에 없음.** realtrade-story 소관이라 그쪽 맥락 필요 |
| `20260618093403` | `fix_security_definer_search_path_v2` | `check_gps_proximity` 등 SECURITY DEFINER 함수에 `search_path=''` 고정 | **보안 하드닝이 저장소에 없음.** 로컬의 `20260520000003`은 `add_activity_points`만 다룸 |
| `20260618085750` | `perf_review_avg_rpc` | `get_complex_review_avg(uuid)` 함수 | 리뷰 평균 RPC 유실 |
| `20260625063824` | `cardnews_payloads_storage_policies` | `cardnews-payloads` 버킷 RLS 정책 | 카드뉴스 GitHub Actions 다운로드 경로 |
| `20260618085906` | `rls_regional_income_area_types_ad_events` | `regional_income` 등 RLS 활성화·정책 | 테이블 파일(`20260602000001`)은 있으나 정책은 없음 |
| `20260618075929` | `phase28_route_rpc` | `recommend_hagwon_candidates` 초기판 | 후속 버전(`20260619000002/3`)에 덮였을 가능성 — 확인 필요 |

**영향**: `supabase db reset` 또는 새 환경 구축 시 위 객체들이 재현되지 않는다.

**하지 말아야 할 것**: CLI가 제안하는 `migration repair --status reverted <18건>`.
그러면 이 6건의 유일한 기록이 원장에서 사라져 문제를 숨긴다.

**권장 처리**: 원장의 `statements`에서 6건을 추출해 로컬 마이그레이션 파일로 복원 → 커밋 →
그 뒤에 중복 12건만 reverted 처리. 또는 `supabase db pull` 검토(단 대용량 squash 위험).

## 🟡 후속 작업: 로컬 마이그레이션 타임스탬프 중복 3쌍

같은 버전 접두어를 가진 파일이 2개씩 존재한다. CLI는 버전 단위로 원장을 관리하므로
**한쪽만 기록되면 다른 쪽이 영구히 추적 불가**가 된다.

| 중복 버전 | 파일 |
|---|---|
| `20260618000001` | `_complex_area_types.sql` / `_fix_avg_sale_per_pyeong_formula.sql` |
| `20260618000002` | `_area_type_chart_rpc.sql` / `_fix_prediction_model_priority.sql` |
| `20260619000002` | `_phase28_subject_v2.sql` / `_recommend_hagwon_candidates_rpc.sql` |

이번에는 두 파일 모두 적용된 상태여서 실害가 없었으나, 향후 리네이밍 필요.

## 창부레터 저장소에 전달할 사항

- `site_id='changbuletter'` insert 가능 (`favorites`, `ad_campaigns`)
- `role='cbl_editor'` 설정 가능. **부여는 `service_role`로 수행** (일반 사용자가 자기 role을
  올릴 수 없어야 함)
- `cbl_editor`는 bds 어드민 콘솔(`/admin/*`)에 진입 불가 — 의도된 격리
- 테이블 5개는 아직 없음 (36-01), RLS도 아직 없음 (36-02)
