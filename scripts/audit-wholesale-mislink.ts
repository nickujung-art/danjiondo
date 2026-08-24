/**
 * 전건 오연결 감사 — 한 단지의 거래가 통째로 남의 지번인 경우를 찾는다 (2026-08-24)
 *
 * [왜 새 축이 필요한가]
 * `relink-transactions-by-jibun.ts` 는 **소수 오염**을 잡는다. 단지별 다수 지번을 구한 뒤
 * 거기서 벗어난 거래를 옮긴다. 그래서 다음을 **구조적으로 못 본다**:
 *
 *   거래 100%가 남의 지번이면 → 그 남의 지번이 곧 '다수 지번'이 된다 → 벗어난 거래가 없다
 *
 * 실측(2026-08-24): `1차동원`(등록 주소 구산동 1052-3)에 붙은 거래 73건이 **전부**
 * 지내동 67 이다. 5,703m 떨어진 곳이고, 같은 지번을 `지내동원1차A`(325건)도 갖는다.
 * relink 는 이 단지를 '다수 지번 지내동 67 로 확정' 하고 그냥 넘어간다.
 *
 * [그래서 무엇을 근거로 삼나]
 * 거래가 아니라 **단지 자신의 등록 주소**다. 두 근거가 독립이어야 대조가 성립한다.
 *
 *   확정 지번의 동 (거래 다수결)  vs  단지 등록 주소의 동 (jibun_address 또는 dong)
 *
 * 둘이 어긋나면 전건 오연결 후보다. relink 의 헤더 주석이 `complexes.jibun_address` 를
 * "교차검증에만 쓴다"고 적었으나 본문에 구현돼 있지 않았다 — 그 빈자리를 메운다.
 *
 * [왜 자동으로 고치지 않나]
 * 이 스크립트는 **읽기 전용**이다. 큰 단지는 여러 법정동에 걸친다(대동다숲 원계리/삼계리 =
 * 카카오 실측 0m). 동이 어긋난다고 곧 오연결은 아니다. 판정은 거리로 해야 하고 그건
 * `verify-tx-jibun-kakao.ts` 소관이다. 여기서는 **후보와 이동 목표를 제시**만 한다.
 *
 * 실행:
 *   npx tsx scripts/audit-wholesale-mislink.ts                 # 운영권역
 *   npx tsx scripts/audit-wholesale-mislink.ts --busan
 *   npx tsx scripts/audit-wholesale-mislink.ts --out=plan.json
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { nameSim } from '../src/lib/data/name-similarity'

const CORE_SGG = ['48121', '48123', '48125', '48127', '48129', '48250']
const BUSAN_SGG = [
  '26110', '26140', '26170', '26200', '26230', '26260', '26290', '26320',
  '26350', '26380', '26410', '26440', '26470', '26500', '26530', '26710',
]

/** 이동 목표로 제시하려면 거래 원본명과 이 유사도 이상이어야 한다. relink 와 같은 하한. */
const NAME_SIM_MIN = 0.3

interface Cx {
  id: string; canonical_name: string; sgg_code: string; status: string
  dong: string | null; jibun_address: string | null; road_address: string | null
  lat: number | null; lng: number | null; household_count: number | null
}
interface Canon {
  complex_id: string; sgg_code: string; umd_nm: string | null; jibun: string | null
  tx_count: number; total_count: number; ratio: number
}

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]

/** 공백을 걷어낸 비교용 키. '진동면 진동리' 와 '진동리' 를 같게 보려면 포함 비교가 필요하다. */
const squash = (s: string | null) => (s ?? '').replace(/\s/g, '')

/**
 * 단지가 스스로 밝히는 법정동. jibun_address 를 우선한다 — 지번까지 들어 있어 근거가 강하다.
 * 없으면 dong 컬럼으로 내려간다(운영권역 커버리지 jibun 60% vs dong 95%).
 */
function ownDong(c: Cx): { dong: string; axis: 'jibun_address' | 'dong' } | null {
  if (c.jibun_address) {
    // '경남 김해시 구산동 1052-3' → 시도·지번을 뺀 가운데에서 동/리/읍/면 토큰만 취한다.
    const parts = c.jibun_address.trim().split(/\s+/)
    const tail = parts.slice(1, -1).filter((p) => /[동리가읍면]$/.test(p))
    if (tail.length) return { dong: tail.join(''), axis: 'jibun_address' }
  }
  if (c.dong) return { dong: squash(c.dong), axis: 'dong' }
  return null
}

/** 두 동 표기가 같은 곳을 가리키는가. 한쪽이 다른 쪽을 포함하면 같다고 본다. */
function dongMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  const A = squash(a), B = squash(b)
  return A === B || A.includes(B) || B.includes(A)
}

