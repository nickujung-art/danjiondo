interface DistrictStatsCardProps {
  districtName:    string
  population:      number | null
  households:      number | null
  dataYear:        number | null
  dataQuarter:     number | null
  populationChange: number | null
  popUnder20:      number | null
  pop20s:          number | null
  pop30s:          number | null
  pop40s:          number | null
  pop50s:          number | null
  pop60plus:       number | null
}

// 부호 포함 정수 포맷: +1,234 / -1,234
function fmtChange(n: number): string {
  return (n >= 0 ? '+' : '') + n.toLocaleString('ko-KR')
}

interface AgeBarProps {
  label:     string
  value:     number
  total:     number
  highlight: boolean
}
function AgeBar({ label, value, total, highlight }: AgeBarProps) {
  const pct = total > 0 ? (value / total) * 100 : 0
  const color = highlight ? '#F97316' : '#D1D5DB'
  const textColor = highlight ? '#EA580C' : '#6B7280'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ font: '500 11px/1 var(--font-sans)', color: '#6B7280', width: 48, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 2, height: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct.toFixed(1)}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span
        style={{
          font: `${highlight ? '600' : '500'} 11px/1 var(--font-sans)`,
          color: textColor,
          width: 36,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

export function DistrictStatsCard({
  districtName,
  population,
  households,
  dataYear,
  dataQuarter,
  populationChange,
  popUnder20,
  pop20s,
  pop30s,
  pop40s,
  pop50s,
  pop60plus,
}: DistrictStatsCardProps) {
  const hasBasic = population !== null || households !== null
  const hasAge   = popUnder20 !== null || pop20s !== null || pop30s !== null

  const perHousehold =
    population !== null && households !== null && households > 0
      ? (population / households).toFixed(2)
      : null

  const ageTotal =
    (popUnder20 ?? 0) + (pop20s ?? 0) + (pop30s ?? 0) +
    (pop40s ?? 0)     + (pop50s ?? 0) + (pop60plus ?? 0)

  const changeRate =
    populationChange !== null && population !== null && population > 0
      ? ((populationChange / (population - populationChange)) * 100)
      : null

  return (
    <div
      role="region"
      aria-labelledby="district-stats-heading"
    >
      {/* 카드 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h3
          id="district-stats-heading"
          style={{ font: '700 15px/1.4 var(--font-sans)', color: 'var(--fg-pri)', margin: 0 }}
        >
          지역 통계
        </h3>
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          {districtName} 기준
        </span>
      </div>

      {!hasBasic ? (
        <p
          style={{
            font: '500 13px/1.6 var(--font-sans)',
            color: 'var(--fg-tertiary)',
            textAlign: 'center',
            padding: '32px 0',
            margin: 0,
          }}
        >
          해당 지역 통계 데이터가 아직 수집되지 않았습니다.
        </p>
      ) : (
        <>
          {/* 데이터 출처 */}
          {dataYear !== null && (
            <p style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 16px' }}>
              행안부 주민등록통계 기준
              {dataQuarter !== null ? ` · ${dataYear}년 ${dataQuarter}분기` : ` · ${dataYear}년`}
            </p>
          )}

          {/* ── 기본현황 ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: perHousehold !== null ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 4 }}>
                인구수
              </div>
              <div className="tnum" style={{ font: '700 20px/1 var(--font-sans)', color: 'var(--fg-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {population !== null ? `${population.toLocaleString('ko-KR')}명` : '—'}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 4 }}>
                세대수
              </div>
              <div className="tnum" style={{ font: '700 20px/1 var(--font-sans)', color: 'var(--fg-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {households !== null ? `${households.toLocaleString('ko-KR')}세대` : '—'}
              </div>
            </div>
            {perHousehold !== null && (
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 4 }}>
                  가구당 인구
                </div>
                <div className="tnum" style={{ font: '700 20px/1 var(--font-sans)', color: 'var(--fg-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {perHousehold}명
                </div>
              </div>
            )}
          </div>

          {/* ── 인구 흐름 ── */}
          {populationChange !== null && (
            <div
              style={{
                borderTop: '1px solid var(--line-default)',
                paddingTop: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 10 }}>
                인구 흐름
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    font: '700 20px/1 var(--font-sans)',
                    color: populationChange >= 0 ? '#F97316' : '#6B7280',
                  }}
                >
                  {populationChange >= 0 ? '▲' : '▼'}
                </span>
                <div>
                  <span className="tnum" style={{ font: '700 18px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
                    {fmtChange(populationChange)}명
                  </span>
                  {changeRate !== null && (
                    <span
                      style={{
                        font: '500 12px/1 var(--font-sans)',
                        color: 'var(--fg-tertiary)',
                        marginLeft: 6,
                      }}
                    >
                      전년 동기 대비 ({changeRate >= 0 ? '+' : ''}{changeRate.toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 연령 분포 ── */}
          {hasAge && ageTotal > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--line-default)',
                paddingTop: 16,
              }}
            >
              <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 12 }}>
                연령 분포
                <span style={{ font: '400 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 6 }}>
                  주황 = 30·40대 (주요 수요층)
                </span>
              </div>
              {popUnder20 !== null && (
                <AgeBar label="20세 미만" value={popUnder20} total={ageTotal} highlight={false} />
              )}
              {pop20s !== null && (
                <AgeBar label="20대" value={pop20s} total={ageTotal} highlight={false} />
              )}
              {pop30s !== null && (
                <AgeBar label="30대" value={pop30s} total={ageTotal} highlight={true} />
              )}
              {pop40s !== null && (
                <AgeBar label="40대" value={pop40s} total={ageTotal} highlight={true} />
              )}
              {pop50s !== null && (
                <AgeBar label="50대" value={pop50s} total={ageTotal} highlight={false} />
              )}
              {pop60plus !== null && (
                <AgeBar label="60세+" value={pop60plus} total={ageTotal} highlight={false} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
