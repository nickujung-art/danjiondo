// src/services/naver-land.ts
// CLAUDE.md: 외부 API는 src/services/ 어댑터 전용
// NOTE: 'server-only' 미포함 — scripts/ 배치에서도 import 가능

import { z } from 'zod'

// ─── 헤더 ───────────────────────────────────────────────────────────
// RESEARCH.md §1.3 VERIFIED
// NAVER_COOKIE 환경변수가 설정된 경우 Cookie 헤더 추가 (rate limit 완화)
// 값: 브라우저 개발자 도구 → Application → Cookies에서 NID_AUT, NID_SES 복사
function buildNaverHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://new.land.naver.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  }
  // Node.js 환경(scripts/)에서만 읽힘 — Next.js 서버 컴포넌트는 NAVER_COOKIE 미설정
  const cookie = typeof process !== 'undefined' ? process.env.NAVER_COOKIE : undefined
  if (cookie) headers['Cookie'] = cookie
  return headers
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
  articleList:  z.array(ArticleItemSchema).optional(),
  isMoreData:   z.boolean().optional(),
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
    headers: buildNaverHeaders(),
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
 * 네이버 부동산 매물 목록 조회 (PC API — m.land 모바일 엔드포인트 deprecated 이후 전환)
 * RESEARCH.md §1.2/1.4 — tradTpCd=A1(매매)
 * 구 모바일 URL: m.land.naver.com/complex/getComplexArticleList → 2026-06 이후 null 반환
 */
export async function fetchNaverListings(complexNo: string, page = 1): Promise<{
  items:    ArticleListItem[]
  hasMore:  boolean
}> {
  // PC API (new.land.naver.com) — RESEARCH.md §1.4
  const url = new URL(`https://new.land.naver.com/api/articles/complex/${complexNo}`)
  url.searchParams.set('realEstateType', 'APT')
  url.searchParams.set('tradeType',      'A1')   // 매매
  url.searchParams.set('page',           String(page))
  url.searchParams.set('pageSize',       '20')

  const res = await fetch(url.toString(), {
    headers: buildNaverHeaders(),
    signal:  AbortSignal.timeout(10_000),
  })
  if (res.status === 429) throw new NaverRateLimitError()
  if (!res.ok) throw new Error(`fetchNaverListings HTTP ${res.status} for complexNo=${complexNo}`)

  const json = await res.json()
  if (json === null) return { items: [], hasMore: false }

  const parsed = ArticleListResponseSchema.safeParse(json)
  if (!parsed.success) return { items: [], hasMore: false }

  // PC API: articleList + isMoreData
  const rawList = parsed.data.articleList ?? parsed.data.result?.list ?? []
  const hasMore = parsed.data.isMoreData === true || parsed.data.result?.moreDataYn === 'Y'

  const items: ArticleListItem[] = []
  for (const row of rawList) {
    // PC API 필드 우선
    if (row.dealOrWarrantPrc) {
      const priceMan = parsePrcInfo(row.dealOrWarrantPrc)
      const areaM2   = row.exclusiveArea ?? row.area2 ?? 0
      if (priceMan && areaM2 > 0) {
        items.push({ priceMan, areaM2 })
      }
      continue
    }
    // 모바일 API 필드 (fallback)
    if (row.prcInfo && row.spc2) {
      const priceMan = parsePrcInfo(row.prcInfo)
      const areaM2   = parseFloat(row.spc2)
      if (priceMan && areaM2 > 0) {
        items.push({ priceMan, areaM2 })
      }
    }
  }

  return { items, hasMore }
}
