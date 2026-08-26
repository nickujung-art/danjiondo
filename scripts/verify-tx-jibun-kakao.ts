/**
 * 오염 후보의 **거래 지번**을 카카오로 조회해 단지 좌표와 대조한다 (2026-08-21)
 *
 * [무엇을 가리는가]
 * audit-complex-address-match.ts 가 찾은 오염 후보는 두 갈래로 갈린다:
 *
 *   (A) 거래가 엉뚱한 단지에 붙었다   → 거래 연결을 끊어야 한다
 *   (B) 단지의 주소·동이 틀렸다       → 단지 메타데이터를 고쳐야 한다
 *
 * DB 만으로는 이 둘을 못 가른다. **거래 지번이 실제로 어디인가**를 물어야 한다.
 * 소수 동 지번을 지오코딩해 단지 좌표와의 거리를 재면:
 *   가깝다(< NEAR_M)  → 같은 단지의 다른 필지. 정상이거나 단지 주소가 부정확
 *   멀다(>= FAR_M)    → 다른 곳의 거래가 붙은 것. 연결을 끊어야 한다
 *
 * [왜 어제 감사를 반복하지 않는가]
 * `.planning/inbox/HANDOFF-bds-20260821.md` 가 활성 단지 1,894곳 역지오코딩을 이미
 * 마쳤다. 그 감사는 **단지가 제 위치에 있나**를 물었고, 이 스크립트는 **거래가 제 단지에
 * 붙었나**를 묻는다. 층위가 다르므로 중복이 아니다.
 *
 * 🔴 핸드오프 '주의' — 카카오 API 를 연속 재실행해 막힌 전례가 있다(KAPT, 2026-08-19).
 *    그래서 이 스크립트는:
 *      - 기본 상한 MAX_LOOKUPS 를 두고 초과하면 멈춘다
 *      - 호출 간 DELAY_MS 를 둔다
 *      - 429/한도 응답을 만나면 즉시 중단한다 (재시도 폭주 금지)
 *
 * 실행:
 *   npx tsx scripts/verify-tx-jibun-kakao.ts --in=audit-core-20260821.json
 *   npx tsx scripts/verify-tx-jibun-kakao.ts --in=... --max=40 --json=out.json
 *   npx tsx scripts/verify-tx-jibun-kakao.ts --in=... --with-minor --max=80 --json=out.json
 *
 * 동 불일치 모드(2026-08-26) — audit-complex-address-match.ts 의 dong_mismatch 를 먹는다:
 *   npx tsx scripts/verify-tx-jibun-kakao.ts --in-dong=addr-match.json --max=130 --json=v.json
 *
 *   🔴 원래 모드(--in)는 **최다 지번을 빼고 나머지**를 본다. dong_mismatch 는 정반대로
 *      **최다가 남의 것**이라 그 방식으로는 자기 거래를 검사하게 되어 아무것도 안 나온다.
 *      여기서는 **등록 동이 아닌 (동,지번) 묶음 전부**를 본다.
 *      출력 모양은 원래 모드와 같게 맞춘다 — relink-verified.ts --in-minor 가 그대로 먹는다.
 *
 * 전건 오연결 모드(2026-08-24) — audit-wholesale-mislink.ts 산출물을 그대로 먹는다:
 *   npx tsx scripts/verify-tx-jibun-kakao.ts --in-wholesale=wholesale-mislink-20260824.json --max=20 --json=v.json
 *   npx tsx scripts/verify-tx-jibun-kakao.ts --in-wholesale=... --verdict=판정불가
 *
 * 환경변수: KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

/** 이 거리 미만이면 같은 단지 부지로 본다. 대단지 대각선을 감안한 값. */
const NEAR_M = 300
/** 이 거리 이상이면 명백히 다른 곳이다. */
const FAR_M = 1000
/** 카카오 호출 상한 — 초과하면 멈춘다(연속 재실행 차단 전례 대응). */
const DEFAULT_MAX_LOOKUPS = 60
/** 호출 간 간격. */
const DELAY_MS = 350

