/**
 * 네이버 지역검색으로 단지 위치를 확정한다 — 좌표·주소 둘 다 쓰레기인 건용 (2026-08-24)
 *
 * [왜 네이버인가 — 카카오와 답하는 질문이 다르다]
 *   카카오 지오코딩   "이 **지번**이 어디냐"
 *   네이버 지역검색   **"그 이름의 건물이 실제로 어디 있냐"**
 * 후자가 필요한 국면이 있다. 2026-08-24 실측으로 카카오만으로는 못 풀고 네이버로 푼 건:
 *   상남오피스텔  → `상남동 1-2 / 원이대로 648` 실재 확인 (등록은 상남동 71-3 로 틀렸다)
 *   대우그린      → `대우그린빌라`(삼정동 88-5) + `대우그린2차빌라`(삼정동 247) **두 단지**로 갈렸다
 *
 * [무엇을 대상으로 삼나 — 좌표·주소 둘 다 못 믿는 무리]
 * 지오코딩이 실패한 단지는 **좌표가 대표 지점으로 폴백되고 주소는 동명이 딴 도시 것**으로
 * 채워진다. 같은 원인의 두 증상이다. 실측(운영권역):
 *   대림팰리스 공도읍마정리(경기 안성) · 동원하우스 운서동(인천) · 경인빌라 화곡동(서울)
 *   한일사원 매포읍평동리(충북) · 대동시티빌 온산읍덕신리(울산) · 태주실업 삼성동(서울)
 * 이런 단지엔 좌표·주소 어느 쪽도 근거가 못 되고, `complex_canonical_jibun`(거래 다수결)
 * 하나만 남는다. 그런데 거래가 오연결이면 그것도 틀린다 — **독립 근거가 하나 더 필요하다.**
 * 네이버가 그 세 번째 근거다.
 *
 * [판정 규칙]
 * 네이버가 준 주소의 동이 확정 지번의 동과 **일치할 때만** 고친다. 두 독립 근거(거래 ·
 * 네이버)가 같은 곳을 가리키는 것이므로, 폴백 좌표나 딴 도시 주소를 근거로 쓰지 않는다.
 * 일치하면 좌표·지번주소·도로명주소·동을 네이버 값으로 한 번에 정정한다.
 *
 * 🔴 네이버 검색은 이름으로 찾으므로 **동명이인 위험**이 있다. 그래서 질의에 시군구를
 *    붙이고, 결과 중 그 시군구 안에 있는 항목만 본다. 그래도 확정 동과 어긋나면 버린다.
 *
 * 실행:
 *   npx tsx scripts/resolve-complex-by-naver-local.ts --in=<audit json>
 *   npx tsx scripts/resolve-complex-by-naver-local.ts --ids=<uuid,uuid,...>
 *   npx tsx scripts/resolve-complex-by-naver-local.ts --in=... --apply --backup=b.json
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

/** 시군구 코드 → 질의에 붙일 지역명, 그리고 결과 주소가 이걸 포함해야 한다. */
const SGG_NAME: Record<string, string> = {
  '48121': '창원시 의창구', '48123': '창원시 성산구', '48125': '창원시 마산합포구',
  '48127': '창원시 마산회원구', '48129': '창원시 진해구', '48250': '김해시',
  '26110': '부산 중구', '26140': '부산 서구', '26170': '부산 동구', '26200': '부산 영도구',
  '26230': '부산진구', '26260': '부산 동래구', '26290': '부산 남구', '26320': '부산 북구',
  '26350': '해운대구', '26380': '사하구', '26410': '금정구', '26440': '강서구',
  '26470': '연제구', '26500': '수영구', '26530': '사상구', '26710': '기장군',
}

/** 네이버 API 호출 상한 — 일 25,000회지만 폭주를 막는다. */
const DEFAULT_MAX = 40
const DELAY_MS = 200

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const squash = (s: string | null) => (s ?? '').replace(/\s/g, '')
const stripTag = (s: string) => s.replace(/<[^>]*>/g, '')

interface NaverItem { title: string; address: string; roadAddress: string; mapx: string; mapy: string; category: string }

async function naverLocal(query: string, id: string, secret: string): Promise<NaverItem[]> {
  const u = new URL('https://openapi.naver.com/v1/search/local.json')
  u.searchParams.set('query', query)
  u.searchParams.set('display', '5')
  const r = await fetch(u.toString(), { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } })
  await new Promise((x) => setTimeout(x, DELAY_MS))
  if (!r.ok) return []
  const j = await r.json() as { items?: NaverItem[] }
  return j.items ?? []
}

