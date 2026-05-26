'use client'

import { useState } from 'react'
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
  const [selectedComplexId, setSelectedComplexId] = useState('')
  const [displayOrder, setDisplayOrder] = useState<1 | 2>(1)
  const [assignError, setAssignError] = useState<string | null>(null)

  const filteredComplexes = complexSearch.trim()
    ? complexes
        .filter(
          c =>
            c.canonical_name.includes(complexSearch) ||
            (c.gu ?? '').includes(complexSearch) ||
            (c.si ?? '').includes(complexSearch),
        )
        .slice(0, 50)
    : complexes.slice(0, 50)

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
    if (!selectedComplexId) {
      setAssignError('단지를 선택하세요.')
      return
    }
    setAssignError(null)
    const result = await assignRealtorToComplex(realtor.id, selectedComplexId, displayOrder)
    if (result.error) {
      setAssignError(result.error)
      return
    }
    const found = complexes.find(c => c.id === selectedComplexId)
    if (found) {
      setLocalAssignments(prev => [
        ...prev.filter(
          a => !(a.complex_id === selectedComplexId && a.display_order === displayOrder),
        ),
        {
          id: `temp-${Date.now()}`,
          realtor_id: realtor.id,
          complex_id: selectedComplexId,
          display_order: displayOrder,
          created_at: new Date().toISOString(),
          complexes: { id: found.id, canonical_name: found.canonical_name },
        },
      ])
    }
    setSelectedComplexId('')
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

        {/* 새 배정 추가 */}
        <div>
          <p style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)', margin: '0 0 10px' }}>
            새 배정 추가
          </p>
          <div style={{ marginBottom: 8 }}>
            <input
              type="text"
              value={complexSearch}
              onChange={e => setComplexSearch(e.target.value)}
              placeholder="단지명 검색..."
              className="input"
              style={{ width: '100%', height: 36, fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selectedComplexId}
              onChange={e => setSelectedComplexId(e.target.value)}
              className="input"
              style={{ flex: 1, height: 36, fontSize: 13 }}
            >
              <option value="">단지 선택</option>
              {filteredComplexes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.canonical_name} ({c.gu ?? c.si ?? ''})
                </option>
              ))}
            </select>
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
              style={{ height: 36, whiteSpace: 'nowrap', fontSize: 13 }}
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
