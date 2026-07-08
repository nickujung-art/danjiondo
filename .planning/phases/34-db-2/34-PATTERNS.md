# Phase 34: 부산광역시 확장 - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** ~30 (신규 파일 3~4개 + 수정 대상 25개 이상)
**Analogs found:** 30/30 — 이 phase는 Phase 33(경남 전체 확장)의 구조적 재실행이므로, **모든 파일의 최우선 analog은 Phase 33에서 실제로 실행된 동일 파일의 diff/plan**이다. 코드베이스 일반 검색은 보조 수단으로만 사용했다.

**핵심 전제:** 이 phase는 새 아키텍처가 아니라 "이미 파라미터화된 파이프라인의 설정값 확장"이다. 따라서 패턴 추출의 본질은 "Phase 33에서 각 파일을 어떻게 고쳤는가"이며, 부산 phase의 각 plan은 **거의 동일한 diff를 다른 sgg_code 리스트로 재실행**하면 된다. 단, Phase 33 종료 후 이미 동적화가 완료된 파일들은 **이번엔 코드 변경이 필요 없고 regions 시딩만으로 자동 확장**된다 — 이 구분이 가장 중요하다.

---

## File Classification

### A그룹 — 이미 동적화 완료 (코드 변경 불필요, regions 시딩만으로 자동 확장)

| File | Role | Data Flow | 근거 |
|------|------|-----------|------|
| `src/app/invest/page.tsx`, `region/[sggCode]/page.tsx` | component (RSC) | request-response | 33-01에서 `getActiveSggCodes()` 전환 완료 |
| `src/lib/data/invest.ts`, `gap-analysis.ts` | service (data layer) | CRUD | 33-01/33-02 완료 |
| `src/lib/data/rankings.ts`, `rankings-page.ts` | service (data layer) | batch/CRUD | 33-02 완료 |
| `src/app/gap-analysis/page.tsx` | component (RSC) | request-response | 33-01 완료 |
| `src/services/molit-presale.ts`, `src/app/api/cron/daily/route.ts` | route/service | event-driven (cron) | 33-03 완료 (LAWD_CODES/offiSggCodes 제거됨) |
| `src/services/cheongyak/client.ts` | service (external adapter) | request-response | 33-03 완료 (`cities` 파라미터화) |
| `src/app/map/page.tsx` | component (RSC) | request-response | 33-09 완료 (TARGET_SGG 제거) |
| `src/app/api/ads/sidebar/route.ts` | route | request-response | 33-09 완료 (VALID_SGG_CODES 제거) |
| `src/services/molit-unsold.ts`, `scripts/fetch-regional-unsold.ts` | service/script | batch | 33-10 완료 — **단, 부산은 별도 서비스 ID 필요(Open Question, 아래 참고)** |
| `src/lib/data/realprice-officetel.ts` | service (data layer) | CRUD | 33-10 완료 (`getActiveRegionAddrs`) |
| `scripts/backfill-officetel.ts`, `scripts/seed-kosis-population.ts` | script | batch | 33-10 addendum / 33-01 완료 |
| `scripts/seed-complexes.ts`, `scripts/kapt-enrich.ts` | script | batch | 33-06에서 이미 동적 조회 확인 (`getSggCodes()`) |
| `scripts/backfill-realprice.ts`, `.github/workflows/molit-backfill-once.yml` | script/workflow | batch | Phase 05/33 검증 완료, `--sgg` 입력 또는 regions 동적 조회 |
| `src/lib/data/seo-hierarchy.ts` | service (data layer) | CRUD | 33-04에서 회귀 테스트로 코드 변경 불필요 확인 (`hasGu` 판별이 `complexes.gu` 컬럼 기반) |
| `src/lib/data/complexes-map.ts` | service (data layer) | CRUD | BBOX 상수(lat/lng 범위)만 확장 필요 — 커밋 `b59bd01` |

**이 A그룹에 대한 34번 phase의 유일한 작업:** `regions` 테이블에 부산 16개 구·군 INSERT + (좌표 지오코딩 완료 후) `complexes-map.ts`의 BBOX 상수 재확장. 그 외 코드 수정 없음.

### B그룹 — Phase 33 종료 후 추가로 발견된 하드코딩 (재스윕 시 반드시 재확인 필요)

