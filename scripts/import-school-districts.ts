/**
 * 통학구역 SHP/DBF 파일 파싱 후 school_districts / school_district_schools 테이블 임포트
 *
 * 대상 지역: 경남(SD_CD=48) 전체 22개 시군구 (Phase 33 신규 16개 지역 포함)
 * 고등학교: SGG_CD 컬럼 없음 → EDU_NM(경상남도OO교육지원청)으로 필터
 *
 * 실행:
 *   npx tsx scripts/import-school-districts.ts               (실제 DB 임포트)
 *   npx tsx scripts/import-school-districts.ts --dry-run     (SQL 출력만, DB 미실행)
 *
 * 의존: supabase CLI (supabase db query --linked)
 * 좌표계: SHP EPSG 5186 → DB EPSG 4326 (ST_Transform)
 */
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

// ─── .env.local 로드 ────────────────────────────────────────────────────────

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    const key = m?.[1]
    const val = m?.[2]
    if (key && val !== undefined && !process.env[key])
      process.env[key] = val.replace(/^"|"$/g, '')
  }
}

const DRY_RUN = process.argv.includes('--dry-run')

// ─── 상수 ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50

const LEVEL_CONFIG = [
  {
    level: 'elementary' as const,
    shpBase: 'data/school-assignment/통학구역/초등학교통학구역',
  },
  {
    level: 'middle' as const,
    shpBase: 'data/school-assignment/통학구역/중학교학교군',
  },
  {
    level: 'high' as const,
    shpBase: 'data/school-assignment/통학구역/고등학교학교군',
  },
]

type SchoolLevel = 'elementary' | 'middle' | 'high'

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface DbfField {
  name: string
  length: number
  offset: number
}

interface ShpRecord {
  hakgudo_id: string
  wkt: string
}

// ─── DBF 파싱 ──────────────────────────────────────────────────────────────

const decoder = new TextDecoder('euc-kr')

function parseDbfFields(buf: Buffer): DbfField[] {
  const fields: DbfField[] = []
  const headerBytes = buf.readUInt16LE(8)
  let offset = 32
  let dataOffset = 0
  while (offset < headerBytes - 1 && buf[offset] !== 0x0d) {
    const name = buf
      .slice(offset, offset + 11)
      .toString('ascii')
      .replace(/\x00/g, '')
      .trim()
    const length = buf[offset + 16] ?? 0
    fields.push({ name, length, offset: dataOffset })
    dataOffset += length
    offset += 32
  }
  return fields
}

function readDbfField(recBuf: Buffer, field: DbfField): string {
  return decoder
    .decode(recBuf.slice(field.offset, field.offset + field.length))
    .replace(/\x00/g, '')
    .trim()
}

// ─── SHP 파싱: POLYGON WKT 생성 ─────────────────────────────────────────────

function readPolygonWkt(shpBuf: Buffer, recordDataOffset: number): string {
  const shapeType = shpBuf.readInt32LE(recordDataOffset)
  if (shapeType !== 5) return ''

  const numParts = shpBuf.readInt32LE(recordDataOffset + 36)
  const numPoints = shpBuf.readInt32LE(recordDataOffset + 40)
  const partsOffset = recordDataOffset + 44
  const pointsOffset = partsOffset + numParts * 4

  const rings: string[] = []
  for (let p = 0; p < numParts; p++) {
    const partStart = shpBuf.readInt32LE(partsOffset + p * 4)
    const partEnd =
      p < numParts - 1
        ? shpBuf.readInt32LE(partsOffset + (p + 1) * 4)
        : numPoints
    const coords: string[] = []
    for (let i = partStart; i < partEnd; i++) {
      const x = shpBuf.readDoubleLE(pointsOffset + i * 16)
      const y = shpBuf.readDoubleLE(pointsOffset + i * 16 + 8)
      coords.push(`${x} ${y}`)
    }
    if (coords.length > 0) {
      rings.push(`(${coords.join(',')})`)
    }
  }
  if (rings.length === 0) return ''
  return `POLYGON(${rings.join(',')})`
}

// ─── SHP + DBF 파싱 (필터 포함) ─────────────────────────────────────────────

