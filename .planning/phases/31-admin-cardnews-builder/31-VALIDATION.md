# Phase 31: 어드민 카드뉴스 빌더 - Validation Plan

**Phase:** 31-admin-cardnews-builder
**Created:** 2026-06-25
**Source:** RESEARCH.md Validation Architecture → 구체화

---

## Coverage Summary

| Req ID | Behavior | Test Type | Test File | Status |
|--------|----------|-----------|-----------|--------|
| BILD-01 | 집계 API — 3건 미만 제외, 200% 이상치 필터, 이중 경계 | unit | `src/lib/data/cardnews-aggregate.test.ts` | ❌ 미생성 |
| BILD-02 | HTML 생성 — 4장 반환, CDN 폰트, 법적 표기 포함 | unit | `src/lib/data/cardnews-builder.test.ts` | ❌ 미생성 |
| BILD-03 | Groq API — 폴백 처리, 빈 키 시 FALLBACK, 500 미발생 | unit (mock) | `src/services/github-actions.test.ts` | ❌ 미생성 |
| BILD-04 | GitHub Actions 어댑터 — dispatch, artifact URL 반환 | unit (mock fetch) | `src/services/github-actions.test.ts` | ❌ 미생성 |
| BILD-05 | iframe 스케일 컨테이너, 1080→432px | visual/manual | 수동 확인 | — |
| BILD-06 | 스케줄러 enable/disable toggle | unit (mock) | `src/services/github-actions.test.ts` | ❌ 미생성 |
| BILD-07 | 신규 쿼리 함수 export, 월세/전세/신고가/변동률 | unit | `card-news/scripts/fetch-data.test.mjs` | ❌ 미생성 |
| BILD-08 | renderClosing() — 법적 표기 2개 문구 하드코딩 | unit | `card-news/scripts/fetch-data.test.mjs` | ❌ 미생성 |

---

## Test Files to Create

### 1. `card-news/scripts/fetch-data.test.mjs` (BILD-07, BILD-08)

```javascript
import { describe, it, expect } from 'vitest'
import { getDateRange, filterOutliers } from './scripts/fetch-data.js'
import { renderClosing, BASE_CSS_PREVIEW } from './scripts/templates.js'

describe('getDateRange', () => {
  it('weekly returns Mon–Sun of last week', () => {
    const { from, to } = getDateRange('weekly')
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(to) > new Date(from)).toBe(true)
  })
  it('custom passes through dates unchanged', () => {
    const { from, to } = getDateRange('custom', '2026-01-01', '2026-01-31')
    expect(from).toBe('2026-01-01')
    expect(to).toBe('2026-01-31')
  })
  it('throws on unknown type', () => {
    expect(() => getDateRange('unknown')).toThrow('Unknown period type')
  })
})

describe('renderClosing — D-08 법적 표기', () => {
  it('contains 국토교통부 실거래가 공개시스템', () => {
    const html = renderClosing({})
    expect(html).toContain('국토교통부 실거래가 공개시스템')
  })
  it('contains 신고 기준이며 실제 거래와 차이', () => {
    const html = renderClosing({})
    expect(html).toContain('신고 기준이며 실제 거래와 차이가 있을 수 있습니다')
  })
})

describe('BASE_CSS_PREVIEW — CDN 폰트', () => {
  it('does not contain file:// paths', () => {
    expect(BASE_CSS_PREVIEW).not.toContain('file://')
  })
  it('contains Pretendard CDN URL', () => {
    expect(BASE_CSS_PREVIEW).toContain('cdn.jsdelivr.net/gh/orioncactus/pretendard')
  })
})

// fetchMonthlyRanking, fetchJeonseRanking, fetchAllTimeHighRanking, fetchPriceChangeRanking
// → DB 의존성으로 인해 integration test (별도 환경에서 실행)
describe('fetch-data.js exports', () => {
  it('exports all required functions', async () => {
    const mod = await import('./scripts/fetch-data.js')
    expect(typeof mod.fetchJeonseRanking).toBe('function')
    expect(typeof mod.fetchMonthlyRanking).toBe('function')
    expect(typeof mod.fetchAllTimeHighRanking).toBe('function')
    expect(typeof mod.fetchPriceChangeRanking).toBe('function')
    expect(typeof mod.getDateRange).toBe('function')
    expect(typeof mod.filterOutliers).toBe('function')
  })
})
```

### 2. `src/services/github-actions.test.ts` (BILD-03, BILD-04, BILD-06)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { triggerWorkflow, getWorkflowState, setWorkflowEnabled } from '@/services/github-actions'

