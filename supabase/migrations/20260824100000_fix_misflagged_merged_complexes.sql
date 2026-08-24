-- merged 로 잘못 표시된 단지 5곳 정정 + 대우그린 1차/2차 분리 (2026-08-24)
--
-- ── 어떻게 발견했나 ────────────────────────────────────────────────────────
-- `merge-complexes.ts --audit-merged` 로 "merged 인데 거래가 남아 있는" 단지를 셌다.
-- 매칭 RPC 는 `status not in ('demolished','out_of_region')` 로만 걸러 merged 를 후보로
-- 남기고 `COALESCE(successor_id, id)` 로 넘긴다. successor_id 가 비면 그 전달이 무력해져
-- **화면에서 사라진 단지에 거래가 계속 붙는다**(앱은 status='active' 로 거른다).
--
-- 🔴 `audit-wholesale-mislink.ts` 는 **active 만 본다.** merged 단지는 감사된 적이 없어
--    이 5곳이 여태 안 보였다. 사각지대였다.
--
-- ── 판정 방법 — 카카오(지번→좌표) + 네이버 지역검색(이름→위치) 2단 ─────────────
-- 카카오는 "이 지번이 어디냐"만 답한다. 네이버 지역검색은 **"그 이름의 건물이 실제로
-- 어디 있냐"**를 답해서, 이름 매칭이 실패하는 건을 푸는 결정적 근거가 됐다.
--
-- 실측 결과 — **대부분 거래가 아니라 단지 레코드가 틀렸다**:
--
--   한빛드림빌2차[48250]  거래 지번 흥동 64-3 이 단지 좌표와 **6m** → 제자리다
--   형제상가빌라[48121]   등록이 `경기 양주시 백석읍 방성리 502-9`, 거래는 소답동 148-7
--                        → **316km**. 이름 같은 수도권 건물로 지오코딩된 P2 결함
--   상남오피스텔[48123]   네이버: `상남동 1-2` / `원이대로 648` 로 **실재 확인**.
--                        거래 지번과 완전 일치. 등록 지번(상남동 71-3)이 틀렸다
--   대우그린[48250]       네이버가 두 단지를 구분한다 —
--                          대우그린빌라   삼정동 88-5 / 활천로57번길 6-6
--                          대우그린2차빌라 삼정동 247  / 활천로47번길 11
--                        DB 는 이 둘을 `대우그린` 하나에 뭉쳐 놓았다. 거래 원본명이
--                        `대우그린빌라(88-5)` 5건 / `대우그린빌라2차` 10건 으로 깔끔히 갈린다.
--                        🔴 CLAUDE.md 가 CRITICAL 로 경고한 **1차/2차 뭉갬** 상태다
--   형제상가빌라[48127]   회원동 674-2 — 카카오 지오코딩 미검출, 네이버도 이 위치를 모른다
--                        (네이버는 마산합포구 교방동 370-1 의 동명 건물만 안다)
--                        → **판정 불가. 연결을 끊는다**
--
-- ── 왜 끊기가 "숨기기" 보다 나은가 ─────────────────────────────────────────
-- merged 단지에 매달아 두면 화면에는 안 나오지만 **연결률 감시가 '연결됨' 으로 집계해
-- 건강을 과대평가한다.** `complex_id = NULL` 은 화면 노출은 똑같이 없고
-- `check-ingest-linkage.ts` 의 미연결 지표에 정직하게 잡히며, 나중에 `complex_aliases`
-- 한 줄로 사람이 확정할 수 있다.

-- ── 1) 한빛드림빌2차 — merged 표시 자체가 잘못이었다 ────────────────────────
UPDATE public.complexes
SET status = 'active', successor_id = NULL
WHERE id = 'a937a94c-13a7-47c2-afb3-15bc11f11678';

-- ── 2) 형제상가빌라[의창구] — 주소·좌표가 경기 양주로 틀렸다 ────────────────
-- 카카오 실측: 경남 창원시 의창구 소답동 148-7 → 35.26763, 128.62823
UPDATE public.complexes
SET status        = 'active',
    successor_id  = NULL,
    jibun_address = '경남 창원시 의창구 소답동 148-7',
    road_address  = NULL,   -- 도로명 미확인. 잘못된 값(경기 양주)을 남기지 않는다
    dong          = '소답동',
    lat           = 35.26763,
    lng           = 128.62823
WHERE id = '956de0e4-58f7-47d1-a4ce-68138558aa87';

-- ── 3) 상남오피스텔 — 네이버로 실재 확인, 등록 지번이 틀렸다 ────────────────
-- 네이버 지역검색: 경상남도 창원시 성산구 상남동 1-2 / 원이대로 648 → 35.2246410, 128.6844474
UPDATE public.complexes
SET status        = 'active',
    successor_id  = NULL,
    jibun_address = '경남 창원시 성산구 상남동 1-2',
    road_address  = '경상남도 창원시 성산구 원이대로 648',
    dong          = '상남동',
    lat           = 35.2246410,
    lng           = 128.6844474
WHERE id = 'e4aad2a7-a928-460f-8064-64d76fac335e';

