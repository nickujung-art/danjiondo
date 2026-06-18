'use client'

import Link from 'next/link'

export default function SlugError({ reset }: { reset: () => void }) {
  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ textAlign: 'center', padding: '0 24px' }}>
        <p style={{ font: '600 16px/1.5 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 8 }}>
          단지 정보를 불러오는 중 오류가 발생했습니다.
        </p>
        <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 20 }}>
          잠시 후 다시 시도해주세요.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px', borderRadius: 10,
              background: 'var(--dj-orange)', color: '#fff',
              font: '600 14px/1 var(--font-sans)', border: 'none', cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
          <Link
            href="/"
            style={{
              padding: '10px 20px', borderRadius: 10,
              background: 'var(--bg-surface-2)', color: 'var(--fg-sec)',
              font: '600 14px/1 var(--font-sans)', textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            홈으로
          </Link>
        </div>
      </div>
    </main>
  )
}
