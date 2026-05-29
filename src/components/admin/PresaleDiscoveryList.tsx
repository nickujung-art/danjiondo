'use client'

import { useState, useTransition } from 'react'
import {
  confirmDiscovery,
  rejectDiscovery,
  updateDiscoveryNotes,
} from '@/lib/actions/presale-discovery-actions'

interface ArchHubData {
  bldNm?: string | null
  platPlc?: string | null
  totHoCnt?: number | null
  archPermYmd?: string | null
  [key: string]: unknown
}

interface DiscoveryRow {
  id: string
  name: string
  region: string | null
  hssply_adres: string | null
  lat: number | null
  lng: number | null
  source_url: string | null
  arch_hub_id: string | null
  arch_hub_data: ArchHubData | null
  status: 'pending' | 'confirmed' | 'rejected'
  admin_notes: string | null
  confirmed_at: string | null
  new_listing_id: string | null
  discovered_at: string | null
  created_at: string
}

interface Props {
  rows: DiscoveryRow[]
  status: 'pending' | 'confirmed' | 'rejected'
}

function formatDate(s: string | null) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function StatusBadge({ status }: { status: 'pending' | 'confirmed' | 'rejected' }) {
  const styles: Record<string, { background: string; color: string }> = {
    pending: { background: '#fff3e0', color: '#e65100' },
    confirmed: { background: '#e8f5e9', color: '#1b5e20' },
    rejected: { background: '#f5f5f5', color: '#757575' },
  }
  const labels = { pending: '대기', confirmed: '승인', rejected: '거절' }
  const s = styles[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        font: '500 12px/20px var(--font-sans)',
        ...s,
      }}
    >
      {labels[status]}
    </span>
  )
}

function ArchHubBadge({ matched }: { matched: boolean }) {
  if (matched) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 4,
          font: '500 12px/20px var(--font-sans)',
          background: '#e8f5e9',
          color: '#1b5e20',
        }}
      >
        건축HUB ✓
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        font: '500 12px/20px var(--font-sans)',
        background: '#f5f5f5',
        color: '#9e9e9e',
      }}
    >
      검토 필요
    </span>
  )
}

