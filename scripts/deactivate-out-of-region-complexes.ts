/**
 * 운영권역 밖 단지 비활성화 — P1-a 9곳 (2026-08-21)
 *
 * [무엇인가]
 * `realtrade-story` 가 카카오 로컬 API 로 활성 단지 1,897곳을 전건 대조해 찾은 것이다
 * (`.planning/inbox/HANDOFF-bds-20260821.md` P1-a). 우리 `sgg_code` 로 들어와 있는데
 * 주소도 좌표도 **운영권역 밖**을 가리키는 단지들이다:
 *
 *   고려맨션        sgg=마산회원구  실제 부산 금정구
 *   덕천상가        sgg=마산합포구  실제 부산 북구
 *   동성빌라1차     sgg=성산구      실제 고성군
 *   현대그린파크맨션 sgg=김해시      실제 창녕군
 *   한백4           sgg=마산합포구  실제 양산시
 *   ... 총 9곳
 *
 * 핸드오프의 진단대로 **동명이지(同名異地) 매칭**이다. 이름이 같은 다른 지역 단지가
 * 우리 권역으로 들어왔고, 주소·좌표가 서로 일치하는 것이 그 증거다(P1 20곳 중 19곳).
 *
 * [왜 sgg_code 정정이 아니라 비활성화인가]
 * 1. `sgg_code` 를 실제 지역으로 고치면 **운영권역 밖 데이터를 계속 들고 있게 된다.**
 *    부산은 2026-08-20 에 활성화됐으니 괜찮지만 창녕·양산·고성은 `regions` 에 없어
 *    어떤 배치도 돌지 않는다 — 갱신되지 않는 고아 레코드가 된다.
 * 2. `url_slug` 가 이미 틀린 채로 만들어져 구글에 나간다:
 *    `창원시/성산구/고성읍/동성빌라1차` — 창원 성산구에 고성읍은 없다.
 * 3. 즐겨찾기 0건이라 사용자 피해 없이 처리할 수 있다(실측 확인).
 *
 * [거래는 지우지 않는다]
 * 붙어 있는 거래 288건은 **실제로 그 지역에서 일어난 거래**다. MOLIT 이 우리 권역
 * `sgg_code` 로 준 것이 아니라, 단지가 잘못 매칭돼 끌려온 것이다. 지우면 원본 손실이다.
 * `complex_id` 만 끊어 미연결로 둔다 — 정직한 상태이고 되돌릴 수 있다.
 *
 * 실행:
 *   npx tsx scripts/deactivate-out-of-region-complexes.ts              # dry-run
 *   npx tsx scripts/deactivate-out-of-region-complexes.ts --apply --backup=b.json
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

/** 핸드오프 P1-a 표 그대로. id 는 원본 문서에서 옮겼다. */
const TARGETS: { id: string; name: string; wrongSgg: string; actual: string }[] = [
  { id: 'a6e9a77e-bd76-4ced-b720-14093171d1a7', name: '동성빌라1차',      wrongSgg: '성산구',     actual: '고성군' },
  { id: 'c94d0c4a-6265-4acb-85d0-c668743760d8', name: '고려맨션',         wrongSgg: '마산회원구', actual: '부산 금정구' },
  { id: '8f568862-d36a-4c4d-9a2f-44c8b9ae1379', name: '금림5차',          wrongSgg: '김해시',     actual: '부산 금정구' },
  { id: 'a1b0e2ed-5af9-4e20-bd3a-11031a450e56', name: '일흥빌라',         wrongSgg: '의창구',     actual: '부산 금정구' },
  { id: '64bc00d3-7b81-4c89-9012-35ba2dcfccdd', name: '덕천상가',         wrongSgg: '마산합포구', actual: '부산 북구' },
  { id: '37a281cf-97f7-42a0-a14b-7032493fa37c', name: '삼광하이츠빌라',   wrongSgg: '김해시',     actual: '부산 사상구' },
  { id: '8c027b48-fa19-473d-9aa0-b7d01603a479', name: '성산그린빌라',     wrongSgg: '의창구',     actual: '부산 사하구' },
  { id: '92627349-fb4b-47ab-b750-fdedf7f65cd1', name: '한백4',            wrongSgg: '마산합포구', actual: '양산시' },
  { id: '86ad8a32-7db7-4062-8fcf-b287e758a988', name: '현대그린파크맨션', wrongSgg: '김해시',     actual: '창녕군' },
]

