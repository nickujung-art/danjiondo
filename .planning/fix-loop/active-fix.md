# active-fix — gap-stats 를 psql 직결 워크플로로 분리

> 착수 2026-08-07 · 분류 Small(확장) — 사용자가 GSD 게이트 예외를 명시 승인

## 문제 정의

`data_sources.gap-stats` 가 `failed` 로 굳어 있고 `complex_gap_stats` 786행이
2026-08-05 이후 갱신되지 않는다(1.3일 낡음).

**원인을 실측으로 확정했다.** (첫 측정만 보고 단정할 뻔했다 — 아래 정정 참고)

| 항목 | 값 |
|---|---|
| `compute_gap_stats(12)` cold | **11.45초** (Heap Fetches 104,920) |
| 같은 함수 warm (3회) | 5.06 / 0.35 / 1.09초 |
| `authenticator` 롤 `statement_timeout` | **8초** |

> **정정**: 처음엔 cold 측정 하나만 보고 "매 실행 무조건 타임아웃"이라고 적었는데
> 틀렸다. warm 이면 8초 밑이다. 정확히는 **cold 일 때 넘고, 크론이 도는 19:00 UTC
> (04:00 KST)가 정확히 cold 조건**이다. 이 저장소의 "첫 요청은 콜드라 느리다 — 반복
> 측정 후 판단한다" 교훈이 DB 쪽에도 그대로 적용됐다.

cold 가 비싼 근본 원인은 따로 있다: `transactions` 에 dead tuple **151,452건(18%)**
이 쌓였는데 autovacuum 이 **2026-07-25 이후 돌지 않아** visibility map 이 낡았다.
그래서 Index Only Scan 이 heap 을 10만 번 친다. **이건 gap-stats 만의 문제가 아니다** —
`transactions` 를 Index Only Scan 하는 모든 경로가 같이 느려진다. 별건으로 남긴다.

그래도 직결로 빼는 게 맞다고 본 이유: vacuum 을 손봐도 임계값 **바로 아래**로 돌아갈
뿐이고, 데이터가 조금만 더 늘면 다시 넘는다. 그리고 그 실패는 조용하다.
`refresh_complex_price_stats`(41~46초)가 2026-08-06 에 겪은 것과 **같은 벽**이고,
그건 psql 직결 워크플로로 빼서 해결했다(마이그레이션 20260806040000). gap-stats 가
데이터가 늘면서 그 다음으로 8초 선을 넘은 것이다.

소비처: realtrade-story 투자분석 아코디언(갭투자·사분면)이 `complex_gap_stats.risk_level`
을 읽어 배지를 띄운다. 방치하면 매일 하루씩 더 낡는다.

## 왜 마이그레이션이 필요한가 (다른 길이 없음을 확인)

직결에 쓸 수 있는 로그인 롤은 `backup_agent` 뿐인데(시크릿이 이미 있다) 권한을 실측했다:

| | SELECT | EXECUTE `compute_gap_stats` | INSERT/UPDATE `complex_gap_stats` |
|---|---|---|---|
| `backup_agent` | ✅ | ✅ | ❌ |

