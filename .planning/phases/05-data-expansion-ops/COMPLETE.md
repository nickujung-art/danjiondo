# Phase 05 — 데이터 확장·운영 안정성 ✅ 완료 (2026-05)

## 구현 내용
- Wave 00: 프로덕션 DB 초기화 — `supabase db push` (22개 마이그레이션 적용), 10년치 MOLIT 실거래가 백필
- DATA-03: 재건축 타임라인 — `RedevelopmentTimeline` RSC (수평 step, `aria-current='step'`), `/admin/redevelopment` 입력 페이지, `upsertRedevelopmentProject` Server Action, admin write RLS 추가
- DATA-04: 가성비 4분면 차트 — `ValueQuadrantChart` (Recharts ScatterChart, `'use client'`), `getQuadrantData()` (server-only, 시·구 내 평당가×학군점수 중앙값 기준), 단지 상세 페이지 연동
- DATA-05: `listing_prices` 테이블 스키마 생성 + 어드민 수동 입력 UI — 갭 라벨 UI는 Phase 6 defer
- OPS-01: DB 백업 자동화 — `.github/workflows/db-backup.yml`, 매주 일요일 04:00 KST `pg_dump`, `danjiondo-backup` private repo, 90일 rolling cleanup

## 특이사항 / 유지보수
- `getQuadrantData`: `school_type='elementary'` (영문 enum) 사용 — DB check constraint가 영문만 허용 ('초등학교' 아님)
- 4분면 라벨: 좌상=가성비, 우상=프리미엄, 좌하=현실적, 우하=주의
- `ssr:false` dynamic import 제거 — Next.js 15에서 RSC에 적용 시 빌드 에러. `'use client'` 직접 import로 대체
- DB 백업: `SUPABASE_DB_URL`은 Direct connection URI 필요 (Transaction Pooler URL은 pg_dump 비호환)
- 백업 setup: `BACKUP_PAT` (Fine-grained PAT, danjiondo-backup Contents write만) GitHub Secret 등록 필요
- 갭 라벨 UI (`listing_prices` 매물가 vs 실거래가 갭 표시)는 Phase 6 KB시세 API 연동 후 구현
- Server Actions 디렉토리: `src/lib/auth/`(인증 관련)와 `src/lib/actions/`(도메인 actions) 분리
