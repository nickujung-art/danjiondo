# Phase 41: 부산 16개 구 수집 재개 - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning
**Source:** bds ADR-062 + realtrade-story ADR-012(2026-08-19 확정) + 오케스트레이터 프로덕션 라이브 실측

> **이 Phase 는 "복구"가 아니라 "스위치를 되돌리는 것"이다.** 2026-08-10 에 부산을 뺀 것은
> 데이터 문제가 아니라 **Supabase Free 500MB 한도 초과**였다(565MB). Pro 전환으로 8GB 가
> 되면서 그 전제가 통째로 없어졌다. ADR-062 가 적어둔 "되돌리려면" 절차를 실제로 실행한다.
>
> 🔴 **수집 범위 ≠ 노출 범위.** 이 Phase 는 **수집만** 한다. 부산이 화면에 보이게 만드는
> 작업은 realtrade-story 소관이며 전부 범위 밖이다 (ADR-012 가 저장소 경계를 명시했다).

<domain>
## Phase Boundary

**ADR-012 이 못박은 저장소 분담**:

| 저장소 | 담당 |
|---|---|
| **bds (이 저장소)** | `regions.is_active`, MOLIT 백필, 매칭·랭킹·예측이 부산까지 돌게 하는 것, 크론 전부 |
| realtrade-story | 화면 노출 범위(`src/lib/region/sgg-codes.ts`), 지역 선택 UI, 랭킹 범위, SEO |

**사용자가 지정한 3항목**:
1. `regions` 부산 16개 `is_active` → true (행은 이미 있고 값만 false)
2. MOLIT 백필 — 2026-08-10 에 지운 거래 282,444건 재수집
3. 매칭·랭킹·예측 배치가 부산까지 돌게

**이 Phase 가 하지 않는 일**:
- realtrade-story 의 어떤 파일도 수정하지 않는다
- 부산 노출 방식·도메인 구조·`site_id` 의미 재정의 — ADR-012 가 "미정"으로 남긴 4건
- 네이버 호가 크롤링 부산 확장 (`map-naver-complexes`, NAVER_COOKIE — Phase 34-08/34-10)
- 부산 미분양(`regional_unsold`) — 상대 API 가 고장났고 이미 보류 처리됨(1bf05c0)
- 울산 등 추가 지역
- `VACUUM FULL` — 이번엔 데이터가 늘어나므로 불필요
- `complex_integrity_counts` 마이그레이션 파일 부재(아래 발견 5) 해소 — Phase 37 계열 작업

</domain>

<baseline>
## 실행 전 기준값 (오케스트레이터 실측, 2026-08-19 프로덕션 service_role)

### 지역 마스터
| 항목 | 값 |
|---|---|
| `regions` 전체 | 38행 |
| 활성 | 22 (경남 = 창원 5구 + 김해 + 기타 16곳) |
| 부산 | 16행(26110~26710) 전부 `is_active=false`, `gu` non-null |

### 데이터 규모
| 구분 | `transactions` | 미연결 | 연결률 | `complexes` |
|---|---|---|---|---|
| 운영권역(48121·48123·48125·48127·48129·48250) | 300,811 | 16,176 | **94.6%** | 2,035 |
| 경남 기타 16곳 | 246,441 | 87,043 | **64.7%** | 796 |
| **부산 16구** | **0** | — | — | **0** |
| 합계 | 557,325 | | | |

`deal_date` 범위: 2015-01-01 → 2026-08-18. `transactions` 290MB / 557,325행 = 행당 545 bytes.
DB 현재 448MB / Pro 8GB. 부산 복원 후 추정 650MB = 한도의 8% (사용자 산정).

### 삭제 시점 규모 (ADR-062 기록)
```
transactions               282,444
complex_price_predictions   11,611
cafe_articles                1,654
complexes                    1,594
facility_kapt                1,463
complex_rankings               330
complex_gap_stats              299
```

### 잔존 `ingest_runs` (부산, 삭제되지 않았다)
| source_id | 부산 전체 | success | 운영권역 success (대조) |
|---|---|---|---|
| `molit_trade` | 1,975 | **1,903** | 1,921 |
| `molit_villa_trade` | 1,919 | **1,853** | 3,382 |
| `molit_offi_trade` | 112 | 112 | 1,188 |
| 합계 | **4,006** | **3,868** | |

부산 `molit_trade` 의 `year_month` 범위: **201607 → 202608**

