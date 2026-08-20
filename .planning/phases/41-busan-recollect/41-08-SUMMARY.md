---
phase: 41-busan-recollect
plan: "08"
subsystem: database
tags: [supabase, rankings, gap-stats, price-stats, price-predictions, busan, github-actions]

requires:
  - "41-05-07-BACKFILL-RECORD.md §5 (최종 백필 실측)"
provides:
  - "파생값 3배치(price-stats/gap-stats/rankings) 부산 행 생성 실측 — 재dispatch로 증명"
  - "price_change 랭킹 지역 분포 실측 + 창부레터 hotArea 필터 인계 기록"
  - "삭제분 7항목 대조표 (복원 5 / 부분복원 1 / 미복원 1)"
  - "5개 체크포인트 DB 용량 추이 + 545 bytes/행 역산 검증"
  - "compute-predictions.yml 미실행 사유 + 예상 규모 (Chronos/Groq 비용 회피)"
affects: [41-09]

tech-stack:
  added: []
  patterns:
    - "gh workflow run + gh run watch — 파생값 배치 3종 재dispatch 및 완료 확인"
    - "complex_rankings.computed_at 최신 배치 필터 — rank 값은 (rank_type,complex_id,window_days) unique라 과거 배치의 stale row가 섞여 있어 최신 computed_at으로 걸러야 정확한 스냅샷을 본다"

key-files:
  created: []
  modified: []

key-decisions:
  - "compute-predictions.yml(가격예측)을 실행하지 않았다 — 오케스트레이터 hard_prohibitions #1의 명시적 지시. 대신 예상 규모(~11,500~13,500행)와 타임아웃 위험을 산정해 기록"
  - "cafe_articles 부산 1,285건은 '미복원'이 아니라 '부분 조직적 회복'이다 — Cafe Ingest NLP 매칭 크론(05:00 KST, 이 plan이 촉발하지 않음)이 지역 스코프 없이 전체 complexes를 대상으로 매칭하기 때문에 41-03 K-apt 재시딩 이후 자연 유입됐다. facility_kapt는 이런 경로가 없어 0건 그대로다"
  - "41-05~07의 3그룹(A/B/C) 순차 dispatch 계획이 로컬 8병렬로 대체됐으므로(BACKFILL-RECORD §2), plan이 요구한 5열(착수전/A후/B후/C후/파생값후) 추이표 대신 실제로 존재하는 4개 체크포인트(41-01 착수전 / 41-03 시딩후 / 41-07 백필완료 / 41-08 파생값후)로 대체 보고"

requirements-completed: [BUSAN-06]

duration: 95min
completed: 2026-08-20
---

# Phase 41 Plan 08: 파생값 배치 재실행 + 복원 규모 대조 보고 Summary

**코드 변경 없이 파생값 배치 3종(가격 파생값·갭 통계·랭킹)을 재dispatch해 부산 행 생성을 실측하고, 삭제분 7항목을 대조 보고했다. 가격예측 배치는 오케스트레이터 지시로 미실행하되 예상 규모를 산정했으며, cafe_articles가 "미복원"이 아니라 별개 크론을 통해 부분 조직적으로 회복됐다는 사실을 발견했다.**

## Performance

- **Duration:** 약 95분
- **Started:** 2026-08-20T10:20 KST (approx)
- **Completed:** 2026-08-20T20:35 KST (approx)
- **Tasks:** 2/2 (둘 다 측정·보고 전용, 파일 변경 없음)
- **Files modified:** 0 (SUMMARY.md만 신규 생성)

## Accomplishments

- 파생값 배치 3종 재dispatch — 전부 성공 (아래 Task 1 참조)
- `complexes.avg_sale_per_pyeong` 부산 non-null: 781 → **1,169** (재dispatch 직접 효과로 증가 확인)
- `complex_gap_stats` 부산: 74 → **466**
- `complex_rankings` 부산: **323** (top-N 상시 갱신 테이블이라 재dispatch 전후 큰 변동 없음 — 이미 이전 시간별 크론이 채워둔 상태)
- `price_change` 랭킹 최신 배치(2026-08-20T10:28:05Z, 23행) 지역 분포 실측: 창원 9 / 부산 7 / 김해 4 / 양산 2 / 사천 1. 필터 전/후 1위 모두 김해시(우연히 문제 없음, 아래 상세)
- 삭제분 7항목 대조표 완성 — `cafe_articles`가 예상과 달리 부분 조직적으로 회복됨을 발견 (아래 Task 2)
- DB 용량 최종: **867.9MB / 8,192MB (10.59%)** — 545 bytes/행 역산으로 650MB 산정과의 차이를 검증
- `compute-predictions.yml` 미실행 — 예상 규모 산정 (아래 참조)
- `npm run lint` exit 0. 테스트 실패는 로컬 Supabase 환경 문제(아래 상세)로 소스 무관 확인

