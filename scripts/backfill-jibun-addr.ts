/**
 * complexes.jibun_address 백필 — K-apt 공식 법정동주소(kaptAddr)를 쓴다
 *
 * jibun_address IS NULL 인 active 단지에 K-apt 주소를 채운다.
 * 2026-08-25 실측: 운영권역 active 1,902곳 중 kapt_code 를 가진 633곳의
 * **632곳이 주소 없음**이다. 정식 등록 아파트가 오히려 전부 비어 있었다.
 *
 * ── 🔴 kaptAddr 를 그대로 쓰면 안 된다 (2026-08-25) ─────────────────────────
 * K-apt 가 주는 원형에는 기형이 둘 있다:
 *
 *   경상남도 창원의창구 명서동 27 창원두산위브아파트
 *            ^^^^^^^^^ '창원시' 누락        ^^^^^^^^^^^^^ 단지명이 붙어 있다
 *
 * 그대로 넣으면 표기가 섞여 이 값을 문자열로 읽는 감사 도구가 어긋난다.
 * 기존 데이터의 관례는 `경남 창원시 의창구 …` 다(실측: 첫 토큰 `경남` 1,107 vs
 * `경상남도` 15 / 창원 시군구는 전부 `창원시 ○○구` 정상형).
 *
 * ── 그래서 파싱하지 않고 **재구성**한다 ─────────────────────────────────────
 * 시도·시군구는 `sgg_code` 로 이미 알고 있다. kaptAddr 에서는 **동+지번 꼬리만** 취한다.
 * 구현과 단위 테스트는 `src/lib/data/kapt-address.ts` 에 있다(vitest 는 src/** 만 수집한다).
 *
 *   ① 끝에 붙은 kaptName 을 떼어낸다(공백 무시 비교)
 *   ② 동/리/가/읍/면 으로 끝나는 **첫 토큰**부터 끝까지가 꼬리다
 *      — 시도(…도)·시군구(…시/…구/창원○○구)는 그 패턴에 걸리지 않는다
 *      — `진영읍 여래리 233-8` 처럼 읍+리가 겹쳐도 첫 토큰부터 잡으면 온전하다
 *   ③ 꼬리의 마지막 토큰이 지번 꼴(`123`·`123-4`)이 **아니면 적용하지 않는다**
 *      — K-apt 는 부번이 없을 때 `1564-` 처럼 하이픈을 남기는데 그건 떼어낸다(실측 29건)
 *      — 파싱이 어긋난 것이므로 조용히 이상한 주소를 쓰느니 사람에게 남긴다
 *
 * 결과: `경남 창원시 의창구 명서동 27`
 *
 * ── 확정 지번과 교차검증한다 ────────────────────────────────────────────────
 * `complex_canonical_jibun`(거래 다수결)이 있으면 **동이 일치하는지** 본다. 어긋나면
 * kapt_code 연결 자체가 틀렸을 수 있으므로 보류한다. 지번까지 같을 필요는 없다 —
 * 대단지는 여러 필지에 걸치고 K-apt 는 대표 필지를 준다.
 *
 * 🔴 기본이 dry-run 이다. 예전에는 `--dry-run` 을 줘야 안 쓰는 구조였는데, 이 저장소의
 *    다른 데이터 도구와 반대라 사고가 나기 쉽다. `--apply` 를 명시해야 쓴다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts              # dry-run, 운영권역
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts --busan
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts --backup=plan.json
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-addr.ts --from-plan=plan.json --apply
 *
 * 환경변수: KAPT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { fetchKaptBasicInfoDetailed } from '../src/services/kapt'
import { normalizeKaptAddr } from '../src/lib/data/kapt-address'

loadEnvConfig(process.cwd(), true)

const KAPT_API_KEY     = process.env.KAPT_API_KEY
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KAPT_API_KEY)     { console.error('❌ KAPT_API_KEY 없음');             process.exit(1) }
if (!SUPABASE_URL)     { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');  process.exit(1) }
if (!SUPABASE_SRV_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const CORE_SGG = ['48121', '48123', '48125', '48127', '48129', '48250']
const BUSAN_SGG = [
  '26110', '26140', '26170', '26200', '26230', '26260', '26290', '26320',
  '26350', '26380', '26410', '26440', '26470', '26500', '26530', '26710',
]

const BATCH_DELAY_MS = 120   // KAPT API 과부하 방지
/** 이 건수마다 백업을 중간 저장한다 — 중간에 죽어도 조회 결과를 잃지 않는다. */
const BACKUP_EVERY = 50

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const squash = (s: string | null | undefined) => (s ?? '').replace(/\s/g, '')

