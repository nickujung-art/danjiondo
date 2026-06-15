# Phase 04 — 커뮤니티 기초 ✅ 완료 (2026-05)

## 구현 내용
- COMM-01: 후기 댓글 — `comments` 테이블 (1-depth flat, 10~500자), `CommentSection`, `submitComment/deleteComment`
- COMM-02: GPS L1 인증 — `navigator.geolocation` → Server Action `verifyGpsForReview()` → `check_gps_proximity` RPC (±100m), `gps_verified` 플래그
- COMM-03: 단지→카페 검색 링크 — `buildCafeSearchUrl()`, `CafeLink` 컴포넌트 (ReviewList 상단)
- COMM-04: 신고 큐 SLA ≤24h — `/admin/reports` 페이지 (24h 경과 배지)
- COMM-05: 주간 카페 가입 코드 — `cafe_join_codes` 테이블, `/api/worker/cafe-code`, `cafe-code-weekly.yml` (월 09:05 KST)
- DATA-01: K-apt 부대시설 — `fetchKaptBasicInfo()`, `/api/cron/daily` UPSERT → `facility_kapt`
- DATA-02: 분양 정보 — `new_listings` + `presale_transactions`, `fetchPresaleTrades()`, `/presale` ISR 페이지
- NOTIF-01: 주간 다이제스트 이메일 — `buildWeeklyDigest()`, `weekly-digest.yml` (월 09:00 KST)
- NOTIF-02: 알림 토픽 구독 — `notification_topics` 테이블, `TopicToggle` (3 pills: 신고가/분양/단지업데이트)
- DB 마이그레이션: `20260507000004_phase4_tables.sql` (5개 테이블 + `check_gps_proximity` RPC)

## 특이사항 / 유지보수
- GAP: 댓글 신고(`ReportButton` + submitReport) 미구현 — `reports` 테이블은 `target_type='comment'` 지원하나 유저 입력 경로 없음
- `SlaUtils.ts` 고아 코드 — `admin/reports/page.tsx`가 자체 `getSlaState` 복사본 사용
- Phase 4 테이블 타입: `as any` 캐스트 다수 (database.ts 재생성 전 임시 패치) — 이후 타입 재생성 시 제거
- 분양 페이지: daily cron 미실행 시 "아직 등록된 분양 정보가 없습니다" 표시 (정상)
- 다이제스트: notifications INSERT만 — 실제 이메일 전달은 `/api/worker/notify` 별도 워커가 처리
