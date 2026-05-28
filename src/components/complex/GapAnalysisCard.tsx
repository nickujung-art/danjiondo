import type { ComplexGapStatsResult } from '@/lib/data/gap-analysis'

function formatPrice(price: number): string {
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}

const RISK_BADGE: Record<string, { bg: string; label: string }> = {
  safe:    { bg: '#16a34a', label: '안전' },
  caution: { bg: '#d97706', label: '주의' },
  danger:  { bg: '#dc2626', label: '위험' },
}

interface GapAnalysisCardProps {
  data: ComplexGapStatsResult | null
}

export function GapAnalysisCard({ data }: GapAnalysisCardProps) {
  if (!data) return null

  const badge = RISK_BADGE[data.riskLevel] ?? RISK_BADGE['caution']!

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* 헤더 행 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: 0 }}>갭투자 분석</h3>
        {/* CSS dot + 텍스트 배지 (이모지 금지 — D-06) */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: badge.bg,
          color: '#fff',
          font: '600 12px/1 var(--font-sans)',
          borderRadius: 6,
          padding: '4px 10px',
        }}>
          <span style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)',
            flexShrink: 0,
          }} />
          {badge.label}
        </span>
      </div>

      {/* 3열 숫자 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        {[
          { label: '갭 금액',  value: formatPrice(data.gapAmount) },
          { label: '갭 비율',  value: `${data.gapRatio.toFixed(1)}%` },
          { label: '전세가율', value: `${data.jeonseRatio.toFixed(1)}%` },
        ].map(item => (
          <div key={item.label}>
            <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 4 }}>
              {item.label}
            </div>
            <div className="tnum" style={{ font: '700 16px/1.2 var(--font-sans)' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* 기준 메타 */}
      <div style={{ font: '500 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', borderTop: '1px solid var(--line-subtle)', paddingTop: 10 }}>
        기준: 최근 12개월 거래 중위값 · 매매 {data.saleCount}건 / 전세 {data.jeonseCount}건
      </div>
    </div>
  )
}
