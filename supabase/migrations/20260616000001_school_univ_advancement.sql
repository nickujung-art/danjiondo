-- 고등학교 대학 진학률 컬럼 추가
-- univ_rate: 대학 진학자 합계 비율 (전문대 + 4년제 + 국외)
-- univ_4year_rate: 4년제 대학 진학률
-- univ_2year_rate: 전문대 진학률
alter table facility_school
  add column if not exists univ_rate       numeric(5,1),
  add column if not exists univ_4year_rate numeric(5,1),
  add column if not exists univ_2year_rate numeric(5,1);
