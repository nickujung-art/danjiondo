import { describe, expect, it } from 'vitest'
import {
  cleanFacilities,
  pickDetailUrls,
  stripCommonPrefix,
  stripInstructionEcho,
} from './presale-crawler'

describe('stripCommonPrefix', () => {
  it('removes the shared navigation header from every page', () => {
    // Arrange — 분양 사이트는 모든 페이지가 같은 메뉴 목록으로 시작한다
    const nav = '분양정보 사업개요 분양일정 공급금액 모집공고'
    const pages = [`${nav} 랜딩 본문입니다`, `${nav} 총 1,509세대 규모입니다`]

    // Act
    const result = stripCommonPrefix(pages)

    // Assert
    expect(result[0]).toBe('랜딩 본문입니다')
    expect(result[1]).toBe('총 1,509세대 규모입니다')
  })

  it('leaves a single page untouched — nothing to compare against', () => {
    // Arrange
    const pages = ['분양정보 사업개요 본문']

    // Act / Assert
    expect(stripCommonPrefix(pages)).toEqual(pages)
  })

  it('does not strip when a page would be emptied', () => {
    // Arrange — 같은 페이지를 두 번 담은 경우. 공통 접두사가 곧 전체다.
    const pages = ['같은 본문 내용', '같은 본문 내용']

    // Act / Assert
    expect(stripCommonPrefix(pages)).toEqual(pages)
  })
})

describe('pickDetailUrls', () => {
  it('follows the hint priority order, not document order', () => {
    // Arrange — 메뉴에는 system 이 먼저 나오지만 overview/community 가 정보 밀도가 높다
    const html = [
      '<a href="/system">시스템</a>',
      '<a href="/deployment">배치</a>',
      '<a href="/overview">사업개요</a>',
      '<a href="/community">커뮤니티</a>',
      '<a href="/plane">평면</a>',
    ].join('')

    // Act — MAX_SUBPAGES 는 3
    const result = pickDetailUrls(html, 'https://example.com/x')

    // Assert
    expect(result).toEqual([
      'https://example.com/overview',
      'https://example.com/community',
      'https://example.com/plane',
    ])
  })

  it('excludes other origins and asset links', () => {
    // Arrange
    const html = [
      '<a href="https://other.com/overview">외부</a>',
      '<a href="/overview.pdf">문서</a>',
      '<a href="/community">커뮤니티</a>',
    ].join('')

    // Act
    const result = pickDetailUrls(html, 'https://example.com/x')

    // Assert
    expect(result).toEqual(['https://example.com/community'])
  })
})

describe('stripInstructionEcho', () => {
  it('nulls values copied verbatim from the instruction block', () => {
    // Arrange — 실측: 입주 시기가 없자 반환 형식의 설명문을 그대로 베껴 왔다
    const instructions = '반환 형식: moveInDate 는 "입주 예정 텍스트 (예: 2027년 상반기)" 입니다'
    const parsed = { moveInDate: '입주 예정 텍스트 (예: 2027년 상반기)', builder: 'HDC현대산업개발' }

    // Act
    const result = stripInstructionEcho(parsed, instructions)

    // Assert
    expect(result.moveInDate).toBeNull()
    expect(result.builder).toBe('HDC현대산업개발')
  })

  it('keeps short values that could collide by chance', () => {
    // Arrange — "HDC"(3자)는 지시문에 우연히 있어도 살린다
    const instructions = '예: HDC 같은 시공사명을 적으세요'
    const parsed = { builder: 'HDC' }

    // Act / Assert
    expect(stripInstructionEcho(parsed, instructions).builder).toBe('HDC')
  })
})

describe('cleanFacilities', () => {
  it('drops marketing copy that is too long to be a facility name', () => {
    // Arrange — 실측 응답
    const data = {
      community: {
        facilities: ['어린이집', '시니어라운지', '특별한 순간들로 즐거움을 더하는 커뮤니티 시설'],
      },
    }

    // Act
    const result = cleanFacilities(data)

    // Assert
    expect(result.community?.facilities).toEqual(['어린이집', '시니어라운지'])
  })

  it('returns the input unchanged when there is no facility array', () => {
    // Arrange
    const data = { totalUnits: 1509 }

    // Act / Assert
    expect(cleanFacilities(data)).toEqual(data)
  })
})
