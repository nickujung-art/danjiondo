# 실거래이야기 — 광고 이벤트 적재 인계 (2026-08-26)

> `record_ad_event` RPC 가 프로덕션에 적용됐다. realtrade-story 는 **service-role 키 없이**
> 광고 노출·클릭을 적재할 수 있다. 이 문서 하나만 보고 붙이면 된다.
> 관련: `04-infra-integration.md`(연결정보) · `05-handoff-notes.md`(전체 스냅샷)

---

## 1. 계약

```
public.record_ad_event(
  p_campaign_id uuid,
  p_event_type  text,           -- 'impression' | 'click'
  p_ip_hash     text default null
) returns uuid                  -- 삽입된 ad_events.id
```

`SECURITY DEFINER` · `search_path=''` · `anon`·`authenticated` 에 EXECUTE
(`revoke ... from public` 후 부여 — PostgreSQL 이 EXECUTE 를 PUBLIC 에 기본 부여하므로).

### 🔴 반환 uuid 가 곧 성공 확인이다

`void` 로 만들지 않은 이유가 이것이다. 이 DB 에서 **"에러도 없는데 행도 안 늘어나는"**
실패가 세 번 났다(`increment_view_count` 전체 0 · 관리자 삭제 0행 · RLS 막힌 UPDATE).
`data` 가 `null` 이면 그 자체가 이상 신호다. **service role 로 카운트를 세서 확인할 필요가 없다.**

### 호출 예

```ts
const { data: eventId, error } = await supabase.rpc('record_ad_event', {
  p_campaign_id: campaignId,
  p_event_type: 'impression',
  p_ip_hash: ipHash,          // 생략 가능
})
if (error)      return fail(error.message)   // 거부 — 아래 표 참고
if (!eventId)   return fail('무행위')         // 🔴 조용한 실패. 절대 성공으로 넘기지 말 것
```

### 거부 응답 — 전부 `HTTP 400` / `code 22023`

| 조건 | message |
|---|---|
| `event_type` 이 impression·click 이 아님 | `invalid event_type: …` |
| 캠페인 없음 **또는** `site_id ≠ 'realtrade-story'` | `unknown or out-of-scope campaign: …` |
| `ip_hash` 가 주소 형태(IPv4 점4분할·콜론 포함) | `ip_hash must be a hash, not an address` |
| `ip_hash` 128자 초과 | `ip_hash too long: N chars (max 128)` |

캠페인 "없음" 과 "남의 것" 을 **같은 메시지로** 돌려준다 — 다르게 답하면 uuid 존재
여부를 알려주는 오라클이 된다.

---

## 2. DB 가 강제하는 것 / 호출자 책임

| | 누가 |
|---|---|
| event_type 허용목록 | **DB** |
| 캠페인 존재 + `site_id='realtrade-story'` | **DB** (호출자도 하지만 anon 키가 공개라 우회 가능해서 이중) |
| ip_hash 가 주소가 아님 | **DB** |
| IP → 해시 변환 | 호출자 (브라우저도 Postgres 도 클라이언트 IP 를 모른다) |
| 레이트리밋 | 호출자 |
| 노출 판정(화면에 실제로 보였나) | 호출자 |

### 🔴 레이트리밋은 DB 에 넣을 수 없다

`ip_hash` 를 **호출자가 주므로** `(campaign, ip_hash)` 당 분당 N건 같은 제한을 걸어도
공격자는 ip_hash 만 바꾸면 그만이다. 비용만 늘고 방어력이 0 이다.
실효 방어는 ⑴ 라우트의 IP 기준 제한(정직한 클라이언트 보호) ⑵ **사후 이상탐지** 두 층이다.

---

## 3. 알고 있어야 할 제약 3가지

**① `conversion` 은 거부된다.** 허용목록이 impression·click 2종이다.
`ad_events` 테이블 제약과 bds 의 `/api/ads/events` 는 `conversion` 도 받으므로,
전환 추적이 필요해지면 **마이그레이션이 한 번 더** 필요하다.

**② `is_anomaly` 는 항상 `false` 로 들어간다.** 요청 시점 판정은 과거 이력 조회를
광고 1회마다 왕복시키므로 사후 집계가 맞다는 판단이다.
다만 bds 의 `/api/ads/events` 는 click 에 한해 일별 한도로 이 값을 세팅한다 —
**두 사이트 이벤트를 한 리포트에서 볼 때 이 축의 커버리지가 비대칭**이다.

