import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getComplexesForMap } from '@/lib/data/complexes-map'
import { getPresalePinsForMap } from '@/lib/data/presale-pins'
import { searchComplexes } from '@/lib/data/complex-search'
import { getActiveAds } from '@/lib/data/ads'
import { getActiveSggCodes } from '@/lib/data/regions'
import { MapView } from '@/components/map/MapView'
import { SidePanel } from '@/components/search/SidePanel'

export const revalidate = 0

interface Props {
  searchParams: Promise<{ q?: string }>
}

export default async function MapPage({ searchParams }: Props) {
  const { q = '' } = await searchParams
  const supabase = createReadonlyClient()
  const activeSggCodes = await getActiveSggCodes(supabase)

  const [complexes, searchResults, presalePins, mapPopupAds, inFeedAds] = await Promise.all([
    getComplexesForMap(activeSggCodes, supabase).catch((err: unknown) => {
      console.error('[map] getComplexesForMap failed:', err)
      return []
    }),
    searchComplexes(q, activeSggCodes, supabase).catch(() => []),
    getPresalePinsForMap(supabase).catch(() => []),
    getActiveAds('map_popup', supabase).catch(() => []),
    getActiveAds('in_feed', supabase).catch(() => []),
  ])
  return (
    <main
      className="flex overflow-hidden h-[calc(100dvh-120px)] sm:h-[calc(100dvh-56px)]"
    >
      <h1 className="sr-only">단지온도 지도 — 창원·김해 아파트 실거래가</h1>
      <div className="hidden sm:block flex-shrink-0">
        <SidePanel query={q} complexes={searchResults} inFeedAds={inFeedAds} />
      </div>
      <div className="flex-1">
        <MapView complexes={complexes} presalePins={presalePins} mapPopupAds={mapPopupAds} />
      </div>
    </main>
  )
}
