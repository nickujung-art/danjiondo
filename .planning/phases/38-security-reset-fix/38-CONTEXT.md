# Phase 38: 스토리지 정책 보안 수정 · db reset 복구 · 데드 오버로드 정리 - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning
**Source:** Phase 37 실행·검증 중 발견 + 오케스트레이터 라이브 조사

> ⚠️ **Phase 37과 반대다.** Phase 37은 "프로덕션 충실 재현"이라 개선을 금지했다.
> **이 Phase는 의도적으로 프로덕션 동작을 바꾼다.** 마이그레이션 파일과 프로덕션 적용이
> 짝을 이뤄야 하고, 적용 후 로컬이 **새** 프로덕션 상태를 재현해야 한다.

<domain>
## Phase Boundary

**이 Phase가 하는 일**:
1. **HARD-01** — `ad_images_service_write` 정책의 역할 검사 누락 수정 (보안)
2. **HARD-02** — `hagwon_db.blog_*` 컬럼 DDL 복원 → `supabase db reset` 실제 성공
3. **HARD-03** — `recommend_hagwons` 구버전 오버로드 DROP
4. **HARD-04** — 신규 RLS 정책 `TO` 절 명시 규약을 `CLAUDE.md`에 추가

**이 Phase가 하지 않는 일**:
- **기존 96개 정책에 `TO` 절 일괄 추가** — D-04 참고. 악용 불가하고 비용이 이득을 초과
- `ad-images` 버킷의 `public=true` 변경 — 광고 이미지 공개 읽기는 의도된 동작
- 창부레터 앱 개발, 0-4~0-7

## 적용 경로 — `npm run db:push` 사용

Phase 36은 원장 drift 때문에 `execute_sql` + `migration repair`로 우회했다. **Phase 37이 그
drift를 복구했고**(`db push --dry-run` → `{"upToDate":true}`), 이 Phase가 그 복구를 실증하는
첫 사례다. **정상 경로인 `npm run db:push`를 쓴다.**

`execute_sql`로 DDL을 실행하지 마라 — 그게 원래 drift를 만든 경로다.

</domain>

<decisions>
## Implementation Decisions

### D-01: HARD-01 — `ad_images_service_write` 보안 수정

**현재 라이브 상태** (오케스트레이터 실측):

| 정책 | cmd | roles | 조건 |
|---|---|---|---|
| `ad_images_public_read` | SELECT | `{public}` | `using (bucket_id = 'ad-images')` |
| `ad_images_service_write` | INSERT | `{public}` | `with check (bucket_id = 'ad-images')` ← **역할 검사 없음** |

`roles={public}`이라 anon 포함. anon 키만 있으면 `ad-images` 버킷에 임의 파일 업로드가 가능하고,
버킷이 `public=true`라 업로드된 파일은 공개 읽기가 된다.

**단독 실수임이 확인됨** — 같은 저장소의 다른 스토리지 쓰기 정책은 전부 역할 조건을 갖고 있다:

| 정책 | with_check |
|---|---|
| `realtor_profiles_service_insert` | `bucket_id='realtor-profiles' **AND auth.role()='service_role'**` |
| `cardnews-payloads service insert` | `bucket_id='cardnews-payloads' **AND auth.role()='service_role'**` |
| **`ad_images_service_write`** | `bucket_id='ad-images'` ❌ |

🔴 **`ad-images` 버킷과 두 정책은 로컬 마이그레이션 파일이 없다.**
`grep -rn "ad_images_service_write\|'ad-images'" supabase/migrations/` → 0건
(`realtrade-story-ad-images`만 나온다 — 다른 버킷이다).
Phase 37이 정리한 remote 전용 18건에도 없었다 → **마이그레이션 기록 자체가 없는 객체**다.

**결정**: 수정 마이그레이션이 곧 최초 로컬 기록이 된다. 버킷 생성 + 정책 2개를 전부 포함해
작성하고, `ad_images_service_write`만 고친다.

```sql
-- 버킷 (이미 존재하므로 멱등하게)
insert into storage.buckets (id, name, public)
values ('ad-images', 'ad-images', true)
on conflict (id) do nothing;

-- 공개 읽기 — 현행 유지 (광고 이미지 공개 읽기는 의도)
drop policy if exists "ad_images_public_read" on storage.objects;
create policy "ad_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ad-images');

-- 🔴 업로드 — service_role 조건 추가 (이번 수정의 핵심)
drop policy if exists "ad_images_service_write" on storage.objects;
create policy "ad_images_service_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ad-images' and auth.role() = 'service_role');
```

> `TO` 절도 함께 명시한다 — 이 Phase는 "개선하는" Phase이므로 Phase 37의 충실 재현 제약이
> 적용되지 않는다. 다만 **`ad-images` 관련 정책에만** 적용하고 다른 96개는 건드리지 않는다(D-04).

