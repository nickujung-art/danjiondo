/**
 * site-id-audit 정적 스캐너 테스트.
 *
 * 🔴 DB 불필요 — 항상 실행된다.
 * 공유 테이블(ad_campaigns·ad_events·favorites) 쿼리에 site_id 필터가
 * 있는지 소스를 전수 검사한다.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { collectSharedTableSites, findUnguarded, ALLOWED_EXCEPTIONS } from './site-id-audit'

const ROOT = path.resolve(__dirname, '../../..')

describe('site-id-audit — 공유 테이블 site_id 필터 전수 검사', () => {
  const sites = collectSharedTableSites(ROOT)

  it('공유 테이블 쿼리 지점이 하나 이상 발견된다', () => {
    expect(sites.length).toBeGreaterThan(0)
  })

  it('🔴 site_id 필터 없고 예외도 아닌 지점이 없어야 한다', () => {
    const unguarded = findUnguarded(sites)
    if (unguarded.length > 0) {
      const details = unguarded
        .map(s => `  ${s.file}:${s.line} → .from('${s.table}')`)
        .join('\n')
      throw new Error(
        `site_id 필터 누락 ${unguarded.length}건:\n${details}\n\n` +
        '수정: .eq(\'site_id\', …) 추가하거나 ALLOWED_EXCEPTIONS 에 사유와 함께 등록',
      )
    }
  })

  it('ALLOWED_EXCEPTIONS 의 파일이 실제로 존재한다', () => {
    for (const file of Object.keys(ALLOWED_EXCEPTIONS)) {
      const full = path.join(ROOT, file)
      expect(fs.existsSync(full), `예외 파일 없음: ${file}`).toBe(true)
    }
  })

  it('ALLOWED_EXCEPTIONS 가 10개를 넘지 않는다 (비대화 경보)', () => {
    expect(Object.keys(ALLOWED_EXCEPTIONS).length).toBeLessThanOrEqual(10)
  })
})
