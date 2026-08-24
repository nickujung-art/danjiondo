/**
 * 단지 병합 — 중복 등록된 단지를 하나로 합친다 (2026-08-24)
 *
 * [이 저장소의 병합 관례 — 실측으로 확인했다]
 * `20260806080000`(토월성원) + `20260806090000`(매칭 RPC successor 추적)이 정한 3종 세트다.
 * merged 단지들의 거래가 0건인 것이 "행을 옮긴다"의 증거다.
 *
 *   1) 참조 행을 전부 target 으로 재지정한다
 *   2) source 는 **삭제하지 않고** `status='merged'` 로 둔다 — 지우면 시더가 다시 만든다
 *   3) `successor_id = target` 을 반드시 넣는다 — 매칭 RPC 가 `COALESCE(successor_id, id)`
 *      로 넘겨주므로, 없으면 앞으로 들어오는 거래가 **화면에서 사라진 단지에 계속 붙는다**
 *
 * 🔴 3)이 실제로 지켜지지 않고 있다. 2026-08-24 실측: merged 48곳 중 **33곳이
 *    successor_id 없음**, 그중 9곳에 거래 71건이 갇혀 있다(상남오피스텔 21, 대우그린 15 …).
 *    이 스크립트의 `--fix-orphan-merged` 가 그 감사·수리용이다.
 *
 * [왜 UNIQUE 를 신경 써야 하나]
 * `complex_id` 를 참조하는 컬럼 26곳 중 **16개 테이블이 complex_id 를 UNIQUE 에 걸고 있다**
 * (favorites 는 부분 인덱스 2개). 단순 UPDATE 는 `23505` 로 죽는다. 그래서 충돌하는
 * source 행은 **target 것이 이미 있다는 뜻**이므로 지우고, 나머지만 옮긴다.
 *
 * [왜 마이그레이션 grep 이 아니라 라이브 카탈로그인가]
 * 마이그레이션을 grep 하면 `complex_area_types` 를 빠뜨리고 `audit_logs`·`realtors` 를
 * 오탐한다(2026-08-24 실측). 참조 목록도 UNIQUE 목록도 **런타임에 확인**한다.
 *
 * 실행:
 *   npx tsx scripts/merge-complexes.ts --from=<uuid> --into=<uuid>            # dry-run
 *   npx tsx scripts/merge-complexes.ts --from=<uuid> --into=<uuid> --apply --backup=b.json
 *   npx tsx scripts/merge-complexes.ts --audit-merged                          # 병합 상태 감사
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { nameSim } from '../src/lib/data/name-similarity'

/** successor 제안에 쓰는 최소 필드. */
interface Cx {
  id: string; canonical_name: string; sgg_code: string; status: string
  successor_id: string | null; lat: number | null; lng: number | null
}

/** `complexes.id` 를 가리키는 컬럼. 런타임에 OpenAPI 로 재확인한다(하드코딩 신뢰 금지). */
const FALLBACK_REFS: Array<[string, string]> = [
  ['ai_estimates', 'target_complex_id'], ['cafe_articles', 'complex_id'],
  ['cafe_posts', 'complex_id'], ['complex_aliases', 'complex_id'],
  ['complex_area_types', 'complex_id'], ['complex_canonical_jibun', 'complex_id'],
  ['complex_embeddings', 'complex_id'], ['complex_gap_stats', 'complex_id'],
  ['complex_price_predictions', 'complex_id'], ['complex_rankings', 'complex_id'],
  ['complex_reviews', 'complex_id'], ['content_complexes', 'complex_id'],
  ['facility_kapt', 'complex_id'], ['facility_poi', 'complex_id'],
  ['facility_school', 'complex_id'], ['favorites', 'complex_id'],
  ['gps_verification_requests', 'complex_id'], ['gps_visits', 'complex_id'],
  ['listing_prices', 'complex_id'], ['management_cost_monthly', 'complex_id'],
  ['new_listings', 'complex_id'], ['realtor_assignments', 'complex_id'],
  ['redevelopment_projects', 'complex_id'], ['transactions', 'complex_id'],
]

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]

