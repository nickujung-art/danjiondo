/**
 * card-templates.ts — 브라우저 iframe 미리보기용 카드 HTML 생성
 * card-news/scripts/templates.js의 renderXxxPreview 함수 TypeScript 포팅 (CDN 폰트 버전)
 * PITFALL-2: 브라우저 iframe에서 file:// 접근 불가 → CDN으로 교체
 */

// 브라우저 iframe에서 file:// 접근 불가 → CDN으로 교체
const BASE_CSS_PREVIEW = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
  :root {
    --brand: #0066FF;
    --brand-tint: #EAF2FE;
    --ink: #152038;
    --ink-2: #5B6677;
    --ink-3: #8A93A3;
    --gold: #FFC93C;
    --gold-2: #FFAB00;
    --surface: #FFFFFF;
    --surface-2: #F7F8FA;
    --line: rgba(112,115,124,0.18);
    --placeholder: #C4CAD3;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body { font-family: 'Pretendard', -apple-system, 'Apple SD Gothic Neo', sans-serif; -webkit-font-smoothing: antialiased; }
`

function htmlPreview(body: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>${BASE_CSS_PREVIEW}${css}</style>
</head>
<body>${body}</body>
</html>`
}

// 미리보기용 브랜드 락업 — 로고를 상대 경로로 참조 (file:// 금지)
function BrandLockupPreview({
  size = 46,
  fontSize = 30,
  color = 'var(--ink)',
}: { size?: number; fontSize?: number; color?: string } = {}): string {
  return `<div style="display:flex;align-items:center;gap:12px;">
    <img src="/logo-cardnews.png" style="width:${size}px;height:${size}px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'">
    <span style="font:700 ${fontSize}px/1 'Pretendard';color:${color};">창원부동산랩</span>
  </div>`
}

// ── 타입 정의 ──────────────────────────────────────────────

export interface RankingRow {
  rank: number
  name: string | null
  subtitle?: string | null
  price: string | null
  priceUnit?: string
}

export interface TextOverrides {
  coverTitle2?: string
  coverTitle3?: string
  coverCaption?: string
  highlightTitle?: string
  rankingHeader?: string
  closingHeading?: string
  closingDesc?: string
}

export interface CoverData {
  week: string
  region: string
  area: string | null
  subCaption?: string
  period?: string
  topic?: string
  overrides?: TextOverrides
}

export interface CardSetData {
  week: string
  region: string
  area: string | null
  period: string
  source: string
  ranking: RankingRow[]
  seriesType?: string
  subCaption?: string
  overrides?: TextOverrides
}

// ── 1. 커버 카드 — 미리보기 ────────────────────────────────