| File | Role | Data Flow | 근거 |
|------|------|-----------|------|
| `scripts/collect-school-stats.ts` | script | batch | 커밋 `11d5952` — `GYEONGNAM_SGG` 배열에 지역 하드코딩(이름+sggCode+schulKndCodes), regions 동적 조회로 전환되지 않음 |
| `scripts/fetch-sports-facilities.ts` | script | batch | 커밋 `11d5952` — `ADDRESS_KEYWORDS` 배열 하드코딩 + PostgREST 1,000행 캡 수정 이력 |
| `src/app/admin/region-expansion/page.tsx` | component (admin dashboard) | request-response | `NEW_CODES`/`OLD_CODES` 하드코딩, grep 패턴(`ALLOWED_SGG_CODES` 등)에 안 걸림 — RESEARCH.md Open Question 3 |
| (재스윕 대상, 미확인) `scripts/kapt-code-lookup.ts`, `scripts/import-management-cost.ts`, `scripts/kapt-facility-enrich.ts` | script | batch | RESEARCH.md Pitfall 4 — PostgREST 1,000행 캡 발생 이력 3건, 부산 규모 확대 시 재발 가능성 높음 |

### C그룹 — 신규 파일 (부산 phase에서 처음 생성)

| New File | Role | Data Flow | Closest Analog |
|----------|------|-----------|-----------------|
| `supabase/migrations/2026XXXXXXXX_regions_busan.sql` | migration | batch (INSERT) | `supabase/migrations/20260430000010_regions.sql` (스키마) + 33-00 Task 1 (INSERT 방식) |
| `src/__tests__/seed-region.test.ts`(수정) | test | integration | 33-00 Task 3 — `count>=22` 방어적 설계, 부산 38개(22+16) 케이스 추가만 |
| `src/__tests__/school-ranking-regional.test.ts`(수정) | test | integration | 33-04 Task 1 — 부산 `p_si='부산광역시'` 케이스 추가 |
| `supabase/migrations/2026XXXXXXXX_find_nearby_similar_complexes.sql` | migration (RPC) | CRUD | RESEARCH.md Code Examples — 신규 RPC, 기존 `location`(PostGIS)/`name_normalized`(pg_trgm) 인덱스 재사용 |
| `scripts/seed-complexes.ts`(수정, dup-check 삽입) | script | batch | `src/lib/data/complex-matching.ts`의 `seedComplex()` 호출 지점(RESEARCH.md Code Examples) |
| `scripts/check-naver-cookie.ts` 또는 `map-naver-complexes-playwright.ts --check-cookie` | script | request-response (smoke test) | RESEARCH.md Code Examples §NAVER_COOKIE 프리플라이트 — 기존 쿠키 주입 로직(304~312행) 재사용 |
| `.github/workflows/*.yml`(self-hosted runner PoC, `workflow_dispatch` 전용) | workflow | event-driven | `.github/workflows/map-naver-complexes-once.yml` 구조 참고, 러너 라벨만 추가 |

---

## Pattern Assignments

### 1. `regions` 테이블 부산 16개 구·군 시딩

**Analog:** `.planning/phases/33-db-1/33-00-PLAN.md` Task 1 + `scripts/seed.ts`(경남 16개 신규 시군구 삽입 실행분)

Phase 33은 `scripts/seed.ts`의 `REGIONS` 배열에 추가했다(SQL 마이그레이션이 아니라 TS 배열 + `npm run db:seed`). RESEARCH.md의 Code Examples는 SQL INSERT 스켈레톤을 제시했지만, **실제 Phase 33 실행은 `scripts/seed.ts` 배열 수정 + `npm run db:seed` 방식**이었다 — 이 phase도 동일한 방식을 따르는 것이 일관성 있다(마이그레이션 파일 신설보다 기존 seed 스크립트 확장이 이미 검증된 경로).

**현재 `scripts/seed.ts` 구조(33-00 완료 후 22행)** — 이 파일 끝에 부산 16개 항목을 그대로 추가:
```typescript
const REGIONS = [
  { sgg_code: '48121', sgg_name: '창원시 의창구', si: '창원시', gu: '의창구' },
  // ...기존 22행(경남 전체)...
  // 부산 16개 추가 (구 있음 — 창원과 동일 패턴, gu 값 채움):
  { sgg_code: '26110', sgg_name: '중구',     si: '부산광역시', gu: '중구' },
  { sgg_code: '26140', sgg_name: '서구',     si: '부산광역시', gu: '서구' },
  // ... (RESEARCH.md Code Examples 16개 목록 그대로, MEDIUM confidence — 단발 검증 필수)
] as const
```

**단발 검증 절차 (33-00 Task 2 그대로 재사용):**
```bash
npx tsx scripts/backfill-realprice.ts \
  --sgg=26110,26140,26170,26200,26230,26260,26290,26320,26350,26380,26410,26440,26470,26500,26530,26710 \
  --from=202606 --to=202606
```
판단 기준도 동일: `ingest_runs.rows_upserted` 실측, 인구 많은 구(해운대·부산진·사하 등)는 >0 기대.