**착수 시 확인할 것**:
- `ad-images` 버킷 현재 파일 **2개**의 정상 여부 (정상 광고 이미지인지, 정체불명 업로드인지)
- 어드민 광고 이미지 업로드 경로가 `service_role`을 쓰는지 (`src/app/api/**` 또는 Server Action).
  **클라이언트에서 anon 키로 직접 업로드하고 있다면 이 수정이 그 기능을 깨뜨린다** —
  그 경우 업로드 경로를 서버 경유로 바꾸는 것까지 이 Phase 범위에 포함해야 한다

### D-02: HARD-02 — `db reset` 복구

**문제**: `hagwon_db.blog_snippet`·`blog_tags`를 만드는 `ADD COLUMN`이 로컬에 없다.
`20260619000003_recommend_hagwon_candidates_v2.sql`이 `LANGUAGE sql`로 그 컬럼을 SELECT하는데,
Postgres는 `check_function_bodies=on`(기본값)에서 SQL 함수 본문을 **생성 시점에 검증**하므로
`db reset`이 그 지점에서 실패한다. 프로덕션은 정상(컬럼 존재)이라 운영 영향 없음.

**복원할 DDL** (`.planning/phases/37-migration-drift/ledger-backup-13-reverted.sql`
`20260619043107` 블록에서 추출, 그대로 사용):

```sql
ALTER TABLE public.hagwon_db
  ADD COLUMN IF NOT EXISTS blog_snippet text,
  ADD COLUMN IF NOT EXISTS blog_tags    text[];

COMMENT ON COLUMN public.hagwon_db.blog_snippet IS '네이버 블로그 검색 스니펫 합본 (최대 10개, ~1500자)';
COMMENT ON COLUMN public.hagwon_db.blog_tags    IS 'AI 추출 태그 배열 (예: ["#수학전문","#친절한선생님"])';
```

**슬롯 문제와 해법**: 복원 위치는 `000002`(rpc)보다 뒤, `000003`(v2, 컬럼 SELECT)보다 앞이어야
하는데 정수 슬롯이 없다. 따라서:

| 조치 | 결과 순서 |
|---|---|
| `_recommend_hagwon_candidates_v2.sql` `20260619000003` → `20260619000005` (`git mv`) | `000001` hagwon_system |
| `20260619000003_add_hagwon_blog_fields.sql` 신규 생성 | `000002` recommend_hagwon_candidates_rpc |
| 양쪽 `migration repair --status applied` | **`000003` add_hagwon_blog_fields** |
| | `000004` phase28_subject_v2 |
| | `000005` recommend_hagwon_candidates_v2 |

`000004 subject_v2`가 `000005 v2`보다 앞인 것은 무해하다 — subject_v2는
`hagwon_db.subject_category` CHECK 변경 + 데이터 조작이고, v2는 함수 생성이라 순서 무관.

⚠️ `ADD COLUMN IF NOT EXISTS`라 프로덕션 재적용은 no-op다. 즉 이 항목은 **로컬 재현성만**
고치고 프로덕션 스키마는 바꾸지 않는다.

**🔴 마무리 검증 필수**: **로컬에서 `supabase db reset`을 실제로 실행**해 전 구간 성공을
확인한다. Phase 37이 정확히 이 실측을 안 해서 `gaps_found`가 났다.
Docker 스택이 없어 실행 불가하면 **"통과"라고 쓰지 말고 미검증으로 명시**하라.

### D-03: HARD-03 — `recommend_hagwons` 구버전 DROP

**라이브 실측** (오버로드 2개):
```
recommend_hagwons(double precision, double precision, text, text[], text,   integer)  ← 구버전
recommend_hagwons(double precision, double precision, text, text[], text[], integer)  ← 신버전 유지
```
차이는 5번째 인자 `p_fee_tier text` vs `p_fee_tiers text[]`.
`phase28_subject_v2`가 배열화하며 구버전을 DROP하지 않아 둘 다 남았다.

**앱 미사용 확인됨**: `grep -rn "recommend_hagwons" src/ scripts/` → `src/types/database.ts`
(생성 타입)만. 실제 호출부는 `src/lib/data/hagwon-recommend.ts:21`의
`recommend_hagwon_candidates`뿐이다. `pg_stat_user_functions` 호출 통계도 0.

```sql
drop function if exists public.recommend_hagwons(
  double precision, double precision, text, text[], text, integer
);
```

로컬 마이그레이션에도 두 버전이 다 생성되므로(`20260619000001` + `20260619000004`),
이 DROP 마이그레이션이 뒤에 붙어야 `db reset` 최종 상태가 1개가 된다.

### D-04: HARD-04 — 규약만 추가, 일괄 수정 안 함

**실측 결과 `roles={public}`인 정책이 97개다** — 저장소 RLS의 사실상 전부.
명시적 `TO`를 쓰는 건 Phase 36의 창부레터 정책 7개뿐.

**그러나 대부분 버그가 아니다**:
- 읽기 정책의 `TO public` + `using (true)`는 **anon 공개 읽기 의도와 일치** (예: `complexes: public read`)
- 쓰기 정책 29건을 전수 확인한 결과 **HARD-01 하나를 제외하고 전부** `auth.uid()` /
  `exists(profiles.role …)` / `auth.role()='service_role'` 제한 조건을 갖고 있어 악용 불가

