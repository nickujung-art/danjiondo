/**
 * [36-02 / CBL-07] 창부레터 신규 5개 테이블 RLS 실측 검증 (anon 역할)
 * 실행: npx tsx --env-file=.env.local scripts/verify-cbl-rls.ts
 *
 * 왜 실측인가: `TO` 절 누락 같은 버그는 DDL을 읽어서는 잡히지 않는다. 그리고 이
 * 프로젝트는 Supabase 기본 테이블 권한이 anon에 부여된 상태이고(20260730000003
 * 마이그레이션은 grant/revoke를 쓰지 않는다 — D-04 그대로), 차단은 전적으로 RLS
 * 정책이 담당한다. 따라서 anon 역할로 실제 PostgREST를 타는 것만이 증거다.
 *
 * 클라이언트 2개를 절대 혼용하지 않는다:
 *   - admin: SUPABASE_SERVICE_ROLE_KEY — fixture 생성·정리 전용 (RLS 우회)
 *   - anon : NEXT_PUBLIC_SUPABASE_ANON_KEY — 검증 주체
 * service_role로 검증하면 RLS가 우회돼 전부 통과로 보인다.
 *
 * 프로덕션 DB에 fixture를 만든다. 모든 식별자에 `zz-cbl-verify-` 접두어를 붙이고
 * cleanup을 finally에서 무조건 실행한다.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error(
    '❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY 중 누락된 값이 있음',
  )
  process.exit(1)
}

console.log(`🔗 연결 대상: ${SUPABASE_URL}`)
if (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost')) {
  console.warn('⚠️  로컬 Supabase에 연결 중입니다. 이 검증의 목적은 프로덕션 RLS 확인입니다.')
}

const CLIENT_OPTS = { auth: { autoRefreshToken: false, persistSession: false } } as const

/** fixture 생성·정리 전용 (RLS 우회) — 검증에 절대 사용하지 않는다 */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, CLIENT_OPTS)
/** 검증 주체 — 실제 anon 역할로 PostgREST를 탄다 */
const anon = createClient(SUPABASE_URL, ANON_KEY, CLIENT_OPTS)

const PREFIX = 'zz-cbl-verify-'
const SEED_EMAIL = `${PREFIX}seed@example.invalid`
const ANON_PENDING_EMAIL = `${PREFIX}anon@example.invalid`
const ANON_CONFIRMED_EMAIL = `${PREFIX}anon-confirmed@example.invalid`

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

interface CheckResult {
  no: number
  name: string
  expected: string
  actual: string
  pass: boolean
}

const results: CheckResult[] = []

function record(no: number, name: string, expected: string, actual: string, pass: boolean): void {
  results.push({ no, name, expected, actual, pass })
  console.log(`${pass ? '✅' : '❌'} [${no}] ${name} — 기대: ${expected} / 실측: ${actual}`)
}

interface ContentIds {
  draft: string
  scheduled: string
  future: string
  live: string
}

async function createFixtures(): Promise<{ contentIds: ContentIds; complexId: string }> {
  const now = Date.now()

  const { data: complexRows, error: complexErr } = await admin
    .from('complexes')
    .select('id')
    .limit(1)
  if (complexErr) throw new Error(`complexes 조회 실패: ${complexErr.message}`)
  const complexId = complexRows?.[0]?.id
  if (!complexId) throw new Error('complexes에 행이 없어 content_complexes fixture를 만들 수 없음')

  const contentRows = [
    { slug: `${PREFIX}draft`, status: 'draft', scheduled_at: null, published_at: null },
    {
      slug: `${PREFIX}scheduled`,
      status: 'scheduled',
      scheduled_at: new Date(now + DAY_MS).toISOString(),
      published_at: null,
    },
    {
      slug: `${PREFIX}future`,
      status: 'published',
      scheduled_at: null,
      published_at: new Date(now + DAY_MS).toISOString(),
    },
    {
      slug: `${PREFIX}live`,
      status: 'published',
      scheduled_at: null,
      published_at: new Date(now - HOUR_MS).toISOString(),
    },
  ].map((row) => ({
    ...row,
    site_id: 'changbuletter',
    type: 'article',
    category: 'zz-verify',
    title: `[검증용] ${row.slug}`,
  }))

  const { data: inserted, error: insertErr } = await admin
    .from('contents')
    .insert(contentRows)
    .select('id, slug')
  if (insertErr) throw new Error(`contents fixture 생성 실패: ${insertErr.message}`)

  const bySlug = new Map((inserted ?? []).map((r) => [r.slug, r.id]))
  const draft = bySlug.get(`${PREFIX}draft`)
  const scheduled = bySlug.get(`${PREFIX}scheduled`)
  const future = bySlug.get(`${PREFIX}future`)
  const live = bySlug.get(`${PREFIX}live`)
  if (!draft || !scheduled || !future || !live) {
    throw new Error('contents fixture id를 모두 확보하지 못함')
  }

  const { error: linkErr } = await admin.from('content_complexes').insert([
    { content_id: draft, complex_id: complexId },
    { content_id: live, complex_id: complexId },
  ])
  if (linkErr) throw new Error(`content_complexes fixture 생성 실패: ${linkErr.message}`)

  // SELECT 차단 테스트가 "숨길 대상"이 실제로 존재한 상태에서 검증되도록 seed 구독자를 만든다
  const { error: subErr } = await admin
    .from('subscribers')
    .insert({ site_id: 'changbuletter', email: SEED_EMAIL, status: 'confirmed' })
  if (subErr) throw new Error(`subscribers seed 생성 실패: ${subErr.message}`)

  return { contentIds: { draft, scheduled, future, live }, complexId }
}

