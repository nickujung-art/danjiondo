# 스키마 drift 전수 검사 결과 (2026-08-27)

> realtrade-story 요청(`HANDOFF-bds-20260827-drift-scan.md`)에 대한 회신.
> 스키마 감사는 service-role 키가 필요해 **영구히 bds 소관**이라는 그쪽 판단이 맞다.

---

## 0. 요약

| | |
|---|---|
| **가장 큰 발견** | 마이그레이션 원장이 **2026-08-06부터 재생 불가**였다. `db reset`·`db diff` 가 3주 넘게 깨져 있었고, 그래서 **drift 검사 자체가 불가능한 상태**였다 |
| 재생 차단 지점 | 4건 — 전부 수정. 이제 섀도 빌드가 완주한다 |
| 컬럼 drift | 4건 — 전부 원장 복원 |
| 남은 drift | 정책 9건 · 제약 1건 · 함수 오버로드 1건 — **판단이 필요해 보고만 한다**(§4) |
| 타입 파일 | `database.generated-20260827.ts` 로 첨부 |

---

## 1. 🔴 원장이 재생 불가였다 — 가장 중요한 발견

`supabase db diff` 는 **마이그레이션으로 빈 DB 를 새로 짓고**(섀도) 실물과 비교한다.
그 빌드가 시작조차 못 했다. 즉 **drift 를 볼 수 있는 수단 자체가 죽어 있었다.**

`db push` 는 미적용 마이그레이션만 올리므로 프로덕션은 늘 초록불이었다.
이 부류는 **처음부터 재생할 때만** 드러난다.

### 차단 지점 4건과 수정

| # | 증상 | 원인 | 수정 |
|---|---|---|---|
| 1 | `role "backup_agent" does not exist` (42704) | 롤이 수동 생성돼 원장에 없는데 마이그레이션 5개가 가드 없이 참조 | `supabase/roles.sql` 신설 |
| 2 | `function complex_integrity_counts(text[]) does not exist` (42883) | 08-19 가 REVOKE 하는 함수를 08-21 이 나중에 생성 | 그 REVOKE 제거 + `20260827000000` 이 생성 뒤 권한 확정 |
| 3 | `syntax error at or near "$"` (42601) | 섀도 빌드의 구문 분리기가 `do $$ … $$` 를 처리 못 함 | 해당 마이그레이션에서 DO 블록 제거 |
| 4 | `column t.jibun does not exist` (42703) | `transactions.jibun` 이 원장에 없음 | `20260821085900` 로 복원 (게이트보다 **앞** 순서) |

#### ②는 재생 시 **보안 구멍**이었다

`20260819060000` 은 anon 에 뚫려 있던 함수 권한을 되돌린 마이그레이션이다
(운영 anon 키로 호출하니 HTTP 200 이 나온 사고). 그런데 재생 순서가 이랬다:

```
08-19  REVOKE … FROM anon, authenticated     ← 함수가 아직 없다 → 죽는다
08-21  CREATE OR REPLACE FUNCTION …          ← GRANT/REVOKE 가 한 줄도 없다
                                                → PostgreSQL 기본값 PUBLIC EXECUTE 를 받는다
```

프로덕션은 함수가 먼저 있었고 `CREATE OR REPLACE` 가 기존 권한을 보존해 무사했다(실측:
anon 호출 → 401/42501 ✅). **재생하면 정반대가 된다.** `20260827000000` 이 생성 뒤에
`public` 까지 회수하도록 확정했다.

#### ④ 는 지번 게이트 전체가 얹혀 있는 컬럼이었다

`transactions.jibun` 이 없으면 `refresh_complex_canonical_jibun()` 이 죽고, 게이트가
이름 단독 매칭으로 되돌아간다(CLAUDE.md CRITICAL). 오연결 정리(08-21~26) 전부가
원장에 없는 컬럼 하나에 의존하고 있었다.

---

## 2. 컬럼 drift — 4건, 전부 복원

실물 덤프와 원장이 만드는 컬럼을 전수 대조했다. **테이블 수는 61/61 로 일치**했고
컬럼만 4개 어긋났다.

```
transactions.jibun          text     ← 지번 게이트의 근간
data_sources.error_message  text
facility_kapt.priv_area     numeric  ← 전용률 계산(관리비 평형 환산)
facility_poi.sport_type     text
```

`20260821085900_restore_drifted_columns.sql` 로 기록했다. 멱등이라 프로덕션 무변화.

> 🔴 계측기를 다섯 번 고쳤다. 초기 결과는 "테이블 11개 / 컬럼 57개 누락" 이었는데
> **전부 파서 버그**였다(블록 종료 판정 2회 · 주석 처리 순서 · 셸의 백슬래시 유실 ·
> 다중 `ADD COLUMN` 미인식). 실물 API 로 센 컬럼 수(22/14/35)를 정답으로 놓고
> 계측기부터 검사한 뒤에야 4건으로 수렴했다.
> — realtrade-story 가 `[a-z_]+` 정규식으로 숫자 든 컬럼명을 놓친 것과 같은 부류다.

