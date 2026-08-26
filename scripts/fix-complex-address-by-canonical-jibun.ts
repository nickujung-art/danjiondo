/**
 * 단지 주소 정정 — 확정 지번을 **정방향** 지오코딩해 주소를 다시 쓴다 (2026-08-25)
 *
 * [무엇을 고치는가 — 두 종류다]
 * 2026-08-25 실측, 운영권역 active **1,902곳** 기준:
 *
 *   ① 주소 없음        754곳 (확정 지번 보유 662) — 화면에 주소가 아예 안 뜬다
 *   ② 주소가 다른 시/도  26곳 (확정 지번 보유  21) — 이름이 같은 딴 도시 건물로
 *      지오코딩된 결과가 굳었다:
 *        경남아파트2동3동[마산회원, 거래 110]  →  서울 양천구 목동 537-31
 *        영남1[의창, 거래 50]                →  제주특별자치도 서귀포시 영남동 산 1
 *        여명[진해, 거래 42]                 →  서울 송파구 마천동 26-15
 *
 * 둘 다 화면에 그대로 뜨고 **JSON-LD PostalAddress 로 구글에도 나간다.**
 *
 * 🔴 이 수를 셀 때 PostgREST 의 **1,000행 상한**을 조심한다. 페이지네이션 없이 세면
 *    active 가 1,000 으로 잘려 나오고(실제 1,902), ②가 18 로 축소된다(실제 26).
 *    이 저장소의 오답노트 #001 이 그 함정이다 — `loadAll()` 을 쓴다.
 *
 * [왜 다른 도구로 안 되는가 — 셋 다 이 population 을 못 잡는다]
 *   `fix-complex-address-by-reverse-geocode.ts`  좌표를 역지오코딩한다. 좌표까지 딴 도시로
 *       폴백된 건은 역지오코딩해도 딴 도시가 나온다. 게다가 대상 선정이
 *       `audit-wholesale-mislink.ts` 의 판정에 묶여 있어 감사에 안 걸린 건은 아예 안 본다
 *   `fix-complex-coords-by-canonical-jibun.ts`   **lat/lng 만 갱신한다.** 주소를 안 건드린다.
 *       대상 선정도 '같은 좌표에 뭉친 그룹' 이라 이 population 과 겹치지 않는다
 *   `resolve-complex-by-naver-local.ts`          이름으로 찾는다. 이름이 곧 오답의 원인인
 *       이 건들에는 근거로 못 쓴다
 *
 * [왜 '다른 시/도' 를 판별자로 쓰는가]
 * **정당한 사유가 없는 유일한 조건**이기 때문이다. 동이 어긋나는 것은 정상일 수 있고
 * (대동다숲 = 내서읍 원계리/삼계리, 카카오 실측 0m), 필지가 어긋나는 것도 정상일 수 있다
 * (대단지는 여러 필지에 걸친다). 그러나 **창원 단지가 서울 주소를 가질 이유는 없다.**
 * 판별력이 확실한 조건만 자동 처리하고 나머지는 사람에게 남긴다.
 *
 * [왜 좌표를 항상 덮어쓰지 않는가]
 * 정방향 지오코딩은 **도로 기준점**을 준다 — 대단지에서 60~140m 차이가 정상이다
 * (HANDOFF-bds-20260821 의 교훈). 지금 좌표가 이미 제자리에 있으면 도로 기준점으로
 * 바꾸는 것은 오히려 정밀도를 깎는다. 그래서 **현재 좌표가 명백히 틀렸을 때만** 덮는다
 * (거리 > COORD_REPLACE_M 또는 좌표 없음). 주소는 항상 쓴다.
 *
 * 🔴 카카오 연속 재실행 금지 전례(2026-08-19)가 있어 호출 상한을 둔다.
 *
 * [dry-run 을 두 번 호출하지 않는다]
 * 대상이 수백 곳이라 dry-run 과 apply 가 각각 지오코딩하면 호출이 두 배가 된다.
 * `--from-plan=<dry-run 이 쓴 파일>` 은 **그 파일의 판정을 그대로** 적용한다 —
 * 카카오를 한 번도 부르지 않고, 사람이 눈으로 본 것과 적용되는 것이 정확히 같아진다.
 *
 * 실행:
 *   npx tsx scripts/fix-complex-address-by-canonical-jibun.ts --max=700 --backup=plan.json
 *   npx tsx scripts/fix-complex-address-by-canonical-jibun.ts --from-plan=plan.json --apply
 *
 * [검증된 지번 모드(2026-08-26) — --from-verified]
 * verify-tx-jibun-kakao.ts 가 `same_site` 로 판정한 (동,지번) 을 지번 출처로 쓴다.
 * `same_site` 는 **거래 지번이 단지 좌표에서 300m 안**이라는 뜻이다 — 거래가 맞고
 * 단지 주소가 틀린 경우다. 확정 지번이 없어(다수결 미달) 기본 모드가 못 보는 건들이다.
 *
 * 🔴 **다수 비중 가드**가 있다. 검증된 묶음이 그 단지 거래에서 차지하는 비중이
 *    MIN_SHARE 미만이면 적용하지 않는다. 2026-08-26 실측에서 이게 4묶음을 걸렀다:
 *      태백산빌라2 7/30(23%) · 에이케이 1/22(5%) · 삼성골드빌라 1/18 ×2(11%)
 *    1~2건으로 단지 주소 전체를 바꾸면 안 된다.
 *
 *   npx tsx scripts/fix-complex-address-by-canonical-jibun.ts --from-verified=v.json --backup=p.json
 *   npx tsx scripts/fix-complex-address-by-canonical-jibun.ts --busan
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

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

/** 시군구 코드 앞 2자리 → 그 주소가 반드시 갖고 있어야 할 광역 표기(하나라도 맞으면 통과). */
const PROVINCE_ALIASES: Record<string, string[]> = {
  '48': ['경남', '경상남도'],
  '26': ['부산', '부산광역시'],
}