interface Finding {
  id: string
  name: string
  sgg_code: string
  registered_dong: string | null
  road_address: string | null
  tx_total: number
  dong_dist: Record<string, number>
  jibun_top: [string, number][]
  verdict: string
  note: string
}

/** 불리언 플래그. 이 파일에는 없어서 --with-minor 추가 시 함께 넣었다(2026-08-26). */
function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
}

/** 공백을 지운다 — 동 이름 비교용("내서읍 삼계리" vs "내서읍삼계리"). */
const squash = (x: string | null | undefined): string => (x ?? '').replace(/\s/g, '')

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

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

let lookups = 0
let halted = false

async function geocode(query: string, key: string): Promise<[number, number] | null> {
  if (halted) return null
  lookups++
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', query)
  const res = await fetch(url.toString(), { headers: { Authorization: `KakaoAK ${key}` } })
  if (res.status === 429 || res.status === 403) {
    console.error(`\n🚫 카카오 API 한도/차단 응답(${res.status}) — 즉시 중단한다.`)
    console.error('   재시도하지 않는다. 시간을 두고 다시 실행할 것(핸드오프 주의 절).')
    halted = true
    return null
  }
  if (!res.ok) return null
  const j = (await res.json()) as { documents?: { y: string; x: string }[] }
  const d = j.documents?.[0]
  await new Promise((r) => setTimeout(r, DELAY_MS))
  return d ? [parseFloat(d.y), parseFloat(d.x)] : null
}