function has(n: string): boolean { return process.argv.includes(`--${n}`) }
function arg(n: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1]
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const apply = has('apply')
  const backup = arg('backup')
  console.log(`🔗 ${url}\n모드: ${apply ? '🔴 APPLY' : 'dry-run'}\n`)

  const snapshot: Record<string, unknown>[] = []
  let totalTx = 0
  let blocked = false

  for (const t of TARGETS) {
    const { data: cx, error } = await sb
      .from('complexes')
      .select('id, canonical_name, sgg_code, dong, road_address, status, url_slug')
      .eq('id', t.id)
      .maybeSingle()
    if (error) throw new Error(`complexes(${t.name}): ${error.message}`)
    if (!cx) { console.log(`  ⚠️ ${t.name}: 레코드 없음 — 건너뜀`); continue }

    const { data: tx, error: eTx } = await sb
      .from('transactions')
      .select('id')
      .eq('complex_id', t.id)
      .is('cancel_date', null)
      .is('superseded_by', null)
    if (eTx) throw new Error(`transactions(${t.name}): ${eTx.message}`)

    // 🔴 사용자 데이터가 붙어 있으면 손대지 않는다. 실측상 0이지만 확인 없이 지나가지 않는다.
    const { count: fav, error: eFav } = await sb
      .from('favorites').select('id', { count: 'exact', head: true }).eq('complex_id', t.id)
    if (eFav) throw new Error(`favorites(${t.name}): ${eFav.message}`)
    if ((fav ?? 0) > 0) {
      console.log(`  🛑 ${t.name}: 즐겨찾기 ${fav}건 — **건너뛴다.** 사용자 데이터가 붙은 단지는 자동 처리하지 않는다`)
      blocked = true
      continue
    }

    totalTx += tx.length
    snapshot.push({ complex: cx, tx_ids: tx.map((r) => r.id), expected: t })
    console.log(`  ${t.name} (${cx.sgg_code}/${cx.dong}) → 실제 ${t.actual}`)
    console.log(`     status=${cx.status} 거래=${tx.length} slug=${cx.url_slug}`)
  }

  console.log(`\n대상 ${snapshot.length}곳 / 끊을 거래 ${totalTx}건${blocked ? ' (일부 건너뜀)' : ''}`)

  if (backup) { writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), snapshot }, null, 2)); console.log(`📄 백업 ${backup}`) }
  if (!apply) { console.log('\n(dry-run — 아무것도 바꾸지 않았다)'); return }
  if (!backup) throw new Error('--apply 는 --backup=<file> 를 요구한다')

  console.log('\n🔴 적용 중...')
  let cut = 0
  for (const s of snapshot) {
    const ids = s.tx_ids as string[]
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await sb.from('transactions').update({ complex_id: null }).in('id', ids.slice(i, i + 100)).select('id')
      if (error) throw new Error(`거래 끊기 실패: ${error.message}`)
      cut += data.length
    }
    const cid = (s.complex as { id: string }).id
    const { error: eUp } = await sb.from('complexes').update({ status: 'out_of_region' }).eq('id', cid)
    if (eUp) throw new Error(`비활성화 실패: ${eUp.message}`)
  }
  console.log(`✅ 거래 끊기 ${cut}건 / 단지 비활성화 ${snapshot.length}곳`)
}

main().catch((e) => { console.error(`[p1a] 실패: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