/** --from-verified: 검증된 묶음이 단지 거래에서 차지해야 할 최소 비중. */
const MIN_SHARE = 0.5

/** 현재 좌표가 새 좌표에서 이만큼 넘게 떨어져 있으면 좌표도 틀린 것으로 보고 덮는다. */
const COORD_REPLACE_M = 1_000
/** 카카오 호출 상한. */
const DEFAULT_MAX = 40
const DELAY_MS = 350

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
const squash = (s: string | null | undefined) => (s ?? '').replace(/\s/g, '')

interface Cx {
  id: string; canonical_name: string; sgg_code: string; status: string
  lat: number | null; lng: number | null; dong: string | null; jibun_address: string | null
}
interface Canon { complex_id: string; umd_nm: string | null; jibun: string | null }
interface Geo { jibun: string; road: string | null; dong: string; lat: number; lng: number }

const EARTH_R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
function metres(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_R * Math.asin(Math.sqrt(h)))
}

let lookups = 0
let halted = false

async function geocode(query: string, key: string): Promise<Geo | null> {
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
  const j = await r.json() as {
    documents?: Array<{
      x: string; y: string
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
    lat: parseFloat(d.y), lng: parseFloat(d.x),
  }
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
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
    const rows = (data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

/** 이 주소가 그 시군구가 속한 광역 표기로 시작하는가. */
function provinceOk(sgg: string, addr: string | null): boolean {
  if (!addr) return false
  const aliases = PROVINCE_ALIASES[sgg.slice(0, 2)] ?? []
  return aliases.some((p) => addr.trim().startsWith(p))
}

interface Row {
  c: Cx; canonical: string; query: string; geo: Geo | null
  ok: boolean; note: string; moveM: number | null; replaceCoord: boolean
}

async function main(): Promise<void> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY 필요')
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const scope = has('busan') ? BUSAN_SGG : CORE_SGG
  const max = Number(arg('max') ?? DEFAULT_MAX)
  const apply = has('apply')
  const onlyIds = (arg('ids') ?? '').split(',').filter(Boolean)
  const fromPlan = arg('from-plan')

  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}${fromPlan ? ` / 계획 파일: ${fromPlan}` : ''}`)

  // 계획 파일 그대로 적용 — 지오코딩을 다시 하지 않는다.
  if (fromPlan) {
    if (!apply) throw new Error('--from-plan 은 --apply 와 함께 쓴다 (계획 파일 자체가 dry-run 결과다)')
    const plan = JSON.parse(readFileSync(fromPlan, 'utf8')) as { at: string; rows: Row[] }
    const ok = plan.rows.filter((r) => r.ok)
    console.log(`계획 ${plan.at} / 적용 가능 ${ok.length}곳`)
    let done = 0
    for (const r of ok) {
      const patch: Record<string, unknown> = {
        jibun_address: r.geo!.jibun, road_address: r.geo!.road, dong: r.geo!.dong || null,
      }
      if (r.replaceCoord) { patch.lat = r.geo!.lat; patch.lng = r.geo!.lng }
      const { error } = await sb.from('complexes').update(patch).eq('id', r.c.id)
      if (error) throw new Error(`${r.c.canonical_name} 실패: ${error.message}`)
      if (++done % 50 === 0) console.log(`  … ${done}/${ok.length}`)
    }
    console.log(`\n✅ ${done}곳 적용 (카카오 호출 0회).`)
    console.log('⚠️ url_slug 는 건드리지 않았다 — 기존 URL 이 깨진다. 별도 판단 필요.')
    return
  }

  const cxs = await loadAll<Cx>(sb, 'complexes',
    'id,canonical_name,sgg_code,status,lat,lng,dong,jibun_address', scope, 'id')
  const canons = await loadAll<Canon>(sb, 'complex_canonical_jibun',
    'complex_id,umd_nm,jibun', scope, 'complex_id')
  const canonBy = new Map(canons.map((c) => [c.complex_id, c]))

  // --from-verified: 지번 출처를 확정 지번이 아니라 **카카오가 same_site 로 판정한 묶음**으로 바꾼다.
  const fromVerified = arg('from-verified')
  if (fromVerified) {
    interface VCheck { jibun: string; count: number; dist_m?: number; verdict?: string }
    interface VRow { id: string; name: string; sgg: string; checks?: VCheck[] }
    const vj = JSON.parse(readFileSync(fromVerified, 'utf8')) as { results?: VRow[] }
    const byId = new Map(cxs.map((c) => [c.id, c]))
    for (const r of vj.results ?? []) {
      for (const ck of r.checks ?? []) {
        if (ck.verdict !== 'same_site') continue
        const c = byId.get(r.id)
        if (!c || c.status !== 'active') continue
        const { count: total } = await sb.from('transactions').select('id', { count: 'exact', head: true })
          .eq('complex_id', r.id).is('cancel_date', null).is('superseded_by', null)
        const share = (total ?? 0) > 0 ? ck.count / (total ?? 1) : 0
        if (share < MIN_SHARE) {
          console.log(`  ⏭ ${c.canonical_name}: 검증 ${ck.count}/${total}건(${Math.round(share * 100)}%) — 비중 미달로 제외`)
          continue
        }
        canonBy.set(c.id, {
          complex_id: c.id,
          umd_nm: ck.jibun.slice(0, ck.jibun.lastIndexOf(' ')),
          jibun: ck.jibun.slice(ck.jibun.lastIndexOf(' ') + 1),
        })
        onlyIds.push(c.id)
      }
    }
    console.log(`--from-verified: 비중 가드 통과 ${onlyIds.length}곳`)
  }

  const suspect = cxs
    .filter((c) => c.status === 'active')
    .filter((c) => (onlyIds.length ? onlyIds.includes(c.id) : !provinceOk(c.sgg_code, c.jibun_address)))

  const targets = suspect.filter((c) => {
    const k = canonBy.get(c.id)
    return !!k?.umd_nm && !!k?.jibun
  })
  const noCanon = suspect.filter((c) => !targets.includes(c))

  console.log(`대상 ${targets.length}곳 (주소가 다른 시/도 + 확정 지번 보유) / 호출 상한 ${max}`)
  if (noCanon.length) {
    console.log(`   확정 지번이 없어 제외 ${noCanon.length}곳 — 사람이 봐야 한다:`)
    for (const c of noCanon) console.log(`     ${c.canonical_name}[${c.sgg_code}]  ${c.jibun_address ?? '(주소 없음)'}`)
  }

  const rows: Row[] = []
  for (const c of targets) {
    if (halted || lookups >= max) {
      console.log(`\n⏸ 호출 상한(${max}) 도달 또는 중단 — 남은 ${targets.length - rows.length}곳은 다음 실행으로`)
      break
    }
    const k = canonBy.get(c.id)!
    const canonical = `${k.umd_nm} ${k.jibun}`
    const query = `${SGG_PREFIX[c.sgg_code]} ${canonical}`
    const geo = await geocode(query, kakaoKey)

    let ok = false, note = '', moveM: number | null = null, replaceCoord = false
    if (!geo) {
      note = '지오코딩 실패 — 폐지 지번일 수 있다'
    } else {
      // 🔴 되돌아온 주소가 **우리가 물어본 그 필지**인지 확인한다. 카카오는 정확히 못 찾으면
      //    비슷한 것을 돌려주는데, 그걸 그대로 쓰면 새 오답을 만든다.
      const exact = squash(geo.jibun).endsWith(squash(canonical))
      const sggTokens = squash((SGG_PREFIX[c.sgg_code] ?? '').split(' ').slice(1).join(''))
      const inSgg = squash(geo.jibun).includes(sggTokens)
      if (!exact) note = `🔴 다른 필지를 돌려줬다: 요청 ${canonical} vs 응답 ${geo.jibun}`
      else if (!inSgg) note = `🔴 시군구가 다르다: ${geo.jibun}`
      else {
        ok = true
        moveM = c.lat != null && c.lng != null ? metres([c.lat, c.lng], [geo.lat, geo.lng]) : null
        replaceCoord = moveM == null || moveM > COORD_REPLACE_M
        note = replaceCoord
          ? `주소+좌표 교체 (현재 좌표가 ${moveM == null ? '없음' : `${moveM}m 떨어짐`})`
          : `주소만 교체 (좌표는 ${moveM}m 로 이미 제자리 — 도로 기준점으로 바꾸지 않는다)`
      }
    }
    rows.push({ c, canonical, query, geo, ok, note, moveM, replaceCoord })
  }

  console.log(`\n=== 결과 ===`)
  for (const r of rows) {
    console.log(`\n  ${r.ok ? '✅' : '⚠️'} ${r.c.canonical_name}[${r.c.sgg_code}]`)
    console.log(`     기존 등록  ${r.c.jibun_address ?? '(없음)'}`)
    console.log(`     확정 지번  ${r.canonical}`)
    if (r.geo) console.log(`     지오코딩   ${r.geo.jibun}${r.geo.road ? `  /  ${r.geo.road}` : ''}`)
    console.log(`     → ${r.note}`)
  }

  const ok = rows.filter((r) => r.ok)
  console.log(`\n적용 가능 ${ok.length} / 보류 ${rows.length - ok.length} / 카카오 호출 ${lookups}회${halted ? ' (중단)' : ''}`)

  const backup = arg('backup')
  if (backup) {
    writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2))
    console.log(`📄 ${backup}`)
  }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply --backup=<file>)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 을 요구한다')

  console.log('\n🔴 적용 중...')
  for (const r of ok) {
    const patch: Record<string, unknown> = {
      jibun_address: r.geo!.jibun,
      road_address: r.geo!.road,
      dong: r.geo!.dong || null,
    }
    if (r.replaceCoord) { patch.lat = r.geo!.lat; patch.lng = r.geo!.lng }
    const { error } = await sb.from('complexes').update(patch).eq('id', r.c.id)
    if (error) throw new Error(`${r.c.canonical_name} 실패: ${error.message}`)
    console.log(`  ✅ ${r.c.canonical_name} → ${r.geo!.jibun}${r.replaceCoord ? ' (좌표도 교체)' : ''}`)
  }
  console.log(`\n✅ ${ok.length}곳 적용.`)
  console.log('⚠️ url_slug 는 건드리지 않았다 — 기존 URL 이 깨진다. 별도 판단 필요.')
}

main().catch((e) => { console.error(`[fix-address-canonical] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
