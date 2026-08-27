-- 마이그레이션 밖에서 추가된 컬럼 4개를 원장에 기록한다 (2026-08-27)
--
-- ── 어떻게 찾았나 ──────────────────────────────────────────────────────────
-- `supabase db dump --linked` 로 받은 실물 스키마와 `supabase/migrations/` 가 만드는
-- 컬럼을 전수 대조했다. 테이블 수는 61/61 로 일치하고, **컬럼 4개만** 실물에 있고
-- 원장에 없었다.
--
-- ── 왜 지금까지 안 보였나 ──────────────────────────────────────────────────
-- `db push` 는 미적용 마이그레이션만 올리므로 프로덕션에서는 아무 문제가 없다.
-- 이 부류는 **빈 DB 에서 처음부터 재생할 때만** 드러난다. 실제로 `db diff` 의 섀도
-- 빌드가 여기서 죽었다:
--
--     ERROR: column t.jibun does not exist (SQLSTATE 42703)
--     At statement: 13   select public.refresh_complex_canonical_jibun()
--
-- 즉 `transactions.jibun` 이 없으면 **지번 게이트 전체가 재생 불가**다 —
-- 오연결 정리(2026-08-21~26)의 근간이 그 컬럼 하나에 얹혀 있다.
--
-- ── 멱등이며 프로덕션 동작을 바꾸지 않는다 ─────────────────────────────────
-- 넷 다 이미 실물에 있다. `if not exists` 라 재적용해도 무변화다.
-- nullable + 기본값 없음이라 대용량 테이블(transactions 34만행)에도 테이블 재작성이 없다.

-- ── 🔴 왜 타임스탬프가 20260821085900 인가 ────────────────────────────────
-- 이 컬럼들은 원장 밖에서 **훨씬 전에** 추가됐다. 특히 transactions.jibun 은
-- 20260821090000(지번 게이트)이 의존한다 — 그래서 파일이 그 바로 앞(085900)에 있어야
-- 재생 순서가 사실과 맞는다. 처음엔 20260827010000 으로 만들어 적용했는데, 그러면
-- 재생 시 게이트보다 **뒤**에 와서 여전히 42703 으로 죽었다. 파일을 앞당기고 원장을
-- 정정했다:
--     supabase migration repair --linked --status reverted 20260827010000
--     supabase migration repair --linked --status applied  20260821085900
-- 컬럼이 프로덕션에 이미 있으므로 applied 로 표기하는 것이 사실과 맞다.

alter table public.transactions
  add column if not exists jibun text;

comment on column public.transactions.jibun is
  '지번(본번-부번). 거래→단지 매칭의 지번 게이트가 쓴다 — 이 컬럼 없이는 '
  'match_complex_by_admin 이 이름 단독 매칭으로 되돌아간다(CLAUDE.md CRITICAL).';

alter table public.data_sources
  add column if not exists error_message text;

alter table public.facility_kapt
  add column if not exists priv_area numeric;

comment on column public.facility_kapt.priv_area is
  'K-apt privArea — 단지 전용면적 합계(㎡). priv_area / mgmt_area 가 전용률이며, '
  '이것으로 거래 데이터의 전용면적을 공급면적으로 환산해 평형별 관리비를 낸다.';

alter table public.facility_poi
  add column if not exists sport_type text;

comment on column public.facility_poi.sport_type is
  'category=sports일 때만 사용: taekwondo|kendo|judo|hapkido|boxing|swimming|gym|etc';

-- ── [적용 후 검증] ─────────────────────────────────────────────────────────
-- 실물 대조를 다시 돌려 컬럼 drift 0 이 나와야 한다. 그리고 이 마이그레이션의 목적은
-- **`supabase db diff --linked` 가 섀도 빌드를 끝까지 마치는 것**이다 — 그게 되어야
-- 앞으로 drift 를 자동으로 볼 수 있다.
