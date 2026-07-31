# Phase 38 / Plan 00 — SUMMARY

**Phase:** 38-security-reset-fix
**Plan:** 00 (Wave 0)
**Requirements:** HARD-01
**Status:** ✅ 완료
**Date:** 2026-07-31

---

## 무엇을 했나

`storage.objects`의 `ad_images_service_write` 정책에 역할 검사가 없어 **anon 키 보유자가
`ad-images` 버킷(`public=true`)에 임의 파일을 업로드할 수 있던 취약점**을 닫았다.
`ad-images` 버킷과 정책 2개는 로컬 마이그레이션 기록이 전혀 없었으므로
`20260731000003_ad_images_bucket_policies.sql`이 **최초 로컬 기록**이 된다.

### 커밋

| 커밋 | 내용 |
|---|---|
| `85b93d2` | `fix(38-00)`: 마이그레이션 파일 + `scripts/verify-ad-images-rls.ts` |

### 파일

| 경로 | 역할 |
|---|---|
| `supabase/migrations/20260731000003_ad_images_bucket_policies.sql` | 버킷 멱등 생성 + 정책 2개 (최초 로컬 기록, HARD-01 수정 포함) |
| `scripts/verify-ad-images-rls.ts` | anon/service_role 클라이언트 분리 실측 검증 (`--expect=allow|deny`) |

---

## 🔴 HARD-01 — 수정 전 / 수정 후 실측 대조표

이 대조가 HARD-01의 **유일한 증거**다. DDL을 읽은 것은 증거로 치지 않는다.

| # | 항목 | 수정 전 (`--expect=allow`) | 수정 후 (`--expect=deny`) | 판정 |
|---|------|---------------------------|--------------------------|------|
| 1 | **anon 업로드** | **성공** ← 🔴 취약점 실증 | **`error(403): new row violates row-level security policy`** ← ✅ 차단됨 | **뒤집힘 확인** |
| 2 | anon 기존 파일 읽기 [positive control] | 53250 bytes | 53250 bytes | 회귀 없음 |
| 3 | service_role 업로드 [회귀 가드] | 성공 | 성공 | 회귀 없음 |
| 4 | 버킷 파일 감사 | 패턴 밖 파일 0건 | 패턴 밖 파일 0건 | 정상 |
| 5 | cleanup (PREFIX 잔여 / 전체 파일 수) | 0건 / 2건 | 0건 / 2건 | baseline 복귀 |
| | **총계** | **5/5 PASS** | **5/5 PASS** | |

**항목 1이 "성공" → "403 RLS 거부"로 뒤집힌 것이 수정 효과의 실측 증거다.**
positive control 2건(항목 2·3)이 양쪽 실행에서 모두 통과했으므로 차단 결과는 연결 오류가
아니라 정책에 의한 차단임이 확정된다.

### 수정 전 실행 전문 (`--expect=allow`)

```
🔗 연결 대상: https://auoravdadyzvuoxunogh.supabase.co
🎯 기대 모드: --expect=allow (수정 전 — 취약점 실증)
📐 baseline 파일 수 (PREFIX 제외): 2

✅ [1] anon 업로드 — 기대: 성공 (취약) / 실측: 성공
✅ [2] anon 기존 파일 읽기 [positive control] (1779771782901-6ubnud4h6in.png) — 기대: 바이트 길이 > 0 / 실측: 53250 bytes
✅ [3] service_role 업로드 [회귀 가드] — 기대: 성공 / 실측: 성공
✅ [4] 버킷 파일 감사 (ad-actions.ts 경로 패턴 일치) — 기대: 패턴 밖 파일 0건 / 실측: 패턴 밖 파일 0건
✅ [5] cleanup 검증 — 기대: PREFIX 잔여 0건, 전체 2건 / 실측: PREFIX 잔여 0건, 전체 2건

📊 결과: 5/5 PASS (--expect=allow)
```

### 수정 후 실행 전문 (`--expect=deny`)

```
🔗 연결 대상: https://auoravdadyzvuoxunogh.supabase.co
🎯 기대 모드: --expect=deny (수정 후 — 차단 확인)
📐 baseline 파일 수 (PREFIX 제외): 2

✅ [1] anon 업로드 — 기대: 거부 / 실측: error(403): new row violates row-level security policy
✅ [2] anon 기존 파일 읽기 [positive control] (1779771782901-6ubnud4h6in.png) — 기대: 바이트 길이 > 0 / 실측: 53250 bytes
✅ [3] service_role 업로드 [회귀 가드] — 기대: 성공 / 실측: 성공
✅ [4] 버킷 파일 감사 (ad-actions.ts 경로 패턴 일치) — 기대: 패턴 밖 파일 0건 / 실측: 패턴 밖 파일 0건
✅ [5] cleanup 검증 — 기대: PREFIX 잔여 0건, 전체 2건 / 실측: PREFIX 잔여 0건, 전체 2건

📊 결과: 5/5 PASS (--expect=deny)
```

