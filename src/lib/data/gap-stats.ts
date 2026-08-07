/**
 * 갭투자 위험도 타입.
 *
 * [2026-08-07 — 이 파일에서 계산 코드가 사라진 이유]
 * 갭 통계의 계산·반영은 SQL 함수 `refresh_complex_gap_stats` 로 넘어갔다
 * (supabase/migrations/20260807052310_refresh_complex_gap_stats.sql).
 * `compute_gap_stats` 가 cold 에서 11.45초라 PostgREST 8초 상한을 넘었고,
 * /api/cron/daily 가 그 자리에서 매일 조용히 타임아웃하고 있었기 때문이다.
 *
 * 그래서 여기 있던 `computeGapStats`(RPC 호출 + UPSERT)와 `computeRiskLevel`
 * (임계값 판정)은 삭제했다. **임계값의 단일 진실 원천은 이제 그 마이그레이션의
 * CASE 식이다** — 두 곳에 두면 갈라진다.
 *
 * 타입만 남긴 이유: `gap-analysis.ts` 가 DB 에서 읽은 `risk_level` 문자열을
 * 좁히는 데 쓴다. 값 집합은 `complex_gap_stats_risk_level_check` 제약과
 * 마이그레이션의 CASE 출력, 이 타입 셋이 함께 맞아야 한다.
 */

/**
 * D-02 갭 비율 기준 위험도.
 *   gap_ratio < 0   역전세(전세가 > 매매가) = 깡통전세 위험 → danger
 *   0 ≤ gap_ratio < 40                소자본 갭투자 가능    → safe
 *   40 ≤ gap_ratio ≤ 60                                    → caution
 *   gap_ratio > 60  고자본 필요                            → danger
 */
export type RiskLevel = 'safe' | 'caution' | 'danger'