interface Ref { table: string; col: string; pk: string[] }

/**
 * OpenAPI 스펙에서 complexes 를 가리키는 (테이블, 컬럼) 과 **각 테이블의 PK** 를 뽑는다.
 *
 * PK 를 'id' 로 가정하면 안 된다 — `complex_canonical_jibun` 은 `complex_id` 가 PK 이고
 * `content_complexes` 는 (content_id, complex_id) 복합키다. PostgREST 는 설명에
 * `<pk/>` 를 넣어주므로 그걸 읽는다. (첫 구현이 'id' 가정으로 죽었다.)
 */
async function discoverRefs(url: string, key: string): Promise<Ref[]> {
  try {
    const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    const spec = await r.json() as { definitions?: Record<string, { properties?: Record<string, { description?: string }> }> }
    const defs = spec.definitions ?? {}
    const out: Ref[] = []
    for (const [table, d] of Object.entries(defs)) {
      if (table === 'complexes') continue          // 자기참조는 따로 다룬다
      const props = Object.entries(d.properties ?? {})
      const pk = props.filter(([, p]) => /<pk\/>/.test(String(p.description ?? ''))).map(([c]) => c)
      for (const [col, p] of props) {
        if (/complexes/.test(String(p.description ?? ''))) {
          out.push({ table, col, pk: pk.length ? pk : ['id'] })
        }
      }
    }
    return out.length ? out : FALLBACK_REFS.map(([table, col]) => ({ table, col, pk: ['id'] }))
  } catch {
    console.warn('⚠️ OpenAPI 조회 실패 — 하드코딩 목록으로 진행한다(누락 위험).')
    return FALLBACK_REFS.map(([table, col]) => ({ table, col, pk: ['id'] }))
  }
}

/** 이 테이블에서 complex_id 와 함께 UNIQUE 를 이루는 컬럼들. 없으면 null. */
async function uniqueCols(sb: SupabaseClient, table: string, col: string): Promise<string[] | null> {
  const { data, error } = await sb.rpc('unique_indexes_for_table', { p_table: table })
  if (error || !data) return null
  const rows = data as Array<Record<string, unknown>>
  for (const r of rows) {
    const cols = (r.columns ?? r.cols ?? []) as string[]
    if (Array.isArray(cols) && cols.includes(col)) return cols.filter((c) => c !== col)
  }
  return null
}

async function pageAll(sb: SupabaseClient, table: string, cols: string, col: string, id: string) {
  const out: Record<string, unknown>[] = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from(table).select(cols).eq(col, id).range(p * 1000, p * 1000 + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < 1000) break
  }
  return out
}

interface TablePlan {
  table: string; col: string; uniq: string[] | null
  moveCount: number
  /** 버릴 행을 **유니크 튜플**로 지목한다 — PK 를 안 써서 복합키 테이블도 같은 경로로 처리된다. */
  drop: Record<string, unknown>[]
}

/** 한 테이블의 재지정 계획 — 충돌하는 행은 옮기지 않고 버린다(target 것이 이미 있다). */
async function planTable(
  sb: SupabaseClient, table: string, col: string, from: string, into: string,
): Promise<TablePlan> {
  const uniq = await uniqueCols(sb, table, col)
  const sel = uniq ? [col, ...uniq].join(',') : col
  const src = await pageAll(sb, table, sel, col, from)
  if (!uniq || !src.length) return { table, col, uniq, moveCount: src.length, drop: [] }

  const dst = await pageAll(sb, table, uniq.join(','), col, into)
  const taken = new Set(dst.map((r) => uniq.map((u) => String(r[u])).join(' ')))
  const drop: Record<string, unknown>[] = []
  let moveCount = 0
  for (const r of src) {
    const k = uniq.map((u) => String(r[u])).join(' ')
    if (taken.has(k)) drop.push(Object.fromEntries(uniq.map((u) => [u, r[u]])))
    else { taken.add(k); moveCount++ }
  }
  return { table, col, uniq, moveCount, drop }

}

