type PricePoint = { month: string; price: number }

const cache = new Map<string, PricePoint[]>()
const inFlight = new Set<string>()

export function getPriceHistory(id: string): PricePoint[] | null {
  return cache.get(id) ?? null
}

export function prefetchPriceHistory(ids: string[]): void {
  const pending = ids.filter(id => !cache.has(id) && !inFlight.has(id))
  for (const id of pending) {
    inFlight.add(id)
    fetch(`/api/complexes/${id}/price-history`)
      .then(r => r.json() as Promise<{ prices: PricePoint[] }>)
      .then(data => { cache.set(id, data.prices ?? []); inFlight.delete(id) })
      .catch(() => inFlight.delete(id))
  }
}
