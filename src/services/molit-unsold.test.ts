import { describe, it, expect } from 'vitest'
import { resolveSggCode, type RegionAddrEntry, type UnsoldItem } from './molit-unsold'

// regions 테이블 fixture — 창원 5개 구 + 김해시 + 경남 신규 시군구(진주시) 샘플
const REGIONS: RegionAddrEntry[] = [
  { sgg_code: '48121', si: '창원시', gu: '의창구' },
  { sgg_code: '48123', si: '창원시', gu: '성산구' },
  { sgg_code: '48125', si: '창원시', gu: '마산합포구' },
  { sgg_code: '48127', si: '창원시', gu: '마산회원구' },
  { sgg_code: '48129', si: '창원시', gu: '진해구' },
  { sgg_code: '48250', si: '김해시', gu: null },
  { sgg_code: '48170', si: '진주시', gu: null },
]

function makeItem(overrides: Partial<UnsoldItem> = {}): UnsoldItem {
  return {
    signgunm: '창원시',
    dongnm: '',
    rdnmadr: '',
    construction: '',
    enforcer: '',
    publictypenm: '',
    leasetypenm: '',
    privatear: null,
    totalcnt: 0,
    unsoldcnt_prev: 0,
    unsoldcnt_this: 0,
    ...overrides,
  }
}

describe('resolveSggCode', () => {
  it('창원시 + rdnmadr 성산구 → 48123 (다중 gu 후보를 rdnmadr로 좁힘)', () => {
    const item = makeItem({ signgunm: '창원시', rdnmadr: '경상남도 창원시 성산구 상남로 1' })
    expect(resolveSggCode(item, REGIONS)).toBe('48123')
  })

  it('김해시 (gu=null 단일 후보) → rdnmadr 확인 없이 48250', () => {
    const item = makeItem({ signgunm: '김해시', rdnmadr: '' })
    expect(resolveSggCode(item, REGIONS)).toBe('48250')
  })

  it('경남 신규 시군구(진주시) → CHANGWON_GU_MAP에 없던 코드도 동적으로 48170 반환', () => {
    const item = makeItem({ signgunm: '진주시', rdnmadr: '경상남도 진주시 어딘가로 1' })
    expect(resolveSggCode(item, REGIONS)).toBe('48170')
  })

  it('regions 배열에 없는 시군구(부산광역시) → null', () => {
    const item = makeItem({ signgunm: '부산광역시 해운대구', rdnmadr: '부산광역시 해운대구 어딘가로 1' })
    expect(resolveSggCode(item, REGIONS)).toBeNull()
  })

  it('창원시이지만 rdnmadr에서 구를 특정할 수 없으면 null', () => {
    const item = makeItem({ signgunm: '창원시', rdnmadr: '경상남도 창원시 어딘가로 1' })
    expect(resolveSggCode(item, REGIONS)).toBeNull()
  })
})
