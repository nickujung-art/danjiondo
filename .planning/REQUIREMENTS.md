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