export function renderCoverPreview(data: CoverData): string {
  const { week, region, area, subCaption, topic } = data

  const coverTitleMap: Record<string, { line2: string; line3: string; caption: string }> = {
    jeonse_top: { line2: '전세 최고가', line3: '랭킹 TOP 10', caption: '이번 기간 전세가 가장 높게\n거래된 단지는 어디일까요?' },
    monthly_top: { line2: '월세 보증금', line3: '랭킹 TOP 10', caption: '이번 기간 월세 보증금이 가장\n높은 단지는 어디일까요?' },
    volume: { line2: '거래량', line3: '랭킹 TOP 10', caption: '이번 기간 가장 많이 거래된\n단지는 어디일까요?' },
    value: { line2: '평당가 낮은 순', line3: '가성비 TOP 10', caption: '이번 기간 가장 저렴하게\n매입 가능한 단지는 어디일까요?' },
    alltime_high: { line2: '신고가 경신', line3: '단지 TOP 10', caption: '이번 기간 역대 최고가를\n새로 쓴 단지는 어디일까요?' },
    price_change: { line2: '가격 변동률', line3: 'TOP 10', caption: '이번 기간 가격이 가장\n많이 오른 단지는 어디일까요?' },
    district_champions: { line2: '구별 챔피언', line3: '대표 단지', caption: '각 구에서 이번 기간\n가장 높은 거래가를 기록한 단지' },
  }
  const titleInfo = coverTitleMap[topic ?? ''] ?? {
    line2: area ? `${area} 실거래가` : '전체 실거래가',
    line3: '랭킹 TOP 10',
    caption: '이번 기간 가장 비싸게 거래된\n아파트는 어디일까요?',
  }
  const line2 = data.overrides?.coverTitle2 ?? titleInfo.line2
  const line3 = data.overrides?.coverTitle3 ?? titleInfo.line3
  const caption = data.overrides?.coverCaption ?? subCaption ?? titleInfo.caption
  const locationMeta = area ? `${region} · 전용 ${area} 기준` : region

  const css = `
    .card { width:1080px; height:1080px; background:#fff; position:relative; overflow:hidden; }
    .top-bar { width:100%; height:14px; background:var(--brand); }
    .brand { position:absolute; top:40px; left:80px; }
    .eyebrow { position:absolute; top:124px; left:80px; font:700 28px/1 'Pretendard'; color:var(--brand); letter-spacing:0.5px; }
    .title { position:absolute; top:172px; left:80px; z-index:1; }
    .title-line { font:900 100px/1.08 'Pretendard'; color:var(--ink); letter-spacing:-3.5px; display:block; }
    .title-blue { color:var(--brand); }
    .ghost { position:absolute; bottom:-120px; right:-30px; font:900 560px/1 'Pretendard'; color:var(--brand-tint); z-index:0; user-select:none; white-space:nowrap; }
    .caption { position:absolute; bottom:138px; left:80px; z-index:1; font:500 30px/1.6 'Pretendard'; color:var(--ink-2); white-space:pre-line; }
    .location { position:absolute; bottom:76px; left:80px; z-index:1; display:flex; align-items:center; gap:8px; font:500 23px/1 'Pretendard'; color:var(--ink-3); }
    .pin { color:var(--brand); font-size:20px; }
  `

  const body = `<div class="card">
    <div class="top-bar"></div>
    <div class="brand">${BrandLockupPreview()}</div>
    <div class="eyebrow">WEEKLY REPORT · ${week ?? ''}</div>
    <div class="title">
      <span class="title-line">${region ?? ''}</span>
      <span class="title-line"><span class="title-blue">${line2}</span></span>
      <span class="title-line">${line3}</span>
    </div>
    <div class="ghost">10</div>
    <div class="caption">${caption}</div>
    <div class="location">
      <span class="pin">📍</span>
      <span>${locationMeta}</span>
    </div>
  </div>`

  return htmlPreview(body, css)
}

// ── 2. TOP 3 하이라이트 — 미리보기 ────────────────────────

