/**
 * persist-contents.js — 카드뉴스 슬라이드 → `public.contents` 적재 (Phase 40-03, 선행조건 0-4)
 *
 * 창부레터 뷰어(`changbuletter/design/cbl-article.jsx:41-66`)가 읽는 계약:
 *
 *     contents.body → { slides: [{ kicker, big, label, sub }, …] }
 *
 * ## 🔴 onConflict: 'slug' 의 근거 (Phase 39 재발 방지)
 *
 * Phase 39 의 고장 4 건은 **전부** "제약을 확인하지 않고 `onConflict` 를 쓴 것" 이었다.
 * 그래서 이 값은 3중으로 확인하고 썼다:
 *   ① `unique_indexes_for_table('contents')` → `contents_slug_key {slug} is_partial=false`
 *   ② `explain insert … on conflict (slug) do nothing`
 *      → `Conflict Arbiter Indexes: contents_slug_key` (42P10 아님)
 *   ③ `scripts/verify-onconflict-probe.ts --only=contents` → OK(23502)
 *      (PostgREST 레벨. supabase-js 의 문자열이 실제로 어떤 SQL 이 되는지까지 태운다)
 * 그리고 이 파일의 upsert 지점은 확장된 라이브 게이트
 * (`src/__tests__/onconflict-constraint-gate.test.ts` + `AUDIT_ROOTS`)의 감사 대상이다.
 * ⛔ `contents` 의 UNIQUE 를 바꾸는 마이그레이션을 쓴다면 이 문자열도 같이 고쳐야 한다.
 *
 * ## 클라이언트를 주입받는 이유
 * `fetch-data.js` 는 **모듈 최상단**에서 env 를 검증하고 클라이언트를 만든다. 그걸 import 하면
 * 이 모듈이 DB 없는 환경(단위 테스트)에서 통째로 못 쓰게 된다. 그래서 `persistContents` 는
 * 클라이언트를 인자로 받고, 실제 생성은 `--persist` 일 때만 `getClient()` 로 지연한다.
 */
import { buildSlides, buildChampionSlides, buildContentMeta } from './build-slides.js'

/** 창부레터 사이트 식별자 — `contents.site_id` 기본값과 같다. */
const SITE_ID = 'changbuletter'

/**
 * 한 시리즈의 `data` → `contents` 행 1건. **순수 함수** (DB·네트워크·Date 비의존).
 *
 * @param {string} seriesId  예: '84-seongsan' · 'district-champions'
 * @param {object} data      `generateCardSet` 이 받는 data 그대로
 * @param {string} to        회차 기간 종료일 `YYYY-MM-DD`
 * @returns {object|null}    실데이터가 0건이면 `null`
 */
export function buildContentRow(seriesId, data, to) {
  const isChampions = Array.isArray(data.champions)
  const slides = isChampions ? buildChampionSlides(data) : buildSlides(data)

  // 🔴 슬라이드 0장이면 적재하지 않는다.
  //    빈 아카이브 항목은 웹에서 "슬라이드 0장" 빈 화면이 된다 — 없느니만 못하다.
  //    (`buildSlides` 가 pad10 placeholder 를 걸러내므로, 실거래가 0건인 회차가 여기 온다.)
  if (slides.length === 0) return null

  const meta = buildContentMeta(seriesId, data, to)

  return {
    site_id: SITE_ID,
    slug: meta.slug,
    type: 'card_news',
    category: meta.category,
    // 📌 D-07 재량: 비워둔다. 시리즈 정의의 `region` 은 '창원 성산구'·'창원+김해' 형태인데
    //    ADR-002 의 `region_tags` 는 '의창구'·'중동' 같은 **동/구 단위** 태그를 의도한다
    //    (SPEC-002 C절 "초기 태그 목록" 미결). 잘못된 태그는 지역 추천(`&&` 교집합)을
    //    오작동시킨다 → 비워두고 이월. 확정 후 UPDATE 로 채우는 편이 안전하다.
    region_tags: [],
    title: meta.title,
    excerpt: meta.excerpt,
    // 🔴 ADR-004 계약 그대로. 슬라이드는 kicker·big·label·sub 정확히 4필드다.
    body: { slides },
    // `published_at` 은 항상 과거(회차 종료일 23:59:59 KST)라 공개 읽기 정책
    // `status='published' and published_at <= now()` 를 즉시 만족한다.
    status: 'published',
    published_at: meta.publishedAt,
    is_featured: false,
    // ⛔ id·created_at·updated_at 을 넣지 않는다 — 재실행마다 값이 흔들려 멱등이 깨진다.
    // ⛔ cover_image·read_minutes·cafe_post_url·vote_* 는 스코프 밖이다.
  }
}

/**
 * `contents` 에 upsert 한다. `null` 행은 건너뛴다.
 *
 * @param {{from: (t: string) => {upsert: Function}}} client  Supabase 클라이언트(주입)
 * @param {Array<object|null>} rows
 * @returns {Promise<{upserted: number, skipped: number}>}
 */
export async function persistContents(client, rows) {
  const valid = rows.filter(Boolean)
  const skipped = rows.length - valid.length

  if (valid.length === 0) return { upserted: 0, skipped }

  const { error } = await client
    .from('contents')
    .upsert(valid, { onConflict: 'slug', ignoreDuplicates: false })

  // 🔴 던진다. 조용히 삼키면 "적재됐다고 보고했는데 DB 는 비어 있는" Phase 39 F-03 형태가 된다.
  if (error) {
    throw new Error(`contents upsert 실패 (${error.code ?? 'no code'}): ${error.message}`)
  }

  return { upserted: valid.length, skipped }
}

/**
 * `--persist` 일 때만 호출되는 지연 클라이언트 생성기.
 * env 검증 메시지는 `fetch-data.js:7-12` 형식을 따른다.
 */
export async function getClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n' +
        'Create card-news/.env with these values.',
    )
  }
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}
