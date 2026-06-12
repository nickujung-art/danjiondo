export default function Loading() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      {/* 헤더 스켈레톤 */}
      <div style={{ height: 56, borderBottom: '1px solid var(--border)' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, padding: '32px 0' }}>
        {/* 메인 콘텐츠 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 단지명 */}
          <div>
            <div className="skeleton" style={{ width: 240, height: 28, borderRadius: 6, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 180, height: 16, borderRadius: 4 }} />
          </div>
          {/* 차트 */}
          <div className="skeleton" style={{ height: 280, borderRadius: 12 }} />
          {/* 거래 리스트 */}
          <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
          {/* 갭 분석 */}
          <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />
        </div>
        {/* 사이드바 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ height: 180, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 140, borderRadius: 12 }} />
        </div>
      </div>

      <style>{`
        .skeleton {
          background: linear-gradient(90deg, var(--bg-sec) 25%, var(--border) 50%, var(--bg-sec) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
