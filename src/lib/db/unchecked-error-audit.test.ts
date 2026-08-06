import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findUncheckedErrors, formatViolations } from './unchecked-error-audit'

// ── 1부: 스캐너 자체가 동작하는지 (픽스처) ──────────────────────────────────
// 게이트가 "0건"을 통과시킬 때, 그게 정말 깨끗해서인지 스캐너가 고장나서인지
// 구분할 수 있어야 한다. 실제 장애를 냈던 코드 모양을 픽스처로 박아 둔다.

describe('findUncheckedErrors — 스캐너 건전성', () => {
  it('결과를 버리는 쓰기를 잡는다', () => {
    // Arrange — 실패해도 아무 흔적이 없다
    const src = `await supabase.from('ad_events').insert({ ad_id: id })`

    // Act
    const found = findUncheckedErrors('x.ts', src)

    // Assert
    expect(found).toHaveLength(1)
    expect(found[0]!.mode).toBe('discarded')
    expect(found[0]!.kind).toBe('write')
  })

  it('결과를 버리는 rpc를 잡는다', () => {
    const src = `await supabase.rpc('increment_view_count', { p_complex_id: id })`
    const found = findUncheckedErrors('x.ts', src)
    expect(found).toHaveLength(1)
    expect(found[0]!.kind).toBe('rpc')
  })

  it('error를 안 받는 구조분해를 잡는다 — 4주 장애의 그 모양', () => {
    // Arrange — supabase-js는 throw하지 않으므로 이 형태는 실패를 "빈 결과"로 만든다
    const src = `const { data } = await supabase.rpc('refresh_complex_price_stats')`

    // Act
    const found = findUncheckedErrors('x.ts', src)

    // Assert
    expect(found).toHaveLength(1)
    expect(found[0]!.mode).toBe('no-error-binding')
  })

  it('error를 받으면 통과시킨다', () => {
    const src = `const { data, error } = await supabase.rpc('foo')`
    expect(findUncheckedErrors('x.ts', src)).toEqual([])
  })

  it('이름을 바꿔 받아도 통과시킨다', () => {
    // Arrange — 한 함수에서 여러 쿼리를 쓸 때 흔한 형태
    const src = `const { data: rows, error: txError } = await supabase.from('transactions').select('id')`

    // Act / Assert
    expect(findUncheckedErrors('x.ts', src)).toEqual([])
  })

  it('응답 객체를 통째로 받는 경우는 판정하지 않는다(거짓 양성 방지)', () => {
    // Arrange — 이후 res.error를 볼 수 있으므로 여기서 단정하지 않는다
    const src = `const res = await supabase.from('t').insert({ a: 1 })`
    expect(findUncheckedErrors('x.ts', src)).toEqual([])
  })

  it('주석 안의 예시 코드는 잡지 않는다', () => {
    // Arrange — 왜 고쳤는지 설명하려고 옛 코드를 주석에 남기는 일이 잦다.
    // 그걸 위반으로 잡으면 문서를 잘 쓸수록 게이트가 시끄러워진다.
    const src = [
      `//   await supabase.from('ingest_runs').update({ status }).eq('id', runId)`,
      ` * const { data } = await supabase.rpc('foo')`,
      `/* await supabase.from('t').delete() */`,
    ].join('\n')

    // Act / Assert
    expect(findUncheckedErrors('x.ts', src)).toEqual([])
  })

  it('읽기 전용 select는 대상이 아니다', () => {
    // Arrange — 이 게이트는 "조용히 실패하는 쓰기와 rpc"를 노린다.
    // select까지 넣으면 위반이 수백 건이 되어 아무도 안 보게 된다.
    const src = `const { data } = await supabase.from('complexes').select('id')`
    expect(findUncheckedErrors('x.ts', src)).toEqual([])
  })
})

// ── 2부: 실제 소스에 위반이 없는지 (게이트) ─────────────────────────────────

const SRC_ROOT = join(process.cwd(), 'src')

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('Supabase error 확인 게이트', () => {
  it('쓰기·rpc 호출이 모두 error를 확인한다', () => {
    // Arrange
    const files = collectSourceFiles(SRC_ROOT)
    expect(files.length).toBeGreaterThan(50) // 스캔 범위가 비어 있지 않은지 확인

    // Act
    const violations = files.flatMap((file) =>
      findUncheckedErrors(relative(process.cwd(), file).replace(/\\/g, '/'), readFileSync(file, 'utf8')),
    )

    // Assert
    expect(violations, `\nerror를 확인하지 않는 지점:\n${formatViolations(violations)}\n`).toEqual([])
  })
})
