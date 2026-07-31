# Requirements — 단지온도

## v1 Requirements (V1.0 정식 출시)

### Security & Infrastructure
- [ ] **INFRA-01**: 프로덕션 Vercel 배포 + 환경 변수 전체 검증 및 `.env.local.example` 최신화
- [ ] **INFRA-02**: GitHub Actions CI 파이프라인 — PR마다 lint/build/test 자동 실행
- [ ] **INFRA-03**: Playwright E2E — 골든패스 5종 (랜딩·단지 상세·지도·검색·후기 작성) 자동화
- [ ] **SEC-01**: 광고 이벤트 엔드포인트 rate limiting + IP hash (`x-forwarded-for` sha256) 추가
- [ ] **SEC-02**: `createSupabaseAdminClient()` 통합 — inline service-role createClient 3곳 교체
- [ ] **SEC-03**: 지도 쿼리 `status='active'` 필터 추가 (철거 단지 핀 노출 차단)
- [ ] **SEC-04**: Sentry 초기화 (`@sentry/nextjs`) 또는 플레이스홀더 제거 + 환경 변수 정리

### Landing & Ranking
- [ ] **RANK-01**: 지역 인기 단지 풀 정의 SQL + 일배치 갱신
- [ ] **RANK-02**: 랭킹 4종 산식 (신고가·거래량·평당가·관심도) + 1시간 cron
- [ ] **RANK-03**: 랜딩 페이지 완성 — 오늘 신고가 카드 + 4종 랭킹 탭 (ISR 60s)

### Sharing & Viral
- [ ] **SHARE-01**: 단지별 동적 OG 이미지 생성 (`@vercel/og`)
- [ ] **SHARE-02**: 카카오톡·네이버 공유 버튼 + 단지 상세 공유 UX
- [x] **SHARE-03**: 카드뉴스 자동 생성 — Recharts SSR + `@vercel/og` 조합
- [x] **SHARE-04**: 어드민 카드뉴스 1-click 발행 UI

### Legal & Compliance
- [ ] **LEGAL-01**: 이용약관 페이지 + 가입 시 동의 흐름
- [ ] **LEGAL-02**: 개인정보처리방침 페이지 (최소 수집·제3자 제공·보관 기간)
- [ ] **LEGAL-03**: 광고 정책 페이지 + 표시광고법 준수 고지
- [ ] **LEGAL-04**: 회원 탈퇴 플로우 — 30일 grace period + hard delete cron
- [ ] **LEGAL-05**: 이메일 지원 채널 (`SUPPORT_EMAIL`) 설정 + 문의 안내 UI

### Admin & Operations
- [ ] **ADMIN-01**: 회원 관리 — 카페 닉네임 검증 + 가입 소스 추적 + 계정 정지
- [ ] **ADMIN-02**: 광고 검수 워크플로우 — 등록→검수→승인/반려 상태 머신
- [ ] **ADMIN-03**: 신고 큐 — 후기·데이터 오류 신고 운영자 처리 UI
- [ ] **ADMIN-04**: 시스템 상태 모니터링 메뉴 (ingest 현황·알림 큐·cron 상태)
- [ ] **ADMIN-10**: 공유 어드민 레이아웃 — 사이드바 네비게이션 + `/admin` 진입점 + 공통 권한 검증 미들웨어
- [ ] **ADMIN-11**: 회원·신고·광고·중개사 목록 검색·필터 — 텍스트 검색 + 상태 드롭다운 필터
- [ ] **ADMIN-12**: 사이드바 미처리 항목 뱃지 — pending 신고·광고·GPS 요청 카운트 실시간 표시
- [ ] **ADMIN-13**: 어드민 페이지 공통 UX 개선 — 모바일 햄버거 메뉴 + 현재 페이지 active 표시 + 빠른 액션 링크

### Accessibility
- [ ] **A11Y-01**: axe-core CI 통합 — PR마다 critical 0건 강제
- [ ] **A11Y-02**: 키보드 탐색 검증 — 지도·단지 상세·검색·로그인 전 흐름
- [ ] **A11Y-03**: 스크린리더 라벨 검증 (지도 마커·차트·폼)

---

## v2 Requirements (V1.5 — 커뮤니티)

