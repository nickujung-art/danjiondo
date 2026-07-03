/**
 * 단지 좌표 지오코딩 (카카오 장소 검색 API)
 * 실행: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... KAKAO_REST_API_KEY=... npx tsx scripts/geocode-complexes.ts
 *
 * 주의: .env.local이 로컬 Supabase를 가리킬 수 있으므로 환경변수를 명시적으로 설정 후 실행할 것
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않음')
  process.exit(1)
}

console.log(`🔗 연결 대상: ${SUPABASE_URL}`)
if (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost')) {
  console.warn('⚠️  로컬 Supabase에 연결 중입니다. 프로덕션 URL을 사용하려면 환경변수를 명시적으로 설정하세요.')
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function getSggLabel(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code, si, gu')
    .eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  const label: Record<string, string> = {}
  for (const r of (data ?? []) as { sgg_code: string; si: string; gu: string | null }[]) {
    label[r.sgg_code] = r.gu ? `${r.si} ${r.gu}` : r.si
  }
  return label
}

async function searchKakao(query: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) throw new Error('KAKAO_REST_API_KEY 없음')

  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null

  const json = await res.json() as { documents?: Array<{ y: string; x: string }> }
  const doc = json.documents?.[0]
  if (!doc) return null

  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
}

async function main() {
  const SGG_LABEL = await getSggLabel()

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code')
    .is('lat', null)
    .order('sgg_code')

  if (error) throw new Error(error.message)
  if (!complexes?.length) { console.log('지오코딩할 단지 없음'); return }

  console.log(`📍 ${complexes.length}개 단지 지오코딩 시작`)
  let success = 0, failed = 0

  for (let i = 0; i < complexes.length; i++) {
    const c = complexes[i]!
    const region = SGG_LABEL[c.sgg_code] ?? ''
    const query = `${c.canonical_name} ${region}`

    process.stdout.write(`\r[${i + 1}/${complexes.length}] ${c.canonical_name} ...`)

    const coord = await searchKakao(query)
    if (coord) {
      const { error: updateErr } = await supabase
        .from('complexes')
        .update({ lat: coord.lat, lng: coord.lng })
        .eq('id', c.id)
      if (updateErr) {
        console.error(`\n  DB 오류 (${c.canonical_name}): ${updateErr.message}`)
        failed++
      } else {
        success++
      }
    } else {
      failed++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n✅ 완료: ${success}개 성공, ${failed}개 실패`)
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
