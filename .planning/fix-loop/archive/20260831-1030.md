## 문제 정의
`ad_campaigns.image_url`이 `NOT NULL`이라 이미지 없는 텍스트 광고를 등록할 수 없다.
realtrade-story에서 지역 생활업체(배너 이미지 없음) 텍스트 광고를 받기 위해 nullable 변경 요청.

## 수정 범위
1. `supabase/migrations/YYYYMMDD_ad_campaigns_image_url_nullable.sql` — DDL 1줄
2. `src/types/database.ts` — Row의 `image_url: string` → `string | null`, Insert도 `string | null`
3. `src/components/ads/AdBanner.tsx` — image_url null일 때 텍스트 전용 렌더
4. `src/components/map/AdMapPopup.tsx` — image_url null일 때 텍스트 전용 렌더
5. `src/lib/auth/ad-actions.ts` — create/update 밸리데이션에서 image_url 필수 제거
6. `src/components/admin/AdCreateForm.tsx` — 이미지 없이 제출 허용
7. `src/components/admin/AdEditForm.tsx` — image_url 초기값 null 처리

## 해결 접근법
- DDL: `ALTER TABLE public.ad_campaigns ALTER COLUMN image_url DROP NOT NULL;`
- 타입: 수동 수정 (supabase gen types는 로컬 환경 제약)
- 렌더: image_url이 있으면 기존 이미지 배너, 없으면 title + advertiser_name 텍스트 카드
- 어드민 폼: 이미지 업로드를 선택사항으로 변경

## 예상 변경 사항
- 기존 10건(전부 image_url 있음) 영향 없음
- danjiondo 어드민은 이미지 있는 광고만 만들어도 되고, 텍스트 전용도 가능
- realtrade-story가 텍스트 광고 등록 가능해짐

## 루프 카운터: 0
