# API · Cron · Worker 심층 감사 보고서

**감사일**: 2026-06-18  
**감사 대상**: `src/app/api/` 전체 + `.github/workflows/` 전체  
**심각도 기호**: 🔴 HIGH · 🟠 MEDIUM · 🟡 LOW · ✅ PASS

---

## 요약 스코어카드

| 영역 | 상태 | 주요 이슈 |
|---|---|---|
| CRON_SECRET 검증 | 🟠 | 헤더 불일치 (일부 워크플로우) |
| Admin 가드 | ✅ | 2단계 검증 일관 |
| 입력 검증 | 🟠 | campaign_id UUID 미검증, gps-approve ID 미검증 |
| fetch 타임아웃 | ✅ | 서비스 레이어 전체 적용 (chat 8s 제외 주의) |
| 트랜잭션 안전성 | 🟠 | gps-approve 두 쿼리 비원자적 |
| cron 멱등성 | 🟡 | cron/daily K-apt LIMIT 50 비결정적 |
| rate limiting | ✅ | ads/events만 적용 (cron 엔드포인트는 적절히 제외) |
| 에러 누출 | 🟡 | map-panel 내부 메시지 그대로 노출 |
| 응답 크기 | 🟡 | cron/daily errors[] 무제한 |
| GitHub Actions | 🟠 | 헤더 불일치, molit-daily 중복 실행 위험 |

---

## 1. 인증/인가

### 1-A. CRON_SECRET 헤더 불일치 (🟠 MEDIUM)

`verifyCronSecret` 함수는 `Authorization: Bearer <secret>` 또는 `x-cron-secret: <secret>` 두 형식을 모두 수락한다.

| 워크플로우 | 엔드포인트 | 사용 헤더 |
|---|---|---|
| `notify-worker.yml` | `/api/worker/notify` (POST) | `x-cron-secret` |
| `cafe-ingest.yml` | `/api/worker/cafe-ingest` (POST) | `x-cron-secret` |
| `rankings-cron.yml` | `/api/cron/rankings` (GET) | `Authorization: Bearer` |
| `cafe-code-weekly.yml` | `/api/worker/cafe-code` (POST) | `Authorization: Bearer` |
| `weekly-digest.yml` | `/api/worker/digest` (POST) | `Authorization: Bearer` |

두 형식이 모두 동작하므로 보안상 문제는 없지만, 헤더를 통일하지 않으면 시크릿 로테이션 시 누락 위험이 있다. 권장: 전체 `x-cron-secret` 통일 또는 `Authorization: Bearer` 통일.

### 1-B. `/api/cron/daily` 워크플로우 없음 (🟡 LOW)

`vercel.json`에 `/api/cron/daily`가 Vercel Cron(19:00 UTC)으로 등록되어 있으나, 별도 GitHub Actions 워크플로우는 없다. Vercel Hobby 플랜의 1일 1회 cron 제한에 의존하는 구조가 맞다면 문제없음. 그러나 `notify-worker.yml`(매 5분)과 `molit-daily.yml`(별도 스크립트)이 GitHub Actions를 쓰는 것과 일관성이 없다. 문서화 권장.

### 1-C. Admin 가드 패턴 (✅ PASS)

`/api/admin/*` 전체에서 `auth.getUser()` → `profiles.role` 두 단계 검증을 일관되게 적용한다. session cookie 위변조 시에도 DB role 확인이 방어선 역할을 한다.

### 1-D. `/api/invest/prediction-commentary` 미인증 (🟡 LOW)

ISR(`revalidate=604800`)로 캐시되는 엔드포인트이지만, 인증 없이 누구나 직접 쿼리하면 Anthropic API를 소모할 수 있다. `allowlist` 검증은 있으나 인증은 없다. 캐시 히트가 많은 환경에서는 실질 위험이 낮지만, 캐시 무효화 직후 대량 호출 시 Claude Haiku API 비용이 발생한다.

**권장**: `Cache-Control: s-maxage=604800, stale-while-revalidate` 헤더 추가 또는 ISR `revalidate` 유지 시 별도 rate limit.

---

