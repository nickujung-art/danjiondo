import type { EnrichedPresaleListing } from '@/lib/data/presale'

const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 성산구',
  '48125': '창원 마산합포구',
  '48127': '창원 마산회원구',
  '48129': '창원 진해구',
  '48250': '김해시',
}

interface Props {
  item:       EnrichedPresaleListing
  sponsored?: boolean  // 건설사 광고 계약 시 true — 헤더 강조 + PR 라벨 표시
}

export function EnrichedPresaleCard({ item, sponsored = false }: Props) {
  const unitTypes = item.unitTypes ?? []
  const facilities = (item.community?.facilities as string[] | undefined) ?? []
  const sggLabel   = item.sggCode ? (SGG_LABEL[item.sggCode] ?? item.sggCode) : null

  const summary = item.summary as {
    totalFloors?:    number | null
    buildings?:      number | null
    parkingPerUnit?: number | null
  }

  return (
    <article
      aria-label={`${item.name} 분양 예정`}
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: sponsored ? '1.5px solid #fdba74' : '1px solid var(--line-default)',
        background: '#fff',
        // 광고 카드는 살짝 올라온 느낌
        boxShadow: sponsored ? '0 4px 16px rgba(234,88,12,0.10)' : 'none',
      }}
    >
      {/* 헤더 배너 — 항상 amber 계열 */}
      <div style={{
        background: '#fff7ed',
        borderBottom: '1px solid #fed7aa',
        padding: '14px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {/* 상단 메타: 지역 + 배지 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          {sggLabel && (
            <span style={{
              font: '500 11px/1 var(--font-sans)',
              color: '#c2410c',
              background: '#ffedd5',
              border: '1px solid #fdba74',
              borderRadius: 4,
              padding: '2px 7px',
              flexShrink: 0,
            }}>
              {sggLabel}
            </span>
          )}
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexShrink: 0 }}>
            {sponsored && (
              <span style={{
                font: '600 10px/1 var(--font-sans)',
                color: '#ea580c',
                border: '1px solid #fdba74',
                borderRadius: 4,
                padding: '2px 6px',
                letterSpacing: '0.04em',
              }}>
                PR
              </span>
            )}
            <span style={{
              font: '500 10px/1 var(--font-sans)',
              color: '#9a3412',
              border: '1px solid #fdba74',
              borderRadius: 4,
              padding: '2px 6px',
            }}>
              청약홈 미등록
            </span>
          </div>
        </div>

        {/* 단지명 */}
        <div style={{
          font: '700 15px/1.3 var(--font-sans)',
          color: '#1c1917',
          letterSpacing: '-0.01em',
        }}>
          {item.name}
        </div>

        {/* 핵심 수치: 세대수 */}
        {item.totalUnits && (
          <div style={{
            font: '700 24px/1 var(--font-sans)',
            color: '#ea580c',
            letterSpacing: '-0.02em',
          }}>
            {item.totalUnits.toLocaleString('ko-KR')}
            <span style={{ font: '500 13px/1 var(--font-sans)', color: '#c2410c', marginLeft: 4 }}>세대</span>
          </div>
        )}
      </div>

      {/* 카드 바디 */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 시공사·입주 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {item.builder && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ font: '400 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>시공</span>
              <span style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{item.builder}</span>
            </div>
          )}
          {item.moveInDate && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ font: '400 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>입주</span>
              <span style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{item.moveInDate}</span>
            </div>
          )}
        </div>

        {/* 사업 개요 칩 */}
        {(summary.buildings || summary.totalFloors) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {summary.buildings && (
              <span style={{
                font: '500 11px/1 var(--font-sans)',
                background: 'var(--bg-surface-2)', color: 'var(--fg-sec)',
                padding: '3px 8px', borderRadius: 4,
              }}>
                {summary.buildings}개동
              </span>
            )}
            {summary.totalFloors && (
              <span style={{
                font: '500 11px/1 var(--font-sans)',
                background: 'var(--bg-surface-2)', color: 'var(--fg-sec)',
                padding: '3px 8px', borderRadius: 4,
              }}>
                최고 {summary.totalFloors}층
              </span>
            )}
          </div>
        )}

        {/* 평형 타입 — 단색 칩 */}
        {unitTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {unitTypes.slice(0, 5).map((ut, i) => (
              <span
                key={i}
                style={{
                  font: '500 11px/1.3 var(--font-sans)',
                  padding: '3px 9px',
                  borderRadius: 20,
                  background: 'var(--bg-surface-2)',
                  color: 'var(--fg-sec)',
                  border: '1px solid var(--line-subtle)',
                  whiteSpace: 'nowrap',
                }}
              >
                {ut.area_m2 ? `${ut.area_m2}㎡` : ut.type}
                {ut.units ? ` · ${ut.units.toLocaleString('ko-KR')}세대` : ''}
              </span>
            ))}
            {unitTypes.length > 5 && (
              <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', alignSelf: 'center' }}>
                +{unitTypes.length - 5}
              </span>
            )}
          </div>
        )}

        {/* 커뮤니티 시설 — 단색 태그 */}
        {facilities.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {facilities.slice(0, 5).map((f, i) => (
              <span
                key={i}
                style={{
                  font: '400 10px/1 var(--font-sans)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--bg-surface-2)',
                  color: 'var(--fg-tertiary)',
                  border: '1px solid var(--line-subtle)',
                }}
              >
                {f}
              </span>
            ))}
            {facilities.length > 5 && (
              <span style={{ font: '400 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', alignSelf: 'center' }}>
                외 {facilities.length - 5}개
              </span>
            )}
          </div>
        )}

        {/* 주소 */}
        {item.address && (
          <div style={{
            font: '400 11px/1.4 var(--font-sans)',
            color: 'var(--fg-tertiary)',
            borderTop: '1px solid var(--line-subtle)',
            paddingTop: 8,
          }}>
            {item.address}
          </div>
        )}

        {/* 공식 사이트 — 광고 시 오렌지, 일반 시 기본 */}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              font: '600 11px/1 var(--font-sans)',
              color: sponsored ? '#ea580c' : 'var(--fg-sec)',
              textDecoration: 'none',
              marginTop: 2,
            }}
          >
            공식 사이트 →
          </a>
        )}
      </div>
    </article>
  )
}
