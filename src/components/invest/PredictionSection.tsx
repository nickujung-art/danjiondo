import Link from 'next/link'
import { formatPrice } from '@/lib/format'
import type { PredictionRankingItem, RegionalPredictionSummary } from '@/lib/data/invest'

const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 창원구',
  '48125': '창원 성산구',
  '48127': '마산합포구',
  '48128': '마산회원구',
  '48129': '창원 진해구',
  '48250': '김해시',
}

const DIRECTION_COLOR: Record<'up' | 'flat' | 'down', string> = {
  up:   '#16a34a',
  flat: '#d97706',
  down: '#dc2626',
}

const DIRECTION_ARROW: Record<'up' | 'flat' | 'down', string> = {
  up:   '↑',
  flat: '→',
  down: '↓',
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function confidenceBadge(mape: number): { label: string; color: string } {
  if (mape < 0.10) return { label: '높음', color: '#16a34a' }
  if (mape < 0.20) return { label: '보통', color: '#d97706' }
  return { label: '낮음', color: '#dc2626' }
}

interface PredictionSectionProps {
  regionalSummaries: RegionalPredictionSummary[]
  rankingItems:      PredictionRankingItem[]
  areaTabItems:      { label: string; href: string; active: boolean }[]
  activeBucket?:     string
}

export function PredictionSection({
  regionalSummaries,
  rankingItems,
  areaTabItems,
  activeBucket,
}: PredictionSectionProps) {
  return (
    <section aria-labelledby="prediction-heading" style={{ marginBottom: 28 }}>
      {/* 섹션 제목 */}
      <div style={{ marginBottom: 14 }}>
        <h2
          id="prediction-heading"
          style={{
            font:          '700 18px/1.3 var(--font-sans)',
            letterSpacing: '-0.01em',
            margin:        '0 0 4px',
          }}
        >
          시세 예측 분석
        </h2>
        <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
          <span style={{
            display: 'inline-block', padding: '1px 6px', borderRadius: 4,
            background: 'var(--bg-surface-2)', border: '1px solid var(--line-subtle)',
            font: '600 11px/1.6 var(--font-sans)', color: 'var(--fg-sec)',
            marginRight: 6,
          }}>
            Chronos-Bolt-Small
          </span>
          Amazon 오픈소스 AI · 과거 실거래 기반 6개월 예측 · 참고용
        </p>
      </div>

      {/* 면적 탭 */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
        {areaTabItems.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display:        'inline-block',
              padding:        '5px 12px',
              borderRadius:   6,
              font:           '500 12px/1 var(--font-sans)',
              textDecoration: 'none',
              background:     tab.active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
              color:          tab.active ? '#fff' : 'var(--fg-sec)',
              border:         '1px solid var(--line-subtle)',
              whiteSpace:     'nowrap',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* ─── Part 1: 지역별 방향 ──────────────────────────────────────────── */}
      <h3
        style={{
          font:         '600 13px/1.4 var(--font-sans)',
          color:        'var(--fg-sec)',
          margin:       '0 0 10px',
        }}
      >
        지역별 예측 방향
      </h3>
      {regionalSummaries.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', marginBottom: 24 }}>
          <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
            예측 데이터를 처리 중입니다 (매일 새벽 갱신)
          </p>
        </div>
      ) : (
        <div
          style={{
            display:  'flex',
            flexWrap: 'wrap',
            gap:      10,
            marginBottom: 24,
          }}
        >
          {regionalSummaries.map((r) => {
            const color   = DIRECTION_COLOR[r.direction]
            const href    = `/invest/region/${r.sggCode}${activeBucket ? `?area_bucket=${activeBucket}` : ''}`
            return (
              <Link
                key={r.sggCode}
                href={href}
                style={{ textDecoration: 'none', display: 'block', flex: '1 1 150px', minWidth: 140 }}
              >
                <div
                  className="card"
                  style={{
                    padding:   16,
                    textAlign: 'center',
                    cursor:    'pointer',
                  }}
                >
                  <div style={{ font: '500 12px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
                    {SGG_LABEL[r.sggCode] ?? r.sggCode}
                  </div>
                  <div
                    aria-hidden="true"
                    style={{ font: '700 28px/1 var(--font-sans)', color, marginBottom: 2 }}
                  >
                    {DIRECTION_ARROW[r.direction]}
                  </div>
                  <div className="tnum" style={{ font: '700 18px/1.2 var(--font-sans)', color, marginBottom: 4 }}>
                    {fmtPct(r.medianChangePct)}
                  </div>
                  <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    6개월 예측
                  </div>
                  <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    단지 {r.complexCount}개
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ─── Part 2: 예측 상승 기대 단지 TOP ────────────────────────────── */}
      <h3
        style={{
          font:   '600 13px/1.4 var(--font-sans)',
          color:  'var(--fg-sec)',
          margin: '0 0 10px',
        }}
      >
        예측 상승 기대 단지 TOP
      </h3>
      {rankingItems.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
            예측 데이터를 처리 중입니다 (매일 새벽 갱신)
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  background:   'var(--bg-surface-2)',
                  borderBottom: '1px solid var(--line-default)',
                }}
              >
                {[
                  { h: '#',           align: 'center' as const },
                  { h: '단지명',       align: 'left'   as const },
                  { h: '지역',         align: 'left'   as const },
                  { h: '현재 예측가',   align: 'right'  as const },
                  { h: '6개월 후',     align: 'right'  as const },
                  { h: '변화율',       align: 'right'  as const },
                  { h: '신뢰도',       align: 'center' as const },
                ].map(({ h, align }) => (
                  <th
                    key={h}
                    style={{
                      padding:    '10px 12px',
                      font:       '600 11px/1 var(--font-sans)',
                      color:      'var(--fg-sec)',
                      textAlign:  align,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankingItems.map((item, idx) => {
                const color = DIRECTION_COLOR[item.direction]
                const conf  = confidenceBadge(item.mape)
                return (
                  <tr key={`${item.complexId}-${item.areaBucket}`} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                    <td
                      style={{
                        padding:   '10px 12px',
                        font:      '500 12px/1 var(--font-sans)',
                        color:     'var(--fg-tertiary)',
                        textAlign: 'center',
                        width:     36,
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link
                        href={`/complexes/${item.complexId}`}
                        style={{
                          font:           '600 13px/1.3 var(--font-sans)',
                          color:          'var(--fg-pri)',
                          textDecoration: 'none',
                        }}
                      >
                        {item.complexName}
                      </Link>
                      <div style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                        {item.areaBucket === '소형' || item.areaBucket === '대형'
                          ? item.areaBucket
                          : `${item.areaBucket}㎡`}
                      </div>
                    </td>
                    <td
                      style={{
                        padding:    '10px 12px',
                        font:       '400 12px/1.3 var(--font-sans)',
                        color:      'var(--fg-sec)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {[item.si, item.gu].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td
                      className="tnum"
                      style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', textAlign: 'right', whiteSpace: 'nowrap' }}
                    >
                      {formatPrice(item.nearPrice)}
                    </td>
                    <td
                      className="tnum"
                      style={{ padding: '10px 12px', font: '600 13px/1 var(--font-sans)', textAlign: 'right', whiteSpace: 'nowrap' }}
                    >
                      {formatPrice(item.farPrice)}
                    </td>
                    <td
                      className="tnum"
                      style={{
                        padding:    '10px 12px',
                        font:       '700 13px/1 var(--font-sans)',
                        color,
                        textAlign:  'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span aria-hidden="true" style={{ marginRight: 2 }}>
                        {DIRECTION_ARROW[item.direction]}
                      </span>
                      {fmtPct(item.changePct)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          display:      'inline-block',
                          color:        conf.color,
                          font:         '600 11px/1 var(--font-sans)',
                          border:       `1px solid ${conf.color}`,
                          borderRadius: 4,
                          padding:      '3px 8px',
                          whiteSpace:   'nowrap',
                        }}
                      >
                        {conf.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 법적 면책 */}
      <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '12px 0 0' }}>
        본 예측은 과거 실거래 패턴 기반 통계 모델이며 투자 결정에 활용하지 마세요.
      </p>
    </section>
  )
}
