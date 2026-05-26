import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PresaleMapPin {
  id:           string
  name:         string
  lat:          number
  lng:          number
  move_in_ym:   string        // "202604" YYYYMM
  supply_count: number | null
  hssply_adres: string | null
}

export async function getPresalePinsForMap(
  supabase: SupabaseClient,
): Promise<PresaleMapPin[]> {
  const today = new Date()
  const ym = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('new_listings')
    .select('id, pblanc_nm, lat, lng, mvn_prearnge_ym, supply_count, hssply_adres')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .not('mvn_prearnge_ym', 'is', null)
    .not('pblanc_no', 'is', null)
    .gte('mvn_prearnge_ym', ym)
    .order('mvn_prearnge_ym', { ascending: true })

  if (error) throw new Error(`getPresalePinsForMap: ${error.message}`)

  return (data ?? []).map(d => ({
    id:           d.id as string,
    name:         (d.pblanc_nm ?? '분양단지') as string,
    lat:          d.lat as number,
    lng:          d.lng as number,
    move_in_ym:   d.mvn_prearnge_ym as string,
    supply_count: d.supply_count as number | null,
    hssply_adres: d.hssply_adres as string | null,
  }))
}
