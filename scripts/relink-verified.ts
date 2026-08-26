/**
 * 카카오로 검증된 오연결만 이동·끊기 (2026-08-24)
 *
 * [왜 별도 스크립트인가]
 * `relink-transactions-by-jibun.ts` 는 **다수결**로 판정한다. 전건 오연결에서는 다수결
 * 자체가 오염돼 있어 못 쓴다(그게 `audit-wholesale-mislink.ts` 를 만든 이유다).
 * 여기서는 판정을 하지 않는다 — **카카오가 이미 different_place 로 확정한 목록만** 받아
 * 실행한다. 판정과 실행을 분리해 두면 잘못된 판정이 조용히 실행되지 않는다.
 *
 * [🔴 범위를 (동, 지번) 으로 좁힌다 — 단지 전체를 건드리면 안 된다]
 * 한 단지가 남의 거래와 자기 거래를 **나눠 갖는** 경우가 있다(2026-08-24 부산 실측):
 *   이지더원2차포레온[일광읍]  정관읍 모전리 670건(남의 것) + 일광읍 삼성리 330건(자기 것)
 *   이진캐스빌[기장읍]        정관읍 용수리 634건(남의 것) + 기장읍 대라리 366건(자기 것)
 * 남의 거래가 더 많아 확정 지번이 남의 것이 됐을 뿐이다. `complex_id` 를 통째로 바꾸면
 * 자기 거래까지 날아간다. 그래서 **검증된 (umd_nm, jibun) 조합만** 옮기거나 끊는다.
 *
 * [끊기를 허용하는 근거]
 * 어제 문서 §8 은 "끊기는 카카오 거리 검증 목록만" 이다. 이 스크립트의 입력이 바로 그
 * 목록이다. 미연결은 조용한 실패가 아니다 — `check-ingest-linkage.ts` 가 연결률로
 * 감시하고, `complex_aliases` 에 한 줄 넣으면 사람이 나중에 확정할 수 있다.
 *
 * 실행:
 *   npx tsx scripts/relink-verified.ts --in=kakao-busan-mislink-20260824.json
 *   npx tsx scripts/relink-verified.ts --in=a.json --in2=b.json --target=<from>:<to> --apply --backup=b.json
 *
 * 소수 오염 모드(2026-08-26) — verify-tx-jibun-kakao.ts 의 **원래 모드**(--in=<addr-match json>)
 * 산출물을 먹는다. 그쪽은 단지당 여러 (동,지번) 묶음을 검사하므로 출력 모양이 다르다:
 *   { results: [{ id, name, sgg, checks: [{ jibun, count, dist_m, verdict }] }] }
 * 확정된 묶음만 골라 평평하게 편다. 판정 기준(NEAR_M/FAR_M)은 그쪽에 있고 여기서는
 * **다시 판정하지 않는다** — 판정과 실행을 분리한다는 이 스크립트의 원칙 그대로다.
 *   npx tsx scripts/relink-verified.ts --in-minor=verify-minor-20260826.json --apply --backup=b.json
 *
 * 사람 판정 모드(2026-08-26) — 카카오 거리로 못 가르는 건을 다른 근거로 결정했을 때.
 *   npx tsx scripts/relink-verified.ts --in-decided=decided.json --apply --backup=b.json
 *
 *   카카오는 300~1000m 를 `ambiguous` 로 남긴다. 그 구간에도 **다른 근거가 결정적인**
 *   경우가 있다 — 세대수 대비 거래량, 목표 단지의 등록 주소가 그 지번과 정확히 같음,
 *   목표의 거래가 0건임 등. 그런 판단을 카카오 판정으로 위장하지 않고 따로 받는다.
 *
 *   { "decided": [{ "complex_id": "...", "name": "...", "sgg_code": "48250",
 *                   "canonical": "무계동 156-5", "tx_count": 916,
 *                   "basis": "왜 그렇게 판단했는지 — 필수" }] }
 *
 *   🔴 `basis` 가 비어 있으면 거부한다. 근거 없는 이동·끊기를 막는다.
 *
 * --target 은 이동 목표를 명시한다(여러 번 지정 가능, 쉼표 구분). 없으면 끊기다.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]

interface Verified {
  complex_id: string; name: string; sgg_code: string
  canonical: string; tx_count: number; kakao_verdict?: string; dist_m?: number
}

interface Op {
  complex_id: string; name: string; sgg_code: string
  umd_nm: string; jibun: string
  action: 'move' | 'unlink'
  to?: string; toName?: string
  ids: number[]
  /** 이 단지에 남는 거래 — 자기 것을 건드리지 않았음을 증명한다. */
  keeping: number
}

