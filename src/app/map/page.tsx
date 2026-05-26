import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getComplexesForMap } from '@/lib/data/complexes-map'
import { getPresalePinsForMap } from '@/lib/data/presale-pins'
import { searchComplexes } from '@/lib/data/complex-search'
import { MapView } from '@/components/map/MapView'
import { SidePanel } from '@/components/search/SidePanel'
import Link from 'next/link'
import { UserMenu } from '@/components/auth/UserMenu'
import { Suspense } from 'react'

const TARGET_SGG = ['48121', '48123', '48125', '48127', '48129', '48250', '48720']

export const revalidate = 0

interface Props {
  searchParams: Promise<{ q?: string }>
}

export default async function MapPage({ searchParams }: Props) {
  const { q = '' } = await searchParams
  const supabase = createReadonlyClient()

  const [complexes, searchResults, presalePins] = await Promise.all([
    getComplexesForMap(TARGET_SGG, supabase).catch((err: unknown) => {
      console.error('[map] getComplexesForMap failed:', err)
      return []
    }),
    searchComplexes(q, TARGET_SGG, supabase).catch(() => []),
    getPresalePinsForMap(supabase).catch(() => []),
  ])
  return (
    <main className="flex h-screen flex-col">
      <h1 className="sr-only">단지온도 지도 — 창원·김해 아파트 실거래가</h1>
      <header
        style={{
          height: 60,
          borderBottom: '1px solid var(--line-default)',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 32,
          flexShrink: 0,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <nav
          style={{
            display: 'flex',
            gap: 24,
            font: '600 14px/1 var(--font-sans)',
          }}
        >
          <Link href="/" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            홈
          </Link>
          <Link
            href="/map"
            style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}
          >
            지도
          </Link>
          <Link href="#" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            분양
          </Link>
          <Link href="/favorites" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            관심단지
          </Link>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <SidePanel query={q} complexes={searchResults} />
        <div className="flex-1">
          <MapView complexes={complexes} presalePins={presalePins} />
        </div>
      </div>
    </main>
  )
}