**결정**: `CLAUDE.md`에 **신규 정책은 `TO` 절 명시** 규약만 추가한다.
기존 96개 일괄 수정은 저장소 전체 RLS 재작성이고 회귀 위험 대비 이득이 없다.

### D-05: Claude's Discretion

- 마이그레이션 파일명·타임스탬프 (충돌 없고 D-02 순서 제약 보존)
- HARD-01·03을 한 마이그레이션에 묶을지 분리할지 (Wave가 다르므로 분리가 자연스러움)
- `CLAUDE.md` 규약 문구
- anon 업로드 거부 검증 방식 (Phase 36의 `scripts/verify-cbl-rls.ts` 패턴 재사용 가능)

</decisions>

<baseline>
## 실행 전 기준값 (오케스트레이터 실측, 2026-07-31)

| 항목 | 값 |
|---|---|
| `ad-images` 버킷 | 존재, `public=true`, 파일 **2개** |
| `ad_images_public_read` | SELECT, `{public}`, `using (bucket_id='ad-images')` |
| `ad_images_service_write` | INSERT, `{public}`, `with check (bucket_id='ad-images')` ← 수정 대상 |
| `recommend_hagwons` | 오버로드 **2개** |
| `recommend_hagwon_candidates` | 1개 (인자 7) |
| `hagwon_db` | 4,601행 / `blog_snippet`·`blog_tags` 컬럼 존재 |
| `complexes` | 4,285행 |
| `migration list --linked` | 불일치 **0건**, `db push --dry-run` → `upToDate:true` |
| 창부레터 5테이블 | RLS on, 정책 7개, 0행 |

Phase 38 종료 시: `ad_images_service_write`에 `service_role` 조건 추가,
`recommend_hagwons` 1개, 나머지 동일.

</baseline>

<scope_fence>
## Scope Fence

1. **기존 96개 정책에 `TO` 절 일괄 추가 금지** (D-04). `ad-images` 관련 정책만 손댄다
2. **`ad-images` 버킷의 `public=true`를 바꾸지 마라** — 공개 읽기는 의도된 동작.
   문제는 업로드 권한이지 읽기 권한이 아니다
3. **`execute_sql`로 DDL 실행 금지.** Phase 37이 복구한 `npm run db:push`를 쓴다.
   MCP `apply_migration`도 금지 (drift 원인)
4. **`db reset` 결과를 낙관적으로 보고하지 마라.** 실행 못 했으면 미검증으로 명시
5. **`20260619000002_recommend_hagwon_candidates_rpc.sql`을 옮기지 마라** — 옮기는 건
   `_recommend_hagwon_candidates_v2.sql`(`000003`→`000005`)이다
6. **`recommend_hagwons` 신버전(`p_fee_tiers text[]`)은 DROP하지 마라.** 구버전만
7. 애플리케이션 코드 변경 없음 (`src/types/database.ts` 재생성은 예외).
   ⚠️ 단 D-01의 업로드 경로 조사에서 클라이언트 직접 업로드가 발견되면 그건 예외 —
   사용자에게 보고하고 범위 확대를 확인받아라
8. 창부레터 0-4~0-7 무접촉

</scope_fence>

## Success Criteria

1. `ad_images_service_write`의 `with_check`에 `auth.role() = 'service_role'` 포함,
   **anon 역할로 `ad-images` 업로드가 거부됨을 실측 확인**
2. `ad-images` 버킷 + 정책 2개를 만드는 로컬 마이그레이션 존재
3. `hagwon_db.blog_snippet`·`blog_tags`를 만드는 로컬 마이그레이션이 `20260619000003`에 존재
4. **`supabase db reset` 전 구간 성공** (또는 실행 불가 사실이 SUMMARY에 명시)
5. `recommend_hagwons` 오버로드 **1개**(`p_fee_tiers text[]`)만 잔존
6. `CLAUDE.md`에 신규 RLS `TO` 절 규약 추가
7. `migration list --linked` 0/0 유지, `npm run lint` 통과
8. 회귀 없음 — `ad-images` 기존 파일 2개 읽기 정상, 어드민 광고 이미지 업로드 경로 정상

## Risk Summary

| 위험 | 완화 |
|------|------|
| **업로드 정책 수정이 어드민 기능을 깨뜨림** | D-01 착수 시 업로드 경로가 `service_role`을 쓰는지 먼저 확인. 클라이언트 직접 업로드면 보고 후 범위 확대 |
| `ad-images`의 기존 파일 2개가 악의적 업로드일 가능성 | D-01에서 파일 목록·업로더·업로드 시각 확인 |
| `db reset`을 실행 못 해 HARD-02가 또 미검증으로 남음 | Scope Fence 4번 — 미검증을 통과로 쓰지 않는다. Phase 37이 같은 실수로 `gaps_found` |
| 오버로드 DROP이 실제 사용처를 깨뜨림 | 앱 grep 0건 + `pg_stat_user_functions` 0 확인됨. `IF EXISTS`로 안전하게 |
| `db push`가 다시 실패 | Phase 37이 복구했고 `--dry-run`이 `upToDate:true`. 실패하면 drift 재발이므로 즉시 중단·보고 |
