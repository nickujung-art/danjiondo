/**
 * 단지↔주소↔거래 정합성 전면 조사 (2026-08-21)
 *
 * [왜 필요한가]
 * realtrade-story 가 넘긴 감사(.planning/inbox/HANDOFF-bds-20260821.md)는 **단지의
 * 좌표·주소**를 카카오로 대조한 것이다. 그런데 Phase 41 중 드러난 오염은 **거래↔단지
 * 연결**이었다 — 홍익그린빌(김해 내동 121-1)에 대성동 413-4 거래 67건이 붙어 있었다.
 *
 * 두 층위가 다르다:
 *   층위 1  단지가 제 위치에 있나        → 카카오 역지오코딩 (핸드오프가 이미 함)
 *   층위 2  거래가 제 단지에 붙었나       → 지번 대조 (이 스크립트)
 *
 * 층위 2 는 카카오 호출 없이 DB 만으로 판정된다. 거래의 (umd_nm, jibun) 이 단지의
 * 등록 주소와 어긋나면 매칭 오류다.
 *
 * [왜 이런 오염이 생기나 — 근본 원인]
 * `match_complex_by_admin`(20260806100000) 이 동(umd_nm)을 **3단계에서만** 본다:
 *   0단계 별칭 정확 일치      — 동 안 봄
 *   1단계 trigram >= 0.9      — 동 안 봄  ← 대부분 여기서 확정된다
 *   2단계 양방향 LIKE unique  — 동 안 봄
 *   3단계 동 필터 + LIKE      — 동 봄 (2단계가 복수일 때만 도달)
 * 주석이 사유를 밝힌다: "동 필터 없음 — 기존 매칭 회귀 방지". 의도된 절충이고
 * 그 대가가 이 오염이다. CLAUDE.md 의 "단지명 단독 매칭 금지" 가 거래 연결 경로에서는
 * 실질적으로 지켜지지 않는다.
 *
 * 실행:
 *   npx tsx scripts/audit-complex-address-match.ts                 # 운영권역
 *   npx tsx scripts/audit-complex-address-match.ts --busan         # 부산
 *   npx tsx scripts/audit-complex-address-match.ts --all           # 전 활성 지역
 *   npx tsx scripts/audit-complex-address-match.ts --json=out.json # 기계 판독 출력 (🔴 = 필수)
 *
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 🔴 카카오 API 를 호출하지 않는다. 핸드오프 '주의' 절이 연속 재실행을 금지했고,
 * 이 판정에는 필요하지 않다.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const CORE_SGG = ['48121', '48123', '48125', '48127', '48129', '48250']
const BUSAN_SGG = [
  '26110', '26140', '26170', '26200', '26230', '26260', '26290', '26320',
  '26350', '26380', '26410', '26440', '26470', '26500', '26530', '26710',
]

/** 소수 동의 거래가 이 건수 이상이면 '오염 후보'로 본다. complex_integrity_counts 와 같은 임계. */
const MINORITY_MIN = 50
/** 이 비율 이상이면 '두 단지가 합쳐진 것'으로 의심한다 (반반에 가까움). */
const MERGE_SUSPECT_RATIO = 0.4
/** 표본이 이 미만이면 비율이 요동쳐 판정하지 않는다. */
const MIN_SAMPLE = 20

interface TxRow {
  complex_id: string
  umd_nm: string | null
  jibun: string | null
}

interface ComplexRow {
  id: string
  canonical_name: string
  sgg_code: string
  dong: string | null
  jibun_address: string | null
  road_address: string | null
  lat: number | null
  status: string
}

type Verdict =
  | 'ok'
  | 'minor_dong'        // 소수 동이 있으나 임계 미만
  | 'contaminated'      // 소수 동 >= MINORITY_MIN
  | 'merge_suspect'     // 두 동이 거의 반반 — 합쳐진 단지 의심
  | 'dong_mismatch'     // 등록 dong 이 거래 최다 동과 다름
  | 'no_tx'

interface Finding {
  id: string
  name: string
  sgg_code: string
  registered_dong: string | null
  road_address: string | null
  tx_total: number
  dong_dist: Record<string, number>
  jibun_top: [string, number][]
  verdict: Verdict
  note: string
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.split('=')[1]
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const scope = hasFlag('all') ? null : hasFlag('busan') ? BUSAN_SGG : CORE_SGG
  console.log(`🔗 ${url}`)
  console.log(`📍 범위: ${scope ? scope.join(',') : '전 활성 지역'}`)