## 2. 에러 처리

### 2-A. `worker/notify/route.ts` — `throw err` 미처리 (🟠 MEDIUM)

```ts
// 현재 코드
} catch (err) {
  await markCronFailed(supabase, 'notify-worker')
  throw err   // ← Next.js가 500을 반환하지만 응답 바디는 빈 텍스트
}
```

`throw err`는 Next.js App Router에서 JSON이 아닌 빈 500 응답을 돌려준다. GitHub Actions 워크플로우는 HTTP 200만 체크하므로 에러 내용이 로그에 남지 않고 실패로만 처리된다. 다른 worker들(`digest`, `cafe-ingest`)은 `catch` 안에서 `NextResponse.json({ error: message })` 패턴을 사용하는데 일관성이 없다.

**권장**:
```ts
} catch (err) {
  await markCronFailed(supabase, 'notify-worker')
  const message = err instanceof Error ? err.message : String(err)
  console.error('notify worker error:', message)
  return NextResponse.json({ error: message }, { status: 500 })
}
```

### 2-B. `map-panel/route.ts` — 내부 에러 메시지 노출 (🟡 LOW)

```ts
const message = err instanceof Error ? err.message : 'unknown error'
return NextResponse.json({ error: message }, { status: 500 })
```

Supabase 에러나 DB 스키마 정보가 `message`에 포함될 경우 클라이언트에 그대로 노출된다. `price-history/route.ts`는 에러를 클라이언트에 반환하지 않아 올바른 패턴이다.

**권장**: `{ error: 'internal error' }` 고정 문자열 반환, 실제 메시지는 `console.error`로만 기록.

### 2-C. `admin/ad-copy-review/route.ts` — 200으로 에러 반환 (🟡 LOW)

```ts
// D-10 주석으로 의도된 설계
return NextResponse.json({ violations: [], suggestions: [], error: true }, { status: 200 })
```

Gemini API 실패 시 200으로 반환하는 것이 설계 의도(등록 차단 방지)라고 주석에 명시되어 있다. 그러나 클라이언트가 `error: true` 플래그를 파싱하지 않으면 빈 검증 결과를 성공으로 오해한다. 설계 의도는 이해하나 클라이언트 측에서 `error` 필드 체크를 강제하도록 문서화가 필요하다.

---

## 3. 입력 검증

### 3-A. `ads/events/route.ts` — `campaign_id` UUID 미검증 (🟠 MEDIUM)

```ts
// 현재: 존재 여부와 문자열 타입만 확인
if (!b || typeof b.campaign_id !== 'string' || !b.campaign_id) {
  return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
}
```

`campaign_id`가 UUID 형식인지 검증하지 않는다. 임의 문자열로 `ad_events` 테이블에 INSERT가 가능하다. RLS가 없다면 존재하지 않는 `campaign_id`로 FK 위반이 발생하거나(에러 무시됨), 존재하는 campaign_id를 추측하여 노이즈 데이터를 삽입할 수 있다.

