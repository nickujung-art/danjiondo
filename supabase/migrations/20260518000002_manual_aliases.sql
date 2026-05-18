-- complex_aliases 유니크 제약 확인 후 생성 (없으면)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'complex_aliases_complex_id_source_alias_name_key'
      and conrelid = 'public.complex_aliases'::regclass
  ) then
    alter table public.complex_aliases
      add constraint complex_aliases_complex_id_source_alias_name_key
      unique (complex_id, source, alias_name);
  end if;
end;
$$;

-- 수동 매핑 삽입 (국토부 표기명 → DB 정규 단지)
-- source: 'manual_match', confidence: 0.95
insert into public.complex_aliases (complex_id, source, alias_name, confidence)
values
  -- ── 마산합포구 (48125) ─────────────────────────────────────
  -- 마린애시앙부영 → 마산가포 사랑으로 부영아파트
  ('4bbc672a-e82c-4c2c-8c27-79638de38c17', 'manual_match', '마린애시앙부영',         0.95),
  -- 마산가포부영아파트 → 마산가포 사랑으로 부영아파트
  ('4bbc672a-e82c-4c2c-8c27-79638de38c17', 'manual_match', '마산가포부영아파트',      0.95),

  -- ── 진해구 (48129) ─────────────────────────────────────────
  -- 부영3차 → 진해3차부영아파트 (차수 순서 다름)
  ('29028eb3-8ca5-4ed4-a865-492efe3f49bd', 'manual_match', '부영3차',                0.95),
  -- 자은프라임 → 자은프라林아파트 (林=림, 국토부 표기 차이)
  ('985469b8-d571-46b0-9ad5-1bd7a444595f', 'manual_match', '자은프라임',              0.95),

  -- ── 김해시 (48250) ─────────────────────────────────────────
  -- 팔판마을부영그린타운3차 → 팔판마을3단지부영 (그린타운 vs 3단지)
  ('eeae4d5f-312b-40d5-83e0-2715733ac175', 'manual_match', '팔판마을부영그린타운3차', 0.95),
  -- 석봉마을8단지부영14차 → 장유석봉마을8단지 (DB에 부영 표기 없음)
  ('e181c134-a993-49b2-8183-eb961bb91d1f', 'manual_match', '석봉마을8단지부영14차',   0.95),
  -- 월산마을4-1단지부영18차 → 월산마을4단지18차부영 (4-1 → 4단지, '-' 제거 시 41단지로 오해)
  ('e9c1d2f7-8fd9-495e-8185-0aab5ed519bd', 'manual_match', '월산마을4-1단지부영18차', 0.95),
  -- 월산마을4-2단지부영19차 → 월산마을4단지19차부영
  ('90bad7bc-3e72-493b-9738-62cf88f0c410', 'manual_match', '월산마을4-2단지부영19차', 0.95),
  -- 화정마을부영6차 → 화정마을6단지북부부영6차 (단지번호 + 북부 표기 차이)
  ('af1f5888-ed2c-442e-a560-3e4813256007', 'manual_match', '화정마을부영6차',          0.95),
  -- 화정마을부영2차 → 화정마을2단지(북부부영2차)
  ('19de9065-7084-40bd-904a-89145fbad1ee', 'manual_match', '화정마을부영2차',          0.95),
  -- 화정마을부영3차 → 화정마을3단지북부부영3차
  ('f08e541f-b11a-4cf5-85b1-6afcffec1fc8', 'manual_match', '화정마을부영3차',          0.95)
on conflict (complex_id, source, alias_name) do nothing;

-- 자은프라林 → name_normalized 수정 (林 한자 → 림 한글)
-- 국토부 데이터에는 Korean '임', DB canonical에는 Chinese '林' 혼용 문제 해결
update public.complexes
set name_normalized = '자은프라림'
where id = '985469b8-d571-46b0-9ad5-1bd7a444595f'
  and name_normalized = '자은프라林';
