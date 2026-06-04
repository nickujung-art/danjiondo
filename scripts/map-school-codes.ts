/**
 * NEIS 교육정보 개방 포털에서 경남(S10) 학교코드를 조회하여
 * facility_school.school_code를 업데이트한다.
 *
 * 실행: npx tsx --env-file=.env.local scripts/map-school-codes.ts [--dry-run]
 *
 * 전략: NEIS API가 인증키 없이 5건/page 제한이므로,
 *       DB의 고유 학교명(810개) 각각을 SCHUL_NM 파라미터로 개별 조회.
 *       학교명+학교종별 exact match → school_code 저장.
 */

import { createClient } from '@supabase/supabase-js'

const NEIS_BASE = 'https://open.neis.go.kr/hub/schoolInfo'
const ATPT_CODE = 'S10'  // 경상남도교육청 (J10=경기도, S10=경남)

const SCHOOL_TYPE_MAP: Record<string, string> = {
  '초등학교': 'elementary',
  '중학교':   'middle',
  '고등학교': 'high',
}
const SCHOOL_TYPE_REVERSE: Record<string, string> = {
  'elementary': '초등학교',
  'middle':     '중학교',
  'high':       '고등학교',
}

const COL_CODE = 'SD_SCHUL_CODE'
const COL_NAME = 'SCHUL_NM'
const COL_TYPE = 'SCHUL_KND_SC_NM'

// 동시 요청 수 제한 (NEIS API rate limit 방지)
const CONCURRENCY = 5

interface UniqueSchool {
  school_name: string
  school_type: string
}

async function lookupSchoolCode(name: string, type: string): Promise<string | null> {
  const typeKr = SCHOOL_TYPE_REVERSE[type]
  if (!typeKr) return null

  const url = new URL(NEIS_BASE)
  url.searchParams.set('Type',              'json')
  url.searchParams.set('pIndex',            '1')
  url.searchParams.set('pSize',             '10')
  url.searchParams.set('ATPT_OFCDC_SC_CODE', ATPT_CODE)
  url.searchParams.set('SCHUL_NM',          name)
  url.searchParams.set('SCHUL_KND_SC_NM',   typeKr)

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const json = await res.json()
    const rows = json.schoolInfo?.[1]?.row as Array<Record<string, string>> | undefined
    if (!Array.isArray(rows) || rows.length === 0) return null

    // exact match 우선
    const exact = rows.find(r => r[COL_NAME] === name && SCHOOL_TYPE_MAP[r[COL_TYPE] ?? ''] === type)
    return exact ? (exact[COL_CODE] ?? null) : null
  } catch {
    return null
  }
}

// 병렬 처리 with 동시성 제한
async function processInChunks<T, R>(
  items: T[],
  fn: (item: T, idx: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map((item, j) => fn(item, i + j)))
    results.push(...chunkResults)
  }
  return results
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('[ERROR] SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // 1. DB에서 고유 학교명+타입 목록 — 페이지네이션 후 중복 제거
  console.log('[INFO] 고유 학교 목록 수집 중...')
  const seen = new Set<string>()
  const unique: UniqueSchool[] = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('facility_school')
      .select('school_name, school_type')
      .is('school_code', null)
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data) {
      const key = `${r.school_name}::${r.school_type}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push({ school_name: r.school_name, school_type: r.school_type })
      }
    }
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`[DB] 고유 학교 ${unique.length}개, NEIS 조회 시작 (동시 ${CONCURRENCY})...`)

  let matched = 0, unmatched = 0
  const unmatchedList: UniqueSchool[] = []

  // 2. NEIS 조회 + UPDATE
  await processInChunks(unique, async (school, idx) => {
    const code = await lookupSchoolCode(school.school_name, school.school_type)

    if (idx % 50 === 0) {
      process.stdout.write(`  진행: ${idx}/${unique.length}\r`)
    }

    if (!code) {
      unmatched++
      unmatchedList.push(school)
      return
    }

    matched++

    if (!isDryRun) {
      await supabase
        .from('facility_school')
        .update({ school_code: code })
        .eq('school_name', school.school_name)
        .eq('school_type', school.school_type)
    }
  }, CONCURRENCY)

  process.stdout.write('\n')

  // 3. 리포트
  console.log('\n=== 결과 ===')
  console.log(`  매칭: ${matched}개 (${isDryRun ? 'DRY-RUN' : 'DB 업데이트 완료'})`)
  console.log(`  미매칭: ${unmatched}개`)

  if (unmatchedList.length <= 30) {
    console.log('\n미매칭 학교:')
    unmatchedList.forEach(s => console.log(`  - ${s.school_name} (${s.school_type})`))
  } else {
    console.log(`\n미매칭 상위 30개:`)
    unmatchedList.slice(0, 30).forEach(s => console.log(`  - ${s.school_name} (${s.school_type})`))
    console.log(`  ... 외 ${unmatchedList.length - 30}개`)
  }
}

main().catch(err => {
  console.error('[FATAL]', err)
  process.exit(1)
})
