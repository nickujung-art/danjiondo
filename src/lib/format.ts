// src/lib/format.ts
// 가격·평수·날짜 포맷 유틸 — page.tsx에서 추출, 프로젝트 전반 공유

export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price < 0) return '—'
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}

/**
 * 갭 라벨 차액 포맷 — 만원 단위 정수 입력
 * 1억 이상: "N억 M만원" (M=0이면 "N억")
 * 1억 미만: "N만원"
 */
export function formatGap(gapWan: number): string {
  if (!Number.isFinite(gapWan)) return '—'
  const abs = Math.abs(gapWan)
  if (abs >= 10000) {
    const uk = Math.floor(abs / 10000)
    const man = abs % 10000
    if (man > 0) return `${uk}억 ${man}만원`
    return `${uk}억`
  }
  return `${abs}만원`
}

export function formatPyeong(area_m2: number): string {
  return `${Math.round(area_m2 / 3.3058)}평`
}

export function formatDealDate(dealDate: string): string {
  const today = new Date().toISOString().split('T')[0]!
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]!
  if (dealDate === today) return '오늘'
  if (dealDate === yesterday) return '어제'
  const d = new Date(dealDate)
  return `${d.getMonth() + 1}.${d.getDate()}`
}
