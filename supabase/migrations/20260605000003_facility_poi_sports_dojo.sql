-- category='sports' → 'sports_dojo' 명확화
-- sports_dojo: 체육도장업 (태권도·검도·유도·합기도·복싱 등, 체육시설법 관할)
-- 향후 sports_facility: 체육시설업 (수영장·헬스·볼링 등) 추가 시 충돌 없음
UPDATE public.facility_poi
SET category = 'sports_dojo'
WHERE category = 'sports';