/** 네이버 mapx/mapy 는 WGS84 × 10^7 이다. */
const toCoord = (it: NaverItem): [number, number] => [Number(it.mapy) / 1e7, Number(it.mapx) / 1e7]

/** 주소 문자열에서 동/리/가 토큰을 뽑는다. '경상남도 창원시 성산구 상남동 1-2' → '상남동' */
function dongOf(addr: string): string {
  const parts = addr.trim().split(/\s+/)
  const tail = parts.filter((p) => /[동리가읍면]$/.test(p) && !/^(창원시|김해시)$/.test(p))
  return tail.length ? tail[tail.length - 1]! : ''
}

/** 확정 지번 문자열("가음동 22-4")에서 동만. 동에 공백이 있을 수 있다. */
function canonDong(canonical: string): string {
  const i = canonical.lastIndexOf(' ')
  return squash(i < 0 ? canonical : canonical.slice(0, i))
}

/**
 * 네이버 주소는 뒤에 건물명을 붙인다 — `… 삼정동 611-3 그라니아아파트`.
 * 이 저장소의 `jibun_address` 관례는 지번까지다. **동 다음 토큰까지만** 남긴다.
 *
 * 🔴 "숫자 없는 마지막 토큰을 떼기" 같은 규칙은 안 된다 — `동양상가빌라2차` 처럼
 *    건물명에 숫자가 있으면 안 걸러진다. 반대로 `…로/길 <번호>` 로 자르는 규칙은
 *    `김해대로2471번길 7` 을 `김해대로2471` 로 **망가뜨린다**(2026-08-24 에 실제로 그랬고
 *    백업에서 복구했다). 동을 기준점으로 삼는 것만이 안전하다.
 */
function trimJibunAddr(addr: string): string {
  const p = addr.trim().split(/\s+/)
  let di = -1
  for (let i = 0; i < p.length; i++) if (/[동리가]$/.test(p[i]!) && !/^(창원시|김해시)$/.test(p[i]!)) di = i
  return di >= 0 && di + 1 < p.length ? p.slice(0, di + 2).join(' ') : addr
}

/**
 * 도로명은 **건드리지 않는다.** 네이버가 건물명을 붙이는 경우가 있으나, 잘라내려다
 * `…번길 <번호>` 를 깨뜨린 전례가 있다(위 주석). 건물명이 붙어도 주소로서 유효하다.
 */
function trimRoadAddr(addr: string | null): string | null {
  return addr && addr.trim() ? addr.trim() : null
}

interface Target { complex_id: string; name: string; sgg_code: string; canonical: string; own_address: string | null }
interface Row {
  t: Target; query: string
  hit?: { title: string; address: string; road: string; coord: [number, number] }
  agree: boolean; note: string
}

async function collectTargets(sb: SupabaseClient): Promise<Target[]> {
  const ids = (arg('ids') ?? '').split(',').filter(Boolean)
  if (ids.length) {
    const { data } = await sb.from('complexes').select('id,canonical_name,sgg_code,jibun_address,road_address').in('id', ids)
    const { data: cj } = await sb.from('complex_canonical_jibun').select('complex_id,umd_nm,jibun').in('complex_id', ids)
    const m = new Map((cj ?? []).map((c) => [c.complex_id, `${c.umd_nm ?? ''} ${c.jibun}`.trim()]))
    return (data ?? []).map((c) => ({
      complex_id: c.id, name: c.canonical_name, sgg_code: c.sgg_code,
      canonical: m.get(c.id) ?? '', own_address: c.jibun_address ?? c.road_address,
    })).filter((t) => t.canonical)
  }
  const inPath = arg('in')
  if (!inPath) throw new Error('--in=<audit json> 또는 --ids=<uuid,...> 필요')
  const j = JSON.parse(readFileSync(inPath, 'utf8')) as { rows?: Array<{ id: string; name: string; sgg_code: string; canonical: string; skip?: string }> }
  // fix-complex-coords-by-canonical-jibun 의 백업(건너뛴 건 포함)을 그대로 먹는다.
  return (j.rows ?? [])
    .filter((r) => r.skip && r.canonical)
    .map((r) => ({ complex_id: r.id, name: r.name, sgg_code: r.sgg_code, canonical: r.canonical, own_address: null }))
}

