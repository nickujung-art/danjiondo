import Link from 'next/link'
import { RealtorCreateForm } from '@/components/admin/RealtorCreateForm'

export const revalidate = 0

export default async function AdminRealtorsNewPage() {
  return (
    <div className="admin-page-narrow">
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/admin/realtors"
          style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}
        >
          ← 공인중개사 관리
        </Link>
      </div>
      <h1
        style={{
          font: '700 22px/1.3 var(--font-sans)',
          letterSpacing: '-0.02em',
          margin: '0 0 20px',
        }}
      >
        공인중개사 등록
      </h1>

      <RealtorCreateForm />
    </div>
  )
}
