# Phase 06 — AI 차별화 기술 ✅ 완료 (2026-05)

## 구현 내용
- AD-01: 광고 전환 이벤트(`conversion`), IP별 하루 10회 초과 anomaly 감지(Upstash Redis), `/admin/ads` ROI 대시보드
- AD-02: Claude haiku-4-5로 광고 카피 표시광고법 위반 감지 + 개선 제안 (어드민 전용, 실패 시 등록 차단 없음)
- DATA-06: SGIS 인구·세대 통계 → `district_stats` 테이블, `scripts/ingest-sgis.ts`, 분기 GitHub Actions cron
- 갭 라벨 UI: `listing_prices.price_per_py` vs 실거래 평균 비교, `GapLabel.tsx`
- DIFF-03 RAG 봇: Voyage AI(voyage-4-lite) 임베딩 + pgvector + Claude haiku 스트리밍, `AiChatPanel.tsx` 플로팅 패널
- AUTH-01 GPS 인증: L1/L2/L3 배지 (`gps_visits` 테이블, 30일 내 3회 → L2 자동 승급), L3 어드민 수동 승인

## 새 의존성
- `@anthropic-ai/sdk` 추가, `voyage-4-lite` 임베딩 모델
- 마이그레이션: `20260508000001~4` (district_stats, ad_events+is_anomaly, pgvector+complex_embeddings, gps_auth)

## 특이사항 / 유지보수
- SGIS `adm_cd` 코드 ASSUMED → 첫 실행 시 SGIS stage API 검증 필요 (env: `SGIS_CONSUMER_KEY/SECRET`)
- `scripts/embed-complexes.ts` 초기 실행 필수 (RAG 봇이 임베딩에 의존)
- GPS 100m 체크는 위경도 차이 근사치 — 향후 PostGIS `ST_DWithin`으로 교체 권장
- 환각률 ≤5% human eval 100건 미실시 (코드 구현 완료, 시스템 프롬프트로 제한)
- 검증 점수: 19/20
