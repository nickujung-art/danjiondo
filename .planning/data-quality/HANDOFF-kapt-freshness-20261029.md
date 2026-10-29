# 인계장: K-apt 시설 신선도 — 경보는 오경보, 그 뒤에 진짜 고장이 하나 있다

**발신**: ax-sub (2026-10-29)
**수신**: bds
**긴급도**: 중간. 실제 45일 SLA가 **10-30(내일)부터 깨지기 시작한다**

> ✅ **같은 날 ax-sub가 직접 처리했다** (대표 지시). 아래 요청 ①~③은 반영됐고 ④만 남았다. 처리 내용은 맨 아래 「처리 결과」에 있다.

---

## 현황

`데이터 신선도 점검`이 10-12부터 매일 실패하고 있고, 감시견이 매일 🔴로 올립니다.
위반은 2건입니다. 이 인계장은 그중 **K-apt 시설**(`52.3일 / 한도 45일`)만 다룹니다.
나머지 1건인 월간 AI 해설 커버리지 88%(`groq_tpd_exhausted`)는 별건입니다.

조사해 보니 문제는 서로 다른 두 가지였습니다.

## ① 점검이 엉뚱한 컬럼을 본다 → 오경보

`scripts/check-data-freshness.ts:225`는 `facility_kapt.created_at`을 봅니다.
그런데 `kapt-facility-enrich.ts:234`는 `upsert(..., { onConflict: 'complex_id' })`로 씁니다.
기존 행을 덮어쓰기 때문에 **`created_at`이 영원히 갱신되지 않습니다.**

2026-10-29 실측:

| data_month | 행 | max(created_at) | max(updated_at) |
|---|---|---|---|
| 2026-10-01 | 1,428 | **09-06** | **10-28** |
| 2026-09-01 | 1,498 | 09-06 | 09-30 |

10월분 1,428행이 실제로 갱신됐는데도 점검에는 "52일 묵음"으로 보입니다.
→ **`column: 'updated_at'`으로 바꾸면 됩니다.**

## ② 진짜 고장: `KAPT 시설정보 월간 커버리지` 워크플로가 매일 아무것도 안 한다

10-28 실행 로그:

```
[kapt-facility] data_month = 2026-10-01
[kapt-facility] --missing-only: 2926개 중 2926개 완료됨, 0개 남음
  성공: 0/0
```

`--missing-only`의 완료 판정(`kapt-facility-enrich.ts:116-145`)은 **`mgmt_area != null`만 봅니다.**
`data_month`는 보지 않습니다. 그래서 한 번이라도 채워진 단지는 달이 바뀌어도 영원히 "완료"로 셉니다.
워크플로 헤더와 스크립트 주석 13행에는 *"이번 달 data_month 레코드에 값이 있는 단지를 건너뛴다 — 달이 바뀌면 전수를 훑는다"*고
적혀 있지만, 코드는 그렇게 동작하지 않습니다.

결과적으로 09-23에 이 워크플로를 만든 이유(Vercel 일배치가 절반만 돈다)가 그대로 남아 있습니다.
**SLA를 지고 있는 것은 Vercel 일배치뿐입니다.**

| | 값 |
|---|---|
| 10월 갱신 속도 (Vercel만) | **51.0행/일** (1,428 ÷ 28일) |
| 45일 SLA에 필요한 속도 | 65행/일 (2,926 ÷ 45) |
| 가장 오래된 `updated_at` | 09-14 → **44.4일** (10-29 기준) |
| 38일 넘은 행 | 477 |

→ ①만 고치면 **경보가 내일부터 다시 울립니다.** 이번에는 진짜 경보입니다.

## 요청 사항

| # | 할 일 | 비고 |
|---|---|---|
| ① | `check-data-freshness.ts` K-apt 항목을 `created_at` → `updated_at`으로 | `job` 표기도 `cron/daily (Vercel) + kapt-facility-refresh.yml`로 |
| ② | `--missing-only` 완료 판정에 `data_month = DATA_MONTH` 조건 추가 | 주석에 적힌 의도대로. `mgmt_area` 조건은 유지 |
| ③ | ② 반영 후 `kapt-facility-refresh` 수동 1회 실행 | 이번 달 미갱신 ~1,500단지가 대상이 됩니다. 단지당 1.7~3.4초로 잡으면 약 45~85분이라 timeout 120분 안에 들어갈 것으로 봅니다 |
| ④ | 다음 날 신선도 점검에서 K-apt 행이 정상으로 바뀌는지 확인 | 감시견도 같은 날 ✅로 바뀝니다 |

**② 없이 ①만 반영하지 마십시오.** 경보가 잠깐 꺼졌다가 다시 울리면, 사람은 그 경보를 무시하는 법을 배웁니다.

## 부수 정보

- `data_sources.kapt = success`는 사실입니다. Vercel이 하루 약 51건씩 실제로 적재하고 있습니다.
  다만 그 속도가 SLA에 모자랍니다. 이것이 "초록불인데 실패"의 정체입니다.
- `지역 미분양`은 점검이 *보류 해제 후보*라고 안내하고 있습니다(10-01 수집 재개). `CHECKS`의 `pausedReason` 정리도 같이 하시면 됩니다.

## 처리 결과 (2026-10-29, ax-sub)

**요청 ①은 처음 적은 대로 하면 틀린다는 것을 고치다가 알았다.** 컬럼만 `updated_at`으로 바꾸면,
Vercel이 매일 51행을 쓰는 동안 최신 행은 늘 신선하다. 그러면 ② 같은 부분 고장이 **영원히 초록불**로 보인다.
그래서 이 점검에 이미 있는 `coverage` 장치를 같이 붙였다.

| 파일 | 변경 |
|---|---|
| `scripts/check-data-freshness.ts` | K-apt: `created_at` → `updated_at` + `coverage`(45일 창, 행 단위, 최소 99%) + `embeddedFilter: complexes.kapt_code notNull` |
| 〃 | `EmbeddedFilter` 타입에 `notNull` 추가. kapt_code를 잃은 단지 203곳(05월 data_month, 다시는 갱신되지 않음)을 분모에서 뺀다. 빼지 않으면 정상 운영에서도 93%가 천장이 된다 |
| `scripts/kapt-facility-enrich.ts` | `--missing-only` 판정 쿼리에 `.eq('data_month', DATA_MONTH)` + 페이지네이션용 `.order('complex_id')` |

**검증**
- 로컬에서 실제 DB로 `check-data-freshness --warn-only` 실행: `K-apt 시설 0.4일 · 커버리지 100.0% (2,926/2,926행)`. 분모가 정확하다
- 오늘은 100%다. 가장 오래된 행이 44.4일이라 아직 창 안에 있기 때문이다. refresh가 돌지 않으면 내일부터 내려간다
- 새 `--missing-only` 대상 수(DB 직접 계산): 2,926 − 1,428 = **1,498단지**
- 두 스크립트 `tsc --strict` 통과(`scripts/`는 tsconfig 제외 대상이라 따로 돌렸다)
- 반영 후 `kapt-facility-refresh` 수동 1회 실행 → 결과는 다음 날 신선도 점검에서 확인(④)
