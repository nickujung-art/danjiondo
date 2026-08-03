/**
 * onConflict ↔ 실제 UNIQUE 제약 대조 게이트 — 라이브 DB 필요. (Phase 39 F-05)
 *
 * `AUDIT_ROOTS`(= `src` · `card-news/scripts` · `scripts`) 아래의 모든
 * `.upsert(…, { onConflict: '…' })` 지점을 정적 수집해, 그 컬럼 목록이 실제 카탈로그의
 * **추론 가능한**(비부분·비표현식·valid) UNIQUE 인덱스와 일치하는지 대조한다.
 * Phase 39 의 고장 4 건은 전부 "마이그레이션이 제약을 바꿨는데 코드는 그대로" 였다.
 *
 * 🔴 40-03: 범위가 `src/` → **저장소 전체**로 넓어졌다. `card-news/scripts/*.js` 의 upsert 가
 *    감사 밖에 있으면 새 `onConflict` 가 게이트를 **공허하게 통과**한다 (T-40-03-02).
 *
 * ⚠️ **이 파일은 CI 에서 영구히 skip 된다.** `.github/workflows/ci.yml` 의 unit-test 잡은
 *    `npm run test` 를 `env:` 블록 없이 실행하므로 `TEST_SUPABASE_SKEY` 가 없다.
 *    CI 에 자격증명을 넣기 전까지 이 대조는 **수동 실행**해야 한다:
 *
 *      TEST_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL> \
 *      TEST_SUPABASE_SKEY=<SUPABASE_SERVICE_ROLE_KEY> \
 *        npx vitest run src/__tests__/onconflict-constraint-gate.test.ts
 *
 *    자동 실행에서 항상 단언되는 부분(부분 인덱스 오판 방지 + 실물 스캐너 건전성)은
 *    `src/lib/db/onconflict-audit.test.ts` 에 있다 — 여기 중복해서 넣지 말 것.
 */
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  AUDIT_ROOTS,
  auditSites,
  collectAllUpsertSites,
  formatAuditTable,
  toInferrable,
  type RawUniqueIndex,
  type InferrableIndex,
  type UpsertSite,
} from '@/lib/db/onconflict-audit'
import { SKEY, URL_, admin } from './helpers/db'

// RPC 는 src/types/database.ts 에 없다. 재생성하면 무관한 대규모 diff 가 생겨 회귀 위험만
// 커지므로(Phase 38 선례) 호출부에서 로컬 타입 + 캐스트로 처리한다.
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

type PostgrestErrorish = { code?: string; message?: string } | null

async function callRpc(table: string): Promise<{ data: unknown; error: PostgrestErrorish }> {
  const res = await (admin as unknown as RpcClient).rpc('unique_indexes_for_table', { p_table: table })
  return { data: res.data, error: res.error as PostgrestErrorish }
}

/**
 * 🔴 **"게이트를 돌릴 환경이 아님" 과 "돌렸더니 틀림" 을 구분한다.**
 *
 * `.env.test.local` 은 로컬 스택(`http://127.0.0.1:54321`)의 키를 채워두므로 `SKEY` 가
 * 비어 있지 않다 — `skipIf(!SKEY)` 만으로는 스택이 꺼져 있거나 마이그레이션이 안 걸린
 * 로컬 환경에서 skip 되지 않고 **실패**한다. 그러면 로컬 DB 의존 사전 실패 목록이 늘어난다.
 *
 * 그래서 게이트의 **전제**가 없을 때만 skip 한다:
 *   - REST 에 닿지 못함 (스택이 꺼져 있음)
 *   - PGRST202 — `unique_indexes_for_table` 자체가 없음 (마이그레이션 미적용 환경)
 * 그 외의 오류·불일치는 전부 **FAIL** 이다.
 *
 * ⚠️ 이 skip 은 조용하지 않다 — 아래 `console.warn` 으로 사유와 재실행 커맨드를 찍는다.
 *    "게이트가 초록이니 안전하다" 가 아니라 "게이트가 돌지 않았다" 를 읽을 수 있어야 한다.
 */
let readiness: Promise<string | null> | null = null
/** 준비됐으면 null, 아니면 skip 사유 문자열. */
function gateNotReadyReason(): Promise<string | null> {
  readiness ??= (async () => {
    try {
      const { error } = await callRpc('new_listings')
      if (error?.code === 'PGRST202') {
        return `${URL_} 에 unique_indexes_for_table 이 없다 (마이그레이션 미적용 환경)`
      }
      return null
    } catch (e) {
      return `${URL_} 에 닿지 못했다: ${e instanceof Error ? e.message : String(e)}`
    }
  })()
  return readiness
}

function skipNote(reason: string): string {
  return `[onconflict-gate] SKIPPED — ${reason}
  이 게이트는 실행되지 않았다. 실제 제약과의 대조가 필요하면 수동 실행:
    TEST_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL> TEST_SUPABASE_SKEY=<SUPABASE_SERVICE_ROLE_KEY> \\
      npx vitest run src/__tests__/onconflict-constraint-gate.test.ts`
}

