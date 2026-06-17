// src/services/naver-land.ts
// CLAUDE.md: 외부 API는 src/services/ 어댑터 전용
// NOTE: 'server-only' 미포함 — scripts/ 배치에서도 import 가능

import { z } from 'zod'

// ─── 헤더 ───────────────────────────────────────────────────────────
// RESEARCH.md §1.3 VERIFIED
const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://new.land.naver.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
}

// ─── Zod 스키마 ──────────────────────────────────────────────────────
const ComplexOverviewItemSchema = z.object({
  complexNo:   z.string(),
  complexName: z.string(),
  latitude:    z.number().optional(),
  longitude:   z.number().optional(),
})

const ComplexOverviewResponseSchema = z.object({
  complexList: z.array(ComplexOverviewItemSchema).optional().default([]),
})

const ArticleItemSchema = z.object({
  // 모바일 API 필드 (VERIFIED)
  prcInfo:  z.string().optional(),
  spc2:     z.string().optional(),
  // PC API 필드 (ASSUMED - fallback)
  dealOrWarrantPrc: z.string().optional(),
  exclusiveArea:    z.number().optional(),
  area2:            z.number().optional(),
})

const ArticleListResponseSchema = z.object({
  result: z.object({
    list:        z.array(ArticleItemSchema).optional().default([]),
    moreDataYn:  z.string().optional(),
  }).optional(),
  // PC API 응답 키 fallback
  articleList: z.array(ArticleItemSchema).optional(),
})

// ─── 유틸리티 ────────────────────────────────────────────────────────

/**
 * 네이버 부동산 가격 문자열 → 만원 단위 정수
 * "5억 3,000" → 53000, "3억" → 30000, "9,800" → 9800
 */
export function parsePrcInfo(prcInfo: string): number | null {
  if (!prcInfo || typeof prcInfo !== 'string') return null
  const clean = prcInfo.replace(/,/g, '').trim()
  // 공백 포함 패턴: "5억 3000" 또는 "5억3000" 또는 "3억" 또는 "9800"
  const match = clean.match(/^(?:(\d+)억)?(?:\s*(\d+))?$/)
  if (!match) return null
  const uk  = parseInt(match[1] ?? '0', 10)
  const man = parseInt(match[2] ?? '0', 10)
  const result = uk * 10000 + man
  return result > 0 ? result : null
}

/**
 * 단지명 정규화: 시명·'아파트'·공백 제거 + 소문자
 * CLAUDE.md: 단지명 단독 매칭 금지 — 좌표 검증과 함께 사용
 */
export function normalizeComplexName(name: string): string {
  return name
    .replace(/아파트$/, '')
    .replace(/^(창원|김해|마산|진해|진영|장유)\s*/, '')
    .replace(/\s+/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
}

/**
 * Haversine 거리 계산 (단위: 미터)
 */
export function haversineDistanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const x = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// ─── 에러 타입 ────────────────────────────────────────────────────────

export class NaverRateLimitError extends Error {
  constructor() {
    super('Naver rate limit (429)')
    this.name = 'NaverRateLimitError'
  }
}

// ─── API 호출 ────────────────────────────────────────────────────────

export interface NaverComplexResult {
  complexNo:   string
  complexName: string
  latitude:    number | null
  longitude:   number | null
}

/**
 * 네이버 부동산 단지 검색 (이름 기반)
 * RESEARCH.md §1.1
 */
export async function searchNaverComplex(name: string): Promise<NaverComplexResult[]> {
  const url = new URL('https://new.land.naver.com/api/complexes/overview')
  url.searchParams.set('realEstateType', 'APT')
  url.searchParams.set('query', name)

  const res = await fetch(url.toString(), {
    headers: NAVER_HEADERS,
    signal:  AbortSignal.timeout(10_000),
  })
  if (res.status === 429) throw new NaverRateLimitError()
  if (!res.ok) {
    throw new Error(`searchNaverComplex HTTP ${res.status} for "${name}"`)
  }

  const json = await res.json()
  const parsed = ComplexOverviewResponseSchema.safeParse(json)
  if (!parsed.success) return []

  return parsed.data.complexList.map(c => ({
    complexNo:   c.complexNo,
    complexName: c.complexName,
    latitude:    c.latitude  ?? null,
    longitude:   c.longitude ?? null,
  }))
}

export interface ArticleListItem {
  priceMan:  number   // 만원 단위
  areaM2:    number   // 전용면적 m²
}

/**
 * 네이버 부동산 매물 목록 조회 (모바일 API 우선, 페이지 1)
 * RESEARCH.md §1.2 — tradTpCd=A1(매매)
 */
export async function fetchNaverListings(complexNo: string, page = 1): Promise<{
  items:    ArticleListItem[]
  hasMore:  boolean
}> {
  // 모바일 API (VERIFIED: inasie.github.io)
  const url = new URL('https://m.land.naver.com/complex/getComplexArticleList')
  url.searchParams.set('hscpNo',   complexNo)
  url.searchParams.set('tradTpCd', 'A1')       // 매매
  url.searchParams.set('order',    'date_')
  url.searchParams.set('showR0',   'N')
  url.searchParams.set('page',     String(page))

  const res = await fetch(url.toString(), {
    headers: NAVER_HEADERS,
    signal:  AbortSignal.timeout(10_000),
  })
  if (res.status === 429) throw new NaverRateLimitError()
  if (!res.ok) throw new Error(`fetchNaverListings HTTP ${res.status} for complexNo=${complexNo}`)

  const json = await res.json()
  const parsed = ArticleListResponseSchema.safeParse(json)
  if (!parsed.success) return { items: [], hasMore: false }

  // 모바일 result.list 우선, 없으면 articleList fallback
  const rawList = parsed.data.result?.list ?? parsed.data.articleList ?? []
  const hasMore = parsed.data.result?.moreDataYn === 'Y'

  const items: ArticleListItem[] = []
  for (const row of rawList) {
    // 모바일 API 필드
    if (row.prcInfo && row.spc2) {
      const priceMan = parsePrcInfo(row.prcInfo)
      const areaM2   = parseFloat(row.spc2)
      if (priceMan && areaM2 > 0) {
        items.push({ priceMan, areaM2 })
      }
      continue
    }
    // PC API fallback 필드
    if (row.dealOrWarrantPrc) {
      const priceMan = parsePrcInfo(row.dealOrWarrantPrc)
      const areaM2   = row.exclusiveArea ?? row.area2 ?? 0
      if (priceMan && areaM2 > 0) {
        items.push({ priceMan, areaM2 })
      }
    }
  }

  return { items, hasMore }
}
