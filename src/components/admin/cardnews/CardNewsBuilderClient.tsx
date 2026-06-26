'use client'
import { useState, useCallback } from 'react'
import { BuilderOptionsPanel, type BuilderOptions } from './BuilderOptionsPanel'
import { DataQualityWarning } from './DataQualityWarning'
import { BuilderPreviewPanel } from './BuilderPreviewPanel'
import { AiTextEditor, type AiFields } from './AiTextEditor'
import { ExportPanel } from './ExportPanel'
import { CardTextEditor, type TextOverrides } from './CardTextEditor'

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
  const [textOverrides, setTextOverrides] = useState<TextOverrides>({})
  const [, setAiFields] = useState<AiFields>({
    title: '',
    caption: '',
    insight: '',
    sns: '',
    hashtags: '',
  })

  const generateHtml = useCallback(
    async (rows: RankingRow[], opts: BuilderOptions, overrides: TextOverrides) => {
      setHtmlLoading(true)
      try {
        const res = await fetch('/api/admin/cardnews/generate-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ranking: rows,
            week: opts.periodLabel,
            region: opts.regionLabel,
            area: opts.areaMax < 300 ? `${opts.areaMin}~${opts.areaMax}㎡` : null,
            period: `${opts.customFrom} ~ ${opts.customTo}`,
            topic: opts.topic,
            seriesType: opts.topic,
            source: '국토교통부 실거래가 공개시스템',
            textOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
          }),
        })
        const result = (await res.json()) as HtmlApiResponse
        setHtmlCards(result.html)
      } finally {
        setHtmlLoading(false)
      }
    },
    [],
  )

  const handleOptionsSubmit = useCallback(
    async (opts: BuilderOptions) => {
      setOptions(opts)
      setDataLoading(true)
      setHtmlCards(null)
      try {
        const dataRes = await fetch('/api/admin/cardnews/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: 'custom',
            topic: opts.topic,
            sggCodes: opts.sggCodes,
            areaMin: opts.areaMin,
            areaMax: opts.areaMax,
            customFrom: opts.customFrom,
            customTo: opts.customTo,
          }),
        })
        const dataResult = (await dataRes.json()) as DataApiResponse
        const rows = dataResult.data ?? []
        setRanking(rows)
        setDataWarning(dataResult.warning ?? false)
        setDataFrom(dataResult.from ?? '')
        setDataTo(dataResult.to ?? '')
        await generateHtml(rows, opts, textOverrides)
      } finally {
        setDataLoading(false)
      }
    },
    [generateHtml, textOverrides],
  )

  const handleRegenerate = useCallback(async () => {
    if (!options || ranking.length === 0) return
    await generateHtml(ranking, options, textOverrides)
  }, [generateHtml, options, ranking, textOverrides])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">카드뉴스 빌더</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측 패널 */}
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
          <CardTextEditor
            overrides={textOverrides}
            onChange={setTextOverrides}
            onRegenerate={handleRegenerate}
            loading={htmlLoading}
            disabled={!options || ranking.length === 0}
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
