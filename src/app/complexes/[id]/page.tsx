import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getComplexByIdCached, getComplexTransactionSummary, getComplexRawTransactions } from '@/lib/data/complex-detail'
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
import { RedevelopmentSheet } from '@/components/complex/RedevelopmentSheet'
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
import { getListingPriceHistory } from '@/lib/data/listing-history'
import type { ListingPricePoint } from '@/lib/data/listing-history'
import { ListingPriceSectionWrapper } from '@/components/complex/ListingPriceSectionWrapper'
import { ViewCountTracker } from './ViewCountTracker'

export const revalidate = 86400

// EducationCard를 독립 스트림으로 분리 — N+1 RPC가 나머지 페이지를 블로킹하지 않도록
async function FacilityEduSection({ complexId, si, gu, lat, lng }: { complexId: string; si?: string; gu?: string; lat?: number; lng?: number }) {
  const supabase = createReadonlyClient()
  const data = await getComplexFacilityEdu(complexId, supabase).catch(
    () => ({ schools: [], hagwons: [], daycares: [], kindergartens: [], hagwonStats: null, si: null })
  )
  return <EducationCard data={data} si={si} gu={gu} lat={lat} lng={lng} />
}

interface Props {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ area_type?: string }>
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const complex = await getComplexByIdCached(id)
  if (!complex) return { title: '단지를 찾을 수 없습니다' }
  // WR-05: url_slug 있는 단지는 308 목적지가 canonical (크롤러 혼선 방지)
  const canonicalUrl = complex.url_slug
    ? `${SITE}/${encodeURI(complex.url_slug)}`
    : `${SITE}/complexes/${id}`
  const title = `${complex.canonical_name} 실거래가 | 단지온도`
  const description = `${complex.canonical_name} 매매·전세·월세 실거래가 추이. ${[complex.si, complex.gu, complex.dong].filter(Boolean).join(' ')} 아파트 시세를 확인하세요.`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:      canonicalUrl,
      siteName: '단지온도',
      locale:   'ko_KR',
      type:     'website',
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
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

function FireIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1 1 2 2 2 0-3-1-5 1-8z" />
    </svg>
  )
}

function ArrUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m6 14 6-6 6 6" />
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

