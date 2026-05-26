'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { updateRealtor, assignRealtorToComplex, removeRealtorAssignment } from '@/lib/auth/realtor-actions'
import type { Realtor } from '@/lib/data/realtors'

type AssignmentWithComplex = {
  id: string
  realtor_id: string
  complex_id: string
  display_order: number
  created_at: string
  complexes: { id: string; canonical_name: string } | null
}

type ComplexOption = {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
}

interface Props {
  realtor: Realtor
  assignments: AssignmentWithComplex[]
  complexes: ComplexOption[]
}

export function RealtorEditForm({ realtor, assignments, complexes }: Props) {
  const router = useRouter()

  // 기본 정보 수정 상태
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // 단지 배정 상태
  const [localAssignments, setLocalAssignments] = useState<AssignmentWithComplex[]>(assignments)
  const [complexSearch, setComplexSearch] = useState('')
  const [selectedComplex, setSelectedComplex] = useState<ComplexOption | null>(null)
  const [displayOrder, setDisplayOrder] = useState<1 | 2>(1)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredComplexes = complexSearch.trim()
    ? complexes
        .filter(
          c =>
            c.canonical_name.includes(complexSearch) ||
            (c.gu ?? '').includes(complexSearch) ||
            (c.si ?? '').includes(complexSearch),
        )
        .slice(0, 50)
    : []

  function selectComplex(c: ComplexOption) {
    setSelectedComplex(c)
    setComplexSearch(c.canonical_name)
    setShowList(false)
    setHighlightIndex(-1)
    setAssignError(null)
  }

  function handleSearchChange(val: string) {
    setComplexSearch(val)
    setSelectedComplex(null)
    setShowList(true)
    setHighlightIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showList && filteredComplexes.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex(i => Math.min(i + 1, filteredComplexes.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const idx = highlightIndex >= 0 ? highlightIndex : 0
        const item = filteredComplexes[idx]
        if (item) selectComplex(item)
        return
      }
      if (e.key === 'Escape') {
        setShowList(false)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedComplex) void handleAddAssignment()
    }
  }

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(false)
    try {
      const result = await updateRealtor(realtor.id, formData)
      if (result.error) {
        setSubmitError(result.error)
      } else {
        setSubmitSuccess(true)
      }
    } catch {
      setSubmitError('저장 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAddAssignment() {
    if (!selectedComplex) {
      setAssignError('단지를 검색하여 선택하세요.')
      return
    }
    setAssignError(null)
    const result = await assignRealtorToComplex(realtor.id, selectedComplex.id, displayOrder)
    if (result.error) {
      setAssignError(result.error)
      return
    }
    setLocalAssignments(prev => [
      ...prev.filter(
        a => !(a.complex_id === selectedComplex.id && a.display_order === displayOrder),
      ),
      {
        id: `temp-${Date.now()}`,
        realtor_id: realtor.id,
        complex_id: selectedComplex.id,
        display_order: displayOrder,
        created_at: new Date().toISOString(),
        complexes: { id: selectedComplex.id, canonical_name: selectedComplex.canonical_name },
      },
    ])
    setSelectedComplex(null)
    setComplexSearch('')
  }

  async function handleRemoveAssignment(assignmentId: string, complexId: string) {
    if (!confirm('이 단지 배정을 해제하시겠습니까?')) return
    const result = await removeRealtorAssignment(assignmentId, complexId)
    if (result.error) {
      alert(result.error)
      return
    }
    setLocalAssignments(prev => prev.filter(a => a.id !== assignmentId))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 섹션 1: 기본 정보 수정 */}
      <div className="card" style={{ padding: '28px 32px' }}>
        <h2 style={{ font: '700 16px/1.3 var(--font-sans)', margin: '0 0 20px', letterSpacing: '-0.01em' }}>
          기본 정보
        </h2>
        <form action={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <Field label="중개사 이름" required>
              <input
                name="name"
                className="input"
                required
                style={inputStyle}
                defaultValue={realtor.name}
              />
            </Field>

            <Field label="사무소명" required>
              <input
                name="agency_name"
                className="input"
                required
                style={inputStyle}
                defaultValue={realtor.agency_name}
              />
            </Field>

            <Field label="전화번호" required>
              <input
                name="phone"
                type="tel"
                className="input"
                required
                style={inputStyle}
                defaultValue={realtor.phone}
              />
            </Field>

            <Field label="소개글">
              <textarea
                name="description"
                rows={4}
                className="input"
                style={{ width: '100%', fontSize: 14, resize: 'vertical', padding: '10px 12px', height: 'auto' }}
                defaultValue={realtor.description ?? ''}
              />
            </Field>

            <Field label="자격번호">
              <input
                name="license_no"
                className="input"
                style={inputStyle}
                defaultValue={realtor.license_no ?? ''}
              />
            </Field>

            <Field label="프로필 이미지 URL">
              <input
                name="image_url"
                type="url"
                className="input"
                style={inputStyle}
                defaultValue={realtor.image_url ?? ''}
              />
            </Field>

            <Field label="활성 상태">
              <select
                name="is_active"
                className="input"
                style={inputStyle}
                defaultValue={realtor.is_active ? 'true' : 'false'}
              >
                <option value="true">활성</option>
                <option value="false">비활성</option>
              </select>
            </Field>

            {submitError && (
              <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>
                {submitError}
              </p>
            )}

            {submitSuccess && (
              <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-positive)', margin: 0 }}>
                저장되었습니다.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-md btn-ghost"
                onClick={() => router.push('/admin/realtors')}
                disabled={isSubmitting}
              >
                취소
              </button>
              <button
                type="submit"
                className="btn btn-md btn-orange"
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.5 : 1 }}
              >
                {isSubmitting ? '저장 중…' : '저장'}
              </button>
            </div>

          </div>
        </form>
      </div>

      {/* 섹션 2: 단지 배정 */}
      <div className="card" style={{ padding: '28px 32px' }}>
        <h2 style={{ font: '700 16px/1.3 var(--font-sans)', margin: '0 0 16px', letterSpacing: '-0.01em' }}>
          단지 배정
        </h2>

        {/* 현재 배정 목록 */}
        {localAssignments.length === 0 ? (
          <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 16px' }}>
            배정된 단지가 없습니다.
          </p>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {localAssignments.map(a => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--line-subtle)',
                }}
              >
                <span style={{ font: '500 13px/1 var(--font-sans)' }}>
                  {a.complexes?.canonical_name ?? complexes.find(c => c.id === a.complex_id)?.canonical_name ?? a.complex_id}
                  <span style={{ color: 'var(--fg-sec)', marginLeft: 8 }}>({a.display_order}번)</span>
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11, color: '#dc2626' }}
                  onClick={() => handleRemoveAssignment(a.id, a.complex_id)}
                >
                  해제
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 새 배정 추가 — Combobox */}
        <div>
          <p style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)', margin: '0 0 10px' }}>
            새 배정 추가
          </p>

          {/* 검색 입력 + 드롭다운 리스트 */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              ref={inputRef}
              type="text"
              value={complexSearch}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (complexSearch.trim() && !selectedComplex) setShowList(true) }}
              onBlur={() => setTimeout(() => setShowList(false), 150)}
              placeholder="단지명 또는 구 검색 후 ↓Enter로 선택…"
              className="input"
              style={{ width: '100%', height: 36, fontSize: 13 }}
            />
            {showList && filteredComplexes.length > 0 && (
              <ul
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: '#fff',
                  border: '1px solid var(--line-default)',
                  borderRadius: 6,
                  marginTop: 2,
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: 0,
                  listStyle: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
                }}
              >
                {filteredComplexes.map((c, i) => (
                  <li
                    key={c.id}
                    onMouseDown={() => selectComplex(c)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      font: '500 13px/1.3 var(--font-sans)',
                      background: i === highlightIndex ? 'var(--bg-surface-2)' : 'transparent',
                      color: 'var(--fg-pri)',
                      borderBottom: i < filteredComplexes.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                    }}
                  >
                    {c.canonical_name}
                    <span style={{ color: 'var(--fg-sec)', marginLeft: 8, fontSize: 12 }}>
                      {c.gu ?? c.si ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 선택된 단지 표시 + display_order + 배정 버튼 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                borderRadius: 6,
                border: selectedComplex
                  ? '1px solid var(--dj-orange)'
                  : '1px dashed var(--line-subtle)',
                background: selectedComplex ? 'oklch(97% 0.01 60)' : 'transparent',
                font: selectedComplex
                  ? '600 13px/1 var(--font-sans)'
                  : '400 13px/1 var(--font-sans)',
                color: selectedComplex ? 'var(--fg-pri)' : 'var(--fg-tertiary)',
                transition: 'all 0.15s',
              }}
            >
              {selectedComplex
                ? `${selectedComplex.canonical_name} (${selectedComplex.gu ?? selectedComplex.si ?? ''})`
                : '단지를 검색하여 선택하세요'}
            </div>
            <select
              value={displayOrder}
              onChange={e => setDisplayOrder(Number(e.target.value) as 1 | 2)}
              className="input"
              style={{ width: 80, height: 36, fontSize: 13 }}
            >
              <option value={1}>1번</option>
              <option value={2}>2번</option>
            </select>
            <button
              type="button"
              className="btn btn-md btn-orange"
              style={{ height: 36, whiteSpace: 'nowrap', fontSize: 13, opacity: selectedComplex ? 1 : 0.4 }}
              disabled={!selectedComplex}
              onClick={handleAddAssignment}
            >
              배정
            </button>
          </div>

          {assignError && (
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: '6px 0 0' }}>
              {assignError}
            </p>
          )}
        </div>
      </div>

    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', height: 40, fontSize: 14 }
const labelStyle: React.CSSProperties = { font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <label style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--fg-negative)', marginLeft: 2 }}>*</span>}
        </label>
        {hint && (
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}
