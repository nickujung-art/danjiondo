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