function parseShpFile(
  shpBase: string,
  level: SchoolLevel,
): ShpRecord[] {
  const shpPath = path.join(process.cwd(), `${shpBase}.shp`)
  const dbfPath = path.join(process.cwd(), `${shpBase}.dbf`)

  if (!fs.existsSync(shpPath)) throw new Error(`SHP 파일 없음: ${shpPath}`)
  if (!fs.existsSync(dbfPath)) throw new Error(`DBF 파일 없음: ${dbfPath}`)

  const shpBuf = fs.readFileSync(shpPath)
  const dbfBuf = fs.readFileSync(dbfPath)

  const numRecords = dbfBuf.readInt32LE(4)
  const dbfHeaderBytes = dbfBuf.readUInt16LE(8)
  const dbfRecordSize = dbfBuf.readUInt16LE(10)

  const fields = parseDbfFields(dbfBuf)
  const fieldMap = new Map<string, DbfField>()
  for (const f of fields) fieldMap.set(f.name, f)

  const fHakgudoId = fieldMap.get('HAKGUDO_ID')
  const fSdCd = fieldMap.get('SD_CD')
  const fEduNm = fieldMap.get('EDU_NM')

  if (!fHakgudoId) throw new Error(`DBF에 HAKGUDO_ID 컬럼 없음: ${dbfPath}`)
  if (!fSdCd) throw new Error(`DBF에 SD_CD 컬럼 없음: ${dbfPath}`)
  if (!fEduNm) throw new Error(`DBF에 EDU_NM 컬럼 없음: ${dbfPath}`)

  // SHP 레코드 오프셋 테이블: SHX 파일에서 읽기 (빠른 random access)
  const shxPath = path.join(process.cwd(), `${shpBase}.shx`)
  let shxBuf: Buffer | null = null
  if (fs.existsSync(shxPath)) {
    shxBuf = fs.readFileSync(shxPath)
  }

  const results: ShpRecord[] = []

  for (let r = 0; r < numRecords; r++) {
    // DBF 레코드 읽기 (삭제 표시 1바이트 + 데이터)
    const dbfRecStart = dbfHeaderBytes + r * dbfRecordSize
    if (dbfRecStart + dbfRecordSize > dbfBuf.length) break
    const deletionFlag = dbfBuf[dbfRecStart]
    if (deletionFlag === 0x2a) continue // '*' = 삭제된 레코드

    const recBuf = dbfBuf.slice(dbfRecStart + 1, dbfRecStart + 1 + dbfRecordSize)

    const sdCd = fSdCd ? readDbfField(recBuf, fSdCd) : ''
    const eduNm = fEduNm ? readDbfField(recBuf, fEduNm) : ''
    const hakgudoId = fHakgudoId ? readDbfField(recBuf, fHakgudoId) : ''

    // ── 지역 필터 ──────────────────────────────────────────────────────────
    // 경남(SD_CD=48) 전체. SGG_CD는 SHP 원본 확인 결과 창원 5개 구(121/123/125/127/129)를
    // 개별 코드로 구분해 담고 있어 sdCd==='48'만으로 경남 전체(Phase 33 신규 16개 지역 포함)를
    // 정확히 포괄한다 — 기존 sggCd==='121' 단일 체크는 창원 의창구만 남기고 나머지 4개 구
    // 학군 데이터를 누락시키던 기존 버그였음(Phase 33과 무관하게 이번에 함께 수정)
    let pass = false
    if (level === 'elementary' || level === 'middle') {
      pass = sdCd === '48'
    } else {
      // 고등학교: SGG_CD 없음 → EDU_NM(경상남도OO교육지원청)으로 필터.
      // SHP 원본 확인 결과 고교 학교군 데이터는 거제/김해/진주/창원 4개 지역만 존재 —
      // 나머지 18개 지역명 포함은 향후 데이터가 추가되어도 자동으로 잡히도록 방어적으로 유지
      const EDU_OFFICE_CITIES = [
        '창원', '김해', '진주', '통영', '사천', '밀양', '거제', '양산',
        '의령', '함안', '창녕', '고성', '남해', '하동', '산청', '함양', '거창', '합천',
      ]
      pass = EDU_OFFICE_CITIES.some(city => eduNm.includes(city))
    }
    if (!pass) continue
    if (!hakgudoId) continue

    // ── SHP 레코드 오프셋 계산 ────────────────────────────────────────────
    let shpRecDataOffset: number
    if (shxBuf) {
      // SHX: 100바이트 헤더 + 각 레코드 8바이트 (오프셋 4바이트 BE + 길이 4바이트 BE)
      const shxRecOffset = 100 + r * 8
      if (shxRecOffset + 8 > shxBuf.length) continue
      const offsetWords = shxBuf.readInt32BE(shxRecOffset)
      shpRecDataOffset = offsetWords * 2 + 8 // 레코드 헤더(8바이트) 건너뜀
    } else {
      // SHX 없으면 순차 스캔 (느림)
      let pos = 100
      let idx = 0
      while (pos < shpBuf.length && idx < r) {
        const contentLen = shpBuf.readInt32BE(pos + 4) * 2
        pos += 8 + contentLen
        idx++
      }
      if (pos >= shpBuf.length) continue
      shpRecDataOffset = pos + 8
    }

    if (shpRecDataOffset + 44 > shpBuf.length) continue

    const wkt = readPolygonWkt(shpBuf, shpRecDataOffset)
    if (!wkt) continue

    results.push({ hakgudo_id: hakgudoId, wkt })
  }

  return results
}

