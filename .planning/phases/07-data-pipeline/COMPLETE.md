# Phase 07 — 데이터 파이프라인 수리 ✅ 완료 (2026-05)

## 구현 내용
- DATA-08: `scripts/kapt-enrich.ts` — KAPT API로 669개 단지에 si/gu/dong/도로명주소/세대수/준공연도/난방방식 적재
  - `KaptBasicInfoSchema`에 `kaptUsedate`, `doroJuso`, `codeHeatNm`, `kaptAddr` 추가
  - idempotent (WHERE si IS NULL 가드), `data_completeness.kapt = true` 설정
  - `.github/workflows/kapt-enrich-once.yml` (workflow_dispatch)
- DATA-09: `scripts/link-transactions.ts` — 186,765건 transactions.complex_id 일괄 연결
  - `matchByAdminCode()` 3축 매칭 (단지명 단독 매칭 절대 금지)
  - `name-aliases.json` 17개 브랜드 별칭 등록 (이편한세상, 힐스테이트 등)
  - 저신뢰(0.5~0.9) → `complex_match_queue` 큐잉, dedup 가드 포함
  - `.github/workflows/link-transactions-once.yml` (workflow_dispatch)
- DATA-10: `ingestMonth` 수정 — `complexIdCache` Map 캐싱 + `lookupComplexIdCached()` 함수
  - 신규 실거래 ingest 시 `complex_id` 자동 연결
  - `molit_complex_code` 저장 (null 가드: 이미 설정된 경우 덮어쓰지 않음)

## 특이사항 / 유지보수
- `scripts/link-transactions.ts` idempotent — `WHERE complex_id IS NULL` 가드로 재실행 안전
- KAPT V3 API 필드명 변경 시 `src/services/kapt.ts` KaptBasicInfoSchema 수정 필요
- `name-aliases.json` 추가 별칭 필요 시 수동 업데이트 (매칭률 향상에 직접 기여)
- `unmatched-log.jsonl`은 디버그 로그 — 삭제됨
- 검증 점수: 12/12 (passed)
