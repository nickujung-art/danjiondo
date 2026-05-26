'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { AdCopyReviewer } from '@/components/admin/AdCopyReviewer'
import { createAdCampaign, uploadAdImage } from '@/lib/auth/ad-actions'

const SGG_OPTIONS = [
  { code: '48121', label: '창원시 의창구' },
  { code: '48123', label: '창원시 성산구' },
  { code: '48125', label: '창원시 마산합포구' },
  { code: '48127', label: '창원시 마산회원구' },
  { code: '48129', label: '창원시 진해구' },
  { code: '48250', label: '김해시' },
]

const PLACEMENT_IMAGE_SPEC: Record<string, { label: string; w: number; h: number; ratio: string }> = {
  banner_top: { label: '상단 배너',  w: 1200, h: 200,  ratio: '6:1'  },
  sidebar:    { label: '사이드바',   w: 320,  h: 250,  ratio: '5:4'  },
  in_feed:    { label: '피드 내',    w: 640,  h: 200,  ratio: '16:5' },
  map_popup:  { label: '지도 팝업',  w: 240,  h: 120,  ratio: '2:1'  },
}

const DURATION_OPTIONS = [
  { label: '1개월', months: 1 },
  { label: '2개월', months: 2 },
  { label: '3개월', months: 3 },
  { label: '직접 입력', months: null },
]

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function AdCreateForm() {
  const [copyText,        setCopyText]        = useState('')
  const [placement,       setPlacement]       = useState('sidebar')
  const [imageUrl,        setImageUrl]        = useState('')
  const [imagePreview,    setImagePreview]    = useState('')
  const [uploadError,     setUploadError]     = useState<string | null>(null)
  const [isUploading,     setIsUploading]     = useState(false)
  const [isSubmitting,    setIsSubmitting]    = useState(false)
  const [submitError,     setSubmitError]     = useState<string | null>(null)
  const [submitSuccess,   setSubmitSuccess]   = useState(false)
  const [regionEnabled,   setRegionEnabled]   = useState(false)
  const [startsAt,        setStartsAt]        = useState('')
  const [endsAt,          setEndsAt]          = useState('')
  const [durationOption,  setDurationOption]  = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const spec = PLACEMENT_IMAGE_SPEC[placement]
  const showRegionToggle = placement === 'sidebar' || placement === 'in_feed'

  function handleStartsAtChange(val: string) {
    setStartsAt(val)
    if (durationOption !== null && val) {
      setEndsAt(addMonths(val, durationOption))
    }
  }

  function handleDurationSelect(months: number | null) {
    setDurationOption(months)
    if (months !== null && startsAt) {
      setEndsAt(addMonths(startsAt, months))
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImagePreview(URL.createObjectURL(file))
    setUploadError(null)
    setIsUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const result = await uploadAdImage(fd)
    setIsUploading(false)
    if (result.error) {
      setUploadError(result.error)
      setImagePreview('')
      setImageUrl('')
    } else {
      setImageUrl(result.url ?? '')
    }
  }

  async function handleSubmit(formData: FormData) {
    if (!imageUrl) {
      setSubmitError('이미지를 업로드하세요.')
      return
    }
    formData.set('image_url', imageUrl)
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createAdCampaign(formData)
      if (result.error) setSubmitError(result.error)
      else setSubmitSuccess(true)
    } catch {
      setSubmitError('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitSuccess) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <p style={{ font: '600 15px/1.6 var(--font-sans)', color: 'var(--fg-positive)', margin: 0 }}>
          광고 등록 완료
        </p>
        <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-sec)', margin: '8px 0 0' }}>
          관리자 검토 후 승인됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '28px 32px' }}>
      <form action={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          <Field label="광고명" required>
            <input name="title" className="input" required style={inputStyle} placeholder="광고 캠페인 이름" />
          </Field>

          <Field label="광고주명" required>
            <input name="advertiser_name" className="input" required style={inputStyle} placeholder="광고주 회사명" />
          </Field>

          <Field label="지면" required>
            <select
              name="placement"
              className="input"
              required
              value={placement}
              onChange={(e) => { setPlacement(e.target.value); setRegionEnabled(false) }}
              style={inputStyle}
            >
              <option value="banner_top">상단 배너 (banner_top)</option>
              <option value="sidebar">사이드바 (sidebar)</option>
              <option value="in_feed">피드 내 (in_feed)</option>
              <option value="map_popup">지도 팝업 (map_popup)</option>
            </select>
          </Field>

          {/* 지역 타겟팅 — 토글 방식 */}
          {showRegionToggle && (
            <div>
              <button
                type="button"
                onClick={() => setRegionEnabled(v => !v)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${regionEnabled ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                  background: regionEnabled ? '#fff7ed' : 'var(--bg-surface-2)',
                  color: regionEnabled ? 'var(--dj-orange)' : 'var(--fg-sec)',
                  font: '600 12px/1 var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: regionEnabled ? 'var(--dj-orange)' : 'var(--line-default)',
                  display: 'inline-block', flexShrink: 0,
                }} />
                지역 타겟팅 {regionEnabled ? '활성' : '비활성 (전체 지역 노출)'}
              </button>

              {regionEnabled && (
                <div style={{ marginTop: 10 }}>
                  <Field label="지역 선택">
                    <select name="target_sgg_code" className="input" style={inputStyle}>
                      <option value="">전체 지역</option>
                      {SGG_OPTIONS.map(o => (
                        <option key={o.code} value={o.code}>{o.label} ({o.code})</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* 지도 위치 */}
          {placement === 'map_popup' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="위도 (lat)" required>
                <input name="target_lat" type="number" step="0.0001" className="input" required style={inputStyle} placeholder="35.2278" />
              </Field>
              <Field label="경도 (lng)" required>
                <input name="target_lng" type="number" step="0.0001" className="input" required style={inputStyle} placeholder="128.6817" />
              </Field>
            </div>
          )}

          {/* 이미지 업로드 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <label style={labelStyle}>
                광고 이미지 <span style={{ color: 'var(--fg-negative)' }}>*</span>
              </label>
              {spec && (
                <span style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--line-subtle)',
                  borderRadius: 4,
                  padding: '2px 7px',
                }}>
                  권장: {spec.w} × {spec.h}px ({spec.ratio})
                </span>
              )}
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${imageUrl ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                borderRadius: 10,
                minHeight: 120,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden',
                background: imageUrl ? 'transparent' : 'var(--bg-surface-2)',
                transition: 'border-color 150ms', position: 'relative',
              }}
            >
              {imagePreview ? (
                <Image src={imagePreview} alt="미리보기" fill style={{ objectFit: 'contain' }} unoptimized />
              ) : (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
                  <div style={{ font: '600 13px/1.4 var(--font-sans)', color: 'var(--fg-pri)' }}>클릭하여 이미지 업로드</div>
                  <div style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 4 }}>JPG · PNG · WEBP · GIF · 최대 5MB</div>
                </div>
              )}
              {isUploading && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(255,255,255,0.85)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  font: '600 13px/1 var(--font-sans)', color: 'var(--dj-orange)',
                }}>업로드 중…</div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleFileChange} />
            {uploadError && (
              <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: '6px 0 0' }}>{uploadError}</p>
            )}
            {imageUrl && !uploadError && !isUploading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-positive)' }}>✓ 업로드 완료</span>
                <button
                  type="button"
                  onClick={() => { setImageUrl(''); setImagePreview(''); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >다시 선택</button>
              </div>
            )}
          </div>

          <Field label="광고 링크 URL" required hint="클릭 시 이동할 페이지 주소">
            <input name="link_url" type="url" className="input" required style={inputStyle} placeholder="https://example.com" />
          </Field>

          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>광고 카피</label>
            <textarea
              name="copy"
              rows={3}
              value={copyText}
              onChange={(e) => setCopyText(e.target.value)}
              className="input"
              style={{ width: '100%', fontSize: 14, resize: 'vertical', padding: '10px 12px', height: 'auto' }}
              placeholder="광고 카피 텍스트 (표시광고법 검토용)"
            />
            <AdCopyReviewer copyText={copyText} />
          </div>

          {/* 집행 기간 */}
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 10 }}>
              집행 기간 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 10 }}>
              <Field label="시작일" required>
                <input
                  name="starts_at"
                  type="date"
                  className="input"
                  required
                  style={inputStyle}
                  value={startsAt}
                  onChange={(e) => handleStartsAtChange(e.target.value)}
                />
              </Field>
              <Field label="종료일" required>
                <input
                  name="ends_at"
                  type="date"
                  className="input"
                  required
                  style={inputStyle}
                  value={endsAt}
                  onChange={(e) => { setEndsAt(e.target.value); setDurationOption(null) }}
                />
              </Field>
            </div>
            {/* 기간 빠른 선택 */}
            {startsAt && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleDurationSelect(opt.months)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: `1px solid ${durationOption === opt.months && opt.months !== null ? 'var(--dj-orange)' : 'var(--line-default)'}`,
                      background: durationOption === opt.months && opt.months !== null ? '#fff7ed' : 'var(--bg-surface-2)',
                      color: durationOption === opt.months && opt.months !== null ? 'var(--dj-orange)' : 'var(--fg-sec)',
                      font: '600 11px/1 var(--font-sans)',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {submitError && (
            <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>{submitError}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-md btn-orange"
              disabled={isSubmitting || isUploading}
              style={{ opacity: (isSubmitting || isUploading) ? 0.5 : 1 }}
            >
              {isSubmitting ? '등록 중…' : '광고 등록 요청'}
            </button>
          </div>

        </div>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', height: 40, fontSize: 14 }
const labelStyle: React.CSSProperties = { font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }

function Field({
  label, required, hint, children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <label style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--fg-negative)', marginLeft: 2 }}>*</span>}
        </label>
        {hint && (
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}