---

## 3. ✅ storage — 물어본 것에 대한 답

**`realtrade-story-ad-images` 는 원장에 있다.** 걱정한 상황이 아니다.

```
20260728074553  insert into storage.buckets … 'realtrade-story-ad-images'   ✅
                create policy "realtrade-story-ad-images: site admin upload" ✅ (INSERT)
```

읽기 정책이 따로 없는 건 정상이다 — 버킷을 `public: true` 로 만들었으므로 공개 URL 로
읽힌다. `db reset` 해도 업로드가 죽지 않는다.

### 다만 **다른 버킷**에서 storage 정책 3개가 원장에 없다

```
realtor_profiles_public_select    storage.objects  SELECT  bucket_id = 'realtor-profiles'
realtor_profiles_service_delete   storage.objects  DELETE  + auth.role() = 'service_role'
realtor_profiles_service_insert   storage.objects  INSERT  + auth.role() = 'service_role'
```

프로덕션에만 있다 → **`db reset` 하면 공인중개사 프로필 이미지 업로드·조회가 죽는다.**
증상은 "어드민에서 업로드가 안 된다" 로만 보일 것이다 — 정확히 예측한 그 모양이다.

---

## 4. 🔶 남은 drift — 판단이 필요해 보고만 한다

섀도가 완주하면서 나온 실제 diff 다. 방향은 **원장 → 실물**이므로,
`drop X` = 원장에 있는데 실물에 없음 / `create X` = 실물에 있는데 원장에 없음.

### 4-1. `realtors` 읽기 정책 — 프로덕션이 더 엄격하다

```
원장    realtors_select_all      USING (true)
실물    realtors_select_active   USING (is_active = true)
```

**`db reset` 하면 비활성 공인중개사가 공개로 읽힌다.** 원장을 실물에 맞추는 게 맞다.

### 4-2. 정책 5건 — 이름은 같은데 정의가 다르다

`content_complexes: public read` · `contents: public read published` ·
`region_population_cache.public_read` · `regional_commentary: public read` ·
`subscribers: anon subscribe`

실물은 전부 `TO authenticated, anon` 을 **명시**한다. 원장 쪽은 `TO` 절이 없어
`TO public` 이 된다 — CLAUDE.md CRITICAL 이 지목하는 바로 그 차이다.
실물이 옳고 원장이 낡았다.

### 4-3. 🔴 `match_complex_by_admin` 3인자 오버로드가 원장에만 있다

```
원장    match_complex_by_admin(p_sgg_code, p_name_normalized, p_min_similarity)      ← 20260430000012
        match_complex_by_admin(…, p_umd_nm, p_jibun)  5인자                          ← 이후 create or replace
실물    5인자만
```

`create or replace` 는 **인자가 다르면 교체가 아니라 새 오버로드**를 만든다.
프로덕션에서는 3인자를 수동으로 지웠지만 원장에는 남아 있다.
**재생하면 두 벌이 공존해 호출이 모호해진다** — Phase 38 HARD-03(`recommend_hagwons`)과
같은 사고다. CLAUDE.md 가 매칭 RPC 변경 시 반드시 호출해 확인하라고 적은 이유이기도 하다.

### 4-4. `new_listings_name_region_key` UNIQUE 가 원장에만 있다

실물에는 없다. 재생하면 프로덕션에 없는 UNIQUE 제약이 생긴다 →
`onConflict` 추론 결과가 환경마다 달라진다(CLAUDE.md CRITICAL 의 42P10 부류).

### 4-5. 나머지

`complex_canonical_jibun_collisions` 뷰는 **양쪽에 다 있고 정의만 다르다**(뷰가 사라진 게 아니다).
함수 18개가 diff 에 뜨는데 대부분 migra 의 본문 재출력(공백·서식) 노이즈로 보인다 —
구조적 차이가 확인된 것은 4-3 뿐이다.

---

## 5. 타입 파일

`supabase gen types typescript --linked` 결과를 `database.generated-20260827.ts` 로 뒀다.
4,610줄. `record_ad_event` 는 요청대로 이렇게 들어가 있다:

```ts
record_ad_event: {
  Args: { p_campaign_id: string; p_event_type: string; p_ip_hash?: string }
  Returns: string
}
```

`complex_status` 에도 `out_of_region` 이 포함돼 있다. 기운 자국 두 곳을 다 걷어낼 수 있다.

---

## 6. 앞으로

**이제 `supabase db diff --linked` 가 동작한다.** 3주 만이다.
지면 추가·수동 SQL 적용 뒤에는 이걸 돌려 원장과 실물이 갈라졌는지 볼 수 있다.

```
npx supabase db diff --linked --schema public,storage
```

§4 를 원장에 반영하는 것은 별도 작업으로 남긴다 — 정책 변경은 보안 판정이 섞여 있어
"실물이 옳다" 를 일괄 적용하기 전에 확인이 필요하다.