async function main(): Promise<void> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY 필요')
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const maxLookups = Number(arg('max') ?? DEFAULT_MAX_LOOKUPS)

  // ── 입력 모드 2: 전건 오연결 감사 (2026-08-24) ──────────────────────────────
  //
  // audit-wholesale-mislink.ts 는 **다른 질문**을 던진다. 원래 모드는 "소수 지번이
  // 딴 곳인가"를 묻지만, 전건 오연결은 **다수 지번(= 확정 지번) 자체가 남의 것**이라
  // 소수를 봐야 아무것도 안 나온다. 그래서 확정 지번을 지오코딩해 단지 좌표와 잰다.
  //
  //   가깝다 → 단지가 실제로 그 지번에 있다 → 오연결이 아니다(좌표 판별이 틀렸다)
  //   멀다   → 거래가 남의 곳 것이다 → 이동·끊기 대상 확정
  //
  // 별도 변환 스크립트를 만들지 않고 여기에 얹는 이유: NEAR_M/FAR_M·호출 상한·429 중단
  // 같은 판단 기준이 두 벌로 갈라지면 안 된다.
  const wholesalePath = arg('in-wholesale')
  if (wholesalePath) {
    interface WPlan {
      verdict: string; complex_id: string; name: string; sgg_code: string
      canonical: string; tx_count: number; own_address: string | null; why: string
    }
    const w = JSON.parse(readFileSync(wholesalePath, 'utf8')) as { plan: WPlan[] }
    const only = arg('verdict') ?? '거래_오연결'
    const targets = w.plan
      .filter((p) => p.verdict === only)
      .sort((a, b) => b.tx_count - a.tx_count)
    console.log(`대상 ${targets.length}곳 (verdict=${only}) / 호출 상한 ${maxLookups}`)

    const out: Record<string, unknown>[] = []
    for (const t of targets) {
      if (halted || lookups >= maxLookups) {
        console.log(`\n⏸ 호출 상한(${maxLookups}) 도달 또는 중단 — 남은 ${targets.length - out.length}곳은 다음 실행으로`)
        break
      }
      const { data: cx } = await sb.from('complexes').select('lat,lng').eq('id', t.complex_id).single()
      if (!cx?.lat || !cx?.lng) { console.log(`  ${t.name}: 좌표 없음 — 건너뜀`); continue }
      const q = `${SGG_PREFIX[t.sgg_code] ?? ''} ${t.canonical}`.trim()
      const pos = await geocode(q, kakaoKey)
      if (!pos) {
        console.log(`  ${t.name}(${t.tx_count}건): "${q}" 미검출`)
        out.push({ ...t, result: 'not_found' })
        continue
      }
      const dist = Math.round(haversineM([cx.lat as number, cx.lng as number], pos))
      // 원래 모드와 같은 임계를 쓴다.
      const verdict = dist < NEAR_M ? 'same_site' : dist >= FAR_M ? 'different_place' : 'ambiguous'
      console.log(`  ${t.name}(${t.tx_count}건) ← ${t.canonical}: ${dist}m ${verdict}`)
      out.push({ ...t, query: q, dist_m: dist, kakao_verdict: verdict })
    }
    const far = out.filter((o) => o.kakao_verdict === 'different_place').length
    const same = out.filter((o) => o.kakao_verdict === 'same_site').length
    console.log(`\n판정: 오연결 확정 ${far} / 같은 부지(오연결 아님) ${same} / 나머지 ${out.length - far - same}`)
    console.log(`카카오 호출 ${lookups}회${halted ? ' (중단됨)' : ''}`)
    const o = arg('json')
    if (o) { writeFileSync(o, JSON.stringify({ mode: 'wholesale', results: out, lookups, halted }, null, 2)); console.log(`📄 ${o}`) }
    return
  }

  // ── 입력 모드 3: 동 불일치 (2026-08-26) ────────────────────────────────────
  //
  // dong_mismatch 는 **최다 지번이 남의 것**이다. 원래 모드는 최다를 빼고 보므로
  // 여기서는 자기 거래를 검사하게 되어 아무것도 안 나온다. 등록 동이 아닌 묶음을 전부 본다.
  // 지번이 (null) 인 묶음은 지오코딩할 수 없고 relink 의 (동,지번) 매칭에도 안 걸려 건너뛴다.
  const dongPath = arg('in-dong')
  if (dongPath) {
    const audit = JSON.parse(readFileSync(dongPath, 'utf8')) as { findings: Finding[] }
    const targets = audit.findings
      .filter((f) => f.verdict === 'dong_mismatch')
      .sort((a, b) => b.tx_total - a.tx_total)
    console.log(`대상 ${targets.length}곳 (dong_mismatch) / 호출 상한 ${maxLookups}`)

    const results: Record<string, unknown>[] = []
    let skippedNull = 0
    for (const f of targets) {
      if (halted || lookups >= maxLookups) {
        console.log(`
⏸ 호출 상한(${maxLookups}) 도달 또는 중단 — 남은 ${targets.length - results.length}곳은 다음 실행으로`)
        break
      }
      const { data: cx } = await sb.from('complexes').select('lat,lng').eq('id', f.id).single()
      if (!cx?.lat || !cx?.lng) continue
      const home: [number, number] = [cx.lat as number, cx.lng as number]
      const reg = squash(f.registered_dong)

      const foreign = f.jibun_top.filter(([k]) => {
        if (k.includes('(null)')) { skippedNull++; return false }
        const dong = squash(k.slice(0, k.lastIndexOf(' ')))
        if (!dong || !reg) return false
        return dong !== reg && !dong.includes(reg) && !reg.includes(dong)
      })
      if (!foreign.length) continue

      const checks: Record<string, unknown>[] = []
      for (const [jibunKey, cnt] of foreign) {
        if (halted || lookups >= maxLookups) break
        const pos = await geocode(`${SGG_PREFIX[f.sgg_code] ?? ''} ${jibunKey}`.trim(), kakaoKey)
        if (!pos) { checks.push({ jibun: jibunKey, count: cnt, result: 'not_found' }); continue }
        const dist = Math.round(haversineM(home, pos))
        checks.push({
          jibun: jibunKey, count: cnt, dist_m: dist,
          verdict: dist < NEAR_M ? 'same_site' : dist >= FAR_M ? 'different_place' : 'ambiguous',
        })
      }
      if (!checks.length) continue
      results.push({ id: f.id, name: f.name, sgg: f.sgg_code, tx_total: f.tx_total, checks })
      console.log(`  ${f.sgg_code} ${f.name}(등록 ${f.registered_dong}): ` + checks.map((c) =>
        c.dist_m === undefined ? `${c.jibun}(${c.count}) 미검출`
          : `${c.jibun}(${c.count}) ${c.dist_m}m ${c.verdict}`).join(' | '))
    }

    const flat = results.flatMap((r) => (r.checks as { verdict?: string; count: number }[]))
    const conf = flat.filter((c) => c.verdict === 'different_place')
    console.log(`
판정: 오연결 확정 ${conf.length}묶음 / ${conf.reduce((s, c) => s + c.count, 0)}건`)
    console.log(`      같은 부지 ${flat.filter((c) => c.verdict === 'same_site').length} · 애매 ${flat.filter((c) => c.verdict === 'ambiguous').length} · 미검출 ${flat.filter((c) => !c.verdict).length}`)
    console.log(`      지번 없어 건너뜀 ${skippedNull}묶음`)
    console.log(`카카오 호출 ${lookups}회${halted ? ' (중단됨)' : ''}`)
    const out = arg('json')
    if (out) { writeFileSync(out, JSON.stringify({ mode: 'dong_mismatch', results, lookups, halted }, null, 2)); console.log(`📄 ${out}`) }
    return
  }

  const inPath = arg('in')
  if (!inPath) throw new Error('--in=<audit json> / --in-wholesale=<...> / --in-dong=<...> 중 하나 필요')

  const audit = JSON.parse(readFileSync(inPath, 'utf8')) as { findings: Finding[] }
  const targets = audit.findings
    // 🔴 minor_dong 을 기본에 넣지 않는다 — 265곳 중 실제 처리 대상은 61묶음뿐이고
    //    나머지는 지번이 (null) 인 거래다(2026-08-26 실측: 타 동 1,118건 중 595건이 null).
    //    --with-minor 로 명시할 때만 포함한다.
    .filter((f) => f.verdict === 'contaminated' || f.verdict === 'merge_suspect'
      || (has('with-minor') && f.verdict === 'minor_dong'))
    .sort((a, b) => b.tx_total - a.tx_total)
  console.log(`대상 ${targets.length}곳 (contaminated + merge_suspect) / 호출 상한 ${maxLookups}`)

  const results: Record<string, unknown>[] = []
  for (const f of targets) {
    if (halted || lookups >= maxLookups) {
      console.log(`\n⏸ 호출 상한(${maxLookups}) 도달 또는 중단 — 남은 ${targets.length - results.length}곳은 다음 실행으로`)
      break
    }
    const { data: cx } = await sb.from('complexes').select('lat,lng').eq('id', f.id).single()
    if (!cx?.lat || !cx?.lng) { continue }
    const home: [number, number] = [cx.lat as number, cx.lng as number]

    // 최다 지번을 제외한 나머지 지번들을 확인한다
    const others = f.jibun_top.slice(1).filter(([k]) => !k.includes('(null)'))
    const checks: Record<string, unknown>[] = []
    for (const [jibunKey, cnt] of others) {
      if (halted || lookups >= maxLookups) break
      const q = `${SGG_PREFIX[f.sgg_code] ?? ''} ${jibunKey}`.trim()
      const pos = await geocode(q, kakaoKey)
      if (!pos) { checks.push({ jibun: jibunKey, count: cnt, result: 'not_found' }); continue }
      const dist = Math.round(haversineM(home, pos))
      checks.push({
        jibun: jibunKey, count: cnt, dist_m: dist,
        verdict: dist < NEAR_M ? 'same_site' : dist >= FAR_M ? 'different_place' : 'ambiguous',
      })
    }
    results.push({ id: f.id, name: f.name, sgg: f.sgg_code, tx_total: f.tx_total, checks })
    const line = checks.map((c) =>
      c.dist_m === undefined ? `${c.jibun}(${c.count}) 미검출`
        : `${c.jibun}(${c.count}) ${c.dist_m}m ${c.verdict}`).join(' | ')
    console.log(`  ${f.sgg_code} ${f.name}: ${line}`)
  }

  console.log(`\n카카오 호출 ${lookups}회${halted ? ' (중단됨)' : ''}`)
  const out = arg('json')
  if (out) { writeFileSync(out, JSON.stringify({ results, lookups, halted }, null, 2)); console.log(`📄 ${out}`) }
}

main().catch((e) => { console.error(`[verify] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
