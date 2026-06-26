'use client'
import { useState } from 'react'
import type { TextOverrides } from '@/lib/cardnews/card-templates'

export type { TextOverrides }

interface FieldProps {
  label: string
  value: string
  placeholder: string
  multiline?: boolean
  onChange: (v: string) => void
}

function Field({ label, value, placeholder, multiline, onChange }: FieldProps) {
  const inputCls = 'w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-blue-400'
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          rows={2}
          onChange={e => onChange(e.target.value)}
          className={`${inputCls} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
      )}
    </div>
  )
}

interface Props {
  overrides: TextOverrides
  onChange: (overrides: TextOverrides) => void
  onRegenerate: () => void
  loading: boolean
  disabled: boolean
}

export function CardTextEditor({ overrides, onChange, onRegenerate, loading, disabled }: Props) {
  const [open, setOpen] = useState(false)

  const set = (key: keyof TextOverrides, value: string) => {
    onChange({ ...overrides, [key]: value || undefined })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <span>텍스트 직접 편집</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-gray-100">
          {/* 커버 카드 */}
          <section className="space-y-3 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">커버 카드</p>
            <Field
              label="타이틀 2줄"
              value={overrides.coverTitle2 ?? ''}
              placeholder="자동 생성 (주제별 기본값 사용)"
              onChange={v => set('coverTitle2', v)}
            />
            <Field
              label="타이틀 3줄"
              value={overrides.coverTitle3 ?? ''}
              placeholder="자동 생성"
              onChange={v => set('coverTitle3', v)}
            />
            <Field
              label="캡션"
              value={overrides.coverCaption ?? ''}
              placeholder="자동 생성"
              multiline
              onChange={v => set('coverCaption', v)}
            />
          </section>

          {/* 하이라이트 카드 */}
          <section className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">하이라이트 카드</p>
            <Field
              label="섹션 타이틀"
              value={overrides.highlightTitle ?? ''}
              placeholder="자동 생성 (예: 최고가 거래 TOP 3)"
              onChange={v => set('highlightTitle', v)}
            />
          </section>

          {/* 랭킹 카드 */}
          <section className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">랭킹 카드</p>
            <Field
              label="헤더"
              value={overrides.rankingHeader ?? ''}
              placeholder="자동 생성 (예: 실거래가 순위 1~10위)"
              onChange={v => set('rankingHeader', v)}
            />
          </section>

          {/* 클로징 카드 */}
          <section className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">클로징 카드</p>
            <Field
              label="메인 헤딩"
              value={overrides.closingHeading ?? ''}
              placeholder="매주 업데이트되는 창원 실거래가 리포트"
              multiline
              onChange={v => set('closingHeading', v)}
            />
            <Field
              label="부제"
              value={overrides.closingDesc ?? ''}
              placeholder="우리 동네 아파트 시세가 궁금하다면..."
              multiline
              onChange={v => set('closingDesc', v)}
            />
          </section>

          <button
            type="button"
            onClick={onRegenerate}
            disabled={loading || disabled}
            className="w-full py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '생성 중...' : '카드 재생성'}
          </button>
        </div>
      )}
    </div>
  )
}