**테스트 갱신 (33-00 Task 3 패턴):**
- `src/__tests__/seed-region.test.ts`의 `count >= 22`는 부산 추가 후에도 안 깨짐(기존 방어적 설계, 33-00-SUMMARY.md에 명시) — 단, `count >= 38`로 하한을 올리고, `BUSAN_EXPANSION_SGG_CODES`(16개) 신규 상수 + "부산 16개 구 gu NOT NULL" 전용 케이스 추가 (경남 확장 케이스가 `gu === null`을 검증한 것과 반대 — 부산은 전부 구가 있음).

---

### 2. 하드코딩 지역 필터 재스윕

**Analog:** RESEARCH.md Runtime State Inventory + Pitfall 1 + 33-09/33-10 plan(2차/3차 리비전에서 발견된 grep 사각지대)

**33에서 실제로 재발했던 grep 사각지대 패턴 (동일 클래스가 부산에도 재발할 것으로 예상):**
```bash
# 1차 sweep — 표준 변수명
grep -rn "ALLOWED_SGG_CODES\|ACTIVE_SGG_CODES\|TARGET_SGG\|VALID_SGG_CODES\|LAWD_CODES\|offiSggCodes" src/ scripts/

# 2차 sweep — 33에서 이것만으로 놓쳤던 패턴 (CHANGWON_GU_MAP, SGG_TO_ADDR)
grep -rn "CHANGWON_GU_MAP\|SGG_TO_ADDR\|GYEONGNAM_SGG\|ADDRESS_KEYWORDS\|NEW_CODES\|OLD_CODES" src/ scripts/

# 3차 sweep — 리터럴 코드값 검색 (신규 변수명은 grep 1/2가 못 잡음)
grep -rn "'481[0-9][0-9]'\|'482[0-9][0-9]'" src/ scripts/   # 경남 코드 (완료됨, 재확인용)
grep -rn "'26[0-9][0-9][0-9]'" src/ scripts/                 # 부산 코드 (신규, 시딩 후 검색)
```

**33 실행 이력이 보여주는 교훈:** 9개 plan으로 시작했으나 plan-checker 2~3차 검증에서 매번 신규 하드코딩이 발견됨(33-09, 33-10이 리비전으로 추가됨). **부산 phase도 최초 plan 목록이 확정이 아니라는 전제로, wave 0/1 완료 후 반드시 재검증 sweep을 한 번 더 수행할 것.**

**Phase 33 종료 후(2026-07-08 이전) 신규로 발견된 하드코딩 — 부산 phase 착수 전 필수 처리 대상:**
- `scripts/collect-school-stats.ts`의 `GYEONGNAM_SGG` 배열(커밋 `11d5952`) — 부산 16개 구·학교급코드(schulKndCodes) 추가 필요
- `scripts/fetch-sports-facilities.ts`의 `ADDRESS_KEYWORDS` 배열(커밋 `11d5952`) — 부산 구명 추가 필요, 이미 PostgREST 페이지네이션은 수정되어 있음(패턴 4 참고)
- `src/app/admin/region-expansion/page.tsx`의 `NEW_CODES`/`OLD_CODES` — RESEARCH.md Open Question 3: 삭제 vs 부산 지원 확장 여부를 사용자에게 확인 필요

---

### 3. 부산 KAPT Golden Record 시딩 + 중복 탐지 로그 (신규 로직)

**Analog:** `.planning/phases/33-db-1/33-06-PLAN.md`(Golden Record 시딩 순서) + `scripts/seed-complexes.ts`(현재 파일, 이미 `regions.is_active=true` 동적 조회) + `src/lib/data/complex-matching.ts`의 `seedComplex()`

**33-06의 핵심 교훈 — 실행 순서:**
1. `npx tsx scripts/seed-complexes.ts` (regions 22→38개로 확장된 후 재실행하면 자동으로 부산도 포함, **코드 변경 불필요** — `getSggCodes()`가 이미 `regions.is_active=true` 동적 조회, 아래 발췌 참고)
2. `npx tsx scripts/kapt-enrich.ts` (si/gu/household_count/built_year 보강, Supabase 1,000행 쿼리 캡 때문에 **여러 번 반복 실행** 필요 — 33-06에서 3회 반복으로 수렴)

**`scripts/seed-complexes.ts`의 기존 동적 조회 (변경 불필요, 그대로 재사용):**
```typescript
// scripts/seed-complexes.ts:32-40
async function getSggCodes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return (data ?? []).map((r: { sgg_code: string }) => r.sgg_code)
}
```