export function renderHighlightPreview(data: CardSetData): string {
  const { week: _week, region, area, period, source, ranking, seriesType } = data
  const top3 = (ranking ?? []).filter(item => item.name).slice(0, 3)

  const highlightTitleMap: Record<string, string> = {
    jeonse_top: '전세 최고가 TOP 3',
    monthly_top: '월세 최고 보증금 TOP 3',
    volume: '거래량 TOP 3',
    value: '가성비 TOP 3 (평당가 ↓)',
    alltime_high: '신고가 경신 TOP 3',
    price_change: '가격 상승률 TOP 3',
    district_champions: '최고가 지역 TOP 3',
  }
  const highlightTitle = data.overrides?.highlightTitle ?? highlightTitleMap[seriesType ?? ''] ?? '최고가 거래 TOP 3'

  const css = `
    .card { width:1080px; height:1080px; background:var(--surface-2); position:relative; padding:0 72px; display:flex; flex-direction:column; justify-content:flex-start; }
    .top-bar { position:absolute; top:0; left:0; width:100%; height:14px; background:var(--brand); }
    .header { padding-top:56px; margin-bottom:28px; }
    .eyebrow-sm { font:700 24px/1 'Pretendard'; color:var(--brand); letter-spacing:0.5px; margin-bottom:10px; }
    .h2 { font:900 60px/1.1 'Pretendard'; color:var(--ink); letter-spacing:-2.5px; }
    .rank-card { border-radius:24px; padding:28px 32px; margin-bottom:16px; display:flex; align-items:center; gap:24px; }
    .rank-card-1 { background:var(--ink); }
    .rank-card-other { background:#fff; border:1.5px solid var(--line); }
    .badge { width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .badge-1 { background:var(--gold); }
    .badge-other { background:var(--surface-2); border:1.5px solid var(--line); }
    .badge-num { font:900 34px/1 'Pretendard'; }
    .badge-1 .badge-num { color:var(--ink); }
    .badge-other .badge-num { color:var(--ink-3); }
    .complex-info { flex:1; min-width:0; }
    .complex-name { font:800 38px/1.2 'Pretendard'; letter-spacing:-1.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .name-1 { color:#fff; }
    .name-other { color:var(--ink); }
    .complex-sub { font:500 22px/1 'Pretendard'; margin-top:6px; }
    .sub-1 { color:rgba(255,255,255,0.6); }
    .sub-other { color:var(--ink-3); }
    .placeholder-name { color:var(--placeholder); }
    .price-wrap { text-align:right; flex-shrink:0; }
    .price-num { font:900 40px/1.1 'Pretendard'; letter-spacing:-1.5px; }
    .price-1 { color:var(--gold); }
    .price-other { color:var(--ink); }
    .price-unit { font:500 20px/1 'Pretendard'; }
    .unit-1 { color:rgba(255,255,255,0.5); }
    .unit-other { color:var(--ink-3); }
    .placeholder-price { color:var(--placeholder); }
    .caption-row { margin-top:auto; padding-bottom:52px; font:500 21px/1 'Pretendard'; color:var(--ink-3); }
  `

  function rankCard(item: RankingRow, idx: number): string {
    const isFirst = idx === 0
    const cls = isFirst ? '1' : 'other'
    const isPlaceholder = !item.name
    const nameText = isPlaceholder ? '단지명 입력' : item.name
    const priceText = isPlaceholder ? '0억 0,000' : item.price
    const subText = area ? `${region} · 전용 ${area}` : region

    return `<div class="rank-card rank-card-${cls}">
      <div class="badge badge-${cls}"><span class="badge-num">${item.rank}</span></div>
      <div class="complex-info">
        <div class="complex-name name-${cls} ${isPlaceholder ? 'placeholder-name' : ''}">${nameText}</div>
        <div class="complex-sub sub-${cls}">${subText ?? ''}</div>
      </div>
      <div class="price-wrap">
        <div class="price-num price-${cls} ${isPlaceholder ? 'placeholder-price' : ''}">${priceText}</div>
        <div class="price-unit unit-${cls}">만원</div>
      </div>
    </div>`
  }

  const body = `<div class="card">
    <div class="top-bar"></div>
    <div class="header">
      <div class="eyebrow-sm">HIGHLIGHT</div>
      <div class="h2">${highlightTitle}</div>
    </div>
    ${top3.map((item, i) => rankCard(item, i)).join('')}
    <div class="caption-row">출처: ${source ?? ''} &nbsp;·&nbsp; 기간: ${period ?? ''}</div>
  </div>`

  return htmlPreview(body, css)
}

// ── 3. 전체 순위 1~10위 — 미리보기 ────────────────────────