/** anon으로 slug 단건 조회 → 행 수 반환 */
async function anonContentsBySlug(slug: string): Promise<{ count: number; error: string | null }> {
  const { data, error } = await anon.from('contents').select('id, slug').eq('slug', slug)
  return { count: data?.length ?? 0, error: error?.message ?? null }
}

async function runChecks(contentIds: ContentIds): Promise<void> {
  // 1~3: 미발행 콘텐츠 차단
  const blockedCases: ReadonlyArray<{ no: number; label: string; slug: string }> = [
    { no: 1, label: 'anon contents SELECT (draft)', slug: `${PREFIX}draft` },
    { no: 2, label: 'anon contents SELECT (scheduled)', slug: `${PREFIX}scheduled` },
    { no: 3, label: 'anon contents SELECT (published + published_at 미래)', slug: `${PREFIX}future` },
  ]
  for (const c of blockedCases) {
    const { count, error } = await anonContentsBySlug(c.slug)
    record(c.no, c.label, '0행', error ? `error: ${error}` : `${count}행`, !error && count === 0)
  }

  // 4: positive control — 0행이 연결 오류가 아님을 증명
  {
    const { count, error } = await anonContentsBySlug(`${PREFIX}live`)
    record(
      4,
      'anon contents SELECT (published + 과거) [positive control]',
      '1행',
      error ? `error: ${error}` : `${count}행`,
      !error && count === 1,
    )
  }

  // 5: subscribers SELECT 차단 — 이메일 보호의 유일한 실측 증거
  {
    const { data, error } = await anon.from('subscribers').select('email').limit(5)
    const rows = data ?? []
    const leaked = rows.some((r) => r.email === SEED_EMAIL)
    const isDenied = error !== null || rows.length === 0
    const pass = isDenied && !leaked
    record(
      5,
      'anon subscribers SELECT 차단 (이메일 목록 덤프)',
      '0행 또는 42501',
      error ? `error(${error.code ?? '?'}): ${error.message}` : `${rows.length}행${leaked ? ' ⚠️ seed 유출' : ''}`,
      pass,
    )
    if (!pass) {
      console.error(
        '🔴 항목 5 실패 — subscribers 이메일이 anon에 노출된다. 즉시 중단하고 보고해야 한다.\n' +
          '   (스스로 revoke를 추가하지 말 것 — D-04 개정 + 창부레터 ADR-003 동기화가 선행돼야 한다)',
      )
    }
  }

  // 6: anon 구독 신청(pending) 허용 — .select() 체이닝 금지 (SELECT 정책이 없어 returning 읽기가 차단됨)
  {
    const { error } = await anon
      .from('subscribers')
      .insert({ site_id: 'changbuletter', email: ANON_PENDING_EMAIL, status: 'pending' })
    record(
      6,
      "anon subscribers INSERT (status='pending')",
      '성공',
      error ? `error(${error.code ?? '?'}): ${error.message}` : '성공',
      !error,
    )
  }

  // 7: anon 구독 신청(confirmed) 거부 — 42501이어야 하며 23505(unique)면 실패
  {
    const { error } = await anon
      .from('subscribers')
      .insert({ site_id: 'changbuletter', email: ANON_CONFIRMED_EMAIL, status: 'confirmed' })
    const code = error?.code ?? null
    record(
      7,
      "anon subscribers INSERT (status='confirmed') 거부",
      '42501',
      code ? `error(${code})` : '성공 (차단 실패)',
      code === '42501',
    )
  }

  // 8: draft 콘텐츠에 연결된 content_complexes 차단
  {
    const { data, error } = await anon
      .from('content_complexes')
      .select('content_id, complex_id')
      .eq('content_id', contentIds.draft)
    record(
      8,
      'anon content_complexes SELECT (draft 연결)',
      '0행',
      error ? `error: ${error.message}` : `${data?.length ?? 0}행`,
      !error && (data?.length ?? 0) === 0,
    )
  }

  // 9: positive control — published 콘텐츠 연결은 보인다
  {
    const { data, error } = await anon
      .from('content_complexes')
      .select('content_id, complex_id')
      .eq('content_id', contentIds.live)
    record(
      9,
      'anon content_complexes SELECT (published 연결) [positive control]',
      '1행',
      error ? `error: ${error.message}` : `${data?.length ?? 0}행`,
      !error && (data?.length ?? 0) === 1,
    )
  }

  // 10: T-36-02-05 — anon contents 위조 삽입 차단
  {
    const { error } = await anon.from('contents').insert({
      site_id: 'changbuletter',
      slug: `${PREFIX}anon-write`,
      type: 'article',
      category: 'zz-verify',
      title: 'anon write attempt',
    })
    const code = error?.code ?? null
    record(
      10,
      'anon contents INSERT 거부 (T-36-02-05 위조 삽입)',
      '42501',
      code ? `error(${code})` : '성공 (차단 실패)',
      code === '42501',
    )
  }
}