async function uniqueIndexesFor(table: string): Promise<RawUniqueIndex[]> {
  const { data, error } = await callRpc(table)
  expect(error, `unique_indexes_for_table('${table}') RPC 실패: ${JSON.stringify(error)}`).toBeNull()
  return (data ?? []) as RawUniqueIndex[]
}

// 이 파일은 src/__tests__/ 에 있다 → ../.. = <repo>. CWD 의존을 피한다.
// 🔴 40-03: `src/` 가 아니라 **저장소 루트**다. 스캔 루트 목록은 `AUDIT_ROOTS` 한 곳에만 있고
//    (`@/lib/db/onconflict-audit`), 그 내용은 `onconflict-audit.test.ts` 케이스 25 가 못 박는다.
const REPO_ROOT = path.resolve(__dirname, '../..')

describe.skipIf(!SKEY)('onConflict ↔ UNIQUE 제약 대조 게이트 (라이브 DB)', () => {
  // distinct 테이블 수(40-03 확장 후 실측 27개)만큼 RPC 왕복이 필요하다. 병렬로 보내도
  // 기본 5초 타임아웃은 원격 프로덕션 기준으로 빠듯해서 명시적으로 늘린다.
  it(
    `저장소 전체(${AUDIT_ROOTS.join(' · ')})의 모든 upsert 지점이 추론 가능한 UNIQUE 인덱스와 일치한다`,
    { timeout: 120_000 },
    async (ctx) => {
      const notReady = await gateNotReadyReason()
      if (notReady) {
        console.warn(skipNote(notReady))
        return ctx.skip()
      }
      const sites = collectAllUpsertSites(REPO_ROOT)
      const tables = [...new Set(sites.map((s) => s.table))]

      const fetched = await Promise.all(
        tables.map(async (table) => [table, toInferrable(await uniqueIndexesFor(table))] as const),
      )
      const indexesByTable: Record<string, InferrableIndex[]> = Object.fromEntries(fetched)

      const results = auditSites(sites, indexesByTable)
      const failures = results.filter((r) => r.verdict !== 'ok')

      // 🔴 이 게이트는 **수동 실행 전용**이다(CI 에 자격증명이 없다). 통과했을 때도 감사 표를
      //    찍어야 "무엇이 대조됐는지" 를 기록으로 남길 수 있다 — 초록불만으로는
      //    스캐너가 0 건을 수집한 공허한 통과와 구분되지 않는다.
      // eslint-disable-next-line no-console -- 수동 게이트의 산출 증거. 표 자체가 결과물이다.
      console.log(
        `\n[onconflict-gate] 감사 대상 ${results.length}건 / 테이블 ${tables.length}종\n` +
          formatAuditTable(results),
      )

      // 실패 시 어느 파일:행의 어떤 컬럼 목록이 어떤 인덱스와 안 맞는지 바로 보이게 한다.
      expect(
        failures.map((f) => `${f.site.file}:${f.site.line}`),
        `\n${formatAuditTable(results)}\n`,
      ).toEqual([])
    },
  )

  it('🔴 라이브 음성 대조 — new_listings 의 부분 인덱스는 추론 대상에서 제외된다', async (ctx) => {
    const notReady = await gateNotReadyReason()
    if (notReady) {
      console.warn(skipNote(notReady))
      return ctx.skip()
    }
    // F-03 결정에 따라 new_listings_molit_name_region_idx (부분) 는 **영구 유지**된다.
    // 픽스처 기반 음성 대조(onconflict-audit.test.ts)만으로는 RPC 가 is_partial 을 잘못
    // 채우는 경우를 못 잡는다 — 그래서 라이브에서도 한 번 확인한다.
    const rows = await uniqueIndexesFor('new_listings')
    const partial = rows.find((r) => r.index_name === 'new_listings_molit_name_region_idx')

    expect(partial, 'new_listings_molit_name_region_idx 가 카탈로그에 없다').toBeDefined()
    expect(partial?.is_partial, 'RPC 가 부분 인덱스를 is_partial=true 로 표시해야 한다').toBe(true)
    expect([...(partial?.columns ?? [])].sort()).toEqual(['name', 'region'])

    const inferrable = toInferrable(rows)
    expect(inferrable.map((i) => i.name)).not.toContain('new_listings_molit_name_region_idx')

    // 따라서 옛 onConflict: 'name,region' 은 라이브 카탈로그 기준으로도 FAIL 이다.
    const legacy: UpsertSite = {
      file: '(historical)',
      line: 0,
      table: 'new_listings',
      columns: ['name', 'region'],
    }
    const [verdict] = auditSites([legacy], { new_listings: inferrable })
    expect(verdict?.verdict).toBe('no_matching_index')
  })
})
