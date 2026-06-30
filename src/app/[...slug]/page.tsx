import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { classifySlug, buildCanonicalUrl } from '@/lib/utils/url-slug'
import {
  getSiPageData,
  getGuPageData,
  getDongPageData,
  getComplexBySlugCached,
  type GuPageData,
  type DongPageData,
} from '@/lib/data/seo-hierarchy'
import type { ComplexDetail } from '@/lib/data/complex-detail'
import { getComplexTransactionSummary, getComplexRawTransactions } from '@/lib/data/complex-detail'
import { getRealtorsByComplexId } from '@/lib/data/realtors'
import { RealtorCard } from '@/components/realtors/RealtorCard'
import { getComplexReviewStats } from '@/lib/data/reviews'
import { getReviewsWithComments } from '@/lib/data/comments'
import { getRedevelopmentProject } from '@/lib/data/redevelopment'
import { getQuadrantData } from '@/lib/data/quadrant'
import { getGapLabelData } from '@/lib/data/gap-label'
import { DealTypeTabs } from '@/components/complex/DealTypeTabs'
import { FavoriteButton } from '@/components/complex/FavoriteButton'
import { ShareButton } from '@/components/complex/ShareButton'
import { CompareAddButton } from '@/components/complex/CompareAddButton'
import { CompareFloatingBar } from '@/components/complex/CompareFloatingBar'
import { SidebarAdsSection } from '@/components/ads/SidebarAdsSection'
import { NeighborhoodOpinion } from '@/components/reviews/NeighborhoodOpinion'
import { RedevelopmentTimeline } from '@/components/complex/RedevelopmentTimeline'
import { GapLabel } from '@/components/complex/GapLabel'
import { AnalysisSection } from '@/components/complex/AnalysisSection'
import { AiChatPanel } from '@/components/complex/AiChatPanel'
import { buildComplexContext } from '@/lib/ai/context-builder'
import { getCafeArticlesByComplex } from '@/lib/data/cafe-articles'
import type { CafeArticleRecord } from '@/lib/data/cafe-articles'
import { getManagementCostMonthly } from '@/lib/data/management-cost'
import { ManagementCostCard } from '@/components/complex/ManagementCostCard'
import { getComplexGapStats } from '@/lib/data/gap-analysis'
import type { ComplexGapStatsResult } from '@/lib/data/gap-analysis'
import { GapAnalysisCard } from '@/components/complex/GapAnalysisCard'
import { getComplexAreaTypes, getComplexPriceByType, ALLOWED_AREA_BUCKETS } from '@/lib/data/invest'
import type { AreaBucket, AreaType, RegionalPricePoint } from '@/lib/data/invest'
import { ComplexPriceChartWrapper } from '@/components/invest/ComplexPriceChartWrapper'
import { getComplexFacilityEdu } from '@/lib/data/facility-edu'
import { EducationCard } from '@/components/complex/EducationCard'
import { formatParkingPerUnit, formatElevatorPerBuilding } from '@/lib/utils/facility-format'
import { getNearbyComplexPrices } from '@/lib/data/nearby-compare'
import { NearbyCompareCard } from '@/components/complex/NearbyCompareCard'
import { RecentTransactionList } from '@/components/complex/RecentTransactionList'
// ViewCountTracker는 절대 경로 import 필수 (같은 디렉토리가 아님)
import { ViewCountTracker } from '@/app/complexes/[id]/ViewCountTracker'

export const revalidate = 3600  // 1시간 ISR (계층+단지 통합, D-04)

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

interface Props {
  params:       Promise<{ slug: string[] }>
  searchParams: Promise<{ area_type?: string }>
}

// ──────────────────────────────────────────
// 아이콘 컴포넌트 (단지 상세용)
// ──────────────────────────────────────────

function FireIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1 1 2 2 2 0-3-1-5 1-8z" />
    </svg>
  )
}



function SchoolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10 12 5l9 5-9 5zM7 12v5c2 1.5 3 2 5 2s3-.5 5-2v-5" />
    </svg>
  )
}

function BusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="4" width="14" height="14" rx="2" />
      <path d="M5 14h14M9 18v2M15 18v2" />
    </svg>
  )
}

function WonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18M3 12h18M6 7l3 11 3-7 3 7 3-11" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

function formatPrice(price: number): string {
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}

// ──────────────────────────────────────────
// 스파크라인 (헤더 카드용)
// ──────────────────────────────────────────

type MonthlyPoint = { month: string; avg: number }

