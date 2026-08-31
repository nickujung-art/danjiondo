/**
 * 공유 테이블 site_id 필터 정적 감사.
 *
 * [왜 존재하는가]
 * ad_campaigns·ad_events·favorites 는 danjiondo·realtrade-story·changbuletter 가
 * 한 Supabase 프로젝트에서 공유한다. 사이트 분리는 RLS 가 아니라 애플리케이션 코드
 * 책임이다. site_id 필터를 빠뜨려도 쿼리는 성공하고 행도 돌아오는데 — 엉뚱한 행이
 * 섞인다. 이 결함이 2026-07~08 에 세 번 났다.
 *
 * 🔴 이 모듈은 DB 에 접속하지 않는다. 파일시스템 읽기와 순수 함수뿐이다.
 */
import fs from 'fs'
import path from 'path'

const SHARED_TABLES = ['ad_campaigns', 'ad_events', 'favorites'] as const

export interface SharedTableSite {
  file: string
  line: number
  table: string
  hasSiteIdFilter: boolean
}

/**
 * 의도적으로 site_id 필터가 없는 곳. 사유를 주석으로 남긴다.
 *
 * 형식: 'posix/relative/path.ts:line'
 * line 은 .from() 호출 행이다. 행 번호가 바뀌면 테스트가 깨져서 알려준다.
 */
export const ALLOWED_EXCEPTIONS: Record<string, string> = {
  // ad_events 에는 site_id 컬럼이 없다 — campaign_id FK 를 통해 사이트가 결정된다
  'src/app/api/ads/events/route.ts': 'ad_events INSERT: site_id 는 campaign FK 를 통해 암묵 스코핑',
  'src/lib/data/ads.ts': 'getAdRoiStats .from(ad_events): siteId 필터는 campaigns 쿼리에서 적용',
}

const FROM_RE = /\.from\(\s*['"`](ad_campaigns|ad_events|favorites)['"`]\s*\)/
// .eq('site_id', …) 또는 .in('site_id', …) 또는 INSERT 페이로드의 site_id: …
const SITE_ID_RE = /(?:\.(?:eq|in)\(\s*['"`]site_id['"`]|site_id\s*:\s*)/

/**
 * src/ 아래 모든 TS/TSX 파일을 스캔해 공유 테이블 쿼리 지점을 수집한다.
 * 테스트 파일(*.test.*, *.spec.*)은 제외한다.
 */
export function collectSharedTableSites(rootDir: string): SharedTableSite[] {
  const srcDir = path.join(rootDir, 'src')
  const results: SharedTableSite[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue
      if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(entry.name)) continue

      const content = fs.readFileSync(full, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const match = FROM_RE.exec(lines[i]!)
        if (!match?.[1]) continue

        const table: string = match[1]
        // 앞뒤 20줄 범위에서 site_id 필터를 찾는다
        const windowStart = Math.max(0, i - 5)
        const windowEnd = Math.min(lines.length, i + 20)
        const window = lines.slice(windowStart, windowEnd).join('\n')
        const hasSiteIdFilter = SITE_ID_RE.test(window)

        const relPath = path.relative(rootDir, full).replace(/\\/g, '/')
        results.push({ file: relPath, line: i + 1, table, hasSiteIdFilter })
      }
    }
  }

  walk(srcDir)
  return results
}

/** 필터 없고 예외 목록에도 없는 지점을 반환한다. */
export function findUnguarded(sites: SharedTableSite[]): SharedTableSite[] {
  return sites.filter(s => !s.hasSiteIdFilter && !ALLOWED_EXCEPTIONS[s.file])
}