### 배치 소요시간 실측 (`molit_trade` 최근 성공 40건)
지역-월 1건당 **중간값 11.5초**, 최대 187초.

</baseline>

<decisions>
## Implementation Decisions

### D-01: `regions` 스위치는 정식 마이그레이션으로 남긴다 🔑

ADR-062 의 삭제는 `20260810060000_drop_busan_scope.sql.applied-manually` — **원장에 없는
이력 기록용 파일**이었다(statement timeout 때문에 수동 배치 실행). 되돌리는 쪽은 사정이
다르다: `UPDATE regions SET is_active = true WHERE sgg_code LIKE '26%'` 는 16행이고
타임아웃 위험이 없다.

**결정: 정식 마이그레이션 파일 + `npm run db:push`.** 원장에 등록돼야 `db reset` 재현성이
유지된다(Phase 37 이 회복한 것). `.applied-manually` 를 또 만들지 않는다.

⚠️ `regions` 는 데이터 테이블이므로 마이그레이션이 **멱등**해야 한다 — 이미 true 인 행에
다시 UPDATE 해도 무해하지만, 조건을 `sgg_code LIKE '26%'` 로 두면 나중에 부산 외 26xx 가
생길 일이 없음을 확인해야 한다(법정동코드 26 = 부산광역시 전용, 16행 전수 확인됨).

---

### D-02: 🔴 잔존 `ingest_runs` 3,868건을 무효화한다 — 안 하면 백필이 0건 적재로 초록불이 된다

**메커니즘**: `.github/workflows/molit-backfill-once.yml` 이 `--resume` 를 **하드코딩**한다
(입력값이 아니다). `scripts/backfill-realprice.ts` 의 `getCompletedRuns()`(`molit_trade`)와
`getCompletedVillaRuns()`(`molit_villa_trade`) 가 `ingest_runs` 에서 `status='success'` 인
`(source_id, sgg_code, year_month)` 를 skip 한다. 삭제 때 `ingest_runs` 는 지우지 않았다.

→ 지금 이 워크플로를 부산 코드로 돌리면 **apt 1,903건 + villa 1,853건이 전부 skip 되고
"성공"으로 끝난다.** 조용한 성공 — 이 저장소가 반복해 겪은 실패 모양이다(ADR-063).

**두 갈래를 조사한 결과 (a) 삭제가 안전하다:**

| `ingest_runs` 소비처 | 부산 행 삭제 영향 |
|---|---|
| `scripts/check-ingest-linkage.ts` | **없음** — `transactions` 만 읽는다(`created_at` 기준). `ingest_runs` 미참조 |
| `scripts/check-data-freshness.ts` | **없음** — `source_run_id → ingest_runs.source_id` 임베디드 필터. 지역 무관, 최신성만 본다 |
| `transactions.source_run_id` FK | **안전** — `references ingest_runs(id) on delete set null` (`20260430000008`). 부산 거래는 이미 0행이라 참조하는 행 자체가 없다 |
| `src/app/admin/region-expansion/page.tsx` | 부산 진행률 표시가 0 으로 리셋된다 — **이게 정직한 상태다**(데이터가 실제로 없다). 백필 진행에 따라 다시 채워진다 |
| `src/app/api/cron/rankings/route.ts` | 확인 필요 (읽기 용도로 보임) — 플랜에서 확인할 것 |

**결정: 부산 `ingest_runs` 4,006행을 삭제한다.** `--resume` 를 끄는 방식(b)보다 낫다 —
(b) 는 이번 실행만 해결하고, 중단 후 재개할 때 `--resume` 가 다시 필요한데 그때 옛 기록이
또 방해한다. **원장을 실제 상태와 일치시키는 것이 근본 해결이다.**

⚠️ `molit_offi_trade` 112행도 함께 지운다 — 오피스텔 백필(`backfill-officetel.ts`)도 같은
`--resume` 구조라면 동일 함정이 있다. 오피스텔 재수집 자체는 이 Phase 범위 밖이나,
**기록만 남고 데이터가 없는 상태를 남겨두지 않는다.**

---

### D-03: 순서 — K-apt 시딩 → 지오코딩 → 백필. 뒤집으면 28만건이 미연결로 쌓인다 🔑

