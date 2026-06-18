'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { recommendHagwons, saveChildProfile } from '@/app/actions/hagwon'
import type { AgeGroup, SubjectCategory, FeeTier, HagwonResult } from '@/services/neis-hagwon'

// ── 상수 ───────────────────────────────────────────────────────────────────
const AGE_OPTIONS: Array<{ value: AgeGroup; label: string }> = [
  { value: '유아',   label: '유아 (0~3세)' },
  { value: '유치',   label: '유치원생 (4~6세)' },
  { value: '초등저', label: '초등 저학년 (1~3학년)' },
  { value: '초등고', label: '초등 고학년 (4~6학년)' },
  { value: '중등',   label: '중학생' },
  { value: '고등',   label: '고등학생' },
]

const SUBJECT_OPTIONS: Array<{ value: SubjectCategory; label: string }> = [
  { value: 'academic',  label: '교과·입시' },
  { value: 'arts',      label: '예체능·미술' },
  { value: 'sports',    label: '스포츠·운동' },
  { value: 'language',  label: '외국어·영어' },
]

const FEE_OPTIONS: Array<{ value: FeeTier; label: string; desc: string }> = [
  { value: 'budget',   label: '합리적', desc: '수강료 하위 20%' },
  { value: 'standard', label: '보통',   desc: '중간 수강료' },
  { value: 'premium',  label: '프리미엄', desc: '수강료 상위 30%' },
]

// ── 유틸 ───────────────────────────────────────────────────────────────────
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