export function renderRankingPreview(data: CardSetData): string {
  const { region: _region, area: _area, period, source, ranking, seriesType } = data
  const r = (ranking ?? []).filter(item => item.name)

  const topic = seriesType // seriesType = opts.topic from client

  let headerLabel = '실거래가 순위 1~10위'
  let captionNote = '단위: 만원'
  if (topic === 'volume') { headerLabel = '거래량 순위 1~10위'; captionNote = '단위: 거래 건수' }
  if (topic === 'value') { headerLabel = '가성비 순위 1~10위 (평당가 ↓)'; captionNote = '84㎡ 기준 평당 거래가 낮은 순' }
  if (topic === 'jeonse_top') { headerLabel = '전세 최고가 순위 1~10위'; captionNote = '단위: 만원' }
  if (topic === 'monthly_top') { headerLabel = '월세 TOP10 (보증금 기준)'; captionNote = '단위: 만원' }
  if (topic === 'alltime_high') { headerLabel = '신고가 경신 단지'; captionNote = '해당 기간 역대 최고가 달성' }
  if (topic === 'price_change') { headerLabel = '가격 변동률 TOP10'; captionNote = '전기간 대비 변동률 (%)' }

  const finalHeader = data.overrides?.rankingHeader ?? headerLabel

  const css = `
    .card { width:1080px; height:1080px; background:#fff; position:relative; display:flex; flex-direction:column; padding:0 72px; }
    .top-bar { position:absolute; top:0; left:0; width:100%; height:14px; background:var(--brand); }
    .header { padding-top:48px; margin-bottom:20px; }
    .eyebrow-sm { font:700 22px/1 'Pretendard'; color:var(--brand); letter-spacing:0.5px; margin-bottom:8px; }
    .h2 { font:900 52px/1.1 'Pretendard'; color:var(--ink); letter-spacing:-2px; }
    .row { display:flex; align-items:center; padding:14px 0; border-bottom:1px solid var(--line); gap:16px; }
    .row-rank { font:900 38px/1 'Pretendard'; width:52px; flex-shrink:0; text-align:center; }
    .rank-gold { color:var(--gold-2); }
    .rank-gray { color:#9AA4B2; }
    .row-name { flex:1; min-width:0; }
    .row-complex { font:700 30px/1.2 'Pretendard'; color:var(--ink); letter-spacing:-0.8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .row-sub { font:500 19px/1 'Pretendard'; color:var(--ink-3); margin-top:4px; }
    .placeholder-text { color:var(--placeholder); }
    .row-price { font:900 32px/1 'Pretendard'; color:var(--ink); letter-spacing:-1px; text-align:right; flex-shrink:0; }
    .row-price-placeholder { color:var(--placeholder); }
    .footer { margin-top:auto; padding-bottom:40px; font:500 20px/1 'Pretendard'; color:var(--ink-3); }
  `

  function rowHtml(item: RankingRow): string {
    const isPlaceholder = !item.name
    const rankCls = item.rank === 1 ? 'rank-gold' : 'rank-gray'
    const hasSub = item.subtitle && !isPlaceholder

    return `<div class="row">
      <div class="row-rank ${rankCls}">${item.rank}</div>
      <div class="row-name">
        <div class="row-complex ${isPlaceholder ? 'placeholder-text' : ''}">${item.name ?? '단지명 입력'}</div>
        ${hasSub ? `<div class="row-sub">${item.subtitle}</div>` : ''}
      </div>
      <div class="row-price ${isPlaceholder ? 'row-price-placeholder' : ''}">${item.price ?? '0억 0,000'}</div>
    </div>`
  }

  const body = `<div class="card">
    <div class="top-bar"></div>
    <div class="header">
      <div class="eyebrow-sm">FULL RANKING</div>
      <div class="h2">${finalHeader}</div>
    </div>
    ${r.map(rowHtml).join('')}
    <div class="footer">${captionNote} &nbsp;·&nbsp; 출처: ${source ?? ''} &nbsp;·&nbsp; ${period ?? ''}</div>
  </div>`

  return htmlPreview(body, css)
}

// ── 3b. 구별 챔피언 박스 그리드 — 미리보기 ────────────────