- [ ] **COMM-01**: 후기 댓글 (단순 텍스트, RLS, 신고 가능)
- [ ] **COMM-02**: GPS L1 인증 배지 활성화 (V0.9 스키마 준비됨, 단지 ±100m 인증 연동)
- [ ] **COMM-03**: 단지 페이지 → 카페 검색 외부 링크
- [ ] **COMM-04**: 데이터 오류·후기·매칭 신고 통합 큐 + SLA ≤ 24h
- [ ] **COMM-05**: 주간 회전 카페 가입 코드 시스템
- [ ] **DATA-01**: K-apt 부대시설 데이터 추가 (단지 상세 시설 탭 확장)
- [ ] **DATA-02**: 신축 분양 정보 등록 + 분양권 거래 분리 UI
- [ ] **DATA-03**: 재건축 단계 운영자 수동 입력 + 진행 타임라인
- [ ] **DATA-04**: 가성비 분석 4분면 (평당가 × 학군 점수) 시각화
- [ ] **DATA-05**: 매물가 vs 실거래가 갭 라벨 (단지 상세)
- [ ] **NOTIF-01**: 주간 다이제스트 이메일 (관심 단지 요약)
- [ ] **NOTIF-02**: 알림 토픽 채널 구독 (신고가·분양 등 카테고리 선택)
- [ ] **OPS-01**: DB 백업 자동화 — pg_dump + GitHub private repo 주간 백업 + 복구 런북

---

## v3 Requirements (V2.0 — 차별화 자산)

- [ ] **DIFF-01**: 게이미피케이션 마크 (👑🔥💬) + 회원 등급 기반 UI — 5단계(브론즈/실버/골드/플래티넘/다이아), 활동 종합 점수(후기 50·댓글 10·즐겨찾기 5·로그인 1점/일) DB 트리거, TierBadge 컴포넌트
- [ ] **DIFF-02**: 카페 글 Naver Search API(cafearticle) 단지 매칭 + 일배치 수집 cron + 단지 상세 카페 글 탭 (단지명+지역 검색, cafe_articles 테이블 upsert)
- [ ] **DIFF-03**: Claude API + RAG 단지 상담 봇 (환각률 ≤ 5%)
- [ ] **DIFF-04**: 카카오톡 채널 알리미 (웹 푸시 거부 대안)
- [ ] **DIFF-05**: 회원 등급 시스템 + 우선 알림 혜택
- [ ] **DIFF-06**: 단지 비교 표 — 단지 상세 플로팅 비교바 + /compare 페이지, 최대 4개, 항목: 실거래가 추이 그래프·세대수·준공연도·학군·관리비
- [ ] **DATA-06**: SGIS 인구·세대 통계 분기 적재
- [ ] **DATA-07**: 재개발 행정 데이터 자동 적재 (출처 확보 시)
- [ ] **AD-01**: 광고 통계 고도화 (전환 추적·ROI·이상 트래픽 감지)
- [ ] **AD-02**: 광고주 카피 AI 어시스트 + 표시광고법 자동 감지
- [ ] **AUTH-01**: GPS L2+L3 인증 (다회+시간패턴 / 우편·관리비)
- [ ] **OPS-02**: 카카오 카페 매니저 OAuth 카드뉴스 자동 발행 (약관 법무 승인 후)

---

## v4 Requirements (단지 상세 UX 고도화)

- [ ] **UX-01**: 실거래가 그래프 — 월세 탭 제거 + 기간 필터(1년/3년/5년/전체, nuqs URL 상태) + IQR 이상치 투명 점 표시
- [ ] **UX-02**: 실거래가·관리비 평형별 필터 — 전용면적 기준 칩 셀렉터(nuqs), 기본값 최다 거래 평형
- [ ] **UX-03**: 시설 정보 표시 개선 — 주차 세대당 대수(총주차÷세대수) + 엘리베이터 동당 대수(총엘리베이터÷동수)
- [ ] **UX-04**: 관리비 계절별 표시 — 상세내역 제거 + 하절기/동절기 월평균 + 세대당 평균 (단지 합계 ÷ 세대수, 평형별 분리 없음)

---

## v5 Requirements (교육 환경 고도화)

