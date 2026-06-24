/**
 * templates.js — CARDDESIGN.md 기반 HTML 카드 템플릿 생성기
 * 4장: cover · highlight · ranking · closing
 */
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_URL = pathToFileURL(resolve(__dirname, '..')).href

// ── 공통 CSS ─────────────────────────────────────────────

const BASE_CSS = `
  @font-face { font-family: 'Pretendard'; font-weight: 900; src: url('${ROOT_URL}/fonts/Pretendard-Black.woff2') format('woff2'); font-display: block; }
  @font-face { font-family: 'Pretendard'; font-weight: 800; src: url('${ROOT_URL}/fonts/Pretendard-ExtraBold.woff2') format('woff2'); font-display: block; }
  @font-face { font-family: 'Pretendard'; font-weight: 700; src: url('${ROOT_URL}/fonts/Pretendard-Bold.woff2') format('woff2'); font-display: block; }
  @font-face { font-family: 'Pretendard'; font-weight: 600; src: url('${ROOT_URL}/fonts/Pretendard-SemiBold.woff2') format('woff2'); font-display: block; }
  @font-face { font-family: 'Pretendard'; font-weight: 500; src: url('${ROOT_URL}/fonts/Pretendard-Medium.woff2') format('woff2'); font-display: block; }

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

const LOGO_PATH = `${ROOT_URL}/assets/logo.png`

function html(body, css = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>${BASE_CSS}${css}</style>
</head>
<body>${body}</body>
</html>`
}

// ── 브랜드 락업 ───────────────────────────────────────────

function BrandLockup({ size = 46, fontSize = 30, color = 'var(--ink)' } = {}) {
  return `<div style="display:flex;align-items:center;gap:12px;">
    <img src="${LOGO_PATH}" style="width:${size}px;height:${size}px;border-radius:10px;object-fit:cover;" onerror="this.style.display='none'">
    <span style="font:700 ${fontSize}px/1 'Pretendard';color:${color};">창원부동산랩</span>
  </div>`
}

// ── 랭킹 행 패딩 ─────────────────────────────────────────

function pad10(ranking) {
  return Array.from({ length: 10 }, (_, i) => ranking[i] ?? { rank: i + 1, name: null, price: null, subtitle: null })
}

// ── 1. 표지 (Cover B — 화이트 클린) ──────────────────────

export function renderCover(data) {
  const { week, region, area, subCaption } = data
  const caption = subCaption ?? `이번 주 가장 비싸게 거래된\n국민평형 아파트는 어디일까요?`
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
    <div class="brand">${BrandLockup()}</div>
    <div class="eyebrow">WEEKLY REPORT · ${week}</div>
    <div class="title">
      <span class="title-line">${region}</span>
      <span class="title-line">${area ? `<span class="title-blue">${area}</span> 실거래가` : '전체 실거래가'}</span>
      <span class="title-line">랭킹 TOP 10</span>
    </div>
    <div class="ghost">10</div>
    <div class="caption">${caption}</div>
    <div class="location">
      <span class="pin">📍</span>
      <span>${locationMeta}</span>
    </div>
  </div>`

  return html(body, css)
}

// ── 2. TOP 3 하이라이트 ───────────────────────────────────

export function renderHighlight(data) {
  const { week, region, area, period, source, ranking } = data
  const r = pad10(ranking)
  const top3 = r.slice(0, 3)

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

  function rankCard(item, idx) {
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
        <div class="complex-sub sub-${cls}">${subText}</div>
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
      <div class="h2">최고가 거래 TOP 3</div>
    </div>
    ${top3.map((item, i) => rankCard(item, i)).join('')}
    <div class="caption-row">출처: ${source} &nbsp;·&nbsp; 기간: ${period}</div>
  </div>`

  return html(body, css)
}

// ── 3. 전체 순위 1~10위 ───────────────────────────────────

