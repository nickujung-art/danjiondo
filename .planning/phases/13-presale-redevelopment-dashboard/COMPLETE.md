# Phase 13 — 신축·분양·재건축 대시보드 ✅ 완료 (2026-05)

## 구현 내용
- `src/services/cheongyak/` 어댑터: `client.ts`(API 3/2 fetch, withRetry, AbortSignal 15s), `normalize.ts`(YYYYMMDD→ISO), `types.ts`(Zod 스키마)
- 마이그레이션: `supabase/migrations/20260520100000_phase13_new_listings_cheongyak.sql` (12컬럼 + `pblanc_no` partial unique index)
- Daily cron(`/api/cron/daily`) 3블록 추가: 청약홈 공고 upsert → 경쟁률 병합(`competition_rate` MAX) → 만료 공고 비활성화
- `presale.ts` 신규 함수 4개 + 타입 3개: `CheongyakListing`, `RedevelopmentComplex`, `NewBuiltComplex`
- `/presale` 3-tier RSC 페이지 (`revalidate=3600`): Tier 1 분양공고(조건부), Tier 2 재건축예정(조건부), Tier 3 신축최신순(항상 표시)
- 카드 컴포넌트 3종: `PresaleCard`(리팩), `RedevelopmentCard`(신규), `NewBuildCard`(신규)
- 랜딩 페이지: 활성 분양 건수 배지 (`getActiveListingCount`, `.catch(() => 0)` graceful degradation)
- Admin: `/admin/redevelopment` + `setComplexRedevelopmentStatus` Server Action → `revalidatePath('/presale')`
- 31개 단위 테스트 모두 GREEN (normalize 9, client 6, presale 9, redevelopment-actions 7)

## 특이사항 / 유지보수
- `MOLIT_API_KEY` = data.go.kr 발급 키 (공통). 미설정 시 errors 배열에만 기록되고 나머지 cron은 정상 실행
- 청약홈 API 지역 필터: 창원 `4812500000`, 김해 `4825000000` (하드코딩)
- `redevelopment-actions.ts`에서 zod v3 사용 — 프로젝트 다른 곳은 `zod/v4`. 기존 패턴 유지, 런타임 오류는 없으나 일관성 미흡
- API 2 요청 파라미터는 `PBLANC_NO` 대문자 (공공데이터포털 명세 준수)
- 실제 API 실호출 검증은 MOLIT_API_KEY 설정 후 cron 호출로만 가능 (human verification)
