import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'
import { getAdRoiStats } from '@/lib/data/ads'
import { AdminCampaignActions } from '@/components/ads/AdminCampaignActions'
import { AdRoiTable } from '@/components/admin/AdRoiTable'

export const revalidate = 0

type AdStatus = Database['public']['Enums']['ad_status']

const STATUS_LABEL: Record<AdStatus, string> = {
  draft:    '초안',
  pending:  '검토 중',
  approved: '승인',
  ended:    '종료',
  rejected: '거절',
  paused:   '일시중지',
}

const STATUS_COLOR: Record<AdStatus, string> = {
  draft:    '#6b7280',
  pending:  '#d97706',
  approved: '#16a34a',
  ended:    '#9ca3af',
  rejected: '#dc2626',
  paused:   '#7c3aed',
}

const STATUS_KEYS = new Set<string>(Object.keys(STATUS_LABEL))

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: rawStatus = '' } = await searchParams
  const status = STATUS_KEYS.has(rawStatus) ? (rawStatus as AdStatus) : ''

  const adminClient = createSupabaseAdminClient()

  let adsQuery = adminClient
    .from('ad_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) {
    adsQuery = adsQuery.eq('status', status)
  }

  const [{ data: campaigns, error: adsError }, roiStats] = await Promise.all([
    adsQuery,
    getAdRoiStats(adminClient),
  ])

  if (adsError) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <div className="card" style={{ padding: 40, textAlign: 'center', font: '500 14px/1.6 var(--font-sans)', color: 'var(--fg-negative)' }}>
          광고 데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </div>
      </div>
    )
  }

  const rows = campaigns ?? []

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1
            style={{
              font: '700 22px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            광고 캠페인 관리
          </h1>
          <Link
            href="/admin/ads/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'var(--dj-orange)',
              color: '#fff',
              borderRadius: 8,
              font: '600 13px/1 var(--font-sans)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + 새 광고 등록
          </Link>
        </div>

        {/* 상태 필터 폼 */}
        <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select name="status" defaultValue={status} className="input" style={{ minWidth: 130 }}>
            <option value="">상태 전체</option>
            {(Object.keys(STATUS_LABEL) as AdStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-sm btn-orange">필터</button>
          {status && (
            <a href="/admin/ads" className="btn btn-sm btn-secondary">초기화</a>
          )}
        </form>

        {/* ROI 집계 테이블 (캠페인이 있을 때만 표시) */}
        {rows.length > 0 && <AdRoiTable rows={roiStats} />}

        {rows.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: 'center',
              font: '500 14px/1.6 var(--font-sans)',
              color: 'var(--fg-tertiary)',
            }}
          >
            {status ? '해당 상태의 광고 캠페인이 없습니다.' : '등록된 광고 캠페인이 없습니다.'}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--line-default)',
                    background: 'var(--bg-surface-2)',
                  }}
                >
                  {['광고명', '광고주', '지면', '기간', '상태', '액션'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        font: '600 12px/1 var(--font-sans)',
                        color: 'var(--fg-sec)',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                    }}
                  >
                    <td style={{ padding: '12px 16px', font: '600 13px/1.3 var(--font-sans)' }}>
                      {c.title}
                    </td>
                    <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-sec)' }}>
                      {c.advertiser_name}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="chip sm">{c.placement}</span>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        font: '500 12px/1.4 var(--font-sans)',
                        color: 'var(--fg-tertiary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDate(c.starts_at)} –<br />{formatDate(c.ends_at)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 4,
                          font: '600 11px/1 var(--font-sans)',
                          color: '#fff',
                          background: STATUS_COLOR[c.status],
                        }}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AdminCampaignActions id={c.id} status={c.status} />
                        <Link
                          href={`/admin/ads/${c.id}/edit`}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 5,
                            font: '600 11px/1 var(--font-sans)',
                            color: 'var(--fg-sec)',
                            border: '1px solid var(--line-default)',
                            background: 'var(--bg-surface-2)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          수정
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  )
}