-- ── 4) 대우그린 — 실제 두 단지로 분리한다 ──────────────────────────────────
-- 신규 단지 2곳을 네이버 주소·좌표로 등록한다.
-- `building_type` 은 `apt` 로 둔다 — 이름이 '빌라' 지만 이 저장소는 연립·다세대도
-- `apt` 로 적재하고(`officetel` 만 따로 둔다), 기존 `대우그린` 도 `apt` 였다.
-- 🔴 `ON CONFLICT (name_normalized, sgg_code)` 를 쓸 수 없다 — 그 조합에 UNIQUE 인덱스가
--    **없다**(실측: complexes 의 UNIQUE 는 kapt_code · molit_complex_code · id ·
--    naver_complex_no(부분) · url_slug(부분) 뿐). 썼다면 42P10 으로 죽었다.
--    CLAUDE.md 가 CRITICAL 로 못박은 함정이라 `WHERE NOT EXISTS` 로 멱등성을 만든다.
INSERT INTO public.complexes
  (canonical_name, name_normalized, sgg_code, si, gu, dong,
   jibun_address, road_address, lat, lng, building_type, status)
SELECT v.canonical_name, v.name_normalized, v.sgg_code, v.si, v.gu, v.dong,
       v.jibun_address, v.road_address, v.lat, v.lng, v.building_type, v.status
FROM (VALUES
  ('대우그린빌라',    '대우그린빌라',    '48250', '김해시', NULL::text, '삼정동',
   '경남 김해시 삼정동 88-5', '경상남도 김해시 활천로57번길 6-6', 35.2329010, 128.8926630, 'apt', 'active'::public.complex_status),
  ('대우그린2차빌라', '대우그린2차빌라', '48250', '김해시', NULL::text, '삼정동',
   '경남 김해시 삼정동 247',  '경상남도 김해시 활천로47번길 11',  35.2316540, 128.8922340, 'apt', 'active'::public.complex_status)
) AS v(canonical_name, name_normalized, sgg_code, si, gu, dong,
       jibun_address, road_address, lat, lng, building_type, status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.complexes c
  WHERE c.name_normalized = v.name_normalized AND c.sgg_code = v.sgg_code
);

-- 거래를 원본명으로 분배한다. 지번이 비어 있는 행이 11건이라 지번으로는 못 가른다 —
-- 원본명은 15건 전부에 있고 `대우그린빌라(88-5)` 5 / `대우그린빌라2차` 10 으로 깔끔하다.
UPDATE public.transactions t
SET complex_id = (SELECT id FROM public.complexes
                  WHERE name_normalized = '대우그린빌라' AND sgg_code = '48250')
WHERE t.complex_id = 'db75f48d-41fe-4b17-b50d-c5d00641a1d1'
  AND t.raw_complex_name = '대우그린빌라(88-5)';

UPDATE public.transactions t
SET complex_id = (SELECT id FROM public.complexes
                  WHERE name_normalized = '대우그린2차빌라' AND sgg_code = '48250')
WHERE t.complex_id = 'db75f48d-41fe-4b17-b50d-c5d00641a1d1'
  AND t.raw_complex_name = '대우그린빌라2차';

-- 이름으로 들어오는 신규 거래가 각 단지를 찾게 별칭을 남긴다.
INSERT INTO public.complex_aliases (complex_id, alias_name, source)
SELECT id, '대우그린빌라(88-5)', 'merge'
FROM public.complexes WHERE name_normalized = '대우그린빌라' AND sgg_code = '48250'
ON CONFLICT DO NOTHING;

INSERT INTO public.complex_aliases (complex_id, alias_name, source)
SELECT id, '대우그린빌라2차', 'merge'
FROM public.complexes WHERE name_normalized = '대우그린2차빌라' AND sgg_code = '48250'
ON CONFLICT DO NOTHING;

-- `대우그린` 은 merged 로 남기고 1차를 successor 로 준다(이름이 가장 가깝다).
-- 지번이 있는 신규 거래는 지번 게이트가 1차·2차를 정확히 가른다.
UPDATE public.complexes
SET successor_id = (SELECT id FROM public.complexes
                    WHERE name_normalized = '대우그린빌라' AND sgg_code = '48250')
WHERE id = 'db75f48d-41fe-4b17-b50d-c5d00641a1d1';

-- ── 5) 형제상가빌라[마산회원구] — 판정 불가. 연결을 끊는다 ──────────────────
-- 회원동 674-2 를 카카오도 네이버도 모른다. 폐지 지번일 수 있다.
-- 끊으면 check-ingest-linkage 의 미연결 지표에 잡히고, 위치가 확인되면
-- complex_aliases 한 줄로 되돌릴 수 있다.
UPDATE public.transactions
SET complex_id = NULL
WHERE complex_id = 'aef402f1-3115-41eb-b8e2-a2cfa5e55558'
  AND cancel_date IS NULL AND superseded_by IS NULL;

COMMENT ON COLUMN public.complexes.successor_id IS
  '병합·재건축 시 넘겨줄 단지. match_complex_by_admin 이 COALESCE(successor_id, id) 로 '
  '반환하므로 status=''merged'' 인데 이 값이 비면 신규 거래가 화면에서 사라진 단지에 '
  '계속 붙는다. merged 로 만들 때 반드시 함께 넣을 것(2026-08-24 실측: 48곳 중 33곳 누락).';
