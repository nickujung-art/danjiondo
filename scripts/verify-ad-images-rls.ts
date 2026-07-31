/**
 * [38-00 / HARD-01] ad-images 버킷 RLS 실측 검증 (anon 역할)
 * 실행: npx tsx --env-file=.env.local scripts/verify-ad-images-rls.ts --expect=allow|deny
 *
 * 왜 실측인가: `ad_images_service_write` 정책의 역할 검사 누락은 DDL을 읽어서는
 * "혹시 우회 가능한가"만 추측할 뿐 증명이 안 된다. anon 키로 실제 Storage API를
 * 타는 것만이 취약점(수정 전) / 수정 효과(수정 후)의 증거다.
 *
 * 클라이언트 2개를 절대 혼용하지 않는다:
 *   - admin: SUPABASE_SERVICE_ROLE_KEY — baseline 조회·service_role 회귀 확인·cleanup 전용 (RLS 우회)
 *   - anon : NEXT_PUBLIC_SUPABASE_ANON_KEY — 차단 검증의 주체
 * service_role로 차단을 검증하면 RLS가 우회돼 전부 통과로 보인다.
 *
 * --expect=allow (수정 전 실측): anon 업로드가 "성공"해야 PASS — 취약점이 실재함의 증거
 * --expect=deny  (수정 후 실측, 기본값): anon 업로드가 "거부"돼야 PASS
 *
 * 프로덕션 스토리지 버킷에 fixture를 만든다. 접두어 `zz-ad-verify-`를 붙이고
 * cleanup을 finally에서 무조건 실행한다. 기존 파일을 지우는 경로는 없다.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error(
    '❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY 중 누락된 값이 있음',
  )
  process.exit(1)
}

const expectArg = process.argv.find((a) => a.startsWith('--expect='))
const EXPECT: 'allow' | 'deny' = expectArg?.split('=')[1] === 'allow' ? 'allow' : 'deny'

console.log(`🔗 연결 대상: ${SUPABASE_URL}`)
console.log(`🎯 기대 모드: --expect=${EXPECT} (${EXPECT === 'allow' ? '수정 전 — 취약점 실증' : '수정 후 — 차단 확인'})`)
if (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost')) {
  console.warn('⚠️  로컬 Supabase에 연결 중입니다. 이 검증의 목적은 프로덕션 RLS 확인입니다.')
}

const CLIENT_OPTS = { auth: { autoRefreshToken: false, persistSession: false } } as const

/** baseline 조회·service_role 회귀 확인·cleanup 전용 (RLS 우회) — 차단 검증에 절대 사용하지 않는다 */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, CLIENT_OPTS)
/** 차단 검증의 주체 — 실제 anon 역할로 Storage API를 탄다 */
const anon = createClient(SUPABASE_URL, ANON_KEY, CLIENT_OPTS)

const BUCKET = 'ad-images'
const PREFIX = 'zz-ad-verify-'
// 1x1 투명 PNG (base64) — 외부 파일 의존 금지
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const ADMIN_PATH_RE = /^\d{13}-[a-z0-9]+\.(jpg|jpeg|png|webp|gif)$/

interface CheckResult {
  no: number
  name: string
  expected: string
  actual: string
  pass: boolean
}

const results: CheckResult[] = []

function record(no: number, name: string, expected: string, actual: string, pass: boolean): void {
  results.push({ no, name, expected, actual, pass })
  console.log(`${pass ? '✅' : '❌'} [${no}] ${name} — 기대: ${expected} / 실측: ${actual}`)
}

function pngBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(PNG_1X1_BASE64, 'base64'))
}

