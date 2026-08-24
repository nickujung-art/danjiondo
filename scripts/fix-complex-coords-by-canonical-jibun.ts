/**
 * 좌표 폴백 뭉치 정정 — 확정 지번으로 재지오코딩한다 (2026-08-24)
 *
 * [무엇을 고치는가]
 * 지오코딩이 실패한 단지들이 시청 같은 **대표 좌표 하나로 폴백**돼 뭉쳐 있다. 실측:
 *   35.228565,128.889363  **11곳** (김해대로 2401) — 코스마O.T·그라니아·한빛빌라4차 …
 *   35.254050,128.640105  **10곳** — 엠케이빌딩·리앤아이테르·유니빌 …
 *   35.133430,128.710188   6곳 · 35.196964,128.567859  6곳
 * 지도에서 서로를 가려 한 그룹에서 1곳만 보인다(운영권역 88곳이 가려져 있다).
 *
 * [왜 확정 지번이 근거인가]
 * 핸드오프 '주의' 는 자동 재지오코딩을 경고했다 — "원인이 이름 기반 매칭인데 같은
 * 방식으로 다시 돌리면 같은 오답" 이다. 맞다. 그래서 **이름을 쓰지 않는다.**
 * `complex_canonical_jibun`(거래 다수결로 도출한 확정 지번)을 지오코딩한다.
 * 거래가 근거이므로 이름 오답의 함정을 우회한다.
 *
 * [폴백 뭉치만 대상으로 삼는 이유]
 * 같은 좌표를 쓰는 무리에는 두 종류가 있다:
 *   ① 폴백 뭉치 — 이름이 서로 무관한데 한 점에 몰렸다. **결함이다**
 *   ② 같은 단지군 — 금강빌라 가·나·다·라동, 풍림 1·2·3차. 실제로 같은 부지일 수 있다
 * ②를 건드리면 멀쩡한 좌표를 흩는다. 그룹 크기 하한(기본 3)으로 ①에 가깝게 좁히고,
 * 이름이 서로 닮은 그룹은 건너뛴다.
 *
 * 🔴 카카오 연속 재실행 금지 전례(2026-08-19)가 있어 호출 상한을 둔다.
 *
 * 실행:
 *   npx tsx scripts/fix-complex-coords-by-canonical-jibun.ts
 *   npx tsx scripts/fix-complex-coords-by-canonical-jibun.ts --busan --min-group=2
 *   npx tsx scripts/fix-complex-coords-by-canonical-jibun.ts --apply --backup=b.json
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

/** 시군구 코드 → 주소 접두. 지번만으로는 전국에 같은 이름이 많아 반드시 붙인다. */
const SGG_PREFIX: Record<string, string> = {
  '48121': '경남 창원시 의창구', '48123': '경남 창원시 성산구',
  '48125': '경남 창원시 마산합포구', '48127': '경남 창원시 마산회원구',
  '48129': '경남 창원시 진해구', '48250': '경남 김해시',
  '26110': '부산 중구', '26140': '부산 서구', '26170': '부산 동구', '26200': '부산 영도구',
  '26230': '부산 부산진구', '26260': '부산 동래구', '26290': '부산 남구', '26320': '부산 북구',
  '26350': '부산 해운대구', '26380': '부산 사하구', '26410': '부산 금정구', '26440': '부산 강서구',
  '26470': '부산 연제구', '26500': '부산 수영구', '26530': '부산 사상구', '26710': '부산 기장군',
}

/** 이 크기 이상 뭉친 그룹만 폴백으로 본다. 2곳은 같은 부지인 경우가 흔하다. */
const DEFAULT_MIN_GROUP = 3
/** 그룹 안에서 이름이 이만큼 닮았으면 '같은 단지군' 으로 보고 건너뛴다. */
const KIN_NAME_SIM = 0.55
/** 새 좌표가 그 시군구 중심에서 이만큼 넘게 떨어지면 믿지 않는다. */
const MAX_FROM_SGG_CENTER_M = 25_000
/** 카카오 호출 상한. */
const DEFAULT_MAX = 40
const DELAY_MS = 350

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]

interface Cx {
  id: string; canonical_name: string; sgg_code: string; status: string
  lat: number | null; lng: number | null; dong: string | null; jibun_address: string | null
}
interface Canon { complex_id: string; umd_nm: string | null; jibun: string | null }

const squash = (s: string | null) => (s ?? '').replace(/\s/g, '')

/** 단지가 스스로 밝히는 법정동. audit-wholesale-mislink 의 ownDong 과 같은 규칙. */
function ownDong(c: Cx): string {
  if (c.jibun_address) {
    const parts = c.jibun_address.trim().split(/\s+/)
    const tail = parts.slice(1, -1).filter((p) => /[동리가읍면]$/.test(p))
    if (tail.length) return tail.join('')
  }
  return squash(c.dong)
}

function dongMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  const A = squash(a), B = squash(b)
  return A === B || A.includes(B) || B.includes(A)
}

const EARTH_R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
function metres(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_R * Math.asin(Math.sqrt(h)))
}

let lookups = 0
let halted = false

async function geocode(query: string, key: string): Promise<[number, number] | null> {
  if (halted) return null
  lookups++
  const u = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  u.searchParams.set('query', query)
  const r = await fetch(u.toString(), { headers: { Authorization: `KakaoAK ${key}` } })
  if (r.status === 429 || r.status === 403) {
    console.error(`\n🚫 카카오 한도/차단(${r.status}) — 즉시 중단한다. 재시도하지 않는다.`)
    halted = true
    return null
  }
  if (!r.ok) return null
  const j = await r.json() as { documents?: { y: string; x: string }[] }
  const d = j.documents?.[0]
  await new Promise((x) => setTimeout(x, DELAY_MS))
  return d ? [parseFloat(d.y), parseFloat(d.x)] : null
}

/** 🔴 정렬 컬럼을 명시로 받는다 — `complex_canonical_jibun` 은 `id` 가 없고 `complex_id` 가 PK 다. */
async function loadAll<T>(
  sb: SupabaseClient, table: string, cols: string, scope: string[] | null, orderBy: string,
): Promise<T[]> {
  const out: T[] = []
  for (let p = 0; ; p++) {
    let q = sb.from(table).select(cols).order(orderBy).range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data as unknown as T[]))
    if (data.length < 1000) break
  }
  return out
}

/** 이름이 서로 닮은 무리인가 — '같은 단지군' 판정. */
function isKinGroup(members: Cx[]): boolean {
  let pairs = 0, kin = 0
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      pairs++
      if (nameSim(members[i].canonical_name, members[j].canonical_name) >= KIN_NAME_SIM) kin++
    }
  }
  return pairs > 0 && kin / pairs >= 0.5
}

interface Row {
  id: string; name: string; sgg_code: string; groupSize: number
  from: [number, number]; canonical: string
  to?: [number, number]; movedM?: number; skip?: string
}