---

## 적용 경로 — `npm run db:push` (정상 경로 복귀 실증)

Phase 36의 `execute_sql` + `migration repair` 우회를 쓰지 않았다. Phase 37이 복구한
원장 위에서 **정상 경로가 처음으로 그대로 동작함을 실증**한 사례다.

### 1. `npx supabase db push --dry-run`

```
DRY RUN: migrations will *not* be pushed to the database.
Initialising login role...
Connecting to remote database...
Would push these migrations:
 • 20260731000003_ad_images_bucket_policies.sql
{"upToDate":false,"dryRun":true,"migrations":["20260731000003_ad_images_bucket_policies.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

대기 목록에 **우리 파일 1건만** — drift 재발 없음.

### 2. `npm run db:push`

```
Initialising login role...
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 20260731000003_ad_images_bucket_policies.sql
Applying migration 20260731000003_ad_images_bucket_policies.sql...
Finished supabase db push.
```

exit 0. 우회 경로(`execute_sql` / MCP `apply_migration`) 미사용 — Scope Fence 3번 준수.

### 3. `pg_policies` 최종 상태 (라이브 조회)

| policyname | cmd | roles | qual | with_check |
|---|---|---|---|---|
| `ad_images_public_read` | SELECT | `{anon,authenticated}` | `(bucket_id = 'ad-images'::text)` | `null` |
| `ad_images_service_write` | INSERT | `{authenticated}` | `null` | `((bucket_id = 'ad-images'::text) AND (auth.role() = 'service_role'::text))` |

`with_check`에 `service_role` 포함 확인. `roles`도 `{public}` → 명시적 `TO` 절로 좁혀졌다.

**최종 권한 구조** (의도된 상태):
- anon → `TO authenticated`에 매칭 안 됨 → 적용 정책 0개 → 거부
- 일반 authenticated → 매칭되나 `auth.role()`이 `'authenticated'` 반환 → check 실패 → 거부
- service_role → `BYPASSRLS`라 정책 평가 자체를 안 받음 → 업로드 성공

즉 **RLS 경로로는 아무도 업로드할 수 없고 service_role만 가능**하다. 항목 3의 성공은 모순이 아니라 의도.

### 4. `npx supabase migration list --linked`

local-only **0건**, remote-only **0건**. 모든 엔트리가 local/remote 쌍을 이루며
`20260731000003`도 양쪽에 기록됐다. 원장 정합성 유지.

### 5. `storage.buckets` 불변 확인

```json
{ "id": "ad-images", "public": true }
```

`public=true` 유지 — Scope Fence 2번 준수 (공개 읽기는 의도된 동작).

---

## `ad-images` 기존 파일 2개 감사 결과

| 파일명 | created_at | mimetype | size | `ad-actions.ts:26` 패턴 부합 |
|---|---|---|---|---|
| `1779771782901-6ubnud4h6in.png` | 2026-05-26T05:03:03.488Z | image/png | 53,250 | ✅ 부합 |
| `1779773398959-4fpl5hyi8dk.png` | 2026-05-26T05:29:59.384Z | image/png | 53,250 | ✅ 부합 |

판정 패턴: `/^\d{13}-[a-z0-9]+\.(jpg|jpeg|png|webp|gif)$/`
(= `ad-actions.ts:26`의 `` `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}` ``)

**패턴 밖 파일 0건 — 외부 업로드 흔적 없음.** 두 파일 모두 정상적인 어드민 업로드 경로로
생성된 것으로 판단된다. 스크립트는 기존 파일을 삭제하지 않으며 cleanup은 `zz-ad-verify-`
접두어 매칭만 수행한다 (검증 전후 파일 수 2 → 2 불변).

---

## Server Action 업로드 경로 회귀 없음

`src/lib/auth/ad-actions.ts:12-37` `uploadAdImage()`는 `'use server'` Server Action이며
`requireAdmin()`(profiles.role ∈ admin/superadmin) 게이트 통과 후
`createSupabaseAdminClient()`(service_role)로 `admin.storage.from('ad-images').upload(...)`를
호출한다. **service_role은 `BYPASSRLS`라 이 정책 변경의 영향을 받지 않는다.**

- 검증 항목 3(service_role 업로드)이 이 경로의 대리 검증이며 수정 전후 **모두 성공**
- `git status --porcelain src/` → **빈 출력** (앱 코드 무변경)
- `src/types/database.ts` 재생성 없음 (스토리지 정책은 타입에 영향 없음 — plan 확정 사항)

---

## Verification

| # | 검증 | 결과 |
|---|---|---|
| 1 | `grep -v '^--' <migration> \| grep -c "service_role"` ≥ 1 | ✅ 1 |
| 2 | `db push --dry-run` 대기 목록에 신규 파일 1건만 | ✅ |
| 3 | `pg_policies` `ad_images_service_write.with_check`에 `service_role` 포함, `roles={authenticated}` | ✅ |
| 4 | `storage.buckets` `ad-images.public = true` 불변 | ✅ |
| 5 | `verify-ad-images-rls.ts --expect=deny` exit 0 (5/5 PASS) | ✅ |
| 6 | `migration list --linked` local-only 0 / remote-only 0 | ✅ |
| 7 | `npm run lint` exit 0 | ✅ (`✔ No ESLint warnings or errors`) |
| 8 | `git status --porcelain src/` 빈 출력 | ✅ |

`npx tsc --noEmit` 도 exit 0.

---

## Scope Fence 준수

| # | 항목 | 준수 |
|---|---|---|
| 1 | 기존 96개 정책에 `TO` 절 일괄 추가 금지 — `ad-images` 관련 2개만 | ✅ (마이그레이션 내 `bucket_id` 참조가 `'ad-images'` 1종) |
| 2 | `ad-images` `public=true` 유지 | ✅ (라이브 조회로 확인) |
| 3 | `execute_sql` / MCP `apply_migration` 금지, `npm run db:push` 사용 | ✅ |
| 7 | `src/**` 무접촉 | ✅ (`git status --porcelain src/` 빈 출력) |
| — | HARD-02·03·04 (`hagwon_db`·`recommend_hagwons`·`CLAUDE.md`) 무접촉 | ✅ Wave 1 소관 |
| 8 | 창부레터 0-4~0-7 무접촉 | ✅ |
| — | `20260731000001`·`20260731000002` (Phase 37 후속 repair분) 재접촉 금지 | ✅ 손대지 않음 |

---

## Wave 1 인수인계

- **이 Wave는 커밋 완료**됐고 프로덕션 적용까지 끝났다. 원장은 0/0 정합.
- 🔴 **`supabase db reset`은 Wave 1 소관이며, 현재 Docker Desktop이 실행 중이 아니다.**
  HARD-02(`hagwon_db.blog_*` 컬럼 DDL 복원)의 마무리 검증은 `db reset` 실제 실행이
  필수인데(38-CONTEXT D-02, Scope Fence 4번), Docker 스택이 없으면 실행 불가다.
  **실행 못 했으면 "통과"라고 쓰지 말고 미검증으로 명시해야 한다** — Phase 37이 정확히
  이 실수로 `gaps_found`가 났다.
- Wave 1이 추가할 마이그레이션은 이 Wave의 `20260731000003` 다음 순번을 쓰되,
  D-02의 슬롯 재배치(`20260619000003` → `20260619000005` `git mv` + 신규
  `20260619000003_add_hagwon_blog_fields.sql`)는 `migration repair --status applied`가
  양쪽 모두 필요하다.
- `scripts/verify-ad-images-rls.ts`는 재실행 가능하다 (`--expect=deny`가 기본값).
  Wave 1 종료 후 회귀 확인용으로 다시 돌려도 프로덕션 버킷에 잔존물을 남기지 않는다.

---

## Success Criteria 달성

1. ✅ `ad_images_service_write.with_check`에 `auth.role() = 'service_role'` 포함
2. ✅ anon 업로드 거부 실측 확인 + 수정 전 "성공" 실측과 대조 가능
3. ✅ anon 기존 파일 읽기 성공 (공개 읽기 회귀 없음)
4. ✅ service_role 업로드 성공 (`uploadAdImage()` 경로 회귀 없음)
5. ✅ 버킷 + 정책 2개의 로컬 마이그레이션 존재 (최초 기록)
6. ✅ 버킷 파일 수 baseline 2개 복귀, 검증 잔존물 없음
7. ✅ `migration list --linked` 0/0 유지, `npm run lint` 통과
