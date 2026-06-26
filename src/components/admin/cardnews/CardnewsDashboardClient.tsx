'use client'
import { SchedulerPanel } from '@/components/admin/cardnews/SchedulerPanel'
import { CardnewsDownloadButton } from '@/components/admin/CardnewsDownloadButton'
import { AdminCardnewsCopyButton } from '@/components/admin/AdminCardnewsCopyButton'

interface TopDeal {
  rank: number
  name: string
  priceEok: number
  areaSqm: string
}

interface CardnewsDashboardClientProps {
  topDeals: TopDeal[]
  cardnewsText: string
  periodLabel: string
}

const sectionLabelStyle: React.CSSProperties = {
  font: '600 13px/1.4 var(--font-sans)',
  color: 'var(--fg-sec)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '0 0 12px',
}

export function CardnewsDashboardClient({
  topDeals,
  cardnewsText,
  periodLabel,
}: CardnewsDashboardClientProps) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px' }}>
      {/* 페이지 헤더 */}
      <h1
        style={{
          font: '700 22px/1.3 var(--font-sans)',
          letterSpacing: '-0.02em',
          margin: '0 0 4px',
        }}
      >
        카드뉴스 관리
      </h1>
      <p
        style={{
          font: '500 14px/1.6 var(--font-sans)',
          color: 'var(--fg-sec)',
          margin: '0 0 32px',
        }}
      >
        주간 신고가 카드뉴스 자동화 상태 및 즉시 실행
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* 섹션 1 — 자동화 상태 */}
        <section>
          <h2 style={sectionLabelStyle}>자동화 상태</h2>
          <SchedulerPanel />
        </section>

        {/* 섹션 2 — 빠른 액션 */}
        <section>
          <h2 style={sectionLabelStyle}>빠른 액션</h2>
          <div
            className="card"
            style={{
              padding: '24px',
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}
          >
            <CardnewsDownloadButton />
          </div>
        </section>

        {/* 섹션 3 — 이번 주 데이터 */}
        <section>
          <h2 style={sectionLabelStyle}>이번 주 데이터</h2>
          <div className="card" style={{ padding: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    font: '600 14px/1.4 var(--font-sans)',
                    marginBottom: 4,
                  }}
                >
                  최근 30일 신고가 TOP 5
                </div>
                <div
                  style={{
                    font: '500 12px/1.4 var(--font-sans)',
                    color: 'var(--fg-tertiary)',
                  }}
                >
                  {periodLabel} · 창원·김해 실거래가 기준
                </div>
              </div>
              <AdminCardnewsCopyButton text={cardnewsText} />
            </div>
            <ol
              style={{
                margin: 0,
                padding: '0 0 0 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {topDeals.map((d) => (
                <li
                  key={d.rank}
                  style={{
                    font: '500 14px/1.5 var(--font-sans)',
                    color: d.rank === 1 ? 'var(--dj-orange)' : 'var(--fg-pri)',
                  }}
                >
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.name} — {d.priceEok.toLocaleString()}억원
                  </span>
                  <span
                    style={{
                      font: '500 12px/1.4 var(--font-sans)',
                      color: 'var(--fg-tertiary)',
                      marginLeft: 6,
                    }}
                  >
                    ({d.areaSqm}㎡)
                  </span>
                </li>
              ))}
              {topDeals.length === 0 && (
                <li
                  style={{
                    color: 'var(--fg-tertiary)',
                    font: '500 14px/1.5 var(--font-sans)',
                    listStyle: 'none',
                  }}
                >
                  최근 30일 거래 데이터 없음
                </li>
              )}
            </ol>
          </div>
        </section>

        {/* 섹션 4 — 실행 로그 */}
        <section>
          <h2 style={sectionLabelStyle}>실행 로그</h2>
          <div className="card" style={{ padding: '20px 24px' }}>
            <a
              href="https://github.com/nickujung-art/bds/actions/workflows/weekly-cardnews.yml"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                font: '500 14px/1.5 var(--font-sans)',
                color: 'var(--fg-brand)',
                textDecoration: 'none',
              }}
            >
              GitHub Actions — weekly-cardnews 워크플로우 로그 보기 →
            </a>
            <p
              style={{
                font: '500 12px/1.4 var(--font-sans)',
                color: 'var(--fg-tertiary)',
                margin: '6px 0 0',
              }}
            >
              실행 이력·에러 로그는 GitHub Actions에서 직접 확인
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
