/**
 * 적재 직후 단지 연결률 검사 — 백필이 조용히 미연결 더미를 만드는 것을 막는다.
 *
 * [왜 필요한가]
 * 2026-05-26 백필에서 창원·김해만 15,315건이 complex_id=null 로 적재됐다. 그날 적재된
 * 18,934건 중 연결된 것은 3,619건(19.1%)뿐이었는데, **아무도 몰랐다.** 4개월 뒤
 * 마린애시앙(4,298세대) 상세 페이지에 "4개월째 거래 없음"이 뜨고 나서야 발견됐다.
 *
 * 원인은 매칭 RPC 실패가 "매칭 없음"과 구분되지 않고 캐시에까지 굳은 것이었고
 * (src/lib/data/complex-id-lookup.ts 에서 수정), 그 위에 **아무도 결과를 보지 않는**
 * 문제가 겹쳐 있었다. 이 스크립트는 후자를 막는다.
 *
 * 실행:
 *   npx tsx scripts/check-ingest-linkage.ts --since-hours=6 --sgg=48121,48123
 *   npx tsx scripts/check-ingest-linkage.ts --since-hours=6 --min-linked-pct=85
 *
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 연결률이 임계 미만이면 **비정상 종료(exit 1)** 한다. 워크플로가 빨간불이 되어야
 * 사람이 본다. 조용한 성공이 이 프로젝트의 반복된 실패 원인이었다.
 */
import { createClient } from '@supabase/supabase-js'

/**
 * 기본 검사 범위 — 창원 5구 + 김해.
 *
 * **범위를 안 정하면 이 검사는 무의미하다.** 실측(2026-08-06, 최근 30일 적재):
 *   운영권역(창원·김해)  2,974건 중 연결 88.7%
 *   기타 지역          324,295건 중 연결 50.5%
 * 기타 지역이 낮은 건 장애가 아니라 그 지역 complexes 등록이 부실하기 때문이다.
 * 전국을 한 임계로 재면 상시 빨간불이 되고, 그러면 아무도 안 본다.
 */
const DEFAULT_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']
/** 운영권역 기준선 88.7% 대비 여유를 둔 값. 이보다 낮으면 매칭 경로를 의심한다. */
const DEFAULT_MIN_LINKED_PCT = 80
/** 이 건수 미만이면 비율이 요동치므로 판정하지 않는다 */
const MIN_SAMPLE = 50

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.split('=')[1]
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

  const sinceHours = Number(arg('since-hours') ?? 6)
  const minPct = Number(arg('min-linked-pct') ?? DEFAULT_MIN_LINKED_PCT)
  // --sgg=all 이면 전국(임계는 호출부가 --min-linked-pct 로 직접 줘야 의미가 있다)
  const sggArg = arg('sgg')
  const sggCodes =
    sggArg === 'all' ? undefined : (sggArg?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SGG_CODES)

  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const supabase = createClient(url, key)

  function base() {
    let q = supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .is('cancel_date', null)
      .is('superseded_by', null)
    if (sggCodes?.length) q = q.in('sgg_code', sggCodes)
    return q
  }

  const [{ count: total, error: totalErr }, { count: unlinked, error: unlinkedErr }] =
    await Promise.all([base(), base().is('complex_id', null)])

  if (totalErr) throw new Error(`총계 조회 실패: ${totalErr.message}`)
  if (unlinkedErr) throw new Error(`미연결 조회 실패: ${unlinkedErr.message}`)

  const totalRows = total ?? 0
  const unlinkedRows = unlinked ?? 0
  const linkedRows = totalRows - unlinkedRows
  const pct = totalRows > 0 ? (linkedRows / totalRows) * 100 : 100

  const scope = sggCodes?.length ? sggCodes.join(',') : '전체'
  console.log(`[linkage] 최근 ${sinceHours}시간 적재 (${scope})`)
  console.log(`  총 ${totalRows.toLocaleString()}건 / 연결 ${linkedRows.toLocaleString()}건 / 미연결 ${unlinkedRows.toLocaleString()}건`)
  console.log(`  연결률 ${pct.toFixed(1)}% (임계 ${minPct}%)`)

  if (totalRows < MIN_SAMPLE) {
    console.log(`  → 표본 ${MIN_SAMPLE}건 미만이라 판정하지 않는다.`)
    return
  }

  if (pct < minPct) {
    console.error(
      `\n❌ 연결률이 임계 미만이다. 2026-05-26 사고(19.1%)와 같은 상태일 수 있다.\n` +
        `   매칭 RPC 실패를 의심하고 Actions 로그와 ingest_runs.error_message 를 확인할 것.\n` +
        `   복구는 scripts/link-unmatched-safe.ts (기본 dry-run, --apply 로 반영).`,
    )
    process.exit(1)
  }

  console.log('  ✅ 정상')
}

main().catch((err) => {
  console.error(`[linkage] 검사 실패: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