**D-11 신규 로직 — 좌표+이름유사 중복 후보 탐지 (log-only, 병합 없음).** 삽입 위치는 `scripts/seed-complexes.ts`의 `runWithApi()` 루프, `seedComplex()` 호출 직후:
```typescript
// scripts/seed-complexes.ts:60-67 (현재 코드, 이 블록 안에 dup-check 삽입)
for (const c of complexes) {
  try {
    await seedComplex({ ...c, sggCode }, supabase)
    sggUpserted++
    // [NEW] D-11: 좌표+이름유사 중복 후보 탐지 (log-only)
    // await detectPotentialDuplicate(supabase, { lat: c.coordY, lng: c.coordX, ... })
  } catch (err) {
    failures.push({ sgg_code: sggCode, raw_name: c.kaptName, reason: String(err) })
  }
}
```

**신규 RPC 마이그레이션 필요** (RESEARCH.md Code Examples에 전체 SQL 제공됨) — 기존 `complexes.location`(PostGIS geography) + `name_normalized`(pg_trgm GIN 인덱스) 재사용:
```sql
create or replace function find_nearby_similar_complexes(
  p_lat double precision, p_lng double precision, p_name_normalized text,
  p_exclude_kapt_code text, p_radius_m double precision, p_similarity_threshold real
) returns table(id uuid, canonical_name text, kapt_code text, dist_m double precision)
language sql stable as $$
  select c.id, c.canonical_name, c.kapt_code,
         ST_Distance(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as dist_m
  from complexes c
  where c.kapt_code != p_exclude_kapt_code
    and c.location is not null
    and ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and similarity(c.name_normalized, p_name_normalized) > p_similarity_threshold
  order by dist_m;
$$;
```

**`seedComplex()` 자체는 수정 대상이 아니다** (`src/lib/data/complex-matching.ts:32-96`) — `onConflict: kapt_code` upsert이고 lat/lng는 신규 INSERT 시에만 설정(기존 좌표 보호 로직, 33 이전부터 존재). dup-check는 이 함수를 감싸는 caller(`seed-complexes.ts`)에서만 추가.

**kapt.ts의 `server-only` 제거 이력 주의:** `src/services/kapt.ts`는 33-06에서 `import 'server-only'` pre-existing 버그(스크립트 6개+CI 워크플로 차단)를 발견·제거했다(커밋 `7be9031`). 이미 수정 완료된 상태이므로 부산 phase에서는 재발하지 않지만, **유사 패턴의 다른 서비스 파일에서 동일 버그가 있는지 재확인**(`grep -rn "import 'server-only'" src/services/`) — kapt.ts/regions.ts 2건 모두 33에서 발견된 동일 클래스 버그였다.

---

### 4. 부산 좌표 지오코딩 + `complexes-map.ts` BBOX 확장

**Analog:** 커밋 `b59bd01`(complexes-map.ts 경남 전체 확장) — 이 phase의 정확히 동일한 작업을 부산으로 재실행

**현재 `src/lib/data/complexes-map.ts`의 좌표 범위 필터 (33 완료 후 경남 전체 커버):**
```typescript
// src/lib/data/complexes-map.ts (b59bd01 이후 상태)
.gte('lat', 34.7).lte('lat', 35.8)
.gte('lng', 127.7).lte('lng', 129.3)
```

**부산 확장 시 수정 필요 — RESEARCH.md Pitfall 2가 이미 지목:** 부산 기장군·해운대구 동쪽 해안(lng ~129.29~129.32)이 현재 상한 129.3과 거의 맞닿음. **좌표 지오코딩 완료 후** 실측:
```sql
select min(lng), max(lng), min(lat), max(lat) from complexes where si='부산광역시';
```
결과에 맞춰 상한을 여유있게(예: lng 129.4, lat 35.4) 확장. **주의(33-CONTEXT 교훈 계승):** 이 BBOX 수정은 좌표가 실제로 채워지기 전까지는 효과가 없다 — 지오코딩이 반드시 선행되어야 한다.

---

### 5. 부산 국토부 실거래가 10년 백필 `[CHECKPOINT]`

**Analog:** `.planning/phases/33-db-1/33-07-PLAN.md` + `33-07-SUMMARY.md`(실제 실행 결과)

**동일한 workflow_dispatch, sgg_codes만 교체:**
```bash
gh workflow run molit-backfill-once.yml \
  -f sgg_codes=26110,26140,26170,26200,26230,26260,26290,26320,26350,26380,26410,26440,26470,26500,26530,26710
```

