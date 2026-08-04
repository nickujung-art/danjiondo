/**
 * 미연결 거래 중 **모호하지 않은 것만** transactions.complex_id 에 연결한다.
 *
 * 실행:
 *   npx tsx scripts/link-unmatched-safe.ts            # dry-run (기본, 아무것도 안 바꿈)
 *   npx tsx scripts/link-unmatched-safe.ts --apply    # 실제 반영
 *
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * [배경 — 2026-08-04 조사]
 * 운영권역 거래 302,339건 중 21,529건(7.1%)이 단지에 연결되지 않은 채 남아 있다.
 * `complex_match_queue` 에 34,742건이 쌓여 있는데 **큐를 소비하는 코드가 아예 없다** —
 * enqueueMatch/enqueueUnmatched 가 INSERT 만 하고, status 를 resolved/rejected 로 바꾸는
 * 코드가 어디에도 없어 전부 pending 이다.
 *
 * 그런데 이건 "처리기를 만들면 풀리는" 문제가 아니다. 미연결 21,529건을 분해하면:
 *   - complexes 에 후보 자체가 없음      17,800건 (82.7%)  ← 단지 마스터 누락
 *   - 구 단위 유일                        1,888건 ( 8.8%)
 *   - 구 단위 복수(모호)                  1,841건 ( 8.6%)
 * 근본 원인은 매칭 로직이 아니라 **마스터 불완전**이다. 그건 별도 과제다.
 *
 * [왜 이렇게까지 보수적인가]
 * no_match 27,727건의 대부분은 짧은 일반명이다 — 대동(2,970) 동성(1,240) 동원(1,149)
 * 한일(789) 현대(558) 시영 삼성 동아. 이걸 느슨하게 붙이면 **틀린 단지에 거래가 붙는다**:
 *   한일타운   → 한일타운4차아파트   (1·2·3차가 따로 존재)
 *   휴먼빌     → 휴먼빌2단지
 *   대동       → 대동1차황토방
 * 377건을 4차에 붙이는 순간 가격·랭킹·신고가가 통째로 오염된다. 애초에 no_match 로
 * 큐에 넣은 게 옳은 판단이었다. 못 붙이는 편이 틀리게 붙이는 것보다 낫다.
 *
 * [안전 규칙 — 세 겹]
 *  1) 같은 sgg_code **그리고 같은 동(umd_nm)** 안에서만 찾는다. 구 단위로 넓히면 모호가 5배 는다.
 *  2) 후보 이름이 원본명으로 시작하되, **남는 접미사가 허용목록에 있을 때만** 인정한다.
 *     허용: '' (완전일치) / '아파트' / '차' / '차아파트'
 *     실측 접미사 분포에서 위 넷만 안전했다. 예를 들어 이런 것들은 전부 제외된다:
 *       '디지털황토'(338건) — 대동 → 대동디지털황토. 접미사에 숫자는 없지만 완전히 다른 이름
 *       '1차' '2차' '4차아파트' '5단지아파트' '아파트2단지' — 형제 단지가 마스터에 누락됐을 수 있다
 *       '한효' '한일유앤아이' '대아' '타운' — 다른 이름
 *     마스터가 82.7% 비어 있는 상황에서 "유일하니까 맞겠지"는 성립하지 않는다.
 *  3) 그렇게 걸러도 후보가 **정확히 1개**일 때만 쓴다.
 *
 * 결과: 21,529건 중 1,108건(전체 거래의 0.37%)만 대상. 회복량은 작지만 오염 위험이 없다.
 *
 * 멱등하다 — complex_id IS NULL 인 행만 건드리므로 여러 번 돌려도 같은 결과다.
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'
import { describeError } from '../src/lib/api/describe-error'
import { resolveSafeMatch, SAFE_SUFFIXES } from '../src/lib/data/safe-complex-match'

// dev 모드(true)로 읽어야 로컬 `.env.local` 이 잡힌다 — CI 에서는 process.env 가 우선이라 무해하다
loadEnvConfig(process.cwd(), true)

const apply = process.argv.includes('--apply')

/** 운영권역(창원 5구 + 김해) — realtrade-story 와 동일 범위 */
const OPERATING_SGG = ['48121', '48123', '48125', '48127', '48129', '48250'] as const

const PAGE_SIZE = 1000
const UPDATE_CHUNK = 200

interface UnmatchedTx {
  id: number
  sgg_code: string
  umd_nm: string | null
  raw_complex_name: string | null
}

interface ComplexRow {
  id: string
  sgg_code: string | null
  dong: string | null
  canonical_name: string
}