interface Cx {
  id: string; canonical_name: string; sgg_code: string; status: string
  kapt_code: string | null; jibun_address: string | null
}
interface Canon { complex_id: string; umd_nm: string | null; jibun: string | null }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 🔴 PostgREST 는 한 번에 1,000행만 준다. `.limit(10000)` 으로는 못 넘는다(오답노트 #001). */
async function loadAll<T>(
  sb: SupabaseClient, table: string, cols: string, scope: string[] | null, orderBy: string,
): Promise<T[]> {
  const out: T[] = []
  for (let p = 0; ; p++) {
    let q = sb.from(table).select(cols).order(orderBy).range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
    const rows = (data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

interface Row {
  id: string; name: string; sgg: string
  kaptAddr: string; normalized: string | null; dong: string | null
  canonicalDong: string | null; ok: boolean; note: string
}

async function main(): Promise<void> {
  const apply = has('apply')
  const scope = has('all') ? null : has('busan') ? BUSAN_SGG : CORE_SGG
  const limit = Number(arg('limit') ?? Infinity)
  const backup = arg('backup')

  const fromPlan = arg('from-plan')

  const sb = createClient(SUPABASE_URL!, SUPABASE_SRV_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`== jibun_address 백필 ${apply ? '🔴 APPLY' : '[dry-run]'} / 범위 ${scope ? scope.join(',') : '전국'} ==`)

  // 계획 파일 그대로 적용 — K-apt 를 다시 부르지 않는다.
  // 대상이 수백 곳이라 dry-run 과 apply 가 각각 호출하면 두 배가 되고,
  // 사람이 눈으로 본 것과 실제로 쓰이는 것이 어긋날 수 있다.
  if (fromPlan) {
    if (!apply) throw new Error('--from-plan 은 --apply 와 함께 쓴다 (계획 파일 자체가 dry-run 결과다)')
    const plan = JSON.parse(readFileSync(fromPlan, 'utf8')) as { at: string; rows: Row[] }
    const ok = plan.rows.filter((r) => r.ok)
    console.log(`계획 ${plan.at} / 적용 가능 ${ok.length}곳`)
    let done = 0, fail = 0
    for (const r of ok) {
      const { error } = await sb.from('complexes')
        .update({ jibun_address: r.normalized })
        .eq('id', r.id)
        .is('jibun_address', null)
      if (error) { console.warn(`  ⚠ ${r.name}: ${error.message}`); fail++; continue }
      if (++done % 100 === 0) console.log(`  … ${done}/${ok.length}`)
    }
    console.log(`\n✅ ${done}건 적용 / 실패 ${fail}건 (K-apt 호출 0회)`)
    return
  }

  const cxs = await loadAll<Cx>(sb, 'complexes',
    'id,canonical_name,sgg_code,status,kapt_code,jibun_address', scope, 'id')
  const canons = await loadAll<Canon>(sb, 'complex_canonical_jibun',
    'complex_id,umd_nm,jibun', scope, 'complex_id')
  const canonBy = new Map(canons.map((c) => [c.complex_id, c]))

  const targets = cxs
    .filter((c) => c.status === 'active' && c.kapt_code && !c.jibun_address)
    .slice(0, Number.isFinite(limit) ? limit : undefined)

  console.log(`대상: ${targets.length}건`)
  if (targets.length === 0) { console.log('처리할 항목 없음.'); return }

  const rows: Row[] = []
  let notFound = 0, apiFail = 0
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i]
    process.stdout.write(`\r[${i + 1}/${targets.length}] ${c.canonical_name.slice(0, 24).padEnd(25)}`)

    let outcome: Awaited<ReturnType<typeof fetchKaptBasicInfoDetailed>>
    try {
      outcome = await fetchKaptBasicInfoDetailed(c.kapt_code!)
    } catch (err) {
      console.warn(`\n  ⚠ API 오류 (${c.kapt_code} ${c.canonical_name}): ${err instanceof Error ? err.message : String(err)}`)
      apiFail++
      await sleep(BATCH_DELAY_MS)
      continue
    }
    if (!outcome.ok) {
      if (outcome.reason !== 'no_item') {
        console.warn(`\n  ⚠ ${c.canonical_name}: ${outcome.reason} — ${outcome.hint}`)
      }
      notFound++
      await sleep(BATCH_DELAY_MS)
      continue
    }

    const kaptAddr = outcome.data.kaptAddr
    if (!kaptAddr) { notFound++; await sleep(BATCH_DELAY_MS); continue }

    const norm = normalizeKaptAddr(kaptAddr, outcome.data.kaptName, c.sgg_code)
    const canon = canonBy.get(c.id)
    const canonDong = canon?.umd_nm ?? null

    let ok = norm.ok
    let note = norm.ok ? '정규화 성공' : norm.reason!
    if (norm.ok && canonDong) {
      const a = squash(norm.dong), b = squash(canonDong)
      const dongOk = a === b || a.includes(b) || b.includes(a)
      if (!dongOk) {
        ok = false
        note = `🔴 확정 지번의 동과 다르다: K-apt ${norm.dong} vs 거래 다수결 ${canonDong} — kapt_code 연결 의심`
      } else {
        note = '정규화 성공 + 확정 지번의 동과 일치'
      }
    }

    rows.push({
      id: c.id, name: c.canonical_name, sgg: c.sgg_code,
      kaptAddr, normalized: norm.address ?? null, dong: norm.dong ?? null,
      canonicalDong: canonDong, ok, note,
    })

    // 🔴 중간 저장. 예전에는 루프가 끝나야 백업을 썼는데, 2026-08-25 에 615/632 에서
    //    프로세스가 죽자 **632건 조회가 통째로 날아갔다.** 수백 건짜리 외부 API 루프는
    //    끝까지 간다는 보장이 없다.
    if (backup && rows.length % BACKUP_EVERY === 0) {
      writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), partial: true, rows }, null, 2))
    }
    await sleep(BATCH_DELAY_MS)
  }
  console.log('')

  const good = rows.filter((r) => r.ok)
  const held = rows.filter((r) => !r.ok)

  if (held.length) {
    console.log(`\n=== 보류 ${held.length}건 (사람이 봐야 한다) ===`)
    for (const r of held.slice(0, 30)) {
      console.log(`  ${r.name}[${r.sgg}]`)
      console.log(`     kaptAddr ${r.kaptAddr}`)
      console.log(`     → ${r.note}`)
    }
    if (held.length > 30) console.log(`  … 외 ${held.length - 30}건 (백업 파일 참조)`)
  }

  console.log(`\n=== 적용 가능 ${good.length}건 (표본) ===`)
  for (const r of good.slice(0, 10)) {
    console.log(`  ${r.name.slice(0, 20).padEnd(21)} ${r.kaptAddr}`)
    console.log(`  ${''.padEnd(21)} → ${r.normalized}`)
  }

  console.log(`\n적용 가능 ${good.length} / 보류 ${held.length} / 미조회 ${notFound} / API 오류 ${apiFail}`)

  if (backup) {
    writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2))
    console.log(`📄 ${backup}`)
  }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 적용 중...')
  let updated = 0, failed = 0
  for (const r of good) {
    const { error } = await sb.from('complexes')
      .update({ jibun_address: r.normalized })
      .eq('id', r.id)
      .is('jibun_address', null)   // 그 사이 채워졌으면 덮지 않는다
    if (error) { console.warn(`  ⚠ ${r.name}: ${error.message}`); failed++; continue }
    if (++updated % 50 === 0) console.log(`  … ${updated}/${good.length}`)
  }
  console.log(`\n✅ ${updated}건 적용 / 실패 ${failed}건`)
}

main().catch((err: unknown) => {
  console.error('스크립트 실행 실패:', err)
  process.exit(1)
})