**33-07의 실측 규모(참고용, 부산은 이보다 클 것으로 예상 — RESEARCH.md A2):** 16개 신규 시군구 × (molit_trade + molit_villa_trade) × 120개월 = 4,080 combo, 누적 249,574건. 완료까지 여러 날 재트리거 필요(API 일 10,000회 한도). 부산은 도심 밀집지라 combo당 평균 처리량이 경남 농어촌보다 훨씬 클 가능성 높음(RESEARCH.md Summary §5) — **D-04(주기적 용량 체크)를 이 백필 진행 중 각 일자 배치 완료 시마다 수행할 것.**

`checkpoint:human-action` 태스크 타입 그대로 재사용 (33-07과 동일 구조 — 다일 실물 시간 경과가 필요해 세션 내 완결 불가).

---

### 6. 관리비·학군·POI enrichment 파이프라인

**Analog:** 커밋 `11d5952`(collect-school-stats.ts/fetch-sports-facilities.ts 신규 지역 대응 + PostgREST 페이지네이션 수정) — Phase 33은 이 부분에 대한 정식 plan/SUMMARY가 없고 phase 종료 후 ad-hoc 커밋으로 처리됨(`33-CONTEXT.md` addendum 기록, 커밋 `b3a2124`). **부산 phase는 이를 정식 plan(REGION-17)으로 승격시켜야 한다.**

**`scripts/fetch-sports-facilities.ts`의 PostgREST 1,000행 캡 수정 패턴 (이미 적용됨, 다른 enrichment 스크립트에도 동일 패턴 확인 필요):**
```typescript
// scripts/fetch-sports-facilities.ts (11d5952 이후 상태) — 페이지네이션 패턴 템플릿
const PAGE = 1000
const complexes: Complex[] = []
for (let offset = 0; ; offset += PAGE) {
  const { data: complexRows, error: cErr } = await supabase
    .from('complexes')
    .select('id, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .range(offset, offset + PAGE - 1)
  if (cErr) { console.error('단지 로드 실패:', cErr.message); process.exit(1) }
  if (!complexRows || complexRows.length === 0) break
  complexes.push(...(complexRows as Complex[]))
  if (complexRows.length < PAGE) break
}
```
**이 패턴을 `map-naver-complexes-playwright.ts`도 이미 사용 중**(라인 247-261, `while(true)` + `range()` 페이지네이션) — 신규 enrichment 스크립트를 작성/수정할 때 이 두 파일 중 하나를 템플릿으로 복사.

**`scripts/collect-school-stats.ts`의 지역 배열 확장 패턴:**
```typescript
// scripts/collect-school-stats.ts (11d5952 이후 상태)
const GYEONGNAM_SGG: Array<{ name: string; sggCode: string; schulKndCodes: string[] }> = [
  { name: '창원시 의창구', sggCode: '48121', schulKndCodes: ['02','03','04'] },
  // ... 경남 22개 ...
]
```
부산은 이 배열이 `GYEONGNAM_SGG`라는 경남 전용 이름이라 **부산용으로 별도 배열을 만들지, `getActiveRegionAddrs()` 동적 조회로 아예 정적 배열 자체를 제거할지 planner가 결정** — 후자가 A그룹 패턴(regions 동적 조회)과 일관되고 향후 재확장(울산 등) 시 재작업을 막으므로 권장.

**PostgREST 1,000행 캡 재발 예상 지점(RESEARCH.md Pitfall 4) — 부산 규모 확대 후 재확인 필수:**
- `scripts/kapt-code-lookup.ts`, `scripts/import-management-cost.ts`, `scripts/kapt-facility-enrich.ts` (33에서 이미 이 3건이 캡에 걸림)

---

### 7. `school_ranking` RPC "구별 순위" 부산 미대응 — 회귀 테스트만 추가

**Analog:** `.planning/phases/33-db-1/33-04-PLAN.md` Task 1 + `src/__tests__/school-ranking-regional.test.ts`(현재 파일)

RESEARCH.md Pattern 3이 이미 코드 감사로 확정: `school_ranking` RPC의 `gu` 컬럼은 `road_address LIKE '%창원시 OO구%'` 5-CASE 하드코딩이라 부산은 항상 `gu=NULL` 반환(에러 없음, 안전 폴백). **코드 수정 범위 밖 — 33-04와 동일하게 회귀 테스트만 추가.**