/**
 * successor_id 가 빈 merged 단지에 승계 목표를 제안한다 (2026-08-24).
 *
 * 🔴 **판정자는 이름이 아니라 거리다.** 이름만 보면 순위가 거꾸로 뒤집힌다 — 실측:
 *   대우그린 ↔ 그린                 이름 매우 유사, 실제 **3,989m** (남남)
 *   경남신포맨션 ↔ 경남               이름 매우 유사, 실제 **13,901m** (남남)
 *   동부산훼밀리2차아파트 ↔ 동부산훼미리2차  오타 1자, 실제 **0m** (같은 단지)
 *   대원대동2차 ↔ 대원2차대동           어순만 다름, 실제 **0m** (같은 단지)
 * 그래서 거리를 1차 기준으로 쓰고 이름은 약한 보조로만 쓴다.
 */
const SUCC_CLEAR_M = 100
const SUCC_NAME_MIN = 0.5

/**
 * 이름에서 차수·단지·동 번호를 뽑는다.
 *
 * 🔴 거리만으로는 **1차/2차 뭉갬을 못 막는다** — 같은 개발의 인접 차수는 자연히 100m
 * 안에 있다. 실측으로 잡힌 위험 후보:
 *   월영현대산업1차 → 월영현대3차          62m  (1차를 3차에!)
 *   한빛드림빌2차   → 한빛드림빌           85m  (2차를 무차수에)
 *   삼계대동이미지   → 대동이미지1단지아파트    0m  (단지 번호가 한쪽만)
 * `matching-ambiguous-20260805.md` 가 경고한 실패 모양 그대로다. 번호 집합이 다르면
 * 거리가 0m 이어도 '명확' 으로 올리지 않는다.
 */
function phaseTokens(name: string): string {
  const m = String(name).match(/\d+\s*(?:차|단지|동)/g) ?? []
  return [...new Set(m.map((x) => x.replace(/\s/g, '')))].sort().join(',')
}

interface SuccProposal {
  id: string; name: string; sgg_code: string; stuck: number
  to?: string; toName?: string; metres?: number | null; sim?: number
  verdict: '명확' | '애매' | '후보없음'
}

async function proposeSuccessors(sb: SupabaseClient): Promise<SuccProposal[]> {
  const all: Cx[] = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('complexes')
      .select('id,canonical_name,sgg_code,status,successor_id,lat,lng')
      .order('id').range(p * 1000, p * 1000 + 999)
    if (error) throw new Error(`complexes: ${error.message}`)
    all.push(...(data as unknown as Cx[]))
    if (data.length < 1000) break
  }
  const orphans = all.filter((c) => c.status === 'merged' && !c.successor_id)
  const actives = all.filter((c) => c.status === 'active')

  const out: SuccProposal[] = []
  for (const c of orphans) {
    const { count } = await sb.from('transactions').select('id', { count: 'exact', head: true })
      .eq('complex_id', c.id).is('cancel_date', null).is('superseded_by', null)
    const cands = actives
      .filter((t) => t.sgg_code === c.sgg_code)
      .map((t) => ({ t, sim: nameSim(c.canonical_name, t.canonical_name), m: metres(c, t) }))
      .filter((x) => x.sim >= SUCC_NAME_MIN)
      // 🔴 거리 우선 정렬. 이름은 동점 처리에만 쓴다.
      .sort((a, b) => (a.m ?? Infinity) - (b.m ?? Infinity) || b.sim - a.sim)
    const top = cands[0]
    const verdict: SuccProposal['verdict'] = !top ? '후보없음'
      : (top.m != null && top.m <= SUCC_CLEAR_M
          && phaseTokens(c.canonical_name) === phaseTokens(top.t.canonical_name)) ? '명확' : '애매'
    out.push({
      id: c.id, name: c.canonical_name, sgg_code: c.sgg_code, stuck: count ?? 0,
      to: top?.t.id, toName: top?.t.canonical_name, metres: top?.m, sim: top ? +top.sim.toFixed(2) : undefined,
      verdict,
    })
  }
  return out
}

const EARTH_R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
function metres(a: Cx, b: Cx): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_R * Math.asin(Math.sqrt(h)))
}

