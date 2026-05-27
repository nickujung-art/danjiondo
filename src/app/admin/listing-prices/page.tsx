import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { upsertListingPrice, deleteListingPrice } from '@/lib/actions/listing-price-actions'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 매물가 입력' }

// FormData → 객체 인자 변환 래퍼 (listing-price-actions.ts 시그니처 변경 없음)
// Return type is void to satisfy Next.js form action signature requirements
async function insertListingPriceFromForm(formData: FormData) {
  'use server'
  await upsertListingPrice({
    complexId: (formData.get('complexId') as string) ?? '',
    pricePerPy: Number(formData.get('pricePerPy')),
    recordedDate: (formData.get('recordedDate') as string) ?? '',
    source: (formData.get('source') as string) ?? '',
  })
}

async function deleteListingPriceFromForm(formData: FormData) {
  'use server'
  await deleteListingPrice((formData.get('id') as string) ?? '')
}

interface ListingPriceRow {
  id: string
  complex_id: string
  price_per_py: number
  recorded_date: string
  source: string
  created_at: string
  complexes: { canonical_name: string } | null
}

interface ComplexRow {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AdminListingPricesPage() {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/listing-prices')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [{ data: listingPricesRaw }, { data: complexesRaw }] = await Promise.all([
    (adminClient as any)
      .from('listing_prices')
      .select('id, complex_id, price_per_py, recorded_date, source, created_at, complexes(canonical_name)')
      .order('created_at', { ascending: false })
      .limit(20),
    (adminClient as any)
      .from('complexes')
      .select('id, canonical_name, si, gu')
      .eq('status', 'active')
      .order('canonical_name')
      .limit(500),
  ])
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const listingPrices = ((listingPricesRaw ?? []) as unknown) as ListingPriceRow[]
  const complexes = ((complexesRaw ?? []) as unknown) as ComplexRow[]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}
        >
          매물가 입력
        </h1>
        <p
          style={{
            font: '500 13px/1.6 var(--font-sans)',
            color: 'var(--fg-sec)',
            margin: '0 0 24px',
          }}
        >
          KB시세 등 외부 매물가를 수동으로 기록합니다.
        </p>

        {/* 입력 폼 카드 */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h2 style={{ font: '700 16px/1.4 var(--font-sans)', margin: '0 0 16px' }}>
            매물가 등록
          </h2>
          <form action={insertListingPriceFromForm} aria-label="매물가 등록">
            {/* 단지 select */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="complex-select"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                단지
              </label>
              <select
                id="complex-select"
                name="complexId"
                className="input"
                required
                style={{ width: '100%' }}
              >
                <option value="">단지 선택</option>
                {complexes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.canonical_name}
                    {(c.si || c.gu) ? ` (${[c.si, c.gu].filter(Boolean).join(' ')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 평당가 */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="price-input"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                평당가
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="price-input"
                  name="pricePerPy"
                  type="number"
                  className="input"
                  min={100}
                  max={99999}
                  step={1}
                  placeholder="예: 1850"
                  aria-label="평당가 (만원 단위)"
                  style={{ flex: 1 }}
                  required
                />
                <span
                  style={{
                    font: '500 11px/1 var(--font-sans)',
                    color: 'var(--fg-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  만원/평
                </span>
              </div>
            </div>

            {/* 기준일 */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="date-input"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                기준일
              </label>
              <input
                id="date-input"
                name="recordedDate"
                type="date"
                className="input"
                required
                style={{ width: '100%' }}
              />
            </div>

            {/* 출처 */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="source-input"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                출처
              </label>
              <input
                id="source-input"
                name="source"
                type="text"
                className="input"
                placeholder="KB시세, 직방, 네이버 부동산 등"
                maxLength={100}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" className="btn btn-sm btn-orange">
                등록
              </button>
              <div aria-live="polite" />
            </div>
          </form>
        </div>

        {/* 최근 입력 내역 */}
        <div>
          <h2 style={{ font: '700 16px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
            최근 입력 내역 (최대 20건)
          </h2>
          {listingPrices.length === 0 ? (
            <div
              className="card"
              style={{
                padding: 40,
                textAlign: 'center',
                font: '500 14px/1.6 var(--font-sans)',
                color: 'var(--fg-tertiary)',
              }}
            >
              아직 입력된 매물가가 없습니다.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--line-default)',
                        background: 'var(--bg-surface-2)',
                      }}
                    >
                      {['단지명', '평당가', '기준일', '출처', '등록일', '삭제'].map(h => (
                        <th
                          key={h}
                          scope="col"
                          style={{
                            padding: '10px 16px',
                            font: '500 11px/1 var(--font-sans)',
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
                    {listingPrices.map((row, i) => {
                      const complexName = row.complexes?.canonical_name ?? '—'
                      return (
                        <tr
                          key={row.id}
                          style={{
                            borderBottom: i < listingPrices.length - 1
                              ? '1px solid var(--line-subtle)'
                              : 'none',
                          }}
                        >
                          <td
                            style={{
                              padding: '12px 16px',
                              font: '500 13px/1.4 var(--font-sans)',
                              color: 'var(--fg-pri)',
                            }}
                          >
                            {complexName}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              font: '500 13px/1 var(--font-sans)',
                              color: 'var(--fg-pri)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span className="tnum">
                              {row.price_per_py.toLocaleString()}만원/평
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              font: '500 12px/1 var(--font-sans)',
                              color: 'var(--fg-sec)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatDate(row.recorded_date)}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              font: '500 12px/1 var(--font-sans)',
                              color: 'var(--fg-sec)',
                            }}
                          >
                            {row.source}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              font: '500 12px/1 var(--font-sans)',
                              color: 'var(--fg-tertiary)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatDateTime(row.created_at)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <form action={deleteListingPriceFromForm}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                className="btn btn-sm btn-ghost"
                                aria-label={`${complexName} 매물가 삭제`}
                                style={{ color: 'var(--fg-negative)' }}
                              >
                                삭제
                              </button>
                            </form>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
  )
}
