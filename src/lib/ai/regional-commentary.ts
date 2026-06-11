import { GoogleGenerativeAI } from '@google/generative-ai'
import { unstable_cache } from 'next/cache'

export interface CommentaryInput {
  label: string
  areaBucket?: string
  // 예측
  changePct: number | null
  direction: 'up' | 'flat' | 'down' | null
  horizon: number
  // 가격
  recentAvgPrice: number | null
  recentJeonseAvg: number | null
  jeonseRatio: number | null
  // 거래/공급
  txCount: number | null
  unsoldCount: number | null
  unsoldChange: number | null
  // 부담 지수
  pir: number | null
  jhai: number | null
  hai: number | null
  // 금리
  mortgageRate: number | null
  mortgageTrend: number | null  // 최근 N개월 변동폭 (%p, 양수=상승)
  // 인구/소득
  population: number | null
  populationYear: number | null
  popYoyChange: number | null
  pop5yChangePct: number | null
  annualIncome: number | null
  incomeYear: number | null
  // 리스크 등급
  riskPriceGrade: 'good' | 'caution' | 'bad' | 'na' | null
  riskJeonseGrade: 'good' | 'caution' | 'bad' | 'na' | null
  riskUnsoldGrade: 'good' | 'caution' | 'bad' | 'na' | null
  riskTxGrade: 'good' | 'caution' | 'bad' | 'na' | null
}

function fmt(val: number | null | undefined, fn: (v: number) => string): string {
  return val != null ? fn(val) : '—'
}

function riskKo(grade: string | null): string {
  if (grade === 'good')    return '양호'
  if (grade === 'caution') return '주의'
  if (grade === 'bad')     return '위험'
  return '—'
}

function buildDataBlock(input: CommentaryInput): string {
  const areaLabel =
    !input.areaBucket
      ? '전체'
      : input.areaBucket === '소형' || input.areaBucket === '대형'
        ? input.areaBucket
        : `${input.areaBucket}㎡`

  const directionKo =
    input.direction === 'up'   ? '상승' :
    input.direction === 'down' ? '하락' :
    input.direction === 'flat' ? '횡보' : '—'

  const mortgageTrendDesc =
    input.mortgageTrend == null ? '—'
    : input.mortgageTrend > 0.2
      ? `${input.mortgageTrend.toFixed(2)}%p 상승 (구입 부담 증가)`
      : input.mortgageTrend < -0.2
        ? `${Math.abs(input.mortgageTrend).toFixed(2)}%p 하락 (구입 여건 개선)`
        : '횡보 (금리 안정)'

  const haiDesc =
    input.hai == null ? '' :
    input.hai >= 150  ? ' (여유)' :
    input.hai >= 100  ? ' (보통)' : ' (부담)'

  return [
    `분석 대상: ${input.label} 아파트 시장 (${areaLabel})`,
    '',
    '## 가격 예측',
    `- AI 예측 ${input.horizon}개월 변화율: ${fmt(input.changePct, v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)} / 방향: ${directionKo}`,
    `- 최근 6개월 평균 매매가: ${fmt(input.recentAvgPrice, v => `${v.toLocaleString('ko-KR')}만원`)}`,
    '',
    '## 전세 시장',
    `- 최근 전세가율: ${fmt(input.jeonseRatio, v => `${v.toFixed(1)}%`)} (80% 이상이면 역전세·갭 위험)`,
    `- 최근 전세 평균: ${fmt(input.recentJeonseAvg, v => `${v.toLocaleString('ko-KR')}만원`)}`,
    `- JHAI(전세부담지수): ${fmt(input.jhai, v => `${v.toFixed(1)}배`)} (연소득 대비 전세가, 낮을수록 부담 적음)`,
    '',
    '## 거래 / 공급',
    `- 최근월 거래량: ${fmt(input.txCount, v => `${v}건`)}`,
    `- 미분양: ${fmt(input.unsoldCount, v => `${v.toLocaleString('ko-KR')}세대`)}${
      input.unsoldChange != null
        ? ` (전월比 ${input.unsoldChange >= 0 ? '+' : ''}${input.unsoldChange.toLocaleString('ko-KR')})`
        : ''
    }`,
    '',
    '## 구입 부담',
    `- PIR(연소득 대비 매매가): ${fmt(input.pir, v => `${v.toFixed(1)}배`)} (전국 평균 9~11배, 서울 20배+)`,
    `- HAI(매매구입부담지수): ${fmt(input.hai, v => String(v))}${haiDesc} (100 이상이면 소득 25%로 월 상환 가능)`,
    `- 경남 가구소득: ${fmt(input.annualIncome, v => `${v.toLocaleString('ko-KR')}만원`)}${input.incomeYear ? ` (${input.incomeYear}년)` : ''}`,
    '',
    '## 금리 환경',
    `- 주담대 금리(ECOS): ${fmt(input.mortgageRate, v => `${v.toFixed(2)}%`)}`,
    `- 최근 추이: ${mortgageTrendDesc}`,
    '',
    '## 인구 동향',
    `- 최근 인구: ${fmt(input.population, v => `${v.toLocaleString('ko-KR')}명`)}${input.populationYear ? ` (${input.populationYear}년)` : ''}`,
    `- 전년 증감: ${fmt(input.popYoyChange, v => `${v >= 0 ? '+' : ''}${v.toLocaleString('ko-KR')}명`)}`,
    `- 5년 변화율: ${fmt(input.pop5yChangePct, v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)}`,
    '',
    '## 리스크 등급 (양호/주의/위험)',
    `- 가격 방향성: ${riskKo(input.riskPriceGrade)}`,
    `- 전세 리스크: ${riskKo(input.riskJeonseGrade)}`,
    `- 공급 과잉: ${riskKo(input.riskUnsoldGrade)}`,
    `- 거래 유동성: ${riskKo(input.riskTxGrade)}`,
  ].join('\n')
}

async function callGemini(sggCode: string, input: CommentaryInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const areaLabel =
    !input.areaBucket
      ? '전체'
      : input.areaBucket === '소형' || input.areaBucket === '대형'
        ? input.areaBucket
        : `${input.areaBucket}㎡`

  const dataBlock = buildDataBlock(input)

  const prompt = `당신은 지역 부동산 시장 분석 전문가입니다. 아래 데이터를 종합하여 ${input.label} 아파트(${areaLabel}) 시장을 3~4문장으로 분석해주세요.

${dataBlock}

작성 지침:
- 데이터에 근거한 사실 중심 서술. 수치를 직접 인용하세요.
- AI 예측 변화율과 리스크 등급을 중심으로 현황과 ${input.horizon}개월 전망을 설명하세요.
- 전세가율·구입부담·인구 추이 중 이 지역에서 특히 두드러지는 요소를 1~2가지 언급하세요.
- 투자 권유 표현 절대 금지. 사실과 해석만 작성하세요.
- 3~4문장, 한국어.`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch {
    return null
  }
}

// sggCode + areaBucket + horizon 조합으로 24시간 캐시
export function getRegionalCommentary(
  sggCode: string,
  input: CommentaryInput,
): Promise<string | null> {
  return unstable_cache(
    () => callGemini(sggCode, input),
    ['regional-ai-commentary', sggCode, input.areaBucket ?? 'all', String(input.horizon)],
    { revalidate: 86400 },
  )()
}
