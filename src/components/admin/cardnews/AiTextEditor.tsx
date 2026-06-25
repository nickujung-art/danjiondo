'use client'
import { useState, useCallback } from 'react'
import type { BuilderOptions } from './BuilderOptionsPanel'

// AI 생성 필드 (D-05: 인라인 편집 가능)
export interface AiFields {
  title: string
  caption: string
  insight: string
  sns: string
  hashtags: string
}

interface RankingRow {
  rank: number
  name: string | null
  price: string | null
}

interface Props {
  options: BuilderOptions | null
  ranking: RankingRow[]
  onFieldsChange: (fields: AiFields) => void
}

const INITIAL_FIELDS: AiFields = {
  title: '',
  caption: '',
  insight: '',
  sns: '',
  hashtags: '',
}

const FIELD_LABELS: Record<keyof AiFields, string> = {
  title: '제목',
  caption: '커버 캡션',
  insight: '시황 인사이트',
  sns: 'SNS 캡션',
  hashtags: '해시태그',
}

interface AiApiResponse {
  title?: string
  caption?: string
  insight?: string
  sns?: string
  hashtags?: string
  fallback?: boolean
}

export function AiTextEditor({ options, ranking, onFieldsChange }: Props) {
  const [fields, setFields] = useState<AiFields>(INITIAL_FIELDS)
  const [loading, setLoading] = useState(false)
  const [fallback, setFallback] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!options || !ranking.length) return
    setLoading(true)
    setFallback(false)
    try {
      const res = await fetch('/api/admin/cardnews/ai-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: options.topic,
          region: options.regionLabel,
          area: options.areaMax < 300 ? `${options.areaMin}~${options.areaMax}㎡` : null,
          period: options.period,
          ranking: ranking.slice(0, 5),
          options: {
            cover_caption: true,
            insight: true,
            sns_caption: true,
            hashtags: true,
            title_mode: 'ai',
          },
        }),
      })
      const data = (await res.json()) as AiApiResponse
      if (data.fallback) {
        setFallback(true)
        return
      }
      const newFields: AiFields = {
        title: data.title ?? '',
        caption: data.caption ?? '',
        insight: data.insight ?? '',
        sns: data.sns ?? '',
        hashtags: data.hashtags ?? '',
      }
      setFields(newFields)
      onFieldsChange(newFields)
    } finally {
      setLoading(false)
    }
  }, [options, ranking, onFieldsChange])

  const updateField = (key: keyof AiFields, value: string) => {
    const newFields = { ...fields, [key]: value }
    setFields(newFields)
    onFieldsChange(newFields)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">AI 텍스트</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !options}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '생성 중...' : 'AI 생성'}
        </button>
      </div>

      {fallback && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          AI 생성 실패. 직접 입력하거나 재시도하세요.
        </p>
      )}

      <div className="space-y-3">
        {(Object.keys(FIELD_LABELS) as (keyof AiFields)[]).map(key => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {FIELD_LABELS[key]}
            </label>
            {/* D-05 LOCKED: 인라인 편집 가능 — textarea (XSS 안전, contentEditable 대안) */}
            <textarea
              value={fields[key]}
              onChange={e => updateField(key, e.target.value)}
              rows={key === 'insight' || key === 'sns' ? 3 : 1}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={`${FIELD_LABELS[key]} 직접 입력...`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
