/**
 * K-apt 관리비 엑셀 임포트 스크립트
 *
 * 실행: npx tsx scripts/import-management-cost.ts [options]
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 옵션:
 *   --file <path>        파일 1개 지정
 *   --dir <path>         폴더의 모든 xlsx (기본: data/management-cost/)
 *   --debug              미매칭 단지 목록 출력
 *   --dry-run            파싱만 확인, DB 적재 없음
 *   --generate-sql [f]   SQL 파일 생성 (DB 불필요; 기본 파일명: mgmt_import.sql)
 *
 * K-apt dimension ref="A1" 버그 자동 감지 → 7z + 스트리밍 XML 파싱 폴백
 * 폴백 시 7z가 PATH에 있어야 함: scoop install 7zip
 */
import { config as dotenvConfig } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { getActiveCityNames } from '../src/lib/data/regions'
import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execSync } from 'child_process'
import { createInterface } from 'readline'

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') })

// ─── 컬럼 인덱스 (0-indexed, A=0) ─────────────────────────────────────────

const COL = {
  sgg:                      1,   // B
  kapt_code:                4,   // E
  kapt_name:                5,   // F
  year_month:               6,   // G
  common_cost_total:        7,   // H
  labor_cost:               8,   // I
  vehicle_cost:             13,  // N
  cleaning_cost:            15,  // P
  guard_cost:               16,  // Q
  disinfection_cost:        17,  // R
  elevator_cost:            18,  // S
  network_cost:             19,  // T
  repair_cost:              20,  // U
  consignment_fee:          24,  // Y
  individual_cost_total:    25,  // Z
  heating_cost:             27,  // AB
  hot_water_cost:           29,  // AD
  gas_cost:                 31,  // AF
  electricity_cost:         33,  // AH
  water_cost:               35,  // AJ
  long_term_repair_monthly: 43,  // AR
  long_term_repair_total:   45,  // AT
} as const

const COST_COLS = [
  'common_cost_total', 'labor_cost', 'vehicle_cost', 'cleaning_cost',
  'guard_cost', 'disinfection_cost', 'elevator_cost', 'network_cost',
  'repair_cost', 'consignment_fee', 'individual_cost_total', 'heating_cost',
  'hot_water_cost', 'gas_cost', 'electricity_cost', 'water_cost',
  'long_term_repair_monthly', 'long_term_repair_total',
] as const

type CostCol = (typeof COST_COLS)[number]

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface RawRow {
  kapt_code:                string
  kapt_name:                string
  year_month:               string  // YYYY-MM-01
  sgg:                      string
  common_cost_total:        number | null
  labor_cost:               number | null
  vehicle_cost:             number | null
  cleaning_cost:            number | null
  guard_cost:               number | null
  disinfection_cost:        number | null
  elevator_cost:            number | null
  network_cost:             number | null
  repair_cost:              number | null
  consignment_fee:          number | null
  individual_cost_total:    number | null
  heating_cost:             number | null
  hot_water_cost:           number | null
  gas_cost:                 number | null
  electricity_cost:         number | null
  water_cost:               number | null
  long_term_repair_monthly: number | null
  long_term_repair_total:   number | null
}

type DbRow = Omit<RawRow, 'sgg' | 'kapt_name'> & { complex_id: string }

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function toInt(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = Math.round(parseFloat(String(val)))
  return isNaN(n) ? null : n
}

