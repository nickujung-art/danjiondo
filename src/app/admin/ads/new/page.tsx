import Link from 'next/link'
import { AdCreateForm } from '@/components/admin/AdCreateForm'

export const revalidate = 0

export default async function AdminAdsNewPage() {
  return (
    <div className="admin-page-narrow">
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/admin/ads"
          style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}
        >
          ← 광고 관리
        </Link>
      </div>
      <h1
        style={{
          font: '700 22px/1.3 var(--font-sans)',
          letterSpacing: '-0.02em',
          margin: '0 0 20px',
        }}
      >
        광고 등록 요청
      </h1>

      <AdCreateForm />
    </div>
  )
}
