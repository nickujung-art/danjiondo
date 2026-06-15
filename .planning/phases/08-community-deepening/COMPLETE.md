# Phase 08 — 커뮤니티 심화·자동화 ✅ 완료 (2026-05)

## 구현 내용
- DIFF-01/05: 게이미피케이션 — `profiles.activity_points + member_tier` 컬럼, DB 트리거 자동 포인트 적립
  - 후기 +10p, 댓글 +3p, GPS 인증 +20p / bronze(0~49), silver🔥(50~199), gold👑(200+)
  - `TierBadge.tsx`, `activity_logs` 테이블, gold 등급 즉시 알림 / silver·bronze 30분 딜레이
- DIFF-02: 카페 글 NLP 단지 매칭 — Kakao Search API(`/v2/search/cafe`) + Gemini Flash NER
  - `src/services/naver-cafe.ts` 어댑터, `cafe_posts` 테이블, 일 1회 GitHub Actions cron
  - 단지명 추출 후 `matchComplex()` 파이프라인 경유 (단독 매칭 금지)
- DIFF-04: 카카오톡 알림 — SOLAPI SDK, `src/services/kakao-channel.ts` 어댑터
  - `kakao_channel_subscriptions` 테이블 (전화번호 저장), 알림톡 템플릿 방식
- DIFF-06: 즐겨찾기 비교 표 — nuqs URL state (`/compare?ids=uuid1,uuid2`), 최대 4개
  - `CompareTable.tsx`, RSC에서 `Promise.all` 병렬 fetch
- OPS-02: 카페 자동 발행 → API 부재·법무 미승인으로 어드민 1-click 클립보드 복사 버튼으로 축소

## 새 의존성
- `solapi` (SOLAPI 알림톡 SDK), `nuqs` (URL state)
- 마이그레이션: `profiles.activity_points/member_tier`, `activity_logs`, `cafe_posts`, `kakao_channel_subscriptions`

## 특이사항 / 유지보수
- SOLAPI 알림톡은 카카오 비즈니스 채널 심사(3~5 영업일) + 템플릿 사전 승인 필요
  - 필요 env: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`, `KAKAO_CHANNEL_PF_ID`
- 다음 카페 글쓰기 공개 API 없음 — OPS-02 자동화는 카카오 파트너사 계약 후 재검토
- 전화번호는 서버 전용 RLS + `kakao_channel_subscriptions.is_active` 플래그로 수신 거부 관리