**③ `ip_hash` 는 인코딩을 가정하지 않는다.** hex·base64 둘 다 통과한다.
거부되는 건 "주소처럼 생긴 것" 뿐이다 — 원본 IP 유입을 구조로 막기 위한 것이다.

---

## 4. bds 쪽에서 함께 바뀐 것

`getActiveAds` 가 `site_id` 로 거르지 않아 **realtrade-story 광고가 danjiondo 화면에
노출될 수 있었다.** 같은 커밋 묶음에서 고쳤다(`214c072`).

`ad_campaigns` 는 세 사이트가 한 Supabase 프로젝트에서 공유하고, 사이트 분리는 RLS 가
아니라 **애플리케이션 코드 책임**이다(`src/lib/data/site.ts`). 같은 유형이 세 번째다 —
알림 크론(07-28) · 즐겨찾기(07-31) · 광고(08-26).

> ⚠️ **어드민 경로 11지점은 아직 스코프가 없다** — bds 어드민이 realtrade-story
> 캠페인을 보고 승인·삭제할 수 있다. 소유자 감독 의도인지 미확정이라 남겨 뒀다.

---

## 5. 검증 기록

### RPC 적용 직후 (임시 캠페인)
```
정상 호출     uuid 반환 + ad_events 정확히 +1, 저장된 5개 컬럼 전부 일치
거부 7종      남의 캠페인·없는 캠페인·hack·conversion·IPv4·IPv6·129자 — 거부 중 행 증가 0
base64 해시   통과 (인코딩 비의존)
기존 RLS      anon 직접 INSERT 42501 유지 · anon SELECT 0행 유지
```

### 실제 캠페인으로 종단 확인 (`db77113e-e600-41db-a5db-be904198d3ed` / 한신더휴)
```
anon impression → 8d1db91d-…   ✅
anon click      → cdcd84fc-…   ✅
검증 이벤트 2건은 삭제 — 이 캠페인 이벤트 0건으로 원복(리포트 오염 없음)
```

---

## 6. ✅ placement 원장 drift — 해결됨 (2026-08-26)

realtrade-story 가 광고 등록에서 `ad_campaigns_placement_check` 위반으로 거절당해
**SQL Editor 로 먼저 제약을 확장**했다. 실물에는 반영됐지만 마이그레이션 원장에는
없어서, `db reset` 시 값이 사라져 광고 적재가 통째로 깨질 상태였다.

`supabase db dump --linked` 로 **실물 정의를 받아 그대로** 원장에 남겼다
(`20260826150000_ad_campaigns_placement_realtrade_story.sql`). 추측으로 쓰지 않은
이유는 빠뜨린 값이 있으면 그 지면의 광고가 통째로 막히기 때문이다.

```
banner_top · sidebar · in_feed · map_popup              ← danjiondo (유지)
complex_detail_presale_banner · complex_detail_agent_block · home_feed_banner
                                                        ← realtrade-story
```

### 검증

```
적용 전/후 pg_dump 정의 동일   원장만 채웠고 실물은 안 건드렸다
7개 값 전부 실제 INSERT 통과
임의값(__bogus__)은 여전히 23514 로 거부
기존 danjiondo 행 UPDATE 정상 — CHECK 재평가에서 거절되지 않는다
임시 캠페인 7건 삭제, ad_campaigns 10건 원복
```

### 🔴 다음에 지면을 추가할 때

**SQL Editor 로 끝내지 말 것.** 같은 drift 가 반복된다. 위 마이그레이션 파일에 값을
더하는 마이그레이션을 남긴다. realtrade-story 쪽은 `src/lib/ads/placements.ts` 주석에
"DB CHECK 제약이 진짜 권위자" 라고 적어 뒀다 — 그 파일을 고칠 때 bds 요청을 함께 낸다.

## 7. 참고 — 현재 캠페인 상태

```
realtrade-story  approved  home_feed_banner  2026-08-26 KST 하루  한신더휴  🟢 서빙중
danjiondo        approved  9건 — 전부 만료 (5건은 08-26 만료)     ⚪ 현재 노출 광고 없음
```
