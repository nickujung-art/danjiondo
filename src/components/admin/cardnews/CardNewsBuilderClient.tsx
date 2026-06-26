'use client'
import { useState, useCallback } from 'react'
import { BuilderOptionsPanel, type BuilderOptions } from './BuilderOptionsPanel'
import { DataQualityWarning } from './DataQualityWarning'
import { BuilderPreviewPanel } from './BuilderPreviewPanel'
import { AiTextEditor, type AiFields } from './AiTextEditor'
import { ExportPanel } from './ExportPanel'

interface RankingRow {
  rank: number
  name: string | null
  subtitle?: string | null
  price: string | null
}

interface HtmlCards {
  cover: string
  highlight: string
  ranking: string
  closing: string
}

interface DataApiResponse {
  data: RankingRow[]
  from: string
  to: string
  warning: boolean
}

interface HtmlApiResponse {
  html: HtmlCards
}

export function CardNewsBuilderClient() {
  const [options, setOptions] = useState<BuilderOptions | null>(null)
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [dataWarning, setDataWarning] = useState(false)
  const [dataFrom, setDataFrom] = useState('')
  const [dataTo, setDataTo] = useState('')
  const [htmlCards, setHtmlCards] = useState<HtmlCards | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [htmlLoading, setHtmlLoading] = useState(false)
  const [, setAiFields] = useState<AiFields>({
    title: '',
    caption: '',
    insight: '',
    sns: '',
    hashtags: '',
  })

  const handleOptionsSubmit = useCallback(async (opts: BuilderOptions) => {
    setOptions(opts)
    setDataLoading(true)
    setHtmlCards(null)
    try {
      // 1. 데이터 조회
      const dataRes = await fetch('/api/admin/cardnews/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: opts.period,
          topic: opts.topic,
          sggCodes: opts.sggCodes,
          areaMin: opts.areaMin,
          areaMax: opts.areaMax,
          customFrom: opts.customFrom,
          customTo: opts.customTo,
        }),
      })
      const dataResult = (await dataRes.json()) as DataApiResponse
      setRanking(dataResult.data ?? [])
      setDataWarning(dataResult.warning ?? false)
      setDataFrom(dataResult.from ?? '')
      setDataTo(dataResult.to ?? '')

      // 2. HTML 생성
      setHtmlLoading(true)
      const now = new Date()
      const week = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${Math.ceil(now.getDate() / 7)}주`
      const htmlRes = await fetch('/api/admin/cardnews/generate-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ranking: dataResult.data,
          week,
          region: opts.regionLabel,
          area: opts.areaMax < 300 ? `${opts.areaMin}~${opts.areaMax}㎡` : null,
          period: opts.period,
          topic: opts.topic,
          seriesType: opts.topic,
          source: '국토교통부 실거래가 공개시스템',
        }),
      })
      const htmlResult = (await htmlRes.json()) as HtmlApiResponse
      setHtmlCards(htmlResult.html)
    } finally {
      setDataLoading(false)
      setHtmlLoading(false)
    }
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">카드뉴스 빌더</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측 패널: 옵션 + 경고 + AI + 내보내기 */}
        <div className="space-y-4">
          <BuilderOptionsPanel
            onSubmit={handleOptionsSubmit}
            loading={dataLoading || htmlLoading}
          />
          {(dataWarning || ranking.length < 3) && ranking.length > 0 && (
            <DataQualityWarning
              warning={dataWarning}
              from={dataFrom}
              to={dataTo}
              dataCount={ranking.length}
            />
          )}
          <AiTextEditor
            options={options}
            ranking={ranking}
            onFieldsChange={setAiFields}
          />
          <ExportPanel htmlCards={htmlCards} />
        </div>
        {/* 우측 패널: 미리보기 */}
        <div className="lg:col-span-2">
          <BuilderPreviewPanel htmlCards={htmlCards} loading={htmlLoading} />
        </div>
      </div>
    </div>
  )
}
