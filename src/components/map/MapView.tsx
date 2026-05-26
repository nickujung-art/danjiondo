'use client'

import dynamic from 'next/dynamic'
import type { ComplexMapItem } from '@/lib/data/complexes-map'
import type { PresaleMapPin } from '@/lib/data/presale-pins'
import type { AdCampaign } from '@/lib/data/ads'

// SSR 비활성화 — kakao 글로벌 객체는 브라우저에서만 존재
const KakaoMap = dynamic(
  () => import('./KakaoMap').then((m) => m.KakaoMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
        지도 불러오는 중…
      </div>
    ),
  },
)

interface Props {
  complexes:      ComplexMapItem[]
  presalePins?:   PresaleMapPin[]
  mapPopupAds?:   AdCampaign[]
}

export function MapView({ complexes, presalePins = [], mapPopupAds = [] }: Props) {
  if (!process.env.NEXT_PUBLIC_KAKAO_JS_KEY) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-red-500 flex-col gap-1">
        <span>NEXT_PUBLIC_KAKAO_JS_KEY 환경변수가 설정되지 않았습니다.</span>
        <span className="text-xs text-gray-400">Vercel 대시보드 → Settings → Environment Variables에서 추가하세요.</span>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <KakaoMap complexes={complexes} presalePins={presalePins} mapPopupAds={mapPopupAds} />
    </div>
  )
}
