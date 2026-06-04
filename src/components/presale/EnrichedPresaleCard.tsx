import type { EnrichedPresaleListing } from '@/lib/data/presale'

const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 성산구',
  '48125': '창원 마산합포구',
  '48127': '창원 마산회원구',
  '48129': '창원 진해구',
  '48250': '김해시',
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

  const hasSummaryData = summary.totalFloors || summary.buildings || summary.parkingPerUnit

  return (
    <div
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{ font: '700 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', flex: 1 }}>
          {item.name}
        </span>
        <span style={{
          font: '500 10px/1 var(--font-sans)',
          padding: '2px 7px',
          borderRadius: 3,
          border: '1px solid var(--fg-tertiary)',
          color: 'var(--fg-tertiary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          청약홈 미등록
        </span>
      </div>

      {/* 지역·주소 */}
      {(sggLabel || item.address) && (
        <div style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
          {[sggLabel, item.address].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* 기본 정보 뱃지 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {item.totalUnits && (
          <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
            총 {item.totalUnits.toLocaleString('ko-KR')}세대
          </span>
        )}
        {item.moveInDate && (
          <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
            입주 {item.moveInDate}
          </span>
        )}
        {item.builder && (
          <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {item.builder}
          </span>
        )}
      </div>

      {/* 사업 개요 */}
      {hasSummaryData && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {summary.buildings && (
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
              {summary.buildings}개동
            </span>
          )}
          {summary.totalFloors && (
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
              최고 {summary.totalFloors}층
            </span>
          )}
          {summary.parkingPerUnit && (
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
              주차 세대당 {summary.parkingPerUnit}대
            </span>
          )}
        </div>
      )}

      {/* 평형 타입 */}
      {unitTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {unitTypes.slice(0, 6).map((ut, i) => (
            <span
              key={i}
              style={{
                font: '500 11px/1.3 var(--font-sans)',
                padding: '3px 8px',
                background: 'var(--bg-surface-2)',
                borderRadius: 4,
                color: 'var(--fg-sec)',
              }}
            >
              {ut.type}
              {ut.area_m2 ? ` ${ut.area_m2}㎡` : ''}
              {ut.units ? ` · ${ut.units.toLocaleString('ko-KR')}세대` : ''}
            </span>
          ))}
          {unitTypes.length > 6 && (
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              외 {unitTypes.length - 6}종
            </span>
          )}
        </div>
      )}

      {/* 커뮤니티 */}
      {facilities.length > 0 && (
        <div style={{ font: '500 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          커뮤니티: {facilities.slice(0, 5).join(' · ')}
          {facilities.length > 5 && ` 외 ${facilities.length - 5}개`}
        </div>
      )}

      {/* 공식 사이트 링크 */}
      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            font: '500 11px/1 var(--font-sans)',
            color: 'var(--dj-orange)',
            textDecoration: 'none',
            marginTop: 2,
          }}
        >
          공식 사이트 →
        </a>
      )}

      {/* 크롤링 미완료 안내 */}
      {!item.crawledAt && (
        <div style={{
          font: '400 10px/1.4 var(--font-sans)',
          color: 'var(--fg-tertiary)',
          borderTop: '1px solid var(--line-subtle)',
          paddingTop: 8,
        }}>
          상세 정보 수집 중 · 공식 사이트에서 확인하세요
        </div>
      )}
    </div>
  )
}
