/**
 * 단지 주소 정정 — 좌표를 역지오코딩해 진짜 주소를 넣는다 (2026-08-24)
 *
 * [무엇을 고치는가]
 * `audit-wholesale-mislink.ts` 가 `단지주소_오류` 로 판정한 단지들이다. 거래는 맞고
 * **단지의 등록 주소가 엉뚱하다** — 이름 같은 딴 도시 건물로 지오코딩된 결과다. 실측:
 *   센트럴시티[창원 성산구]   → `서울 서초구 반포동 19-3`
 *   대림파크맨션[마산회원구]   → `인천 연수구 청학동 564-3`
 *   한일사원[마산회원구]      → `충북 단양군 매포읍 평동리 16`
 * 화면에 그대로 뜨고 **JSON-LD `PostalAddress` 로 구글에도 나간다.**
 *
 * [왜 역지오코딩인가 — 정방향은 판별력이 없다]
 * `.planning/inbox/HANDOFF-bds-20260821.md` 의 교훈이다. 주소→좌표(정방향)는 도로 기준점을
 * 주므로 대단지에서 60~140m 차이가 정상이고 임계값을 잡을 수 없다. **좌표→주소(역방향)가
 * "이 핀이 실제로 어디에 꽂혀 있나" 를 답한다.** 한 번 호출로 지번·도로명을 다 얻는다.
 *
 * [좌표를 믿을 근거]
 * 이 목록은 판별기가 "좌표가 확정 지번 동 쪽에 있다 → 거래가 맞다" 로 분류한 것이다.
 * 즉 좌표는 거래와 일치하고 주소만 어긋난 상태다. 그래도 맹신하지 않고,
 * 역지오코딩 결과의 동이 **확정 지번의 동과 일치하는지** 교차검증해서 일치할 때만 고친다.
 *
 * 🔴 카카오 연속 재실행 금지 전례(2026-08-19)가 있어 호출 상한을 둔다.
 *
 * 실행:
 *   npx tsx scripts/fix-complex-address-by-reverse-geocode.ts --in=<audit json>
 *   npx tsx scripts/fix-complex-address-by-reverse-geocode.ts --in=... --exclude-sgg=48121
 *   npx tsx scripts/fix-complex-address-by-reverse-geocode.ts --in=... --apply --backup=b.json
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

/** 카카오 호출 상한 — 초과하면 멈춘다(연속 재실행 차단 전례 대응). */
const DEFAULT_MAX = 40
const DELAY_MS = 350

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const squash = (s: string | null) => (s ?? '').replace(/\s/g, '')

interface Plan {
  verdict: string; complex_id: string; name: string; sgg_code: string; status?: string
  canonical: string; tx_count: number; own_address: string | null
}
interface RevGeo { jibun: string; road: string | null; dong: string }

let lookups = 0
let halted = false

async function reverseGeocode(lat: number, lng: number, key: string): Promise<RevGeo | null> {
  if (halted) return null
  lookups++
  const u = new URL('https://dapi.kakao.com/v2/local/geo/coord2address.json')
  u.searchParams.set('x', String(lng))
  u.searchParams.set('y', String(lat))
  const r = await fetch(u.toString(), { headers: { Authorization: `KakaoAK ${key}` } })
  if (r.status === 429 || r.status === 403) {
    console.error(`\n🚫 카카오 한도/차단(${r.status}) — 즉시 중단한다. 재시도하지 않는다.`)
    halted = true
    return null
  }
  if (!r.ok) return null
  const j = await r.json() as {
    documents?: Array<{
      address?: { address_name?: string; region_3depth_name?: string }
      road_address?: { address_name?: string } | null
    }>
  }
  const d = j.documents?.[0]
  await new Promise((x) => setTimeout(x, DELAY_MS))
  if (!d?.address?.address_name) return null
  return {
    jibun: d.address.address_name,
    road: d.road_address?.address_name ?? null,
    dong: d.address.region_3depth_name ?? '',
  }
}

/** 확정 지번 문자열("가음동 22-4")에서 동만 떼어낸다. 동에 공백이 있을 수 있다. */
function canonDong(canonical: string): string {
  const i = canonical.lastIndexOf(' ')
  return i < 0 ? canonical : canonical.slice(0, i)
}

interface Row {
  p: Plan; lat: number; lng: number; rev: RevGeo
  agree: boolean; note: string; shared: number
}

/**
 * 이 좌표를 쓰는 다른 단지 수.
 *
 * 🔴 겹치면 역지오코딩을 믿을 수 없다. 지오코딩 실패 시 시청 같은 대표 좌표로 폴백된
 * 무리가 있고, 그 좌표를 역지오코딩하면 **폴백 지점의 주소**가 나온다. 실측:
 *   대림팰리스·한빛빌라4차 등 **10곳**이 35.22857,128.88936(김해대로 2401)을 공유
 *   한일사원 등 4곳이 35.22085,128.57971 을 공유
 * 동은 우연히 맞을 수 있어(같은 폴백 권역) 동 일치만으로는 안 걸러진다.
 */
