'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { MapPanelData } from '@/lib/data/map-panel'
import { AdBanner } from '@/components/ads/AdBanner'
import type { AdCampaign } from '@/lib/data/ads'

interface Props {
  selectedComplexId: string | null
  onClose:           () => void
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function formatPrice(price: number): string {
  const eok = Math.floor(price / 10000)
  const man = price % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`
  if (eok > 0) return `${eok}억원`
  return `${price.toLocaleString()}만원`
}

export function MapSidePanel({ selectedComplexId, onClose }: Props) {
  const [panelData, setPanelData] = useState<MapPanelData | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [sidebarAd, setSidebarAd] = useState<AdCampaign | null>(null)

  const isOpen = selectedComplexId !== null

  useEffect(() => {
    if (!selectedComplexId) {
      setPanelData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)

    fetch(`/api/complexes/${selectedComplexId}/map-panel`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<MapPanelData>
      })
      .then((data) => { setPanelData(data); setLoading(false) })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '오류가 발생했습니다')
        setLoading(false)
      })
  }, [selectedComplexId])

  // 단지 선택 시 지역 매칭 사이드바 광고 fetch
  useEffect(() => {
    if (!panelData) {
      setSidebarAd(null)
      return
    }
    const sggParam = panelData.sgg_code ? `?sgg_code=${panelData.sgg_code}` : ''
    fetch(`/api/ads/sidebar${sggParam}`)
      .then(r => r.ok ? r.json() : { ads: [] })
      .then((body: { ads: AdCampaign[] }) => { setSidebarAd(body.ads[0] ?? null) })
      .catch(() => { setSidebarAd(null) })
  }, [panelData])

  // PC: 우측 슬라이드인 (w-[360px], h-full, right-0)
  // 모바일: 바텀 시트 (w-full, h-[60vh], bottom-0, rounded-t-xl)
  // display 는 Tailwind className("hidden md:flex" / "flex md:hidden")이 제어.
  // 인라인에 display:flex 를 넣으면 hidden 클래스를 덮어써서 양쪽 모두 열리는 버그가 생김.
  const panelStyle: React.CSSProperties = {
    position:      'fixed',
    zIndex:        200,
    background:    'white',
    transition:    'transform 200ms cubic-bezier(0.16,1,0.3,1)',
    flexDirection: 'column',
    overflow:      'hidden',
  }

  return (
    <>
      {/* 오버레이 */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          aria-hidden="true"
        />
      )}

      {/* PC 패널 (md 이상) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={panelData ? `${panelData.canonical_name} 단지 정보` : '단지 정보'}
        className="hidden md:flex"
        style={{
          ...panelStyle,
          top:        0,
          right:      0,
          width:      360,
          height:     '100%',
          borderLeft: '1px solid #E5E7EB',
          boxShadow:  '-4px 0 24px rgba(0,0,0,0.08)',
          transform:  isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <PanelContent
          panelData={panelData}
          loading={loading}
          error={error}
          onClose={onClose}
          sidebarAd={sidebarAd}
        />
      </div>

      {/* 모바일 바텀 시트 (md 미만) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={panelData ? `${panelData.canonical_name} 단지 정보` : '단지 정보'}
        className="flex md:hidden"
        style={{
          ...panelStyle,
          bottom:       0,
          left:         0,
          right:        0,
          height:       '60vh',
          borderTop:    '1px solid #E5E7EB',
          borderRadius: '12px 12px 0 0',
          boxShadow:    '0 -4px 24px rgba(0,0,0,0.08)',
          transform:    isOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        <PanelContent
          panelData={panelData}
          loading={loading}
          error={error}
          onClose={onClose}
          sidebarAd={sidebarAd}
        />
      </div>
    </>
  )
}

interface PanelContentProps {
  panelData: MapPanelData | null
  loading:   boolean
  error:     string | null
  onClose:   () => void
  sidebarAd: AdCampaign | null
}

function PanelContent({ panelData, loading, error, onClose, sidebarAd }: PanelContentProps) {
  return (
    <>
      {/* 헤더 */}
      <div
        style={{
          height:         52,
          padding:        '0 16px',
          borderBottom:   '1px solid #E5E7EB',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          flexShrink:     0,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
          {panelData ? panelData.canonical_name : '단지 정보'}
        </span>
        <button
          onClick={onClose}
          aria-label="패널 닫기"
          style={{
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            padding:    6,
            color:      '#6B7280',
            display:    'flex',
            alignItems: 'center',
          }}
        >
          <XIcon />
        </button>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && (
          <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingTop: 32 }}>
            불러오는 중…
          </div>
        )}
        {error && (
          <div style={{ color: '#EF4444', fontSize: 13, textAlign: 'center', paddingTop: 32 }}>
            데이터를 불러올 수 없습니다
          </div>
        )}
        {!loading && !error && panelData && (
          <PanelBody panelData={panelData} sidebarAd={sidebarAd} />
        )}
      </div>
    </>
  )
}

function PanelBody({ panelData, sidebarAd }: { panelData: MapPanelData; sidebarAd: AdCampaign | null }) {
  const location = [panelData.si, panelData.gu].filter(Boolean).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 위치 */}
      {location && (
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{location}</p>
      )}

      {/* 평당가 */}
      {panelData.avg_sale_per_pyeong !== null && (
        <div
          style={{
            background:   '#F9FAFB',
            border:       '1px solid #E5E7EB',
            borderRadius: 8,
            padding:      '12px 14px',
          }}
        >
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>평당가 (최근 1년 평균)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
            {panelData.avg_sale_per_pyeong.toLocaleString()}만원
            <span style={{ fontSize: 13, fontWeight: 400, color: '#6B7280' }}>/평</span>
          </div>
        </div>
      )}

      {/* 기본 정보 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {panelData.household_count !== null && (
          <InfoChip label="세대수" value={`${panelData.household_count.toLocaleString()}세대`} />
        )}
        {panelData.built_year !== null && (
          <InfoChip label="준공" value={`${panelData.built_year}년`} />
        )}
      </div>

      {/* 최근 거래 */}
      {panelData.recent_trades.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            최근 거래
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {panelData.recent_trades.map((t, idx) => (
              <div
                key={idx}
                style={{
                  display:        'flex',
                  justifyContent: 'space-between',
                  alignItems:     'center',
                  fontSize:       13,
                }}
              >
                <span style={{ color: '#6B7280' }}>{t.deal_date}</span>
                <span style={{ fontWeight: 600, color: '#111827' }}>{formatPrice(t.price)}</span>
                {t.area_m2 !== null && (
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                    {(t.area_m2 / 3.3058).toFixed(1)}평
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 학원등급 배지 */}
      {panelData.hagwon_grade && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>학원등급</span>
          <span
            style={{
              display:      'inline-block',
              padding:      '2px 8px',
              borderRadius: 4,
              background:   '#EFF6FF',
              color:        '#1D4ED8',
              fontSize:     13,
              fontWeight:   700,
            }}
          >
            {panelData.hagwon_grade}
          </span>
        </div>
      )}

      {/* 상세 링크 */}
      <Link
        href={panelData.detail_url}
        style={{
          display:        'block',
          textAlign:      'center',
          padding:        '10px 0',
          background:     '#111827',
          color:          'white',
          borderRadius:   8,
          fontSize:       14,
          fontWeight:     600,
          textDecoration: 'none',
        }}
      >
        단지 상세 보기
      </Link>

      {/* 사이드바 광고 */}
      {sidebarAd && (
        <div>
          <AdBanner ad={sidebarAd} />
        </div>
      )}
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background:   '#F9FAFB',
        border:       '1px solid #E5E7EB',
        borderRadius: 6,
        padding:      '8px 10px',
      }}
    >
      <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{value}</div>
    </div>
  )
}
