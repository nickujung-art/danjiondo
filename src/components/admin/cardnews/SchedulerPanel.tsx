'use client'
import { useState, useEffect, useCallback } from 'react'

interface LatestRun {
  id: number
  status: string
  conclusion: string | null
  created_at: string
  html_url: string
}

interface SchedulerStatus {
  enabled: boolean
  state: string
  latestRun: LatestRun | null
  nextScheduledRun: string
}

interface ToggleResponse {
  ok?: boolean
  enabled?: boolean
}

interface TriggerResponse {
  ok?: boolean
  run_url?: string
}

export function SchedulerPanel() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [runUrl, setRunUrl] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/cardnews/scheduler')
      const data = (await res.json()) as SchedulerStatus
      setStatus(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const handleToggle = async () => {
    if (!status) return
    setToggling(true)
    try {
      await fetch('/api/admin/cardnews/scheduler', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled } satisfies ToggleResponse),
      })
      await fetchStatus()
    } finally {
      setToggling(false)
    }
  }

  const handleManualTrigger = async () => {
    setTriggering(true)
    setRunUrl(null)
    try {
      const res = await fetch('/api/admin/cardnews/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false, series: '' }),
      })
      const data = (await res.json()) as TriggerResponse
      if (data.run_url) setRunUrl(data.run_url)
    } finally {
      setTriggering(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">스케줄러 상태 로딩 중...</p>
  if (!status) return <p className="text-sm text-red-500">상태를 불러오지 못했습니다.</p>

  const nextRun = new Date(status.nextScheduledRun).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="space-y-6">
      {/* 현재 상태 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">주간 자동화 상태</h2>
        <div className="flex items-center gap-3">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              status.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
          <span className="text-sm font-medium text-gray-900">
            {status.enabled ? '활성화' : '비활성화'}
          </span>
          <span className="text-xs text-gray-400">({status.state})</span>
        </div>
        <p className="text-sm text-gray-500">다음 예정 실행: {nextRun}</p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors disabled:opacity-50 ${
              status.enabled
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            {toggling ? '처리 중...' : status.enabled ? '비활성화' : '활성화'}
          </button>
          <button
            type="button"
            onClick={handleManualTrigger}
            disabled={triggering}
            className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {triggering ? '트리거 중...' : '수동 실행'}
          </button>
        </div>

        {runUrl && (
          <a
            href={runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            GitHub Actions 실행 확인
          </a>
        )}
      </div>

      {/* 최근 실행 */}
      {status.latestRun && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">최근 실행</h3>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                status.latestRun.conclusion === 'success'
                  ? 'bg-green-100 text-green-700'
                  : status.latestRun.conclusion === 'failure'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {status.latestRun.conclusion ?? status.latestRun.status}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(status.latestRun.created_at).toLocaleString('ko-KR')}
            </span>
          </div>
          <a
            href={status.latestRun.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            실행 상세 보기
          </a>
        </div>
      )}
    </div>
  )
}