export function renderDistrictChampionsPreview(data: CardSetData): string {
  const { region, area, period, source, ranking } = data
  const items = ranking ?? []

  const css = `
    .card { width:1080px; height:1080px; background:var(--surface-2); position:relative; display:flex; flex-direction:column; padding:0 64px; }
    .top-bar { position:absolute; top:0; left:0; width:100%; height:14px; background:var(--brand); }
    .header { padding-top:52px; margin-bottom:32px; }
    .eyebrow-sm { font:700 24px/1 'Pretendard'; color:var(--brand); letter-spacing:0.5px; margin-bottom:10px; }
    .h2 { font:900 56px/1.1 'Pretendard'; color:var(--ink); letter-spacing:-2px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; flex:1; }
    .box { background:#fff; border:1.5px solid var(--line); border-radius:20px; padding:28px 24px; display:flex; flex-direction:column; gap:10px; }
    .box-district { font:700 22px/1 'Pretendard'; color:var(--brand); }
    .box-name { font:800 30px/1.3 'Pretendard'; color:var(--ink); letter-spacing:-0.8px; }
    .box-name-empty { color:var(--placeholder); }
    .box-price { font:900 36px/1 'Pretendard'; color:var(--gold-2); letter-spacing:-1px; margin-top:auto; }
    .box-price-empty { color:var(--placeholder); }
    .footer { padding:20px 0 44px; font:500 20px/1 'Pretendard'; color:var(--ink-3); }
  `

  function boxHtml(item: RankingRow): string {
    const isEmpty = !item.name
    return `<div class="box">
      <div class="box-district">${item.subtitle ?? ''}</div>
      <div class="box-name ${isEmpty ? 'box-name-empty' : ''}">${item.name ?? '데이터 없음'}</div>
      <div class="box-price ${isEmpty ? 'box-price-empty' : ''}">${item.price ?? '-'}</div>
    </div>`
  }

  const locationMeta = area ? `${region} · 전용 ${area} 기준` : region

  const body = `<div class="card">
    <div class="top-bar"></div>
    <div class="header">
      <div class="eyebrow-sm">DISTRICT CHAMPION</div>
      <div class="h2">구별 대표 단지</div>
    </div>
    <div class="grid">
      ${items.map(boxHtml).join('')}
    </div>
    <div class="footer">${locationMeta} &nbsp;·&nbsp; 출처: ${source ?? ''} &nbsp;·&nbsp; ${period ?? ''}</div>
  </div>`

  return htmlPreview(body, css)
}

// ── 4. 클로징 CTA — 미리보기 ─────────────────────────────

export function renderClosingPreview(data: Partial<CardSetData>): string {
  const nl2br = (s: string) => s.replace(/\n/g, '<br>')
  const headingHtml = data.overrides?.closingHeading
    ? nl2br(data.overrides.closingHeading)
    : '매주 업데이트되는<br>창원 <span class="gold-text">실거래가 리포트</span>'
  const descHtml = data.overrides?.closingDesc
    ? nl2br(data.overrides.closingDesc)
    : '우리 동네 아파트 시세가 궁금하다면<br>창원부동산랩을 팔로우하세요.'

  const css = `
    .card { width:1080px; height:1080px; background:var(--ink); position:relative; display:flex; flex-direction:column; padding:80px; }
    .brand-white { margin-bottom:auto; }
    .h2 { font:900 76px/1.15 'Pretendard'; color:#fff; letter-spacing:-2.5px; margin-bottom:28px; }
    .gold-text { color:var(--gold); }
    .desc { font:500 30px/1.7 'Pretendard'; color:rgba(255,255,255,0.7); margin-bottom:48px; }
    .cta-row { display:flex; gap:16px; margin-bottom:auto; }
    .btn { padding:16px 36px; border-radius:100px; font:700 26px/1 'Pretendard'; cursor:pointer; border:none; }
    .btn-primary { background:var(--brand); color:#fff; }
    .btn-outline { background:transparent; color:#fff; border:2px solid rgba(255,255,255,0.5); }
    .disclaimer { font:500 19px/1.6 'Pretendard'; color:rgba(255,255,255,0.3); border-top:1px solid rgba(255,255,255,0.1); padding-top:20px; }
  `

  const body = `<div class="card">
    <div class="brand-white" style="padding-bottom:80px;">${BrandLockupPreview({ size: 56, fontSize: 34, color: '#fff' })}</div>
    <div class="h2">${headingHtml}</div>
    <div class="desc">${descHtml}</div>
    <div class="cta-row">
      <button class="btn btn-primary">팔로우 +</button>
      <button class="btn btn-outline">저장하기</button>
    </div>
    <div class="disclaimer">
      출처: 국토교통부 실거래가 공개시스템<br>
      본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다
    </div>
  </div>`
  // D-08 LOCKED: 이 두 줄은 제거 불가

  return htmlPreview(body, css)
}
