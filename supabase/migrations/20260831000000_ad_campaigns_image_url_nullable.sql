-- 텍스트 전용 광고(이미지 없는 지역 생활업체)를 받기 위해 image_url NOT NULL 해제.
-- 기존 10건은 전부 image_url 이 채워져 있어 영향 없음.
alter table public.ad_campaigns alter column image_url drop not null;
