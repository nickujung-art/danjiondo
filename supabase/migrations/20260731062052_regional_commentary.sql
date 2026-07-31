-- 지역별 AI 시장 코멘트 저장 테이블.
--
-- [배경]
-- src/lib/ai/regional-commentary.ts 에 지역 코멘트 생성 로직(Gemini 2.5 Flash + 30개 지표
-- 프롬프트)이 **이미 완성돼 있으나**, 결과를 Supabase에 저장하지 않고 Next.js unstable_cache
-- (bds 배포 프로세스 로컬 메모리)에만 24시간 담아 둔다. 그래서 다른 서비스에서 읽을 방법이 없다.
--
-- realtrade-story 홈 피드에 "이번 주 창원 실거래 요약" 형태의 AI 코멘트를 넣으려면 이 결과가
-- DB에 있어야 한다 — realtrade-story는 아키텍처상 외부 AI API를 직접 호출하지 않는다
-- (realtrade-story/docs/ARCHITECTURE.md "컴포넌트 경계", 해당 저장소엔 .github/workflows 자체가 없음).
--
-- 단지 단위로는 같은 구조가 이미 돌고 있다: monthly-ai-commentary.yml 크론 →
-- generate-complex-commentary.ts → complex_price_predictions.ai_commentary 컬럼 UPDATE.
-- 이 테이블은 그 패턴을 지역 단위로 옮긴 것이며, 지역은 전용 테이블을 쓴다
-- (complexes에 컬럼을 붙이면 기간별 이력을 쌓을 수 없다).

create table if not exists public.regional_commentary (
  id            uuid primary key default gen_random_uuid(),
  sgg_code      text not null,
  -- null이면 지역 전체(평형 구분 없음). '소형'/'59'/'74'/'84'/'대형' 은 단지 코멘트와 동일 체계.
  area_bucket   text,
  period_type   text not null check (period_type in ('daily', 'weekly')),
  -- 집계 대상 구간. period_type='weekly'면 월요일~일요일.
  period_start  date not null,
  period_end    date not null,
  -- 한 줄 제목(홈 카드 헤드라인용). 본문만으로 충분하면 null 허용.
  headline      text,
  body          text not null,
  model_name    text not null,
  -- 프롬프트에 들어간 원본 지표 — 나중에 "왜 이렇게 썼나"를 추적하고 재생성 비교에 쓴다.
  input_snapshot jsonb,
  generated_at  timestamptz not null default now(),

  -- 같은 지역·평형·기간 조합은 하나만 유지한다(재실행 시 upsert로 덮어씀).
  constraint regional_commentary_unique
    unique (sgg_code, area_bucket, period_type, period_start)
);

-- 홈 피드는 "지역별 최신 1건"을 읽는다 — sgg_code로 좁힌 뒤 기간 역순 정렬.
create index if not exists regional_commentary_lookup_idx
  on public.regional_commentary (sgg_code, period_type, period_start desc);

alter table public.regional_commentary enable row level security;

-- 공개 읽기: realtrade-story·danjiondo 모두 anon 키로만 조회한다(SEC-03 — 서비스롤 키를
-- 프론트 저장소에 두지 않는다). contents 정책 선례를 따라 `using (true)` 대신 롤을 명시한다.
create policy "regional_commentary: public read"
  on public.regional_commentary
  for select
  to anon, authenticated
  using (true);

-- 쓰기 정책은 만들지 않는다. 생성 배치는 service_role 로만 upsert 하며,
-- service_role 은 RLS를 우회하므로 별도 정책이 필요 없다. 정책을 열어두면 anon 이
-- AI 코멘트를 위조해 넣을 수 있다.

comment on table public.regional_commentary is
  '지역별 AI 시장 코멘트. scripts/generate-regional-commentary.ts 가 주간 크론으로 upsert 하고, realtrade-story 홈 피드가 anon 으로 읽는다.';

-- [적용 후 검증]
--   insert into public.regional_commentary
--     (sgg_code, period_type, period_start, period_end, body, model_name)
--   values ('48121','weekly', current_date - 7, current_date - 1, '테스트', 'manual')
--   on conflict on constraint regional_commentary_unique do update set body = excluded.body;
--   select * from public.regional_commentary;  -- 1행
--   delete from public.regional_commentary where model_name = 'manual';
