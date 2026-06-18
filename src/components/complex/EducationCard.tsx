'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import type { FacilityEduData, SchoolItem, PoiItem } from '@/lib/data/facility-edu'
import { classifyHagwon, walkColor, WALK_COLOR_HEX } from '@/lib/hagwon-category'
import { fetchSchoolRanking } from '@/app/actions/education'
import type { SchoolRankingItem } from '@/app/actions/education'
import { HagwonRecommendSheet } from '@/components/complex/HagwonRecommendSheet'

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

function SchoolIcon({ color }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2">
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

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function BuildingIcon({ color }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01" />
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

function fmtPy(manwonPerPy: number): string {
  return `${Math.round(manwonPerPy).toLocaleString()}만원`
}

const SCHOOL_TYPE_LABEL: Record<string, string> = {
  elementary: '초등학교',
  middle:     '중학교',
  high:       '고등학교',
}

const SCHOOL_TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  elementary: { color: '#15803d', bg: '#dcfce7' },
  middle:     { color: '#1d4ed8', bg: '#dbeafe' },
  high:       { color: '#7c3aed', bg: '#ede9fe' },
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

// ─── 백분위 바 ─────────────────────────────────────────────────────────────

function PercentileBar({
  percentile,
  leftLabel,
  rightLabel,
  goodSide,
  siLabel,
}: {
  percentile: number
  leftLabel:  string
  rightLabel: string
  goodSide:   'left' | 'right'
  siLabel?:   string
}) {
  const dotPos = goodSide === 'left' ? 1 - percentile : percentile
  const pct    = Math.round(percentile * 100)
  const color  = percentile >= 0.6 ? '#16a34a' : percentile >= 0.3 ? '#d97706' : '#dc2626'
  const city   = siLabel ?? '지역'

  let summary: string
  if (goodSide === 'left') {
    summary = percentile >= 0.6
      ? `${city} 소규모 상위 ${pct}%`
      : percentile >= 0.3
        ? `${city} 보통 수준`
        : `${city} 과밀 (소규모 하위 ${pct}%)`
  } else {
    summary = percentile >= 0.6
      ? `${city} 상위 ${pct}%`
      : percentile >= 0.3
        ? `${city} 보통 수준`
        : `${city} 하위 ${100 - pct}%`
  }

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
        marginBottom: 5,
      }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: '#e5e7eb', borderRadius: 3, margin: '0 6px' }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${dotPos * 100}%`,
          background: `${color}40`,
          borderRadius: '3px 0 0 3px',
        }} />
        <div style={{
          position: 'absolute',
          left: `${dotPos * 100}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14,
          background: '#fff',
          border: `3px solid ${color}`,
          borderRadius: '50%',
          boxShadow: `0 0 0 2px ${color}30`,
        }} />
      </div>
      <div style={{
        font: '600 11px/1 var(--font-sans)', color,
        marginTop: 6, textAlign: 'center',
      }}>
        {summary}
      </div>
    </div>
  )
}

// ─── 미니 수평 바 (대학 진학률 구성 표시용) ────────────────────────────────

function MiniBar({ value, max, color, label, sublabel }: {
  value:    number
  max:      number
  color:    string
  label:    string
  sublabel: string
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 48, font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ width: 36, font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'right', flexShrink: 0 }}>
        {sublabel}
      </div>
    </div>
  )
}

// ─── 섹션 헤더 ─────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      font: '600 10px/1 var(--font-sans)',
      color: 'var(--fg-tertiary)',
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      marginBottom: 14,
    }}>
      {text}
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr>
      <td style={{ font: '500 12px/1.8 var(--font-sans)', color: 'var(--fg-tertiary)', paddingRight: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
      <td style={{ font: highlight ? '600 12px/1.8 var(--font-sans)' : '500 12px/1.8 var(--font-sans)', color: 'var(--fg-pri)' }}>{value}</td>
    </tr>
  )
}

// ─── 수치 카드 ─────────────────────────────────────────────────────────────

function StatCard({
  label, sublabel, value, unit, note,
}: {
  label:     string
  sublabel?: string
  value:     string | number
  unit:      string
  note?:     string
}) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--bg-surface-2)',
      borderRadius: 10,
    }}>
      <div style={{ font: '600 12px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>{label}</div>
      {sublabel && (
        <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>{sublabel}</div>
      )}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ font: '800 20px/1 var(--font-sans)', color: 'var(--fg-pri)', letterSpacing: '-0.5px' }}>
          {value}
        </span>
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{unit}</span>
      </div>
      {note && (
        <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 4 }}>{note}</div>
      )}
    </div>
  )
}