async function auditMerged(sb: SupabaseClient): Promise<void> {
  const { data } = await sb.from('complexes').select('id,canonical_name,sgg_code,successor_id').eq('status', 'merged')
  const rows = data ?? []
  const noSucc = rows.filter((c) => !c.successor_id)
  console.log(`merged 단지 ${rows.length}곳 / successor_id 없음 ${noSucc.length}곳`)
  console.log('🔴 successor_id 가 없으면 매칭 RPC 가 넘겨줄 곳을 몰라, 신규 거래가')
  console.log('   화면에서 사라진 단지에 계속 붙는다(앱은 status=active 로 거른다).')
  let stuck = 0
  for (const c of rows) {
    const { count } = await sb.from('transactions').select('id', { count: 'exact', head: true })
      .eq('complex_id', c.id).is('cancel_date', null).is('superseded_by', null)
    if ((count ?? 0) > 0) {
      stuck += count ?? 0
      console.log(`   ${c.canonical_name}[${c.sgg_code}] 거래 ${count} 갇힘 / successor ${c.successor_id ? '있음' : '없음'}`)
    }
  }
  console.log(`\n갇힌 거래 합계 ${stuck}건`)
}
async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  if (has('audit-merged')) { await auditMerged(sb); return }

  // successor_id 가 빈 merged 단지 수리. 거리로 명확한 것만 --fix-successors 로 넣는다.
  if (has('propose-successors') || has('fix-successors')) {
    const props = await proposeSuccessors(sb)
    const order = { 명확: 0, 애매: 1, 후보없음: 2 } as const
    for (const p of props.sort((a, b) => order[a.verdict] - order[b.verdict] || b.stuck - a.stuck)) {
      const dest = p.toName ? `→ ${p.toName} (${p.metres}m, 유사 ${p.sim})` : '→ 후보 없음'
      console.log(`  ${p.verdict}  ${p.name.padEnd(24)} [${p.sgg_code}] 갇힌거래 ${String(p.stuck).padStart(3)}  ${dest}`)
    }
    const clear = props.filter((p) => p.verdict === '명확')
    console.log(`\n명확 ${clear.length} / 애매 ${props.filter((p) => p.verdict === '애매').length} / 후보없음 ${props.filter((p) => p.verdict === '후보없음').length}`)
    console.log(`판정 기준: 거리 ≤ ${SUCC_CLEAR_M}m + 차수·단지 번호 일치 (이름 유사도는 ≥ ${SUCC_NAME_MIN} 필터로만)`)
    const bk = arg('backup')
    if (bk) { writeFileSync(bk, JSON.stringify({ at: new Date().toISOString(), props }, null, 2)); console.log(`📄 ${bk}`) }
    if (!has('fix-successors')) { console.log('\n(읽기 전용 — 넣으려면 --fix-successors --backup=<file>)'); return }
    if (!bk) throw new Error('--fix-successors 는 --backup=<file> 을 요구한다')
    console.log('\n🔴 명확 건에 successor_id 적용 중...')
    for (const p of clear) {
      const { error } = await sb.from('complexes').update({ successor_id: p.to }).eq('id', p.id)
      if (error) throw new Error(`${p.name} 실패: ${error.message}`)
      console.log(`  ✅ ${p.name} → ${p.toName}`)
    }
    console.log(`\n✅ ${clear.length}곳 적용. 애매·후보없음은 사람이 판정해야 한다.`)
    return
  }


  const from = arg('from'), into = arg('into')
  if (!from || !into) throw new Error('--from=<uuid> --into=<uuid> 필요 (또는 --audit-merged)')
  if (from === into) throw new Error('--from 과 --into 가 같다')
  const apply = has('apply')

  const { data: cf } = await sb.from('complexes').select('*').eq('id', from).maybeSingle()
  const { data: ct } = await sb.from('complexes').select('*').eq('id', into).maybeSingle()
  if (!cf) throw new Error(`--from 단지 없음: ${from}`)
  if (!ct) throw new Error(`--into 단지 없음: ${into}`)
  if (ct.status !== 'active') throw new Error(`--into 가 active 가 아니다 (${ct.status}) — 병합 대상으로 부적절`)

  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)
  console.log(`병합: "${cf.canonical_name}"[${cf.sgg_code}] (${cf.status}) → "${ct.canonical_name}"[${ct.sgg_code}]`)
  if (cf.sgg_code !== ct.sgg_code) console.log('⚠️ 시군구가 다르다 — 정말 같은 단지인지 확인할 것')

  const refs = await discoverRefs(url, key)
  console.log(`참조 컬럼 ${refs.length}곳 (라이브 카탈로그)`)
  const plans: TablePlan[] = []
  for (const { table, col } of refs) {
    const p = await planTable(sb, table, col, from, into)
    if (p.moveCount || p.drop.length) plans.push(p)
  }
  console.log('\n=== 재지정 계획 ===')
  for (const p of plans) {
    console.log(`  ${p.table.padEnd(28)} ${p.col.padEnd(18)} 이동 ${String(p.moveCount).padStart(6)} / 버림 ${String(p.drop.length).padStart(4)}${p.uniq ? (p.uniq.length ? `  [UNIQUE +${p.uniq.join(",")}]` : "  [UNIQUE complex_id 단독]") : ""}`)
  }
  const totMove = plans.reduce((a, p) => a + p.moveCount, 0)
  const totDrop = plans.reduce((a, p) => a + p.drop.length, 0)
  console.log(`  합계: 이동 ${totMove} / 버림 ${totDrop}`)
  console.log(`\n추가로 할 것: complex_aliases 에 "${cf.canonical_name}" 별칭 추가 · source status='merged' · successor_id 설정`)

  const backup = arg('backup')
  if (backup) {
    writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), from: cf, into: ct, plans }, null, 2))
    console.log(`📄 계획 저장: ${backup}`)
  }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 적용 중...')
  // 🔴 버림 먼저, 이동 나중. 충돌 행을 먼저 치워야 남은 행을 한 방에 옮길 수 있고,
  //    그래야 PK 를 알 필요가 없다(복합키 테이블도 같은 경로).
  for (const p of plans) {
    for (const key of p.drop) {
      const { error } = await sb.from(p.table).delete().eq(p.col, from).match(key)
      if (error) throw new Error(`${p.table} 삭제 실패: ${error.message}`)
    }
    const { error } = await sb.from(p.table).update({ [p.col]: into }).eq(p.col, from)
    if (error) throw new Error(`${p.table} 이동 실패: ${error.message}`)
    console.log(`  ✅ ${p.table}: 이동 ${p.moveCount} / 삭제 ${p.drop.length}`)
  }




  // 별칭 승계 — 이름으로 들어오는 거래가 target 을 찾게 한다
  const { error: aErr } = await sb.from('complex_aliases')
    .insert({ complex_id: into, alias_name: cf.canonical_name, source: 'merge' })
  if (aErr && aErr.code !== '23505') console.warn(`  ⚠️ 별칭 추가 실패(무시): ${aErr.message}`)
  else console.log(`  ✅ 별칭 "${cf.canonical_name}" → target`)

  // 이 단지를 가리키던 자기참조도 옮긴다
  for (const col of ['predecessor_id', 'successor_id']) {
    const { error } = await sb.from('complexes').update({ [col]: into }).eq(col, from)
    if (error) console.warn(`  ⚠️ complexes.${col} 재지정 실패: ${error.message}`)
  }

  // 🔴 successor_id 를 반드시 넣는다 — 없으면 신규 거래가 사라진 단지에 계속 붙는다
  const { error: sErr } = await sb.from('complexes')
    .update({ status: 'merged', successor_id: into }).eq('id', from)
  if (sErr) throw new Error(`source 상태 전이 실패: ${sErr.message}`)
  console.log(`  ✅ "${cf.canonical_name}" → status='merged', successor_id=target`)
  console.log('\n다음: 확정 지번 재계산이 필요하다 — gh workflow run refresh-price-stats.yml --ref main')
}

main().catch((e) => { console.error(`[merge] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
