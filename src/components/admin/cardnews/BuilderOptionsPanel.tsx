'use client'
import { useState } from 'react'

// D-09 LOCKED 옵션 — 이 목록은 CONTEXT.md D-09에 잠금됨
const PERIOD_OPTIONS = [
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
  { value: 'quarterly', label: '분기' },
  { value: 'yearly', label: '연간' },
  { value: 'custom', label: '직접 입력' },
] as const

const TOPIC_OPTIONS = [
  { value: 'sale_top', label: '매매 TOP10' },
  { value: 'jeonse_top', label: '전세 TOP10' },
  { value: 'monthly_top', label: '월세 TOP10 (보증금)' },
  { value: 'volume', label: '거래량 TOP10' },
  { value: 'value', label: '거래액 TOP10' },
  { value: 'alltime_high', label: '역대 최고가' },
  { value: 'price_change', label: '가격 변동' },
  { value: 'district_champions', label: '구별 챔피언' },
] as const

const REGION_OPTIONS = [
  { label: '창원 전체', sggCodes: ['48121', '48123', '48125', '48127', '48129'] },
  { label: '성산구', sggCodes: ['48123'] },    // D-09 LOCKED: 성산구=48123
  { label: '의창구', sggCodes: ['48121'] },    // D-09 LOCKED: 의창구=48121
  { label: '마산합포구', sggCodes: ['48125'] }, // D-09 LOCKED: 마산합포구=48125
  { label: '마산회원구', sggCodes: ['48127'] }, // D-09 LOCKED: 마산회원구=48127
  { label: '진해구', sggCodes: ['48129'] },    // D-09 LOCKED: 진해구=48129
  { label: '김해시', sggCodes: ['48250'] },    // D-09 LOCKED: 김해시=48250
]

const SIZE_OPTIONS = [
  { label: '전체', areaMin: 0, areaMax: 300 },
  { label: '59㎡대', areaMin: 49, areaMax: 75 },
  { label: '84㎡대', areaMin: 75, areaMax: 100 },
  { label: '101㎡대', areaMin: 100, areaMax: 120 },
  { label: '대형', areaMin: 120, areaMax: 300 },
]

export interface BuilderOptions {
  period: string
  topic: string
  regionLabel: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  customFrom: string
  customTo: string
}

interface Props {
  onSubmit: (opts: BuilderOptions) => void
  loading: boolean
}

export function BuilderOptionsPanel({ onSubmit, loading }: Props) {
  const [period, setPeriod] = useState<string>('weekly')
  const [topic, setTopic] = useState<string>('sale_top')
  const [regionIdx, setRegionIdx] = useState(0)
  const [sizeIdx, setSizeIdx] = useState(0)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const handleSubmit = () => {
    const region = REGION_OPTIONS[regionIdx]
    const size = SIZE_OPTIONS[sizeIdx]
    if (!region || !size) return
    onSubmit({
      period,
      topic,
      regionLabel: region.label,
      sggCodes: [...region.sggCodes],
      areaMin: size.areaMin,
      areaMax: size.areaMax,
      customFrom,
      customTo,
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
      <h2 className="text-base font-semibold text-gray-900">카드뉴스 옵션</h2>

      {/* 기간 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">기간</legend>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                period === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex gap-2 mt-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            />
            <span className="text-gray-400 self-center">~</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            />
          </div>
        )}
      </fieldset>

      {/* 주제 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">주제</legend>
        <div className="flex flex-wrap gap-2">
          {TOPIC_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTopic(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                topic === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* 지역 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">지역</legend>
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setRegionIdx(i)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                regionIdx === i
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* 평형 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">평형</legend>
        <div className="flex flex-wrap gap-2">
          {SIZE_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSizeIdx(i)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                sizeIdx === i
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? '조회 중...' : '데이터 조회'}
      </button>
    </div>
  )
}
