/**
 * `.upsert(…, { onConflict: '…' })` ↔ 실제 UNIQUE 인덱스 일치 감사. (Phase 39 F-05)
 *
 * [왜 존재하는가]
 * Phase 39 의 고장 4 건은 전부 같은 방식으로 생겼다 — 마이그레이션이 UNIQUE 제약을 바꿨는데
 * 애플리케이션의 `onConflict` 문자열은 그대로 남았다. 개별 수정만으로는 다음 마이그레이션에서
 * 반드시 재발한다. 그래서 upsert 지점을 **정적 수집**해 실제 카탈로그와 대조한다.
 *
 * 🔴 이 모듈은 **DB 에 접속하지 않는다.** `@supabase` 를 import 하지 않으며 파일시스템 읽기와
 *    순수 함수뿐이다. 그래야 이 Phase 의 핵심 단언 — *"부분 인덱스는 절대 일치가 아니다"* — 가
 *    라이브 DB 없이 CI 에서도 항상 실행된다.
 *    카탈로그 조회(RPC)는 호출부(src/__tests__/onconflict-constraint-gate.test.ts) 책임이다.
 */
import fs from 'fs'
import path from 'path'

/** `public.unique_indexes_for_table(text)` 가 돌려주는 행. 필터링 전 원본이다. */
export interface RawUniqueIndex {
  index_name: string
  /** 키 컬럼. RPC 는 attname 알파벳 정렬로 돌려준다. 컬럼이 없으면 null 이 올 수 있다. */
  columns: string[] | null
  /** 🔴 pg_index.indpred IS NOT NULL — 부분 인덱스. F-05 의 핵심 플래그. */
  is_partial: boolean
  /** pg_index.indexprs IS NOT NULL — 표현식 인덱스. */
  is_expression: boolean
  /** pg_index.indisvalid */
  is_valid: boolean
}

/** ON CONFLICT 추론에 실제로 쓸 수 있는 인덱스. */
export interface InferrableIndex {
  name: string
  /** 정렬된 컬럼 목록. */
  columns: string[]
}

/** 소스에서 정적 수집한 upsert 호출 지점. */
export interface UpsertSite {
  /** repo 기준 상대경로(posix 구분자). repo 밖이면 절대경로. */
  file: string
  /** 1-based */
  line: number
  /** 역방향으로 가장 가까운 `.from('<table>')`. 못 찾으면 빈 문자열. */
  table: string
  /** 정렬된 onConflict 컬럼 목록. */
  columns: string[]
}

export type Verdict = 'ok' | 'no_matching_index' | 'table_unknown'

export interface AuditResult {
  site: UpsertSite
  verdict: Verdict
  matchedIndex: string | null
}

/**
 * ON CONFLICT 로 **추론 가능한** 인덱스만 남긴다.
 *
 * 🔴 `is_partial` 제거가 이 함수의 존재 이유다.
 * Postgres 는 부분 인덱스를 ON CONFLICT 추론에 쓰려면 INSERT 문에 인덱스 술어와 같은 `WHERE`
 * 절을 요구하는데 **PostgREST 는 그 술어를 보낼 방법이 없다.** 즉 컬럼 목록을 어떻게 맞춰도
 * 42P10 으로 실패한다. 컬럼 이름만 비교하는 감사는 이 경우를 통과시켜 없느니만 못하다.
 *
 * 이 필터를 SQL 로 되돌리지 말 것 — TS 에 있어야 음성 대조가 DB 없이 실행된다.
 */
export function toInferrable(rows: RawUniqueIndex[]): InferrableIndex[] {
  return rows
    .filter((r) => !r.is_partial && !r.is_expression && r.is_valid)
    .map((r) => ({ name: r.index_name, columns: [...(r.columns ?? [])].sort() }))
}

function sameColumnSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i])
}

/**
 * 각 upsert 지점이 추론 가능한 UNIQUE 인덱스와 **정확히 같은 컬럼 집합**을 갖는지 판정한다.
 * 부분집합·상위집합은 일치가 아니다 (Postgres 추론은 집합 완전 일치를 요구한다).
 */
