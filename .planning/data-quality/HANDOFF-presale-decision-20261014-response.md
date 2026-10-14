# 회신 — 분양 뉴스 수집 1번 적용 + ⓐⓑ (2026-10-14)

**보내는 곳**: bds → ax-sub · **원 인계장**: `HANDOFF-presale-20261014-2.md` · `HANDOFF-presale-decision-20261014.md`

## 2차 인계 ③④⑥ 답

| | 답 |
|---|---|
| ③ | **(가)** 검수 화면 `/admin/presale-discoveries` 가 있고 `admin/data-ops` "검수 대기 N건" 에서 링크된다. 큐가 쓰레기라 볼 이유가 없었다 |
| ④ | 조회 키는 `name`(`bldNm`) 하나. `region` 은 안 넘긴다. 0건 원인은 API 가 이름 검색 미지원 + `mgmPmsrgstPk` 숫자/zod 문자열 |
| ⑥ | 의도 아님. 05-29 원본은 창원·마산·진해·김해. `2aa2153`(07-06) 회귀 |

## 3차 결정 적용 — ✅ `c124a28`

- 건축HUB 단계 제거, `src/services/arch-hub/client.ts` 삭제(유일한 호출부)
- 대상을 창원(마산·진해)·김해로 되돌림 — `src/lib/data/presale-news.ts`, 테스트 9건
- 지역은 카카오 주소로만 판정. `창원시`/`김해시` 가 아니거나 주소 없으면 `[SKIP] 대상 외` 로 미적재
- **ⓑ** 모든 종료 경로에서 `[runstat] job=crawl-presale-news status=ok|failed items=N target=M`
  (items = 감지 후보, target = 창원·김해 적재). 0건도 `status=ok target=0` 으로 찍힌다.
  덧붙여 적재 오류·예외·DB 조회 오류는 이제 exit 1 (이전엔 `main().catch(console.error)` 로 exit 0,
  조회 오류는 "없음"으로 읽혀 중복 적재로 이어질 수 있었다).
- 로컬 dry-run: 감지 54 → **12**, 대상 외 7, 기존 5, `target=0`. 문장 조각은 전부 "주소 없음"으로 걸러진다.

## ⓐ 기존 행 일괄 거절 — ✅ 115행 `rejected`, **1행은 남겼습니다**

- 115행: `status='rejected'`, `admin_notes='2026-10-14 일괄 거절 — 07-06 지역 회귀(2aa2153)로 수집된
  대상 외 건 (주소가 창원시·김해시가 아님/없음)'`, `updated_at` 갱신. 행 삭제 없음.
- **남긴 1행: `창원메가시티자이` (경남 창원시 진해구 여좌동 843-1)** — 새 판정식을 그대로 적용하면 통과하는
  유일한 행이라 `pending` 유지. 116행 전부를 거절하면 `(name, region)` 중복 검사가 rejected 행도 막아서
  이 실재 단지가 다시는 큐에 못 들어온다. 검수 큐는 지금 **1건**입니다.
- 변경 전 값 백업: `presale-discoveries-before-reject-20261014.json`

## 11-09 판단 — 동의

(a) `target=` 합계, (b) `confirmed_at` 수. 판단일 기록은 ax-sub STATUS.md 쪽으로 이해했습니다.
참고: (b) 의 분모에 오늘 남긴 1행이 포함됩니다 — 11-09 전에 승인되면 수정 후 수집분이 아니라 기존분입니다.

## 남은 것 (bds)

- 10-19 실행 후 `timeout-minutes: 30` 재조정 — 건축HUB 가 빠졌으니 ~2분대 예상. 워크플로의
  `MOLIT_API_KEY` env·주석도 그때 정리
- (LOW) 지오코딩이 `단지명 + ' 아파트'` size=1 이라 동명 브랜드 단지가 다른 도시로 잡힐 수 있다 — 대상 외로
  빠지는 쪽(보수적)이라 그대로 둠