워크플로에 INSERT 를 인라인으로 넣는 "마이그레이션 없는" 경로는 막혀 있다. 그리고 이
읽기 전용은 사고가 아니라 의도된 설계다(20260806040000 주석: "백업 롤에 쓰기 권한을 주지
않는다"). 그래서 `refresh_complex_price_stats` 와 똑같이 **SECURITY DEFINER 래퍼**를 만든다.

## 사전 확인한 사실

- `compute_gap_stats` 본문은 모든 객체를 `public.` 으로 수식하고 있다 →
  `SET search_path = ''` 래퍼에서 안전하다. (`get_hagwon_grade` 가 이 조합에서 즉사한
  전례가 있어 반드시 확인해야 하는 항목이다.)
- `complex_gap_stats_complex_id_key` UNIQUE (complex_id) 존재 → `ON CONFLICT` 사용 가능.
- `complex_gap_stats` RLS enabled, **force 아님**, owner `postgres` → DEFINER 가 우회한다.
  (RLS 에 막힌 쓰기는 에러가 아니라 "0행 성공"이라 반드시 미리 봐야 한다.)
- CHECK `risk_level IN ('safe','caution','danger')` — SQL CASE 출력과 일치해야 한다.
- 모든 컬럼 NOT NULL. `window_months` 기본 12, `computed_at` 기본 now().

## 수정 범위

| 파일 | 변경 |
|---|---|
| `supabase/migrations/20260807052310_refresh_complex_gap_stats.sql` | 신규 — SECURITY DEFINER 래퍼 + 권한 |
| `supabase/migrations/20260807054343_revoke_compute_gap_stats_from_public.sql` | 신규 — 코드리뷰 HIGH 대응(래퍼만 잠그고 원본은 열려 있었다) |
| `.github/workflows/refresh-gap-stats.yml` | 신규 — psql 직결, 20:30 UTC |
| `src/app/api/cron/daily/route.ts` | gap-stats 블록 제거 + 이유 주석 |
| `src/lib/data/gap-stats.ts` | 삭제 — 호출부가 사라져 死코드 |
| `src/__tests__/gap-stats.test.ts` | GAP-01~03 제거, GAP-04·05(라우트 인증) 유지 |

## 해결 접근법

1. `public.refresh_complex_gap_stats(p_window_months int default 12) returns integer`
   — `compute_gap_stats` 결과를 `INSERT ... ON CONFLICT DO UPDATE` 로 반영하고 반영 행수 반환.
   `risk_level` 은 SQL CASE 로 계산(기존 `computeRiskLevel` 과 동일한 경계).
2. 워크플로는 `refresh-price-stats.yml` 을 그대로 따른다 — psql 17 설치 → `-v ON_ERROR_STOP=1`
   로 호출 → 성공/실패에 따라 `data_sources.gap-stats` PATCH.
3. daily 라우트에서 gap-stats 제거. **남겨두면 04:00 에 `failed` 를 찍고 20:30 에 워크플로가
   `success` 로 덮는 깜빡임**이 된다(20260806040000 주석이 경고하는 바로 그 상태).

## risk_level 을 SQL 로 옮기는 것에 대해

임계값의 단일 진실 원천이 TS 에서 SQL 로 넘어간다. TS 쪽은 쓰는 곳이 없어지므로 남기면
死코드이고, 남겨두면 두 정의가 갈라질 수 있다. 그래서 옮기고 **판정 근거(D-02)를
마이그레이션 주석에 옮겨 적는다.** 읽는 쪽(realtrade-story `getGapBadge`)은 문자열을
매핑만 하고 모르는 값은 배지를 숨기므로, 값 집합이 유지되는 한 영향이 없다.

## 예상 변경 사항

- `data_sources.gap-stats` 가 매일 20:30 UTC 에 갱신된다.
- `/api/cron/daily` 응답에서 `gapUpdated` 필드가 사라진다.
- daily 라우트가 짧아져 완주 가능성이 올라간다(현재 33분+ 소요 후 죽는 문제의 부분 완화 —
  근본 해결은 아니다, kapt 는 그대로다).

## 검증 방법

- 마이그레이션은 **트랜잭션 안에서 실행 후 롤백**해 실제 행 반영·소요시간을 먼저 잰다.
- bds 는 사전 실패 테스트가 많아 총계 비교가 무의미하다 → `git stash` 로 베이스라인 실측 후 비교
  (error-notes #001 2026-07-31 교훈).
- `npx tsc --noEmit` + `npm run lint`.

## 루프 카운터: 1

1회 반려. `src/lib/data/gap-stats.ts` 를 파일째 지웠는데 `RiskLevel` **타입**의 소비처가
남아 있었다(`lib/data/gap-analysis.ts`, `app/invest/page.tsx`, `app/gap-analysis/page.tsx`).
삭제 전 grep 을 심볼 이름으로만 돌린 게 원인 — 오답노트 #002 에 기록. 타입만 남겨 해결.

## 코드리뷰 결과 (STEP 4)

CRITICAL 0 · **HIGH 1** · MEDIUM 0 · LOW 1 → 둘 다 조치 완료.

- **HIGH — 래퍼만 잠그고 원본은 열려 있었다.** `refresh_complex_gap_stats` 는
  PUBLIC 에서 회수했는데 그 안에서 부르는 `compute_gap_stats` 는 그대로였다.
  실측 `proacl = {=X/postgres, ...}` — 앞머리 `=X` 가 PUBLIC EXECUTE 다.
  `compute_gap_stats` 는 SECURITY INVOKER 이고 `transactions` RLS 가 공개 읽기라
  **anon 키만으로 `POST /rest/v1/rpc/compute_gap_stats` 가 통했다** — 이 작업이
  우회하려던 바로 그 무거운 스캔을 아무나 반복 유발할 수 있었다.
  → 마이그레이션 20260807054343 으로 회수. 앱 호출자 없음을 두 저장소에서 확인.
  이 저장소에 이미 같은 실수의 전례가 있다(20260806070000 — anon 만 회수하고 PUBLIC 을
  놔둬서 안 막혔다). **두 번째다.**
- **LOW — 초안 파일명(20260807000000)이 3곳에 남아 있었다.** 원장 등록 후 실제
  version(20260807052310)으로 파일을 rename 했는데 주석을 안 고쳤다. 전부 수정.
- 리뷰어 제안 수용: 사라진 임계값 커버리지를 **GAP-06** 으로 메웠다 — 라이브 DB 없이
  마이그레이션 SQL 파일을 읽어 CASE 의 경계(0/40/60)와 출력값 집합을 검사한다
  (`onconflict-audit.test.ts` 와 같은 정적 스캔 방식).

## QA 결과 (STEP 7) — 100점

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 에러 0 |
| `npm run lint` | `✔ No ESLint warnings or errors` |
| 테스트 | 베이스라인과 **동일** (실패 17, 같은 6개 파일 — 전부 사전 실패) |
| 검산 | 통과 725 − 5(제거) + 2(GAP-06) = 722 ✓ / 총계 744 − 5 + 2 = 741 ✓ |

테스트 총계는 3회 실행에서 17/18/17 로 흔들렸다 — 실패 파일 6개가 전부 라이브 DB 의존이라
flaky 하다. 그래서 총계가 아니라 **실패 파일 집합**과 위 검산으로 판정했다(오답노트 #001).

## DB 적용 상태

| version | 이름 | 상태 |
|---|---|---|
| 20260807052310 | refresh_complex_gap_stats | ✅ 적용·원장 등록 |
| 20260807054343 | revoke_compute_gap_stats_from_public | ✅ 적용·원장 등록 |

실행 검증: `refresh_complex_gap_stats(12)` 반영 확인, 소요 5.06 / 0.35 / 1.09초.
이식 충실성: gap_ratio 가 안 바뀐 567행에서 기존 앱이 쓴 risk_level 과 **불일치 0**.

## 남은 것 (이 작업 범위 밖)

- `transactions` autovacuum 지연(dead 151,452건 / 18%, 마지막 2026-07-25).
  cold 쿼리가 비싼 근본 원인이고 gap-stats 만의 문제가 아니다.
- 워크플로 첫 정기 실행(20:30 UTC) 결과 확인 — push 후에나 가능하다.
