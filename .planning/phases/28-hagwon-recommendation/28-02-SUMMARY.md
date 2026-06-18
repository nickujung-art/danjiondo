---
plan: 28-02
phase: 28-hagwon-recommendation
status: complete
completed: 2026-06-18
---

# Summary: 28-02 NEIS 수집 + 지오코딩 스크립트

## What Was Built

- **scripts/fetch-hagwon-neis.ts**: NEIS acaInsTiInfo API 전수 수집 스크립트
  - 창원시 3,001건 + 김해시 1,600건 = 4,601건 확인 (dry-run)
  - pIndex 페이지네이션 (1000건/페이지), INFO-200 빈결과 처리
  - parseFeeAmount(수강료 파싱), parseEstablishedAt(YYYYMMDD→ISO)
  - aca_asnum onConflict upsert, 100건 배치, 500ms 딜레이
  - --dry-run / --zone=창원시 CLI 옵션

- **scripts/geocode-hagwon.ts**: Kakao 주소 검색 → PostGIS POINT
  - SRID=4326;POINT(lng lat) 형식 직접 업데이트
  - --missing-only(기본) / --all / --dry-run / --limit=N
  - 100ms 딜레이 (Kakao 일 100,000회 한도), 100건마다 진행 출력

## Self-Check: PASSED

- ✅ dry-run 실행: 창원시 3001건, 김해시 1600건 정상 출력
- ✅ grep -c "pIndex" ≥ 1, "INFO-200" ≥ 1, "parseFeeAmount" ≥ 1
- ✅ grep -c "KAKAO_REST_API_KEY" ≥ 1, "SRID=4326" ≥ 1
- ✅ npm run build 성공

## key-files

- created:
  - scripts/fetch-hagwon-neis.ts
  - scripts/geocode-hagwon.ts

## 실행 순서 (데이터 적재 시)

1. `npx tsx --env-file=.env.local scripts/fetch-hagwon-neis.ts --dry-run` (건수 확인)
2. `npx tsx --env-file=.env.local scripts/fetch-hagwon-neis.ts`
3. `npx tsx --env-file=.env.local scripts/geocode-hagwon.ts --missing-only`
