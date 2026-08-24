/**
 * 지번 기준 거래 재연결 — 잘못 붙은 거래를 올바른 단지로 옮긴다 (2026-08-21)
 *
 * [문제]
 * `match_complex_by_admin` 이 이름만으로 거래를 단지에 붙인다. 동(umd_nm)은 3단계에서만
 * 보고, 대부분은 1단계 trigram 에서 확정된다. 그래서 이름이 비슷한 다른 지역 단지에
 * 거래가 붙는다. 실측 사례: 시영장미(내서읍 중리)에 양덕동 거래 67건 — 7.5km 떨어진 곳.
 *
 * [해법 — 거래 자신이 권위 있는 근거다]
 * 거래는 MOLIT 원본의 (umd_nm, jibun) 을 갖는다. 한 단지에 붙은 거래의 **다수 지번**이
 * 그 단지의 실제 위치다. 오염은 정의상 소수이므로 다수결이 성립한다.
 *
 *   1) 단지마다 다수 지번을 구한다            → 단지의 '진짜 지번'
 *   2) (sgg, 동, 지번) → 단지 역색인을 만든다
 *   3) 다수 지번과 다른 거래를 찾아 역색인에서 올바른 단지를 찾는다
 *   4) 찾으면 옮기고, 못 찾으면 연결을 끊는다
 *
 * `complexes.jibun_address` 는 운영권역 60.4% 밖에 없어 단독 근거로 못 쓴다.
 * 있는 경우엔 교차검증에만 쓴다.
 *
 * [안전장치]
 * - 기본 dry-run. `--apply` 없이는 아무것도 바꾸지 않는다
 * - 이동 대상 단지가 **유일**할 때만 옮긴다 (복수면 보류)
 * - 원본 단지명(raw_complex_name)과 대상 단지명의 유사도를 확인한다.
 *   전혀 다른 이름이면 같은 지번이어도 옮기지 않는다(한 지번에 여러 건물이 있을 수 있다)
 * - 옮기기 전 전건을 JSON 으로 백업한다
 * - 다수 지번 판정에 최소 표본을 요구한다
 *
 * 실행:
 *   npx tsx scripts/relink-transactions-by-jibun.ts                     # dry-run, 운영권역
 *   npx tsx scripts/relink-transactions-by-jibun.ts --busan
 *   npx tsx scripts/relink-transactions-by-jibun.ts --apply --backup=b.json
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { nameSim } from '../src/lib/data/name-similarity'

const CORE_SGG = ['48121', '48123', '48125', '48127', '48129', '48250']
const BUSAN_SGG = [
  '26110', '26140', '26170', '26200', '26230', '26260', '26290', '26320',
  '26350', '26380', '26410', '26440', '26470', '26500', '26530', '26710',
]

/** 다수 지번으로 인정하려면 이 비율 이상이어야 한다. 미만이면 그 단지는 판정 보류. */
const DOMINANT_RATIO = 0.6
/** 다수 지번 판정 최소 표본. */
const MIN_SAMPLE = 5
/** 이름 유사도 하한 — 이보다 낮으면 같은 지번이어도 옮기지 않는다. */
const NAME_SIM_MIN = 0.3

interface Tx { id: string; complex_id: string; umd_nm: string | null; jibun: string | null; raw_complex_name: string | null; sgg_code: string }
interface Cx { id: string; canonical_name: string; name_normalized: string | null; sgg_code: string; jibun_address: string | null }

function has(name: string): boolean { return process.argv.includes(`--${name}`) }
function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
}