`src/lib/data/realprice.ts` 의 `ingestMonth`/`ingestMonthVilla` 는 `createComplexIdLookup()`
으로 `complex_id` 를 **조회만** 한다. 단지를 만들지 않는다. 부산 단지 0개 상태로 백필하면
28만건이 전부 `complex_id=null` — 2026-05-26 사고(연결률 19.1%, 마린애시앙 "4개월째 거래
없음")의 정확한 재현이다.

```
regions 스위치 ──> seed-complexes.ts (K-apt Golden Record)
                     └──> geocode-complexes.ts (카카오 좌표)
                            └──> backfill-realprice.ts (MOLIT 실거래)
                                   └──> 파생값 배치 (랭킹·예측·갭·price_stats)
```

두 스크립트 모두 이미 `regions.is_active` 기반(`getSggCodes()` → `.eq('is_active', true)`)
이라 **스위치만 켜면 부산을 자동 포함한다. 코드 변경 불필요.**

Phase 34 의 원본 플랜이 그대로 재사용 가능하다:
`.planning/phases/34-db-2/34-03-PLAN.md`(K-apt 시딩) · `34-05-PLAN.md`+SUMMARY(지오코딩,
실행 완료 이력 있음) · `34-06-PLAN.md`(10년 백필 + 용량 체크).

---

### D-04: 백필 기간은 `201501` — 창원·김해와 대칭으로 맞춘다 (삭제분보다 18개월 많다)

**실측이 내 초기 가정을 정정했다.** 부산은 원래 **201607 부터**만 있었다(`ingest_runs`
`year_month` 범위 201607~202608). 창원·김해는 **2015-01** 부터다. 즉 부산은 "10년 전
기본값" 시점에 시작된 부분 지역이었다.

세 선택지:

| 선택 | 기간 | 지역-월 | 성격 |
|---|---|---|---|
| 워크플로 현재 기본값 | 201608~202608 | 3,872 | **201607 한 달을 잃는다** (10년 창이 슬라이딩) |
| 삭제분 정확 복원 | 201607~202608 | 3,904 | 지운 것만 되돌림 |
| **창원·김해 대칭 (채택)** | **201501~202608** | **4,480** | 부산을 1급 지역으로. 삭제분보다 **+576 지역-월** |

**결정: `--from=201501`.** 용량이 더 이상 제약이 아니고(8GB 중 8% 예상), 부분 지역으로
남겨두면 랭킹·갭·예측의 시계열 길이가 지역별로 달라져 나중에 설명하기 어려워진다.
⚠️ **이건 "복원"보다 넓은 범위다** — 성공 기준에서 삭제분 282,444건과 대조할 때 이 차이를
반드시 명시할 것(단순 초과가 정상이다).

---

### D-05: 🔴 한 job 에 들어가지 않는다 — 분할 dispatch 가 필수다

실측 기반 산정:

```
지역-월 4,480건 × 중간값 11.5초 ≈ 51,500초 ≈ 14.3시간
molit-backfill-once.yml  timeout-minutes: 300  = 5시간
```

**한 job 의 3배다.** 5시간에 들어가는 양은 대략 1,560 지역-월 = **5~6개 구**.

API 한도도 얇다: 지역-월당 최소 1회 + 100건 초과분 페이지. 부산 도심구는 월 100건을
넘는 달이 있어 **6,000~9,000회 추정 / 일 10,000회 한도**.

**결정: 구를 3그룹(5·5·6)으로 나눠 최소 2일에 걸쳐 dispatch.** 그룹 경계와 실행 순서를
플랜에 명시하고, 각 그룹 종료 시 용량·연결률을 체크포인트로 확인한다.

`data.go.kr` 이 Actions IP 일부를 TCP 차단하는 문제는 이미 대응이 있다 —
`preflight()` + `EXIT_BLOCKED_RUNNER=75` → 새 러너 재시도. 이를 전제로 계획한다.
`FAILURE_ABORT_RATE = 0.3` 도 그대로 유효하다.

---

### D-06: 워크플로에 `from`·`to`·`resume` 입력을 노출한다

`molit-backfill-once.yml` 은 현재 `sgg_codes` 하나만 받고 `--resume` 하드코딩이다.
D-02(삭제)로 이번 실행은 해결되지만, **재개 가능성을 보존**하려면 `resume` 를 끄고 켤 수
있어야 하고, D-04·D-05 를 실행하려면 `from`/`to` 가 필요하다.

**결정: `resume`(boolean, 기본 true) · `from` · `to` 입력 추가.** 기본값은 현재 동작을
유지해 기존 용도(창원·김해 재개)가 깨지지 않게 한다.

⚠️ `check-ingest-linkage.ts` 호출부의 `--since-hours=8` 은 5시간 job 을 커버하지만,
그룹을 이어 돌리면 앞 그룹까지 섞여 측정된다. `--sgg` 로 그룹을 좁히므로 문제없다.

---

### D-07: 연결률 목표는 90% 가 아니다 — 64.7% 가 현실적 기준선이다

**실측이 내 초기 성공 기준을 정정했다.** 운영권역 94.6% 는 **수동 별칭 보정이 누적된
결과**다(`complex_aliases`, 매칭 로직 개선, 토월성원 병합 등). 같은 파이프라인으로 K-apt
시딩만 받은 경남 기타 16곳은 **64.7%** 다(단지 796개).

부산은 그 중간일 가능성이 높다 — 삭제 시점 단지가 1,594개로 경남 기타 796개의 2배이고
도시 지역이라 K-apt 등록률이 높다. 하지만 **90% 를 요구하면 상시 빨간불이 되고, 그러면
아무도 안 본다**(`check-ingest-linkage.ts` 주석이 정확히 이 이유로 기본 범위를 창원·김해로
좁혀뒀다).

**결정: 임계 65%(경남 기타 실측값), 목표는 "측정하고 보고".** 65% 미달이면 매칭 경로를
의심한다(2026-05-26 사고 부류). 90% 는 별칭 보정 후속 작업의 목표이며 이 Phase 범위 밖.

---

### D-08: 감시 기준선 — 조사 결과 위험이 내 초기 판단보다 작다

| 감시 | 부산 유입 영향 |
|---|---|
| `complex-integrity.yml` `empty_kapt`(방금 59로 잠김) | **범위 밖일 가능성이 높다** — `complex_integrity_counts(ARRAY['48121','48123','48125','48127','48129','48250'])` 로 **운영권역 6곳만** 넘긴다. ⚠️ 단 이 함수는 **마이그레이션 파일이 없어 본문을 저장소에서 읽을 수 없다**(발견 5). 배열이 실제로 필터로 쓰이는지 **플랜에서 실측 확인**할 것 |
| `data-freshness-check.yml` | 영향 없음 — 최신성만 보고 지역 무관. 부산 적재는 오히려 신선도를 높인다 |
| `check-ingest-linkage.ts` | 기본 범위가 창원·김해라 영향 없음. 부산은 `--sgg` 로 명시 호출 |

**결정: 기준선을 미리 바꾸지 않는다.** 각 그룹 백필 후 `complex-integrity` 를 실제로
돌려 확인하고, 움직였다면 그때 **부산 유입을 인지한 값으로 올린다.** 예방적으로 낮추는
것은 감시를 무력화한다.

---

### D-09: Claude's Discretion

- 마이그레이션 파일명·타임스탬프
- `ingest_runs` 삭제를 마이그레이션에 넣을지 스크립트로 할지 (데이터 정리이므로 어느 쪽도 가능)
- 구 3그룹의 구체적 분할 (지역-월 균등이 되도록)
- 파생값 배치 재실행 방법 (기존 워크플로 dispatch vs 로컬 실행)
- ADR 번호 (ADR-064 이후 다음 번호)

</decisions>

<discoveries>
## 조사 중 확정한 사실 5건

**발견 1 — `--resume` 함정의 사정거리는 apt + villa 둘 다다.** 처음엔 `source_id` 표본
1,000행만 봐서 `molit_villa_trade` 를 놓쳤다. 전수 집계 결과 apt 1,903 + villa 1,853 +
offi 112 = 3,868 success 가 전부 skip 대상이다.

**발견 2 — 부산은 원래 201607 부터였다.** 창원·김해(201501)와 대칭이 아니었다. D-04 참조.

**발견 3 — 연결률 기대치를 64.7% 로 내려야 한다.** D-07 참조.

**발견 4 — 무결성 감시가 운영권역으로 스코프돼 있다.** D-08 참조. 내 초기 판단("방금 잠근
기준선이 즉시 깨진다")은 과장이었을 가능성이 높다.

**발견 5 — `complex_integrity_counts(text[])` 에 마이그레이션 파일이 없다.**
저장소 전체 grep 결과 참조는 3곳(`complex-integrity.yml`, 권한 복구 마이그레이션
`20260819060000`, 그리고 내 임시 프로브)뿐이고 **`CREATE FUNCTION` 이 어디에도 없다.**
프로덕션에만 존재하는 함수 = 마이그레이션 drift 다. **이 Phase 범위 밖**(Phase 37 계열)
이지만 D-08 의 확인을 프로덕션 대조로 해야 하는 이유가 된다.

</discoveries>

<scope_fence>
## Scope Fence

**포함**:
- `regions` 부산 16개 `is_active=true` (정식 마이그레이션)
- 부산 `ingest_runs` 4,006행 무효화
- `molit-backfill-once.yml` 에 `resume`·`from`·`to` 입력 추가
- K-apt 시딩 + 지오코딩 + MOLIT 백필 실행 (분할 dispatch, 체크포인트 포함)
- 파생값 배치 재실행 + 부산 행 생성 실측
- 용량 실측 보고
- 감시 기준선 확인 (필요 시 상향)
- ADR 기록

**제외**:
- realtrade-story 의 모든 파일
- 부산 화면 노출·도메인·`site_id` 의미
- 네이버 호가 크롤링 부산 확장
- 부산 미분양(`regional_unsold`)
- 오피스텔 부산 재수집 (`backfill-officetel.ts` 실행) — `ingest_runs` 정리만 하고 재수집은 별개
- 울산 등 추가 지역
- `VACUUM FULL`
- `complex_aliases` 별칭 보정으로 연결률을 90% 로 올리는 작업
- `complex_integrity_counts` 마이그레이션 파일화 (drift 해소는 Phase 37 계열)
- `git push` / 배포 — 사용자 결정

</scope_fence>

## Success Criteria

1. `regions` 부산 16개 `is_active=true`, 마이그레이션이 원장에 등록됨 (`migration list --linked` drift 0)
2. 부산 `ingest_runs` 가 실제 데이터 상태와 일치 (백필 전 0행 또는 무효 상태)
3. `complexes` 부산 행 ≥ 1,500, 좌표 non-null 비율이 경남 기타와 동등 이상
4. 부산 `transactions` 가 201501~ 범위로 적재됨
5. 부산 `complex_id` 연결률 ≥ **65%** (경남 기타 실측 64.7% 기준) — 실측값 보고 필수
6. 삭제분(거래 282,444 / 단지 1,594)과 복원 규모 대조 보고. **D-04 로 기간이 18개월 넓어졌으므로 초과가 정상** — 차이의 방향과 크기를 설명
7. 파생값 4테이블(`complex_price_stats`·`complex_rankings`·`complex_gap_stats`·`complex_price_predictions`)에 부산 행 생성 실측
8. DB 용량 실측 + 8GB 대비 여유 보고 (예상 650MB = 8%)
9. `complex-integrity`·`data-freshness` 워크플로 초록불. 기준선이 움직였다면 **부산 유입을 인지한 값으로 상향**된 기록
10. 백필 중단 시 재개 지점이 `ingest_runs` 로 판정 가능 (D-02·D-06 결과 검증)
11. `npm run lint` exit 0 / 테스트 실패 이름 집합 불변

## Risk Summary

| 위험 | 완화 |
|---|---|
| 🔴 `--resume` 로 0건 적재 초록불 | D-02 — `ingest_runs` 삭제. 각 그룹 후 `rows_upserted` 합계를 실제로 확인 |
| 🔴 단지 없이 백필 → 28만건 미연결 | D-03 — 순서 고정. K-apt 시딩 결과(≥1,500)를 **게이트**로 삼고 미달 시 백필 진입 금지 |
| 🔴 14시간 작업을 5시간 job 에 넣어 타임아웃 | D-05 — 3그룹 분할. `cleanupStuckRuns()`(30분 초과 running 정리)가 이미 있다 |
| API 일 10,000회 한도 초과 | D-05 — 최소 2일 분산. 그룹당 호출 수를 로그로 실측 |
| Actions IP 차단으로 그룹 전멸 | 기존 `preflight()` + `EXIT_BLOCKED_RUNNER=75` 재시도 |
| 감시 기준선 예방적 하향으로 감시 무력화 | D-08 — 미리 바꾸지 않고, 움직인 뒤 **상향**만 |
| 연결률 90% 요구로 상시 빨간불 | D-07 — 임계 65%. 90% 는 별칭 보정 후속 작업 목표 |
| 용량 급증 | 예상 650MB/8GB. 그룹마다 실측 체크포인트 |