async function loadAll<T>(sb: SupabaseClient, table: string, cols: string, scope: string[] | null): Promise<T[]> {
  const out: T[] = []
  for (let p = 0; ; p++) {
    let q = sb.from(table).select(cols).range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`${table}(page ${p}): ${error.message}`)
    out.push(...(data as unknown as T[]))
    if (data.length < 1000) break
  }
  return out
}

/** 이 단지에 붙은 거래의 최빈 원본명 — 이동 목표를 고를 때 이름 근거로 쓴다. */
async function topRawName(sb: SupabaseClient, complexId: string): Promise<string> {
  const { data } = await sb.from('transactions').select('raw_complex_name')
    .eq('complex_id', complexId).is('cancel_date', null).is('superseded_by', null).limit(1000)
  const m = new Map<string, number>()
  for (const t of data ?? []) {
    const n = t.raw_complex_name ?? ''
    m.set(n, (m.get(n) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

const EARTH_R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
function metres(a: Cx, b: Cx): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_R * Math.asin(Math.sqrt(h)))
}

/**
 * 동 불일치의 원인은 둘인데 겉모습이 같다. 좌표가 그 둘을 가른다.
 *
 *   ① 거래가 틀림 — 단지는 제자리에 있고, 남의 동 거래가 통째로 붙었다
 *   ② 단지 주소가 틀림 — 거래는 맞고, 단지의 등록 주소가 엉뚱한 곳이다
 *      (실측: `센트럴시티`[창원 성산구]의 jibun_address 가 `서울 서초구 반포동 19-3`)
 *
 * ②는 핸드오프 P2(주소가 딴 도시)와 같은 결함이다. 구별 없이 거래를 옮기면 ②에서
 * **멀쩡한 연결을 파괴한다.** 판별자는 단지 좌표가 어느 동 쪽에 있느냐다.
 *
 * 카카오 없이 재는 법: 같은 시군구에서 그 동에 등록된 다른 단지들의 좌표 중심.
 * 역지오코딩 한 번 없이 클러스터만으로 갈린다.
 */
type Verdict = '거래_오연결' | '단지주소_오류' | '판정불가'

/** 동별 좌표 중심 — 같은 시군구·같은 동에 등록된 활성 단지들의 평균. */
function dongCentroids(cxs: Cx[]): Map<string, { lat: number; lng: number; n: number }> {
  const acc = new Map<string, { lat: number; lng: number; n: number }>()
  for (const c of cxs) {
    if (c.status !== 'active' || c.lat == null || c.lng == null) continue
    const od = ownDong(c)
    if (!od) continue
    const k = `${c.sgg_code}|${od.dong}`
    const p = acc.get(k) ?? { lat: 0, lng: 0, n: 0 }
    acc.set(k, { lat: p.lat + c.lat, lng: p.lng + c.lng, n: p.n + 1 })
  }
  for (const [k, v] of acc) acc.set(k, { lat: v.lat / v.n, lng: v.lng / v.n, n: v.n })
  return acc
}

/**
 * 동 클러스터 중심에서 이 거리를 넘으면 '그 동에 있다'고 말할 수 없다.
 * 상한이 없으면 `경남`[마산합포구] 처럼 확정동에서 12km 떨어진 단지도 '주소가 딴 도시'로
 * 확정돼 버린다 — 실제로는 좌표·주소·거래 중 둘 이상이 틀린 경우라 사람이 봐야 한다.
 */
const MAX_DONG_RADIUS_M = 3000

/** 좌표가 어느 쪽 동에 붙어 있는지로 원인을 가른다. 한쪽이 다른 쪽의 절반 이내여야 확정. */
function classify(
  c: Cx,
  ownKey: string,
  canonKey: string,
  cent: Map<string, { lat: number; lng: number; n: number }>,
): { verdict: Verdict; dOwn: number | null; dCanon: number | null; why: string } {
  const at = (k: string, self: boolean) => {
    const v = cent.get(k)
    if (!v || c.lat == null || c.lng == null) return null
    // 자기 자신만 있는 클러스터는 근거가 못 된다.
    if (self && v.n <= 1) return null
    return metres(c, { lat: v.lat, lng: v.lng } as Cx)
  }
  const dOwn = at(ownKey, true)
  const dCanon = at(canonKey, false)
  const near = (d: number | null) => d != null && d <= MAX_DONG_RADIUS_M
  if (dOwn == null && dCanon != null) {
    return near(dCanon)
      ? { verdict: '단지주소_오류' as Verdict, dOwn, dCanon, why: '등록 주소의 동이 이 시군구에 없다 — 주소가 딴 도시' }
      : { verdict: '판정불가' as Verdict, dOwn, dCanon, why: `등록 동이 시군구 밖인데 확정 동에서도 ${dCanon}m — 좌표까지 의심스럽다` }
  }
  if (dOwn == null || dCanon == null) return { verdict: '판정불가', dOwn, dCanon, why: '좌표 클러스터 부족' }
  if (!near(dOwn) && !near(dCanon)) {
    return { verdict: '판정불가', dOwn, dCanon, why: '양쪽 동 어디에서도 멀다 — 좌표가 틀렸을 수 있다' }
  }
  if (near(dCanon) && dCanon * 2 < dOwn) return { verdict: '단지주소_오류', dOwn, dCanon, why: '좌표가 확정 지번 동 쪽에 있다 — 거래가 맞다' }
  if (near(dOwn) && dOwn * 2 < dCanon) return { verdict: '거래_오연결', dOwn, dCanon, why: '좌표가 등록 주소 동 쪽에 있다 — 거래가 남의 것이다' }
  return { verdict: '판정불가', dOwn, dCanon, why: '두 동이 비슷하게 가깝다 — 경계 단지일 수 있다' }
}

/** 동별 활성 단지 색인 — 이동 목표 후보를 찾을 때 쓴다. */
function indexByDong(cxs: Cx[]): Map<string, Cx[]> {
  const byDong = new Map<string, Cx[]>()
  for (const c of cxs) {
    if (c.status !== 'active') continue
    const od = ownDong(c)
    if (!od) continue
    const k = `${c.sgg_code}|${od.dong}`
    byDong.set(k, [...(byDong.get(k) ?? []), c])
  }
  return byDong
}

/**
 * 그 동에 등록된 단지들. **포함 비교**로 찾는다 — 정확 일치는 읍·면을 놓친다.
 * 거래의 동은 리까지(`정관읍 용수리`), 단지의 dong 은 읍까지(`정관읍`)인 경우가 흔하다.
 */
function candidatesInDong(byDong: Map<string, Cx[]>, sgg: string, umd: string | null): Cx[] {
  const want = squash(umd)
  if (!want) return []
  const out: Cx[] = []
  for (const [k, list] of byDong) {
    const [s, d] = k.split('|')
    if (s === sgg && dongMatches(d, want)) out.push(...list)
  }
  return out
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const scope = has('busan') ? BUSAN_SGG : has('all') ? null : CORE_SGG
  console.log(`🔗 ${url}`)
  console.log(`📍 ${scope ? scope.join(',') : '전역'} / 읽기 전용`)

  const cxs = await loadAll<Cx>(sb, 'complexes',
    'id, canonical_name, sgg_code, status, dong, jibun_address, road_address, lat, lng, household_count', scope)
  const cxById = new Map(cxs.map((c) => [c.id, c]))
  const canon = await loadAll<Canon>(sb, 'complex_canonical_jibun',
    'complex_id, sgg_code, umd_nm, jibun, tx_count, total_count, ratio', scope)
  console.log(`   단지 ${cxs.length.toLocaleString()} / 확정 지번 ${canon.length.toLocaleString()}`)

  const byDong = indexByDong(cxs)
  const cent = dongCentroids(cxs)

  const suspects: Canon[] = []
  const skipped = { 근거없음: 0, 제외상태: 0 }
  let matched = 0
  let mergedSeen = 0
  for (const cj of canon) {
    const c = cxById.get(cj.complex_id)
    if (!c) continue
    // 🔴 `active` 만 보면 안 된다 — 2026-08-24 에 이 필터가 정확히 사각지대였다.
    // `merged` 단지에 거래가 남아 있으면 화면에 안 나오는데도 감사에 안 잡혀,
    // 5곳(거래 51건)이 여태 보이지 않았다. 그중 4곳은 거래가 아니라 **단지 레코드**가
    // 틀린 것이었고(등록 주소가 경기 양주·상남동 71-3 등) 살릴 수 있었다.
    // `demolished`·`out_of_region` 은 의도적으로 제외한다 — 매칭 RPC 도 그 둘만 뺀다.
    if (c.status === 'demolished' || c.status === 'out_of_region') { skipped.제외상태++; continue }
    if (c.status === 'merged') mergedSeen++
    const od = ownDong(c)
    if (!od) { skipped.근거없음++; continue }
    if (dongMatches(od.dong, cj.umd_nm ?? '')) { matched++; continue }
    suspects.push(cj)
  }

  console.log(`\n=== 대조 ===`)
  console.log(`  동 일치        ${matched.toLocaleString()}`)
  console.log(`  🔴 동 불일치   ${suspects.length.toLocaleString()}  ← 전건 오연결 후보`)
  console.log(`  판정 불가      ${JSON.stringify(skipped)}`)
  if (mergedSeen) {
    console.log(`  ℹ️ merged 단지 ${mergedSeen}곳도 검사했다 — 화면에 안 나오지만 거래가 남아 있으면`)
    console.log(`     '연결됨' 으로 집계돼 연결률을 과대평가한다. merge-complexes.ts --audit-merged 참조`)
  }

  suspects.sort((a, b) => b.tx_count - a.tx_count)
  const plan: { verdict: Verdict; tx_count: number; [k: string]: unknown }[] = []
  for (const cj of suspects) {
    const c = cxById.get(cj.complex_id)
    if (!c) continue
    const od = ownDong(c)
    if (!od) continue
    const raw = await topRawName(sb, c.id)
    // 🔴 정확 일치로 찾으면 읍·면 단지를 통째로 놓친다.
    // 거래의 동은 `정관읍 용수리`(리까지), 단지의 dong 은 `정관읍`(읍까지)이라 키가 안 맞는다.
    // 그래서 `정관이진캐스빌2차아파트` 가 DB 에 있는데도 "이동 목표 없음" 으로 나왔다
    // (2026-08-24 부산 감사에서 실제로 겪음). 판정에 쓰는 dongMatches 와 같은 포함 비교를 쓴다.
    const cands = candidatesInDong(byDong, cj.sgg_code, cj.umd_nm)
      .filter((t) => t.id !== c.id)
      .map((t) => ({ cx: t, sim: nameSim(raw, t.canonical_name), m: metres(c, t) }))
      .filter((x) => x.sim >= NAME_SIM_MIN)
      .sort((a, b) => b.sim - a.sim)
    const cls = classify(c, `${c.sgg_code}|${od.dong}`, `${cj.sgg_code}|${squash(cj.umd_nm)}`, cent)

    plan.push({
      verdict: cls.verdict, complex_id: c.id, name: c.canonical_name, sgg_code: c.sgg_code, status: c.status,
      own_dong: od.dong, own_axis: od.axis, own_address: c.jibun_address ?? c.road_address,
      canonical: `${cj.umd_nm} ${cj.jibun}`, tx_count: cj.tx_count, raw_name: raw,
      d_own_m: cls.dOwn, d_canon_m: cls.dCanon, why: cls.why,
      candidates: cands.slice(0, 3).map((x) => ({ id: x.cx.id, name: x.cx.canonical_name, sim: +x.sim.toFixed(2), metres: x.m })),
    })
  }

  const tally = { 거래_오연결: 0, 단지주소_오류: 0, 판정불가: 0 }
  for (const p of plan) tally[p.verdict] += p.tx_count
  console.log(`\n=== 원인 판별 (좌표 클러스터) ===`)
  for (const v of ['거래_오연결', '단지주소_오류', '판정불가'] as Verdict[]) {
    const n = plan.filter((p) => p.verdict === v).length
    console.log(`  ${v.padEnd(14)}  단지 ${String(n).padStart(3)}곳 / 거래 ${tally[v].toLocaleString()}건`)
  }

  for (const v of ['거래_오연결', '판정불가', '단지주소_오류'] as Verdict[]) {
    const rows = plan.filter((p) => p.verdict === v)
    if (!rows.length) continue
    console.log(`\n=== ${v} — 상위 ${Math.min(15, rows.length)} / ${rows.length}곳 ===`)
    for (const p of rows.slice(0, 15)) {
      const cands = p.candidates as { name: string; sim: number; metres: number | null }[]
      const st = p.status === 'active' ? '' : ` ⚠️(${p.status})`
      console.log(`\n  ${p.name}  [${p.sgg_code}]${st}  거래 ${p.tx_count}건`)
      console.log(`     등록 ${p.own_dong} (${p.own_axis}) ↔ 확정 ${p.canonical}`)
      console.log(`     좌표거리  등록동 ${p.d_own_m ?? '?'}m / 확정동 ${p.d_canon_m ?? '?'}m — ${p.why}`)
      console.log(cands.length
        ? `     이동 목표  ${cands.map((x) => `${x.name}(유사${x.sim}, ${x.metres}m)`).join(' | ')}`
        : `     ⚠️ 이동 목표 없음`)
    }
  }

  const out = arg('out')
  if (out) {
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), scope, plan }, null, 2))
    console.log(`\n📄 ${out}`)
  }
  console.log(`\n(읽기 전용 — 아무것도 바꾸지 않았다. 이동 전 카카오 거리 검증: verify-tx-jibun-kakao.ts)`)
}

main().catch((e) => { console.error(`[audit-wholesale] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
