import type { EnrichedPresaleListing } from '@/lib/data/presale'

const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 성산구',
  '48125': '창원 마산합포구',
  '48127': '창원 마산회원구',
  '48129': '창원 진해구',
  '48250': '김해시',
}

// 평형 타입별 색상: 소형=파랑, 중소형=초록, 국민평형=주황, 대형=갈색
function areaColorSafe(area_m2: number | null | undefined): string {
  if (!area_m2) return 'var(--fg-tertiary)'
  if (area_m2 < 60) return '#2563eb'
  if (area_m2 < 80) return '#16a34a'
  if (area_m2 < 100) return '#ea580c'
  return '#92400e'  // 대형 — 갈색 계열
}

export function EnrichedPresaleCard({ item }: { item: EnrichedPresaleListing }) {
  const unitTypes = item.unitTypes ?? []
  const facilities = (item.community?.facilities as string[] | undefined) ?? []
  const sggLabel = item.sggCode ? (SGG_LABEL[item.sggCode] ?? item.sggCode) : null

  const summary = item.summary as {
    totalFloors?: number | null
    buildings?: number | null
    parkingPerUnit?: number | null
  }

  return (
    <article
      aria-label={`${item.name} 분양 예정`}
      style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line-default)', background: '#fff' }}
    >
      {/* 컬러 헤더 배너 */}
      <div style={{
        background: '#fff7ed',
        borderBottom: '1px solid #fed7aa',
        padding: '14px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {/* 상단 메타: 지역 + 미등록 배지 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {sggLabel && (
            <span style={{
              font: '500 11px/1 var(--font-sans)',
              color: '#c2410c',
              background: '#ffedd5',
              border: '1px solid #fdba74',
              borderRadius: 4,
              padding: '2px 7px',
            }}>
              {sggLabel}
            </span>
          )}
          <span style={{
            font: '500 10px/1 var(--font-sans)',
            color: '#6b7280',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            padding: '2px 6px',
            marginLeft: 'auto',
          }}>
            청약홈 미등록
          </span>
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
              <span style={{ font: '400 10px/1 var(--font-sans)', color: '#9ca3af' }}>시공</span>
              <span style={{ font: '600 12px/1 var(--font-sans)', color: '#374151' }}>{item.builder}</span>
            </div>
          )}
          {item.moveInDate && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ font: '400 10px/1 var(--font-sans)', color: '#9ca3af' }}>입주</span>
              <span style={{ font: '600 12px/1 var(--font-sans)', color: '#374151' }}>{item.moveInDate}</span>
            </div>
          )}
        </div>

        {/* 사업 개요 */}
        {(summary.buildings || summary.totalFloors) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {summary.buildings && (
              <span style={{
                font: '500 11px/1 var(--font-sans)',
                background: '#f3f4f6', color: '#374151',
                padding: '3px 8px', borderRadius: 4,
              }}>
                {summary.buildings}개동
              </span>
            )}
            {summary.totalFloors && (
              <span style={{
                font: '500 11px/1 var(--font-sans)',
                background: '#f3f4f6', color: '#374151',
                padding: '3px 8px', borderRadius: 4,
              }}>
                최고 {summary.totalFloors}층
              </span>
            )}
          </div>
        )}

        {/* 평형 타입 — 컬러 칩 */}
        {unitTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {unitTypes.slice(0, 5).map((ut, i) => {
              const col = areaColorSafe(ut.area_m2)
              return (
                <span
                  key={i}
                  style={{
                    font: '600 11px/1.3 var(--font-sans)',
                    padding: '3px 9px',
                    borderRadius: 20,
                    background: col + '18',
                    color: col,
                    border: `1px solid ${col}40`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ut.area_m2 ? `${ut.area_m2}㎡` : ut.type}
                  {ut.units ? ` ${ut.units}세대` : ''}
                </span>
              )
            })}
            {unitTypes.length > 5 && (
              <span style={{ font: '500 11px/1 var(--font-sans)', color: '#9ca3af', alignSelf: 'center' }}>
                +{unitTypes.length - 5}
              </span>
            )}
          </div>
        )}

        {/* 커뮤니티 시설 */}
        {facilities.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {facilities.slice(0, 4).map((f, i) => (
              <span
                key={i}
                style={{
                  font: '400 10px/1 var(--font-sans)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                }}
              >
                {f}
              </span>
            ))}
            {facilities.length > 4 && (
              <span style={{ font: '400 10px/1 var(--font-sans)', color: '#9ca3af', alignSelf: 'center' }}>
                외 {facilities.length - 4}개
              </span>
            )}
          </div>
        )}

        {/* 주소 */}
        {item.address && (
          <div style={{ font: '400 11px/1.4 var(--font-sans)', color: '#6b7280', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
            {item.address}
          </div>
        )}

        {/* 공식 사이트 */}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              font: '600 11px/1 var(--font-sans)',
              color: '#ea580c',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
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