function toYearMonth(yyyymm: unknown): string | null {
  const s = String(yyyymm ?? '').replace(/[^0-9]/g, '')
  if (s.length !== 6) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-01`
}

function colLetterToIndex(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

function decodeXmlEntities(str: string): string {
  return str.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
}

let ACTIVE_CITY_NAMES: string[] = ['창원', '김해'] // getActiveCityNames() 로드 전 기본값(fallback)

function rowFromArray(arr: unknown[]): RawRow | null {
  const sgg = String(arr[COL.sgg] ?? '')
  if (!ACTIVE_CITY_NAMES.some(name => sgg.includes(name))) return null
  const ym = toYearMonth(arr[COL.year_month])
  if (!ym) return null
  return {
    kapt_code:                String(arr[COL.kapt_code] ?? '').trim(),
    kapt_name:                String(arr[COL.kapt_name] ?? '').trim(),
    year_month:               ym,
    sgg,
    common_cost_total:        toInt(arr[COL.common_cost_total]),
    labor_cost:               toInt(arr[COL.labor_cost]),
    vehicle_cost:             toInt(arr[COL.vehicle_cost]),
    cleaning_cost:            toInt(arr[COL.cleaning_cost]),
    guard_cost:               toInt(arr[COL.guard_cost]),
    disinfection_cost:        toInt(arr[COL.disinfection_cost]),
    elevator_cost:            toInt(arr[COL.elevator_cost]),
    network_cost:             toInt(arr[COL.network_cost]),
    repair_cost:              toInt(arr[COL.repair_cost]),
    consignment_fee:          toInt(arr[COL.consignment_fee]),
    individual_cost_total:    toInt(arr[COL.individual_cost_total]),
    heating_cost:             toInt(arr[COL.heating_cost]),
    hot_water_cost:           toInt(arr[COL.hot_water_cost]),
    gas_cost:                 toInt(arr[COL.gas_cost]),
    electricity_cost:         toInt(arr[COL.electricity_cost]),
    water_cost:               toInt(arr[COL.water_cost]),
    long_term_repair_monthly: toInt(arr[COL.long_term_repair_monthly]),
    long_term_repair_total:   toInt(arr[COL.long_term_repair_total]),
  }
}

// ─── 스트리밍 XML 파서 (K-apt dimension 버그 폴백) ─────────────────────────

async function parseXmlStream(xmlPath: string): Promise<RawRow[]> {
  const rl = createInterface({
    input: fs.createReadStream(xmlPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  const records: RawRow[] = []
  let totalRows = 0
  let nextIsCells = false

  for await (const line of rl) {
    if (line.startsWith('<row r="')) {
      nextIsCells = true
      totalRows++
      if (totalRows % 50000 === 0) {
        process.stdout.write(`\r    XML 스캔: ${totalRows.toLocaleString()}행, 매칭: ${records.length}건`)
      }
      continue
    }

    if (nextIsCells && line.startsWith('<c ')) {
      nextIsCells = false
      const cells: Record<number, string> = {}
      const re = /<c r="([A-Z]+)\d+"[^>]*>(.*?)<\/c>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        const colIdx = colLetterToIndex(m[1] ?? '')
        const inner = m[2] ?? ''
        const inlineM = inner.match(/<t>(.*?)<\/t>/)
        const numM = inner.match(/<v>(.*?)<\/v>/)
        if (inlineM?.[1] !== undefined) cells[colIdx] = decodeXmlEntities(inlineM[1])
        else if (numM?.[1] !== undefined) cells[colIdx] = numM[1]
      }

      const arr = new Array(50).fill('')
      for (const [k, v] of Object.entries(cells)) arr[Number(k)] = v

      const r = rowFromArray(arr)
      if (r) records.push(r)
    } else {
      nextIsCells = false
    }
  }

  if (totalRows > 0) process.stdout.write('\n')
  console.log(`    XML 스캔 완료: ${totalRows.toLocaleString()}행`)
  return records
}

// ─── 파일 파싱 (dimension 버그 자동 감지 + 폴백) ───────────────────────────

async function parseFile(filePath: string): Promise<RawRow[]> {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.readFile(filePath, { raw: true })
  } catch (e) {
    console.error(`  xlsx 파싱 실패: ${e instanceof Error ? e.message : e}`)
    return []
  }

  const sheetName = wb.SheetNames[0]
  const ws = sheetName ? wb.Sheets[sheetName] : undefined
  const ref = ws?.['!ref']
  const hasDimensionBug = !ws || !ref || ref === 'A1'

  if (!hasDimensionBug) {
    // 표준 경로: 이미 읽은 wb 재사용
    // range:1 → 0번 행 건너뜀, slice(1) → 1번 행(2번째 헤더) 건너뜀
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws!, {
      header: 1,
      defval: '',
      range: 1,
    })
    const result: RawRow[] = []
    for (const row of allRows.slice(1)) {
      const r = rowFromArray(row as unknown[])
      if (r) result.push(r)
    }
    return result
  }

  // K-apt dimension ref="A1" 버그 감지 → 7z 스트리밍 XML 폴백
  console.log('  ⚠  K-apt dimension 버그 감지 → 7z XML 스트리밍 파싱으로 전환')

  try {
    execSync('7z i', { stdio: 'ignore' })
  } catch {
    console.error('  7z가 PATH에 없습니다. scoop install 7zip 후 재시도하세요.')
    return []
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kapt-'))
  try {
    const winPath = filePath.replace(/\//g, '\\')
    execSync(`7z e "${winPath}" -o"${tmpDir}" "xl/worksheets/sheet1.xml" -y`, {
      stdio: 'ignore',
    })

    const xmlPath = path.join(tmpDir, 'sheet1.xml')
    if (!fs.existsSync(xmlPath)) {
      console.error('  sheet1.xml 추출 실패')
      return []
    }

    const sizeMB = (fs.statSync(xmlPath).size / 1024 / 1024).toFixed(0)
    console.log(`    sheet1.xml: ${sizeMB}MB`)
    return await parseXmlStream(xmlPath)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ─── 파일 목록 결정 ────────────────────────────────────────────────────────

const DEBUG      = process.argv.includes('--debug')
const DRY_RUN    = process.argv.includes('--dry-run')
const fileArgIdx = process.argv.indexOf('--file')
const dirArgIdx  = process.argv.indexOf('--dir')
const sqlArgIdx  = process.argv.indexOf('--generate-sql')

let SQL_OUTPUT: string | null = null
if (sqlArgIdx !== -1) {
  const nextArg = process.argv[sqlArgIdx + 1]
  SQL_OUTPUT = (nextArg && !nextArg.startsWith('--'))
    ? nextArg
    : path.join(process.cwd(), 'mgmt_import.sql')
}

function resolveFiles(): string[] {
  if (fileArgIdx !== -1) {
    const p = process.argv[fileArgIdx + 1] ?? ''
    if (!p) { console.error('[mgmt-cost] --file 인수 없음'); process.exit(1) }
    return [path.isAbsolute(p) ? p : path.join(process.cwd(), p)]
  }
  const dir = dirArgIdx !== -1
    ? (process.argv[dirArgIdx + 1] ?? '')
    : path.join(process.cwd(), 'data', 'management-cost')
  if (!dir) { console.error('[mgmt-cost] --dir 인수 없음'); process.exit(1) }
  const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir)
  if (!fs.existsSync(absDir)) {
    console.error(`[mgmt-cost] 폴더 없음: ${absDir}`)
    process.exit(1)
  }
  const files = fs.readdirSync(absDir)
    .filter(f => f.toLowerCase().endsWith('.xlsx'))
    .map(f => path.join(absDir, f))
    .sort()
  if (files.length === 0) {
    console.error(`[mgmt-cost] xlsx 파일 없음: ${absDir}`)
    process.exit(1)
  }
  return files
}

// ─── SQL 생성 ──────────────────────────────────────────────────────────────

function toSqlVal(v: number | null): string {
  return v === null ? 'NULL' : String(v)
}

function generateSql(rows: RawRow[]): string {
  const BATCH = 200
  const colList  = COST_COLS.join(',\n    ')
  const updateSet = COST_COLS.map(c => `${c}=EXCLUDED.${c}`).join(',\n      ')
  const parts: string[] = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const values = batch.map(r => {
      const costs = COST_COLS.map(c => toSqlVal(r[c as CostCol])).join(',')
      return `('${r.kapt_code}','${r.year_month}'::date,${costs})`
    }).join(',\n  ')

    parts.push(`INSERT INTO management_cost_monthly
  (complex_id,kapt_code,year_month,
    ${colList})
SELECT
  c.id,v.kapt_code,v.year_month,
  ${COST_COLS.map(c => `v.${c}`).join(',')}
FROM (VALUES
  ${values}
) AS v(kapt_code,year_month,${COST_COLS.join(',')})
JOIN complexes c ON c.kapt_code = v.kapt_code
ON CONFLICT (complex_id,year_month) DO UPDATE SET
  ${updateSet};`)
  }

  return parts.join('\n\n')
}

// ─── DB 적재 ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertToDb(
  records: DbRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
): Promise<{ success: number; fail: number }> {
  const BATCH = 500
  let success = 0
  let fail = 0

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from('management_cost_monthly')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(batch as any, { onConflict: 'complex_id,year_month' })

    if (error) {
      console.error(`\n  upsert 실패 (배치 ${Math.floor(i / BATCH) + 1}):`, error.message)
      fail += batch.length
    } else {
      success += batch.length
      process.stdout.write(`\r  진행: ${success}/${records.length}`)
    }
  }
  process.stdout.write('\n')
  return { success, fail }
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[mgmt-cost] 시작 —', new Date().toISOString())
  if (DRY_RUN) console.log('[mgmt-cost] *** DRY RUN — DB 적재 없음 ***')
  if (SQL_OUTPUT) console.log(`[mgmt-cost] SQL 생성 모드 → ${SQL_OUTPUT}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    const regionsClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    ACTIVE_CITY_NAMES = await getActiveCityNames(regionsClient)
    console.log(`[mgmt-cost] 대상 지역(regions is_active=true): ${ACTIVE_CITY_NAMES.join(', ')}`)
  } else {
    console.warn(`[mgmt-cost] Supabase 환경변수 없음 — 기본값(${ACTIVE_CITY_NAMES.join('/')})으로 필터링합니다`)
  }

  const files = resolveFiles()
  console.log(`[mgmt-cost] 처리할 파일: ${files.length}개`)
  files.forEach(f => console.log(`  - ${path.basename(f)}`))

  // 파싱
  const allRows: RawRow[] = []
  for (const file of files) {
    console.log(`\n[mgmt-cost] ▶ ${path.basename(file)}`)
    const rows = await parseFile(file)
    console.log(`  대상 지역: ${rows.length}행`)
    allRows.push(...rows)
  }
  console.log(`\n[mgmt-cost] 총 ${allRows.length}행`)

  if (DRY_RUN) {
    if (allRows.length > 0) {
      console.log('  샘플:', JSON.stringify(allRows[0], null, 2))
    }
    return
  }

  // SQL 생성 모드
  if (SQL_OUTPUT) {
    const sql = generateSql(allRows)
    fs.writeFileSync(SQL_OUTPUT, sql, 'utf8')
    const batches = Math.ceil(allRows.length / 200)
    console.log(`[mgmt-cost] SQL 저장 완료: ${SQL_OUTPUT}`)
    console.log(`  (${allRows.length}행, ${batches}배치)`)
    console.log('[mgmt-cost] Supabase MCP 또는 psql로 실행하세요.')
    return
  }

  // DB 직접 적재
  if (!url || !key) {
    console.error('[mgmt-cost] Supabase 환경변수 없음. --generate-sql 옵션을 사용하세요.')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // complexes 매핑 로드
  const { data: complexData, error: complexError } = await supabase
    .from('complexes')
    .select('id, kapt_code')
    .not('kapt_code', 'is', null)

  if (complexError) {
    console.error('[mgmt-cost] complexes 조회 실패:', complexError.message)
    console.error('힌트: --generate-sql mgmt_import.sql 로 SQL 생성 후 MCP로 실행하세요.')
    process.exit(1)
  }

  const kaptToId = new Map<string, string>()
  for (const c of complexData ?? []) {
    kaptToId.set(c.kapt_code as string, c.id as string)
  }
  console.log(`[mgmt-cost] complexes 매핑: ${kaptToId.size}개 단지`)

  // 매핑
  const records: DbRow[] = []
  const unmatched = new Map<string, string>()

  for (const row of allRows) {
    const complex_id = kaptToId.get(row.kapt_code)
    if (!complex_id) {
      unmatched.set(row.kapt_code, row.kapt_name)
      continue
    }
    const { sgg: _s, kapt_name: _n, ...rest } = row
    records.push({ ...rest, complex_id })
  }

  console.log(`[mgmt-cost] 매칭 성공: ${records.length}건 / 미매칭: ${unmatched.size}개 단지`)

  if (DEBUG && unmatched.size > 0) {
    for (const [code, name] of unmatched) {
      console.log(`  미매칭: ${code}  ${name}`)
    }
  }

  const { success, fail } = await upsertToDb(records, supabase)

  console.log('\n[mgmt-cost] ══ 완료 ════════════════════════')
  console.log(`  성공: ${success}건 / 실패: ${fail}건`)
  console.log(`  완료: ${new Date().toISOString()}`)

  if (fail > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error('[mgmt-cost] 치명적 오류:', err)
  process.exit(1)
})