function SparklineSvg({ points, height = 52 }: { points: MonthlyPoint[]; height?: number }) {
  if (points.length < 2) return null
  const width = 340
  const prices = points.map((p) => p.avg)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const range = maxP - minP || 1

  const toX = (i: number) => (i / (points.length - 1)) * width
  const toY = (p: number) => height - ((p - minP) / range) * (height - 8) - 4

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.avg).toFixed(1)}`)
    .join(' ')

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--dj-orange)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--dj-orange)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkGrad)" />
      <path
        d={pathD}
        fill="none"
        stroke="var(--dj-orange)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatSparkLabel(month: string): string {
  const parts = month.split('-')
  const yr = parts[0] ?? ''
  const mo = parts[1] ?? '1'
  return `${yr.slice(2)}년${parseInt(mo, 10)}월`
}

function CafeArticlesSection({ articles }: { articles: CafeArticleRecord[] }) {
  if (articles.length === 0) return null
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: 0 }}>카페 이야기</h3>
        <span style={{
          font: '600 11px/1 var(--font-sans)',
          color: 'var(--fg-secondary)',
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--line-subtle)',
          borderRadius: 10,
          padding: '2px 8px',
        }}>
          {articles.length}개
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {articles.map((a, i) => (
          <li key={a.id} style={{
            borderBottom: i < articles.length - 1 ? '1px solid var(--line-subtle)' : 'none',
            padding: '12px 0',
          }}>
            <a
              href={a.article_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div style={{
                font: '600 13px/1.5 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: 4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {a.title}
              </div>
              {a.description && (
                <div style={{
                  font: '400 12px/1.5 var(--font-sans)',
                  color: 'var(--fg-secondary)',
                  marginBottom: 6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {a.description}
                </div>
              )}
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                {a.cafe_name && (
                  <span style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--line-subtle)',
                    borderRadius: 4,
                    padding: '1px 6px',
                  }}>
                    {a.cafe_name}
                  </span>
                )}
                {a.published_at && <span>{a.published_at.slice(0, 10).replace(/-/g, '.')}</span>}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ──────────────────────────────────────────
// JSON-LD 헬퍼
// ──────────────────────────────────────────

function buildBreadcrumbJsonLd(slug: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '단지온도', item: SITE },
      ...slug.map((segment, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: segment,
        // 마지막 항목(단지명)은 item URL 생략 (Google 권장)
        ...(i < slug.length - 1
          ? { item: buildCanonicalUrl(SITE, slug.slice(0, i + 1)) }
          : {}),
      })),
    ],
  }
}

// D-12: FAQ JSON-LD는 시·동 레벨만 (구·단지 상세 제외)
function buildFaqJsonLd(name: string, avgPrice: number | null, totalComplexes: number) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `${name} 아파트 평균 매매가는?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: avgPrice
            ? `${name} 아파트 평균 매매가는 약 ${Math.round(avgPrice / 10000)}억원입니다. ${totalComplexes}개 단지 기준.`
            : `${name}에는 ${totalComplexes}개 아파트 단지가 있습니다. 개별 단지를 선택해 실거래가를 확인하세요.`,
        },
      },
    ],
  }
}

// ──────────────────────────────────────────
// 눈에 보이는 <nav> 브레드크럼 (D-07 필수)
// ──────────────────────────────────────────

