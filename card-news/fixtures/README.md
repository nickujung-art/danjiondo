# card-news/fixtures — 골든 회귀 픽스처

Phase 40-01에서 만들었다. **카드뉴스 렌더 결과가 바뀌지 않았음을 바이트 단위로 증명**하는 데 쓴다.

## 파일

| 경로 | 내용 |
|---|---|
| `snapshot-golden.json` | 4개 시리즈의 `data` 객체 동결본. `generate.js --dump-data` 산출물 |
| `golden/2026-W24/**/*.html` | 위 스냅샷을 `templates.js` 로 렌더한 HTML **14개** |
| `.gitattributes` | `* -text` — 이 저장소는 `core.autocrlf=true` 라, 없으면 체크아웃 때 LF→CRLF 변환으로 골든 대조가 전부 깨진다 |

## 사용법

```bash
# 골든 회귀 테스트 (DB 불필요)
node card-news/scripts/templates-golden.test.mjs      # 14 passed / 0 failed

# 골든 재생성 (템플릿을 의도적으로 바꿨을 때만)
cd card-news
node scripts/generate.js --data=fixtures/snapshot-golden.json --dry-run --out=fixtures/golden
```

## 스냅샷 시리즈 선정 근거

`renderRanking` 은 `seriesType` 으로 **3분기**한다 (`templates.js:242-245`):

| seriesType | headerLabel | captionNote |
|---|---|---|
| `area`(기본) / `city` | 실거래가 순위 1~10위 | 단위: 만원 |
| `volume` | 거래량 순위 1~10위 | 단위: 거래 건수 |
| `value` | 가성비 순위 1~10위 (평당가 ↓) | 84㎡ 기준 평당 거래가 낮은 순 |

세 분기 + `renderDistrictChampionsCard` 를 전부 지나가는 **최소 집합**이 아래 4개다:

- `84-seongsan` — `area` 분기. `subtitle` 없는 랭킹 행(`fetchAreaRanking`)
- `city-volume` — `volume` 분기. `price = "7건"`, `subtitle = gu`
- `city-value-84` — `value` 분기. `price = "292만/평"`, `subtitle = gu`
- `district-champions` — `renderDistrictChampionsCard` + `renderClosing`

`city-overall` 은 `84-seongsan` 과 같은 렌더 분기라 제외했다.

스냅샷 기간: `--from=2026-06-14 --to=2026-06-20` (weekCode `2026-W24`).

## 🔴 `card-news/output/` 의 아카이브 16개를 기준으로 쓰지 말 것

40-CONTEXT D-01 초안은 *"`output/` 의 기존 HTML 16개를 회귀 기준으로 쓸 수 있다"* 고 썼으나
**틀렸다.** 아카이브는 2026-06-24·06-29 산출물이고 그 뒤 `templates.js` 디자인이
**의도적으로** 바뀌었다. 데이터 비의존 완전 정적 함수인 `renderClosing` 조차
아카이브 4/4 와 불일치한다:

```
NEW: .card { … padding:100px; }      OLD: .card { … padding:80px; }
NEW: .h2   { font:900 88px/1.15 …    OLD: .h2   { font:900 76px/1.15 …
NEW: .btn  { padding:20px 44px; …    OLD: .btn  { padding:16px 36px; …
```

아카이브를 기준으로 삼으면 **첫 대조에서 오경보로 중단**된다.
아카이브는 참고 자료로만 보존한다 — 삭제·수정·재생성하지 않는다.

## 개인정보

스냅샷에는 **단지명·가격·구 이름**만 들어 있다. 개인정보·비밀값 없음 (커밋 대상).

## 한계

`card-news/` 는 독립 npm 패키지이고, 루트 vitest 는 `include: ['src/**/*.test.{ts,tsx}']` 라
**이 테스트를 실행하지 않는다.** 수동 실행이 유일한 경로다. CI 편입 여부는 사용자 판단.