async function main(): Promise<void> {
  const nid = process.env.NAVER_CLIENT_ID
  const nsec = process.env.NAVER_CLIENT_SECRET
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!nid || !nsec) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요')
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const max = Number(arg('max') ?? DEFAULT_MAX)
  const apply = has('apply')
  const targets = (await collectTargets(sb)).slice(0, max)
  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)
  console.log(`대상 ${targets.length}곳 / 네이버 호출 상한 ${max}`)

  const rows: Row[] = []
  for (const t of targets) {
    const region = SGG_NAME[t.sgg_code] ?? ''
    const query = `${region} ${t.name}`.trim()
    const items = await naverLocal(query, nid, nsec)
    // 그 시군구 안에 있는 결과만 본다 — 이름으로 찾으므로 동명이인 위험이 있다.
    const inRegion = items.filter((it) => squash(it.address).includes(squash(region.split(' ').pop() ?? '')))
    // 🔴 동 일치만으로는 안 된다 — 그 동의 **아무 건물**이나 통과한다. 실측 오탐:
    //   태주실업 ← 가음동 20-12 인데 네이버가 `여성노동자임대아파트`(가음동 20-13)를 줬다
    // 그래서 **지번까지 정확히 일치**할 것을 요구한다. 우리가 고치는 건 위치이므로,
    // 지번이 정확히 맞으면 네이버가 그 건물을 뭐라 부르든 위치는 옳다
    // (`대동시티빌 ← 외동 853-35` 에 네이버는 `외동대동아파트` 를 주는데 지번이 같아 유효하다).
    const wantDong = canonDong(t.canonical)
    const wantJibun = squash(t.canonical.slice(t.canonical.lastIndexOf(' ') + 1))
    const pick = inRegion.find((it) => {
      const d = squash(dongOf(it.address))
      const dongOk = d && wantDong && (d === wantDong || wantDong.includes(d) || d.includes(wantDong))
      if (!dongOk) return false
      // 네이버 주소는 '… 삼정동 611-3 그라니아아파트' 형태다. 동 다음 토큰이 지번이다.
      const parts = it.address.trim().split(/\s+/)
      const di = parts.findIndex((p) => squash(p) === d)
      const jb = di >= 0 ? squash(parts[di + 1] ?? '') : ''
      return jb === wantJibun
    })
    if (!pick) {
      const seen = inRegion.slice(0, 2).map((it) => `${stripTag(it.title)}@${dongOf(it.address)}`).join(', ')
      rows.push({ t, query, agree: false, note: inRegion.length ? `확정 지번(${t.canonical})과 맞는 결과 없음 — 본 것: ${seen}` : '그 시군구 결과 없음' })
      console.log(`  ⚠️ ${t.name}[${t.sgg_code}] ← ${t.canonical}: ${rows[rows.length - 1]!.note}`)
      continue
    }
    const hit = { title: stripTag(pick.title), address: pick.address, road: pick.roadAddress, coord: toCoord(pick) }
    rows.push({ t, query, hit, agree: true, note: '확정 지번의 동과 일치' })
    console.log(`  ✅ ${t.name}[${t.sgg_code}] ← ${t.canonical}`)
    console.log(`     네이버: ${hit.title} / ${hit.address} / ${hit.road} / ${hit.coord.map((v) => v.toFixed(5)).join(',')}`)
  }

  const ok = rows.filter((r) => r.agree)
  console.log(`\n일치 ${ok.length} / 불일치 ${rows.length - ok.length}`)

  const backup = arg('backup')
  if (backup) { writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2)); console.log(`📄 ${backup}`) }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 일치 건만 적용 중...')
  for (const r of ok) {
    const h = r.hit!
    const { error } = await sb.from('complexes').update({
      lat: h.coord[0], lng: h.coord[1],
      jibun_address: trimJibunAddr(h.address),
      road_address: trimRoadAddr(h.road),
      dong: dongOf(h.address) || null,
    }).eq('id', r.t.complex_id)
    if (error) throw new Error(`${r.t.name} 실패: ${error.message}`)
    console.log(`  ✅ ${r.t.name} → ${h.address}`)
  }
  console.log(`\n✅ ${ok.length}곳 좌표·주소 정정. 불일치는 사람이 봐야 한다.`)
  console.log('⚠️ url_slug 는 건드리지 않았다 — 기존 URL 이 깨진다.')
}

main().catch((e) => { console.error(`[naver-resolve] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