// ── 칩 버튼 ────────────────────────────────────────────────────────────────
function Chip({ active, onClick, children }: {
  active:   boolean
  onClick:  () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '7px 13px',
        borderRadius: 20,
        border:       `1.5px solid ${active ? 'var(--dj-orange)' : 'var(--line-default)'}`,
        background:   active ? '#fff7f0' : 'var(--bg-surface)',
        color:        active ? 'var(--dj-orange)' : 'var(--fg-sec)',
        font:         '500 13px/1 var(--font-sans)',
        cursor:       'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ── 결과 카드 ──────────────────────────────────────────────────────────────
function HagwonCard({ item, rank }: { item: HagwonResult; rank: number }) {
  const tierLabel: Record<string, string> = {
    premium: '프리미엄', standard: '보통', budget: '합리적',
  }
  return (
    <div style={{
      display:      'flex',
      alignItems:   'flex-start',
      gap:          12,
      padding:      '12px 0',
      borderBottom: '1px solid var(--line-subtle)',
    }}>
      <div style={{
        minWidth:    28, height: 28, borderRadius: 8,
        background:  'var(--dj-orange)',
        display:     'grid', placeItems: 'center',
        flexShrink:  0,
        font:        '700 12px/1 var(--font-sans)', color: '#fff',
      }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 3 }}>
          {item.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {fmtDist(item.distance_m)}
          </span>
          {item.realm_sc_nm && (
            <span style={{
              font:         '500 11px/1 var(--font-sans)',
              color:        '#2563eb',
              background:   '#eff6ff',
              padding:      '2px 6px', borderRadius: 4,
            }}>
              {item.realm_sc_nm}
            </span>
          )}
          {item.fee_tier && (
            <span style={{
              font:       '500 11px/1 var(--font-sans)',
              color:      'var(--fg-sec)',
              background: 'var(--bg-surface-2)',
              padding:    '2px 6px', borderRadius: 4,
            }}>
              {tierLabel[item.fee_tier] ?? item.fee_tier}
            </span>
          )}
        </div>
      </div>
      <div style={{
        font:      '700 13px/1 var(--font-sans)',
        color:     'var(--dj-orange)',
        flexShrink: 0,
      }}>
        {(item.score * 100).toFixed(0)}점
      </div>
    </div>
  )
}

// ── 메인 Sheet ─────────────────────────────────────────────────────────────
export function HagwonRecommendSheet({ lat, lng, onClose }: {
  lat:     number
  lng:     number
  onClose: () => void
}) {
  const [step,        setStep]        = useState<1 | 2 | 3>(1)
  const [ageGroup,    setAgeGroup]    = useState<AgeGroup | undefined>(undefined)
  const [subjects,    setSubjects]    = useState<SubjectCategory[]>([])
  const [feeTierPref, setFeeTierPref] = useState<FeeTier | null>(null)
  const [results,     setResults]     = useState<HagwonResult[]>([])
  const [comment,     setComment]     = useState('')
  const [,   startTransition] = useTransition()

  function toggleSubject(s: SubjectCategory) {
    setSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function handleSubmit() {
    setStep(2)
    startTransition(async () => {
      const res = await recommendHagwons({
        lat, lng, ageGroup, subjects, feeTierPref,
      })
      if ('error' in res) {
        setResults([])
        setComment('추천 결과를 불러오는 중 오류가 발생했습니다.')
      } else {
        setResults(res.results)
        setComment(res.comment)
        // 자녀 프로필 저장 (비동기, 실패해도 UX 방해 안 함)
        if (ageGroup) {
          saveChildProfile({
            nickname:      '내 자녀',
            age_group:     ageGroup,
            subject_prefs: subjects,
            fee_tier_pref: feeTierPref,
          }).catch(() => {})
        }
      }
      setStep(3)
    })
  }

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

        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px 14px',
          borderBottom: step === 1 ? '1px solid var(--line-subtle)' : 'none',
        }}>
          <div>
            <h2 style={{ font: '700 17px/1.3 var(--font-sans)', margin: '0 0 2px', color: 'var(--fg-pri)' }}>
              내 아이 맞춤 학원 추천
            </h2>
            {step === 1 && (
              <p style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                자녀 정보를 입력하면 근처 학원을 추천해 드려요
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--bg-surface-2)', border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              color: 'var(--fg-sec)', font: '500 15px/1 var(--font-sans)',
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Step 1: 프로필 입력 ── */}
        {step === 1 && (
          <div style={{ padding: '20px 20px 0' }}>
            <section aria-labelledby="age-section">
              <h3 id="age-section" style={{ font: '600 14px/1 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                자녀 연령
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {AGE_OPTIONS.map(opt => (
                  <Chip
                    key={opt.value}
                    active={ageGroup === opt.value}
                    onClick={() => setAgeGroup(ageGroup === opt.value ? undefined : opt.value)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section aria-labelledby="subject-section">
              <h3 id="subject-section" style={{ font: '600 14px/1 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                관심 과목 <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>(복수 선택)</span>
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {SUBJECT_OPTIONS.map(opt => (
                  <Chip
                    key={opt.value}
                    active={subjects.includes(opt.value)}
                    onClick={() => toggleSubject(opt.value)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </section>

            <section aria-labelledby="fee-section">
              <h3 id="fee-section" style={{ font: '600 14px/1 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                수강료 선호 <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>(선택)</span>
              </h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {FEE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFeeTierPref(feeTierPref === opt.value ? null : opt.value)}
                    style={{
                      flex:         1,
                      padding:      '10px 8px',
                      borderRadius: 12,
                      border:       `1.5px solid ${feeTierPref === opt.value ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                      background:   feeTierPref === opt.value ? '#fff7f0' : 'var(--bg-surface)',
                      cursor:       'pointer',
                      textAlign:    'center',
                    }}
                  >
                    <div style={{ font: '600 13px/1.3 var(--font-sans)', color: feeTierPref === opt.value ? 'var(--dj-orange)' : 'var(--fg-pri)' }}>
                      {opt.label}
                    </div>
                    <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 3 }}>
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <button
              onClick={handleSubmit}
              style={{
                width:        '100%',
                padding:      '14px 0',
                borderRadius: 12,
                background:   'var(--dj-orange)',
                color:        '#fff',
                font:         '700 15px/1 var(--font-sans)',
                border:       'none',
                cursor:       'pointer',
                marginBottom: 20,
              }}
            >
              학원 추천받기
            </button>
          </div>
        )}

        {/* ── Step 2: 로딩 ── */}
        {step === 2 && (
          <div style={{
            padding: '60px 20px', textAlign: 'center',
          }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid var(--line-default)',
              borderTopColor: 'var(--dj-orange)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-sec)', margin: 0 }}>
              근처 학원을 분석 중입니다…
            </p>
          </div>
        )}

        {/* ── Step 3: 결과 ── */}
        {step === 3 && (
          <div style={{ padding: '16px 20px 0' }}>
            {comment && (
              <div style={{
                padding:      '14px 16px',
                background:   'var(--bg-surface-2)',
                borderRadius: 12,
                marginBottom: 16,
              }}>
                <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-pri)', margin: 0 }}>
                  {comment}
                </p>
              </div>
            )}

            {results.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center' }}>
                <p style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                  반경 2km 내 조건에 맞는 학원이 없습니다.
                </p>
              </div>
            ) : (
              <div>
                {results.map((item, i) => (
                  <HagwonCard key={item.id} item={item} rank={i + 1} />
                ))}
              </div>
            )}

            <button
              onClick={() => { setStep(1); setResults([]); setComment('') }}
              style={{
                width:        '100%',
                padding:      '12px 0',
                borderRadius: 12,
                background:   'var(--bg-surface-2)',
                color:        'var(--fg-sec)',
                font:         '600 14px/1 var(--font-sans)',
                border:       'none',
                cursor:       'pointer',
                margin:       '16px 0 20px',
              }}
            >
              조건 다시 설정
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