export function auditSites(
  sites: UpsertSite[],
  indexesByTable: Record<string, InferrableIndex[]>,
): AuditResult[] {
  return sites.map((site) => {
    const indexes = indexesByTable[site.table]
    if (!indexes) return { site, verdict: 'table_unknown' as const, matchedIndex: null }

    const wanted = [...site.columns].sort()
    const matched = indexes.find((idx) => sameColumnSet(wanted, idx.columns))
    return matched
      ? { site, verdict: 'ok' as const, matchedIndex: matched.name }
      : { site, verdict: 'no_matching_index' as const, matchedIndex: null }
  })
}

/**
 * 주석 본문을 **같은 길이의 공백**으로 치환한다 (개행은 보존).
 *
 * 🔴 오프셋·행번호가 원본과 1:1로 유지되어야 하므로 길이를 바꾸지 않는다.
 *
 * 왜 필요한가: 이미 고쳐진 결함 2 건이 *"왜 upsert 를 쓰지 않는가"* 를 설명하려고 옛
 * `onConflict` 값을 주석에 그대로 남겨두고 있다 —
 *   src/lib/auth/favorite-actions.ts   `// … 그래서 onConflict: 'user_id,complex_id' 는 …`
 *   src/lib/data/new-listings-molit.ts `* \`onConflict: 'name,region'\`은 …`
 * 주석을 지우지 않으면 스캐너가 이 둘을 실제 호출로 오탐하고, 라이브 게이트가 이미 고쳐진
 * 테이블을 FAIL 로 보고한다. 오탐 하나면 게이트 전체가 무시된다.
 */
function stripComments(src: string): string {
  const out = src.split('')
  const ESC = '\\'
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = ' '
  }

  type Mode = 'code' | 'line' | 'block' | "'" | '"' | '`'
  let mode: Mode = 'code'
  let start = 0
  /** code 모드에서 마지막으로 본 공백 아닌 문자 — `/` 가 나눗셈인지 정규식인지 가르는 데 쓴다 */
  let prev = ''

  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? ''
    const next = src[i + 1] ?? ''

    if (mode === 'code') {
      if (c === '/' && next === '/') {
        mode = 'line'
        start = i
        i++
      } else if (c === '/' && next === '*') {
        mode = 'block'
        start = i
        i++
      } else if (c === '/' && REGEX_PREV.has(prev)) {
        // 정규식 리터럴. 🔴 반드시 통째로 건너뛴다 — 문자 클래스 안의 따옴표를 문자열 시작으로
        // 오인하면 모드가 새서 뒤따르는 진짜 주석을 지우지 못한다.
        // (실제로 이 파일의 FROM_RE = /\.from\(\s*['"]…['"]\s*\)/g 가 그 함정이었다.)
        i = skipRegexLiteral(src, i)
        prev = '/'
      } else if (c === "'" || c === '"' || c === '`') {
        mode = c
      } else if (c.trim()) {
        prev = c
      }
      continue
    }

    if (mode === 'line') {
      if (c === '\n') {
        blank(start, i)
        mode = 'code'
        prev = ''
      }
      continue
    }

    if (mode === 'block') {
      if (c === '*' && next === '/') {
        blank(start, i + 2)
        mode = 'code'
        prev = '*'
        i++
      }
      continue
    }

    // 문자열/템플릿 리터럴 안 — 이스케이프를 건너뛰고 닫는 따옴표를 찾는다
    if (c === ESC) {
      i++
      continue
    }
    if (c === mode) {
      prev = mode
      mode = 'code'
      continue
    }
    // JS 에서 '…' · "…" 는 개행을 넘을 수 없다. 넘겼다면 우리가 시작을 잘못 잡은 것이므로
    // 여기서 복구한다 — 모드가 파일 끝까지 새는 것보다 낫다.
    if (c === '\n' && mode !== '`') {
      mode = 'code'
      prev = ''
    }
  }

  if (mode === 'line' || mode === 'block') blank(start, src.length)
  return out.join('')
}