async function main(): Promise<void> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY 필요')
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const scope = has('busan') ? BUSAN_SGG : CORE_SGG
  const exclude = (arg('exclude-sgg') ?? '').split(',').filter(Boolean)
  const minGroup = Number(arg('min-group') ?? DEFAULT_MIN_GROUP)
  const max = Number(arg('max') ?? DEFAULT_MAX)
  const apply = has('apply')

  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)
  console.log(`📍 ${scope.join(',')}${exclude.length ? ` (${exclude.join(',')} 제외)` : ''} / 그룹 하한 ${minGroup} / 호출 상한 ${max}`)

  const cxs = await loadAll<Cx>(sb, 'complexes', 'id,canonical_name,sgg_code,status,lat,lng,dong,jibun_address', scope, 'id')
  const canon = await loadAll<Canon>(sb, 'complex_canonical_jibun', 'complex_id,umd_nm,jibun', scope, 'complex_id')
  const cj = new Map(canon.map((c) => [c.complex_id, c]))
  const active = cxs.filter((c) => c.status === 'active' && c.lat != null && c.lng != null && !exclude.includes(c.sgg_code))

  // 시군구 중심 — 겹치지 않는 단지들로만 계산한다(폴백 좌표가 중심을 끌어당기지 않게).
  const coordCount = new Map<string, number>()
  for (const c of active) coordCount.set(`${c.lat},${c.lng}`, (coordCount.get(`${c.lat},${c.lng}`) ?? 0) + 1)
  const center = new Map<string, [number, number]>()
  for (const s of scope) {
    const solo = active.filter((c) => c.sgg_code === s && coordCount.get(`${c.lat},${c.lng}`) === 1)
    if (!solo.length) continue
    center.set(s, [solo.reduce((a, c) => a + c.lat!, 0) / solo.length, solo.reduce((a, c) => a + c.lng!, 0) / solo.length])
  }

  const groups = new Map<string, Cx[]>()
  for (const c of active) {
    const k = `${c.lat},${c.lng}`
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  const targets = [...groups.entries()].filter(([, v]) => v.length >= minGroup).sort((a, b) => b[1].length - a[1].length)
  console.log(`   겹침 그룹 ${targets.length}개 / ${targets.reduce((a, [, v]) => a + v.length, 0)}곳`)

  const rows: Row[] = []
  const taken = new Set(active.map((c) => `${c.lat!.toFixed(6)},${c.lng!.toFixed(6)}`))

  for (const [k, members] of targets) {
    if (isKinGroup(members)) {
      console.log(`\n  ⏭ ${k} ${members.length}곳 — 이름이 서로 닮은 '같은 단지군' 이라 건너뛴다`)
      console.log(`     ${members.map((m) => m.canonical_name).join(', ')}`)
      continue
    }
    console.log(`\n  🔴 ${k} ${members.length}곳 (폴백 의심)`)
    for (const m of members) {
      if (halted || lookups >= max) { console.log(`     ⏸ 호출 상한 — 남은 건 다음 실행으로`); break }
      const c = cj.get(m.id)
      if (!c?.jibun) { console.log(`     - ${m.canonical_name}: 확정 지번 없음 — 건너뜀`); continue }
      // 🔴 등록 주소의 동이 확정 지번의 동과 **일치할 때만** 옮긴다.
      //
      // 확정 지번은 거래 다수결이라 **거래가 오연결이면 남의 지번**이다. 그리로 좌표를
      // 옮기면 단지를 남의 자리로 보낸다. 실측: 한아름맨션·뜨란채빌·대동시티빌·대우사원·
      // 태주실업 5곳이 `audit-wholesale-mislink` 의 `거래_오연결` 목록과 겹쳤다.
      //
      // 그런데 그 감사의 판별기도 여기서는 못 믿는다 — **판별에 쓰는 좌표가 바로 이
      // 폴백 좌표**이기 때문이다(순환). 그래서 좌표를 안 쓰는 독립 근거, 즉 단지가
      // 스스로 밝히는 동과 대조한다. 두 근거가 일치할 때만 움직인다.
      const own = ownDong(m)
      if (!dongMatches(own, c.umd_nm ?? '')) {
        rows.push({
          id: m.id, name: m.canonical_name, sgg_code: m.sgg_code, groupSize: members.length,
          from: [m.lat!, m.lng!], canonical: `${c.umd_nm ?? ''} ${c.jibun}`.trim(),
          skip: `등록 동(${own || '없음'}) ≠ 확정 동(${c.umd_nm}) — 거래 오연결 가능성`,
        })
        console.log(`     ⚠️ ${m.canonical_name}: 등록 동 ${own || '없음'} ≠ 확정 동 ${c.umd_nm} — 건너뜀`)
        continue
      }
      const canonical = `${c.umd_nm ?? ''} ${c.jibun}`.trim()
      const q = `${SGG_PREFIX[m.sgg_code] ?? ''} ${canonical}`.trim()
      const pos = await geocode(q, kakaoKey)
      const row: Row = { id: m.id, name: m.canonical_name, sgg_code: m.sgg_code, groupSize: members.length, from: [m.lat!, m.lng!], canonical }
      if (!pos) { row.skip = '지오코딩 미검출'; rows.push(row); console.log(`     - ${m.canonical_name}: "${q}" 미검출`); continue }
      const ctr = center.get(m.sgg_code)
      const dCtr = ctr ? metres(pos, ctr) : null
      if (dCtr != null && dCtr > MAX_FROM_SGG_CENTER_M) {
        row.skip = `시군구 중심에서 ${dCtr}m — 믿지 않는다`
        rows.push(row); console.log(`     ⚠️ ${m.canonical_name}: 시군구 중심에서 ${dCtr}m 떨어짐 — 건너뜀`); continue
      }
      const nk = `${pos[0].toFixed(6)},${pos[1].toFixed(6)}`
      if (taken.has(nk)) {
        row.skip = '새 좌표가 다른 단지와 또 겹친다'
        rows.push(row); console.log(`     ⚠️ ${m.canonical_name}: 새 좌표가 또 겹침 — 건너뜀`); continue
      }
      taken.add(nk)
      row.to = pos
      row.movedM = metres(row.from, pos)
      rows.push(row)
      console.log(`     ✅ ${m.canonical_name} ← ${canonical}: ${row.movedM}m 이동 → ${pos.map((v) => v.toFixed(5)).join(',')}`)
    }
  }

  const ok = rows.filter((r) => r.to)
  console.log(`\n이동 가능 ${ok.length} / 건너뜀 ${rows.length - ok.length} / 카카오 호출 ${lookups}회${halted ? ' (중단)' : ''}`)

  const backup = arg('backup')
  if (backup) { writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2)); console.log(`📄 ${backup}`) }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 적용 중...')
  for (const r of ok) {
    const { error } = await sb.from('complexes').update({ lat: r.to![0], lng: r.to![1] }).eq('id', r.id)
    if (error) throw new Error(`${r.name} 실패: ${error.message}`)
    console.log(`  ✅ ${r.name} → ${r.to!.map((v) => v.toFixed(5)).join(',')}`)
  }
  console.log(`\n✅ ${ok.length}곳 좌표 정정. location 컬럼은 lat/lng 로부터 자동 생성된다(generated always).`)
}

main().catch((e) => { console.error(`[fix-coords] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
