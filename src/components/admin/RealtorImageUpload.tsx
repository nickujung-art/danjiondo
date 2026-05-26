'use client'

import { useRef, useState } from 'react'
import { compressProfileImage } from '@/lib/utils/compress-image'

interface Props {
  currentUrl: string | null
  name: string           // 이니셜 표시용
  onUploaded: (url: string) => void
  onError: (msg: string) => void
}

export function RealtorImageUpload({ currentUrl, name, onUploaded, onError }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const initial = name.slice(0, 1) || '?'

  async function handleFile(file: File) {
    setUploading(true)
    onError('')
    try {
      const compressed = await compressProfileImage(file)
      const fd = new FormData()
      fd.append('file', compressed, 'profile.jpg')
      const res = await fetch('/api/admin/realtors/upload-image', { method: 'POST', body: fd })
      if (!res.ok) {
        const msg = await res.text()
        onError(msg || '업로드 실패')
        return
      }
      const { url } = await res.json() as { url: string }
      setPreviewUrl(url)
      onUploaded(url)
    } catch {
      onError('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {/* 아바타 미리보기 */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          flexShrink: 0,
          overflow: 'hidden',
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: uploading ? 'default' : 'pointer',
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        title="클릭하여 이미지 변경"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ font: '700 20px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
            {initial}
          </span>
        )}
      </div>

      {/* 텍스트 + 버튼 */}
      <div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ fontSize: 12, marginBottom: 4 }}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? '업로드 중…' : previewUrl ? '사진 변경' : '사진 업로드'}
        </button>
        <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
          JPG·PNG·WebP, 최대 5MB
          <br />
          자동으로 200×200px로 압축됩니다
        </p>
        {previewUrl && (
          <button
            type="button"
            style={{ font: '400 11px/1 var(--font-sans)', color: '#dc2626', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: 4 }}
            onClick={() => { setPreviewUrl(null); onUploaded('') }}
          >
            사진 제거
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