  // ── 단지 ────────────────────────────────────────────────────────────────
  const complexes: ComplexRow[] = []
  for (let p = 0; ; p++) {
    let q = sb
      .from('complexes')
      .select('id, canonical_name, sgg_code, dong, jibun_address, road_address, lat, status')
      .eq('status', 'active')
      .range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`complexes 조회 실패: ${error.message}`)
    complexes.push(...(data as unknown as ComplexRow[]))
    if (data.length < 1000) break
  }
  console.log(`   활성 단지 ${complexes.length.toLocaleString()}곳`)

  // ── 거래 (complex_id 있는 것만, 한 번에 훑는다) ──────────────────────────
  // 🔴 CLAUDE.md 규약: cancel_date IS NULL AND superseded_by IS NULL
  const byComplex = new Map<string, TxRow[]>()
  let txScanned = 0
  for (let p = 0; ; p++) {
    let q = sb
      .from('transactions')
      .select('complex_id, umd_nm, jibun')
      .not('complex_id', 'is', null)
      .is('cancel_date', null)
      .is('superseded_by', null)
      .range(p * 1000, p * 1000 + 999)
    if (scope) q = q.in('sgg_code', scope)
    const { data, error } = await q
    if (error) throw new Error(`transactions 조회 실패(page ${p}): ${error.message}`)
    for (const t of data as unknown as TxRow[]) {
      const arr = byComplex.get(t.complex_id)
      if (arr) arr.push(t)
      else byComplex.set(t.complex_id, [t])
    }
    txScanned += data.length
    if (p % 50 === 0) process.stderr.write(`\r   거래 스캔 ${txScanned.toLocaleString()}건...`)
    if (data.length < 1000) break
  }
  process.stderr.write(`\r   거래 스캔 ${txScanned.toLocaleString()}건 완료          \n`)

  // ── 판정 ────────────────────────────────────────────────────────────────
  const findings: Finding[] = []
  for (const c of complexes) {
    const tx = byComplex.get(c.id) ?? []
    if (tx.length === 0) {
      findings.push({
        id: c.id, name: c.canonical_name, sgg_code: c.sgg_code,
        registered_dong: c.dong, road_address: c.road_address,
        tx_total: 0, dong_dist: {}, jibun_top: [], verdict: 'no_tx', note: '거래 없음',
      })
      continue
    }
    const dongDist: Record<string, number> = {}
    const jibunDist: Record<string, number> = {}
    for (const t of tx) {
      const d = t.umd_nm ?? '(null)'
      dongDist[d] = (dongDist[d] ?? 0) + 1
      const j = `${d} ${t.jibun ?? '(null)'}`
      jibunDist[j] = (jibunDist[j] ?? 0) + 1
    }
    const sorted = Object.entries(dongDist).sort((a, b) => b[1] - a[1])
    const [topDong, topCount] = sorted[0]
    const minorityCount = tx.length - topCount
    const jibunTop = Object.entries(jibunDist).sort((a, b) => b[1] - a[1]).slice(0, 4) as [string, number][]

    let verdict: Verdict = 'ok'
    let note = ''
    if (tx.length < MIN_SAMPLE) {
      verdict = sorted.length > 1 ? 'minor_dong' : 'ok'
      note = `표본 ${tx.length}건 — 판정 보류`
    } else if (sorted.length > 1 && minorityCount / tx.length >= MERGE_SUSPECT_RATIO) {
      verdict = 'merge_suspect'
      note = `소수 비율 ${(minorityCount / tx.length * 100).toFixed(0)}% — 두 단지 병합 의심`
    } else if (sorted.length > 1 && minorityCount >= MINORITY_MIN) {
      verdict = 'contaminated'
      note = `소수 동 ${minorityCount}건 (임계 ${MINORITY_MIN})`
    } else if (sorted.length > 1) {
      verdict = 'minor_dong'
      note = `소수 동 ${minorityCount}건 — 임계 미만`
    }
    // 등록 dong 이 거래 최다 동과 다르면 별도 표시 (더 강한 신호)
    if (c.dong && topDong !== '(null)' && !topDong.startsWith(c.dong) && !c.dong.startsWith(topDong)) {
      verdict = 'dong_mismatch'
      note = `등록 dong="${c.dong}" 인데 거래 최다 동="${topDong}" (${topCount}건)`
    }
    findings.push({
      id: c.id, name: c.canonical_name, sgg_code: c.sgg_code,
      registered_dong: c.dong, road_address: c.road_address,
      tx_total: tx.length, dong_dist: dongDist, jibun_top: jibunTop, verdict, note,
    })
  }

  // ── 출력 ────────────────────────────────────────────────────────────────
  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length
  console.log('\n=== 판정 요약 ===')
  console.log(`  ok             ${count('ok')}`)
  console.log(`  minor_dong     ${count('minor_dong')}   (소수 동 있으나 임계 미만)`)
  console.log(`  contaminated   ${count('contaminated')}   🔴 소수 동 ${MINORITY_MIN}건 이상`)
  console.log(`  merge_suspect  ${count('merge_suspect')}   🔴 두 단지 병합 의심`)
  console.log(`  dong_mismatch  ${count('dong_mismatch')}   🔴 등록 동 ≠ 거래 최다 동`)
  console.log(`  no_tx          ${count('no_tx')}`)

  const bad = findings.filter((f) =>
    f.verdict === 'contaminated' || f.verdict === 'merge_suspect' || f.verdict === 'dong_mismatch')
  bad.sort((a, b) => b.tx_total - a.tx_total)
  console.log(`\n=== 🔴 오염 후보 ${bad.length}곳 ===`)
  for (const f of bad) {
    console.log(`\n  [${f.verdict}] ${f.sgg_code} ${f.name}  (거래 ${f.tx_total})`)
    console.log(`    등록: dong=${f.registered_dong} / ${f.road_address ?? '주소없음'}`)
    console.log(`    동별: ${JSON.stringify(f.dong_dist)}`)
    console.log(`    지번: ${f.jibun_top.map(([k, v]) => `${k}=${v}`).join(' | ')}`)
    console.log(`    → ${f.note}`)
  }

  const out = arg('json')
  if (out) {
    writeFileSync(out, JSON.stringify({ scanned_at: new Date().toISOString(), scope, findings }, null, 2))
    console.log(`\n📄 전건 저장: ${out}`)
  }
}

main().catch((e) => {
  console.error(`[audit] 실패: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