function BreadcrumbNav({ slug }: { slug: string[] }) {
  return (
    <nav aria-label="breadcrumb" style={{ padding: '8px 16px', fontSize: 13, color: 'var(--fg-tertiary, #888)' }}>
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
        <li><Link href="/" style={{ color: 'inherit' }}>단지온도</Link></li>
        {slug.map((segment, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span aria-hidden="true">›</span>
            {i < slug.length - 1 ? (
              <Link href={buildCanonicalUrl('', slug.slice(0, i + 1))} style={{ color: 'inherit' }}>
                {segment}
              </Link>
            ) : (
              <span style={{ color: 'var(--fg-primary, #111)', fontWeight: 500 }}>{segment}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

// 교육환경 — 느린 RPC(학교 백분위+학군 평당가)를 Suspense로 분리
async function FacilityEduSection({ complexId, si, gu, lat, lng }: { complexId: string; si?: string; gu?: string; lat?: number; lng?: number }) {
  const supabase = createReadonlyClient()
  const data = await getComplexFacilityEdu(complexId, supabase).catch(
    () => ({ schools: [], hagwons: [], daycares: [], kindergartens: [], hagwonStats: null, si: null }),
  )
  return <EducationCard data={data} si={si} gu={gu} lat={lat} lng={lng} />
}

// ──────────────────────────────────────────
// 단지 상세 페이지 (ComplexDetailPage) — slug URL 기반
// ──────────────────────────────────────────

async function ComplexDetailPage({
  complex,
  searchParams,
}: {
  complex: ComplexDetail & { url_slug: string }
  searchParams: Promise<{ area_type?: string }>
}) {
  const id = complex.id
  const supabase = createReadonlyClient()

  const sp = await searchParams
  const rawArea = typeof sp.area_type === 'string' ? sp.area_type : ''
  const areaBucket = (ALLOWED_AREA_BUCKETS as ReadonlyArray<string>).includes(rawArea)
    ? (rawArea as AreaBucket) : undefined

  const [
    saleData,
    complexRealtors,
    reviews,
    reviewStats,
    facilityKaptResult,
    redevelopmentProject,
    quadrantData,
    gapLabelData,
    districtStats,
    cafeArticles,
    managementCostRows,
    rawSaleData,
    rawJeonseData,
    gapStats,
    areaTypes,
    priceHistory,
    nearbyComplexes,
  ] = await Promise.all([
    getComplexTransactionSummary(id, 'sale', supabase),
    getRealtorsByComplexId(id, supabase),
    getReviewsWithComments(id, supabase),
    getComplexReviewStats(id, supabase),
    supabase
      .from('facility_kapt')
      .select('*')
      .eq('complex_id', id)
      .order('data_month', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getRedevelopmentProject(id, supabase).catch(() => null),
    complex.si && complex.gu
      ? getQuadrantData(id, complex.si, complex.gu, supabase).catch(() => null)
      : Promise.resolve(null),
    getGapLabelData(id, supabase).catch(() => ({
      listingPricePerPy: null,
      avgTransactionPricePerPy: null,
    })),
    complex.si && complex.gu
      ? (async () => {
          try {
            const r = await supabase
              .from('district_stats')
              .select('adm_nm, population, households, data_year, data_quarter, population_change, pop_under20, pop_20s, pop_30s, pop_40s, pop_50s, pop_60plus')
              .eq('si', complex.si!)
              .eq('gu', complex.gu!)
              .order('data_year', { ascending: false })
              .order('data_quarter', { ascending: false })
              .limit(1)
              .maybeSingle()
            return r.data
          } catch {
            return null
          }
        })()
      : Promise.resolve(null),
    getCafeArticlesByComplex(id, supabase).catch(() => [] as CafeArticleRecord[]),
    getManagementCostMonthly(id, supabase).catch(() => []),
    getComplexRawTransactions(id, 'sale', supabase).catch(() => []),
    getComplexRawTransactions(id, 'jeonse', supabase).catch(() => []),
    getComplexGapStats(id, supabase).catch(() => null),
    getComplexAreaTypes(supabase, id, 24).catch((): AreaType[] => []),
    getComplexPriceByType(supabase, id, areaBucket, 24).catch((): RegionalPricePoint[] => []),
    getNearbyComplexPrices(supabase, id).catch(() => []),
  ])

  const facilityKapt = facilityKaptResult?.data ?? null

  const parkingPerUnit = formatParkingPerUnit(
    (facilityKapt as { parking_count?: number | null } | null)?.parking_count ?? null,
    complex.household_count,
  )
  const elevatorCount = (facilityKapt as { elevator_count?: number | null } | null)?.elevator_count ?? null
  const buildingCount = (facilityKapt as { building_count?: number | null } | null)?.building_count ?? null
  const elevatorPerBuilding = formatElevatorPerBuilding(elevatorCount, buildingCount)

  const gap =
    gapLabelData.listingPricePerPy !== null &&
    gapLabelData.avgTransactionPricePerPy !== null
      ? gapLabelData.listingPricePerPy - gapLabelData.avgTransactionPricePerPy
      : null

  const breadcrumb = [complex.si, complex.gu, complex.dong].filter(Boolean)
  const latestSale = saleData.at(-1)
  const address = complex.road_address ?? breadcrumb.join(' ')

  // 헤더 카드용: 가장 최근 개별 거래 (평형 표시에 사용)
  const latestRawTx = rawSaleData.length > 0
    ? [...rawSaleData].sort((a, b) => b.dealDate.localeCompare(a.dealDate))[0] ?? null
    : null

  // 스파크라인: rawSaleData에서 최근 12개월 월별 평균 계산
  const sparklinePoints: MonthlyPoint[] = (() => {
    const byMonth: Record<string, { sum: number; count: number }> = {}
    for (const tx of rawSaleData) {
      const key = tx.yearMonth
      if (!byMonth[key]) byMonth[key] = { sum: 0, count: 0 }
      byMonth[key].sum += tx.price
      byMonth[key].count += 1
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, { sum, count }]) => ({ month, avg: count > 0 ? sum / count : 0 }))
  })()

  // YoY 변화율: 최신 월 vs 12개월 전 (또는 가장 오래된 월)
  const yoyChange: number | null = (() => {
    if (sparklinePoints.length < 2) return null
    const latestPoint = sparklinePoints.at(-1)
    const oldestPoint = sparklinePoints.at(0)
    if (!latestPoint || !oldestPoint) return null
    const latest = latestPoint.avg
    const oldest = oldestPoint.avg
    if (oldest === 0) return null
    return ((latest - oldest) / oldest) * 100
  })()

  // 단지 URL (slug 기반 canonical)
  const slugParts = complex.url_slug.split('/')
  const complexHref = buildCanonicalUrl('', slugParts)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':    'ApartmentComplex',
    name:       complex.canonical_name,
    address: {
      '@type':          'PostalAddress',
      addressLocality:  breadcrumb.join(' '),
      streetAddress:    complex.road_address ?? undefined,
      addressCountry:   'KR',
    },
    ...(complex.lat && complex.lng ? {
      geo: {
        '@type':    'GeoCoordinates',
        latitude:   complex.lat,
        longitude:  complex.lng,
      },
    } : {}),
    ...(complex.built_year ? { yearBuilt: String(complex.built_year) } : {}),
    ...(complex.household_count ? { numberOfRooms: complex.household_count } : {}),
    url: buildCanonicalUrl(SITE, slugParts),
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(slugParts)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbNav slug={slugParts} />
      <ViewCountTracker complexId={id} />
      {/* Body */}
      <main className="px-4 py-4 sm:px-6 sm:py-6 max-w-screen-xl mx-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* Main column */}
        <div className="flex flex-col gap-4 min-w-0 lg:flex-1">
          {/* Header card — viral shareworthy design */}
          <div className="card" style={{ padding: 16, position: 'relative' }}>
            {/* Row 1: Badges + icon buttons (top-right) */}
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                <span className="badge orange"><FireIcon />신고가</span>
                {complex.built_year && <span className="badge neutral">{complex.built_year}년 입주</span>}
                {complex.household_count && <span className="badge neutral">{complex.household_count.toLocaleString()}세대</span>}
              </div>
              {/* Icon-only action buttons — top right corner */}
              <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
                <ShareButton
                  complexId={id}
                  complexName={complex.canonical_name}
                  location={[complex.si, complex.gu, complex.dong].filter(Boolean).join(' ')}
                  iconOnly
                />
                <FavoriteButton complexId={id} iconOnly />
              </div>
            </div>

            {/* Row 2: Complex name */}
            <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '12px 0 4px' }}>
              {complex.canonical_name}
            </h1>

            {/* Row 3: Location + specs */}
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 14px' }}>
              {[complex.gu ?? complex.si, complex.dong].filter(Boolean).join(' ')}
              {complex.floors_above && ` · ${complex.floors_above}층`}
              {address && address !== ([complex.gu ?? complex.si, complex.dong].filter(Boolean).join(' ')) && ` · ${address}`}
            </p>

            {/* Price + sparkline block */}
            {latestSale && (
              <div style={{ background: 'var(--bg-surface-2, #f8f8f8)', borderRadius: 10, padding: '12px 14px' }}>
                {/* Header row: label + YoY */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    최근 실거래
                    {latestRawTx && (
                      <> · {latestRawTx.pyeongName
                        ? `${latestRawTx.pyeongName}형`
                        : `${Math.round(latestRawTx.area / 3.3058)}평`}</>
                    )}
                  </span>
                  {yoyChange !== null && (
                    <span style={{
                      font: '600 12px/1 var(--font-sans)',
                      color: yoyChange >= 0 ? 'var(--dj-orange)' : '#3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}>
                      {yoyChange >= 0 ? '▲' : '▼'} {Math.abs(yoyChange).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Price + date */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: sparklinePoints.length >= 3 ? 10 : 0 }}>
                  <span className="tnum" style={{ font: '700 26px/1 var(--font-sans)', letterSpacing: '-0.02em' }}>
                    {formatPrice(Math.round(latestSale.avgPrice))}
                  </span>
                  <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    {latestSale.yearMonth}
                  </span>
                </div>

                {/* Sparkline chart */}
                {sparklinePoints.length >= 3 && (
                  <div>
                    <SparklineSvg points={sparklinePoints} height={52} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        {formatSparkLabel(sparklinePoints.at(0)?.month ?? '')}
                      </span>
                      <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        {formatSparkLabel(sparklinePoints.at(-1)?.month ?? '')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Compare + Alert buttons */}
            <div
              className="grid grid-cols-2 gap-2"
              style={{ marginTop: 10 }}
            >
              <CompareAddButton complexId={id} complexName={complex.canonical_name} />
              <Link
                href={`/login?next=/complexes/${id}`}
                className="btn btn-md btn-orange"
                style={{ textDecoration: 'none', gap: 6, minHeight: 44, justifyContent: 'center', display: 'flex', alignItems: 'center' }}
              >
                <BellIcon />알림 설정
              </Link>
            </div>
          </div>

          {/* Chart card */}
          <div className="card" style={{ padding: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <h3
                style={{
                  font: '700 18px/1.4 var(--font-sans)',
                  letterSpacing: '-0.005em',
                  margin: 0,
                }}
              >
                실거래가 추이
              </h3>
              <GapLabel gap={gap} />
            </div>
            <DealTypeTabs
              rawSaleData={rawSaleData}
              rawJeonseData={rawJeonseData}
            />
          </div>

          {/* 단지 분석 탭 — 가성비 분석 + 지역 통계 */}
          <AnalysisSection
            quadrantData={quadrantData}
            districtStats={districtStats}
            districtName={complex.gu ?? complex.si ?? ''}
          />

          {/* Facilities card */}
          <div className="card" style={{ padding: 20 }}>
            <h3
              style={{
                font: '700 15px/1.4 var(--font-sans)',
                margin: '0 0 12px',
              }}
            >
              단지 기본 정보
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
              }}
            >
              {[
                {
                  icon: <SchoolIcon />,
                  label: '준공연도',
                  value: complex.built_year ? `${complex.built_year}년` : '-',
                  sub: '',
                },
                {
                  icon: <BusIcon />,
                  label: '세대수',
                  value: complex.household_count
                    ? `${complex.household_count.toLocaleString()}세대`
                    : '-',
                  sub: '',
                },
                {
                  icon: <WonIcon />,
                  label: '최고층',
                  value: complex.floors_above ? `${complex.floors_above}층` : '-',
                  sub: '',
                },
                {
                  icon: <BellIcon />,
                  label: '지역',
                  value: [complex.si, complex.gu].filter(Boolean).join(' ') || '-',
                  sub: complex.dong ?? '',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--bg-surface-2)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      color: 'var(--fg-sec)',
                    }}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        font: '500 11px/1 var(--font-sans)',
                        color: 'var(--fg-tertiary)',
                        marginBottom: 2,
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ font: '700 14px/1.3 var(--font-sans)' }}>
                      {item.value}
                    </div>
                    {item.sub && (
                      <div
                        style={{
                          font: '500 11px/1.3 var(--font-sans)',
                          color: 'var(--fg-sec)',
                        }}
                      >
                        {item.sub}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 시설 탭 */}
          <div className="card" style={{ padding: 20 }}>
            <h3
              style={{
                font: '700 15px/1.4 var(--font-sans)',
                margin: '0 0 12px',
              }}
            >
              시설
            </h3>
            <p
              style={{
                font: '500 11px/1 var(--font-sans)',
                color: 'var(--fg-tertiary)',
                marginBottom: 16,
              }}
            >
              K-apt 공동주택 데이터 기준
            </p>
            {facilityKapt ? (
              <div>
                {[
                  {
                    label: '주차대수',
                    value: parkingPerUnit != null
                      ? `세대당 ${parkingPerUnit}대 (총 ${(facilityKapt.parking_count as number).toLocaleString()}면)`
                      : (facilityKapt.parking_count != null
                          ? `총 ${facilityKapt.parking_count.toLocaleString()}면`
                          : null),
                  },
                  {
                    label: '세대수',
                    value: complex.household_count != null
                      ? `${complex.household_count.toLocaleString()}세대`
                      : null,
                  },
                  {
                    label: '관리비(m²당)',
                    value: facilityKapt.management_cost_m2 != null
                      ? `${facilityKapt.management_cost_m2.toLocaleString('ko-KR')}원`
                      : null,
                  },
                  {
                    label: '난방방식',
                    value: complex.heat_type ?? null,
                  },
                  {
                    label: '관리방식',
                    value: ((facilityKapt as unknown) as { management_type?: string | null }).management_type ?? null,
                  },
                  {
                    label: '동수',
                    value: buildingCount != null ? `${buildingCount}동` : null,
                  },
                  {
                    label: '엘리베이터',
                    value: (() => {
                      if (elevatorCount == null) return null
                      if (elevatorPerBuilding != null && buildingCount != null) {
                        return `동당 ${elevatorPerBuilding}대 (총 ${elevatorCount}대, ${buildingCount}동)`
                      }
                      return `${elevatorCount}대`
                    })(),
                  },
                ]
                  .filter(item => item.value !== null)
                  .map((item, i, arr) => (
                    <div
                      key={item.label}
                      style={{
                        display:        'flex',
                        justifyContent: 'space-between',
                        alignItems:     'center',
                        padding:        '10px 0',
                        borderBottom:   i < arr.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                      }}
                    >
                      <span
                        style={{
                          font:  '500 13px/1 var(--font-sans)',
                          color: 'var(--fg-sec)',
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          font:  '500 13px/1 var(--font-sans)',
                          color: 'var(--fg-pri)',
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p
                style={{
                  font:       '500 13px/1.6 var(--font-sans)',
                  color:      'var(--fg-tertiary)',
                  padding:    '32px 0',
                  textAlign:  'center',
                  margin:     0,
                }}
              >
                시설 정보가 아직 수집되지 않았습니다.
              </p>
            )}
          </div>

          {/* 갭투자 분석 */}
          <GapAnalysisCard data={gapStats as ComplexGapStatsResult | null} />

          {/* 시세 흐름 차트 섹션 */}
          {(areaTypes.length > 0 || priceHistory.length > 0) && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: 0 }}>시세 흐름</h3>
                {areaTypes.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {/* '전체' 탭 — slug URL 기반 */}
                    <a href={complexHref}
                      style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: 5,
                        font: '500 11px/1 var(--font-sans)', textDecoration: 'none',
                        background: !areaBucket ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
                        color: !areaBucket ? '#fff' : 'var(--fg-sec)',
                        border: '1px solid var(--line-subtle)', whiteSpace: 'nowrap',
                      }}>전체</a>
                    {areaTypes.map((t: AreaType) => {
                      const AREA_LABEL: Record<string, string> = { '소형': '소형', '59': '59㎡', '84': '84㎡', '대형': '대형' }
                      const isActive = areaBucket === t.bucket
                      return (
                        <a key={t.bucket} href={`${complexHref}?area_type=${t.bucket}`}
                          style={{
                            display: 'inline-block', padding: '4px 10px', borderRadius: 5,
                            font: '500 11px/1 var(--font-sans)', textDecoration: 'none',
                            background: isActive ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
                            color: isActive ? '#fff' : 'var(--fg-sec)',
                            border: '1px solid var(--line-subtle)', whiteSpace: 'nowrap',
                          }}>
                          {AREA_LABEL[t.bucket] ?? t.bucket}
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
              <ComplexPriceChartWrapper
                data={priceHistory}
                title={`최근 24개월 매매 실거래 월평균${areaBucket ? ` (${areaBucket === '59' ? '59㎡' : areaBucket === '84' ? '84㎡' : areaBucket})` : ''}`}
              />
              <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '12px 0 0' }}>
                * 실거래 흐름 기반 참고 지수입니다. 투자 결정에 직접 활용하지 마세요.
              </p>
            </div>
          )}

          {/* 주변 단지 시세 비교 */}
          {nearbyComplexes.length > 0 && (() => {
            const sixMonthsAgo = new Date()
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
            const cutoff = sixMonthsAgo.toISOString().slice(0, 7)
            const recentTx = rawSaleData.filter(t => t.yearMonth >= cutoff)
            const currentPy = recentTx.length >= 3
              ? Math.round(recentTx.reduce((s, t) => s + t.price / t.area * 3.3058, 0) / recentTx.length)
              : null
            return (
              <NearbyCompareCard
                current={{ name: complex.canonical_name, avgPricePerPy: currentPy }}
                nearby={nearbyComplexes}
              />
            )
          })()}

          {/* 관리비 */}
          <ManagementCostCard
            rows={managementCostRows}
            householdCount={complex.household_count}
          />

          {/* 교육 환경 */}
          <Suspense fallback={
            <div className="card" style={{ padding: 20, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>교육 환경 로딩 중…</span>
            </div>
          }>
            <FacilityEduSection complexId={id} si={complex.si ?? undefined} gu={complex.gu ?? undefined} lat={complex.lat ?? undefined} lng={complex.lng ?? undefined} />
          </Suspense>

          {/* 재건축 타임라인 */}
          {complex.status === 'in_redevelopment' && redevelopmentProject && (
            <RedevelopmentTimeline
              phase={redevelopmentProject.phase}
              notes={redevelopmentProject.notes}
            />
          )}

          {/* 동네 의견 */}
          <div
            className="card"
            style={{
              padding: 20,
              background: '#FFFAF5',
              borderColor: 'rgba(234,88,12,0.18)',
            }}
          >
            <NeighborhoodOpinion
              complexId={id}
              complexName={complex.canonical_name}
              initialReviews={reviews}
              initialStats={reviewStats}
            />
          </div>

          {/* 카페 이야기 */}
          <CafeArticlesSection articles={cafeArticles} />
        </div>

        {/* Right rail — desktop only */}
        <div className="hidden lg:flex flex-col gap-4 lg:w-[360px] lg:flex-shrink-0">
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
              최근 실거래 내역
            </h3>
            <RecentTransactionList transactions={rawSaleData} />
          </div>

          {/* Sidebar ads */}
          <SidebarAdsSection sggCode={complex.sgg_code} />

          {/* 공인중개사 */}
          {complexRealtors.length > 0 && (
            <section style={{ marginTop: 32, paddingBottom: 40 }}>
              <h2
                style={{
                  font: '600 14px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  margin: '0 0 12px',
                  letterSpacing: '-0.01em',
                }}
              >
                이 단지 담당 공인중개사
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {complexRealtors.map(r => (
                  <RealtorCard key={r.id} realtor={r} />
                ))}
              </div>
            </section>
          )}
        </div>
        </div>
      </main>

      {/* AI 상담 패널 */}
      <AiChatPanel
        complexId={id}
        complexName={complex.canonical_name}
        contextData={buildComplexContext({
          complex,
          rawSaleData,
          rawJeonseData,
          facilityKapt: facilityKapt as Parameters<typeof buildComplexContext>[0]['facilityKapt'],
          managementCostRows,
          facilityEdu: { schools: [], hagwons: [], daycares: [], kindergartens: [], hagwonStats: null, si: null },
          quadrantData,
          districtStats,
          reviewStats,
          reviews,
        })}
      />
      {/* 비교 플로팅 바 */}
      <CompareFloatingBar />
    </div>
  )
}

// ──────────────────────────────────────────
// 계층 페이지 컴포넌트
// ──────────────────────────────────────────

async function SiPage({ si, slug }: { si: string; slug: string[] }) {
  const supabase = createReadonlyClient()
  const data = await getSiPageData(si, supabase)
  if (!data) notFound()

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(slug)
  // D-12: 시 레벨에 FAQ JSON-LD 포함
  const faqJsonLd = buildFaqJsonLd(si, null, data.totalComplexes)

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbNav slug={slug} />
      <section aria-labelledby="si-heading" style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
        <h1 id="si-heading" style={{ font: '700 24px/1.25 var(--font-sans)', margin: '0 0 8px' }}>
          {si} 아파트 실거래가
        </h1>
        <p style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 24px' }}>
          총 {data.totalComplexes}개 단지
        </p>
        {data.guList.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.guList.map(g => (
              <li key={g.gu} style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--line-subtle)', borderRadius: 8 }}>
                <Link href={buildCanonicalUrl('', [...slug, g.gu])} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: '600 15px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{g.gu}</span>
                  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                    {g.complexCount}개 단지{g.avgPrice ? ` · 평균 ${Math.round(g.avgPrice / 10000)}억` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data.dongList.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.dongList.map(d => (
              <li key={d.dong} style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--line-subtle)', borderRadius: 8 }}>
                <Link href={buildCanonicalUrl('', [...slug, d.dong])} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: '600 15px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{d.dong}</span>
                  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                    {d.complexCount}개 단지{d.avgPrice ? ` · 평균 ${Math.round(d.avgPrice / 10000)}억` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function GuPage({ data, slug }: { data: GuPageData; slug: string[] }) {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(slug)

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <BreadcrumbNav slug={slug} />
      <section aria-labelledby="gu-heading" style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
        <h1 id="gu-heading" style={{ font: '700 24px/1.25 var(--font-sans)', margin: '0 0 8px' }}>
          {data.si} {data.gu} 아파트 실거래가
        </h1>
        <p style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 24px' }}>
          총 {data.totalComplexes}개 단지
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.dongList.map(d => (
            <li key={d.dong} style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--line-subtle)', borderRadius: 8 }}>
              <Link href={buildCanonicalUrl('', [...slug, d.dong])} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ font: '600 15px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{d.dong}</span>
                <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                  {d.complexCount}개 단지{d.avgPrice ? ` · 평균 ${Math.round(d.avgPrice / 10000)}억` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function DongPage({ data, slug }: { data: DongPageData; slug: string[] }) {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(slug)
  // D-12: 동 레벨에 FAQ JSON-LD 포함
  const faqJsonLd = buildFaqJsonLd(data.dong, data.avgPrice, data.complexes.length)

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbNav slug={slug} />
      <section aria-labelledby="dong-heading" style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
        <h1 id="dong-heading" style={{ font: '700 24px/1.25 var(--font-sans)', margin: '0 0 8px' }}>
          {data.dong} 아파트 실거래가
        </h1>
        <p style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 24px' }}>
          총 {data.complexes.length}개 단지{data.avgPrice ? ` · 평균 ${data.avgPrice.toLocaleString('ko-KR')}만원/평` : ''}
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.complexes.map(c => (
            <li key={c.id} style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--line-subtle)', borderRadius: 8 }}>
              {c.url_slug ? (
                <Link
                  href={buildCanonicalUrl('', c.url_slug.split('/'))}
                  style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ font: '600 15px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{c.canonical_name}</span>
                  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                    {c.built_year ? `${c.built_year}년` : ''}
                    {c.household_count ? ` · ${c.household_count}세대` : ''}
                  </span>
                </Link>
              ) : (
                <Link
                  href={`/complexes/${c.id}`}
                  style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ font: '600 15px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{c.canonical_name}</span>
                  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                    {c.built_year ? `${c.built_year}년` : ''}
                    {c.household_count ? ` · ${c.household_count}세대` : ''}
                  </span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

// ──────────────────────────────────────────
// generateMetadata
// ──────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params  // Next.js 15: await params 필수
  const slug = rawSlug.map(s => decodeURIComponent(s))
  const type = classifySlug(slug)
  if (type === 'invalid') return { title: '페이지를 찾을 수 없습니다' }

  const canonical = buildCanonicalUrl(SITE, slug)
  const currentName = slug[slug.length - 1]

  // 단지 상세 메타데이터 (length >= 3이고 DB에서 complex 발견 시)
  if (type === 'complex' || type === 'dong-or-complex') {
    const urlSlug = slug.join('/')
    const complex = await getComplexBySlugCached(urlSlug)
    if (complex) {
      const location = slug.slice(0, -1).join(' ')
      const dong = slug[slug.length - 2] ?? ''
      // ≤40자: '내동 대우2차 아파트 매매·전세 실거래가' = 18자 (충분한 여유)
      // D-06: title에 '매매·전세' 포함 필수 (W2)
      const title = `${dong} ${complex.canonical_name} 아파트 매매·전세 실거래가`
      // ≤80자
      const description = `[${location}] ${complex.canonical_name} 최근 실거래가 확인. 평형별 시세·관리비 정보.`
      return {
        title,
        description,
        alternates: { canonical },
        openGraph: { title, description, url: canonical, siteName: '단지온도', locale: 'ko_KR', type: 'website' },
      }
    }
  }

  // 계층 페이지 메타데이터 (시·구·동)
  const title = `${currentName} 아파트 실거래가`  // ≤40자
  const description = `${currentName} 아파트 시세·거래량 현황. 단지별 실거래가 목록.`  // ≤80자
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: '단지온도', locale: 'ko_KR', type: 'website' },
  }
}

// ──────────────────────────────────────────
// 메인 dispatch 함수
// ──────────────────────────────────────────

export default async function SlugPage({ params, searchParams }: Props) {
  const { slug: rawSlug } = await params  // Next.js 15: await params 필수
  const slug = rawSlug.map(s => decodeURIComponent(s))
  const type = classifySlug(slug)

  // Pitfall 1 방어: 5단계 이상은 404
  if (type === 'invalid') notFound()

  const supabase = createReadonlyClient()

  // noUncheckedIndexedAccess 대응: classifySlug 타입 기반으로 안전하게 destructure
  const s0 = slug[0] ?? ''
  const s1 = slug[1] ?? ''
  const s2 = slug[2] ?? ''

  if (type === 'si') {
    return <SiPage si={s0} slug={slug} />
  }

  if (type === 'gu') {
    // slug.length === 2: 창원시(gu페이지) or 김해시(dong페이지)
    // getGuPageData 시도 → 없으면 getDongPageData (D-02)
    const guData = await getGuPageData(s0, s1, supabase)
    if (guData) return <GuPage data={guData} slug={slug} />
    const dongData = await getDongPageData(s0, null, s1, supabase)
    if (dongData) return <DongPage data={dongData} slug={slug} />
    notFound()
  }

  if (type === 'dong-or-complex') {
    // slug.length === 3: 김해 단지(url_slug 3개) or 창원 동 페이지
    const urlSlug = slug.join('/')
    const complex = await getComplexBySlugCached(urlSlug)
    if (complex) return <ComplexDetailPage complex={complex} searchParams={searchParams} />
    // 창원 동 페이지 (si/gu/dong)
    const dongData = await getDongPageData(s0, s1, s2, supabase)
    if (dongData) return <DongPage data={dongData} slug={slug} />
    notFound()
  }

  // type === 'complex': slug.length === 4 → 항상 창원 단지 상세
  const urlSlug = slug.join('/')
  const complex = await getComplexBySlugCached(urlSlug)
  if (!complex) notFound()
  return <ComplexDetailPage complex={complex} searchParams={searchParams} />
}