/**
 * `/` 앞에 이 문자가 오면 나눗셈이 아니라 정규식 리터럴의 시작이다.
 * (`return /re/` 처럼 키워드 뒤에 오는 형태는 다루지 않는다 — 이 스캐너의 목적상
 *  정규식을 나눗셈으로 오인해도 손해는 "문자열 모드가 한 줄 새는 것" 뿐이고,
 *  그건 아래 개행 복구가 흡수한다.)
 */
const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>'])

/** 정규식 리터럴의 닫는 `/` 인덱스를 돌려준다. 닫히지 않으면 개행 직전에서 멈춘다. */
function skipRegexLiteral(src: string, openIndex: number): number {
  const ESC = '\\'
  let inClass = false
  for (let j = openIndex + 1; j < src.length; j++) {
    const d = src[j]
    if (d === ESC) {
      j++
      continue
    }
    if (d === '\n') return j - 1
    if (inClass) {
      if (d === ']') inClass = false
      continue
    }
    if (d === '[') inClass = true
    else if (d === '/') return j
  }
  return src.length - 1
}

const ON_CONFLICT_RE = /onConflict\s*:\s*['"]([^'"]+)['"]/g
const FROM_RE = /\.from\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '__tests__',
  '.git',
  'coverage',
  // 40-03: card-news/output(발행 산출물 HTML/PNG)·card-news/fixtures(골든 HTML) 은
  // 소스가 아니다. 스캔 낭비이자, 골든 HTML 이 우연히 `onConflict` 문자열을 담으면 오탐이다.
  'output',
  'fixtures',
])

/**
 * 🔴 수집에서 제외하는 개별 파일 (repo 상대경로, posix).
 *
 * `scripts/verify-onconflict-probe.ts` 는 **감사 도구 자신**이다. `PROBE_TARGETS` 배열에
 *   ① 일부러 깨진 값(`facility_kapt` / `complex_id` — 42P10 이 나와야 정상)
 *   ② `.from(<변수>)` 형태(문자열 리터럴이 아니라 테이블 귀속 불가)
 * 을 데이터로 들고 있다. 수집하면 라이브 게이트가 **영구 오탐**한다 —
 * 오탐 하나면 게이트 전체가 무시된다(Phase 39 stripComments 와 같은 이유).
 *
 * ⛔ 이 목록을 "게이트가 시끄러워서" 늘리지 말 것. 늘리는 순간 T-39-03-02
 *    (스캐너가 조용히 지점을 놓침)가 그대로 재현된다.
 */
const SKIP_FILES = new Set(['scripts/verify-onconflict-probe.ts'])

function walk(dir: string, acc: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, acc)
      continue
    }
    if (!entry.isFile()) continue
    // 40-03: `.js`/`.mjs`/`.cjs` 추가. card-news/scripts 가 ESM `.js` 스탠드얼론이라
    // 이 확장자를 빼면 그쪽 upsert 가 통째로 감사 밖으로 빠진다 (T-40-03-02).
    if (!/\.(tsx?|mjs|cjs|js)$/.test(entry.name)) continue
    if (/\.d\.ts$/.test(entry.name)) continue
    if (/\.(test|spec)\.(tsx?|mjs|cjs|js)$/.test(entry.name)) continue
    // 🔴 `process.cwd()` 에 의존하지 않도록 경로 **접미사**로 판정한다 — CWD 가 저장소
    //    루트가 아니면 상대경로 비교가 조용히 빗나가고 제외가 무력화된다.
    const posix = full.split(path.sep).join('/')
    if ([...SKIP_FILES].some((s) => posix === s || posix.endsWith(`/${s}`))) continue
    acc.push(full)
  }
}

function toRepoRelative(full: string): string {
  const rel = path.relative(process.cwd(), full)
  const chosen = !rel || rel.startsWith('..') ? full : rel
  return chosen.split(path.sep).join('/')
}

