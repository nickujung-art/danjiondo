# Phase 38 — Deferred / Out-of-Scope Items

## 1. `supabase db reset` hollow dependency — `complex_aliases` FK 위반 (버그 클래스)

**발견 시점:** 38-01 Task 3 (`npm run db:reset` 실측 실행 중)

`supabase/seed.sql`은 `regions`·`data_sources`만 시딩하고 `complexes`는 전혀 시딩하지 않는다.
그런데 일부 마이그레이션이 프로덕션에만 존재하는 `complex_id` UUID를 하드코딩해
`complex_aliases`에 INSERT하므로, 완전히 새로운 로컬 리셋에서는
`complex_aliases_complex_id_fkey` FK 위반으로 `db reset` 전체가 중단된다.

**전수 조사 결과 — 해당 파일은 저장소 전체에서 2개뿐이다:**

| 파일 | INSERT 수 | 상태 |
|---|---|---|
| `20260518000002_manual_aliases.sql` | 1 (11행) | ✅ **해소됨** — 사용자 승인 후 `where exists` 가드 적용 (커밋 `9e60462`) |
| `20260520000002_db_quality_fixes.sql` | 3 (63·82·101행) | ✅ **해소됨** — 동일 가드 적용 (커밋 `848b1e4`) |

✅ **이 버그 클래스는 전부 해소됐다.** 3차 `db reset`에서 두 파일 모두 통과 확인.

`20260520000002`의 `UPDATE`/`DELETE`문은 `WHERE ... IN (...)` 형태라 빈 테이블에서
0행 매칭 no-op으로 안전하다 — 가드가 필요한 것은 INSERT 3개뿐이다.

**적용한 가드 패턴** (승인 1에서 사용, 값 불변):

```sql
insert into public.complex_aliases (complex_id, source, alias_name, confidence)
select v.complex_id, v.source, v.alias_name, v.confidence
from (values
  (...)   -- 기존 값 그대로
) as v(complex_id, source, alias_name, confidence)
where exists (select 1 from public.complexes c where c.id = v.complex_id)
on conflict (complex_id, source, alias_name) do nothing;
```

**근거**: 새 환경에 없는 단지의 별칭은 무의미하므로 의미적으로 옳은 가드다.
프로덕션에는 대상 단지가 모두 존재하므로 **동작 불변**이고, 두 마이그레이션 모두 이미
적용돼 재실행되지 않으므로 `db push` 대상이 아니다 — **로컬 `db reset` 재현성에만** 영향.

**⚠️ 잔여 리스크**: 위 조사는 `complex_aliases` FK 클래스만 보장한다.
`20260520000002` 이후 구간(`20260521`~`20260731`, 약 100개 파일)은 아직 실행되지 않았으므로
**다른 종류의 hollow dependency 가능성은 배제하지 못했다.** `db reset`이 끝까지 가봐야 확정된다.

**⚠️ 파급**: 이 결함으로 `supabase db reset`은 **2026-05-18부터 약 2.5개월간 항상 실패**해 왔다.
`migration list`·`db push --dry-run`은 파일을 실행하지 않으므로 이 상태를 감지하지 못한다.
장기적으로는 `db reset`을 CI 게이트에 넣는 것이 재발 방지책이다 (별도 phase 후보).

---

## 1b. 🔴 **신규 클래스** — 파일↔프로덕션 drift (`20260528000003_complex_gap_stats.sql`)

**발견 시점:** 38-01 Task 3 **3차** 실행

`complex_aliases` FK 클래스를 전부 해소한 뒤 체인이 `20260528000003`까지 전진했고,
거기서 **완전히 다른 종류**의 오류로 중단됐다:

```
ERROR: function round(double precision, integer) does not exist (SQLSTATE 42883)
```

**원인**: 저장소 파일과 프로덕션 함수 정의가 다르다.

| | `PERCENTILE_CONT` 표현식 (84·99행) |
|---|---|
| 저장소 파일 | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_sale_price` |
| **프로덕션 실제** | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric AS median_sale_price` |

`transactions.price`가 `bigint`라 `PERCENTILE_CONT`는 `double precision`을 반환하고,
캐스트 없이는 116·117행의 `ROUND(<double precision>, 1)`이 존재하지 않는 오버로드를 호출한다.
프로덕션에도 `round(double precision, integer)`는 없다(확인함) — 즉 **저장소 파일은 애초에
실행 불가능한 버전**이고 프로덕션에는 수정본이 적용돼 있다.

**성격**: Phase 36 시절 `execute_sql` 우회 적용으로 생긴 drift의 잔재로 추정된다.
⚠️ **이 클래스는 `migration list`로 탐지 불가능하다** — 원장은 버전 문자열만 비교하므로
파일 *내용*이 프로덕션 객체와 다른 drift는 걸러내지 못한다. **`db reset` 실행만이 유일한 탐지 수단**이다.

**해결 방향(미적용, 승인 대기)**: 84·99행에 `::numeric` 추가 → 프로덕션 정의와 일치.
Phase 37의 "프로덕션 충실 재현" 원칙에 부합하며, 프로덕션은 이미 그 상태라 재적용되지 않는다.

**⚠️ 잔여 리스크**: 남은 ~80개 파일(`20260528000003`~`20260731000005`)에 **같은 종류의
drift가 더 있을 가능성이 높다.** 실행해야만 드러나므로 사전 전수 조사가 불가능하다.

---

## 2. ~~타임스탬프 충돌 — `20260731000003` 중복~~ ✅ **해소됨**

**발견 시점:** 38-01 Task 3 이후 `migration list --linked` 재확인 중
**해소 시점:** 38-01, 사용자 승인 후 (커밋 `1bd65dd`)

다른 세션의 커밋 `df16071`이 `increment_view_count()`의 SECURITY INVOKER→DEFINER 수정을
`20260731000003_fix_increment_view_count_security.sql`로 추가했는데, Wave 0의
`20260731000003_ad_images_bucket_policies.sql`과 타임스탬프가 겹쳤다.

**조치**: 상대 파일을 `20260731000005_fix_increment_view_count_security.sql`로 `git mv`
(rename 100%, **내용 무수정**) 후 `npx supabase migration repair --status applied 20260731000005`.

- 우리 파일(`ad_images`)은 Wave 0에서 이미 push돼 원장에 `20260731000003`으로 기록됐으므로
  옮길 수 있는 건 상대 파일이다
- `20260731000004`는 이 Phase의 DROP 마이그레이션이 점유하므로 `000005` 사용
- `db push`가 아니라 `repair`가 정확한 조치인 이유: 해당 수정은 **이미 프로덕션에 적용돼
  있음이 실측 확인**됐다 (`prosecdef = true`, `proconfig = search_path=""`).
  그대로 뒀다면 CLI가 `000003`을 "이미 적용됨"으로 보아 상대 파일이 영구히 추적 불가 상태가 된다