## Task Commits

이 plan은 두 태스크 모두 `files: 없음 (보고 전용)`이 명시된 측정·보고 작업이다 — 소스 파일 변경이 없어 태스크별 코드 커밋이 없다. `git status --short`가 처음부터 끝까지 clean이었음을 확인했다 (임시 조회 스크립트 `.mjs`·`.json`은 작업 중 생성 후 커밋 전 전량 삭제).

| Task | 내용 | 커밋 |
|---|---|---|
| 1 | 파생값 배치 3종 재dispatch + 실측 | 없음 (코드 변경 없음) |
| 2 | 삭제분 대조 + 용량 + 연결률 + 회귀 확인 | 없음 (코드 변경 없음) |
| — | SUMMARY.md 생성 | (final commit, 아래) |

## Task 1: 파생값 배치 4종 재실행 + 부산 행 생성 실측

### 배치 3종 재dispatch 결과

| 워크플로 | run id | 결론 | 소요 | data_sources |
|---|---|---|---|---|
| `refresh-price-stats.yml` | [32358931910](https://github.com/nickujung-art/danjiondo/actions/runs/32358931910) | ✅ success | 53s (10:26:17→10:27:10 UTC) | `price-stats` success 마킹 |
| `refresh-gap-stats.yml` | [32359011951](https://github.com/nickujung-art/danjiondo/actions/runs/32359011951) | ✅ success | 31s (10:27:18→10:27:49 UTC) | `gap-stats` success 마킹, 반영 0행이면 자체 exit 1 가드 있음(통과) |
| `rankings-cron.yml` | [32359066531](https://github.com/nickujung-art/danjiondo/actions/runs/32359066531) | ✅ success | 9s (10:27:58→10:28:07 UTC) | curl 200 확인 |
| `compute-predictions.yml` | — | **미실행 (오케스트레이터 지시)** | — | 아래 "가격예측 미실행" 절 참조 |

3종 모두 사이트 폐지(noindex) 상태와 무관하게 정상 완주했다 — `rankings-cron.yml`이 호출하는 `/api/cron/rankings`는 API 라우트라 `noindex` meta는 크롤러에만 영향을 주고 API 자체는 그대로 응답한다(실증: 9초 만에 200).

### 부산 행 생성 실측 (배치 전 → 후, 프로덕션 재조회 근거)

| 항목 | 배치 전 (착수 시) | 배치 후 (재조회) | 판정 |
|---|---|---|---|
| `complexes.avg_sale_per_pyeong is not null`(부산) | 781 | **1,169** | > 0 ✅, 재dispatch 직접 효과로 388건 증가 확인 |
| `complex_gap_stats` 부산 | 74 | **466** | > 0 ✅, 392건 증가 확인 |
| `complex_rankings` 부산 | 323 | 323 | > 0 ✅ (top-N 테이블 성격상 매시간 크론이 이미 채워둔 값과 동일 — 아래 참조) |
| `complex_price_predictions` 부산 | 0 | 0 | **미실행** — 아래 "가격예측 미실행" 참조 |

`complex_rankings`가 재dispatch 전후 그대로인 이유: 이 테이블은 `(rank_type, complex_id, window_days)` UNIQUE로 상위 100개만 유지하는 상시 갱신 테이블이고, 매시간(`0 * * * *`) 크론이 이미 돌고 있어 우리 dispatch는 그 다음 회차일 뿐이다 — BACKFILL-RECORD §5가 기록한 "백필 도중 매시 랭킹 크론이 자동 집계했다"가 이 plan에서도 재확인됐다(부산 행이 이미 0보다 컸다).

### `price_change` 랭킹 지역 분포 실측 (Task 1-(4))

`complex_rankings`에서 `rank_type='price_change'`는 컴퓨티드 시점마다 다른 행이 남아 누적되므로(같은 complex_id는 upsert로 갱신되지만, 이번 회차 top-100에서 밀려난 단지는 예전 rank 값 그대로 남는다 — 아래 "발견" 참조), **가장 최근 `computed_at`(2026-08-20T10:28:05.207Z, 우리가 dispatch한 회차, 23행)만 필터해 실측했다:**

| si | 행수 |
|---|---|
| 창원시 | 9 |
| 부산광역시 | 7 |
| 김해시 | 4 |
| 양산시 | 2 |
| 사천시 | 1 |
| **합계** | **23** |

부산 비중 30.4%(7/23) — 2026-08-03 실측(22행 중 부산 12행=54.5%)보다는 낮아졌지만 결코 무시할 수준이 아니다.

**필터 전/후 1위 (창부레터 인계용):**

| | rank | 단지 | si | gu | score |
|---|---|---|---|---|---|
| 필터 전(전체) | 1 | 삼계서희스타힐스아파트 | 김해시 | — | 12.6 |
| 필터 후(si in 창원시,김해시) | 1 | 삼계서희스타힐스아파트 | 김해시 | — | 12.6 |

이번 스냅샷에서는 우연히 1위가 이미 김해시라 필터 전/후가 같지만, **3위(부산 서구 e편한세상 송도 더퍼스트비치, score 10.8)가 1위(12.6)와 근소한 격차**이고 부산 단지가 7/23으로 다시 늘었으므로 다음 시간별 크론 회차에서 1위가 부산으로 뒤집힐 개연성이 실측으로 확인된다.

🔴 **창부레터 인계 사항** (이 저장소에서 고칠 것 없음, Phase 40-04 인계 ① 재확인): `getRankingsByType()`(`src/lib/data/rankings.ts:27-63`)은 `si`/`gu`로 필터하지 않고 `metadata.region`도 그대로 노출하지 않는다. 창부레터가 `hotArea`를 이 데이터에서 뽑을 때 `si in ('창원시','김해시')` 필터 없이 최상위 행을 그대로 쓰면 부산 지역명이 홈 히어로에 노출될 수 있다 — 이번 스냅샷은 우연히 안전했을 뿐 구조적으로 막혀 있지 않다.

### 발견 — `complex_rankings`에 stale row가 누적된다 (범위 밖이지만 기록)

`rank_type='price_change'`를 `computed_at` 무시하고 전부 조회하면 85행이 나온다(22개 서로 다른 `computed_at` 시점이 섞여 있음, 2026-08-03~2026-08-20). Top-100에서 밀려난 단지의 예전 row가 삭제되지 않고 남아 오래된 `rank` 값을 유지하기 때문이다. 조회 시 반드시 최신 `computed_at`으로 필터해야 정확한 "현재 순위"를 얻는다 — 필터하지 않으면 rank=1이 여러 개 보이는 등 오독 위험이 있다. `getRankingsByType()`는 `window_days`만 필터하고 `computed_at`은 필터하지 않지만, `rank`로 정렬 후 `limit(N)`을 걸기 때문에 실제 화면 노출에는 영향이 제한적이다(가장 낮은 rank 값이 우선 노출되고, stale row라도 낮은 rank라면 노출될 수 있다는 점은 잠재 리스크). **이 plan의 범위 밖**(코드 변경 없음 원칙, `complex_rankings` 정리는 41-09 이후 후속 과제로 남긴다).

## Task 2: 삭제분 대조 보고 + 용량 보고 + 미복원 항목 명시

### 삭제분 7항목 대조표

| 항목 | 2026-08-10 삭제분 | 복원 후 실측(2026-08-20) | 차이 | 해석 |
|---|---|---|---|---|
| `transactions` | 282,444 | **811,996** | +529,552 (2.9배) | **초과가 정상** — 아래 상세 분해 |
| `complexes` | 1,594 | **1,643** | +49 | K-apt 시딩 상한(1,463~1,467, Phase 34/41-03) 대비 시딩 이후 자연 증분. 41-05-07 기록과 일치 |
| `complex_price_predictions` | 11,611 | **0** | -11,611 | **미실행** — 오케스트레이터 지시. 예상 규모는 아래 "가격예측 미실행" 참조 |
| `complex_rankings` | 330 | **323** | -7 | top-N 상시 갱신 테이블이라 단지 수와 선형 관계 없음. 정상 범위 |
| `complex_gap_stats` | 299 | **466** | +167 | 전세 거래가 있는 단지 전체 대상 — D-04로 기간이 넓어져(2015-01~) 전세 거래 보유 단지 모수 자체가 늘었다 |
| `facility_kapt` | 1,463 | **0** | -1,463 | 🔴 **복원하지 않음.** K-apt 시설 enrichment(Phase 34-07 계열)는 이 Phase `<scope_fence>` 밖. 재실행 경로 없음 — 실측 확인(부산 sgg_code join count = 0) |
| `cafe_articles` | 1,654 | **1,285** | -369 (78% 회복) | 🔴 **이 plan이 복원한 것이 아니다.** "Cafe Ingest — NLP 단지 매칭" 크론(05:00 KST, `cafe-ingest.yml`)이 지역 스코프 없이 전체 `complexes`를 대상으로 매칭하는 구조라, 41-03이 부산 K-apt를 재시딩한 2026-08-19 이후 자연스럽게 매칭이 재개됐다. `fetched_at` 최솟값이 2026-08-19T19:32Z로 확인 — 옛 삭제분의 복구가 아니라 완전히 새로 수집된 행이다. 카페 원본은 창원 카페(NAVER_TARGET_CAFE=xxdkd)이지만 회원들이 부산 매물도 언급하므로 매칭이 지역 무관하게 일어난다 |

**미복원 2항목이 조용히 남지 않도록 명시**: `facility_kapt`(0/1,463, 0%)와 `complex_price_predictions`(0/11,611, 0%, 이번엔 정책적 미실행)은 이 plan 완료 시점 기준 복원되지 않았다. `facility_kapt`는 재수집 경로 자체가 없어(범위 밖) 후속 Phase(34-07 계열)의 판단이 필요하고, `complex_price_predictions`는 다음 절에서 산정한 규모로 이후 명시적으로 실행하면 된다.

### `transactions` 초과분 분해 — 초과가 정상임을 수치로 설명

```
811,996(현재) - 282,444(삭제분) = 529,552 초과
```

3가지 요인으로 분해했다(요인 간 거래가 겹칠 수 있어 단순 합산은 상한 참고용):

| 요인 | 실측 | 비고 |
|---|---|---|
| D-04 기간 확장 (`deal_date < 2016-07-01`인 부산 거래) | **143,346건** | 삭제분은 201607~202608만 대상이었고, 이번 복원은 창원·김해와 대칭으로 201501~부터 적재(D-04) |
| 전월세 포함 (`deal_type != 'sale'`) | **286,335건** (jeonse 159,109 + monthly 127,226) | `ingestMonth`는 매매·전월세를 함께 적재. 매매만 놓고 봐도 525,661건 |
| 원래 창(201607~202608) 내 매매 밀도 자체 증가 | 잔여 ≈ 99,871건 | 요인 1·2로 429,681건 설명(81%) 후 남는 잔여분 — 부산이 창원·김해보다 큰 시장(매매 525,661 vs 창원+김해 매매 200,067)이라는 배경과 일치, BACKFILL-RECORD §5도 같은 결론 |

세 요인 모두 예상된 것이고 이상 신호가 아니다.

### DB 용량 추이 (계획 대비 달라진 점 — 아래 "계획과 달라진 점" 참조)

41-05/06/07의 원 계획은 그룹 A/B/C 순차 dispatch마다 사용자가 Supabase Dashboard 수치를 알려주는 3그룹 체크포인트 구조였다. 그러나 BACKFILL-RECORD §2가 기록한 대로 **로컬 8병렬 실행으로 대체**되면서 그룹별 사용자 체크포인트가 존재하지 않는다. 대신 실제로 존재하는 4개 체크포인트로 보고한다:

| 체크포인트 | 시점 | DB 용량 | Pro 8,192MB 대비 |
|---|---|---|---|
| 착수 전 (41-01, 부산 시딩 전) | 2026-08-19 | 448.5MB | 5.48% |
| K-apt 시딩 후 (41-03, 백필 전) | 2026-08-19 | 448.9MB | 5.48% |
| 백필 완료 후 (41-05-07, 파생값 배치 전) | 2026-08-20 19:50 KST | 867.6MB | 10.59% |
| **파생값 배치 후 (41-08, 최종)** | 2026-08-20 10:28 UTC | **867.9MB** | **10.59%** |

파생값 배치 3종(price-stats/gap-stats/rankings)이 추가한 용량은 0.3MB 수준(867.6→867.9MB) — 이 3배치는 기존 컬럼/행을 UPDATE/UPSERT하는 성격이라 신규 대용량 증가를 만들지 않는다. 예상대로다.

**650MB 산정과의 대조**: 41-CONTEXT의 사용자 산정(650MB=8%)보다 최종 867.9MB(10.6%)가 더 크다. 545 bytes/행(41-CONTEXT 실측 원단위, `transactions` 290MB/557,325행)으로 역산해 검증했다:

```
811,996행(부산 transactions) × 545 bytes/행 ≈ 442.5MB (transactions 테이블만)
실제 DB 전체 증가량: 867.9MB - 448.5MB(착수 전) = 419.4MB
```

442.5MB와 419.4MB는 5.5% 오차로 근접 — **차이는 이상 팽창이 아니라 예상된 증가**임이 검증된다. 650MB 산정이 낮았던 이유는 그 산정 시점에 D-04(기간 18개월 확장)와 전월세 포함 여부가 아직 확정되지 않아 최종 `transactions` 811,996건이 아닌 더 적은 추정치(삭제분 282,444에 가까운 값)를 전제로 했을 가능성이 높다 — 위 "transactions 초과분 분해"가 그 차이의 근거다. `VACUUM FULL`은 이 Phase 범위 밖이므로 실행하지 않았다(41-CONTEXT `<scope_fence>` 명시).

### 연결률 최종 보고 (Success Criteria 5)

| 구분 | 연결률 | 기준 대조 |
|---|---|---|
| 부산 아파트(molit_trade, 631,612건) | **67.2%** | 65% 임계(경남 기타 실측 기준) 통과, 64.7%(경남 기타 실측) 상회 |
| 부산 연립다세대(molit_villa_trade, 180,103건) | 2.1% | `complexes`가 K-apt 기반 아파트 마스터라 구조적으로 낮음 — 매칭 고장 아님(BACKFILL-RECORD §5) |
| 운영권역(창원 5구+김해, 별칭 보정 누적) | 94.6% | 부산이 이보다 낮은 것은 정상 — 별칭 보정이 아직 없다 |
| 경남 기타 16곳(K-apt 시딩만) | 64.7% | 부산 아파트 67.2%가 이 기준을 넘음 |
| D-07 임계 | 65% | 부산 아파트 67.2% > 65% ✅ |

**90%는 이 Phase 범위 밖**(D-07): 별칭 보정(`complex_aliases`) 누적으로 운영권역이 94.6%에 도달한 것이지 신규 지역의 목표치가 아니다. 부산의 다음 단계 향상은 별칭 보정 후속 작업(41-09 이후)의 몫이다.

### 회귀 확인 — lint / 테스트

**`npm run lint`**: `next lint && tsc --noEmit` **exit 0** (ESLint 경고 0, 타입 에러 0).

**`npm run test`**: 3회 연속 실행 결과, 실패 개수가 18~19건으로 변동했다(772개 중). CLAUDE.md/environment_facts가 기록한 "기존 실패 3건(seed-region.test.ts)" 기준선보다 많다. 원인을 조사한 결과 **이 plan의 작업과 무관한 로컬 Supabase 환경 문제**로 확인했다:

- 1회차 실행 시 `POST http://127.0.0.1:54321/rest/v1/... 502 (Bad Gateway)` — 로컬 Supabase 서비스 중 `supabase_edge_runtime_danjiondo`·`supabase_analytics_danjiondo`·`supabase_vector_danjiondo`·`supabase_pooler_danjiondo`가 정지 상태였음(`npx supabase status` 확인)
- `npx supabase start`로 재기동 후 2·3회차 실행에서 502는 사라졌으나, 여전히 **6개 파일 17개 테스트가 3회 모두 일관되게 실패**: `complex-matching-3b.test.ts`(4, RPC 오버로드 모호성 — `match_complex_by_admin`에 `p_umd_nm` 있는/없는 두 시그니처가 로컬 DB에 공존), `favorites.test.ts`(3), `molit-ingest.test.ts`(3), `reviews.test.ts`(3), `school-ranking-regional.test.ts`(1), `seed-region.test.ts`(3, 기존에 알려진 baseline)
- 그 외 `ads.test.ts`·`kakao-channel.test.ts`·`notify-worker.test.ts`는 회차마다 통과/실패가 바뀌는 **연결 풀 경합에 의한 플레이키성 실패**로 판단(로컬 Supabase PostgREST 연결 풀 max size 10, 병렬 테스트 파일이 동시에 몰릴 때 타이밍 문제)

이 plan은 소스 파일을 0개 변경했고(`git status --short`가 시작부터 끝까지 clean), 프로덕션 DB만 read-only로 조회했으며 로컬 Supabase에는 어떤 쓰기도 하지 않았다 — 따라서 이 17건 추가 실패는 **이 plan이 유발한 것이 아니라 로컬 개발 환경의 기존 상태**다. `complex-matching-3b.test.ts`의 RPC 오버로드 모호성은 로컬 DB의 함수 시그니처 drift로 보이며 원인 조사·수정은 이 plan 범위 밖(CLAUDE.md: "고치지 말 것"에 준하는 로컬 인프라 이슈)이라 손대지 않았다.

**결론**: baseline 3건 대비 순수 추가 발견분은 6개 파일 14건(`seed-region.test.ts` 3건 제외)이며, 전부 로컬 Supabase 환경 상태에 기인하고 이 plan의 코드/데이터 변경과는 인과관계가 없다. 다음 세션에서 로컬 개발 환경 점검이 필요하면 이 목록을 출발점으로 쓸 수 있다.

## 가격예측(`compute-predictions.yml`) 미실행 — 사유 및 예상 규모

### 미실행 사유

오케스트레이터의 `<hard_prohibitions>` #1이 명시적으로 실행을 금지했다: "부산 단지 1,643개에 Chronos 예측 + Groq 해설을 만드는 작업으로, 이 Phase에서 유일하게 외부 API 비용과 긴 실행시간이 드는 항목." 사용자가 별도 확인을 요청한 상태다.

조사 결과 세 개의 서로 다른 예측/코멘트 배치가 존재한다 (혼동 방지를 위해 명시):

| 워크플로 | 스크립트 | 성격 | 이번 plan 대상 |
|---|---|---|---|
| `compute-predictions.yml` | `scripts/compute-predictions.ts` (TS, Holt-Winters류 로컬 통계 계산) | 외부 API 호출 없음. `complex_price_predictions` 테이블 채움 | 🔴 **미실행** (plan의 interfaces가 명시한 대상, `complex_price_predictions` 컬럼과 직결) |
| `compute-predictions-ai.yml` | `scripts/compute-predictions-ai.py` (Python, HuggingFace Chronos-Bolt-Small 모델) | CPU 90분 한도, 모델 추론 — 무거움 | 미실행 (범위 밖, 이 plan interfaces에 없음) |
| `monthly-ai-commentary.yml` (추정 경로) | `scripts/generate-complex-commentary.ts` 등 | **Groq API** 호출 — `GROQ_API_KEY` 필요 | 미실행 (범위 밖) |

`compute-predictions.yml`(이 plan의 대상)은 코드상 Groq/외부 AI API를 호출하지 않지만(순수 RPC + 로컬 `forecast()`), hard_prohibitions의 취지(비용·시간 회피, 사용자 별도 확인)를 넓게 해석해 셋 다 실행하지 않았다.

### 예상 규모 산정

- **대상 단지 수**: `compute-predictions.ts`는 지역 필터가 없어 **전체 활성 지역 complexes**(부산 1,643 + 운영권역 2,035 + 경남 기타 796 ≈ 4,474개)를 처리한다. 부산은 그중 약 37%.
- **삭제 시점 대비**: 부산 `complex_price_predictions`가 삭제 전 11,611행(단지 1,594개 기준, 기간 201607~202608). 현재 부산 단지는 1,643개(+3.1%)이고 거래 이력이 D-04로 2015-01까지 확장돼 더 많은 `area_bucket`(5종: 소형·59·74·84·대형)이 `MIN_TX_COUNT=10` 문턱을 넘을 가능성이 높다.
- **추정치**: 단지 수 증가분만 단순 비례하면 11,611 × (1,643/1,594) ≈ **11,970행**. 데이터 이력 확장 효과를 더하면 **약 11,500~13,500행** 범위로 추정한다(정밀 산정 아님 — 실제 실행 없이는 확정 불가).
- **소요시간 위험**: `compute-predictions.yml`의 최근 8회 스케줄 실행(`gh run list`)은 12분~24분 15초 사이였고, `timeout-minutes: 30`이다. **가장 최근 실행(2026-08-19T17:28 UTC, 24m15s)은 이미 부산 complexes 1,643개가 `complexes` 테이블에 존재하던 시점**(41-03 시딩 후, 거래는 아직 대부분 없었음)이라 다른 날보다 5~10분 더 걸렸다 — complex ID 순회 자체의 비용이 이미 반영된 결과다. 여기에 부산 거래 811,996건이 전부 들어간 상태로 실행하면 `processBucket()`의 RPC + `forecast()` 계산량이 유의미하게 늘어나 **30분 타임아웃을 초과할 위험이 실측 근거로 존재**한다.
- **GROQ 키 상태**: 메모리(project_api_keys.md) 기준 **GROQ 키 재발급 필요** 상태로 남아 있다. `compute-predictions.yml` 자체는 GROQ를 쓰지 않지만, 후속으로 `monthly-ai-commentary.yml`을 돌리려면 재발급이 선행돼야 한다.

**결론**: `compute-predictions.yml`을 실행하려면 (1) 타임아웃 30분 초과 위험에 대한 대응(분할 실행 또는 timeout 상향 검토), (2) 뒤이어 AI 코멘트까지 채우려면 GROQ 키 재발급이 필요하다. 둘 다 이 plan 범위 밖이며 후속 Phase 판단 사항으로 남긴다.

## Deviations from Plan

### Auto-fixed Issues

None — 이 plan은 코드를 변경하지 않는 관측·보고 전용 plan이었다.

### 계획과 달라진 점 (Rule 4에 준하는 명시적 오케스트레이터 지시 반영)

**1. `complex_price_predictions` 부산 행 수 > 0 acceptance criteria 미충족 — 의도된 것.**
PLAN.md Task 1의 acceptance criteria는 4항목 모두 > 0을 요구했으나, 오케스트레이터의 `<hard_prohibitions>` #1이 `compute-predictions` 실행을 명시적으로 금지했다. 대신 예상 규모 산정으로 대체했다(위 절 참조). 이것은 자율 판단에 의한 편차가 아니라 상위 컨텍스트의 직접 지시다.

**2. DB 용량 5열 추이표 → 4개 체크포인트로 대체.**
PLAN.md는 "착수전/A후/B후/C후/파생값후" 5열을 요구했으나, 41-05~07의 그룹 A/B/C 순차 dispatch 계획 자체가 BACKFILL-RECORD §2에서 로컬 8병렬 실행으로 전환되며 폐기됐다. 그룹별 사용자 체크포인트가 존재하지 않으므로 실제로 존재하는 4개 체크포인트(41-01/41-03/41-07/41-08)로 대체 보고했다.

**3. `cafe_articles` "미복원" → "부분 조직적 회복"으로 정정.**
41-CONTEXT와 PLAN.md는 `cafe_articles`를 facility_kapt와 동일하게 "복원 경로 없음"으로 전제했으나, 실측 결과 1,285/1,654(78%)가 이미 채워져 있었다. 원인은 이 plan의 행위가 아니라 별도의 상시 크론(`cafe-ingest.yml`)이 지역 스코프 없이 동작하기 때문이다. 이 발견을 삭제분 대조표와 SUMMARY 본문에 명시했다 — "미복원"으로 뭉뚱그리면 조용한 오보가 됐을 것이다.

## Threat Flags

없음 — 이 plan은 새 네트워크 엔드포인트·인증 경로·스키마 변경을 도입하지 않았다. 기존 워크플로 3종을 재dispatch하고 프로덕션을 read-only로 조회했을 뿐이다.

## Self-Check: PASSED

- `.planning/phases/41-busan-recollect/41-08-SUMMARY.md` — FOUND (파일 존재 확인)
- GitHub Actions run id 3건(32358931910 / 32359011951 / 32359066531) — 전부 `gh run view --json conclusion`으로 `"conclusion":"success"` 확인됨(본문 인용)
- `busan-status.ts --json` 실측치(avg_sale_per_pyeong 781→1169, gap_stats 74→466, rankings 323, predictions 0)는 프로덕션 재조회 원문 그대로 인용
- `git status --short` — 임시 조회 스크립트(`.mjs`)·중간 결과(`busan-status-*.json`) 전량 삭제 확인, 최종적으로 SUMMARY.md 1개만 신규 파일로 남음
