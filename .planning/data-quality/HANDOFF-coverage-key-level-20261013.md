# 인계 — 커버리지가 **행**을 세고 있습니다. 작업 단위는 **키**입니다 (2026-10-13)

**보내는 곳**: ax-sub → bds · **작성**: 2026-10-13
**요지**: 제가 만든 커버리지 점검의 분모가 **세 번째로** 틀렸습니다. 이번엔 단위입니다.

---

## 0. 먼저 — **감시견이 이틀간 올린 🔴 는 오경보였습니다**

감시견이 10-12·10-13에 *"월간 AI 해설이 하루 14~19건만 처리, 이 속도면 95% 도달 불가"*
라고 올렸습니다. **그 추론은 틀렸고, 원인은 제 점검이 단위를 섞어 쓴 것입니다.**

```
배치 보고   done=14         ← AI 호출 14건. 정확한 숫자입니다
DB 실측     202행 갱신      ← 14 × 약 15행
```

`.update().eq('complex_id',…).eq('area_bucket',…)` 가 **한 번에 그 키의 모든 행**을 갱신합니다.
배치는 **키 단위**로 돌고, 점검은 **행 단위**로 셉니다.

---

## 1. 실측 (2026-10-13, Supabase 직접 조회)

창원 5구 · `area_bucket='84'` · `tx_count_30d > 0` 범위:

| | 값 |
|---|---|
| 행 | **2,437** |
| (complex_id, area_bucket) 키 | **162** |
| 키당 행 | 평균 15.04, **최소 6 ~ 최대 21** |
| 한 키 안에서 `ai_cached_at` 이 서로 다른 키 | **0개** |
| 한 키 안에서 `ai_commentary` 가 서로 다른 키 | **0개** |

> 키당 행이 **6~21 로 3.5배 차이** 납니다. 그래서 행 비율은 **행이 많은 단지가 과대 대표된**
> 가중 평균이 됩니다. 실제로 오늘 기준 **행 88.1% vs 키 85.8%** 로 갈립니다.
>
> 그리고 **한 키의 행들은 타임스탬프를 완전히 공유**합니다 — 그래서 키당 아무 행이나
> 하나만 보면 됩니다. 중복 제거가 간단합니다.

### 진짜 상태 (키 기준)

```
키 162  ·  45일 내 신선 139 (85.8%)  ·  25일 초과 stale 21  ·  한 번도 안 쓰임 2
95% 기준 = 154키  →  15키 부족
```

배치가 하루 14~19키를 처리하므로 **하루면 넘습니다.** 멈춰 있는 게 아닙니다.

---

## 2. 왜 이게 단순한 숫자 문제가 아닌가

제가 10-07 에 커버리지를 넣은 목적은 *"부분 완료가 최신 타임스탬프 하나로 통과하는 것"*을
막는 것이었습니다. **그런데 행 단위로 세면 그 마스킹이 15배로 증폭됩니다** —
한 키만 처리해도 15행이 한꺼번에 신선해지므로 비율이 계단식으로 뜁니다.

```
10-11 측정  69.7%
10-12 측정  80.0%   ← 하루에 10%p 점프 (실제로는 14키 처리)
```

**막으려던 것을 오히려 키우고 있었습니다.**

---

## 3. 부탁 — `measureCoverage` 를 키 단위로

PostgREST 의 `count: 'exact', head: true` 는 행만 셉니다. **DISTINCT 가 안 됩니다.**
그래서 범위를 한 번 끌어와 JS 에서 키로 접는 방식을 제안합니다.
필요한 컬럼이 3개뿐이고 이 범위가 2,437행이라 비용은 작습니다.

```ts
/**
 * 커버리지는 '행'이 아니라 '(complex_id, area_bucket) 키' 로 센다.
 *
 * 배치는 키 단위로 돌고, .update().eq(complex_id).eq(area_bucket) 가 그 키의
 * 모든 행(6~21개)을 한꺼번에 갱신한다. 행으로 세면
 *   (a) 행이 많은 단지가 과대 대표되고 (키당 행이 3.5배까지 차이 난다)
 *   (b) 한 키만 처리해도 비율이 계단식으로 뛰어 부분 완료 탐지가 둔해진다 — 넣은 목적과 반대다
 *
 * 2026-10-13 실측: 162키 전부 한 키 안의 ai_cached_at 이 동일 → 키당 아무 행이나 대표로 삼으면 된다.
 */
async function measureCoverage(supabase, check, latest) {
  const windowHours = check.coverage?.windowHours ?? BATCH_WINDOW_HOURS
  const cutoff = new Date(latest.getTime() - windowHours * 3_600_000)

  const PAGE = 1000
  const seen = new Map<string, Date | null>()   // key -> ai_cached_at
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await applyScope(
      supabase.from(check.table).select(buildSelectExpr(check)), check,
    ).range(from, from + PAGE - 1)
    if (error) return { error: `범위 조회 실패: ${error.message}` }
    if (!data?.length) break
    for (const r of data as any[]) {
      const k = `${r.complex_id}|${r.area_bucket}`
      if (!seen.has(k)) seen.set(k, r[check.column] ? new Date(r[check.column]) : null)
    }
    if (data.length < PAGE) break
  }

  let fresh = 0
  for (const ts of seen.values()) if (ts && ts >= cutoff) fresh++
  return { fresh, total: seen.size }
}
```

⚠️ `buildSelectExpr` 가 **`complex_id`·`area_bucket`·`check.column` 을 포함**해야 합니다.
현재는 `check.column` + 조인 컬럼만 넣고 있을 겁니다 — 거기에 두 개를 더해 주세요.

### basis 문구도 같이

```
이전: '창원 대상 ~612건(거래 있는 단지), 하루 예산 ~408건 → 2회 실행 필요. 45일 창으로 누적 커버리지 측정'
이후: '창원 대상 162키(= (complex_id, area_bucket), 거래 있는 단지). 배치는 키 단위로 돌고
       한 키가 6~21행을 한꺼번에 갱신한다. 45일 창으로 키 단위 누적 커버리지 측정'
```

---

## 4. 참고 — 오늘 확인한 다른 것들

- **`crawl-presale-news` 가 10-12 에 타임아웃으로 취소**됐습니다. 9분33초 소요,
  `timeout-minutes: 10`. 평소 약 2분이고 직전 10-05 는 success 였습니다. **1회째입니다.**
  주간(월 00:00 UTC)이라 **다음 발화가 10-19** 이고, 그 사이 분양 뉴스 원자료가 갱신되지 않습니다.
  스크립트가 멈춘 것인지 일시적인 것인지는 로그가 없어 모릅니다 — **10-19 에 또 걸리면 그때는 확정**입니다.
- 일배치 전환(`0 6 * * *`·`STALE_DAYS 25`·`exit(0)`·`timeout 60`)은 **10-08~10-12 매일 success**,
  소요 1~2분입니다. 잘 돌고 있습니다.
  > 다만 제가 `timeout 60분`을 밀어붙인 근거(*"따라잡는 날 23~37분"*)는 **틀렸습니다.**
  > 실제로는 TPD 가 14~19키에서 끊어 2분이면 끝납니다. **bds 의 15분 판단이 결과적으로 맞았습니다.**
  > 60분이 해롭진 않지만(무한 대기만 막으면 되므로) 근거는 정정해 둡니다.

---

## 5. 회신

1. §3 수정 적용 여부
2. §4 `crawl-presale-news` — 10-19 전에 손볼지, 아니면 10-19 결과를 보고 판단할지
