'use client'

import { useState } from 'react'
import { AdCopyReviewer } from '@/components/admin/AdCopyReviewer'
import { createAdCampaign } from '@/lib/auth/ad-actions'

export function AdCreateForm() {
  const [copyText, setCopyText] = useState('')
  const [placement, setPlacement] = useState('sidebar')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createAdCampaign(formData)
      if (result.error) {
        setSubmitError(result.error)
      } else {
        setSubmitSuccess(true)
      }
    } catch {
      setSubmitError('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitSuccess) {
    return (
      <div
        className="card"
        style={{
          padding: '32px',
          textAlign: 'center',
          font: '500 14px/1.6 var(--font-sans)',
          color: 'var(--fg-positive)',
        }}
      >
        광고 등록 요청이 완료되었습니다. 관리자 검토 후 승인됩니다.
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '28px' }}>
      <form action={handleSubmit}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* 광고명 */}
          <div>
            <label
              htmlFor="ad-title"
              style={{
                display: 'block',
                font: '600 13px/1 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: '6px',
              }}
            >
              광고명 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <input
              id="ad-title"
              name="title"
              className="input"
              required
              style={{ width: '100%', height: '40px', fontSize: '14px' }}
              placeholder="광고 캠페인 이름"
            />
          </div>

          {/* 광고주명 */}
          <div>
            <label
              htmlFor="ad-advertiser"
              style={{
                display: 'block',
                font: '600 13px/1 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: '6px',
              }}
            >
              광고주명 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <input
              id="ad-advertiser"
              name="advertiser_name"
              className="input"
              required
              style={{ width: '100%', height: '40px', fontSize: '14px' }}
              placeholder="광고주 회사명"
            />
          </div>

          {/* 광고 카피 */}
          <div>
            <label
              htmlFor="ad-copy"
              style={{
                display: 'block',
                font: '600 13px/1 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: '6px',
              }}
            >
              광고 카피
            </label>
            <textarea
              id="ad-copy"
              name="copy"
              rows={4}
              value={copyText}
              onChange={(e) => setCopyText(e.target.value)}
              className="input"
              style={{
                width: '100%',
                fontSize: '14px',
                resize: 'vertical',
                padding: '10px 12px',
                height: 'auto',
              }}
              placeholder="광고 카피 텍스트를 입력하세요 (표시광고법 검토용)"
            />
            <AdCopyReviewer copyText={copyText} />
          </div>

          {/* 지면 */}
          <div>
            <label
              htmlFor="ad-placement"
              style={{
                display: 'block',
                font: '600 13px/1 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: '6px',
              }}
            >
              지면 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <select
              id="ad-placement"
              name="placement"
              className="input"
              required
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              style={{ width: '100%', height: '40px', fontSize: '14px' }}
            >
              <option value="banner_top">상단 배너 (banner_top)</option>
              <option value="sidebar">사이드바 (sidebar)</option>
              <option value="in_feed">피드 내 (in_feed)</option>
              <option value="map_popup">지도 팝업 (map_popup)</option>
            </select>
          </div>

          {/* 지역 타겟팅 — sidebar / in_feed 지면에서만 표시 */}
          {(placement === 'sidebar' || placement === 'in_feed') && (
            <div>
              <label
                htmlFor="ad-sgg-code"
                style={{
                  display: 'block',
                  font: '600 13px/1 var(--font-sans)',
                  color: 'var(--fg-pri)',
                  marginBottom: '6px',
                }}
              >
                지역 코드 (sgg_code)
                <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)', marginLeft: 6 }}>
                  미입력 시 전체 지역 노출
                </span>
              </label>
              <input
                id="ad-sgg-code"
                name="target_sgg_code"
                className="input"
                style={{ width: '100%', height: '40px', fontSize: '14px' }}
                placeholder="예: 48127 (창원시 성산구)"
              />
            </div>
          )}

          {/* 지도 위치 — map_popup 지면에서만 표시 */}
          {placement === 'map_popup' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  htmlFor="ad-lat"
                  style={{
                    display: 'block',
                    font: '600 13px/1 var(--font-sans)',
                    color: 'var(--fg-pri)',
                    marginBottom: '6px',
                  }}
                >
                  위도 (lat) <span style={{ color: 'var(--fg-negative)' }}>*</span>
                </label>
                <input
                  id="ad-lat"
                  name="target_lat"
                  type="number"
                  step="0.0001"
                  className="input"
                  required
                  style={{ width: '100%', height: '40px', fontSize: '14px' }}
                  placeholder="예: 35.2278"
                />
              </div>
              <div>
                <label
                  htmlFor="ad-lng"
                  style={{
                    display: 'block',
                    font: '600 13px/1 var(--font-sans)',
                    color: 'var(--fg-pri)',
                    marginBottom: '6px',
                  }}
                >
                  경도 (lng) <span style={{ color: 'var(--fg-negative)' }}>*</span>
                </label>
                <input
                  id="ad-lng"
                  name="target_lng"
                  type="number"
                  step="0.0001"
                  className="input"
                  required
                  style={{ width: '100%', height: '40px', fontSize: '14px' }}
                  placeholder="예: 128.6817"
                />
              </div>
            </div>
          )}

          {/* 이미지 URL */}
          <div>
            <label
              htmlFor="ad-image"
              style={{
                display: 'block',
                font: '600 13px/1 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: '6px',
              }}
            >
              이미지 URL <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <input
              id="ad-image"
              name="image_url"
              type="url"
              className="input"
              required
              style={{ width: '100%', height: '40px', fontSize: '14px' }}
              placeholder="https://..."
            />
          </div>

          {/* 링크 URL */}
          <div>
            <label
              htmlFor="ad-link"
              style={{
                display: 'block',
                font: '600 13px/1 var(--font-sans)',
                color: 'var(--fg-pri)',
                marginBottom: '6px',
              }}
            >
              링크 URL <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <input
              id="ad-link"
              name="link_url"
              type="url"
              className="input"
              required
              style={{ width: '100%', height: '40px', fontSize: '14px' }}
              placeholder="https://..."
            />
          </div>

          {/* 집행 기간 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <label
                htmlFor="ad-starts"
                style={{
                  display: 'block',
                  font: '600 13px/1 var(--font-sans)',
                  color: 'var(--fg-pri)',
                  marginBottom: '6px',
                }}
              >
                시작일 <span style={{ color: 'var(--fg-negative)' }}>*</span>
              </label>
              <input
                id="ad-starts"
                name="starts_at"
                type="date"
                className="input"
                required
                style={{ width: '100%', height: '40px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label
                htmlFor="ad-ends"
                style={{
                  display: 'block',
                  font: '600 13px/1 var(--font-sans)',
                  color: 'var(--fg-pri)',
                  marginBottom: '6px',
                }}
              >
                종료일 <span style={{ color: 'var(--fg-negative)' }}>*</span>
              </label>
              <input
                id="ad-ends"
                name="ends_at"
                type="date"
                className="input"
                required
                style={{ width: '100%', height: '40px', fontSize: '14px' }}
              />
            </div>
          </div>

          {/* 오류 메시지 */}
          {submitError && (
            <p
              style={{
                font: '500 13px/1.4 var(--font-sans)',
                color: 'var(--fg-negative)',
                margin: 0,
              }}
            >
              {submitError}
            </p>
          )}

          {/* 제출 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-md btn-orange"
              disabled={isSubmitting}
              style={{ opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? '등록 중...' : '등록 요청'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
