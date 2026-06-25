'use client'
import { useState, useCallback } from 'react'

interface HtmlCards {
  cover: string
  highlight: string
  ranking: string
  closing: string
}

interface Props {
  htmlCards: HtmlCards | null
}

type ExportState = 'idle' | 'uploading' | 'triggered' | 'polling' | 'ready' | 'error'

interface TriggerResponse {
  ok?: boolean
  run_url?: string
  error?: string
}

interface ArtifactResponse {
  status: string
  download_url: string | null
}

export function ExportPanel({ htmlCards }: Props) {
  const [state, setState] = useState<ExportState>('idle')
  const [runUrl, setRunUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // artifact polling (30초마다, 최대 20번 = 10분)
  const pollArtifact = useCallback(async () => {
    setState('polling')
    for (let i = 0; i < 20; i++) {
      await new Promise<void>(r => setTimeout(r, 30000))
      const res = await fetch('/api/admin/cardnews/artifact')
      const data = (await res.json()) as ArtifactResponse
      if (data.status === 'ready' && data.download_url) {
        setDownloadUrl(data.download_url)
        setState('ready')
        return
      }
    }
    setErrorMsg('10분 내 artifact를 찾지 못했습니다. GitHub Actions에서 직접 확인하세요.')
    setState('error')
  }, [])

  const handleTrigger = useCallback(async () => {
    if (!htmlCards) return
    setState('uploading')
    setErrorMsg(null)
    setDownloadUrl(null)
    try {
      const res = await fetch('/api/admin/cardnews/trigger-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlCards, seriesId: `custom-${Date.now()}` }),
      })
      const data = (await res.json()) as TriggerResponse
      if (!data.ok) throw new Error(data.error ?? 'trigger failed')
      setState('triggered')
      setRunUrl(data.run_url ?? null)
      void pollArtifact()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'trigger failed')
      setState('error')
    }
  }, [htmlCards, pollArtifact])

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">PNG 생성</h2>

      <button
        type="button"
        onClick={handleTrigger}
        disabled={
          !htmlCards ||
          state === 'uploading' ||
          state === 'triggered' ||
          state === 'polling'
        }
        className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {state === 'uploading'
          ? '업로드 중...'
          : state === 'triggered' || state === 'polling'
            ? 'PNG 생성 중... (GitHub Actions)'
            : state === 'ready'
              ? '다시 생성'
              : 'PNG 생성 트리거'}
      </button>

      {runUrl && (
        <p className="text-xs text-gray-500">
          <a
            href={runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            GitHub Actions 실행 확인
          </a>
          &nbsp;(약 5~15분 소요)
        </p>
      )}

      {state === 'polling' && (
        <p className="text-sm text-gray-500">artifact 대기 중... 30초마다 확인합니다.</p>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          className="block text-center py-2 border border-gray-300 text-sm text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          PNG ZIP 다운로드
        </a>
      )}

      {errorMsg && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