**33-04의 기존 통합 테스트 패턴 (그대로 확장):**
```typescript
// src/__tests__/school-ranking-regional.test.ts (33-04에서 생성된 기존 구조)
describe.skipIf(!SKEY)('school_ranking RPC: 무구(無區) 시군구 처리 (integration)', () => {
  it('임의의 si 문자열도 에러 없이 처리된다 (allowlist 없음)', async () => { /* ... */ })
  it('김해시(구 없음) 데이터가 있다면 모든 행의 gu가 null이다', async () => { /* ... */ })
  it('창원시(구 있음) 데이터가 있다면 gu가 5개 구 중 하나이거나 null이다', async () => { /* ... */ })
})
```
**부산 신규 케이스 추가:**
```typescript
it('부산광역시(구 있음이나 RPC 미대응) 데이터가 있다면 모든 행의 gu가 null이다', async () => {
  const { data, error } = await admin.rpc('school_ranking', {
    p_si: '부산광역시', p_school_type: 'elementary', p_metric: 'students_per_class',
  })
  expect(error).toBeNull()
  for (const row of data ?? []) expect(row.gu).toBeNull()  // 부산은 gu 추출 패턴 미지원 — 항상 NULL
})
```
**주의 (33-04 Deviations에서 발견된 사전 존재 데이터 이슈):** 김해시 테스트가 실제로는 "모든 행 gu=null"이 아니라 소수 오염된 행(facility_school↔complexes 매칭 버그)이 있었음 — 부산도 유사한 사전 존재 데이터 오염 가능성을 배제하지 말고, 프로덕션 데이터로 실행 검증 시 예외가 나오면 33-04와 동일하게 "null이 발생 + non-null이면 알려진 값 집합 중 하나"로 완화할 것.

---

### 8. `NAVER_COOKIE` 프리플라이트 검증 (D-09, 신규 — Phase 33에는 없던 태스크)

**Analog:** RESEARCH.md Code Examples §NAVER_COOKIE 프리플라이트 + `scripts/map-naver-complexes-playwright.ts`의 기존 쿠키 주입 로직(304-312행)

**기존 쿠키 주입 코드 (변경 없이 재사용):**
```typescript
// scripts/map-naver-complexes-playwright.ts:304-312
const naverCookie = process.env.NAVER_COOKIE ?? ''
if (naverCookie) {
  const cookies = naverCookie.split(';').map(c => c.trim()).filter(Boolean).map(c => {
    const [name, ...rest] = c.split('=')
    return { name: name.trim(), value: rest.join('=').trim(), domain: '.naver.com', path: '/' }
  })
  await context.addCookies(cookies)
  console.log(`쿠키 주입: ${cookies.map(c => c.name).join(', ')}`)
}
```
값은 절대 로그에 출력되지 않음(쿠키 이름만 로그) — 이 보안 관행을 신규 `--check-cookie` 플래그에도 유지할 것.