**권장**:
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!UUID_RE.test(b.campaign_id as string)) {
  return NextResponse.json({ error: 'invalid campaign_id' }, { status: 400 })
}
```

### 3-B. `admin/gps-approve/route.ts` — requestId·userId UUID 미검증 (🟠 MEDIUM)

```ts
requestId = formData.get('requestId') as string
userId    = formData.get('userId') as string
// ...
if (!requestId || !userId || !['approve', 'reject'].includes(action)) {
```

존재 여부만 확인하고 UUID 형식 검증이 없다. `requestId`와 `userId`는 DB Primary Key로 사용되므로, 악의적 입력으로 예상치 못한 쿼리 동작이 발생할 수 있다.

**권장**: UUID_RE 패턴으로 양쪽 모두 검증.

### 3-C. `chat/complex/route.ts` — messages 배열 내용 검증 부재 (🟡 LOW)

```ts
const messages = Array.isArray(b.messages)
  ? (b.messages as Array<{ role: string; content: string }>).slice(0, 20)
  : null
```

각 메시지의 `role`이 `'user'|'assistant'`인지, `content`가 문자열인지 검증하지 않는다. 악의적 객체가 배열에 포함되면 런타임 오류 가능성이 있다. `lastUserMsg.slice(0, 2000)` 길이 제한은 있어 프롬프트 인젝션은 부분적으로 방어된다.

**권장**: 각 메시지 객체의 타입 가드 추가.

### 3-D. `cron/daily/route.ts` — 외부 API 응답 무검증 (🟡 LOW)

서비스 레이어(`fetchPresaleTrades`, `fetchCheongyakList` 등)가 외부 API 응답을 Zod 또는 타입 단언으로 처리하는지 확인 필요. cron 라우트 자체는 서비스를 신뢰하는 구조이므로 서비스 레이어 검증에 의존한다.

---

## 4. 타임아웃

### 4-A. 서비스 레이어 타임아웃 현황 (✅ PASS)

`src/services/` 내 모든 외부 fetch 호출이 `AbortSignal.timeout()` 적용:

| 서비스 | 타임아웃 |
|---|---|
| molit.ts, molit-presale.ts | 15s |
| kapt.ts | 10s |
| cheongyak/client.ts | 10~15s |
| naver-cafe.ts | 10s |
| lh/client.ts | 10~15s |
| localdata-sports.ts | 30s |
| sgis.ts | 10s |

### 4-B. `chat/complex/route.ts` Gemini 스트리밍 타임아웃 없음 (🟡 LOW)

Voyage AI embed 호출에는 `AbortSignal.timeout(8_000)`이 있으나, Gemini `sendMessageStream` 자체에는 타임아웃이 없다. 스트리밍 응답이 지연되면 함수가 무기한 대기할 수 있다. Vercel 함수 기본 타임아웃(10s Hobby / 60s Pro)에 의존한다.

### 4-C. `ecos.ts`, `reb.ts` 타임아웃 없음 (🟡 LOW)

`src/services/ecos.ts`(L49)와 `src/services/reb.ts`(L30) fetch 호출에 `AbortSignal.timeout`이 없다. Next.js `{ next: { revalidate } }` 옵션만 있으며, 응답 지연 시 무기한 대기한다.

---

## 5. 트랜잭션 안전성

### 5-A. `admin/gps-approve/route.ts` — 두 쿼리 비원자적 (🟠 MEDIUM)

```ts
// 쿼리 1: gps_verification_requests 상태 업데이트
const { error: updateErr } = await adminClient
  .from('gps_verification_requests')
  .update({ status: newStatus, reviewed_by: user.id, reviewed_at: ... })
  .eq('id', requestId)

// 쿼리 2 (승인 시): profiles.gps_badge_level = 3
const { error: profileErr } = await adminClient
  .from('profiles')
  .update({ gps_badge_level: 3 })
  .eq('id', userId)
```

쿼리 1 성공 후 쿼리 2가 실패하면, 요청은 'approved'로 기록되지만 배지가 부여되지 않는다. 반대로 쿼리 1 전 네트워크 단절로 쿼리 2만 실행되면 배지가 미승인 상태에서 부여될 수 있다.

**권장**: Supabase RPC로 두 업데이트를 단일 트랜잭션으로 처리하는 PostgreSQL 함수 작성.

### 5-B. `cron/daily/route.ts` — presale 중간 실패 시 부분 적재 (🟡 LOW)

`for (const lawdCd of LAWD_CODES)` 루프에서 한 지역이 실패해도 다른 지역은 계속 진행된다. 이는 의도된 동작으로 `errors[]` 배열에 기록되나, 부분 성공(`ok: false`가 아닌 `ok: errors.length === 0`)으로 반환되어 운영자가 성공으로 오해할 수 있다. 현재 구조는 합리적이나 모니터링 주의가 필요하다.

---

## 6. Cron 멱등성

### 6-A. `cron/daily/route.ts` — K-apt LIMIT 50 비결정적 (🟡 LOW)

```ts
const { data: complexesWithKaptCode } = await supabase
  .from('complexes')
  .select('id, kapt_code')
  .not('kapt_code', 'is', null)
  .limit(50)
```

ORDER BY 없이 LIMIT을 사용한다. DB 내부 정렬 순서가 변경되면 매일 다른 50개 단지가 선택된다. 갱신이 되지 않는 단지가 생길 수 있다.

**권장**: `.order('id')` 또는 `.order('updated_at', { ascending: true })` 추가.

### 6-B. `worker/cafe-code/route.ts` — 멱등성 완벽 구현 (✅ PASS)

```ts
const { data: existing } = await supabase
  .from('cafe_join_codes')
  .select('code')
  .eq('week_start', weekStart)
  .single()

if (existing) {
  return NextResponse.json({ code: existing.code, skipped: true })
}
```

동일 주에 두 번 실행해도 기존 코드를 반환한다. 우수한 멱등성 구현.

### 6-C. `cron/rankings/route.ts` — ingest_runs 중복 방지 없음 (🟡 LOW)

시작 시 `ingest_runs`에 'running' row를 INSERT하지만, 이미 'running' 상태의 row가 있을 때 새 실행을 차단하는 로직이 없다. GitHub Actions `rankings-cron.yml`이 매 시간 실행되므로 두 실행이 동시에 진행될 수 있다. `computeRankings`가 upsert 패턴이라면 데이터 일관성은 유지되나, 불필요한 중복 연산이 발생한다.

**참고**: `molit-trade/route.ts`는 30분 경과 stuck running row를 정리하는 로직이 있어 비교적 안전한 패턴.

---

## 7. Rate Limiting

### 7-A. `ads/events/route.ts` — Upstash Redis rate limit (✅ PASS)

- 슬라이딩 윈도우 100req/1m (IP당)
- 클릭 이벤트 10req/24h anomaly 감지
- `Retry-After` 헤더 반환
- IP 해시(SHA-256 + salt) PII 비저장

### 7-B. 공개 API 엔드포인트 rate limit 없음 (🟡 LOW)

`/api/complexes/[id]/price-history`, `/api/complexes/[id]/map-panel`, `/api/ads/sidebar` 등 공개 GET 엔드포인트에 rate limit이 없다. Vercel Edge Network 수준의 보호에만 의존한다.

- `price-history`: `Cache-Control: s-maxage=3600` 캐시가 대부분의 중복 요청을 흡수
- `map-panel`: 캐시 헤더 없음 — 단일 단지에 대한 DDoS 시 DB에 직접 부하 발생 가능

**권장**: map-panel에도 `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` 추가.

### 7-C. `chat/complex/route.ts` — 사용자별 rate limit 없음 (🟠 MEDIUM)

인증(로그인)이 필요하지만 로그인 사용자가 Voyage AI + Gemini API를 무제한 호출할 수 있다. 특히 스트리밍 API는 세션당 비용이 높다.

**권장**: Upstash를 사용해 `userId` 기준 분당/일당 한도 적용.

---

## 8. 응답 크기

### 8-A. `cron/daily/route.ts` — errors[] 배열 무제한 (🟡 LOW)

```ts
const errors: string[] = []
// ...
return Response.json({ ok, totalUpserted, kaptUpserted, ..., errors })
```

50개 K-apt + N개 지역 presale + 청약홈 + 오피스텔 루프에서 에러가 많이 발생하면 `errors[]`가 수백 개가 될 수 있다. GitHub Actions는 응답을 `cat /tmp/...` 로 출력하므로 로그가 과도하게 커진다. 그러나 `api/cron/daily`는 GitHub Actions가 아닌 Vercel Cron으로 실행되므로 직접 영향은 없다.

**권장**: `errors.slice(0, 50)` 등 제한 적용 + 총 에러 수 `errorCount` 필드 추가.

### 8-B. `cron/daily/route.ts` 응답에 민감 정보 없음 (✅ PASS)

에러 메시지가 포함되지만 DB 연결 정보, API 키는 포함되지 않는다.

---

## 9. GitHub Actions 워크플로우

### 9-A. actions 버전 혼재 (🟡 LOW)

| 워크플로우 | actions/checkout | actions/setup-node |
|---|---|---|
| `ci.yml` | v5 | v5 |
| `molit-daily.yml` | v4 | v4 |
| `monthly-ai-commentary.yml` | v4 | v4 |
| `sgis-stats.yml` | v5 | v5 |
| `fetch-regional-unsold.yml` | v5 | v5 |

일부는 v4, 일부는 v5가 혼재한다. 보안 패치 적용을 위해 v5로 통일 권장.

### 9-B. `molit-daily.yml`과 `vercel.json` 중복 실행 위험 (🟠 MEDIUM)

`vercel.json`의 `/api/cron/daily`는 Vercel Cron(19:00 UTC)으로 실행된다.  
`molit-daily.yml`은 GitHub Actions가 스크립트(`scripts/backfill-realprice.ts`)를 직접 실행(19:00 UTC 동일 시각).

두 작업이 같은 시각 실행되면 동일 `sgg_code` + `yearMonth` 조합의 UPSERT가 동시에 발생할 수 있다. `ingest_runs`에 `status='running'` 체크가 있으나, 스크립트 직접 실행은 `ingest_runs`를 Vercel cron과 독립적으로 관리하므로 충돌 감지가 어렵다.

**확인 필요**: 두 워크플로우가 실제로 같은 테이블(`transactions`)에 동시에 UPSERT하는지. UPSERT는 멱등적이나 과부하 방지를 위해 스케줄 간격 조정 권장.

### 9-C. `crawl-presale-news.yml` 타임아웃 없음 (🟡 LOW)

```yaml
jobs:
  crawl:
    runs-on: ubuntu-latest
    timeout-minutes: 10
```

`timeout-minutes: 10`은 있으나 스크립트가 외부 크롤링(Playwright 없이 fetch)을 수행하므로 적절하다. 다만 내부 스크립트 레벨 타임아웃이 없어 단일 fetch 행이 10분을 점유할 수 있다.

### 9-D. `molit-backfill-once.yml` — sgg_codes 입력 주입 위험 (🟡 LOW)

```yaml
run: |
  npx tsx scripts/backfill-realprice.ts \
    --resume \
    --sgg=${{ inputs.sgg_codes }}
```

`inputs.sgg_codes`가 셸에 직접 보간되므로, GitHub Actions UI에서 `;rm -rf /` 같은 입력을 넣으면 셸 인젝션이 가능하다. `workflow_dispatch`는 관리자만 실행 가능하므로 실질 위험은 낮으나, 입력값을 따옴표로 감싸는 것이 좋다.

**권장**: `--sgg="${{ inputs.sgg_codes }}"` (따옴표 추가).

### 9-E. `db-backup.yml` — dump 크기 하한이 너무 낮음 (🟡 LOW)

```bash
if [ "$DUMP_SIZE" -lt 1000 ]; then
  echo "ERROR: dump file suspiciously small" >&2
  exit 1
fi
```

1KB(1000 bytes) 하한은 실제 빈 dump를 잡기엔 충분하나, 불완전한 dump(예: 100KB가 정상인데 5KB만 됨)를 감지하지 못한다. 운영 DB 크기를 알면 더 높은 하한을 설정하거나, 이전 백업과 크기 비교 로직 추가 권장.

### 9-F. `compute-predictions-ai.yml` — pip install이 매번 실행 (🟡 LOW)

```yaml
- name: PyTorch (CPU) + Chronos 설치
  run: |
    pip install --upgrade pip
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install "chronos-forecasting>=2.0" requests numpy
```

`pip install torch`가 캐시 없이 매일 수백 MB를 다운로드한다. `actions/cache@v4`로 `pip` 패키지를 캐시하거나 `cache-dependency-path: scripts/requirements-ai.txt`에 `torch` 버전을 고정하는 것이 권장된다.

---

## 10. 기타 개별 항목

### 10-A. `admin/realtors/upload-image/route.ts` — 파일명 예측 가능 (🟡 LOW)

```ts
const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
```

`Date.now()`(밀리초 타임스탬프) + 6자 랜덤은 예측 가능성이 낮지만, Storage가 public URL을 사용한다면 URL 추측 공격에 취약하다. `crypto.randomUUID()`나 `randomBytes(16).toString('hex')` 사용 권장.

### 10-B. `ads/events/route.ts` — IP 추출 신뢰 (🟡 LOW)

```ts
const forwarded = request.headers.get('x-forwarded-for')
const ip = forwarded?.split(',')[0]?.trim() ?? '127.0.0.1'
```

Vercel 환경에서 `x-forwarded-for`는 신뢰할 수 있으나, 자체 호스팅 시 클라이언트가 헤더를 위조할 수 있다. Vercel 배포에서만 사용되므로 현재는 안전하다.

### 10-C. `health/route.ts` — 프로덕션 DB 정보 미노출 (✅ PASS)

```ts
if (process.env.NODE_ENV === 'production') {
  return NextResponse.json({ status: 'ok' })
}
```

프로덕션에서 DB 연결 정보를 노출하지 않는다. 올바른 패턴.

### 10-D. `invest/prediction-commentary/route.ts` — 사후 가격 검증 (✅ PASS)

```ts
const PRICE_PATTERN = /\d[\d,]*\s*(만원|억원|원|만|억|\$)/
if (PRICE_PATTERN.test(raw) || UNIT_PATTERN.test(raw)) {
  return Response.json({ commentary: null })
}
```

AI 응답에 가격 숫자가 포함되면 응답을 폐기한다. 법적 준수 측면에서 우수한 가드.

### 10-E. `chat/complex/route.ts` — `contextData` 8000자 제한 (✅ PASS)

```ts
const contextData = typeof b.contextData === 'string' ? b.contextData.slice(0, 8000) : null
```

클라이언트가 과도한 컨텍스트를 전송해도 자동 절사된다.

---

## 우선순위 수정 목록

| 우선순위 | 항목 | 파일 | 작업 |
|---|---|---|---|
| P1 🔴 | `worker/notify` throw err → JSON 반환 | `src/app/api/worker/notify/route.ts` | catch절 개선 |
| P1 🔴 | `gps-approve` 두 쿼리 원자화 | `src/app/api/admin/gps-approve/route.ts` | RPC 트랜잭션 |
| P2 🟠 | `ads/events` campaign_id UUID 검증 | `src/app/api/ads/events/route.ts` | UUID_RE 추가 |
| P2 🟠 | `gps-approve` requestId·userId UUID 검증 | `src/app/api/admin/gps-approve/route.ts` | UUID_RE 추가 |
| P2 🟠 | `chat/complex` 사용자별 rate limit | `src/app/api/chat/complex/route.ts` | Upstash 적용 |
| P2 🟠 | `molit-daily.yml` vs Vercel Cron 중복 확인 | `vercel.json`, `molit-daily.yml` | 스케줄 조율 |
| P3 🟡 | `map-panel` 에러 메시지 노출 | `src/app/api/complexes/[id]/map-panel/route.ts` | 고정 문자열 반환 |
| P3 🟡 | K-apt LIMIT 50 ORDER BY 누락 | `src/app/api/cron/daily/route.ts` | `.order('id')` 추가 |
| P3 🟡 | `map-panel` Cache-Control 없음 | `src/app/api/complexes/[id]/map-panel/route.ts` | 캐시 헤더 추가 |
| P3 🟡 | GitHub Actions 버전 v4 → v5 통일 | `.github/workflows/*.yml` | 일괄 업데이트 |
| P3 🟡 | `molit-backfill-once.yml` 셸 인젝션 | `.github/workflows/molit-backfill-once.yml` | 따옴표 추가 |
| P4 ℹ️ | `ecos.ts`, `reb.ts` 타임아웃 없음 | `src/services/ecos.ts`, `reb.ts` | AbortSignal 추가 |
| P4 ℹ️ | cron 헤더 형식 통일 | `.github/workflows/*.yml` | x-cron-secret 통일 |
| P4 ℹ️ | `upload-image` 파일명 crypto.randomUUID | `src/app/api/admin/realtors/upload-image/route.ts` | UUID 파일명 |

---

*감사자: Claude Sonnet 4.6 (자동 생성) — 2026-06-18*