- [ ] **EDU-01**: 배정학교 표시 — 학구도 shapefile(초/중/고) PostGIS import + ST_Within 매핑 + facility_school.is_assignment 플래그 업데이트 + UI에서 배정학교 강조/구분 표시
- [ ] **EDU-02**: 어린이집/유치원 분리 표시 — facility_poi.poi_name 기반 유치원 분리 + 어린이집 3개·유치원 3개 각각 표시 (현재 혼합 10개)
- [ ] **EDU-03**: 학원 UX 개선 — "외 N개" 클릭 시 전체 목록 펼치기 + 시군구 단위 상위 X% 라벨 (현재 창원+김해 통합)
- [ ] **EDU-04**: 학교 도보 시간 색깔 아이콘 — distance_m÷67 도보 분 계산 + 10분 이내(녹색)/10~15분(노랑)/15분 초과(빨강) 3단계 색상 표시
- [ ] **EDU-05**: 학원 종류별 분류 표시 — poi_name 파싱으로 수학/영어/예체능 등 카테고리 태그 표시

---

## v6 Requirements (지도 고도화)

- [ ] **MAP-01**: 클러스터 클릭 줌인 + 마커 hover 미리보기 카드 — ClusterMarker 클릭 시 해당 클러스터 bounds로 fitBounds 자동 줌인, ComplexMarker hover 카드에 평당가·세대수 표시
- [ ] **MAP-02**: 평당가 라벨 마커 — complexes.avg_sale_per_pyeong(integer, 만원/평) 컬럼 신규 추가, transactions 최근 1년 평균 집계 함수, 줌 레벨 연동 라벨 on/off, 가격대별(저/중/고) 색상
- [ ] **MAP-03**: 사이드 패널 — 마커 클릭 시 우측 슬라이드인(PC) / 하단 시트(모바일), 단지명·최근 실거래·학원등급·상세 링크 표시
- [ ] **MAP-04**: 게임화 마커 배지 시스템 — SVG 일체형(이모지 금지), 1순위(분양·신축·광고), 2순위(왕관·핫·급등·급락), 3순위(가성비·학군·대단지·재건축)
- [ ] **MAP-05**: 지도 마커 DB 확장 — complexes.view_count(integer, 단순 카운터), complexes.price_change_30d(numeric, 30일 변동률), 단지 상세 페이지 view_count +1 RPC

---

## v7 Requirements (지도 마커·클러스터 개편)

- [ ] **MAP-06**: 로고 기반 집 모양 SVG 마커 교체 — 회색 지붕+굴뚝 돌기+오렌지 C형 바디 (일반), 빨간 바디 (pre_sale), 민트 바디 (new_build, built_year≥2021). hot(tx_count_30d 상위 5%) 단지는 지붕 위 왕관 SVG 추가. 기존 핀/티어드롭 BadgeMarker 완전 교체. 이모지/backdrop-blur/glow 금지
- [ ] **MAP-07**: hover 툴팁 — ComplexMarker hover 시 단지명·시/구·최근 실거래 1건(가격·날짜·평수)·세대수·준공 표시하는 카드형 툴팁. 클릭 전 표시, 클릭 후 MapSidePanel 유지
- [ ] **MAP-08**: 동/구 단위 클러스터 칩 — supercluster 숫자 원형 클러스터를 사각형 칩으로 교체. 구/동 이름 + 최근 3개월 최고 실거래가(cancel_date IS NULL AND superseded_by IS NULL 필수) 표시. 클릭 시 줌인 동작 유지
- [ ] **MAP-09**: 줌 레벨 정책 재정의 + 배지 단순화 — level≥10 클러스터 칩만 표시(단지 마커 숨김), level 7~9 집 마커+실거래가(단지명 없음), level≤6 집 마커+단지명+실거래가. 배지 3종만 유지(pre_sale 빨강·new_build 민트·hot 왕관), 기존 surge/drop/school/large_complex/redevelop/none 제거
- [ ] **MAP-10**: 동 단위 중간 줌 레벨 — level 7~8 구간에 구 칩 대신 동(dong) 단위 클러스터 칩 표시. complexes.dong 필드 기반 groupBy, key = `${gu}_${dong}` (동 이름 중복 방지), 칩 표시: 동 이름 + 단지 수 + 최고 recent_price. dong=null 단지는 '기타'로 그룹화
- [ ] **MAP-11**: 동 칩 클릭 드릴다운 — 동 칩 클릭 시 map.setLevel(6) + 해당 동 중심좌표로 setCenter. 개별 마커 전환 트리거
- [ ] **MAP-12**: pre_sale 마커 level 7~8 노출 — 동 클러스터 레벨에서 pre_sale(status='pre_sale') 단지는 개별 마커로 항상 표시 (광고성 핀, 수익 연계). 나머지 단지는 동 칩으로만 표현

---

## v8 Requirements (SEO URL 구조 최적화)

