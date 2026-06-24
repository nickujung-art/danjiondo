# Wave 1 Execution Summary

**Date:** 2026-06-24
**Status:** PASS

## Task Results

| Task | Status | Notes |
|------|--------|-------|
| 1.1 Font Setup | OK | Pretendard 5개 woff2 다운로드 완료 (Black/ExtraBold/Bold/SemiBold/Medium) |
| 1.2 Dry-run HTML | OK | 버그 발견 및 수정 후 성공. 4개 HTML 파일 생성 (성산구 84㎡ 실거래 10개 로드) |
| 1.3 PNG Generation | OK | 4개 PNG 생성 완료 (57~88KB) |
| 1.4 Dimension Verify | OK | 4개 파일 모두 1080x1080 확인 |
| 1.5 Full Run | OK | 18개 시리즈 / 72개 PNG 생성 완료. 에러 없음 |
| 1.6 Edge Case | OK | 59-jinhae: 실거래 2개 + 플레이스홀더 8개 = 정상 10행 |

## PNG File Sizes (84-seongsan 기준)

| 파일 | 크기 |
|------|------|
| 01-cover.png | 71KB |
| 02-highlight.png | 72KB |
| 03-ranking.png | 88KB |
| 04-closing.png | 57KB |

참고: 예상(150-700KB)보다 작지만 5KB(빈 이미지)와는 확연히 다름.
PNG는 텍스트 위주 + 평면 색상 콘텐츠에서 고압축되므로 정상 범위.
1080×1080 해상도 OK, 내용 정상 렌더링 확인.

## BUG-1 검증

성산구 Top 3: 용지아이파크 / 창원 센텀 푸르지오 / 트리비앙아파트
의창구 Top 3: LH피닉스포레 / 감계아내에코프리미엄2차 / 감계힐스테이트2차
-> 서로 다른 데이터 정상 표시 확인

## Errors Found

None — 수정 후 전체 파이프라인 정상 동작

## Bugs Fixed

### Bug 1: capture.js 직접 실행 감지 로직 오류 (commit cbf98d0)

**현상:** `node scripts/generate.js --dry-run --series=84-seongsan` 실행 시 아래 에러:
```
Error: ENOENT: no such file or directory, open '...card-news\--dry-run'
```

**원인:** `capture.js` 하단의 디버그용 직접 실행 블록이 ESM 모듈로 import될 때도
`process.argv[2]`가 truthy이면 실행됨. generate.js가 `--dry-run` 인수를 가지고 실행되면
capture.js가 import되는 시점에 `process.argv[2]`가 `'--dry-run'`이 되어 파일 읽기 시도.

**수정:**
```javascript
// 이전 (잘못된 감지)
if (process.argv[2]) { ... }

// 수정 (ESM 올바른 직접 실행 감지)
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isDirectRun && process.argv[2]) { ... }
```

**파일:** `card-news/scripts/capture.js`

## 시리즈 전체 목록 (18개 생성 완료)

구별 평형 랭킹 (14개): 84-seongsan, 84-uichang, 84-masanhappo, 84-masanhoewon, 84-jinhae, 84-gimhae, 59-seongsan, 59-uichang, 59-masanhappo, 59-masanhoewon, 59-jinhae, 59-gimhae, 102-seongsan, 102-uichang

도시 전체 (3개): city-overall, city-volume, city-value-84

특별 (1개): district-champions

**총 PNG: 72개 (18 × 4)**
