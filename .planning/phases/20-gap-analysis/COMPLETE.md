# Phase 20 — 갭투자 분석 ✅ 완료 (2026-05)

## 구현 내용
- DB: `complex_gap_stats` 테이블 (UNIQUE complex_id, risk_level CHECK 'safe'|'caution'|'danger')
- DB: `compute_gap_stats(p_window_months=12)` SQL 함수 — PERCENTILE_CONT(0.5) 중위값, 취소·정정 제외
  - 매매/전세 각 3건 미만 단지는 계산 제외
- 일배치 cron(`/api/cron/daily`)에 gap stats 재계산 통합
- `GapAnalysisCard` RSC: 단지 상세 페이지 (ManagementCostCard 앞), 갭금액·갭비율·전세가율 3열 + CSS dot 배지
- `/gap-analysis` 랭킹 페이지 (ISR revalidate=3600): sgg_code / risk_level URL 필터 탭, gap_ratio DESC 정렬
- 위험도: 갭비율 <40% 안전, 40~60% 주의, >60% 위험

## 특이사항 / 유지보수
- `compute_gap_stats` RPC는 `Database` 타입에 미등록 → `(supabase as any).rpc('compute_gap_stats', ...)` 캐스트 사용
- allowlist 검증: sgg_code 7개, risk_level 3개 — SQL 인젝션 방지
- 마이그레이션: `supabase/migrations/20260528000003_complex_gap_stats.sql`
- 연간 면적별 세분화, 시계열 추이 그래프 등은 defer됨
- 핵심 파일: `src/lib/data/gap-stats.ts`, `src/lib/data/gap-analysis.ts`, `src/components/complex/GapAnalysisCard.tsx`, `src/app/gap-analysis/page.tsx`