// ─── CSV 파싱 ──────────────────────────────────────────────────────────────

function parseCsv(csvPath: string): Map<string, string[]> {
  const buf = fs.readFileSync(csvPath)
  const text = decoder.decode(buf)
  const lines = text.split('\n')

  // 헤더: 학구ID,학교ID,학교명,학교급구분,시도교육청코드,시도교육청명,교육지원청코드,교육지원청명,데이터기준일자
  const map = new Map<string, string[]>()

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.replace(/\r$/, '').trim()
    if (!line) continue
    const parts = line.split(',')
    const hakgudoId = parts[0]?.trim()
    const schoolName = parts[2]?.trim()
    if (!hakgudoId || !schoolName) continue

    const existing = map.get(hakgudoId)
    if (existing) {
      if (!existing.includes(schoolName)) existing.push(schoolName)
    } else {
      map.set(hakgudoId, [schoolName])
    }
  }

  return map
}

// ─── SQL 유틸 ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

function flushToDb(sqlContent: string, label: string): void {
  if (DRY_RUN) {
    console.log(`[DRY RUN] ${label} — SQL 출력만`)
    // 처음 500자만 미리보기
    if (sqlContent.length > 0) {
      console.log(sqlContent.slice(0, 500) + (sqlContent.length > 500 ? '\n...(생략)' : ''))
    }
    return
  }

  if (!sqlContent.trim()) return

  const tmpPath = path.join(process.cwd(), 'data', '_school_districts.sql')
  fs.writeFileSync(tmpPath, sqlContent, 'utf8')
  try {
    execSync(`supabase db query --linked --file "${tmpPath}"`, { stdio: 'inherit' })
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
  }
  console.log(`  [flush] ${label} 완료`)
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[import-school-districts] 시작 —', new Date().toISOString())
  if (DRY_RUN) console.log('[import-school-districts] *** DRY RUN — SQL만 생성, DB 미실행 ***')

  const csvPath = path.join(
    process.cwd(),
    'data/school-assignment/학교학구도연계정보/재단법인한국지방교육행정연구재단_학교학구도연계정보_20250922.csv',
  )

  // 1. CSV 파싱: hakgudo_id → school_name[]
  console.log('[1/3] CSV 파싱 중...')
  const csvMap = parseCsv(csvPath)
  console.log(`  CSV 학구 매핑 ${csvMap.size}개`)

  // 2. 각 레벨별 SHP/DBF 파싱
  const allRecords = new Map<SchoolLevel, ShpRecord[]>()
  let totalDistrictCount = 0

  for (const { level, shpBase } of LEVEL_CONFIG) {
    console.log(`[2/3] ${level} SHP 파싱 중: ${shpBase}`)
    const records = parseShpFile(shpBase, level)
    allRecords.set(level, records)
    totalDistrictCount += records.length
    console.log(`  ${level}: ${records.length}개 통학구역 선택`)
  }

  // 3. school_districts 배치 INSERT
  console.log('[3/3] school_districts INSERT 중...')
  let districtFlushed = 0

  for (const { level } of LEVEL_CONFIG) {
    const records = allRecords.get(level) ?? []
    const batches = Math.ceil(records.length / BATCH_SIZE)

    for (let b = 0; b < batches; b++) {
      const batch = records.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
      const sqlParts = batch.map(rec => {
        const wktEscaped = esc(rec.wkt)
        // 고유 제약이 (hakgudo_id, school_level)에 없으므로 WHERE NOT EXISTS 사용
        return (
          `INSERT INTO public.school_districts (hakgudo_id, school_level, geometry, source_file)\n` +
          `SELECT '${esc(rec.hakgudo_id)}', '${level}', ST_Transform(ST_GeomFromText('${wktEscaped}', 5186), 4326), '${level}'\n` +
          `WHERE NOT EXISTS (\n` +
          `  SELECT 1 FROM public.school_districts\n` +
          `  WHERE hakgudo_id = '${esc(rec.hakgudo_id)}' AND school_level = '${level}'\n` +
          `);`
        )
      })
      const sql = sqlParts.join('\n\n')
      flushToDb(sql, `school_districts ${level} batch ${b + 1}/${batches}`)
      districtFlushed += batch.length
    }
  }

  console.log(`  school_districts 처리: ${districtFlushed}건`)

  // 4. school_district_schools 배치 INSERT
  console.log('[4/5] school_district_schools INSERT 중...')
  let schoolLinkCount = 0
  const missingHakgudo: string[] = []

  for (const { level } of LEVEL_CONFIG) {
    const records = allRecords.get(level) ?? []

    // 각 district에 대한 school 링크 수집
    interface SchoolLink {
      hakgudo_id: string
      school_name: string
    }
    const links: SchoolLink[] = []

    for (const rec of records) {
      const schools = csvMap.get(rec.hakgudo_id)
      if (!schools || schools.length === 0) {
        missingHakgudo.push(rec.hakgudo_id)
        continue
      }
      for (const schoolName of schools) {
        links.push({ hakgudo_id: rec.hakgudo_id, school_name: schoolName })
      }
    }

    // 배치 처리
    const batches = Math.ceil(links.length / BATCH_SIZE)
    for (let b = 0; b < batches; b++) {
      const batch = links.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
      const sqlParts = batch.map(lk => {
        return (
          `INSERT INTO public.school_district_schools (district_id, school_name, school_level)\n` +
          `SELECT id, '${esc(lk.school_name)}', '${level}'\n` +
          `FROM public.school_districts\n` +
          `WHERE hakgudo_id = '${esc(lk.hakgudo_id)}' AND school_level = '${level}'\n` +
          `ON CONFLICT DO NOTHING;`
        )
      })
      const sql = sqlParts.join('\n\n')
      flushToDb(sql, `school_district_schools ${level} batch ${b + 1}/${batches}`)
      schoolLinkCount += batch.length
    }
  }

  console.log(`  school_district_schools 처리: ${schoolLinkCount}건`)

  if (missingHakgudo.length > 0) {
    console.log(`  경고: CSV 매핑 없는 학구 ${missingHakgudo.length}개 (처음 10개):`)
    missingHakgudo.slice(0, 10).forEach(id => console.log(`    - ${id}`))
  }

  // 5. DRY_RUN 모드: facility_school 학교명 비교
  if (DRY_RUN) {
    console.log('[5/5] DRY RUN — facility_school 학교명 대조 중...')
    try {
      const raw = execSync(
        `supabase db query --linked "SELECT DISTINCT school_name FROM public.facility_school ORDER BY school_name LIMIT 200"`,
        { encoding: 'utf8' },
      )
      const match = raw.match(/"rows"\s*:\s*(\[[\s\S]*?\])/)
      if (match?.[1]) {
        const dbNames: Array<{ school_name: string }> = JSON.parse(match[1])
        const dbNameSet = new Set(dbNames.map(r => r.school_name))

        // CSV에서 추출한 창원/김해 학교명 집합
        const csvNames = new Set<string>()
        for (const { level } of LEVEL_CONFIG) {
          const records = allRecords.get(level) ?? []
          for (const rec of records) {
            const schools = csvMap.get(rec.hakgudo_id)
            if (schools) schools.forEach(s => csvNames.add(s))
          }
        }

        const mismatches = [...csvNames].filter(n => !dbNameSet.has(n))
        const mismatchRate = csvNames.size > 0 ? mismatches.length / csvNames.size : 0

        console.log(`  CSV 학교명: ${csvNames.size}개`)
        console.log(`  DB 학교명: ${dbNames.length}개`)
        console.log(`  불일치: ${mismatches.length}개 (${(mismatchRate * 100).toFixed(1)}%)`)

        if (mismatchRate < 0.2) {
          console.log('  → 불일치율 20% 미만 — 임포트 진행 가능')
        } else {
          console.log('  ⚠ 불일치율 20% 이상 — 학교명 매핑 확인 필요')
          console.log('  불일치 학교 (처음 20개):', mismatches.slice(0, 20))
        }
      }
    } catch (e) {
      console.log('  facility_school 조회 실패 (DB 미연결일 수 있음):', e instanceof Error ? e.message : e)
    }
  }

  // 6. 요약
  console.log('\n[import-school-districts] 완료 요약:')
  for (const { level } of LEVEL_CONFIG) {
    const cnt = allRecords.get(level)?.length ?? 0
    console.log(`  ${level}: ${cnt}개 통학구역`)
  }
  console.log(`  전체 통학구역: ${totalDistrictCount}개`)
  console.log(`  학교 링크: ${schoolLinkCount}건`)
  if (DRY_RUN) console.log('[import-school-districts] DRY RUN 완료 — DB 미실행')
  console.log('[import-school-districts] 완료 —', new Date().toISOString())
}

main().catch(err => {
  console.error('치명적 오류:', err)
  process.exit(1)
})