/** `--target=<fromId>:<toId>,<fromId>:<toId>` 를 파싱한다. */
function parseTargets(): Map<string, string> {
  const raw = arg('target')
  const m = new Map<string, string>()
  if (!raw) return m
  for (const pair of raw.split(',')) {
    const [from, to] = pair.split(':')
    if (from && to) m.set(from.trim(), to.trim())
  }
  return m
}

/**
 * 사람이 다른 근거로 결정한 목록을 읽는다. `basis` 를 필수로 요구한다 —
 * 카카오가 `ambiguous` 로 남긴 구간을 근거 없이 밀어붙이지 못하게 한다.
 */
function loadDecided(paths: string[]): Verified[] {
  const out: Verified[] = []
  for (const p of paths) {
    interface D {
      complex_id: string; name: string; sgg_code: string
      canonical: string; tx_count: number; basis?: string
    }
    const j = JSON.parse(readFileSync(p, 'utf8')) as { decided?: D[] }
    for (const d of j.decided ?? []) {
      if (!d.basis || !d.basis.trim()) {
        throw new Error(`basis 가 비어 있다: ${d.name} (${d.canonical}) — 근거 없이는 처리하지 않는다`)
      }
      console.log(`  📌 ${d.name} ${d.canonical} (${d.tx_count}건)`)
      console.log(`     근거: ${d.basis}`)
      out.push({
        complex_id: d.complex_id, name: d.name, sgg_code: d.sgg_code,
        canonical: d.canonical, tx_count: d.tx_count, kakao_verdict: 'decided',
      })
    }
  }
  return out
}

/** verify-tx-jibun-kakao 의 원래 모드 출력(단지당 checks[]) 을 Verified 목록으로 편다. */
function loadMinor(paths: string[]): Verified[] {
  const out: Verified[] = []
  for (const p of paths) {
    interface Check { jibun: string; count: number; dist_m?: number; verdict?: string }
    interface Row { id: string; name: string; sgg: string; checks?: Check[] }
    const j = JSON.parse(readFileSync(p, 'utf8')) as { results?: Row[] }
    for (const r of j.results ?? []) {
      for (const c of r.checks ?? []) {
        if (c.verdict !== 'different_place') continue
        out.push({
          complex_id: r.id, name: r.name, sgg_code: r.sgg,
          canonical: c.jibun, tx_count: c.count,
          kakao_verdict: 'different_place', dist_m: c.dist_m,
        })
      }
    }
  }
  return out
}