export default async function ComplexDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp         = await searchParams
  const rawArea    = typeof sp.area_type === 'string' ? sp.area_type : ''
  const areaBucket = (ALLOWED_AREA_BUCKETS as ReadonlyArray<string>).includes(rawArea)
    ? (rawArea as AreaBucket) : undefined
  const supabase = createReadonlyClient()

  // complex를 먼저 단독 fetch — si/gu로 getQuadrantData 호출에 필요 (React.cache로 generateMetadata 결과 재사용)
  const complex = await getComplexByIdCached(id)
  if (!complex) notFound()

  // SEO-03: url_slug 있는 단지는 한글 URL로 영구 리다이렉트 (308)
  // D-09: url_slug=null인 ~143개 단지는 기존 페이지 그대로 렌더
  // permanentRedirect는 내부적으로 throw — 이후 코드 실행 안 됨
  // T-23-02-01: url_slug는 DB 조회 결과값만 사용 (사용자 입력 미포함, Open redirect 방어)
  if (complex.url_slug && complex.status === 'active') {
    permanentRedirect('/' + encodeURI(complex.url_slug))
  }

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
    listingHistory,
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
    // 갭 라벨 (오류 시 null로 fallback)
    getGapLabelData(id, supabase).catch(() => ({
      listingPricePerPy: null,
      avgTransactionPricePerPy: null,
    })),
    // 지역 통계 (si+gu로 조회, 없으면 null)
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
    // 카페 이야기 — cafe_articles 테이블에서 조회 (오류 시 빈 배열 fallback)
    getCafeArticlesByComplex(id, supabase).catch(() => [] as CafeArticleRecord[]),
    // 관리비 (오류 시 빈 배열 fallback)
    getManagementCostMonthly(id, supabase).catch(() => []),
    // raw 거래 데이터 (IQR + 평형 칩 클라이언트 슬라이스용)
    getComplexRawTransactions(id, 'sale', supabase).catch(() => []),
    getComplexRawTransactions(id, 'jeonse', supabase).catch(() => []),
    // 갭투자 분석 (데이터 없으면 null — D-01)
    getComplexGapStats(id, supabase).catch(() => null),
    // 시세 흐름 차트 — 단지 타입 목록 (D-02)
    getComplexAreaTypes(supabase, id, 24).catch((): AreaType[] => []),
    // 시세 흐름 차트 — 타입별 월별 시세 (D-02)
    getComplexPriceByType(supabase, id, areaBucket, 24).catch((): RegionalPricePoint[] => []),
    // 주변 단지 시세 비교
    getNearbyComplexPrices(supabase, id).catch(() => []),
    // 호가 히스토리 (source='naver', 12개월) — LISTING-04
    getListingPriceHistory(id, supabase).catch((): ListingPricePoint[] => []),
  ])

  const facilityKapt = facilityKaptResult?.data ?? null

  // UX-03 D-06/D-07 환산값 — 세대당 주차 + 동당 엘리베이터
  const parkingPerUnit = formatParkingPerUnit(
    (facilityKapt as { parking_count?: number | null } | null)?.parking_count ?? null,
    complex.household_count,
  )
  const elevatorCount = (facilityKapt as { elevator_count?: number | null } | null)?.elevator_count ?? null
  const buildingCount = (facilityKapt as { building_count?: number | null } | null)?.building_count ?? null
  const elevatorPerBuilding = formatElevatorPerBuilding(elevatorCount, buildingCount)

  // 갭 라벨 계산: 매물가 평당가 - 실거래 평균 평당가 (만원 단위)
  const gap =
    gapLabelData.listingPricePerPy !== null &&
    gapLabelData.avgTransactionPricePerPy !== null
      ? gapLabelData.listingPricePerPy - gapLabelData.avgTransactionPricePerPy
      : null

  const breadcrumb = [complex.si, complex.gu, complex.dong].filter(Boolean)
  const latestSale = saleData.at(-1)
  const address = complex.road_address ?? breadcrumb.join(' ')

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
    url: `${SITE}/complexes/${id}`,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <ViewCountTracker complexId={id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Body */}
      <main className="px-4 py-4 sm:px-6 sm:py-6 max-w-screen-xl mx-auto grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
        {/* Main column */}
        <div className="flex flex-col gap-4">
          {/* Header card */}
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <span className="badge orange">
                    <FireIcon />
                    신고가
                  </span>
                  {complex.built_year && (
                    <span className="badge neutral">{complex.built_year}년 입주</span>
                  )}
                  {complex.household_count && (
                    <span className="badge neutral">
                      {complex.household_count.toLocaleString()}세대
                    </span>
                  )}
                </div>
                <h1
                  style={{
                    font: '700 28px/1.25 var(--font-sans)',
                    letterSpacing: '-0.024em',
                    margin: '0 0 4px',
                  }}
                >
                  {complex.canonical_name}
                </h1>
                <div
                  style={{
                    font: '500 14px/1.4 var(--font-sans)',
                    color: 'var(--fg-sec)',
                  }}
                >
                  {address}
                  {complex.floors_above && ` · ${complex.floors_above}층`}
                </div>

                {/* Action buttons — AppHeader 제거 후 hero 영역으로 이동 */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <ShareButton
                    complexId={id}
                    complexName={complex.canonical_name}
                    location={[complex.si, complex.gu, complex.dong].filter(Boolean).join(' ')}
                  />
                  <FavoriteButton complexId={id} />
                  <CompareAddButton complexId={id} complexName={complex.canonical_name} />
                  <Link
                    href={`/login?next=/complexes/${id}`}
                    className="btn btn-md btn-orange"
                    style={{ textDecoration: 'none', gap: 6 }}
                  >
                    <BellIcon />
                    알림 설정
                  </Link>
                </div>
              </div>
              {latestSale && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{
                      font: '500 12px/1 var(--font-sans)',
                      color: 'var(--fg-tertiary)',
                      marginBottom: 4,
                    }}
                  >
                    최근 실거래 (평균 {Math.round((latestSale.avgArea ?? 0) / 3.3058)}평)
                  </div>
                  <div
                    className="tnum"
                    style={{
                      font: '700 32px/1 var(--font-sans)',
                      letterSpacing: '-0.024em',
                    }}
                  >
                    {formatPrice(Math.round(latestSale.avgPrice))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 4,
                      marginTop: 4,
                      color: 'var(--dj-orange)',
                      font: '600 13px/1 var(--font-sans)',
                    }}
                  >
                    <ArrUpIcon />
                    <span className="tnum">{latestSale.yearMonth}</span>
                  </div>
                </div>
              )}
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

          {/* 시설 탭 (DATA-01) */}
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

          {/* 갭투자 분석 (D-01: 단지 상세 카드) */}
          <GapAnalysisCard data={gapStats as ComplexGapStatsResult | null} />

          {/* 신규: 시세 흐름 차트 섹션 (D-02, D-04) */}
          {(areaTypes.length > 0 || priceHistory.length > 0) && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: 0 }}>시세 흐름</h3>
                {/* 타입 탭 — URL searchParam area_type */}
                {areaTypes.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {/* '전체' 탭 */}
                    <a href={`/complexes/${id}`}
                      style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: 5,
                        font: '500 11px/1 var(--font-sans)', textDecoration: 'none',
                        background: !areaBucket ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
                        color: !areaBucket ? '#fff' : 'var(--fg-sec)',
                        border: '1px solid var(--line-subtle)', whiteSpace: 'nowrap',
                      }}>전체</a>
                    {areaTypes.map(t => {
                      const AREA_LABEL: Record<string, string> = { '소형': '소형', '59': '59㎡', '84': '84㎡', '대형': '대형' }
                      const isActive = areaBucket === t.bucket
                      return (
                        <a key={t.bucket} href={`/complexes/${id}?area_type=${t.bucket}`}
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
              {/* 법적 면책 문구 (D-01) */}
              <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '12px 0 0' }}>
                * 실거래 흐름 기반 참고 지수입니다. 투자 결정에 직접 활용하지 마세요.
              </p>
            </div>
          )}

          {/* 호가 vs 실거래 히스토리 — LISTING-04 */}
          {/* RESEARCH.md §6 Pitfall 5: source='naver' 데이터 없으면 섹션 숨김 */}
          {listingHistory.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
                호가 vs 실거래
              </h3>
              <p style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 16px' }}>
                네이버 부동산 매물 호가 중앙값(평당) vs 실거래 평균(평당)
              </p>
              <ListingPriceSectionWrapper
                listingHistory={listingHistory}
                rawSaleData={rawSaleData.map(t => ({
                  yearMonth: t.yearMonth,
                  price:     t.price,
                  area:      t.area,
                }))}
              />
              <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '12px 0 0' }}>
                * 호가는 수집 시점 기준이며 실제 거래가와 다를 수 있습니다.
              </p>
            </div>
          )}

          {/* 주변 단지 시세 비교 */}
          {nearbyComplexes.length > 0 && (() => {
            // 현재 단지 최근 6개월 평균 평당가 계산
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

          {/* 교육 환경 — Suspense로 분리 (N+1 RPC 집약 구간, 나머지 페이지 블로킹 방지) */}
          <Suspense fallback={
            <div className="card" style={{ padding: 20, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>교육 환경 로딩 중…</span>
            </div>
          }>
            <FacilityEduSection complexId={id} si={complex.si ?? undefined} gu={complex.gu ?? undefined} lat={complex.lat ?? undefined} lng={complex.lng ?? undefined} />
          </Suspense>

          {/* 재건축 타임라인 — status='in_redevelopment' 단지만 표시 (D-11: 바텀시트로 제공) */}
          {complex.status === 'in_redevelopment' && redevelopmentProject && (
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
                재건축 정보
              </h3>
              <RedevelopmentSheet
                phase={redevelopmentProject.phase}
                notes={redevelopmentProject.notes}
              />
            </div>
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

          {/* 카페 이야기 — cafe_articles 테이블 */}
          <CafeArticlesSection articles={cafeArticles} />
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
              최근 실거래 내역
            </h3>
            <RecentTransactionList transactions={rawSaleData} />
          </div>

          {/* Sidebar ads — 클라이언트 fetch로 ISR 우회 + sggCode 지역 필터 */}
          <SidebarAdsSection sggCode={complex.sgg_code} />

          {/* 이 단지 담당 공인중개사 (D-01, D-05) */}
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
      </main>

      {/* AI 상담 패널 — position:fixed, stacking context 밖에 렌더 */}
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
      {/* 비교 플로팅 바 — 2개 이상 선택 시 표시 */}
      <CompareFloatingBar />
    </div>
  )
}