async function sharedCoordCount(sb: SupabaseClient, id: string, lat: number, lng: number): Promise<number> {
  const { count } = await sb.from('complexes').select('id', { count: 'exact', head: true })
    .eq('lat', lat).eq('lng', lng).neq('id', id)
  return count ?? 0
}

async function build(sb: SupabaseClient, plans: Plan[], key: string, max: number): Promise<Row[]> {
  const out: Row[] = []
  for (const p of plans) {
    if (halted || lookups >= max) {
      console.log(`\n⏸ 호출 상한(${max}) 도달 또는 중단 — 남은 ${plans.length - out.length}곳은 다음 실행으로`)
      break
    }
    const { data: c } = await sb.from('complexes').select('lat,lng,status').eq('id', p.complex_id).maybeSingle()
    if (!c?.lat || !c?.lng) { console.log(`  ${p.name}: 좌표 없음 — 건너뜀`); continue }
    const rev = await reverseGeocode(c.lat as number, c.lng as number, key)
    if (!rev) { console.log(`  ${p.name}: 역지오코딩 실패`); continue }
    const want = squash(canonDong(p.canonical))
    const got = squash(rev.dong)
    const dongOk = !!want && !!got && (want === got || want.includes(got) || got.includes(want))
    const shared = await sharedCoordCount(sb, p.complex_id, c.lat as number, c.lng as number)
    const agree = dongOk && shared === 0
    const note = shared > 0
      ? `🔴 좌표를 ${shared}곳이 공유 — 지오코딩 폴백 가능성, 역지오코딩을 못 믿는다`
      : dongOk ? '확정 지번의 동과 일치' : `불일치: 확정 ${want} vs 역지오코딩 ${got}`
    out.push({ p, lat: c.lat as number, lng: c.lng as number, rev, agree, note, shared })
  }
  return out
}

async function main(): Promise<void> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY 필요')
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const inPath = arg('in')
  if (!inPath) throw new Error('--in=<audit-wholesale-mislink json> 필요')
  const max = Number(arg('max') ?? DEFAULT_MAX)
  const exclude = (arg('exclude-sgg') ?? '').split(',').filter(Boolean)
  const apply = has('apply')

  const j = JSON.parse(readFileSync(inPath, 'utf8')) as { plan: Plan[] }
  const plans = j.plan
    .filter((p) => p.verdict === '단지주소_오류')
    .filter((p) => !exclude.includes(p.sgg_code))
    .sort((a, b) => b.tx_count - a.tx_count)
  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)
  console.log(`대상 ${plans.length}곳 (단지주소_오류${exclude.length ? ` / ${exclude.join(',')} 제외` : ''}) / 호출 상한 ${max}`)

  const rows = await build(sb, plans, kakaoKey, max)

  console.log(`\n=== 역지오코딩 결과 ===`)
  for (const r of rows) {
    console.log(`\n  ${r.agree ? '✅' : '⚠️'} ${r.p.name}[${r.p.sgg_code}] 거래 ${r.p.tx_count}`)
    console.log(`     기존 등록  ${r.p.own_address ?? '(없음)'}`)
    console.log(`     핀 실제    ${r.rev.jibun}${r.rev.road ? `  /  ${r.rev.road}` : ''}`)
    console.log(`     확정 지번  ${r.p.canonical}  → ${r.note}`)
  }
  const ok = rows.filter((r) => r.agree)
  console.log(`\n일치 ${ok.length} / 불일치 ${rows.length - ok.length} / 카카오 호출 ${lookups}회${halted ? ' (중단)' : ''}`)

  const backup = arg('backup')
  if (backup) {
    writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2))
    console.log(`📄 ${backup}`)
  }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 일치 건만 적용 중...')
  for (const r of ok) {
    const { error } = await sb.from('complexes').update({
      jibun_address: r.rev.jibun,
      road_address: r.rev.road,
      dong: r.rev.dong || null,
    }).eq('id', r.p.complex_id)
    if (error) throw new Error(`${r.p.name} 실패: ${error.message}`)
    console.log(`  ✅ ${r.p.name} → ${r.rev.jibun}`)
  }
  console.log(`\n✅ ${ok.length}곳 적용. 불일치 ${rows.length - ok.length}곳은 사람이 봐야 한다.`)
  console.log('⚠️ url_slug 는 건드리지 않았다 — 기존 URL 이 깨진다. 별도 판단 필요.')
}

main().catch((e) => { console.error(`[fix-address] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
