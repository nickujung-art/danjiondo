# Phase 10 — 교육 환경 고도화 ✅ 완료 (2026-05)

## 구현 내용
- EDU-01 배정학교: 학구도 Shapefile(EPSG:5186) → PostGIS import, `ST_Within`으로 배정 자동 판별
  - `school_districts` + `school_district_schools` 테이블 (마이그레이션 `20260515000001`)
  - `scripts/import-school-districts.ts` (Node.js 수동 SHP/DBF 파싱 — ogr2ogr 대체)
  - `scripts/update-assignment-flags.ts` — `facility_school.is_assignment = true` 업데이트
  - 창원+김해만 필터: 초등 200개 + 중등 31개 폴리곤 (전국 7,123개 중 234개)
  - 고등학교: 창원·김해 평준화 지역 → is_assignment 미업데이트 (UI에서 배정 배지 없음)
- EDU-02 유치원/어린이집 분리: `poi_name LIKE '%유치원%'` 필터, 각 최대 3개씩 분리 표시
- EDU-03 학원 UX: 펼치기/접기("외 N개 더보기"), si별 백분위 라벨
  - `hagwon_score_percentile_by_si(target_score, p_si)` RPC 추가
- EDU-04 도보 시간 색깔: 10분 이내 녹색 / 10~15분 노랑 / 15분+ 빨강 (SVG stroke + 텍스트)
- EDU-05 학원 카테고리 태그: `classifyHagwon()` 순수 함수 (수학/영어/예체능/국어/과학/중국어·일어/기타)
- `EducationCard.tsx` 전면 재작성, `page.tsx`에 `si` prop 추가

## 특이사항 / 유지보수
- 학구도 데이터는 1회성 적재 — Shapefile 업데이트 시 `import-school-districts.ts` 재실행
- 다중 배정 학구(68개): 한 단지에 초등 배정학교 2개 표시 가능 (정상)
- `school_name` 매칭은 CSV 정확 일치 — 학교명 변경 시 dry-run 출력으로 불일치 목록 확인
- `poi_name LIKE '%병설%유치원%'` 케이스도 유치원으로 분류
- 테스트: `hagwon-category.test.ts` 9/9, `facility-edu.test.ts` 4/4 GREEN
