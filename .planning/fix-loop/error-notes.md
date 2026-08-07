# FIX LOOP 오답노트

FIX LOOP QA 실패 시 반드시 기록. 모든 수정 작업의 STEP 2·3에서 항상 참조.

---

<!-- 예시 형식:
## #001 · 2026-06-30 · [컴포넌트/페이지]
**상황**: 어떤 수정이었는지
**실수**: 무엇이 잘못됐는지
**교훈**: 다음에는 어떻게 해야 하는지
-->

## #001 · 2026-07-31 · [api/cron/daily · lib/data/cron-status]

**상황**: 크론 상태 보고의 침묵 실패 제거 + K-apt 배치 순환 수정.
K-apt 대상 선별에 PostgREST 1,000행 캡을 넘기려고 `.order('id').range(from, to)`
페이지네이션을 새로 도입했다.

**실수**: `src/__tests__/gap-stats.test.ts`의 Supabase 목(`makeMockChain`)이
`methods = ['select','eq','is','in','not','gt','gte','order','limit']`만 정의하고
있어서 `.range()`가 없어 터졌다.
```
TypeError: supabase.from(...).select(...).not(...).order(...).range is not a function
```
전체 테스트가 35 failed → 36 failed로 **1건 순증**했는데, 통합 테스트 다수가
원래 실패 중(라이브 DB 의존)이라 총계만 봐서는 회귀인지 flaky인지 구분되지 않았다.
`git stash`로 변경분만 되돌려 베이스라인(35)을 실측한 뒤에야 회귀임이 확정됐다.

**교훈**:
1. **체인 메서드를 새로 쓰면 기존 목 객체부터 확인한다.** 이 저장소의 목은
   메서드 화이트리스트 방식이라 새 메서드는 반드시 목록에 추가해야 한다.
   특히 `.range()`·`.limit()` 같은 **종단 메서드**는 결과를 resolve하도록 따로
   설정해야 한다(`chain['limit'].mockResolvedValue(result)` 패턴).
2. **사전 존재 실패가 많은 저장소에서는 총계 비교가 무의미하다.**
   `git stash push <변경파일>`로 베이스라인을 실측해 비교할 것. 이 세션에서
   두 번(알림 크론, 이번) 같은 방법으로 판정했다.
3. 페이지네이션 루프에는 **최대 페이지 상한**을 둔다. 소스가 계속 PAGE_SIZE를
   돌려주면 무한 루프가 된다 — 목이 그렇게 동작하면 테스트가 멈춘다.

---

## #002 · 2026-08-07 · [lib/data/gap-stats · api/cron/daily]

**상황**: `compute_gap_stats` 가 PostgREST 8초 상한을 넘어 매일 타임아웃하던 걸
psql 직결 워크플로 + SECURITY DEFINER 함수로 뺐다. 계산이 SQL 로 넘어가면서
`src/lib/data/gap-stats.ts` 가 死코드가 됐다고 보고 **파일째 삭제**했다.

**실수**: 그 파일에는 `computeGapStats`·`computeRiskLevel` 말고 **`RiskLevel` 타입**도
있었고, `lib/data/gap-analysis.ts` 가 그 타입을 쓰고 있었다.
```
src/lib/data/gap-analysis.ts(4,32): error TS2307: Cannot find module './gap-stats'
src/app/invest/page.tsx(239,36): error TS7053: ... type 'RiskLevel' can't be used to index ...
```
삭제 전 소비처를 `computeRiskLevel|computeGapStats|complex_gap_stats` 로 grep 했는데
**함수·테이블 이름만 봤고 타입 이름을 빼먹었다.** 테스트도 베이스라인 17 → 18 로
1건 순증했다(gap-analysis 테스트).

**교훈**:
1. **모듈을 지우기 전엔 심볼이 아니라 모듈 경로로 grep 한다** — `from './gap-stats'`,
   `lib/data/gap-stats`. 심볼 목록은 항상 빠뜨린 게 생기고, 특히 `import type` 은
   런타임 참조가 없어 눈에 덜 띈다.
2. 계산 로직만 옮기는 작업이라면 **파일을 지우지 말고 옮겨간 부분만 덜어낸다.**
   이번에는 타입만 남겨 해결했다.
3. 베이스라인 실측(#001 교훈)이 이번에도 값을 했다 — 사전 실패 17건이라 총계만
   봤으면 18 이 회귀인지 flaky 인지 몰랐을 것이다. `git stash` 로 먼저 재고 비교한다.