async function cleanup(): Promise<void> {
  console.log('\n🧹 cleanup (service_role)')

  const { error: delContentsErr } = await admin
    .from('contents')
    .delete()
    .like('slug', `${PREFIX}%`)
  if (delContentsErr) console.error(`  ❌ contents 삭제 실패: ${delContentsErr.message}`)

  const { error: delSubsErr } = await admin
    .from('subscribers')
    .delete()
    .like('email', `${PREFIX}%`)
  if (delSubsErr) console.error(`  ❌ subscribers 삭제 실패: ${delSubsErr.message}`)

  const { data: leftContents } = await admin
    .from('contents')
    .select('slug')
    .like('slug', `${PREFIX}%`)
  const { data: leftSubs } = await admin
    .from('subscribers')
    .select('email')
    .like('email', `${PREFIX}%`)
  const { count: linkCount } = await admin
    .from('content_complexes')
    .select('*', { count: 'exact', head: true })

  const remainContents = leftContents?.length ?? 0
  const remainSubs = leftSubs?.length ?? 0
  console.log(`  contents 잔여: ${remainContents}건`)
  console.log(`  subscribers 잔여: ${remainSubs}건`)
  console.log(`  content_complexes 전체: ${linkCount ?? 0}건 (FK cascade 확인)`)

  if (remainContents > 0) console.error(`  ❌ 잔여 contents: ${leftContents?.map((r) => r.slug).join(', ')}`)
  if (remainSubs > 0) console.error(`  ❌ 잔여 subscribers: ${leftSubs?.map((r) => r.email).join(', ')}`)
  if (remainContents > 0 || remainSubs > 0 || (linkCount ?? 0) > 0) {
    process.exitCode = 1
  }

  const { count: complexCount } = await admin
    .from('complexes')
    .select('*', { count: 'exact', head: true })
  console.log(`  complexes 행수: ${complexCount ?? 0} (Golden Record — 스크립트 전후 불변이어야 함)`)
}

async function main(): Promise<void> {
  const { count: complexBefore } = await admin
    .from('complexes')
    .select('*', { count: 'exact', head: true })
  console.log(`📐 complexes 행수 (before): ${complexBefore ?? 0}\n`)

  try {
    const { contentIds } = await createFixtures()
    console.log('📦 fixture 생성 완료 (contents 4건 + content_complexes 2건 + subscribers seed 1건)\n')
    await runChecks(contentIds)
  } catch (err) {
    console.error(`\n💥 검증 중 예외: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  } finally {
    await cleanup()
  }

  const passed = results.filter((r) => r.pass).length
  console.log(`\n📊 결과: ${passed}/${results.length} PASS`)
  console.log('| # | 항목 | 기대 | 실측 | 판정 |')
  console.log('|---|------|------|------|------|')
  for (const r of results) {
    console.log(`| ${r.no} | ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅' : '❌'} |`)
  }

  if (results.length !== 10 || passed !== 10) {
    console.error('\n❌ 최종 판정: FAIL')
    process.exitCode = 1
  } else {
    console.log('\n✅ 최종 판정: PASS (차단 7 + positive control 3)')
  }
}

void main()