function DiscoveryCard({
  row,
  isPending,
  readonly,
}: {
  row: DiscoveryRow
  isPending: boolean
  readonly: boolean
}) {
  const [notes, setNotes] = useState(row.admin_notes ?? '')
  const [notesPending, startNotesTrans] = useTransition()
  const [actionPending, startActionTrans] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const archData = row.arch_hub_data as ArchHubData | null

  function handleConfirm() {
    startActionTrans(async () => {
      const res = await confirmDiscovery(row.id)
      if (res.error) setMessage(`오류: ${res.error}`)
    })
  }

  function handleReject() {
    startActionTrans(async () => {
      const res = await rejectDiscovery(row.id)
      if (res.error) setMessage(`오류: ${res.error}`)
    })
  }

  function handleSaveNotes() {
    startNotesTrans(async () => {
      const res = await updateDiscoveryNotes(row.id, notes)
      if (res.error) setMessage(`오류: ${res.error}`)
      else setMessage('메모 저장됨')
    })
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--line-default)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 12,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ font: '600 16px/1.3 var(--font-sans)', color: 'var(--fg-primary)' }}>
            {row.name}
          </span>
          {row.region && (
            <span style={{ font: '400 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>
              {row.region}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <StatusBadge status={row.status} />
          <ArchHubBadge matched={!!row.arch_hub_id} />
        </div>
      </div>

      {/* 정보 그리드 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '4px 16px',
          marginBottom: 12,
          font: '400 13px/1.6 var(--font-sans)',
          color: 'var(--fg-secondary)',
        }}
      >
        {row.hssply_adres && (
          <div>
            <span style={{ color: 'var(--fg-tertiary)' }}>주소 </span>
            {row.hssply_adres}
          </div>
        )}
        {row.discovered_at && (
          <div>
            <span style={{ color: 'var(--fg-tertiary)' }}>감지일 </span>
            {formatDate(row.discovered_at)}
          </div>
        )}
        {row.confirmed_at && (
          <div>
            <span style={{ color: 'var(--fg-tertiary)' }}>승인일 </span>
            {formatDate(row.confirmed_at)}
          </div>
        )}
        {row.source_url && (
          <div>
            <a
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}
            >
              뉴스 링크 ↗
            </a>
          </div>
        )}
        {row.new_listing_id && (
          <div>
            <span style={{ color: 'var(--fg-tertiary)' }}>new_listing_id </span>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.new_listing_id}</span>
          </div>
        )}
      </div>

      {/* 건축HUB 데이터 */}
      {archData && (
        <div
          style={{
            background: '#f9fbe7',
            border: '1px solid #e6ee9c',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 12,
            font: '400 13px/1.6 var(--font-sans)',
          }}
        >
          <div style={{ font: '500 12px/1 var(--font-sans)', color: '#558b2f', marginBottom: 6 }}>
            건축HUB 매칭 정보
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', color: 'var(--fg-secondary)' }}>
            {archData.bldNm && (
              <span><span style={{ color: 'var(--fg-tertiary)' }}>건물명 </span>{archData.bldNm}</span>
            )}
            {archData.totHoCnt != null && (
              <span><span style={{ color: 'var(--fg-tertiary)' }}>세대수 </span>{archData.totHoCnt}세대</span>
            )}
            {archData.archPermYmd && (
              <span><span style={{ color: 'var(--fg-tertiary)' }}>허가일 </span>{archData.archPermYmd}</span>
            )}
            {archData.platPlc && (
              <span><span style={{ color: 'var(--fg-tertiary)' }}>대지위치 </span>{archData.platPlc}</span>
            )}
          </div>
        </div>
      )}

      {/* 메모 */}
      {!readonly && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 4 }}>
            관리자 메모
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="메모 입력..."
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid var(--line-default)',
                borderRadius: 6,
                font: '400 13px/1 var(--font-sans)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSaveNotes}
              disabled={notesPending}
              style={{
                padding: '6px 14px',
                background: '#f5f5f5',
                border: '1px solid var(--line-default)',
                borderRadius: 6,
                font: '500 13px/1 var(--font-sans)',
                cursor: 'pointer',
                opacity: notesPending ? 0.6 : 1,
              }}
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* readonly 메모 표시 */}
      {readonly && row.admin_notes && (
        <div style={{ marginBottom: 12, font: '400 13px/1.5 var(--font-sans)', color: 'var(--fg-secondary)' }}>
          <span style={{ color: 'var(--fg-tertiary)' }}>메모 </span>
          {row.admin_notes}
        </div>
      )}

      {/* 액션 버튼 */}
      {!readonly && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleConfirm}
            disabled={actionPending || isPending}
            style={{
              padding: '8px 18px',
              background: '#1b5e20',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              font: '500 13px/1 var(--font-sans)',
              cursor: 'pointer',
              opacity: actionPending ? 0.6 : 1,
            }}
          >
            확인 승인
          </button>
          <button
            onClick={handleReject}
            disabled={actionPending || isPending}
            style={{
              padding: '8px 18px',
              background: '#fff',
              color: '#c62828',
              border: '1px solid #c62828',
              borderRadius: 6,
              font: '500 13px/1 var(--font-sans)',
              cursor: 'pointer',
              opacity: actionPending ? 0.6 : 1,
            }}
          >
            거절
          </button>
          {message && (
            <span style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function PresaleDiscoveryList({ rows, status }: Props) {
  const [, startTransition] = useTransition()
  const isPending = false // individual cards manage their own pending state

  if (rows.length === 0) {
    return (
      <p style={{ font: '400 14px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
        {status === 'pending' ? '검수 대기 항목이 없습니다.' : '항목이 없습니다.'}
      </p>
    )
  }

  const readonly = status !== 'pending'

  return (
    <div>
      <p style={{ font: '400 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 16 }}>
        총 {rows.length}건
      </p>
      {rows.map((row) => (
        <DiscoveryCard
          key={row.id}
          row={row}
          isPending={isPending}
          readonly={readonly}
        />
      ))}
      {/* suppress unused warning */}
      <span style={{ display: 'none' }} onClick={() => startTransition(() => {})} />
    </div>
  )
}