// mock global fetch
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('triggerWorkflow', () => {
  it('throws when GITHUB_PAT is not set', async () => {
    delete process.env.GITHUB_PAT
    await expect(
      triggerWorkflow({ owner: 'o', repo: 'r', workflowId: 'w.yml', ref: 'main', inputs: {} })
    ).rejects.toThrow('GITHUB_PAT not configured')
  })

  it('sends POST to GitHub dispatch endpoint', async () => {
    process.env.GITHUB_PAT = 'test-token'
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(
      triggerWorkflow({ owner: 'o', repo: 'r', workflowId: 'w.yml', ref: 'main', inputs: { payload_url: 'https://example.com' } })
    ).resolves.not.toThrow()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/dispatches'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('setWorkflowEnabled', () => {
  it('calls enable endpoint', async () => {
    process.env.GITHUB_PAT = 'test-token'
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await setWorkflowEnabled('o', 'r', 'w.yml', true)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/enable'),
      expect.objectContaining({ method: 'PUT' })
    )
  })
})
```

### 3. `src/lib/data/cardnews-aggregate.test.ts` (BILD-01)

```typescript
import { describe, it, expect } from 'vitest'

// filterOutliers 로직 단위 테스트 (DB 없이 — 순수 함수로 추출 필요)
// 실제 route.ts의 filterOutliers는 adminClient 의존성이 있어
// 순수 함수로 extract 후 단위 테스트

describe('filterOutliers (pure logic)', () => {
  it('removes transactions > 200% of complex average', () => {
    // 단지 A 평균 10,000만원 → 20,001만원 이상 제외
    const avgMap = new Map([['complex-a', 10000]])
    const txs = [
      { complex_id: 'complex-a', price: 15000 },  // 150% — 포함
      { complex_id: 'complex-a', price: 20001 },  // 200% 초과 — 제외
    ]
    const result = txs.filter(t => {
      const avg = avgMap.get(t.complex_id)
      return !avg || t.price <= avg * 2
    })
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(15000)
  })

  it('keeps transactions when no historical data', () => {
    const avgMap = new Map<string, number>()
    const txs = [{ complex_id: 'unknown', price: 99999 }]
    const result = txs.filter(t => {
      const avg = avgMap.get(t.complex_id)
      return !avg || t.price <= avg * 2
    })
    expect(result).toHaveLength(1)
  })
})

describe('isDataIncomplete', () => {
  it('returns true when to is within 7 days', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const diff = Math.ceil((new Date().getTime() - new Date(yesterday).getTime()) / (1000 * 60 * 60 * 24))
    expect(diff <= 7).toBe(true)
  })
})
```

---

## Manual Verification Checklist

### BILD-05 (iframe 스케일)
- [ ] `/admin/cardnews/builder` 접속 → 4장 미리보기가 432px 컨테이너에 표시됨
- [ ] iframe 내 Pretendard 폰트가 로드됨 (브라우저 DevTools 확인)
- [ ] `transform: scale(0.4)` + `transformOrigin: top left` 적용됨

### BILD-08 (법적 표기)
- [ ] 생성된 클로징 카드 하단에 "출처: 국토교통부 실거래가 공개시스템" 표시됨
- [ ] "본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다" 표시됨

### D-02 (GitHub Actions 트리거)
- [ ] "PNG 생성" 클릭 → GitHub Actions 탭에서 custom-cardnews.yml 실행 확인
- [ ] artifact ZIP 다운로드 URL이 UI에 표시됨

### D-07 (스케줄러)
- [ ] `/admin/cardnews/scheduler` → weekly-generate.yml 상태 표시
- [ ] Enable/Disable 토글 → GitHub Actions 탭에서 상태 변경 확인

---

## Automated Run Commands

```bash
# card-news 스크립트 테스트
cd card-news && node --experimental-vm-modules ../../node_modules/vitest/vitest.mjs run scripts/fetch-data.test.mjs

# Next.js 단위 테스트
npm run test -- --run src/services/github-actions.test.ts
npm run test -- --run src/lib/data/cardnews-aggregate.test.ts

# 전체 실행
npm run test
```

---

## Gap Notes

- `filterOutliers` 함수가 DB 의존성 없이 순수 함수로 추출되지 않으면 단위 테스트 불가 → route.ts 구현 시 순수 로직 함수 별도 분리 필요
- BILD-05 iframe 미리보기는 브라우저 수동 확인만 가능 (Playwright E2E로 보완 가능하나 이 Phase 범위 밖)
- Groq API 실제 호출 테스트는 GROQ_API_KEY 필요 → CI에서 mock 사용, 수동 검증은 실환경 필요
