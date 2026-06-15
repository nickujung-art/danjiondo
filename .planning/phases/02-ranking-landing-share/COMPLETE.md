# Phase 02 — 랭킹·랜딩·공유 ✅ 완료 (2026-05)

## 구현 내용
- RANK-01: `complex_rankings` 테이블 + RLS (public read) — migrations 20260507000001/2
- RANK-02: 4종 랭킹 산식 (신고가·거래량·평당가·관심도), `computeRankings()`, GitHub Actions 1h cron (`rankings-cron.yml`)
- RANK-03: 랜딩 페이지 ISR 60s — `revalidate=60`, `HighRecordCard`, `RankingTabs` (4탭, `'use client'`)
- SHARE-01: 단지별 동적 OG 이미지 — `opengraph-image.tsx`, `runtime='nodejs'`, `PretendardSubset.ttf` (2.6MB)
- SHARE-02: `ShareButton` — 카카오톡·네이버·링크복사 3종, 카카오 SDK 지연 초기화 + `isInitialized()` 중복 방지

## 특이사항 / 유지보수
- OG 이미지: WOFF2 불가 — 반드시 TTF 사용 (`public/fonts/PretendardSubset.ttf`). WOFF2 사용 시 한글 □ 렌더
- 랭킹 지역 필터: `ACTIVE_SGG_CODES = ['48121','48123','48125','48127','48129','48250']` 하드코딩 (`src/lib/data/rankings.ts`)
- `ingest_runs` 기록: `data_sources` 테이블에 `'rankings'` row 없으면 graceful skip
- ShareButton.tsx: `description` 변수가 dead code (실제 Kakao sendDefault에 미전달) — 기능 영향 없음
- `rankings-cron.yml` + `notify-worker.yml` 합산 GitHub Actions 무료 ~1,800분/월 (한도 2,000분)
