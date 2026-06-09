/**
 * complexes.url_slug 백필 스크립트
 *
 * 마이그레이션에서 초기 백필이 실행됨.
 * 이 스크립트는 신규 단지 추가 후 재실행용 (url_slug=NULL 행만 처리).
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts
 *   npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-url-slugs.ts --limit=100
 *
 * 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * RERUN NOTE (D-08): D-08에서 "ingest 시 자동 계산"이라 명시되었으나, ingest 서비스 수정은
 * 이 Phase 범위 외. 신규 단지 추가 시 이 스크립트를 재실행하여 url_slug를 채운다.
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd(), true)

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL)     { console.error('NEXT_PUBLIC_SUPABASE_URL 없음'); process.exit(1) }
if (!SUPABASE_SRV_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const args     = process.argv.slice(2)
const DRY_RUN  = args.includes('--dry-run')
const limitArg = args.find(a => a.startsWith('--limit='))
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1] ?? '10000', 10) : 10000

const supabase = createClient(SUPABASE_URL, SUPABASE_SRV_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// D-01, D-02: 한글 그대로, 창원 4단계/김해 3단계
function buildUrlSlug(
  si: string | null,
  gu: string | null,
  dong: string | null,
  canonicalName: string | null,
): string | null {
  if (!si || !dong || !canonicalName) return null
  return gu
    ? `${si}/${gu}/${dong}/${canonicalName}`
    : `${si}/${dong}/${canonicalName}`
}

async function main(): Promise<void> {
  console.log(`[backfill-url-slugs] DRY_RUN=${DRY_RUN} LIMIT=${LIMIT}`)

  const { data: rows, error } = await supabase
    .from('complexes')
    .select('id, si, gu, dong, canonical_name')
    .is('url_slug', null)   // url_slug 없는 행만 처리 (idempotent)
    .limit(LIMIT)

  if (error) { console.error('조회 실패:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('처리할 행 없음'); return }

  console.log(`처리 대상: ${rows.length}건`)
  let updated = 0, skipped = 0, failed = 0

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i] as { id: string; si: string | null; gu: string | null; dong: string | null; canonical_name: string | null }
    const slug = buildUrlSlug(c.si, c.gu, c.dong, c.canonical_name)

    if (!slug) { skipped++; continue }
    if (DRY_RUN) { updated++; continue }

    const { error: updateErr } = await supabase
      .from('complexes')
      .update({ url_slug: slug })
      .eq('id', c.id)
      .is('url_slug', null)  // 동시성 guard — 이미 채워진 경우 건드리지 않음

    if (updateErr) {
      failed++
      console.error(`\n실패 ${c.id} (${c.canonical_name}):`, updateErr.message)
    } else {
      updated++
    }

    process.stdout.write(
      `\r[${i + 1}/${rows.length}] 업데이트: ${updated} 스킵: ${skipped} 실패: ${failed}`
    )
  }

  console.log(`\n완료 — 업데이트: ${updated} 스킵: ${skipped} 실패: ${failed}`)
  if (DRY_RUN) console.log('(dry-run — DB 변경 없음)')
}

main().catch((err: unknown) => {
  console.error('스크립트 실행 실패:', err)
  process.exit(1)
})