**신규 스모크런 함수 (RESEARCH.md 제공, 신규 삽입 대상):**
```typescript
const SMOKE_TEST_BBOX = { name: '창원북부', lat: 35.26, lng: 128.66 }
async function checkCookieValidity(page: Page): Promise<boolean> {
  const url = `https://new.land.naver.com/complexes?ms=${SMOKE_TEST_BBOX.lat},${SMOKE_TEST_BBOX.lng},14&a=APT&b=A1`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null)
  await page.waitForTimeout(3000)
  if (page.url().includes('nid.naver.com')) return false
  const markerCount = await page.locator('[class*="marker"], [class*="Marker"]').count().catch(() => 0)
  return markerCount > 0
}
```
실행 흐름 재사용: `main()` 함수의 브라우저/context/page 셋업(라인 282-322) 이후, 기존 매핑 루프 진입 전에 `--check-cookie` 플래그 분기로 삽입.

---

### 9. 네이버 매핑 크롤러 — 부산 BBOX 신규 튜닝 + `--diagnose` + `--new-only`

**Analog:** `scripts/map-naver-complexes-playwright.ts`(현재 파일, 이미 `BBOXES`/`--diagnose`/`--new-only`/`flushMatches()` 전부 구현됨) + RESEARCH.md "네이버 매핑 크롤러 BBOX 확정 절차"

**현재 `BBOXES` 배열 구조 (경남 21개 zone, 이 배열 끝에 부산 항목만 추가):**
```typescript
// scripts/map-naver-complexes-playwright.ts:48-70 (현재 상태)
const BBOXES = [
  { name: '창원북부', latMin: 35.22, latMax: 35.30, lngMin: 128.60, lngMax: 128.72 },
  // ... 경남 21개 zone ...
  { name: '합천', latMin: 35.55, latMax: 35.59, lngMin: 128.14, lngMax: 128.18 },
  // [NEW] 부산 — 좌표 지오코딩 완료 후 구별 실측 min/max + padding으로 산출
  // { name: '해운대', latMin: ..., latMax: ..., lngMin: ..., lngMax: ... },
  // ... (구별 또는 인접 구 묶음)
]
```

**⚠ 중요 발견 (코드 직접 읽기, RESEARCH.md에 없던 신규 이슈) — `OLD_ZONE_NAMES`가 최신화 안 됨:**
```typescript
// scripts/map-naver-complexes-playwright.ts:32
const OLD_ZONE_NAMES = new Set(['창원북부', '마산', '진해', '창원남부', '김해'])
```
이 Set은 **창원·김해 6개 코드 시절(Phase 05)의 5개 zone만** 담고 있고, Phase 33에서 추가된 진주·통영 등 16개 신규 zone은 포함되지 않았다. 현재 `--new-only`를 실행하면 이 16개 zone도 "새 지역"으로 취급되어 재탐색된다(창원/김해만 제외됨). **부산 phase에서 `--new-only`로 부산만 탐색하려면, `OLD_ZONE_NAMES`를 현재 `BBOXES`의 부산 이전 21개 zone 이름 전부로 갱신해야 한다** — 그렇지 않으면 경남 21개 zone까지 매번 재탐색하여 시간이 크게 낭비됨. 이는 Phase 33에는 없던 문제(당시엔 `OLD_ZONE_NAMES`가 정확히 "이전 phase 대상"이었음)이므로, RESEARCH.md의 D-05/D-08 태스크 계획 시 명시적으로 이 갱신을 포함할 것.

**`--diagnose` 실행 (D-08, 변경 없이 그대로 재사용):**
```bash
npx tsx scripts/map-naver-complexes-playwright.ts --dry-run --new-only --diagnose
```
결과는 `naver-mapping-diagnosis.json`에 저장(이름불일치/지오코딩오차의심/커버리지밖 버킷 분류, DB 변경 없음) — 매핑 실행 전 문제 규모 파악.

**실제 매핑 실행 (D-05, restart-loop 폴백 대비 — 33 경험상 로컬 프로세스 불안정):**
```bash
npx tsx scripts/map-naver-complexes-playwright.ts --new-only
```
`flushMatches()`가 존 경계 또는 5개 중심점마다 즉시 DB 반영하므로(라인 384-418), 프로세스가 죽어도 유실 최소화됨 — 이 안전장치는 이미 완성되어 있어 부산에 그대로 적용 가능.

---

### 10. Supabase DB 용량 실측 + Pro 플랜 결정 `[CHECKPOINT]`

**Analog:** `.planning/phases/33-db-1/33-08-PLAN.md`(그대로 재사용, sgg_code 리스트만 부산으로 교체)

**동일한 3개 SQL 그대로 재사용:**
```sql
select pg_size_pretty(pg_database_size(current_database())) as total_db_size;

select relname, pg_size_pretty(pg_total_relation_size(relid)) as total_size,
       pg_size_pretty(pg_relation_size(relid)) as table_only_size,
       pg_size_pretty(pg_indexes_size(relid)) as index_size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc limit 10;

