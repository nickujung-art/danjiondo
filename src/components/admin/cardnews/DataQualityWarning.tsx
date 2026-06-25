interface Props {
  warning: boolean
  from: string
  to: string
  dataCount: number
}

export function DataQualityWarning({ warning, from, to, dataCount }: Props) {
  if (!warning && dataCount >= 3) return null

  const messages: string[] = []
  if (warning) {
    messages.push('조회 기간 종료일이 7일 이내입니다. 신고 미완료 거래가 있을 수 있습니다.')
  }
  if (dataCount < 3) {
    messages.push(
      `조회된 거래 건수(${dataCount}건)가 3건 미만입니다. 데이터가 충분하지 않을 수 있습니다.`,
    )
  }

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-md p-3 space-y-1">
      {messages.map((msg, i) => (
        <p key={i} className="text-sm text-amber-800">
          <span className="font-medium">주의:</span> {msg}
        </p>
      ))}
      <p className="text-xs text-amber-700">
        집계 기간: {from} ~ {to}
      </p>
    </div>
  )
}