async function loadVerified(paths: string[]): Promise<Verified[]> {
  const out: Verified[] = []
  for (const p of paths) {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { results?: Verified[] }
    for (const r of j.results ?? []) {
      if (r.kakao_verdict === 'different_place') out.push(r)
    }
  }
  // 같은 단지가 두 입력에 겹쳐 들어올 수 있다.
  const seen = new Set<string>()
  return out.filter((r) => {
    const k = `${r.complex_id}|${r.canonical}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

/** 검증된 (동, 지번) 에 해당하는 거래 id 와, 그 단지에 남을 거래 수를 구한다. */
async function buildOp(
  sb: SupabaseClient, v: Verified, targets: Map<string, string>,
): Promise<Op | null> {
  // canonical 은 "동 지번" 형태다. 동에 공백이 있을 수 있어(진동면 진동리) 뒤에서 자른다.
  const i = v.canonical.lastIndexOf(' ')
  if (i < 0) return null
  const umd = v.canonical.slice(0, i), jibun = v.canonical.slice(i + 1)

  const ids: number[] = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('transactions').select('id')
      .eq('complex_id', v.complex_id).eq('umd_nm', umd).eq('jibun', jibun)
      .is('cancel_date', null).is('superseded_by', null)
      .order('id').range(p * 1000, p * 1000 + 999)
    if (error) throw new Error(`거래 조회 실패(${v.name}): ${error.message}`)
    ids.push(...data.map((r) => Number(r.id)))
    if (data.length < 1000) break
  }
  if (!ids.length) return null

  const { count: total } = await sb.from('transactions').select('id', { count: 'exact', head: true })
    .eq('complex_id', v.complex_id).is('cancel_date', null).is('superseded_by', null)

  const to = targets.get(v.complex_id)
  let toName: string | undefined
  if (to) {
    const { data } = await sb.from('complexes').select('canonical_name,status').eq('id', to).maybeSingle()
    if (!data) throw new Error(`--target 목표 단지 없음: ${to}`)
    if (data.status !== 'active') throw new Error(`--target 목표가 active 아님(${data.status}): ${to}`)
    toName = data.canonical_name
  }
  return {
    complex_id: v.complex_id, name: v.name, sgg_code: v.sgg_code,
    umd_nm: umd, jibun, action: to ? 'move' : 'unlink',
    to, toName, ids, keeping: (total ?? 0) - ids.length,
  }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const paths = [arg('in'), arg('in2'), arg('in3')].filter((x): x is string => !!x)
  const minorPaths = [arg('in-minor'), arg('in-minor2')].filter((x): x is string => !!x)
  const decidedPaths = [arg('in-decided')].filter((x): x is string => !!x)
  if (!paths.length && !minorPaths.length && !decidedPaths.length) {
    throw new Error('--in=<kakao 검증 json> / --in-minor=<소수 오염 json> / --in-decided=<사람 판정 json> 중 하나 필요')
  }
  const apply = has('apply')
  const targets = parseTargets()

  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)
  console.log(`입력 ${paths.length + minorPaths.length}개 / 이동 목표 지정 ${targets.size}건`)

  const verified = [
    ...(paths.length ? await loadVerified(paths) : []),
    ...loadMinor(minorPaths),
    ...loadDecided(decidedPaths),
  ]
  console.log(`카카오 different_place 확정 ${verified.length}곳`)

  const ops: Op[] = []
  for (const v of verified) {
    const op = await buildOp(sb, v, targets)
    if (op) ops.push(op)
    else console.log(`  (건너뜀) ${v.name}: 해당 (${v.canonical}) 거래가 없다 — 이미 정리됐을 수 있다`)
  }

  console.log('\n=== 계획 ===')
  for (const o of ops.sort((a, b) => b.ids.length - a.ids.length)) {
    const dest = o.action === 'move' ? `→ ${o.toName}` : '→ 끊기(null)'
    console.log(`  ${o.name.padEnd(24)} [${o.sgg_code}] ${o.umd_nm} ${o.jibun}: ${String(o.ids.length).padStart(4)}건 ${dest}  (이 단지에 남음 ${o.keeping}건)`)
  }
  const mv = ops.filter((o) => o.action === 'move').reduce((a, o) => a + o.ids.length, 0)
  const ul = ops.filter((o) => o.action === 'unlink').reduce((a, o) => a + o.ids.length, 0)
  console.log(`  합계: 이동 ${mv} / 끊기 ${ul}`)

  const backup = arg('backup')
  if (backup) {
    writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), ops }, null, 2))
    console.log(`📄 계획 저장: ${backup}`)
  }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 적용 중...')
  let moved = 0, cut = 0
  for (const o of ops) {
    for (let i = 0; i < o.ids.length; i += 100) {
      const chunk = o.ids.slice(i, i + 100)
      const { data, error } = await sb.from('transactions')
        .update({ complex_id: o.action === 'move' ? o.to : null }).in('id', chunk).select('id')
      if (error) throw new Error(`${o.name} ${o.action} 실패: ${error.message}`)
      if (o.action === 'move') moved += data.length; else cut += data.length
    }
    console.log(`  ✅ ${o.name} ${o.umd_nm} ${o.jibun}: ${o.ids.length}건 ${o.action}`)
  }
  console.log(`\n✅ 이동 ${moved} / 끊기 ${cut}`)
  console.log('다음: 확정 지번 재계산 — gh workflow run refresh-price-stats.yml --ref main')
}

main().catch((e) => { console.error(`[relink-verified] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
