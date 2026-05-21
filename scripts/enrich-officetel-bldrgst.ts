/**
 * 오피스텔 단지 건축물대장 정보 보강 스크립트
 *
 * 실행:
 *   npx tsx scripts/enrich-officetel-bldrgst.ts
 *   npx tsx scripts/enrich-officetel-bldrgst.ts --dry-run   # DB 쓰기 없이 확인만
 *   npx tsx scripts/enrich-officetel-bldrgst.ts --id=<uuid> # 단일 단지 테스트
 *
 * 필요 환경변수: BLD_RGST_API_KEY, KAKAO_REST_API_KEY,
 *               NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 처리 흐름 (단지당):
 *   1. 카카오 키워드 검색 → 주소(jibun) + 좌표(lat/lng) 획득
 *   2. 카카오 주소 검색 → b_code + 본번/부번 획득
 *   3. 건축물대장 표제부 조회 → 세대수·층수·주차·승강기 획득
 *   4. complexes 업데이트 (household_count, floors_above/below, jibun_address, road_address, lat/lng)
 *   5. facility_kapt upsert (parking_count, elevator_count)
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { fetchBldTitleInfo } from '../src/services/bld-rgst'

loadEnvConfig(process.cwd(), true)

const args = process.argv.slice(2)
const DRY_RUN   = args.includes('--dry-run')
const TARGET_ID = args.find(a => a.startsWith('--id='))?.split('=')[1]

if (!process.env.BLD_RGST_API_KEY)       { console.error('❌ BLD_RGST_API_KEY 없음');                process.exit(1) }
if (!process.env.KAKAO_REST_API_KEY)     { console.error('❌ KAKAO_REST_API_KEY 없음');              process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)    { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');   process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)   { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');  process.exit(1) }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const SGG_LABEL: Record<string, string> = {
  '48121': '창원시 의창구',
  '48123': '창원시 성산구',
  '48125': '창원시 마산합포구',
  '48127': '창원시 마산회원구',
  '48129': '창원시 진해구',
  '48250': '김해시',
}

// ── 카카오 키워드 검색 ────────────────────────────────────────────
interface KakaoPlace {
  place_name:        string
  address_name:      string
  road_address_name: string
  x: string
  y: string
}

async function kakaoKeywordSearch(query: string): Promise<KakaoPlace | null> {
  const key = process.env.KAKAO_REST_API_KEY!
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null

  const json = await res.json() as { documents?: KakaoPlace[] }
  return json.documents?.[0] ?? null
}

// ── 카카오 주소 검색 (b_code + 지번 획득) ──────────────────────────
interface KakaoAddressResult {
  b_code:            string  // 10자리 법정동코드 (ex: '4812110400')
  main_address_no:   string  // 본번 (ex: '158')
  sub_address_no:    string  // 부번 (ex: '10', 없으면 '')
}

async function kakaoAddressSearch(address: string): Promise<KakaoAddressResult | null> {
  const key = process.env.KAKAO_REST_API_KEY!
  const url = new URL('https://dapi.kakao.com/v2/local/geo/address.json')
  url.searchParams.set('query', address)
  url.searchParams.set('analyze_type', 'exact')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null

  const json = await res.json() as {
    documents?: Array<{
      address?: {
        b_code?: string
        main_address_no?: string
        sub_address_no?: string
      }
    }>
  }
  const addr = json.documents?.[0]?.address
  if (!addr?.b_code || !addr.main_address_no) return null

  return {
    b_code:          addr.b_code,
    main_address_no: addr.main_address_no,
    sub_address_no:  addr.sub_address_no ?? '',
  }
}

// ── 건축물대장 표제부 파라미터 파싱 ────────────────────────────────
function parseBldParams(addrResult: KakaoAddressResult) {
  return {
    sigunguCd: addrResult.b_code.slice(0, 5),
    bjdongCd:  addrResult.b_code.slice(5, 9),
    bun:       addrResult.main_address_no.padStart(4, '0'),
    ji:        (addrResult.sub_address_no || '0').padStart(4, '0'),
  }
}

// ── 건물 이름이 숫자/지번 형태인지 확인 (의미 없는 이름 필터) ──────
function hasValidName(name: string): boolean {
  // "(158-10)" 또는 "(324)" 형태면 정상 건물명 없음
  return !/^\(\d+(-\d+)?\)$/.test(name.trim())
}

// ── main ───────────────────────────────────────────────────────────
async function main() {
  console.log(`🏢 오피스텔 건축물대장 보강 시작${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  // 대상: building_type='officetel' + (household_count IS NULL OR floors_above IS NULL)
  let query = supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code, si, gu, dong, jibun_address, lat')
    .eq('building_type', 'officetel')

  if (TARGET_ID) {
    query = query.eq('id', TARGET_ID)
  } else {
    // household_count IS NULL OR floors_above IS NULL 조건 (idempotent)
    query = query.or('household_count.is.null,floors_above.is.null')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexes, error } = await (query as any)
  if (error) throw new Error(`complexes 조회 실패: ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = complexes as any[]
  if (rows.length === 0) { console.log('✅ 보강할 단지 없음'); return }

  console.log(`📋 대상: ${rows.length}개 단지`)

  const dataMonth = new Date().toISOString().slice(0, 7) + '-01'
  let success = 0, failed = 0, skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]
    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name} ...`)

    // 지번 형태 이름은 카카오 검색 품질 낮음 → 경고 후 계속
    if (!hasValidName(c.canonical_name)) {
      console.warn(`\n  ⚠️  "${c.canonical_name}" — 지번형 이름, 검색 품질 낮을 수 있음`)
    }

    try {
      // ── Step 1: 카카오 키워드 검색 ──────────────────────────────
      const region = SGG_LABEL[c.sgg_code] ?? ''
      const dong   = c.dong ?? ''
      const searchQuery = `${c.canonical_name} ${region} ${dong}`.trim()
      const place = await kakaoKeywordSearch(searchQuery)

      if (!place) {
        console.warn(`\n  ⚠️  "${c.canonical_name}" — 카카오 검색 결과 없음`)
        skipped++
        await new Promise(r => setTimeout(r, 150))
        continue
      }

      const lat = parseFloat(place.y)
      const lng = parseFloat(place.x)

      // ── Step 2: 카카오 주소 검색 → b_code 획득 ─────────────────
      await new Promise(r => setTimeout(r, 100))
      const addrResult = await kakaoAddressSearch(place.address_name)

      if (!addrResult) {
        console.warn(`\n  ⚠️  "${c.canonical_name}" — 주소 → b_code 변환 실패 (${place.address_name})`)
        // 좌표만 업데이트
        if (!DRY_RUN && !isNaN(lat) && !c.lat) {
          await supabase.from('complexes').update({ lat, lng }).eq('id', c.id)
        }
        skipped++
        await new Promise(r => setTimeout(r, 150))
        continue
      }

      // ── Step 3: 건축물대장 표제부 조회 ──────────────────────────
      const bldParams = parseBldParams(addrResult)
      await new Promise(r => setTimeout(r, 200))
      const items = await fetchBldTitleInfo(bldParams)

      if (items.length === 0) {
        console.warn(`\n  ⚠️  "${c.canonical_name}" — 건축물대장 결과 없음 (sigunguCd=${bldParams.sigunguCd}, bjdongCd=${bldParams.bjdongCd}, bun=${bldParams.bun}, ji=${bldParams.ji})`)
        // 좌표 + 주소만 저장
        if (!DRY_RUN) {
          await supabase.from('complexes').update({
            lat, lng,
            jibun_address: place.address_name || null,
            road_address:  place.road_address_name || null,
          }).eq('id', c.id)
        }
        skipped++
        await new Promise(r => setTimeout(r, 150))
        continue
      }

      // 여러 행일 경우 세대수가 가장 큰 건물(주건축물) 선택
      const item = items.reduce((best, cur) =>
        (cur.hhldCnt ?? 0) > (best.hhldCnt ?? 0) ? cur : best,
      items[0]!)

      const builtYear = item.useAprDay ? parseInt(item.useAprDay.slice(0, 4), 10) : null

      console.log(
        `\n  ✅ ${c.canonical_name} — 세대:${item.hhldCnt ?? '-'}, 지상:${item.grndFlrCnt ?? '-'}F, 주차:${item.totPkngCnt ?? '-'}, EV:${item.rideUseElvtCnt ?? '-'}`,
      )

      if (DRY_RUN) { success++; continue }

      // ── Step 4: complexes 업데이트 ──────────────────────────────
      const complexUpdate: Record<string, unknown> = {
        lat, lng,
        jibun_address: place.address_name || null,
        road_address:  place.road_address_name || null,
      }
      if (item.hhldCnt != null)    complexUpdate.household_count = item.hhldCnt
      if (item.grndFlrCnt != null) complexUpdate.floors_above    = item.grndFlrCnt
      if (item.ugrndFlrCnt != null) complexUpdate.floors_below   = item.ugrndFlrCnt
      if (builtYear && !isNaN(builtYear)) complexUpdate.built_year = builtYear

      const { error: cErr } = await supabase
        .from('complexes')
        .update(complexUpdate)
        .eq('id', c.id)
      if (cErr) throw new Error(`complexes 업데이트 실패: ${cErr.message}`)

      // ── Step 5: facility_kapt upsert (parking + elevator) ──────
      if (item.totPkngCnt != null || item.rideUseElvtCnt != null) {
        const facilityRow: Record<string, unknown> = {
          complex_id:    c.id,
          data_month:    dataMonth,
          kapt_code:     null,
        }
        if (item.totPkngCnt != null)     facilityRow.parking_count   = item.totPkngCnt
        if (item.rideUseElvtCnt != null) facilityRow.elevator_count  = item.rideUseElvtCnt

        const { error: fErr } = await supabase
          .from('facility_kapt')
          .upsert(facilityRow, { onConflict: 'complex_id,data_month' })
        if (fErr) {
          console.warn(`\n  ⚠️  facility_kapt upsert 실패 (${c.canonical_name}): ${fErr.message}`)
        }
      }

      success++
    } catch (err) {
      console.error(`\n  ❌ "${c.canonical_name}": ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 150))
  }

  console.log(`\n\n✅ 완료: ${success}개 성공, ${skipped}개 스킵, ${failed}개 실패`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
