'use client'

import { useState } from 'react'
import type { FacilityEduData, SchoolItem, PoiItem } from '@/lib/data/facility-edu'
import { classifyHagwon, walkColor, WALK_COLOR_HEX } from '@/lib/hagwon-category'

// ─── 아이콘 ────────────────────────────────────────────────────────────────

function WalkIcon({ color }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2">
      <circle cx="12" cy="5" r="2" />
      <path d="M8 21l2-6 2 2 2-6 2 6" />
      <path d="M10 15l-2 6m6-6l2 6" />
    </svg>
  )
}

function SchoolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10 12 5l9 5-9 5z" />
      <path d="M7 12v5c2 1.5 3 2 5 2s3-.5 5-2v-5" />
    </svg>
  )
}

function HagwonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function DaycareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────

function fmtDist(m: number | null): string {
  if (m == null) return '-'
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`
  return `${m}m`
}

function fmtWalk(m: number | null): string {
  if (m == null) return ''
  const min = Math.round(m / 67)
  return `도보 ${min}분`
}

const SCHOOL_TYPE_LABEL: Record<string, string> = {
  elementary: '초등학교',
  middle:     '중학교',
  high:       '고등학교',
}

const GRADE_COLOR: Record<string, string> = {
  'A+': '#15803d', A: '#16a34a', 'A-': '#22c55e',
  'B+': '#1d4ed8', B: '#2563eb', 'B-': '#3b82f6',
  'C+': '#b45309', C: '#d97706', 'C-': '#f59e0b',
  D:    '#9ca3af',
}

const GRADE_BG: Record<string, string> = {
  'A+': '#dcfce7', A: '#f0fdf4', 'A-': '#f0fdf4',
  'B+': '#dbeafe', B: '#eff6ff', 'B-': '#eff6ff',
  'C+': '#fef3c7', C: '#fffbeb', 'C-': '#fffbeb',
  D:    '#f9fafb',
}

const CATEGORY_COLOR: Record<string, { color: string; bg: string }> = {
  '수학':        { color: '#2563eb', bg: '#eff6ff' },
  '영어':        { color: '#16a34a', bg: '#f0fdf4' },
  '예체능':      { color: '#d97706', bg: '#fffbeb' },
  '국어':        { color: '#dc2626', bg: '#fef2f2' },
  '과학':        { color: '#0891b2', bg: '#ecfeff' },
  '중국어/일어': { color: '#7c3aed', bg: '#f5f3ff' },
  '기타':        { color: '#9ca3af', bg: '#f9fafb' },
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────────────────

function EmptyNote({ text }: { text: string }) {
  return (
    <p style={{
      font:      '500 13px/1.6 var(--font-sans)',
      color:     'var(--fg-tertiary)',
      textAlign: 'center',
      padding:   '28px 0',
      margin:    0,
    }}>
      {text}
    </p>
  )
}

function PoiRow({ item, icon, isLast }: { item: PoiItem; icon: React.ReactNode; isLast: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--line-subtle)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'var(--bg-surface-2)',
        display: 'grid', placeItems: 'center',
        flexShrink: 0, color: 'var(--fg-sec)',
      }}>
        {icon}
      </div>
      <span style={{ flex: 1, font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>
        {item.poi_name}
      </span>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
          {fmtDist(item.distance_m)}
        </div>
        {item.distance_m != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end',
            marginTop: 2,
            font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
          }}>
            <WalkIcon />
            {fmtWalk(item.distance_m)}
          </div>
        )}
      </div>
    </div>
  )
}

function SchoolList({ schools, si }: { schools: SchoolItem[]; si?: string }) {
  const [schoolTab, setSchoolTab] = useState<'elementary' | 'middle' | 'high'>('elementary')

  const filtered = schools
    .filter(s => s.school_type === schoolTab)
    .sort((a, b) => {
      // 배정 학교 우선 → 거리순
      if (a.is_assignment !== b.is_assignment) return a.is_assignment ? -1 : 1
      return (a.distance_m ?? 99999) - (b.distance_m ?? 99999)
    })
    .slice(0, 3)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['elementary', 'middle', 'high'] as const).map(type => {
          const count = schools.filter(s => s.school_type === type).length
          const active = schoolTab === type
          return (
            <button
              key={type}
              onClick={() => setSchoolTab(type)}
              style={{
                padding:      '5px 10px',
                borderRadius: 6,
                border:       `1px solid ${active ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                background:   active ? '#fff5ed' : '#fff',
                color:        active ? 'var(--dj-orange)' : 'var(--fg-sec)',
                font:         `600 12px/1 var(--font-sans)`,
                cursor:       'pointer',
              }}
            >
              {SCHOOL_TYPE_LABEL[type]}
              {count > 0 && (
                <span style={{
                  marginLeft: 4,
                  color: active ? 'var(--dj-orange)' : 'var(--fg-tertiary)',
                  fontWeight: 500,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyNote text="반경 1.5km 내 해당 학교가 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filtered.map((s, i) => {
            const wc = walkColor(s.distance_m)
            return (
              <div
                key={i}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          10,
                  padding:      '10px 0',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'var(--bg-surface-2)',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0, color: 'var(--fg-sec)',
                }}>
                  <SchoolIcon />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 학교명 + 배정 배지 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>
                      {s.school_name}
                    </span>
                    {s.is_assignment && (
                      <span style={{
                        font: '600 10px/1 var(--font-sans)',
                        color: '#2563eb', background: '#eff6ff',
                        padding: '2px 5px', borderRadius: 4,
                        flexShrink: 0,
                      }}>
                        배정
                      </span>
                    )}
                    {/* P2: 배정학교 학군 평당가 비교 배지 */}
                    {s.is_assignment && s.price_premium != null && Math.abs(s.price_premium) >= 5 && (
                      <span style={{
                        font:         '600 10px/1 var(--font-sans)',
                        color:        s.price_premium > 0 ? '#15803d' : '#9ca3af',
                        background:   s.price_premium > 0 ? '#dcfce7' : '#f9fafb',
                        padding:      '2px 5px',
                        borderRadius: 4,
                        flexShrink:   0,
                      }}>
                        {si ?? '지역'} 평균 대비 {s.price_premium > 0 ? '+' : ''}{s.price_premium}%
                      </span>
                    )}
                  </div>

                  {/* 학교 품질 지표 (학교알리미 데이터 있을 때만) */}
                  {(s.students_per_class != null || (s.school_type === 'middle' && s.advancement_rate != null)) && (
                    <div style={{ font: '500 11px/1.7 var(--font-sans)', color: 'var(--fg-sec)', marginTop: 3 }}>
                      {s.students_per_class != null && (
                        <span>
                          학급당 {s.students_per_class}명
                          {s.students_percentile != null && (
                            <span style={{ color: 'var(--fg-tertiary)' }}>
                              {' '}· {si ?? '지역'} 상위 {Math.round((1 - s.students_percentile) * 100)}%
                            </span>
                          )}
                        </span>
                      )}
                      {s.school_type === 'middle' && s.advancement_rate != null && (
                        <span style={{ marginLeft: s.students_per_class != null ? 8 : 0 }}>
                          진학률 {s.advancement_rate.toFixed(1)}%
                          {s.advancement_percentile != null && (
                            <span style={{ color: 'var(--fg-tertiary)' }}>
                              {' '}· 상위 {Math.round((1 - s.advancement_percentile) * 100)}%
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  {s.data_year != null && (s.students_per_class != null || s.advancement_rate != null) && (
                    <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                      {s.data_year}년 기준
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
                    {fmtDist(s.distance_m)}
                  </div>
                  {s.distance_m != null && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end',
                      marginTop: 3,
                      font: '500 11px/1 var(--font-sans)', color: WALK_COLOR_HEX[wc],
                    }}>
                      <WalkIcon color={WALK_COLOR_HEX[wc]} />
                      {fmtWalk(s.distance_m)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HagwonSection({ hagwons, stats, si }: {
  hagwons: PoiItem[]
  stats: FacilityEduData['hagwonStats']
  si?: string
}) {
  const [expanded, setExpanded] = useState(false)

  if (!stats && hagwons.length === 0) {
    return <EmptyNote text="학원 데이터를 수집 중입니다." />
  }

  const INITIAL_LIMIT = 8
  const visibleHagwons = expanded ? hagwons : hagwons.slice(0, INITIAL_LIMIT)
  const grade = stats?.grade ?? 'D'
  const above = stats ? 100 - stats.percentile : null
  const siLabel = si ? `${si} 상위 ${above}%` : `창원·김해 상위 ${above}%`

  return (
    <div>
      {stats && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          16,
          padding:      '14px 16px',
          borderRadius: 10,
          background:   GRADE_BG[grade] ?? '#f9fafb',
          border:       `1px solid ${GRADE_COLOR[grade] ?? '#e5e7eb'}22`,
          marginBottom: 16,
        }}>
          <div style={{
            minWidth: 52, height: 48, borderRadius: 12,
            padding: '0 8px',
            background: GRADE_COLOR[grade],
            display: 'grid', placeItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ font: '800 20px/1 var(--font-sans)', color: '#fff', letterSpacing: '-0.5px' }}>
              {grade}
            </span>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ font: '700 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 3 }}>
              학원 밀도 {grade}등급
              {above !== null && (
                <span style={{
                  marginLeft: 8,
                  font: '500 12px/1 var(--font-sans)',
                  color: GRADE_COLOR[grade],
                }}>
                  {siLabel}
                </span>
              )}
            </div>
            <div style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
              500m 내 {stats.cnt500}개 · 1km 내 {stats.cnt1000}개
              {stats.cnt1000 >= 45 && ' (45개 이상)'}
            </div>
          </div>
        </div>
      )}

      {visibleHagwons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleHagwons.map((h, i) => {
            const cat = classifyHagwon(h.poi_name)
            const catStyle = CATEGORY_COLOR[cat] ?? CATEGORY_COLOR['기타']
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 0',
                borderBottom: i < visibleHagwons.length - 1 ? '1px solid var(--line-subtle)' : 'none',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'var(--bg-surface-2)',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0, color: 'var(--fg-sec)',
                }}>
                  <HagwonIcon />
                </div>
                <span style={{ flex: 1, font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>
                  {h.poi_name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    font: '500 10px/1 var(--font-sans)',
                    color: catStyle?.color, background: catStyle?.bg,
                    padding: '2px 5px', borderRadius: 4,
                  }}>
                    {cat}
                  </span>
                  <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                    {fmtDist(h.distance_m)}
                  </span>
                </div>
              </div>
            )
          })}
          {hagwons.length > INITIAL_LIMIT && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
                textAlign: 'center', padding: '10px 0 0', margin: 0,
                background: 'none', border: 'none', cursor: 'pointer', width: '100%',
              }}
            >
              {expanded ? '접기' : `외 ${hagwons.length - INITIAL_LIMIT}개 더보기`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DaycareSection({ daycares, kindergartens }: {
  daycares: PoiItem[]
  kindergartens: PoiItem[]
}) {
  const hasBoth = daycares.length > 0 && kindergartens.length > 0
  const hasAny  = daycares.length > 0 || kindergartens.length > 0

  if (!hasAny) return <EmptyNote text="반경 1km 내 어린이집·유치원 정보가 없습니다." />

  return (
    <div>
      {kindergartens.length > 0 && (
        <>
          {hasBoth && (
            <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 8 }}>
              유치원
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: hasBoth ? 16 : 0 }}>
            {kindergartens.slice(0, 3).map((k, i) => (
              <PoiRow
                key={i}
                item={k}
                icon={<DaycareIcon />}
                isLast={i === Math.min(kindergartens.length, 3) - 1}
              />
            ))}
          </div>
        </>
      )}

      {daycares.length > 0 && (
        <>
          {hasBoth && (
            <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 8 }}>
              어린이집
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {daycares.slice(0, 3).map((d, i) => (
              <PoiRow
                key={i}
                item={d}
                icon={<DaycareIcon />}
                isLast={i === Math.min(daycares.length, 3) - 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

type Tab = 'school' | 'hagwon' | 'daycare'

interface Props {
  data: FacilityEduData
  si?: string
}

export function EducationCard({ data, si }: Props) {
  const [tab, setTab] = useState<Tab>('school')
  const { schools, hagwons, daycares, kindergartens, hagwonStats, si: dataSi } = data
  const effectiveSi = si ?? dataSi ?? undefined

  const hasData =
    schools.length > 0 || hagwons.length > 0 ||
    daycares.length > 0 || kindergartens.length > 0

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'school',  label: '학교',           count: schools.length },
    { key: 'hagwon',  label: '학원·교육',       count: hagwons.length },
    { key: 'daycare', label: '어린이집·유치원', count: daycares.length + kindergartens.length },
  ]

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 14px' }}>
        교육 환경
      </h3>

      <div style={{
        display:      'flex',
        borderBottom: '1px solid var(--line-default)',
        marginBottom: 16,
        gap:          0,
      }}>
        {tabs.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding:       '8px 14px',
                border:        'none',
                borderBottom:  active ? '2px solid var(--dj-orange)' : '2px solid transparent',
                background:    'none',
                color:         active ? 'var(--dj-orange)' : 'var(--fg-sec)',
                font:          `${active ? 700 : 500} 13px/1 var(--font-sans)`,
                cursor:        'pointer',
                marginBottom:  -1,
                whiteSpace:    'nowrap',
              }}
            >
              {t.label}
              {(t.count ?? 0) > 0 && (
                <span style={{
                  marginLeft: 5,
                  font: '500 11px/1 var(--font-sans)',
                  color: active ? 'var(--dj-orange)' : 'var(--fg-tertiary)',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!hasData ? (
        <EmptyNote text="교육 환경 데이터를 수집 중입니다." />
      ) : (
        <>
          {tab === 'school'  && <SchoolList schools={schools} si={effectiveSi} />}
          {tab === 'hagwon'  && <HagwonSection hagwons={hagwons} stats={hagwonStats} si={effectiveSi} />}
          {tab === 'daycare' && <DaycareSection daycares={daycares} kindergartens={kindergartens} />}
        </>
      )}

      <p style={{
        font:         '500 11px/1 var(--font-sans)',
        color:        'var(--fg-tertiary)',
        marginTop:    14,
        marginBottom: 0,
        textAlign:    'right',
      }}>
        카카오맵 + 행정안전부 인허가 기준 · 반경 1~1.5km
      </p>
    </div>
  )
}