/** PostgREST 1000행 캡을 넘겨 전부 가져온다 */
async function fetchAll<T>(
  run: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await run(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}

// 판정 규칙은 src/lib/data/safe-complex-match.ts 에 있다(테스트가 붙어 있는 곳).
// 이 파일은 조회·UPDATE 만 담당한다.

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[ERROR] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
    process.exit(1)
  }
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } })

  console.log(`모드: ${apply ? '🔴 APPLY (실제 반영)' : '🟢 DRY-RUN (아무것도 바꾸지 않음)'}`)
  console.log(`허용 접미사: ${[...SAFE_SUFFIXES].map((s) => s || '(완전일치)').join(', ')}\n`)

  const complexes = await fetchAll<ComplexRow>(
    (from, to) =>
      supabase
        .from('complexes')
        .select('id, sgg_code, dong, canonical_name')
        .in('sgg_code', [...OPERATING_SGG])
        .order('id')
        .range(from, to) as never,
    'complexes',
  )
  console.log(`대상 단지: ${complexes.length.toLocaleString()}개`)

  // 동 단위로 묶는다. 판정이 동 안에서만 이뤄지므로, 단지가 하나도 없는 동은 조회할 필요조차 없다.
  const byDong = new Map<string, ComplexRow[]>()
  for (const c of complexes) {
    if (!c.sgg_code || !c.dong) continue
    const dongKey = `${c.sgg_code}|${c.dong}`
    const list = byDong.get(dongKey)
    if (list) list.push(c)
    else byDong.set(dongKey, [c])
  }
  console.log(`단지가 있는 동: ${byDong.size}개\n`)

  // 미연결 거래를 **동 단위로 나눠** 조회한다.
  // `complex_id IS NULL` 에는 인덱스가 없어 운영권역 전체를 한 번에 긁으면 statement timeout 이
  // 난다(83만 행, 2026-08-04 실측). `transactions_umd_nm_idx` 를 타도록 umd_nm 을 걸면
  // 각 조회가 선택적이라 빠르다. 어차피 판정도 동 안에서만 하므로 낭비가 없다.
  const plan: { txId: number; complexId: string; from: string; to: string; dong: string }[] = []
  let scanned = 0
  let dongDone = 0

  for (const [dongKey, candidates] of byDong) {
    const [sggCode, dong] = dongKey.split('|') as [string, string]
    const rows = await fetchAll<UnmatchedTx>(
      (from, to) =>
        supabase
          .from('transactions')
          .select('id, sgg_code, umd_nm, raw_complex_name')
          .is('complex_id', null)
          .eq('sgg_code', sggCode)
          .eq('umd_nm', dong)
          .order('id')
          .range(from, to) as never,
      `transactions(${dongKey})`,
    )
    scanned += rows.length

    for (const tx of rows) {
      const match = resolveSafeMatch(tx, candidates)
      if (!match) continue
      plan.push({
        txId: tx.id,
        complexId: match.id,
        from: tx.raw_complex_name ?? '',
        to: match.canonical_name,
        dong,
      })
    }
    dongDone++
    process.stdout.write(`\r동 스캔 ${dongDone}/${byDong.size} — 미연결 ${scanned.toLocaleString()}건 검토, 연결가능 ${plan.length.toLocaleString()}건`)
  }
  console.log('\n')

  console.log(`연결 가능(안전): ${plan.length.toLocaleString()}건 / 단지 ${new Set(plan.map((p) => p.complexId)).size}개`)
  console.log(`보류: ${(scanned - plan.length).toLocaleString()}건 — 모호하거나 마스터에 후보 없음\n`)

  // 이름이 바뀌는 매핑을 사람이 눈으로 확인할 수 있게 상위만 보여준다
  const byMapping = new Map<string, number>()
  for (const p of plan) byMapping.set(`${p.dong} · ${p.from} → ${p.to}`, (byMapping.get(`${p.dong} · ${p.from} → ${p.to}`) ?? 0) + 1)
  console.log('상위 매핑 20개:')
  for (const [label, count] of [...byMapping.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(count).padStart(4)}건  ${label}`)
  }
  console.log(`  … 총 ${byMapping.size}종\n`)

  if (!apply) {
    console.log('DRY-RUN 이라 여기서 끝냅니다. 반영하려면 --apply 를 붙이세요.')
    return
  }

  let updated = 0
  let failed = 0
  for (let i = 0; i < plan.length; i += UPDATE_CHUNK) {
    const chunk = plan.slice(i, i + UPDATE_CHUNK)
    // 단지별로 묶어 한 번에 UPDATE — 거래 1건씩 왕복하면 1,100번이라 시드니 지연이 그대로 쌓인다.
    const byComplex = new Map<string, number[]>()
    for (const p of chunk) {
      const list = byComplex.get(p.complexId)
      if (list) list.push(p.txId)
      else byComplex.set(p.complexId, [p.txId])
    }

    for (const [complexId, txIds] of byComplex) {
      // `.is('complex_id', null)` 를 조건에 남겨 둔다 — 그 사이 다른 배치가 붙였다면 덮지 않는다(멱등)
      const { error } = await supabase
        .from('transactions')
        .update({ complex_id: complexId })
        .in('id', txIds)
        .is('complex_id', null)
      if (error) {
        failed += txIds.length
        console.error(`  ❌ complex=${complexId} ${txIds.length}건: ${error.message}`)
      } else {
        updated += txIds.length
      }
    }
    process.stdout.write(`\r진행 ${Math.min(i + UPDATE_CHUNK, plan.length)}/${plan.length}`)
  }
  console.log()

  console.log(`\n✅ 연결 완료: ${updated.toLocaleString()}건${failed > 0 ? ` (실패 ${failed}건)` : ''}`)

  // 큐 정리는 하지 않는다 — raw_payload.tx_id 로 역추적해야 하는데, 큐 34,742건 중 이번에
  // 붙은 건 일부고 나머지는 여전히 미해결이다. "처리됐다"고 표시하면 남은 문제가 숨는다.
  console.log('※ complex_match_queue 는 건드리지 않았다 — 미해결 건이 숨지 않도록 그대로 둔다.')

  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(describeError(err))
  process.exit(1)
})
