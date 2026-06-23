'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { recommendHagwons, saveChildProfile } from '@/app/actions/hagwon'
import type { AgeGroup, SubjectCategory, FeeTier, SchoolOption } from '@/services/neis-hagwon'
import { SUBJECT_LABELS, FEE_LABELS } from '@/services/neis-hagwon'
import type { ComboResult, RouteStep } from '@/lib/hagwon-route'
import type { SchoolItem } from '@/lib/data/facility-edu'

// ── 상수 ──────────────────────────────────────────────────────────────────────
const AGE_OPTIONS: Array<{ value: AgeGroup; label: string }> = [
  { value: '유아',   label: '유아 (0~3세)' },
  { value: '유치',   label: '유치원생 (4~6세)' },
  { value: '초등저', label: '초등 저학년 (1~3학년)' },
  { value: '초등고', label: '초등 고학년 (4~6학년)' },
  { value: '중등',   label: '중학생' },
  { value: '고등',   label: '고등학생' },
]

const SUBJECT_OPTIONS: Array<{ value: SubjectCategory; label: string }> = [
  { value: 'exam_prep',      label: '입시' },
  { value: 'korean',         label: '국어' },
  { value: 'math',           label: '수학' },
  { value: 'english',        label: '영어' },
  { value: 'arts',           label: '미술·예체능' },
  { value: 'sports',         label: '스포츠·운동' },
  { value: 'other_language', label: '기타 외국어' },
]

const FEE_OPTIONS: Array<{ value: FeeTier; label: string; desc: string }> = [
  { value: 'budget',   label: '합리적',   desc: '하위 20%' },
  { value: 'standard', label: '보통',     desc: '중간 수준' },
  { value: 'premium',  label: '프리미엄', desc: '상위 30%' },
]