/**
 * `rootDir` 아래의 `.ts`/`.tsx` 를 재귀 스캔해 `onConflict` 문자열 리터럴 할당을 수집한다.
 *
 * 테이블 귀속은 **매치 오프셋 이전 텍스트에서 가장 마지막 `.from('<table>')`** 로 정한다.
 * 이 규칙 하나로 두 실측 형태가 모두 해결된다:
 *   ① 체인형        `supabase.from('new_listings').upsert({…}, { onConflict: 'pblanc_no' })`
 *   ② 변수 경유형    `const t = supabase.from('facility_kapt') as any` … `t.upsert({…}, { onConflict: … })`
 *
 * 하드코딩 목록을 쓰지 않는 이유: 신규 upsert 가 게이트를 그냥 빠져나가면 안 된다.
 */
export function collectUpsertSites(rootDir: string): UpsertSite[] {
  const files: string[] = []
  walk(rootDir, files)
  files.sort()

  const sites: UpsertSite[] = []

  for (const full of files) {
    const raw = fs.readFileSync(full, 'utf8')
    if (!raw.includes('onConflict')) continue
    const src = stripComments(raw)

    ON_CONFLICT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ON_CONFLICT_RE.exec(src)) !== null) {
      const offset = m.index
      const before = src.slice(0, offset)

      FROM_RE.lastIndex = 0
      let table = ''
      let f: RegExpExecArray | null
      while ((f = FROM_RE.exec(before)) !== null) table = f[1] ?? ''

      sites.push({
        file: toRepoRelative(full),
        line: before.split('\n').length,
        table,
        columns: (m[1] ?? '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
          .sort(),
      })
    }
  }

  return sites
}

/**
 * 🔴 감사 스캔 루트 — **단일 진실 원천**. (Phase 40-03)
 *
 * Phase 39 게이트는 `src/` 만 봤다. 그래서 `card-news/scripts/*.js` 에 새 upsert 를 쓰면
 * 게이트가 **공허하게 통과**한다 — 침묵이 주 실패 모드다 (T-39-03-02 / T-40-03-02).
 *
 * ⛔ 이 목록을 호출부(`onconflict-constraint-gate.test.ts` 등)에 흩어놓지 말 것.
 *    Phase 39 가 지목한 실패 모드가 정확히 "한 군데만 고치고 다른 데는 안 고침" 이다.
 *    `onconflict-audit.test.ts` 의 케이스 25 가 이 상수의 내용을 DB 없이 못 박는다.
 *
 * 각 루트의 근거:
 *   - `src`               — 애플리케이션 코드 (Phase 39 원본 범위)
 *   - `card-news/scripts` — 서비스롤 스탠드얼론. `contents` 적재가 여기서 일어난다 (40-03)
 *   - `scripts`           — 일회성 백필·크롤러. 프로덕션 테이블에 직접 upsert 한다
 */
export const AUDIT_ROOTS = ['src', 'card-news/scripts', 'scripts'] as const

/**
 * `AUDIT_ROOTS` 전부를 스캔해 upsert 지점을 합친다.
 * @param repoRoot 저장소 루트 절대경로
 */
export function collectAllUpsertSites(repoRoot: string): UpsertSite[] {
  return AUDIT_ROOTS.flatMap((root) => collectUpsertSites(path.join(repoRoot, root)))
}

/** 실패 메시지용 markdown 표. 어느 파일:행의 어떤 컬럼이 안 맞는지 바로 보이게 한다. */
export function formatAuditTable(results: AuditResult[]): string {
  const header = '| file:line | table | onConflict | verdict | matched index |\n|---|---|---|---|---|'
  const rows = results.map(
    (r) =>
      `| ${r.site.file}:${r.site.line} | ${r.site.table || '(unresolved)'} | ${r.site.columns.join(',')} | ${r.verdict} | ${r.matchedIndex ?? '-'} |`,
  )
  return [header, ...rows].join('\n')
}