async function main(): Promise<void> {
  const cleanupPaths: string[] = []

  try {
    // baseline: PREFIX가 아닌 기존 파일 목록 확보 (positive control·항목 4 감사용)
    const { data: listBefore, error: listErr } = await admin.storage.from(BUCKET).list()
    if (listErr) throw new Error(`admin list() 실패: ${listErr.message}`)
    const baselineFiles = (listBefore ?? []).filter((f) => !f.name.startsWith(PREFIX))
    console.log(`📐 baseline 파일 수 (PREFIX 제외): ${baselineFiles.length}\n`)

    // 항목 1: anon 업로드
    {
      const path = `${PREFIX}${Date.now()}.png`
      const { data, error } = await anon.storage
        .from(BUCKET)
        .upload(path, pngBytes(), { contentType: 'image/png', upsert: false })

      const succeeded = !error
      if (succeeded && data?.path) cleanupPaths.push(data.path)

      const expected = EXPECT === 'allow' ? '성공 (취약)' : '거부'
      const actual = error
        ? `error(${(error as { statusCode?: string }).statusCode ?? '?'}): ${error.message}`
        : '성공'
      const pass = EXPECT === 'allow' ? succeeded : !succeeded
      record(1, 'anon 업로드', expected, actual, pass)
    }

    // 항목 2: anon 기존 파일 읽기 [positive control] — 공개 읽기 유지 증거
    {
      if (baselineFiles.length === 0) {
        record(2, 'anon 기존 파일 읽기 [positive control]', '바이트 길이 > 0', 'baseline 파일 0개 — 검증 불가', false)
      } else {
        const target = baselineFiles[0].name
        const { data, error } = await anon.storage.from(BUCKET).download(target)
        const len = data ? data.size : 0
        record(
          2,
          `anon 기존 파일 읽기 [positive control] (${target})`,
          '바이트 길이 > 0',
          error ? `error: ${error.message}` : `${len} bytes`,
          !error && len > 0,
        )
      }
    }

    // 항목 3: service_role 업로드 [회귀 가드] — uploadAdImage() 경로의 대리 검증
    {
      const path = `${PREFIX}${Date.now()}-admin.png`
      const { data, error } = await admin.storage
        .from(BUCKET)
        .upload(path, pngBytes(), { contentType: 'image/png', upsert: false })

      if (data?.path) cleanupPaths.push(data.path)
      record(
        3,
        'service_role 업로드 [회귀 가드]',
        '성공',
        error ? `error: ${error.message}` : '성공',
        !error,
      )
    }

    // 항목 4: 버킷 파일 감사 — 기존 파일 이름이 ad-actions.ts 업로드 경로 패턴에 맞는지
    {
      const offenders = baselineFiles.filter((f) => !ADMIN_PATH_RE.test(f.name))
      for (const f of baselineFiles) {
        console.log(
          `  📄 ${f.name} | created_at=${f.created_at ?? '?'} | mimetype=${f.metadata?.mimetype ?? '?'} | size=${f.metadata?.size ?? '?'}`,
        )
      }
      if (offenders.length > 0) {
        console.error(
          `🔴 패턴 밖 파일 ${offenders.length}건 — 외부 업로드 의심 — 사용자 보고 필요: ${offenders.map((f) => f.name).join(', ')}`,
        )
      }
      record(
        4,
        '버킷 파일 감사 (ad-actions.ts 경로 패턴 일치)',
        '패턴 밖 파일 0건',
        `패턴 밖 파일 ${offenders.length}건`,
        offenders.length === 0,
      )
    }

    // 항목 5는 finally의 cleanup에서 기록한다
    await cleanupAndRecord(cleanupPaths, baselineFiles.length)
  } catch (err) {
    console.error(`\n💥 검증 중 예외: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
    // 예외가 나도 cleanup은 시도한다 (업로드가 일부 성공했을 수 있음)
    if (results.length < 5) {
      await cleanupAndRecord(cleanupPaths, 0)
    }
  }

  const passed = results.filter((r) => r.pass).length
  console.log(`\n📊 결과: ${passed}/${results.length} PASS (--expect=${EXPECT})`)
  console.log('| # | 항목 | 기대 | 실측 | 판정 |')
  console.log('|---|------|------|------|------|')
  for (const r of results) {
    console.log(`| ${r.no} | ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅' : '❌'} |`)
  }

  if (results.length !== 5 || passed !== 5) {
    console.error('\n❌ 최종 판정: FAIL')
    process.exitCode = 1
  } else {
    console.log('\n✅ 최종 판정: PASS (5/5)')
  }
}

async function cleanupAndRecord(cleanupPaths: string[], baselineCount: number): Promise<void> {
  console.log('\n🧹 cleanup (service_role, finally)')

  if (cleanupPaths.length > 0) {
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(cleanupPaths)
    if (rmErr) console.error(`  ❌ 업로드분 삭제 실패: ${rmErr.message}`)
  }

  const { data: listAfter, error: listErr } = await admin.storage.from(BUCKET).list()
  if (listErr) {
    record(5, 'cleanup 검증', 'PREFIX 잔여 0건', `list() 실패: ${listErr.message}`, false)
    return
  }

  const remaining = (listAfter ?? []).filter((f) => f.name.startsWith(PREFIX))
  const total = (listAfter ?? []).length
  console.log(`  PREFIX 잔여: ${remaining.length}건`)
  console.log(`  전체 파일 수: ${total}건 (baseline: ${baselineCount}건)`)
  if (remaining.length > 0) {
    console.error(`  ❌ 잔여 파일: ${remaining.map((f) => f.name).join(', ')}`)
  }

  record(
    5,
    'cleanup 검증 (PREFIX 잔여 0건, 전체 파일 수 baseline 복귀)',
    `PREFIX 잔여 0건, 전체 ${baselineCount}건`,
    `PREFIX 잔여 ${remaining.length}건, 전체 ${total}건`,
    remaining.length === 0 && total === baselineCount,
  )
}

void main()