select sgg_code, count(*) as tx_count from transactions group by sgg_code order by tx_count desc;
```
**임계값도 동일:** <400MB 여유 / 400~500MB 검토 필요 / >500MB 필수 전환. **단, D-04에 따라 이번 phase는 이 체크를 "백필 완료 후 1회"가 아니라 "각 일자 백필 배치 완료마다" 반복 실행해야 한다** — 33-08은 phase 끝에 1회만 실행했으나, 부산은 현재 84% 사용 중(420MB)이라 여유가 80MB뿐이므로 더 촘촘한 빈도가 필수(RESEARCH.md Summary §5).

`checkpoint:decision` 태스크 타입 그대로 재사용 — 옵션(`stay-free`/`upgrade-pro`), resume-signal 구조 동일.

---

## Shared Patterns

### regions 동적 조회 3종 공용 헬퍼 (변경 없이 그대로 재사용)
**Source:** `src/lib/data/regions.ts` (전체 62행, 이미 완성됨 — Phase 34는 이 파일을 import만 함, 수정 없음)
```typescript
export async function getActiveSggCodes(supabase: SupabaseClient<Database>): Promise<string[]>
export async function getActiveCityNames(supabase: SupabaseClient<Database>): Promise<string[]>
export async function getActiveRegionAddrs(supabase: SupabaseClient<Database>): Promise<RegionAddr[]>
```
**Apply to:** A그룹의 모든 파일(이미 이 함수들을 호출 중 — 코드 변경 불필요, regions 테이블에 부산이 추가되는 순간 자동 확장).

### PostgREST 1,000행 캡 페이지네이션 템플릿
**Source:** `scripts/fetch-sports-facilities.ts`(커밋 `11d5952`) 또는 `scripts/map-naver-complexes-playwright.ts:247-261`(`while(true)` + `.range()` 패턴)
**Apply to:** 모든 신규/수정 enrichment 스크립트가 `complexes` 전체를 조회하는 지점 — 부산 추가로 총 행 수가 1,000 경계를 넘는 스크립트에서 재발 예상(RESEARCH.md Pitfall 4).

### server-only 가드는 scripts/에서 tsx로 직접 import되는 `src/lib/data/*.ts`·`src/services/*.ts`에는 적용 불가
**Source:** `src/services/kapt.ts`(33-06, 커밋 `7be9031`), `src/lib/data/regions.ts`(33-10, 동일 패턴 — 현재 파일 최상단 주석에 사유 명시)
**Apply to:** 부산 phase에서 scripts/가 새로 import하게 되는 모든 `src/lib/data/*`·`src/services/*` 파일 — import 시도 시 "This module cannot be imported from a Client Component module" 에러가 나면 이 두 선례와 동일한 원인(Node/tsx의 `exports` 조건 불일치)으로 즉시 진단할 것.

### UI 라벨(SGG_LABEL/SGG_OPTIONS/REGION_OPTIONS) 정적 맵 — 부산도 "기계적 데이터 추가"로 처리
**Source:** `.planning/phases/33-db-1/33-05-PLAN.md`/`33-05-SUMMARY.md`(7개 파일, 라벨만 추가 — UI 구조 변경 없음)
**Apply to:** 동일 7개 파일(`PredictionSection.tsx`, `prediction-commentary/route.ts`, `EnrichedPresaleCard.tsx`, `api/admin/cardnews/data/route.ts`, `AdCreateForm.tsx`, `AdEditForm.tsx`, `BuilderOptionsPanel.tsx`) — 부산 16개 구 라벨을 기존 마지막 항목 뒤에 그대로 추가. `prediction-commentary/route.ts`의 `ALLOWED_SGG` 입력 검증 allowlist는 33과 동일하게 범위 밖(라벨만 추가, 보안 allowlist는 별도 결정 필요).

### 워크플로/스크립트 실행 커맨드는 코드 변경 없이 파라미터만 교체
**Source:** `.github/workflows/molit-backfill-once.yml`(33-07), `.github/workflows/map-naver-complexes-once.yml`(구조만 참고, 부산은 IP 차단으로 로컬 실행)
**Apply to:** 국토부 백필(REGION-16), 자체 검증(REGION-12 Task 2) — `workflow_dispatch -f sgg_codes=<부산 16개>`만 바꿔서 트리거.

---

## No Analog Found (신규 조사·설계 필요)

| File/Task | Role | Data Flow | Reason |
|-----------|------|-----------|--------|
| GitHub Actions self-hosted runner PoC(D-06) | workflow (infra) | event-driven | Phase 33에는 이 개념 자체가 없었음(로컬 restart-loop만 사용) — RESEARCH.md의 보안 완화책(`workflow_dispatch` 전용 라벨링, `--ephemeral`, fork PR 승인 설정)을 참고해 신규 설계 필요. `.github/workflows/map-naver-complexes-once.yml`의 구조(트리거 조건)만 참고 가능 |
| 부산 미분양(regional_unsold) 신규 어댑터(`apis.data.go.kr/6260000/UnSellStusService`) | service (external adapter) | request-response | `src/services/molit-unsold.ts`는 경남 전용 API(`6480000/gyeongnamunsold`) 어댑터라 부산에 재사용 불가 — RESEARCH.md Open Question 1, 범위 포함 여부 자체가 미결정. 포함 시 `src/services/molit-unsold.ts`의 구조(fetch + resolveSggCode 패턴)를 analog로 신규 어댑터 작성 |
| `find_nearby_similar_complexes` RPC 마이그레이션 파일 | migration | CRUD | 완전 신규 함수 — RESEARCH.md Code Examples에 전체 SQL 제공됨(위 패턴 3 참고), 기존 마이그레이션 파일 형식(`supabase/migrations/*.sql`)만 형식적 analog |

---

## Metadata

**Analog search scope:** `.planning/phases/33-db-1/` 전체(CONTEXT/RESEARCH/10개 PLAN·SUMMARY), 관련 git 커밋(`b3a2124`, `11d5952`, `b59bd01`), 현재 코드베이스(`scripts/map-naver-complexes-playwright.ts`, `scripts/seed-complexes.ts`, `src/lib/data/regions.ts`, `src/lib/data/complex-matching.ts`, `src/app/admin/region-expansion/page.tsx`)
**Files scanned:** Phase 33 문서 24개 + 커밋 3개 diff + 현재 소스 파일 4개 전체 읽기
**Pattern extraction date:** 2026-07-08
