'use client'
import { useState } from 'react'

// D-09 LOCKED 옵션
const PERIOD_TYPES = [
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
  { label: '성산구', sggCodes: ['48123'] },
  { label: '의창구', sggCodes: ['48121'] },
  { label: '마산합포구', sggCodes: ['48125'] },
  { label: '마산회원구', sggCodes: ['48127'] },
  { label: '진해구', sggCodes: ['48129'] },
  { label: '김해시', sggCodes: ['48250'] },
  { label: '진주시', sggCodes: ['48170'] },
  { label: '통영시', sggCodes: ['48220'] },
  { label: '사천시', sggCodes: ['48240'] },
  { label: '밀양시', sggCodes: ['48270'] },
  { label: '거제시', sggCodes: ['48310'] },
  { label: '양산시', sggCodes: ['48330'] },
  { label: '의령군', sggCodes: ['48720'] },
  { label: '함안군', sggCodes: ['48730'] },
  { label: '창녕군', sggCodes: ['48740'] },
  { label: '고성군', sggCodes: ['48820'] },
  { label: '남해군', sggCodes: ['48840'] },
  { label: '하동군', sggCodes: ['48850'] },
  { label: '산청군', sggCodes: ['48860'] },
  { label: '함양군', sggCodes: ['48870'] },
  { label: '거창군', sggCodes: ['48880'] },
  { label: '합천군', sggCodes: ['48890'] },
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
  periodType: string
  periodLabel: string
  topic: string
  regionLabel: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  customFrom: string
  customTo: string
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SubPeriod { label: string; from: string; to: string }

function getSubPeriods(type: string): SubPeriod[] {
  const now = new Date()

  if (type === 'weekly') {
    const dow = now.getDay()
    const daysToMon = dow === 0 ? 6 : dow - 1
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - daysToMon)
    thisMonday.setHours(0, 0, 0, 0)
    return Array.from({ length: 8 }, (_, i) => {
      const mon = new Date(thisMonday)
      mon.setDate(thisMonday.getDate() - i * 7)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      const m = mon.getMonth() + 1
      const w = Math.ceil(mon.getDate() / 7)
      const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
      return {
        label: `${mon.getFullYear()}년 ${m}월 ${w}주차 (${fmt(mon)}~${fmt(sun)})`,
        from: toYMD(mon),
        to: toYMD(sun),
      }
    })
  }

  if (type === 'monthly') {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth()
      const lastDay = new Date(y, m + 1, 0)
      return {
        label: `${y}년 ${m + 1}월`,
        from: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        to: toYMD(lastDay),
      }
    })
  }

  if (type === 'quarterly') {
    const curQ = Math.floor(now.getMonth() / 3)
    return Array.from({ length: 6 }, (_, i) => {
      let q = curQ - i
      let y = now.getFullYear()
      while (q < 0) { q += 4; y-- }
      const fromMonth = q * 3 + 1
      const toMonth = fromMonth + 2
      const lastDay = new Date(y, toMonth, 0)
      return {
        label: `${y}년 ${q + 1}분기 (${fromMonth}~${toMonth}월)`,
        from: `${y}-${String(fromMonth).padStart(2, '0')}-01`,
        to: toYMD(lastDay),
      }
    })
  }

  if (type === 'yearly') {
    return Array.from({ length: 5 }, (_, i) => {
      const y = now.getFullYear() - i
      return {
        label: `${y}년`,
        from: `${y}-01-01`,
        to: i === 0 ? toYMD(now) : `${y}-12-31`,
      }
    })
  }

  return []
}

const BTN_BASE = 'px-3 py-1.5 text-sm rounded-md border transition-colors'
const BTN_ON = 'bg-blue-600 text-white border-blue-600'
const BTN_OFF = 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'

interface Props {
  onSubmit: (opts: BuilderOptions) => void
  loading: boolean
}

export function BuilderOptionsPanel({ onSubmit, loading }: Props) {
  const [periodType, setPeriodType] = useState('weekly')
  const [subPeriodIdx, setSubPeriodIdx] = useState(0)
  const [topic, setTopic] = useState('sale_top')
  const [regionIdx, setRegionIdx] = useState(0)
  const [sizeIdx, setSizeIdx] = useState(0)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const subPeriods = getSubPeriods(periodType)

  const handleSubmit = () => {
    const region = REGION_OPTIONS[regionIdx]
    const size = SIZE_OPTIONS[sizeIdx]
    if (!region || !size) return

    let from = customFrom
    let to = customTo
    let label = `${customFrom} ~ ${customTo}`

    if (periodType !== 'custom') {
      const sub = subPeriods[subPeriodIdx]
      if (!sub) return
      from = sub.from
      to = sub.to
      label = sub.label
    }

    onSubmit({
      period: 'custom',
      periodType,
      periodLabel: label,
      topic,
      regionLabel: region.label,
      sggCodes: [...region.sggCodes],
      areaMin: size.areaMin,
      areaMax: size.areaMax,
      customFrom: from,
      customTo: to,
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
      <h2 className="text-base font-semibold text-gray-900">카드뉴스 옵션</h2>

      {/* 기간 타입 */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">기간</legend>
        <div className="flex flex-wrap gap-2 mb-3">
          {PERIOD_TYPES.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setPeriodType(opt.value); setSubPeriodIdx(0) }}
              className={`${BTN_BASE} ${periodType === opt.value ? BTN_ON : BTN_OFF}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 세부 기간 선택 */}
        {periodType !== 'custom' && subPeriods.length > 0 && (
          <select
            value={subPeriodIdx}
            onChange={e => setSubPeriodIdx(Number(e.target.value))}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
          >
            {subPeriods.map((sp, i) => (
              <option key={i} value={i}>{sp.label}</option>
            ))}
          </select>
        )}

        {/* 직접 입력 날짜 */}
        {periodType === 'custom' && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            />
            <span className="text-gray-400">~</span>
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
              className={`${BTN_BASE} ${topic === opt.value ? BTN_ON : BTN_OFF}`}
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
              className={`${BTN_BASE} ${regionIdx === i ? BTN_ON : BTN_OFF}`}
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
              className={`${BTN_BASE} ${sizeIdx === i ? BTN_ON : BTN_OFF}`}
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