- [ ] **SEO-01**: 한글 URL 구조 — 창원시/성산구/내동/대우2차 형태 계층 URL (창원 4단계, 김해 3단계). `complexes` 테이블에 `url_slug` TEXT 컬럼 추가 (사전 계산, 예: `창원시/성산구/내동/대우2차`). 위치 데이터 없는 143개 단지는 기존 `/complexes/[id]` 유지.
- [x] **SEO-02**: 계층별 페이지 — 시(창원시/김해시), 구(창원 전용), 동, 단지 4개 계층에 독립 페이지. 각 페이지에 BreadcrumbList JSON-LD + `<nav>` 브레드크럼 HTML + 실거래 데이터 SSR 필수 (Yeti JS 불렌더링).
- [x] **SEO-03**: 단지 상세 301 리다이렉트 — `/complexes/[id]` → 새 한글 URL 영구 301 리다이렉트 (기존 링크 보존).
- [x] **SEO-04**: 메타데이터 최적화 — 각 계층별 `<title>` ≤40자, `<meta name="description">` ≤80자, `<meta http-equiv="content-language" content="ko-kr">`. 시/동 레벨 페이지에 FAQ JSON-LD ("창원시 아파트 평균 매매가는?" 형태).
- [x] **SEO-05**: 사이트맵·RSS 피드 — `/sitemap.xml` (단지별 `lastmod` = 최근 거래일, 계층 페이지 포함), `/feed.xml` RSS (최근 거래 50건, 당일 크롤 유도).
- [x] **SEO-06**: robots.txt 최적화 + 네이버 서치어드바이저 소유권 인증 파일 경로 준비 (`/[naver-verification-code].html` 정적 route).

---

## v9 Requirements (창부레터 DB 기반 — 공유 Supabase 콘텐츠 스키마)

> 설계 확정 문서: `changbuletter/docs/adr/ADR-002-content-schema.md`(DDL 전문),
> `ADR-003-rls-and-data-security.md`(RLS 전문). 원본은 `.planning/vision/BRIEF.md` §25-1·§25-6.
> **즉석 설계 금지** — ADR의 DDL을 그대로 적용한다.

- [ ] **CBL-01**: `site_id` CHECK 제약에 `'changbuletter'` 추가. 현재 `20260715000001_realtrade_story_site_scoping.sql`이 `check (site_id in ('danjiondo','realtrade-story'))`로 제한해 창부레터 insert가 제약 위반으로 실패한다. 대상 테이블 전수 확인 후 일괄 확장.
- [ ] **CBL-02**: `profiles.role` CHECK 제약에 `'cbl_editor'` 추가. **`admin`을 재사용하지 않는다** — `src/app/admin/layout.tsx:25`가 `role in ('admin','superadmin')`으로 게이트하므로 편집자에게 `admin`을 주면 bds 어드민 콘솔 전체 권한(광고 승인·회원 관리·GPS 승인·공인중개사 관리)이 열린다.
- [ ] **CBL-03**: `contents` 테이블 생성 — `category`+`region_tags`(text[]) 분리, `status`(draft/scheduled/published)+`scheduled_at`, `cafe_post_url`, `is_featured`, `excerpt`/`read_minutes`/`cover_image`, VS 투표 3필드. 인덱스 3개(발행 피드 부분 인덱스, `region_tags` GIN, `category` 부분 인덱스).
- [ ] **CBL-04**: `content_complexes`(콘텐츠↔단지 다대다) · `content_votes`(VS 투표) · `content_bookmarks`(콘텐츠 북마크) 생성. `favorites`는 `complex_id` 기반이라 콘텐츠 북마크에 재사용 불가.
- [ ] **CBL-05**: `subscribers` 테이블 생성 — 더블 옵트인 4상태(pending/confirmed/unsubscribed/bounced), `confirm_token` DB 기본값(`encode(gen_random_bytes(24),'hex')`), `requested_at`/`confirmed_at` 분리(후자가 정보통신망법 수신동의의 법적 근거), `unique (site_id, email)`.
- [ ] **CBL-06**: 신규 테이블 5개 RLS 정책. **모든 정책에 `TO` 절 명시 필수** — 기존 선례 `20260430000009_rls.sql:151-153`(`ad_events`)는 `TO` 절 누락 버그라 이름과 달리 `anon`에도 적용된다. `contents`는 `using (true)` 금지, `status='published' AND published_at <= now()`로 draft·예약발행을 DB 레벨 차단. **`subscribers`에 SELECT 정책을 만들지 않는다**(이메일 목록 덤프 + 존재 여부 오라클 방지).
- [ ] **CBL-07**: 회귀·보안 검증 — `anon`으로 draft·scheduled `contents` 조회 불가, `subscribers` SELECT 불가·INSERT는 `status='pending'`만 가능, `site_id='changbuletter'` insert 성공, `role='cbl_editor'` 설정 성공, CHECK 제약 변경이 기존 danjiondo·realtrade-story 행에 영향 없음.

