'use client'

import { useState, useRef, useEffect } from 'react'

interface AiPanelProps {
  complexId: string
  complexName: string
  contextData?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  isPending?: boolean
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

export function AiChatPanel({ complexId, complexName, contextData }: AiPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isPending, setIsPending] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 언마운트 시 진행 중인 SSE 스트림 취소
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // 패널 열릴 때 close 버튼으로 포커스 이동 (ARIA), 닫힐 때 스트림 취소
  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus()
      document.body.style.overflow = 'hidden'
    } else {
      abortRef.current?.abort()
      triggerRef.current?.focus()
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // 새 메시지 도착 시 하단으로 스크롤
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [messages])

  // Escape 키로 패널 닫기
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  async function sendMessage(overrideContent?: string) {
    const content = (overrideContent ?? inputValue).trim()
    if (!content || isPending) return

    const userMsg: ChatMessage = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInputValue('')
    setIsPending(true)

    // 응답 대기 placeholder
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '응답 중...', isPending: true },
    ])

    // 이전 요청 취소 후 새 컨트롤러 생성
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat/complex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complexId,
          contextData,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const errMsg = res.status === 401
          ? '로그인 후 이용할 수 있습니다.'
          : '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        throw new Error(errMsg)
      }

      // SSE 스트리밍 처리 — 줄 경계가 read() 청크에 걸칠 수 있으므로 버퍼링
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''
      let done = false

      while (!done) {
        const result = await reader.read()
        done = result.done
        if (result.value) buffer += decoder.decode(result.value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') { done = true; break }
          try {
            const data = JSON.parse(raw) as { text?: string }
            if (data.text) {
              assistantText += data.text
              setMessages((prev) => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (updated[lastIdx]?.isPending) {
                  updated[lastIdx] = { role: 'assistant', content: assistantText }
                }
                return updated
              })
            }
          } catch {
            // SSE 파싱 오류 무시
          }
        }
      }

      // 스트림 완료: pending 제거
      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        if (updated[lastIdx]?.isPending) {
          updated[lastIdx] = {
            role: 'assistant',
            content: assistantText || '응답을 받지 못했습니다.',
          }
        }
        return updated
      })
    } catch (err) {
      // 패널 닫기 / 새 질문 전송에 의한 abort는 에러로 표시하지 않음
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => !m.isPending))
        return
      }
      const errContent = err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        if (updated[lastIdx]?.isPending) {
          updated[lastIdx] = {
            role: 'assistant',
            content: errContent,
            isError: true,
          }
        }
        return updated
      })
    } finally {
      setIsPending(false)
    }
  }

  const SAMPLE_QUESTIONS = [
    '최근 가격 흐름 분석해줘',
    '이 단지 가성비 어때?',
    '학군 평가해줘',
    '관리비 적정한 수준이야?',
  ]

  const welcomeMessage: ChatMessage = {
    role: 'assistant',
    content: `안녕하세요. ${complexName}에 대해 궁금한 점을 물어보세요.`,
  }
  const displayMessages = messages.length === 0 ? [welcomeMessage] : messages

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        ref={triggerRef}
        className={`btn btn-md ${isOpen ? 'btn-secondary' : 'btn-orange'}`}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 100,
          height: '44px',
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderRadius: 'var(--radius-lg)',
        }}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? '상담 패널 닫기' : 'AI 상담 열기'}
      >
        {isOpen ? (
          <>
            <XIcon /> 닫기
          </>
        ) : (
          <>
            <ChatIcon /> AI 상담
          </>
        )}
      </button>

      {/* 슬라이드 패널 */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={`${complexName} AI 상담`}
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 'min(400px, 100vw)',
            height: '100vh',
            zIndex: 200,
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--line-default)',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            transform: 'translateX(0)',
            transition: 'transform 200ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              height: '60px',
              padding: '0 20px',
              borderBottom: '1px solid var(--line-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                font: '700 15px/1.4 var(--font-sans)',
                color: 'var(--fg-pri)',
              }}
            >
              {complexName} 상담
            </span>
            <button
              ref={closeRef}
              className="btn btn-ghost btn-icon"
              onClick={() => setIsOpen(false)}
              aria-label="상담 패널 닫기"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
              }}
            >
              <XIcon />
            </button>
          </div>

          {/* 면책 고지 */}
          <div
            style={{
              background: 'var(--bg-cautionary-tint)',
              borderBottom: '1px solid rgba(180,120,0,0.15)',
              padding: '8px 16px',
              flexShrink: 0,
            }}
          >
            <p
              style={{
                font: '500 11px/1.4 var(--font-sans)',
                color: 'rgba(120,80,0,0.75)',
                margin: 0,
              }}
            >
              단지 DB 데이터 기반 응답입니다. 투자 조언이 아닙니다.
            </p>
          </div>

          {/* 메시지 목록 */}
          <div
            ref={messageListRef}
            role="log"
            aria-live="polite"
            aria-label="상담 내용"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {displayMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: msg.role === 'user' ? '80%' : '85%',
                  background:
                    msg.role === 'user'
                      ? 'var(--color-cool-10)'
                      : 'var(--bg-surface-2)',
                  color: msg.isError
                    ? 'var(--fg-negative)'
                    : msg.role === 'user'
                      ? '#fff'
                      : msg.isPending
                        ? 'var(--fg-tertiary)'
                        : 'var(--fg-pri)',
                  borderRadius:
                    msg.role === 'user'
                      ? '12px 12px 2px 12px'
                      : '12px 12px 12px 2px',
                  padding: '10px 14px',
                  font: '500 13px/1.5 var(--font-sans)',
                  border:
                    msg.role === 'assistant'
                      ? '1px solid var(--line-subtle)'
                      : 'none',
                  opacity: msg.isPending ? 0.7 : 1,
                }}
              >
                {msg.content}
              </div>
            ))}
          </div>

          {/* 샘플 질문 — 항상 표시 */}
          <div
            style={{
              padding: '6px 16px 8px',
              display: 'flex',
              gap: '6px',
              flexShrink: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => void sendMessage(q)}
                disabled={isPending}
                style={{
                  padding: '4px 11px',
                  borderRadius: 20,
                  border: '1px solid var(--line-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--fg-secondary)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  lineHeight: 1.4,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* 입력 영역 */}
          <div
            style={{
              borderTop: '1px solid var(--line-default)',
              padding: '12px 16px',
              display: 'flex',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              className="input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
              placeholder="질문을 입력하세요"
              aria-label="질문 입력"
              disabled={isPending}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: 'var(--radius-lg)',
                fontSize: '14px',
              }}
            />
            <button
              className="btn btn-md btn-orange"
              onClick={() => void sendMessage()}
              disabled={isPending || !inputValue.trim()}
              aria-label="전송"
              style={{
                width: '40px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
