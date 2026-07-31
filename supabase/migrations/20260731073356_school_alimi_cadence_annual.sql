-- data_sources.school_alimi 의 주기·신선도 기대치를 실제와 맞춘다.
--
-- [배경]
-- 학교알리미 공시는 **연 1회**(보통 4~5월)인데 등록값은 cadence='quarterly',
-- expected_freshness_hours=2400(100일)이었다. 100일이 지나면 신선도 UI가 "오래됨"으로
-- 표시하므로, 정상 운영 중에도 1년 중 약 265일을 경고 상태로 보내게 된다.
-- 경고가 상시로 켜져 있으면 아무도 안 보게 되고, 실제 고장도 같이 묻힌다.
--
-- 수집 워크플로(.github/workflows/collect-school-stats.yml)도 같은 날 연 1회 스케줄로 맞췄다.
-- 그전까지는 workflow_dispatch 전용이라 스케줄 자체가 없었고, facility_school 최종 적재는
-- 2026-07-06 에 멈춰 있었다.
--
-- 400일(9600시간)로 잡은 이유: 공시가 4월에서 5월로 밀리는 해가 있어 정확히 365일로 두면
-- 매년 며칠씩 거짓 경고가 난다. 한 달 여유를 둔다.

update public.data_sources
   set cadence                  = 'annual',
       expected_freshness_hours = 9600
 where id = 'school_alimi';

-- [적용 후 검증]
--   select id, cadence, expected_freshness_hours from public.data_sources where id='school_alimi';
--   -- annual / 9600 이어야 한다
