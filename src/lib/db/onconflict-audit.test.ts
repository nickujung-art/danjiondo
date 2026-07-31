/**
 * onConflict ↔ UNIQUE 제약 감사 — DB 불필요 단위 테스트. (Phase 39 F-05)
 *
 * 🔴 이 파일은 **어떤 환경에서도 전부 실행**되어야 한다.
 *    `describe.skipIf` 를 쓰지 않고 `src/__tests__/helpers/*` 를 import 하지 않는다.
 *    `.github/workflows/ci.yml` 의 unit-test 잡은 `npm run test` 를 `env:` 블록 없이 실행한다 —
 *    `TEST_SUPABASE_SKEY` 도 Supabase 서비스도 없으므로 라이브 게이트
 *    (src/__tests__/onconflict-constraint-gate.test.ts) 는 CI 에서 영구히 skip 된다.
 *    따라서 **CI 자동 실행에서 실물 `src/` 에 대해 단언되는 사실은 이 파일이 전부다.**
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditSites,
  collectUpsertSites,
  formatAuditTable,
  toInferrable,
  type RawUniqueIndex,
  type UpsertSite,
} from './onconflict-audit'

// ─────────────────────────────────────────────────────────────────────────────
// 픽스처 — 2026-07-31 프로덕션 `unique_indexes_for_table('favorites')` 실측 출력 그대로.
// 이 형태가 16 일간 즐겨찾기 추가를 100% 막았다 (Phase 39 F-02, 42P10).
// 부분 인덱스 2 개는 **의도된 설계라 지금도 유지된다** — 그래서 이 픽스처는 앞으로도 유효하다.
// ─────────────────────────────────────────────────────────────────────────────
const FAVORITES_INDEXES: RawUniqueIndex[] = [
  {
    index_name: 'favorites_area_type_alert_unique_idx',
    columns: ['area_type_id', 'complex_id', 'site_id', 'user_id'],
    is_partial: true,
    is_expression: false,
    is_valid: true,
  },
  {
    index_name: 'favorites_complex_favorite_unique_idx',
    columns: ['complex_id', 'site_id', 'user_id'],
    is_partial: true,
    is_expression: false,
    is_valid: true,
  },
  {
    index_name: 'favorites_pkey',
    columns: ['id'],
    is_partial: false,
    is_expression: false,
    is_valid: true,
  },
]

const site = (table: string, cols: string, line = 1): UpsertSite => ({
  file: 'fixture.ts',
  line,
  table,
  columns: cols
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .sort(),
})

describe('toInferrable — 추론 가능한 UNIQUE 인덱스만 남긴다', () => {
  it('실측 favorites 3행 중 비부분 pkey 1행만 남는다', () => {
    const inferrable = toInferrable(FAVORITES_INDEXES)
    expect(inferrable).toHaveLength(1)
    expect(inferrable[0]!.name).toBe('favorites_pkey')
    expect(inferrable[0]!.columns).toEqual(['id'])
  })

  it('is_expression=true / is_valid=false 행이 각각 제외된다', () => {
    const rows: RawUniqueIndex[] = [
      { index_name: 'expr_idx', columns: ['a'], is_partial: false, is_expression: true, is_valid: true },
      { index_name: 'invalid_idx', columns: ['b'], is_partial: false, is_expression: false, is_valid: false },
      { index_name: 'good_idx', columns: ['c'], is_partial: false, is_expression: false, is_valid: true },
    ]
    const names = toInferrable(rows).map((i) => i.name)
    expect(names).toEqual(['good_idx'])
  })

  it('columns 를 정렬해 돌려준다', () => {
    const rows: RawUniqueIndex[] = [
      { index_name: 'i', columns: ['z', 'a', 'm'], is_partial: false, is_expression: false, is_valid: true },
    ]
    expect(toInferrable(rows)[0]!.columns).toEqual(['a', 'm', 'z'])
  })
})

describe('auditSites — 판정', () => {
  // 🔴 음성 대조 ①. 수정 전 favorites 형태 + 수정 전 onConflict 값.
  //    컬럼 이름만 비교하는 구현이었다면 여기서 통과해버린다.
  it('🔴 음성 대조 ① 수정 전 favorites 형태 + onConflict:user_id,complex_id → no_matching_index', () => {
    const results = auditSites([site('favorites', 'user_id,complex_id')], {
      favorites: toInferrable(FAVORITES_INDEXES),
    })
    expect(results[0]!.verdict).toBe('no_matching_index')
    expect(results[0]!.matchedIndex).toBeNull()
  })

  // 🔴 음성 대조 ②. "컬럼만 맞춘 그럴듯한 오답".
  //    favorites_complex_favorite_unique_idx 와 컬럼 집합이 **정확히 같지만** 그 인덱스는 부분이라
  //    PostgREST 는 여전히 42P10 으로 실패한다. 이걸 통과시키는 게이트는 없느니만 못하다.
  it('🔴 음성 대조 ② 컬럼 집합이 부분 인덱스와 정확히 같아도 → no_matching_index', () => {
    const target = FAVORITES_INDEXES.find((i) => i.index_name === 'favorites_complex_favorite_unique_idx')!
    // 전제 확인: 컬럼 집합이 실제로 동일하다 — 즉 "컬럼만 비교"였다면 반드시 오탐이 났을 상황이다
    expect([...(target.columns ?? [])].sort()).toEqual(['complex_id', 'site_id', 'user_id'])

    const results = auditSites([site('favorites', 'user_id,complex_id,site_id')], {
      favorites: toInferrable(FAVORITES_INDEXES),
    })
    expect(results[0]!.verdict).toBe('no_matching_index')
    expect(results[0]!.matchedIndex).toBeNull()
  })

  it('양성 대조: 비부분 인덱스와 컬럼 집합이 같으면 ok', () => {
    const results = auditSites([site('facility_kapt', 'complex_id,data_month')], {
      facility_kapt: [{ name: 'facility_kapt_complex_month_key', columns: ['complex_id', 'data_month'] }],
    })
    expect(results[0]!.verdict).toBe('ok')
    expect(results[0]!.matchedIndex).toBe('facility_kapt_complex_month_key')
  })

  it('컬럼 순서가 달라도 같은 집합이면 ok (ON CONFLICT 추론은 집합 기준)', () => {
    const results = auditSites([site('facility_kapt', 'data_month,complex_id')], {
      facility_kapt: [{ name: 'facility_kapt_complex_month_key', columns: ['complex_id', 'data_month'] }],
    })
    expect(results[0]!.verdict).toBe('ok')
    expect(results[0]!.matchedIndex).toBe('facility_kapt_complex_month_key')
  })

  it('부분집합은 일치가 아니다', () => {
    const results = auditSites([site('facility_kapt', 'complex_id')], {
      facility_kapt: [{ name: 'facility_kapt_complex_month_key', columns: ['complex_id', 'data_month'] }],
    })
    expect(results[0]!.verdict).toBe('no_matching_index')
  })

  it('상위집합도 일치가 아니다', () => {
    const results = auditSites([site('facility_kapt', 'complex_id,data_month,site_id')], {
      facility_kapt: [{ name: 'facility_kapt_complex_month_key', columns: ['complex_id', 'data_month'] }],
    })
    expect(results[0]!.verdict).toBe('no_matching_index')
  })

  it('indexesByTable 에 키가 없으면 table_unknown', () => {
    const results = auditSites([site('nope', 'a,b')], {})
    expect(results[0]!.verdict).toBe('table_unknown')
  })

  it('formatAuditTable 이 실패 항목의 파일·행·컬럼을 담은 표를 만든다', () => {
    const results = auditSites([site('favorites', 'user_id,complex_id', 42)], {
      favorites: toInferrable(FAVORITES_INDEXES),
    })
    const table = formatAuditTable(results)
    expect(table).toContain('favorites')
    expect(table).toContain('fixture.ts:42')
    expect(table).toContain('no_matching_index')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 정적 수집기 — 임시 디렉터리 픽스처
// ─────────────────────────────────────────────────────────────────────────────
describe('collectUpsertSites — 정적 수집', () => {
  let tmp: string

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onconflict-audit-'))

    // ① 체인형 — supabase.from(...).upsert(..., { onConflict })
    fs.writeFileSync(
      path.join(tmp, 'chained.ts'),
      [
        'export async function a(supabase: any) {',
        "  await supabase.from('new_listings').upsert({ x: 1 }, { onConflict: 'pblanc_no' })",
        '}',
      ].join('\n'),
    )

    // ② 변수 경유형 — const t = supabase.from(...) ; t.upsert(..., { onConflict })
    fs.writeFileSync(
      path.join(tmp, 'via-variable.ts'),
      [
        'export async function b(supabase: any) {',
        "  const facilityKaptTable = supabase.from('facility_kapt') as any",
        '  const { error } = await facilityKaptTable.upsert(',
        '    { complex_id: 1 },',
        "    { onConflict: 'complex_id,data_month' },",
        '  )',
        '  return error',
        '}',
      ].join('\n'),
    )

    // ③ 주석 전용 — 🔴 실물 코드베이스에 실제로 존재하는 두 형태를 그대로 재현한다.
    //    favorite-actions.ts / new-listings-molit.ts 는 **고쳐진 뒤에도** 왜 upsert 를 쓰지
    //    않는지 설명하려고 옛 onConflict 값을 주석에 적어두고 있다.
    //    이걸 수집하면 라이브 게이트가 이미 고쳐진 테이블을 FAIL 로 오탐한다.
    fs.writeFileSync(
      path.join(tmp, 'comments-only.ts'),
      [
        '/**',
        " * `onConflict: 'name,region'`은 원리적으로 성공할 수 없고 42P10으로 100% 실패했다.",
        ' */',
        'export async function c(supabase: any) {',
        "  // 그래서 onConflict: 'user_id,complex_id' 는 원리적으로 성공할 수 없었다.",
        "  return supabase.from('favorites').select('id')",
        '}',
      ].join('\n'),
    )

    // ④ 제외 대상 — *.test.ts 는 수집하지 않는다
    fs.writeFileSync(
      path.join(tmp, 'ignored.test.ts'),
      "export const x = () => sb.from('should_not_appear').upsert({}, { onConflict: 'a' })\n",
    )
  })

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('체인형·변수 경유형 두 형태에서 테이블명을 정확히 뽑는다', () => {
    const sites = collectUpsertSites(tmp)
    const byTable = Object.fromEntries(sites.map((s) => [s.table, s.columns]))
    expect(byTable['new_listings']).toEqual(['pblanc_no'])
    expect(byTable['facility_kapt']).toEqual(['complex_id', 'data_month'])
  })

  it('🔴 주석 안의 onConflict 를 수집하지 않는다 (라인 주석 + 블록 주석)', () => {
    const sites = collectUpsertSites(tmp)
    const cols = sites.map((s) => s.columns.join(','))
    expect(cols).not.toContain('name,region')
    expect(cols).not.toContain('complex_id,user_id')
    expect(sites.filter((s) => s.file.includes('comments-only'))).toHaveLength(0)
  })

  it('*.test.ts 는 수집 대상에서 제외된다', () => {
    const sites = collectUpsertSites(tmp)
    expect(sites.map((s) => s.table)).not.toContain('should_not_appear')
  })

  it('line 은 1-based 이고 file 은 posix 구분자다', () => {
    const sites = collectUpsertSites(tmp)
    const chained = sites.find((s) => s.table === 'new_listings')!
    expect(chained.line).toBe(2)
    expect(chained.file).not.toContain('\\')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 실물 `src/` 스캐너 건전성 — 이 게이트의 **공허한 통과**를 막는 유일한 자동 단언.
//    스캐너가 조용히 0 건을 수집하면 라이브 게이트도 "전부 통과" 라고 보고한다.
// ─────────────────────────────────────────────────────────────────────────────
describe('실물 src/ 스캐너 건전성 (DB 불필요 — CI 에서도 항상 실행된다)', () => {
  // 이 테스트 파일은 src/lib/db/ 에 있다 → ../.. = <repo>/src. CWD 의존을 피한다.
  const SRC_DIR = path.resolve(__dirname, '../..')

  // 하한 16 의 근거:
  //   39-CONTEXT <baseline> 표 18 건
  //   − F-03 이 제거한 new_listings MOLIT upsert 1 건
  //   − F-02 가 제거한 favorites upsert 1 건 (통합 인덱스 대신 select→insert 로 전환)
  //   = 16 건. 2026-07-31 실측값도 정확히 **16 건**이다.
  // 상한은 두지 않는다 — 신규 upsert 추가는 정상이고, 감사 대상이 늘어날 뿐이다.
  const MIN_SITES = 16

  it(`🔴 collectUpsertSites('src') 가 ${MIN_SITES}건 이상을 수집한다`, () => {
    const sites = collectUpsertSites(SRC_DIR)
    const listing = sites.map((s) => `  ${s.file}:${s.line}  ${s.table} (${s.columns.join(',')})`).join('\n')
    expect(
      sites.length,
      `수집 건수 ${sites.length} < ${MIN_SITES}. 스캐너가 upsert 지점을 놓쳤을 수 있다.\n수집 목록:\n${listing}`,
    ).toBeGreaterThanOrEqual(MIN_SITES)
  })

  it('🔴 테이블 귀속에 실패한(table === "") 항목이 0건이다', () => {
    const sites = collectUpsertSites(SRC_DIR)
    const orphans = sites.filter((s) => !s.table)
    expect(
      orphans.length,
      `테이블을 못 찾은 지점:\n${orphans.map((s) => `  ${s.file}:${s.line} (${s.columns.join(',')})`).join('\n')}`,
    ).toBe(0)
  })

  it('🔴 이미 고쳐진 두 결함의 주석을 오탐하지 않는다 (favorites / new_listings MOLIT)', () => {
    const sites = collectUpsertSites(SRC_DIR)
    // src/lib/auth/favorite-actions.ts 와 src/lib/data/new-listings-molit.ts 는 **주석으로**
    // 옛 onConflict 값을 남겨두고 있다. 수집되면 라이브 게이트가 오탐한다.
    const favorites = sites.filter((s) => s.table === 'favorites')
    expect(
      favorites,
      `favorites 는 F-02 에서 upsert 를 제거했다. 수집되면 주석 오탐이다:\n${favorites
        .map((s) => `  ${s.file}:${s.line} (${s.columns.join(',')})`)
        .join('\n')}`,
    ).toHaveLength(0)

    const molit = sites.filter((s) => s.table === 'new_listings' && s.columns.join(',') === 'name,region')
    expect(
      molit,
      `new_listings (name,region) 은 F-03 에서 제거했다. 수집되면 주석 오탐이다:\n${molit
        .map((s) => `  ${s.file}:${s.line}`)
        .join('\n')}`,
    ).toHaveLength(0)
  })

  it('🔴 감사 모듈 자신의 JSDoc 예시를 수집하지 않는다 (주석 제거기 회귀 감시)', () => {
    // onconflict-audit.ts 의 JSDoc 에는 설명용 upsert 예시가 들어 있다.
    // 여기 걸리면 stripComments 가 깨진 것이다 — 실제로 정규식 리터럴 안의 따옴표 때문에
    // 문자열 모드가 새서 이 파일의 주석이 통째로 안 지워진 적이 있다.
    const self = collectUpsertSites(SRC_DIR).filter((s) => s.file.endsWith('src/lib/db/onconflict-audit.ts'))
    expect(self.map((s) => `${s.file}:${s.line} ${s.table}`)).toEqual([])
  })

  it('🔴 카탈로그 RPC 마이그레이션이 원장에 남아 있다', () => {
    // 라이브 게이트는 unique_indexes_for_table 이 없으면 (마이그레이션 미적용 환경으로 보고)
    // skip 된다. 그래서 "마이그레이션이 정의돼 있다" 는 사실만큼은 DB 없이 못 박아 둔다 —
    // 마이그레이션 파일이 사라지면 게이트가 조용히 skip 으로 전락하기 때문이다.
    const migrations = path.resolve(SRC_DIR, '../supabase/migrations')
    const found = fs.readdirSync(migrations).filter((f) => f.includes('unique_indexes_for_table'))
    expect(found, `supabase/migrations 에 unique_indexes_for_table 마이그레이션이 없다`).not.toHaveLength(0)

    const sql = fs.readFileSync(path.join(migrations, found[0]!), 'utf8')
    expect(sql).toContain('indpred') //  is_partial 의 근거
    expect(sql).toContain('grant  execute on function public.unique_indexes_for_table(text) to service_role')
  })
})