---

## v10 Requirements (마이그레이션 원장·저장소 정합성 회복)

> 배경: Phase 36 실행 중 `npm run db:push`가 원장 drift로 거부되는 것이 발견됐다
> (`.planning/phases/36-db-supabase/36-00-SUMMARY.md`). 6/18 이후 마이그레이션이 파일명이
> 아니라 적용 시각을 버전으로 기록하는 경로(MCP `apply_migration`/대시보드)로 적용돼 왔고,
> 그 과정에서 **로컬 파일이 없는 프로덕션 스키마 객체**가 생겼다.
>
> **이 요구사항 묶음은 스키마를 변경하지 않는다.** 프로덕션 현재 상태를 저장소가 재현할 수
> 있게 만드는 것이 목적이다.

- [x] **DRIFT-01**: 로컬 파일이 없는 프로덕션 스키마 5건을 원장(`supabase_migrations.schema_migrations.statements`)에서 추출해 로컬 마이그레이션 파일로 복원. **파일명은 remote 버전을 그대로 사용**해 원장과 매칭시킨다(별도 repair 불필요). 대상: `20260618085750`(`get_complex_review_avg`), `20260618085906`(`regional_income`·`complex_area_types` RLS + `ad_events` 정책 수정), `20260618093403`(SECURITY DEFINER `search_path=''` 4함수), `20260625063824`(`cardnews-payloads` 스토리지 정책 3개), `20260728074553`(`site_admin_roles` 테이블+RLS+`realtrade-story-ad-images` 버킷). ✅ 37-00 완료 — 5/5 원장 md5 바이트 일치
- [x] **DRIFT-02**: 복원은 **프로덕션을 그대로 재현**한다. `TO` 절 누락·`using (true)` 등 현행 패턴을 "개선"하지 않는다 — 개선하면 로컬 파일이 프로덕션과 불일치해 목적이 무너진다. 발견된 하드닝 후보는 주석과 SUMMARY에 기록만 한다. ✅ 37-00 완료 — 개선 0건, O-2로 이월
- [x] **DRIFT-03**: remote 전용 13건을 `migration repair --status reverted`로 원장에서 제거. 12건은 로컬 파일의 중복 기록(로컬이 이미 자기 버전으로 applied), 1건(`20260618075929 phase28_route_rpc`)은 `20260619000003_..._v2.sql`에 덮인 구버전. **DRIFT-01 완료 후에만 실행** — 선행하지 않으면 5건의 유일한 기록이 사라진다.
- [x] **DRIFT-04**: 로컬 마이그레이션 타임스탬프 중복 3쌍 리네이밍 (`20260618000001`, `20260618000002`, `20260619000002` 각 2개 파일). **의존 순서를 반드시 보존**할 것 — 예: `20260619000002_recommend_hagwon_candidates_rpc.sql`은 이를 DROP·재생성하는 `20260619000003_..._v2.sql`보다 **앞**이어야 하므로 이 파일은 옮길 수 없고 짝인 `phase28_subject_v2.sql`을 옮겨야 한다. 각 쌍마다 두 파일 내용을 읽어 판단한다. 리네이밍한 새 버전은 `repair --status applied`로 기록.
- [x] **DRIFT-05**: 회복 검증 — `npx supabase migration list --linked`에서 local-only·remote-only가 **0건**이고, `npx supabase db push --dry-run`이 에러 없이 "적용할 것 없음"으로 통과. 스키마 무변경 확인(주요 객체 존재 + 행수 불변).

---

## v11 Requirements (보안 수정 · db reset 복구 · 데드 오버로드 정리)

> 배경: Phase 37 실행·검증 중 발견된 3건. `.planning/phases/37-migration-drift/37-VERIFICATION.md`
> (O-3는 `gaps_found` 판정의 근거) 및 오케스트레이터 라이브 조사(O-1·O-2 실측).

