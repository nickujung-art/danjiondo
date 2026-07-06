/**
 * Wave 1: 학교 전화번호·홈페이지·도로명주소 수집
 *
 * 학교알리미 pneiss_a03_s0_school_json.do API에서 직접 수집 (로그인 불필요)
 * 초등(02) + 중학(03) + 고등(04) 창원시/김해시 전체 대상
 *
 * 실행:
 *   npx tsx scripts/scrape-school-contact.ts              # 전체 실행
 *   npx tsx scripts/scrape-school-contact.ts --dry-run    # DB 저장 없이 확인
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')

// 경남 전체 (창원 5개 구는 학교알리미 GUGUN_CODE 상 창원시 단일 코드로 조회됨 + Phase 33 신규 16개 지역)
// GUGUN_CODE 패턴 검증: sgg_code(regions 테이블) + '00000' — curl로 각 지역 실호출 확인 완료(2026-07-06)
const TARGETS = [
  { name: '창원시', gugunCode: '4812000000' },
  { name: '김해시', gugunCode: '4825000000' },
  { name: '진주시', gugunCode: '4817000000' },
  { name: '통영시', gugunCode: '4822000000' },
  { name: '사천시', gugunCode: '4824000000' },
  { name: '밀양시', gugunCode: '4827000000' },
  { name: '거제시', gugunCode: '4831000000' },
  { name: '양산시', gugunCode: '4833000000' },
  { name: '의령군', gugunCode: '4872000000' },
  { name: '함안군', gugunCode: '4873000000' },
  { name: '창녕군', gugunCode: '4874000000' },
  { name: '고성군', gugunCode: '4882000000' },
  { name: '남해군', gugunCode: '4884000000' },
  { name: '하동군', gugunCode: '4885000000' },
  { name: '산청군', gugunCode: '4886000000' },
  { name: '함양군', gugunCode: '4887000000' },
  { name: '거창군', gugunCode: '4888000000' },
  { name: '합천군', gugunCode: '4889000000' },
]

const SCHOOL_TYPES: Array<{ gb: string; label: string; dbType: string }> = [
  { gb: '02', label: '초등학교', dbType: 'elementary' },
  { gb: '03', label: '중학교',   dbType: 'middle'     },
  { gb: '04', label: '고등학교', dbType: 'high'       },
]

interface SchoolContact {
  name:        string
  phone:       string | null
  homepageUrl: string | null
  roadAddress: string | null
  dbType:      string
}

async function fetchSchoolContacts(gugunCode: string, gb: string): Promise<SchoolContact[]> {
  const res = await fetch(
    'https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0_school_json.do',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        HG_JONGRYU_GB: gb,
        SIDO_CODE:     '4800000000',
        GUGUN_CODE:    gugunCode,
      }).toString(),
    }
  )
  if (!res.ok) throw new Error(`API 오류: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await res.json()
  const dbType = SCHOOL_TYPES.find(t => t.gb === gb)!.dbType

  return data.map(s => ({
    name:        s.SHL_NM      ?? null,
    phone:       s.ADM_TELNO   ?? null,
    homepageUrl: s.HMPG_ADDR   ?? null,
    roadAddress: s.SHL_ROAD_NM_ADDR ?? null,
    dbType,
  }))
}

async function main() {
  console.log(`\n[학교 연락처 수집] ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let total = 0, success = 0, notMatched = 0, failed = 0

  for (const { name: areaName, gugunCode } of TARGETS) {
    for (const { gb, label, dbType } of SCHOOL_TYPES) {
      const schools = await fetchSchoolContacts(gugunCode, gb)
      console.log(`  ${areaName} ${label}: ${schools.length}개`)
      total += schools.length

      for (const school of schools) {
        if (DRY_RUN) {
          console.log(`    ${school.name} | ${school.phone ?? '-'} | ${school.homepageUrl ?? '-'}`)
          success++
          continue
        }

        const { data: rows, error } = await supabase
          .from('facility_school')
          .update({
            phone:       school.phone,
            homepage_url: school.homepageUrl,
            road_address: school.roadAddress,
          })
          .eq('school_name', school.name)
          .eq('school_type', dbType)
          .select('id')

        if (error) {
          console.error(`    [DB오류] ${school.name}:`, error.message)
          failed++
        } else if (!rows || rows.length === 0) {
          // 단지 연결 없는 학교는 정상 (단지 근처에 없는 학교)
          notMatched++
        } else {
          success += rows.length
        }
      }
    }
  }

  console.log(`\n=== 완료 ===`)
  console.log(`  수집 대상: ${total}개`)
  console.log(`  DB 업데이트: ${success}개`)
  console.log(`  미매칭(단지 없음): ${notMatched}개`)
  console.log(`  오류: ${failed}개`)
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1) })
