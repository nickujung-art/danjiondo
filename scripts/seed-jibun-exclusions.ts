/**
 * 끊은 오연결을 지번 제외 목록에 넣는다 (2026-08-26)
 *
 * [왜 필요한가]
 * 지번 게이트는 **긍정 정보만** 담는다 — "(sgg,umd,jibun) 은 단지 X 것이다".
 * 오연결을 끊으면 그 지번의 확정 주인이 0곳이 되어 게이트가 침묵하고, 이름 매칭이
 * 원래 단지에 다시 붙인다. **끊는 행위 자체가 게이트를 무력화한다.**
 *
 * 2026-08-26 실측 — 그날 끊은 8,628건 중:
 *   게이트 무보호 180묶음 / 5,603건
 *   상위 60묶음을 **실제 raw_complex_name 으로** 재매칭 → 57개(4,720건)가 원래 단지로 복귀
 *
 * `complex_jibun_exclusions`(20260826130000)에 부정 근거를 넣어 막는다.
 *
 * [입력]
 * `relink-verified.ts` 가 남긴 백업 JSON 이다. `action: 'unlink'` 인 op 만 취한다 —
 * 이동(move)은 목표가 그 지번의 새 주인이 되어 게이트가 이미 보호한다.
 *
 * [basis 는 필수다]
 * 테이블이 NOT NULL + 공백 금지로 강제한다. 백업에 근거가 없으면 --basis 로 준다.
 * 근거 없는 제외는 나중에 왜 넣었는지 알 수 없고, 잘못돼도 못 찾는다.
 *
 * 실행:
 *   npx tsx scripts/seed-jibun-exclusions.ts --in=a.json --in2=b.json --basis="..." --source="..."
 *   npx tsx scripts/seed-jibun-exclusions.ts --in=... --apply
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const has = (n: string) => process.argv.includes(`--${n}`)
const arg = (n: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : undefined
}

interface Op {
  action: string
  name: string
  sgg_code: string
  umd_nm: string
  jibun: string
  ids: number[]
  complex_id: string
}

interface Row {
  complex_id: string
  sgg_code: string
  umd_nm: string
  jibun: string
  basis: string
  source: string
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const paths = ['in', 'in2', 'in3', 'in4', 'in5', 'in6', 'in7', 'in8']
    .map((k) => arg(k)).filter((x): x is string => !!x)
  if (!paths.length) throw new Error('--in=<relink 백업 json> 필요')

  const defaultBasis = arg('basis')
  const apply = has('apply')

  const rows: Row[] = []
  const seen = new Set<string>()
  let moves = 0
  for (const p of paths) {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { ops?: Op[]; basis?: string }
    const fileBasis = j.basis ?? defaultBasis
    for (const o of j.ops ?? []) {
      if (o.action !== 'unlink') { moves++; continue }
      const k = `${o.complex_id}|${o.sgg_code}|${o.umd_nm}|${o.jibun}`
      if (seen.has(k)) continue
      seen.add(k)
      const basis = fileBasis
        ?? `2026-08-26 오연결 정리로 끊음 — ${o.name} 에 붙어 있던 ${o.umd_nm} ${o.jibun} 거래 ${o.ids.length}건. 카카오 거리 검증으로 다른 곳임을 확인했다.`
      rows.push({
        complex_id: o.complex_id, sgg_code: o.sgg_code, umd_nm: o.umd_nm, jibun: o.jibun,
        basis, source: path.basename(p),
      })
    }
  }

  console.log(`🔗 ${url} / 모드: ${apply ? '🔴 APPLY' : 'dry-run'}`)
  console.log(`입력 ${paths.length}개 / 끊기 묶음 ${rows.length}개 (이동 ${moves}개는 게이트가 이미 보호하므로 제외)`)

  // 🔴 basis 가 빈 것은 넣지 않는다. 테이블도 막지만 여기서 먼저 걸러 사유를 보여준다.
  const blank = rows.filter((r) => !r.basis.trim())
  if (blank.length) {
    console.error(`\n❌ basis 가 비어 있는 ${blank.length}건 — --basis 로 주거나 백업에 넣을 것`)
    blank.slice(0, 5).forEach((r) => console.error(`   ${r.umd_nm} ${r.jibun}`))
    process.exit(1)
  }

  const bySgg = new Map<string, number>()
  for (const r of rows) bySgg.set(r.sgg_code, (bySgg.get(r.sgg_code) ?? 0) + 1)
  console.log(`시군구별: ${[...bySgg.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' / ')}`)
  console.log('\n표본 5건:')
  for (const r of rows.slice(0, 5)) console.log(`  ${r.umd_nm} ${r.jibun}  ← ${r.basis.slice(0, 70)}…`)

  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다. 적용하려면 --apply)'); return }

  console.log('\n🔴 적용 중...')
  let done = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    // PK 는 (complex_id, sgg_code, umd_nm, jibun) — 비부분 UNIQUE 라 onConflict 추론 가능하다
    // (CLAUDE.md CRITICAL: 부분 인덱스였다면 42P10 으로 죽는다).
    const { error } = await sb.from('complex_jibun_exclusions')
      .upsert(chunk, { onConflict: 'complex_id,sgg_code,umd_nm,jibun' })
    if (error) throw new Error(`적재 실패: ${error.message}`)
    done += chunk.length
    console.log(`  … ${done}/${rows.length}`)
  }
  console.log(`\n✅ ${done}건 적재.`)
}

main().catch((e) => { console.error(`[seed-exclusions] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
