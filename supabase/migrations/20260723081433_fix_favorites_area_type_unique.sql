-- favorites_user_id_complex_id_site_id_key가 area_type_id를 포함하지 않아서
-- (user_id, complex_id, site_id) 조합이 이미 즐겨찾기(area_type_id=null)로 점유된 경우
-- 평형별 알림(area_type_id=구체값) INSERT가 전부 유니크 제약 위반(23505)으로 실패하는 버그 수정.
-- realtrade-story 03-08 Task 4 라이브 검증 중 재현: 하트로 즐겨찾기한 단지에 알림 조건을
-- 저장하면 항상 500 에러(addAreaTypeAlert failed: duplicate key value violates unique
-- constraint "favorites_user_id_complex_id_site_id_key"). 20260715000001에서 area_type_id
-- 컬럼을 추가하면서 이 제약을 함께 갱신하지 않은 게 원인.
--
-- area_type_id가 nullable이라 단순히 4컬럼 unique로 바꾸면 NULL은 서로 다른 값으로 취급돼
-- (Postgres 표준 NULL 유니크 시맨틱) 즐겨찾기 행이 사용자당 여러 개 생길 수 있음 — 그래서
-- partial unique index 2개로 분리: area_type_id IS NULL(즐겨찾기 단독 행)과
-- area_type_id IS NOT NULL(평형별 알림 행)을 각각 스코프.

alter table public.favorites
  drop constraint favorites_user_id_complex_id_site_id_key;

create unique index favorites_complex_favorite_unique_idx
  on public.favorites (user_id, complex_id, site_id)
  where area_type_id is null;

create unique index favorites_area_type_alert_unique_idx
  on public.favorites (user_id, complex_id, area_type_id, site_id)
  where area_type_id is not null;