export function renderRanking(data) {
  const { region, area, period, source, ranking, seriesType } = data
  const r = pad10(ranking)

  // 거래량 시리즈는 가격 단위 다름
  const isVolume = seriesType === 'volume'
  const isValue = seriesType === 'value'

  let headerLabel = '실거래가 순위 1~10위'
  let captionNote = '단위: 만원'
  if (isVolume) { headerLabel = '거래량 순위 1~10위'; captionNote = '단위: 거래 건수' }
  if (isValue) { headerLabel = '가성비 순위 1~10위 (평당가 ↓)'; captionNote = '84㎡ 기준 평당 거래가 낮은 순' }

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

  function row(item) {
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
      <div class="h2">${headerLabel}</div>
    </div>
    ${r.map(row).join('')}
    <div class="footer">${captionNote} &nbsp;·&nbsp; 출처: ${source} &nbsp;·&nbsp; ${period}</div>
  </div>`

  return html(body, css)
}

// ── 4. 구별 대장단지 그리드 ───────────────────────────────

export function renderDistrictChampionsCard(data) {
  const { week, period, champions } = data

  function changeHtml(change) {
    if (change === null || change === undefined) return ''
    const abs = Math.abs(change).toFixed(1)
    if (change > 0.05) return `<span class="change-up">▲${abs}%</span>`
    if (change < -0.05) return `<span class="change-down">▼${abs}%</span>`
    return `<span class="change-flat">— 전주 동일</span>`
  }

  function districtCard(ch) {
    const { district, name, pricePerPyeong, change } = ch
    const priceStr = pricePerPyeong ? pricePerPyeong.toLocaleString('ko-KR') : '—'
    const nameStr = name ?? '데이터 없음'
    const isNoData = !pricePerPyeong

    return `<div class="district-card">
      <div class="district-hd">${district}</div>
      <div class="district-body">
        <div>
          <div class="district-price${isNoData ? ' ph' : ''}">${priceStr}</div>
          <div class="district-unit">만원/평</div>
        </div>
        <div class="district-name${isNoData ? ' ph' : ''}">${nameStr}</div>
        <div class="district-change">${changeHtml(change)}</div>
      </div>
    </div>`
  }

  const css = `
    .card { width:1080px; height:1080px; background:#fff; overflow:hidden; display:flex; flex-direction:column; }
    .top-bar { height:14px; background:var(--brand); flex-shrink:0; }
    .header { padding:32px 80px 20px; display:flex; flex-direction:column; gap:10px; flex-shrink:0; }
    .header-top { display:flex; justify-content:space-between; align-items:center; }
    .header-week { font:700 22px/1 'Pretendard'; color:var(--brand); letter-spacing:0.3px; }
    .header-title { font:900 44px/1.15 'Pretendard'; color:var(--ink); letter-spacing:-1.5px; }
    .header-sub { font:500 21px/1 'Pretendard'; color:var(--ink-3); }

    .grid { display:grid; grid-template-columns:1fr 1fr; grid-template-rows:repeat(3,1fr); gap:12px; padding:0 40px 40px; flex:1; min-height:0; }

    .district-card { border-radius:20px; overflow:hidden; display:flex; flex-direction:column; }
    .district-hd { background:var(--brand); color:#fff; padding:14px 24px; font:700 28px/1 'Pretendard'; letter-spacing:-0.5px; flex-shrink:0; }
    .district-body { background:var(--surface-2); flex:1; padding:16px 24px 18px; display:flex; flex-direction:column; justify-content:space-between; }

    .district-price { font:900 46px/1 'Pretendard'; color:var(--ink); letter-spacing:-2px; }
    .district-unit { font:500 18px/1 'Pretendard'; color:var(--ink-3); margin-top:4px; }
    .district-name { font:600 21px/1.3 'Pretendard'; color:var(--ink-2); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .district-change { font:700 20px/1 'Pretendard'; }

    .change-up { color:#16A34A; }
    .change-down { color:#DC2626; }
    .change-flat { color:var(--ink-3); }
    .ph { color:var(--placeholder); }
  `

  const body = `<div class="card">
    <div class="top-bar"></div>
    <div class="header">
      <div class="header-top">
        ${BrandLockup()}
        <div class="header-week">WEEKLY REPORT · ${week}</div>
      </div>
      <div class="header-title">창원+김해 전체 실거래가<br>구별 대장단지</div>
      <div class="header-sub">창원·김해 구별 최고 평당가 단지 &nbsp;·&nbsp; ${period}</div>
    </div>
    <div class="grid">
      ${champions.map(districtCard).join('')}
    </div>
  </div>`

  return html(body, css)
}

// ── 5. 클로징 CTA ─────────────────────────────────────────

export function renderClosing(data) {
  const { source } = data

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
    <div class="brand-white" style="padding-bottom:80px;">${BrandLockup({ size: 56, fontSize: 34, color: '#fff' })}</div>
    <div class="h2">매주 업데이트되는<br>창원 <span class="gold-text">실거래가 리포트</span></div>
    <div class="desc">우리 동네 아파트 시세가 궁금하다면<br>창원부동산랩을 팔로우하세요.</div>
    <div class="cta-row">
      <button class="btn btn-primary">팔로우 +</button>
      <button class="btn btn-outline">저장하기</button>
    </div>
    <div class="disclaimer">본 자료는 국토교통부 실거래가 공개시스템 기준입니다. 투자 판단의 최종 책임은 본인에게 있습니다.</div>
  </div>`

  return html(body, css)
}