// ─── 학교 상세 바텀 시트 ───────────────────────────────────────────────────

function SchoolDetailSheet({ school, si, onClose }: {
  school:  SchoolItem
  si?:     string
  onClose: () => void
}) {
  const typeLabel = SCHOOL_TYPE_LABEL[school.school_type] ?? school.school_type
  const typeColor = SCHOOL_TYPE_COLOR[school.school_type]
  const wc        = walkColor(school.distance_m)

  const hasBasicInfo    = school.establishment_type != null || school.total_students != null || school.special_class_count != null || school.class_count != null || school.road_address != null
  const hasQuality      = (school.students_per_class != null && school.students_percentile != null) || school.teachers_ratio != null
  const hasMiddleAdv    = school.school_type === 'middle' && school.advancement_rate != null
  const hasHighUniv     = school.school_type === 'high'   && school.univ_rate != null
  const hasPricePremium = school.is_assignment && !!school.district_avg_py && !!school.si_avg_py

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }}
      />

      <div style={{
        position:      'fixed',
        bottom:        0, left: 0, right: 0,
        background:    'var(--bg-surface)',
        borderRadius:  '20px 20px 0 0',
        zIndex:        201,
        maxHeight:     '90vh',
        overflowY:     'auto',
        boxShadow:     '0 -8px 40px rgba(0,0,0,0.15)',
        paddingBottom: 'env(safe-area-inset-bottom, 20px)',
      }}>
        {/* 드래그 핸들 */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--line-default)' }} />
        </div>

        {/* ── 헤더 ── */}
        <div style={{ padding: '12px 20px 16px', borderBottom: '1px solid var(--line-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0,
              background: typeColor?.bg ?? 'var(--bg-surface-2)',
              display: 'grid', placeItems: 'center',
              color: typeColor?.color ?? 'var(--fg-sec)',
            }}>
              <SchoolIcon color={typeColor?.color} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ font: '700 18px/1.3 var(--font-sans)', margin: '0 0 6px', color: 'var(--fg-pri)' }}>
                {school.school_name}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  font: '600 11px/1 var(--font-sans)',
                  color: typeColor?.color, background: typeColor?.bg,
                  padding: '3px 7px', borderRadius: 4,
                }}>
                  {typeLabel}
                </span>
                {school.is_assignment && (
                  <span style={{
                    font: '600 11px/1 var(--font-sans)',
                    color: '#2563eb', background: '#eff6ff',
                    padding: '3px 7px', borderRadius: 4,
                  }}>
                    배정학교
                  </span>
                )}
                {school.distance_m != null && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    font: '500 11px/1 var(--font-sans)', color: WALK_COLOR_HEX[wc],
                  }}>
                    <WalkIcon color={WALK_COLOR_HEX[wc]} />
                    {fmtDist(school.distance_m)} · {fmtWalk(school.distance_m)}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, flexShrink: 0,
                display: 'grid', placeItems: 'center',
                border: 'none', background: 'var(--bg-surface-2)',
                borderRadius: 8, cursor: 'pointer',
                color: 'var(--fg-sec)', font: '500 18px/1 var(--font-sans)',
              }}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── 기본정보 테이블 ── */}
        {hasBasicInfo && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line-subtle)' }}>
            <div style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', letterSpacing: '0.05em', marginBottom: 10 }}>
              기본정보{school.data_year != null ? ` · ${school.data_year}년 공시` : ''}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {school.establishment_type && (
                  <InfoRow label="설립구분" value={school.establishment_type} highlight={true} />
                )}
                {school.class_count != null && (
                  <InfoRow label="학급 수" value={`${school.class_count}개`} />
                )}
                {school.total_students != null && (
                  <InfoRow label="학생 수" value={`${school.total_students.toLocaleString()}명`} />
                )}
                {school.students_per_class != null && (
                  <InfoRow label="학급당 학생수" value={`${school.students_per_class}명`} />
                )}
                {school.special_class_count != null && (
                  <InfoRow label="특수학급 수" value={`${school.special_class_count}개`} />
                )}
                {school.road_address && (
                  <InfoRow label="주소" value={school.road_address.replace(/^경상남도 /, '')} />
                )}
                {school.phone && (
                  <tr>
                    <td style={{ font: '500 12px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)', paddingRight: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>대표번호</td>
                    <td>
                      <a href={`tel:${school.phone}`} style={{ font: '500 12px/1.6 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}>
                        {school.phone}
                      </a>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 학교 환경 지표 ── */}
        {hasQuality && (
          <div style={{
            padding: '18px 20px',
            borderBottom: (hasMiddleAdv || hasHighUniv || hasPricePremium) ? '1px solid var(--line-subtle)' : 'none',
          }}>
            <SectionLabel text="학교 환경" />

            {/* 학급당 학생수 — 지역 백분위 비교 */}
            {school.students_per_class != null && school.students_percentile != null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 10 }}>
                  학급당 학생수 지역 비교
                </div>
                <PercentileBar
                  percentile={school.students_percentile}
                  leftLabel="소규모 (좋음)"
                  rightLabel="과밀 (나쁨)"
                  goodSide="left"
                  siLabel={si}
                />
              </div>
            )}

            {/* 교원 1인당 학생수 */}
            {school.teachers_ratio != null && (
              <StatCard
                label="수업교원 1인당 학생수"
                sublabel="교원 수업 부담 지표"
                value={school.teachers_ratio}
                unit="명"
              />
            )}
          </div>
        )}

        {/* ── 중학교: 고등학교 진학 분석 ── */}
        {hasMiddleAdv && (
          <div style={{
            padding: '18px 20px',
            borderBottom: hasPricePremium ? '1px solid var(--line-subtle)' : 'none',
          }}>
            <SectionLabel text="고등학교 진학 · 2025년 학교알리미" />

            {/* 전체 진학률 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>고등학교 진학률</span>
                <span style={{ font: '800 22px/1 var(--font-sans)', color: 'var(--fg-pri)', letterSpacing: '-0.5px' }}>
                  {school.advancement_rate!.toFixed(1)}
                  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', marginLeft: 2 }}>%</span>
                </span>
              </div>
              {school.advancement_percentile != null && (
                <PercentileBar
                  percentile={school.advancement_percentile}
                  leftLabel="낮음"
                  rightLabel="높음 (좋음)"
                  goodSide="right"
                  siLabel={si}
                />
              )}
            </div>

            {/* 특목고·자사고 진학 세부 */}
            {(school.advancement_science != null || school.advancement_foreign != null || school.advancement_private != null) && (
              <div style={{ padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 10 }}>
                <div style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 12, letterSpacing: '0.04em' }}>
                  특목고 · 자사고 진학률
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {school.advancement_science != null && (
                    <MiniBar
                      label="과학고"
                      value={school.advancement_science}
                      max={10}
                      color="#1d4ed8"
                      sublabel={`${school.advancement_science.toFixed(1)}%`}
                    />
                  )}
                  {school.advancement_foreign != null && (
                    <MiniBar
                      label="외고·국제"
                      value={school.advancement_foreign}
                      max={10}
                      color="#0369a1"
                      sublabel={`${school.advancement_foreign.toFixed(1)}%`}
                    />
                  )}
                  {school.advancement_private != null && (
                    <MiniBar
                      label="자사고"
                      value={school.advancement_private}
                      max={10}
                      color="#7c3aed"
                      sublabel={`${school.advancement_private.toFixed(1)}%`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 고등학교: 대학 진학 분석 ── */}
        {hasHighUniv && (
          <div style={{
            padding: '18px 20px',
            borderBottom: hasPricePremium ? '1px solid var(--line-subtle)' : 'none',
          }}>
            <SectionLabel text="대학 진학 · 2025년 학교알리미" />

            {/* 전체 진학률 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>대학 진학률</span>
                <span style={{ font: '800 26px/1 var(--font-sans)', color: 'var(--fg-pri)', letterSpacing: '-0.5px' }}>
                  {school.univ_rate!.toFixed(1)}
                  <span style={{ font: '500 14px/1 var(--font-sans)', color: 'var(--fg-sec)', marginLeft: 2 }}>%</span>
                </span>
              </div>
              {school.advancement_percentile != null && (
                <PercentileBar
                  percentile={school.advancement_percentile}
                  leftLabel="낮음"
                  rightLabel="높음 (좋음)"
                  goodSide="right"
                  siLabel={si}
                />
              )}
            </div>

            {/* 4년제 vs 전문대 구성 바 */}
            {(school.univ_4year_rate != null || school.univ_2year_rate != null) && (
              <div style={{ padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 10 }}>
                <div style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 12, letterSpacing: '0.04em' }}>
                  진학 유형 구성
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {school.univ_4year_rate != null && (
                    <MiniBar
                      label="4년제"
                      value={school.univ_4year_rate}
                      max={100}
                      color="#7c3aed"
                      sublabel={`${school.univ_4year_rate.toFixed(1)}%`}
                    />
                  )}
                  {school.univ_2year_rate != null && (
                    <MiniBar
                      label="전문대"
                      value={school.univ_2year_rate}
                      max={100}
                      color="#a78bfa"
                      sublabel={`${school.univ_2year_rate.toFixed(1)}%`}
                    />
                  )}
                </div>

                {/* 4년제 + 전문대 합계 확인 */}
                {school.univ_4year_rate != null && school.univ_2year_rate != null && (
                  <div style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--line-subtle)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>4년제 + 전문대</span>
                    <span style={{ font: '700 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                      {(school.univ_4year_rate + school.univ_2year_rate).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 학군 부동산 ── */}
        {hasPricePremium && (
          <div style={{ padding: '18px 20px' }}>
            <SectionLabel text="학군 부동산 · 최근 12개월 평균" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <BuildingIcon color="var(--fg-tertiary)" />
                  <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>학군 평균</span>
                </div>
                <div style={{ font: '700 17px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
                  {fmtPy(school.district_avg_py!)}
                </div>
                <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 3 }}>/평</div>
              </div>

              <div style={{
                padding: '14px 16px', borderRadius: 12,
                background: school.price_premium != null && school.price_premium >= 5 ? '#f0fdf4'
                  : school.price_premium != null && school.price_premium <= -5 ? '#fef2f2'
                  : 'var(--bg-surface-2)',
              }}>
                <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 8 }}>
                  {si ?? '시'} 평균 대비
                </div>
                <div style={{
                  font: '700 20px/1 var(--font-sans)',
                  color: school.price_premium != null && school.price_premium >= 5 ? '#15803d'
                    : school.price_premium != null && school.price_premium <= -5 ? '#dc2626'
                    : 'var(--fg-pri)',
                }}>
                  {school.price_premium != null
                    ? `${school.price_premium > 0 ? '+' : ''}${school.price_premium}%`
                    : '-'}
                </div>
                <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  {si ?? '시'} {fmtPy(school.si_avg_py!)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 바로가기 버튼 ── */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line-subtle)', display: 'flex', gap: 8 }}>
          {school.phone && (
            <a
              href={`tel:${school.phone}`}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: '1px solid var(--line-default)',
                background: 'var(--bg-surface)',
                font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)',
                textAlign: 'center', textDecoration: 'none',
                display: 'block',
              }}
            >
              {school.phone}
            </a>
          )}
          {school.homepage_url && (
            <a
              href={school.homepage_url.startsWith('http') ? school.homepage_url : `https://${school.homepage_url}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: '1px solid var(--line-default)',
                background: 'var(--bg-surface)',
                font: '600 12px/1 var(--font-sans)', color: '#2563eb',
                textAlign: 'center', textDecoration: 'none',
                display: 'block',
              }}
            >
              학교 홈페이지
            </a>
          )}
          <a
            href={
              school.school_code
                ? `https://www.schoolinfo.go.kr/ei/ss/Pneiss_a_list01.do?schulCode=${school.school_code}`
                : 'https://www.schoolinfo.go.kr'
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8,
              border: '1px solid var(--line-default)',
              background: 'var(--bg-surface)',
              font: '600 12px/1 var(--font-sans)', color: '#2563eb',
              textAlign: 'center', textDecoration: 'none',
              display: 'block',
            }}
          >
            학교알리미
          </a>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── SchoolRankingSheet ────────────────────────────────────────────────────

const RANK_COLOR = (rank: number) =>
  rank === 1 ? '#b45309' : rank === 2 ? '#4b5563' : rank === 3 ? '#92400e' : 'var(--fg-tertiary)'

function SchoolRankingSheet({ si, schoolType, onClose }: {
  si:         string
  schoolType: 'elementary' | 'middle' | 'high'
  onClose:    () => void
}) {
  const [gu, setGu]         = useState('전체')
  const [data, setData]     = useState<SchoolRankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [, startTransition]  = useTransition()

  const metric = schoolType === 'elementary' ? 'students_per_class'
               : schoolType === 'middle'     ? 'special'
               : 'univ_rate'

  const metricLabel = schoolType === 'elementary' ? '소규모(학급당학생수 낮은) 순'
                    : schoolType === 'middle'     ? '특목·자사고 진학률 순'
                    : '대학 진학률 순'

  const unit = schoolType === 'elementary' ? '명' : '%'

  useEffect(() => {
    setLoading(true)
    setGu('전체')
    startTransition(async () => {
      const result = await fetchSchoolRanking(si, schoolType, metric)
      setData(result)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [si, schoolType, metric])

  const GU_LIST = si === '창원시'
    ? ['전체', '의창구', '성산구', '마산합포구', '마산회원구', '진해구']
    : ['전체']

  type DisplayItem = SchoolRankingItem & { cityRank?: number }
  const filteredRaw = gu === '전체' ? data : data.filter(d => d.gu === gu)
  const filtered: DisplayItem[] = gu !== '전체'
    ? filteredRaw.map((item, idx) => ({ ...item, cityRank: item.rank, rank: idx + 1 }))
    : filteredRaw

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-surface)',
        borderRadius: '20px 20px 0 0',
        zIndex: 201, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        paddingBottom: 'env(safe-area-inset-bottom, 20px)',
      }}>
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--line-default)' }} />
        </div>

        <div style={{ padding: '12px 20px 14px', borderBottom: '1px solid var(--line-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ font: '700 17px/1.3 var(--font-sans)', margin: '0 0 4px', color: 'var(--fg-pri)' }}>
              {si} {SCHOOL_TYPE_LABEL[schoolType]} 순위
            </h2>
            <p style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              {metricLabel} · 2025년 학교알리미 공시
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, border: 'none', background: 'var(--bg-surface-2)', borderRadius: 8, cursor: 'pointer', color: 'var(--fg-sec)', font: '500 18px/1 var(--font-sans)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
            aria-label="닫기"
          >×</button>
        </div>

        {si === '창원시' && (
          <div style={{ display: 'flex', gap: 4, padding: '10px 20px', overflowX: 'auto', borderBottom: '1px solid var(--line-subtle)' }}>
            {GU_LIST.map(g => (
              <button
                key={g}
                onClick={() => setGu(g)}
                style={{
                  padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
                  border: `1px solid ${gu === g ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                  background: gu === g ? '#fff5ed' : 'var(--bg-surface)',
                  color: gu === g ? 'var(--dj-orange)' : 'var(--fg-sec)',
                  font: '600 12px/1 var(--font-sans)', cursor: 'pointer',
                }}
              >{g}</button>
            ))}
          </div>
        )}

        <div style={{ padding: '4px 20px 20px' }}>
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              순위 계산 중...
            </div>
          ) : filtered.length === 0 ? (
            <EmptyNote text="해당 지역 데이터가 없습니다." />
          ) : (
            filtered.map((item, i) => {
              const isTop3  = item.rank <= 3
              const rankBg  = item.rank === 1 ? '#fef3c7' : item.rank === 2 ? '#f3f4f6' : item.rank === 3 ? '#fef9f0' : 'transparent'
              const rColor  = RANK_COLOR(item.rank)
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 0',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                  }}
                >
                  <div style={{
                    minWidth: 28, height: 28, borderRadius: 7,
                    background: rankBg,
                    border: isTop3 ? `1px solid ${rColor}40` : '1px solid transparent',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <span style={{ font: isTop3 ? '700 14px/1' : '600 12px/1', color: rColor }}>
                      {item.rank}
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.school_name}
                    </div>
                    {gu === '전체' ? (
                      item.gu && (
                        <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                          {item.gu}
                        </div>
                      )
                    ) : (
                      item.cityRank != null && (
                        <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                          {si} 전체 {item.cityRank}위
                        </div>
                      )
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ font: '700 16px/1 var(--font-sans)', color: isTop3 ? rColor : 'var(--fg-pri)' }}>
                      {schoolType === 'elementary'
                        ? `${item.metric_value}${unit}`
                        : `${Number(item.metric_value).toFixed(1)}${unit}`}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: '0 20px 8px', textAlign: 'center' }}>
          <p style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
            학교알리미 공시 데이터 기준 · 단지온도 집계
          </p>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── SchoolList ────────────────────────────────────────────────────────────

function SchoolList({ schools, si, gu }: { schools: SchoolItem[]; si?: string; gu?: string }) {
  const [schoolTab, setSchoolTab]           = useState<'elementary' | 'middle' | 'high'>('elementary')
  const [selectedSchool, setSelectedSchool] = useState<SchoolItem | null>(null)
  const [showRanking, setShowRanking]       = useState(false)

  const filtered = schools
    .filter(s => s.school_type === schoolTab)
    .sort((a, b) => {
      if (a.is_assignment !== b.is_assignment) return a.is_assignment ? -1 : 1
      return (a.distance_m ?? 99999) - (b.distance_m ?? 99999)
    })
    .slice(0, 4)

  return (
    <div>
      {/* 학교급 탭 + 순위 버튼 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center' }}>
        {(['elementary', 'middle', 'high'] as const).map(type => {
          const count  = schools.filter(s => s.school_type === type).length
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
        {si && (
          <button
            onClick={() => setShowRanking(true)}
            style={{
              marginLeft:   'auto',
              padding:      '5px 10px',
              borderRadius: 6,
              border:       '1px solid var(--dj-orange)',
              background:   '#fff5ed',
              color:        'var(--dj-orange)',
              font:         '600 12px/1 var(--font-sans)',
              cursor:       'pointer',
              flexShrink:   0,
            }}
          >
            {(gu ?? si)} {SCHOOL_TYPE_LABEL[schoolTab]} 순위보기
          </button>
        )}
      </div>

      {/* 학교 목록 */}
      {filtered.length === 0 ? (
        <EmptyNote text="반경 1.5km 내 해당 학교가 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((s, i) => {
            const wc          = walkColor(s.distance_m)
            const typeColor   = SCHOOL_TYPE_COLOR[s.school_type]
            // 학교급별 메인 지표 표시
            // 중학교: 과학고+외고+자사고 합계 (전체 진학률은 100%라 오해 소지)
            const middleSpecialSum = s.school_type === 'middle'
              ? (s.advancement_science ?? 0) + (s.advancement_foreign ?? 0) + (s.advancement_private ?? 0)
              : null
            const showMiddleTag = middleSpecialSum != null && middleSpecialSum > 0
            const highTag       = s.school_type === 'high' && s.univ_rate != null

            return (
              <button
                key={i}
                onClick={() => setSelectedSchool(s)}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          10,
                  padding:      '11px 6px',
                  background:   'none',
                  border:       'none',
                  borderTop:    i === 0 ? 'none' : '1px solid var(--line-subtle)',
                  cursor:       'pointer',
                  textAlign:    'left',
                  width:        '100%',
                  borderRadius: 8,
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: typeColor?.bg ?? 'var(--bg-surface-2)',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0,
                }}>
                  <SchoolIcon color={typeColor?.color} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>
                      {s.school_name}
                    </span>
                    {s.is_assignment && (
                      <span style={{
                        font: '600 10px/1 var(--font-sans)',
                        color: '#2563eb', background: '#eff6ff',
                        padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                      }}>
                        배정
                      </span>
                    )}
                    {s.is_assignment && s.price_premium != null && Math.abs(s.price_premium) >= 5 && (
                      <span style={{
                        font:       '600 10px/1 var(--font-sans)',
                        color:      s.price_premium > 0 ? '#15803d' : '#9ca3af',
                        background: s.price_premium > 0 ? '#dcfce7' : '#f9fafb',
                        padding:    '2px 5px', borderRadius: 4, flexShrink: 0,
                      }}>
                        {si ?? '지역'} 대비 {s.price_premium > 0 ? '+' : ''}{s.price_premium}%
                      </span>
                    )}
                  </div>
                  <div style={{
                    font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
                    marginTop: 3, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ color: WALK_COLOR_HEX[wc] }}>{fmtDist(s.distance_m)}</span>
                    {s.students_per_class != null && (
                      <>
                        <span>·</span>
                        <span>학급당 {s.students_per_class}명</span>
                      </>
                    )}
                    {showMiddleTag && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#1d4ed8' }}>특목·자사고 {middleSpecialSum!.toFixed(1)}%</span>
                      </>
                    )}
                    {highTag && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#7c3aed' }}>대입 {s.univ_rate!.toFixed(1)}%</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ color: 'var(--fg-tertiary)', flexShrink: 0 }}>
                  <ChevronRightIcon />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedSchool && (
        <SchoolDetailSheet
          school={selectedSchool}
          si={si}
          onClose={() => setSelectedSchool(null)}
        />
      )}

      {showRanking && si && (
        <SchoolRankingSheet
          si={si}
          schoolType={schoolTab}
          onClose={() => setShowRanking(false)}
        />
      )}
    </div>
  )
}

// ─── HagwonSection ────────────────────────────────────────────────────────

function HagwonSection({ hagwons, stats, si, lat, lng }: {
  hagwons: PoiItem[]
  stats:   FacilityEduData['hagwonStats']
  si?:     string
  lat?:    number
  lng?:    number
}) {
  const [expanded,    setExpanded]    = useState(false)
  const [showRecommend, setShowRecommend] = useState(false)

  if (!stats && hagwons.length === 0) {
    return (
      <div>
        <EmptyNote text="학원 데이터를 수집 중입니다." />
        {lat != null && lng != null && (
          <>
            <button
              onClick={() => setShowRecommend(true)}
              style={{
                width:        '100%',
                padding:      '11px 0',
                borderRadius: 10,
                border:       '1.5px solid var(--dj-orange)',
                background:   '#fff7f0',
                color:        'var(--dj-orange)',
                font:         '600 13px/1 var(--font-sans)',
                cursor:       'pointer',
                marginTop:    16,
              }}
            >
              내 아이 맞춤 학원 추천 받기
            </button>
            {showRecommend && (
              <HagwonRecommendSheet lat={lat} lng={lng} onClose={() => setShowRecommend(false)} />
            )}
          </>
        )}
      </div>
    )
  }

  const INITIAL_LIMIT  = 8
  const visibleHagwons = expanded ? hagwons : hagwons.slice(0, INITIAL_LIMIT)
  const grade  = stats?.grade ?? 'D'
  const above  = stats ? 100 - stats.percentile : null
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
            minWidth: 52, height: 48, borderRadius: 12, padding: '0 8px',
            background: GRADE_COLOR[grade],
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <span style={{ font: '800 20px/1 var(--font-sans)', color: '#fff', letterSpacing: '-0.5px' }}>
              {grade}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: '700 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 3 }}>
              학원 밀도 {grade}등급
              {above !== null && (
                <span style={{ marginLeft: 8, font: '500 12px/1 var(--font-sans)', color: GRADE_COLOR[grade] }}>
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
            const cat      = classifyHagwon(h.poi_name)
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

      {lat != null && lng != null && (
        <>
          <button
            onClick={() => setShowRecommend(true)}
            style={{
              width:        '100%',
              padding:      '11px 0',
              borderRadius: 10,
              border:       '1.5px solid var(--dj-orange)',
              background:   '#fff7f0',
              color:        'var(--dj-orange)',
              font:         '600 13px/1 var(--font-sans)',
              cursor:       'pointer',
              marginTop:    16,
            }}
          >
            내 아이 맞춤 학원 추천 받기
          </button>
          {showRecommend && (
            <HagwonRecommendSheet lat={lat} lng={lng} onClose={() => setShowRecommend(false)} />
          )}
        </>
      )}
    </div>
  )
}

// ─── DaycareSection ───────────────────────────────────────────────────────

function DaycareSection({ daycares, kindergartens }: {
  daycares:      PoiItem[]
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
  si?:  string
  gu?:  string
  lat?: number
  lng?: number
}

export function EducationCard({ data, si, gu, lat, lng }: Props) {
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

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line-default)', marginBottom: 16 }}>
        {tabs.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding:      '8px 14px',
                border:       'none',
                borderBottom: active ? '2px solid var(--dj-orange)' : '2px solid transparent',
                background:   'none',
                color:        active ? 'var(--dj-orange)' : 'var(--fg-sec)',
                font:         `${active ? 700 : 500} 13px/1 var(--font-sans)`,
                cursor:       'pointer',
                marginBottom: -1,
                whiteSpace:   'nowrap',
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
          {tab === 'school'  && <SchoolList schools={schools} si={effectiveSi} gu={gu} />}
          {tab === 'hagwon'  && <HagwonSection hagwons={hagwons} stats={hagwonStats} si={effectiveSi} lat={lat} lng={lng} />}
          {tab === 'daycare' && <DaycareSection daycares={daycares} kindergartens={kindergartens} />}
        </>
      )}

      <p style={{
        font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
        marginTop: 14, marginBottom: 0, textAlign: 'right',
      }}>
        카카오맵 + 행정안전부 인허가 기준 · 반경 1~1.5km
      </p>
    </div>
  )
}