// 나이별 선택 가능한 학교 종류
const AGE_SCHOOL_TYPE: Partial<Record<AgeGroup, SchoolItem['school_type'][]>> = {
  '초등저': ['elementary'],
  '초등고': ['elementary'],
  '중등':   ['middle'],
  '고등':   ['high'],
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

// AI 코멘트를 문장 단위로 분리
function splitAIComment(text: string): string[] {
  const trimmed = text.trim()
  const byLine = trimmed.split('\n').map(s => s.trim()).filter(Boolean)
  if (byLine.length > 1) return byLine
  // 마침표·느낌표·물음표 기준 분리 (한국어 포함)
  const sentences = trimmed.match(/[^.!?！？]+[.!?！？]+/g) ?? [trimmed]
  return sentences.map(s => s.trim()).filter(s => s.length > 5)
}

// 블로그 스니펫에서 실제 사용자 후기 문장 추출 — 점수 기반 선택
const REVIEW_TITLE_RE = /후기|리뷰|방문|다녀온|다닌|수강/
const REVIEW_KW = ['선생님', '수업', '아이', '성적', '학생', '실력', '공부', '추천', '만족', '결과', '좋아', '꼼꼼', '체계', '집중', '관리', '친절', '열심', '도움', '덕분']

// 홍보/정보성 패턴 (마스킹된 전화·층수·주소·주소 리스트 포함)
const PROMO_RE = /문의|연락주|상담|전화주|주소:|영업시간|등록번호|수강료|\d{2,3}-[\d*]{3,6}|\d+층\b|\d+호\b|아파트\s*\d|번\s*길\s*\d|http|@\w/

// 진짜 사용자 후기 신호로 점수 매기기
function scoreQuote(s: string): number {
  let score = 0
  // 1인칭/가족 시점 — 진짜 체험 후기의 가장 강한 신호
  if (/저는|저도|제가|저한테|우리\s*아이|저희\s*아이|딸이|딸아이|아들이|아이가\s/.test(s)) score += 4
  // 긍정 평가 표현 ("너무 좋아요", "꼼꼼해요" 등)
  if (/너무\s*(좋|꼼꼼|친절|열정|만족)|정말\s*(좋|꼼꼼|친절)|강추|꼼꼼해|친절해|열정적|만족스/.test(s)) score += 3
  // 결과·경험 언급
  if (/올랐|늘었|향상|도움이\s*됐|덕분에|좋아졌|이해됐/.test(s)) score += 3
  // 선생님/원장님 언급 (구체적 정보)
  if (/선생님|원장님|강사님/.test(s)) score += 1
  // 한국어 종결 어미 — 완결된 문장 신호
  if (/[요]$/.test(s)) score += 1
  // 짧은 문장 패널티
  if (s.length < 18) score -= 2
  return score
}

function extractReviewQuote(snippet: string | null): string | null {
  if (!snippet) return null

  // [제목] 기준으로 블로그 포스트 섹션 분리
  const sections = snippet.split(/(?=\[)/).filter(Boolean).map(s => {
    const m = s.match(/^\[([^\]]*)\]/)
    const title   = m?.[1] ?? ''
    const content = s.slice(m?.[0].length ?? 0)
      .replace(/https?:\/\/\S+/g, '')
      .replace(/#\S+/g, ' ')
      .replace(/[✔️☎✅▶◆●■□◦•⭐○◆]/g, '')
      .trim()
    return { isReview: REVIEW_TITLE_RE.test(title), content }
  })

  const ordered = [...sections.filter(s => s.isReview), ...sections.filter(s => !s.isReview)]
  const candidates: { sentence: string; score: number }[] = []

  for (const { content, isReview } of ordered) {
    const parts = content.split(/[.\n]/).map(s => s.trim()).filter(Boolean)
    for (const part of parts) {
      if (part.length < 15 || part.length > 100) continue
      if (PROMO_RE.test(part)) continue
      if (!/[가-힣]/.test(part)) continue
      if (/^[-\d]/.test(part)) continue  // 주소 리스트("-로 시작") 또는 숫자 시작 제외
      if (isReview || REVIEW_KW.some(kw => part.includes(kw))) {
        const s = scoreQuote(part) + (isReview ? 1 : 0)
        candidates.push({ sentence: part, score: s })
      }
    }
    if (candidates.length >= 15) break  // 충분히 모으면 탐색 중단
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]?.sentence
  if (!best) return null
  return best.length > 60 ? best.slice(0, 60) + '…' : best
}

const SCHOOL_TYPE_LABEL: Record<string, string> = {
  elementary: '초등학교',
  middle:     '중학교',
  high:       '고등학교',
}

// ── 공통 칩 버튼 ──────────────────────────────────────────────────────────────
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

// ── 루트 시각화 ───────────────────────────────────────────────────────────────
function RouteBar({ route }: { route: RouteStep[] }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content' }}>
        {route.map((step, i) => {
          const isLast = i === route.length - 1
          const isHome = step.label === '집'
          const isSchool = !isHome && i === 1 && route.length > 3
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                padding:      '5px 10px',
                borderRadius: 20,
                background:   isHome ? '#f3f4f6' : isSchool ? '#eff6ff' : '#fff7f0',
                border:       `1.5px solid ${isHome ? '#e5e7eb' : isSchool ? '#bfdbfe' : 'var(--dj-orange)'}`,
                font:         '600 12px/1 var(--font-sans)',
                color:        isHome ? 'var(--fg-sec)' : isSchool ? '#2563eb' : 'var(--dj-orange)',
                whiteSpace:   'nowrap',
              }}>
                {step.label}
              </div>
              {!isLast && (
                <div style={{ display: 'flex', alignItems: 'center', margin: '0 4px' }}>
                  <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>
                    {fmtDist(step.distToNext)}
                  </span>
                  <span style={{ font: '500 14px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 2px' }}>→</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 학원 결과 카드 ────────────────────────────────────────────────────────────
function HagwonCard({ item, rank }: { item: ComboResult['hagwons'][number]; rank: number }) {
  const subjectLabel = item.subject ? SUBJECT_LABELS[item.subject as SubjectCategory] : null
  const feeLabel     = item.fee_tier ? FEE_LABELS[item.fee_tier as FeeTier] : null
  const strengthTags = (item.blog_tags ?? []).slice(0, 3).map(t => t.replace(/^#/, ''))
  const reviewQuote  = extractReviewQuote(item.blog_snippet)
  const blogCount    = item.naver_blog_count ?? 0

  return (
    <div style={{
      display:      'flex',
      alignItems:   'flex-start',
      gap:          12,
      padding:      '12px 0',
      borderBottom: '1px solid var(--line-subtle)',
    }}>
      <div style={{
        minWidth:   28, height: 28, borderRadius: 8,
        background: 'var(--dj-orange)',
        display:    'grid', placeItems: 'center', flexShrink: 0,
        font:       '700 12px/1 var(--font-sans)', color: '#fff',
      }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 5 }}>
          {item.name}
        </div>

        {/* 기본 태그 행: 과목·분야·수강료·거리 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {subjectLabel && (
            <span style={{
              font: '600 11px/1 var(--font-sans)', color: 'var(--dj-orange)',
              background: '#fff7f0', padding: '2px 7px', borderRadius: 4,
            }}>
              {subjectLabel}
            </span>
          )}
          {item.realm_sc_nm && (
            <span style={{
              font: '500 11px/1 var(--font-sans)', color: '#2563eb',
              background: '#eff6ff', padding: '2px 7px', borderRadius: 4,
            }}>
              {item.realm_sc_nm}
            </span>
          )}
          {feeLabel && (
            <span style={{
              font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)',
              background: 'var(--bg-surface-2)', padding: '2px 7px', borderRadius: 4,
            }}>
              {feeLabel}
            </span>
          )}
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {fmtDist(item.dist_home)}
          </span>
        </div>

        {/* 강점 태그 — 네이버 블로그 분석 기반 */}
        {strengthTags.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                강점
              </span>
              {blogCount > 0 && (
                <span style={{ font: '500 10px/1 var(--font-sans)', color: '#059669' }}>
                  · 네이버 블로그 {blogCount >= 1000 ? '1000+' : blogCount}개 분석
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {strengthTags.map(tag => (
                <span key={tag} style={{
                  font:         '500 10px/1 var(--font-sans)',
                  color:        '#059669',
                  background:   '#d1fae5',
                  padding:      '2px 6px',
                  borderRadius: 4,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 리뷰 한마디 — 네이버 블로그 원문 */}
        {reviewQuote && (
          <p style={{
            font:   '500 11px/1.4 var(--font-sans)',
            color:  'var(--fg-tertiary)',
            margin: '6px 0 0',
          }}>
            <span style={{ fontStyle: 'italic' }}>&ldquo;{reviewQuote}&rdquo;</span>
            <span style={{
              fontStyle:   'normal',
              marginLeft:  5,
              color:       '#059669',
              font:        '500 10px/1 var(--font-sans)',
              whiteSpace:  'nowrap',
            }}>
              — 네이버 블로그
            </span>
          </p>
        )}
      </div>
      <div style={{ font: '700 13px/1 var(--font-sans)', color: 'var(--dj-orange)', flexShrink: 0 }}>
        {(item.individual_score * 100).toFixed(0)}점
      </div>
    </div>
  )
}

// ── 메인 Sheet ────────────────────────────────────────────────────────────────
type Step = 'age' | 'school' | 'prefs' | 'loading' | 'result'

export function HagwonRecommendSheet({ lat, lng, schools, onClose }: {
  lat:     number
  lng:     number
  schools: SchoolItem[]
  onClose: () => void
}) {
  const [step,         setStep]         = useState<Step>('age')
  const [ageGroup,     setAgeGroup]     = useState<AgeGroup | undefined>(undefined)
  const [selectedSchool, setSelectedSchool] = useState<SchoolOption | null>(null)
  const [subjects,     setSubjects]     = useState<SubjectCategory[]>([])
  const [feeTierPref,  setFeeTierPref]  = useState<FeeTier[]>([])
  const [combo,        setCombo]        = useState<ComboResult | null>(null)
  const [comment,      setComment]      = useState('')

  // 현재 나이에서 선택 가능한 학교 목록 (road_address 없어도 포함)
  const eligibleSchoolTypes = ageGroup ? (AGE_SCHOOL_TYPE[ageGroup] ?? []) : []
  const needsSchoolStep     = ageGroup != null && eligibleSchoolTypes.length > 0
  const eligibleSchools: SchoolOption[] = schools
    .filter(s => eligibleSchoolTypes.includes(s.school_type))
    .map(s => ({
      name:         s.school_name,
      school_type:  s.school_type,
      road_address: s.road_address ?? s.school_name,  // 주소 없으면 학교명으로 geocoding
      distance_m:   s.distance_m,
    }))
    .slice(0, 8)

  function toggleSubject(s: SubjectCategory) {
    setSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function toggleFeeTier(t: FeeTier) {
    setFeeTierPref(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function handleAgeNext() {
    if (!ageGroup) return
    // 초등/중/고 선택 시 학교 선택 단계로 (학교 목록 없어도 건너뛰기 UI 제공)
    if (needsSchoolStep) {
      setStep('school')
    } else {
      setStep('prefs')
    }
  }

  function handleSubmit() {
    setStep('loading')
    void (async () => {
      try {
        const res = await recommendHagwons({
          lat, lng, ageGroup, subjects, feeTierPref,
          schoolAddress: selectedSchool?.road_address ?? undefined,
          schoolName:    selectedSchool?.name ?? undefined,
        })
        if ('error' in res) {
          setCombo({ hagwons: [], visitOrder: [], route: [], totalRouteDist: 0 })
          setComment(
            res.error === 'unauthorized'
              ? '로그인 후 이용할 수 있어요. 오른쪽 상단 메뉴에서 로그인해 주세요.'
              : '추천 결과를 불러오는 중 오류가 발생했습니다.',
          )
        } else {
          setCombo(res.combo)
          setComment(res.comment)
          if (ageGroup) {
            saveChildProfile({
              nickname:      '내 자녀',
              age_group:     ageGroup,
              subject_prefs: subjects,
              fee_tier_pref: feeTierPref,
            }).catch(() => {})
          }
        }
      } catch (err) {
        void err
        setCombo({ hagwons: [], visitOrder: [], route: [], totalRouteDist: 0 })
        setComment('추천 결과를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setStep('result')
      }
    })()
  }

  function handleReset() {
    setStep('age')
    setAgeGroup(undefined)
    setSelectedSchool(null)
    setSubjects([])
    setFeeTierPref([])
    setCombo(null)
    setComment('')
  }

  const stepLabel = { age: '1/3', school: '2/3', prefs: '3/3', loading: '', result: '' }[step]

  return (
    <BottomSheet open={true} onClose={onClose} title="AI 맞춤 학원 추천">
      {/* 스텝 인디케이터 + 설명 */}
      {(stepLabel || step === 'age') && (
        <div style={{ padding: '4px 20px 12px', borderBottom: '1px solid var(--line-subtle)' }}>
          {stepLabel && (
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              {stepLabel}
            </span>
          )}
          {step === 'age' && (
            <p style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '4px 0 0' }}>
              자녀 연령을 선택하면 최적 등원 루트로 추천해 드려요
            </p>
          )}
        </div>
      )}

      {/* ── Step: 나이 선택 ── */}
        {step === 'age' && (
          <div style={{ padding: '20px 20px 0' }}>
            <h3 style={{ font: '600 14px/1 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
              자녀 연령
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
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
            <button
              onClick={handleAgeNext}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                background: 'var(--dj-orange)', color: '#fff',
                font: '700 15px/1 var(--font-sans)', border: 'none', cursor: 'pointer',
                marginBottom: 20,
              }}
            >
              다음
            </button>
          </div>
        )}

        {/* ── Step: 학교 선택 ── */}
        {step === 'school' && (
          <div style={{ padding: '20px 20px 0' }}>
            <h3 style={{ font: '600 14px/1 var(--font-sans)', margin: '0 0 4px', color: 'var(--fg-pri)' }}>
              다니는 학교 선택
            </h3>
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 14px' }}>
              학교를 선택하면 집↔학교↔학원 경로를 최적화해 드려요
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {eligibleSchools.map(school => {
                const active = selectedSchool?.name === school.name
                return (
                  <button
                    key={school.name}
                    onClick={() => setSelectedSchool(active ? null : school)}
                    style={{
                      padding:      '12px 14px',
                      borderRadius: 12,
                      border:       `1.5px solid ${active ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                      background:   active ? '#fff7f0' : 'var(--bg-surface)',
                      cursor:       'pointer',
                      textAlign:    'left',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ font: '600 13px/1.3 var(--font-sans)', color: active ? 'var(--dj-orange)' : 'var(--fg-pri)' }}>
                        {school.name}
                      </div>
                      <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', flexShrink: 0 }}>
                        {school.distance_m != null ? fmtDist(school.distance_m) : ''}
                      </div>
                    </div>
                    <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                      {SCHOOL_TYPE_LABEL[school.school_type]}
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => { setSelectedSchool(null); setStep('prefs') }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  background: 'var(--bg-surface-2)', color: 'var(--fg-sec)',
                  font: '600 14px/1 var(--font-sans)', border: 'none', cursor: 'pointer',
                }}
              >
                학교 없이 추천받기
              </button>
              <button
                onClick={() => setStep('prefs')}
                style={{
                  flex: 2, padding: '12px 0', borderRadius: 12,
                  background: 'var(--dj-orange)', color: '#fff',
                  font: '700 14px/1 var(--font-sans)', border: 'none', cursor: 'pointer',
                }}
              >
                {selectedSchool ? `${selectedSchool.name} 선택` : '다음'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: 과목·수강료 선택 ── */}
        {step === 'prefs' && (
          <div style={{ padding: '20px 20px 0' }}>
            {/* 선택된 학교 요약 */}
            {selectedSchool && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                background: '#eff6ff', marginBottom: 16,
              }}>
                <span style={{ font: '500 12px/1 var(--font-sans)', color: '#2563eb' }}>
                  🏫 {selectedSchool.name} 경로 최적화 적용
                </span>
              </div>
            )}

            <section aria-labelledby="subject-section">
              <h3 id="subject-section" style={{ font: '600 14px/1 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                관심 과목 <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>(복수 선택)</span>
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
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
                수강료 선호 <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>(복수 선택)</span>
              </h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {FEE_OPTIONS.map(opt => {
                  const active = feeTierPref.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleFeeTier(opt.value)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 12,
                        border: `1.5px solid ${active ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                        background: active ? '#fff7f0' : 'var(--bg-surface)',
                        cursor: 'pointer', textAlign: 'center',
                      }}
                    >
                      <div style={{ font: '600 13px/1.3 var(--font-sans)', color: active ? 'var(--dj-orange)' : 'var(--fg-pri)' }}>
                        {opt.label}
                      </div>
                      <div style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 3 }}>
                        {opt.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setFeeTierPref([])}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: 10,
                  border: `1.5px solid ${feeTierPref.length === 0 ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                  background: feeTierPref.length === 0 ? '#fff7f0' : 'var(--bg-surface)',
                  color: feeTierPref.length === 0 ? 'var(--dj-orange)' : 'var(--fg-sec)',
                  font: '500 13px/1 var(--font-sans)', cursor: 'pointer', marginBottom: 24,
                }}
              >
                상관없음
              </button>
            </section>

            <button
              onClick={handleSubmit}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                background: 'var(--dj-orange)', color: '#fff',
                font: '700 15px/1 var(--font-sans)', border: 'none', cursor: 'pointer',
                marginBottom: 20,
              }}
            >
              AI로 추천받기
            </button>
          </div>
        )}

        {/* ── Step: 로딩 ── */}
        {step === 'loading' && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid var(--line-default)',
              borderTopColor: 'var(--dj-orange)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ font: '600 14px/1.6 var(--font-sans)', color: 'var(--fg-pri)', margin: '0 0 6px' }}>
              등원 루트를 최적화 중입니다…
            </p>
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              거리·인기도·수강료·경로를 종합 분석하고 있어요
            </p>
          </div>
        )}

        {/* ── Step: 결과 ── */}
        {step === 'result' && combo && (
          <div style={{ padding: '16px 20px 0' }}>
            {/* 분석 코멘트 */}
            {comment && (
              <div style={{
                padding:    '14px 16px',
                background: 'var(--bg-surface-2)',
                borderRadius: 12,
                marginBottom: 16,
                borderLeft: '3px solid var(--dj-orange)',
              }}>
                {splitAIComment(comment).map((sentence, i) => (
                  <p key={i} style={{
                    font:   i === 0
                      ? '600 13px/1.55 var(--font-sans)'
                      : '500 13px/1.6 var(--font-sans)',
                    color:  i === 0 ? 'var(--fg-pri)' : 'var(--fg-sec)',
                    margin: i === 0 ? '0' : '6px 0 0',
                  }}>
                    {sentence}
                  </p>
                ))}
              </div>
            )}

            {combo.hagwons.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center' }}>
                <p style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                  반경 내 조건에 맞는 학원이 없습니다.
                </p>
              </div>
            ) : (
              <>
                {/* 루트 시각화 (복수 학원 or 학교 선택 시) */}
                {combo.route.length > 2 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 8 }}>
                      추천 등원 루트 · 총 {(combo.totalRouteDist / 1000).toFixed(1)}km
                    </div>
                    <RouteBar route={combo.route} />
                  </div>
                )}

                {/* 방문 순서대로 학원 카드 */}
                <div>
                  {combo.visitOrder.map((idx, rank) => {
                    const h = combo.hagwons[idx]
                    if (!h) return null
                    return <HagwonCard key={h.id} item={h} rank={rank + 1} />
                  })}
                  {combo.visitOrder.length === 0 && combo.hagwons.map((h, i) => (
                    <HagwonCard key={h.id} item={h} rank={i + 1} />
                  ))}
                </div>
              </>
            )}

            <button
              onClick={handleReset}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12,
                background: 'var(--bg-surface-2)', color: 'var(--fg-sec)',
                font: '600 14px/1 var(--font-sans)', border: 'none', cursor: 'pointer',
                margin: '16px 0 20px',
              }}
            >
              조건 다시 설정
            </button>
          </div>
        )}
    </BottomSheet>
  )
}