const jkey = (sgg: string, umd: string | null, jibun: string | null) => `${sgg}|${umd ?? ''}|${jibun ?? ''}`

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const scope = has('busan') ? BUSAN_SGG : has('all') ? null : CORE_SGG
  const apply = has('apply')
  console.log(`🔗 ${url}`)
  console.log(`📍 ${scope ? scope.join(',') : '전 활성'} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)

  // ── 단지 ──
  const cxById = new Map<string, Cx>()
  for (let p = 0; ; p++) {
    let q = sb.from('complexes').select('id, canonical_name, name_normalized, sgg_code, jibun_address')
      .eq('status', 'active').range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`complexes: ${error.message}`)
    for (const c of data as unknown as Cx[]) cxById.set(c.id, c)
    if (data.length < 1000) break
  }
  console.log(`   단지 ${cxById.size.toLocaleString()}`)

  // ── 거래 ──
  const txs: Tx[] = []
  for (let p = 0; ; p++) {
    let q = sb.from('transactions').select('id, complex_id, umd_nm, jibun, raw_complex_name, sgg_code')
      .not('complex_id', 'is', null).is('cancel_date', null).is('superseded_by', null)
      .range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`transactions(page ${p}): ${error.message}`)
    txs.push(...(data as unknown as Tx[]))
    if (p % 50 === 0) process.stderr.write(`\r   거래 ${txs.length.toLocaleString()}...`)
    if (data.length < 1000) break
  }
  process.stderr.write(`\r   거래 ${txs.length.toLocaleString()} 완료        \n`)

  // ── 1) 단지별 다수 지번 ──
  const perCx = new Map<string, Map<string, number>>()
  for (const t of txs) {
    if (!t.jibun) continue
    const m = perCx.get(t.complex_id) ?? new Map<string, number>()
    const k = jkey(t.sgg_code, t.umd_nm, t.jibun)
    m.set(k, (m.get(k) ?? 0) + 1)
    perCx.set(t.complex_id, m)
  }
  const dominant = new Map<string, string>()   // complex_id → jibun key
  for (const [cid, m] of perCx) {
    const tot = [...m.values()].reduce((a, b) => a + b, 0)
    if (tot < MIN_SAMPLE) continue
    const [k, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (n / tot >= DOMINANT_RATIO) dominant.set(cid, k)
  }
  console.log(`   다수 지번 확정 단지 ${dominant.size.toLocaleString()} / ${perCx.size.toLocaleString()}`)

  // ── 2) 역색인 (지번 → 단지). 충돌하면 버린다(유일할 때만 신뢰) ──
  const byJibun = new Map<string, string | null>()
  for (const [cid, k] of dominant) {
    if (byJibun.has(k)) byJibun.set(k, null)   // 충돌 표시
    else byJibun.set(k, cid)
  }
  const usable = [...byJibun.values()].filter(Boolean).length
  console.log(`   지번 역색인 ${byJibun.size.toLocaleString()}건 (유일 ${usable.toLocaleString()}, 충돌 ${byJibun.size - usable})`)

  // ── 3) 어긋난 거래 판정 ──
  const moves: Record<string, { to: string; toName: string; rows: string[]; sample: string }> = {}
  const unlinks: { key: string; rows: string[]; sample: string }[] = []
  const held: Record<string, number> = {}
  const unlinkMap = new Map<string, { rows: string[]; sample: string }>()

  for (const t of txs) {
    if (!t.jibun) continue
    const dom = dominant.get(t.complex_id)
    if (!dom) continue                      // 그 단지는 다수 지번 판정 보류
    const k = jkey(t.sgg_code, t.umd_nm, t.jibun)
    if (k === dom) continue                 // 정상
    const target = byJibun.get(k)
    const from = cxById.get(t.complex_id)
    if (target === undefined) {             // 이 지번을 가진 단지가 없다
      const e = unlinkMap.get(k) ?? { rows: [], sample: `${t.raw_complex_name} @ ${t.umd_nm} ${t.jibun} (현재: ${from?.canonical_name})` }
      e.rows.push(t.id); unlinkMap.set(k, e); continue
    }
    if (target === null) { held['지번 충돌'] = (held['지번 충돌'] ?? 0) + 1; continue }
    if (target === t.complex_id) continue
    const to = cxById.get(target)
    if (!to) { held['대상 단지 없음'] = (held['대상 단지 없음'] ?? 0) + 1; continue }
    const sim = nameSim(t.raw_complex_name ?? '', to.canonical_name)
    if (sim < NAME_SIM_MIN) {
      held[`이름 불일치(<${NAME_SIM_MIN})`] = (held[`이름 불일치(<${NAME_SIM_MIN})`] ?? 0) + 1
      continue
    }
    const mk = `${t.complex_id}→${target}`
    const e = moves[mk] ?? { to: target, toName: to.canonical_name, rows: [], sample: `"${t.raw_complex_name}" @ ${t.umd_nm} ${t.jibun}: ${from?.canonical_name} → ${to.canonical_name} (이름유사 ${sim.toFixed(2)})` }
    e.rows.push(t.id); moves[mk] = e
  }
  for (const [k, v] of unlinkMap) unlinks.push({ key: k, rows: v.rows, sample: v.sample })

  // ── 보고 ──
  const moveRows = Object.values(moves).reduce((a, m) => a + m.rows.length, 0)
  const unlinkRows = unlinks.reduce((a, u) => a + u.rows.length, 0)
  console.log(`\n=== 판정 ===`)
  console.log(`  이동 가능   ${Object.keys(moves).length}쌍 / ${moveRows.toLocaleString()}건`)
  console.log(`  대상 없음   ${unlinks.length}지번 / ${unlinkRows.toLocaleString()}건 (연결 끊기)`)
  console.log(`  보류        ${JSON.stringify(held)}`)

  console.log(`\n--- 이동 상위 20 ---`)
  Object.values(moves).sort((a, b) => b.rows.length - a.rows.length).slice(0, 20)
    .forEach((m) => console.log(`  ${String(m.rows.length).padStart(5)}건  ${m.sample}`))
  console.log(`\n--- 끊기 상위 10 ---`)
  unlinks.sort((a, b) => b.rows.length - a.rows.length).slice(0, 10)
    .forEach((u) => console.log(`  ${String(u.rows.length).padStart(5)}건  ${u.sample}`))

  const backup = arg('backup')
  if (backup) {
    writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), moves, unlinks }, null, 2))
    console.log(`\n📄 계획 저장: ${backup}`)
  }

  // 🔴 "대상 없음" 을 자동으로 끊지 않는다 — dry-run 이 이 설계 결함을 잡았다(2026-08-21).
  //
  // 처음엔 "다수 지번과 다르고 그 지번을 가진 다른 단지도 없으면 오염" 으로 봤다. 틀렸다.
  // 큰 아파트 단지는 **여러 필지에 걸쳐** 있어 지번이 여럿이다. 실제 후보 상위를 보면:
  //   506건 율현마을율하e-편한세상 @ 율하동 1405 (현재: 율현마을율하e-편한세상아파트)
  //    80건 창원롯데캐슬센텀골드 @ 양덕동 166-44 (현재: 창원롯데캐슬센텀골드)  ← 이름 동일
  //    76건 김해센텀두산위브더제니스 @ 선지리 1531 → 카카오 실측 **72m, 같은 부지**
  // 전부 정상이다. 자동으로 끊었으면 2,735건의 올바른 연결을 파괴했을 것이다.
  //
  // 진짜 판별자는 이름도 역색인 유무도 아닌 **거리**다. 그건 카카오로만 알 수 있다
  // (scripts/verify-tx-jibun-kakao.ts). 그래서 끊기는 **검증된 목록**을 받아서만 한다.
  const cutList = arg('unlink-verified')
  if (!apply) {
    console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply)')
    console.log('⚠️ "대상 없음" 은 다필지 단지일 수 있다. 끊으려면 먼저 카카오로 거리를 재고')
    console.log('   확인된 지번만 --unlink-verified=<json> 로 넘길 것.')
    return
  }
  if (!backup) throw new Error('--apply 는 --backup=<file> 를 요구한다')

  console.log('\n🔴 적용 중...')
  let moved = 0
  for (const m of Object.values(moves)) {
    for (let i = 0; i < m.rows.length; i += 100) {
      const { data, error } = await sb.from('transactions').update({ complex_id: m.to }).in('id', m.rows.slice(i, i + 100)).select('id')
      if (error) throw new Error(`이동 실패: ${error.message}`)
      moved += data.length
    }
  }
  let cut = 0
  if (cutList) {
    const verified: string[] = JSON.parse(readFileSync(cutList, 'utf8'))
    const set = new Set(verified)
    for (const u of unlinks) {
      if (!set.has(u.key)) continue
      for (let i = 0; i < u.rows.length; i += 100) {
        const { data, error } = await sb.from('transactions').update({ complex_id: null }).in('id', u.rows.slice(i, i + 100)).select('id')
        if (error) throw new Error(`끊기 실패: ${error.message}`)
        cut += data.length
      }
    }
  }
  console.log(`✅ 이동 ${moved.toLocaleString()}건 / 끊기 ${cut.toLocaleString()}건${cutList ? '' : ' (끊기 목록 미지정 — 이동만 수행)'}`)
}

main().catch((e) => { console.error(`[relink] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
