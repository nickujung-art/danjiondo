import type { ComplexSummary } from '@/lib/data/compare'

interface CompareTableProps {
  complexes: ComplexSummary[]
}

function formatPrice(price: number): string {
  const uk  = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}천`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}

interface RowDef {
  id:     string
  label:  string
  format: (c: ComplexSummary) => string | null
  numeric?: boolean
}

const ROWS: RowDef[] = [
  {
    id:     'area',
    label:  '전용면적',
    format: c => c.areaRange ?? null,
  },
  {
    id:     'household',
    label:  '세대수',
    format: c => c.household_count != null
      ? `${c.household_count.toLocaleString()}세대`
      : null,
    numeric: true,
  },
  {
    id:     'built_year',
    label:  '준공연도',
    format: c => c.built_year != null ? `${c.built_year}년` : null,
    numeric: true,
  },
  {
    id:     'latest_sale',
    label:  '최근매매가',
    format: c => c.latestSalePrice != null ? formatPrice(c.latestSalePrice) : '거래 없음',
    numeric: true,
  },
  {
    id:     'price_per_py',
    label:  '평당가',
    format: c => c.latestSalePricePerPy != null
      ? `${c.latestSalePricePerPy.toLocaleString()}만원/평`
      : null,
    numeric: true,
  },
  {
    id:     'latest_jeonse',
    label:  '최근전세가',
    format: c => c.latestJeonsePrice != null ? formatPrice(c.latestJeonsePrice) : '거래 없음',
    numeric: true,
  },
  {
    id:     'school_score',
    label:  '학군점수',
    format: c => c.schoolScore != null ? `★ ${c.schoolScore.toFixed(1)}` : '정보 없음',
    numeric: true,
  },
  {
    id:     'redevelopment',
    label:  '재건축단계',
    format: c => c.redevelopmentPhase ?? null,
  },
  {
    id:     'heat_type',
    label:  '난방방식',
    format: c => c.heatType ?? null,
  },
  {
    id:      'management_cost',
    label:   '관리비 (세대당)',
    format:  (c: ComplexSummary) => c.managementCostAvg != null ? `월 ${c.managementCostAvg.toLocaleString()}만원` : null,
    numeric: true,
  },
]

const labelCellStyle: React.CSSProperties = {
  position:    'sticky',
  left:        0,
  background:  'var(--bg-surface)',
  zIndex:      5,
  padding:     '12px 16px',
  minWidth:    120,
  width:       120,
  font:        '500 12px/1 var(--font-sans)',
  color:       'var(--fg-sec)',
  whiteSpace:  'nowrap',
  borderBottom: '1px solid var(--line-subtle)',
}

const headerCellStyle: React.CSSProperties = {
  padding:       '0 16px',
  height:        56,
  font:          '700 14px/1.4 var(--font-sans)',
  color:         'var(--fg-pri)',
  textAlign:     'left',
  verticalAlign: 'middle',
  borderBottom:  '2px solid var(--line-default)',
  minWidth:      160,
  whiteSpace:    'nowrap',
}

function EmptyState() {
  return (
    <div
      style={{
        padding:   '64px 0',
        textAlign: 'center',
        font:      '500 14px/1.6 var(--font-sans)',
        color:     'var(--fg-sec)',
      }}
    >
      <p style={{ margin: 0 }}>
        단지를 2개 이상 선택하면 비교할 수 있어요.
      </p>
      <p style={{ margin: '4px 0 0' }}>
        단지 상세 페이지에서 &quot;비교에 추가 +&quot; 버튼을 눌러주세요.
      </p>
    </div>
  )
}

export function CompareTable({ complexes }: CompareTableProps) {
  if (complexes.length < 2) return <EmptyState />

  return (
    <div
      style={{
        overflowX:                'auto',
        WebkitOverflowScrolling:  'touch',
      } as React.CSSProperties}
    >
      <table
        style={{
          width:           '100%',
          borderCollapse:  'collapse',
          tableLayout:     'auto',
        }}
      >
        <colgroup>
          <col style={{ minWidth: 120, width: 120 }} />
          {complexes.map(c => (
            <col key={c.id} style={{ minWidth: 160 }} />
          ))}
        </colgroup>

        <thead>
          <tr
            style={{
              position:   'sticky',
              top:        60,
              zIndex:     10,
              background: 'var(--bg-surface)',
            }}
          >
            <th
              style={{
                ...labelCellStyle,
                borderBottom: '2px solid var(--line-default)',
                font:         '500 12px/1 var(--font-sans)',
                color:        'var(--fg-sec)',
              }}
            />
            {complexes.map(c => (
              <th key={c.id} style={headerCellStyle}>
                {c.canonical_name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {ROWS.map((row, i) => (
            <tr
              key={row.id}
              style={{
                background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-surface-2)',
              }}
            >
              <td style={labelCellStyle}>
                {row.label}
              </td>
              {complexes.map(c => {
                const value = row.format(c)
                return (
                  <td
                    key={c.id}
                    className={row.numeric ? 'tnum' : undefined}
                    style={{
                      padding:           '12px 16px',
                      font:              '500 13px/1.4 var(--font-sans)',
                      color:             'var(--fg-pri)',
                      borderBottom:      '1px solid var(--line-subtle)',
                      fontVariantNumeric: row.numeric ? 'tabular-nums' : undefined,
                    }}
                  >
                    {value ?? '-'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