- [ ] **HARD-01** *(보안, 최우선)*: `storage.objects`의 `ad_images_service_write` 정책이 `with check (bucket_id = 'ad-images')`만 검사하고 **역할 검사가 없다.** `roles={public}`이므로 anon 키 보유자가 `ad-images` 버킷(현재 `public=true`, 파일 2개)에 임의 파일을 업로드할 수 있고 업로드된 파일은 공개 읽기가 된다. 같은 저장소의 `realtor_profiles_service_insert`·`cardnews-payloads service insert`는 `AND auth.role() = 'service_role'`을 갖고 있어 **이것은 관행이 아니라 단독 실수**다. 프로덕션과 로컬을 **함께** 수정한다. ⚠️ `ad-images` 버킷과 두 정책(`ad_images_public_read`·`ad_images_service_write`)은 **로컬 마이그레이션 파일이 아예 없으므로** 수정 마이그레이션이 곧 최초 기록이 된다 — 버킷 생성까지 포함해 작성할 것. 업로드된 파일 2개의 정상 여부도 확인.
- [ ] **HARD-02** *(Phase 37 goal 미달분)*: `hagwon_db.blog_snippet`·`blog_tags`의 `ADD COLUMN` DDL이 로컬에 없어 `supabase db reset`이 `20260619000003_recommend_hagwon_candidates_v2.sql`(`LANGUAGE sql`, 해당 컬럼 SELECT)에서 실패한다. DDL 원문은 `.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql`의 `20260619043107` 블록에 보존됨. 복원 위치는 `000002`(rpc)보다 뒤, `000003`(v2)보다 앞이어야 하는데 정수 슬롯이 없으므로 **`_recommend_hagwon_candidates_v2.sql`을 `20260619000003` → `20260619000005`로 옮겨 슬롯을 비운 뒤** `20260619000003_add_hagwon_blog_fields.sql`로 복원한다. 양쪽 `repair --status applied`. **마무리로 로컬에서 `supabase db reset`을 실제 실행해 전 구간 성공을 실측 확인**(Phase 37이 놓친 검증).
- [ ] **HARD-03**: `recommend_hagwons` 오버로드 2개 공존 — `phase28_subject_v2`가 `p_fee_tier text`를 `p_fee_tiers text[]`로 배열화하며 구버전을 `DROP`하지 않았다. 인자 미명시 호출 시 모호성 에러 위험. **앱 코드는 둘 다 호출하지 않음이 확인됨**(`src/lib/data/hagwon-recommend.ts:21`은 `recommend_hagwon_candidates`만 호출, `src/types/database.ts` 언급은 생성 타입). 구버전(`p_fee_tier text`)만 `DROP FUNCTION`하고 배열 버전 유지.
- [ ] **HARD-04** *(규약)*: 신규 RLS 정책은 **`TO` 절을 명시**한다는 규약을 `CLAUDE.md`에 추가. ⚠️ **기존 96개 정책의 일괄 수정은 범위 밖** — 쓰기 정책 29건을 전수 확인한 결과 HARD-01 하나를 제외하면 전부 `auth.uid()`·`exists(profiles.role…)`·`auth.role()='service_role'` 제한 조건을 갖고 있어 악용 불가하며, 읽기 정책의 `TO public`은 anon 공개 읽기 의도와 일치해 정상이다. 저장소 전체 RLS 재작성은 비용 대비 이득이 없다.

---

## Out of Scope

- NextAuth.js 전환 — Supabase Auth로 이미 완전 구현됨. 전환 시 이득 없이 재작성 비용만 발생
- 모바일 네이티브 앱 (iOS/Android) — PWA로 충분. 수요 검증 전 투자 불필요
- 매물 직접 등록 UI — 중개사 파트너십 없이 허위 매물 위험
- 카페 글 백포팅 (V1.0) — 카페 연동 API 없이 불가. V2에서 NLP 연동 후 추진

---

## Traceability

*Phase → Requirement 매핑은 ROADMAP.md에서 관리*

| Phase | Version | Requirements |
|-------|---------|--------------|
| Phase 1 | V1.0 | INFRA-01~04, SEC-01~04, RANK-01~03, SHARE-01~04, LEGAL-01~05, ADMIN-01~04, A11Y-01~03 |
| Phase 2 | V1.5 | COMM-01~05, DATA-01~05, NOTIF-01~02, OPS-01 |
| Phase 3 | V2.0 | DIFF-01~06, DATA-06~07, AD-01~02, AUTH-01, OPS-02 |
