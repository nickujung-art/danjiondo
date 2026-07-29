// 창부레터 — Article overlay (text feature or card-news viewer) + 관련 단지
function Sparkline({ up = true, w = 88, h = 30 }) {
  const pts = up ? [4,9,7,13,11,17,15,22,20,26] : [26,20,22,15,17,11,13,7,9,4];
  const step = w / (pts.length - 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - v).toFixed(1)}`).join(' ');
  const col = up ? 'var(--orange)' : '#9AA0A6';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 2026-07-29 수정 (BRIEF.md §13): 원래는 href="#" 플레이스홀더 + 정적 텍스트
// ("실거래가·학군·관리비·AI예측")였음. 창부레터는 bds/실거래이야기와 같은
// Supabase 프로젝트를 공유하기로 결정했으므로, complex_id가 세 프로젝트에서
// 동일한 값 — 이 카드는 창부레터가 complexes/transactions를 직접 조회해 만든
// "가격 미리보기"를 보여주고, 클릭하면 실거래이야기 단지상세로 나간다.
// price/chg는 목업값 — 실제로는 Supabase 조회 결과로 채운다.
function RelatedComplex({ name, price, chg }) {
  const up = typeof chg === 'number' ? chg >= 0 : true;
  return (
    // 실제 구현: href={`https://실거래이야기-도메인/complex/${complexId}`} (새 탭)
    <a href="#" onClick={(e) => e.preventDefault()} className="cbl-related">
      <div>
        <div className="cbl-related-name">{name}</div>
        <div className="cbl-related-sub">
          {price
            ? <>{price}만원 <span style={{ color: up ? '#C2410C' : '#4B5563' }}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(1)}%</span></>
            : '실거래이야기에서 가격 보기 →'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sparkline up={up} />
        <span className="cbl-related-arrow" aria-hidden="true">→</span>
      </div>
    </a>
  );
}

function CardNewsViewer({ data }) {
  const [i, setI] = React.useState(0);
  const n = data.slides.length;
  const s = data.slides[i];
  return (
    <div className="cbl-cardnews">
      <div className="cbl-cardnews-stage">
        <button className="cbl-cn-nav prev" onClick={() => setI((i - 1 + n) % n)} aria-label="이전">‹</button>
        <div className="cbl-cn-card">
          <div className="cbl-cn-brand">창부레터<span style={{ color: 'var(--orange)' }}>.</span></div>
          <div className="cbl-cn-kicker">{s.kicker}</div>
          <div className="cbl-cn-big">{s.big}</div>
          <div className="cbl-cn-label">{s.label}</div>
          <div className="cbl-cn-sub">{s.sub}</div>
          <div className="cbl-cn-foot">{data.title} · {i + 1}/{n}</div>
        </div>
        <button className="cbl-cn-nav next" onClick={() => setI((i + 1) % n)} aria-label="다음">›</button>
      </div>
      <div className="cbl-cn-dots">
        {data.slides.map((_, k) => (
          <button key={k} onClick={() => setI(k)} className={"cbl-cn-dot" + (k === i ? " on" : "")} aria-label={`슬라이드 ${k + 1}`} />
        ))}
      </div>
    </div>
  );
}

function CblArticle({ article, onClose, onSubscribe }) {
  const D = window.CBL_DATA;
  const isCardnews = !!article.slides;
  const related = article.related || (isCardnews ? ["중동 유니시티 4단지", "용지더샵레이크파크"] : []);
  // 2026-07-29: 목업이라 volumeRank/riseRank에서 이름으로 가격을 찾아 붙임 —
  // 실제로는 관련 단지의 complex_id로 Supabase(complexes/transactions)를 직접 조회
  const priceByName = React.useMemo(() => {
    const map = {};
    [...D.volumeRank, ...D.riseRank].forEach((r) => { if (!(r.name in map)) map[r.name] = r; });
    return map;
  }, [D]);
  React.useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="cbl-article">
      {/* Hero */}
      <header className="cbl-article-hero">
        <div className="cbl-container">
          <button className="cbl-back" onClick={onClose}>← 홈으로</button>
          <span className="cbl-badge">{article.cat}</span>
          <h1 className="cbl-article-title">{article.title}</h1>
          <div className="cbl-article-meta">
            {article.date} · {isCardnews ? "카드뉴스" : `읽는 시간 ${article.read}`} · 창부레터 편집팀
          </div>
        </div>
      </header>

      <div className="cbl-container cbl-article-body">
        {isCardnews ? (
          <CardNewsViewer data={article} />
        ) : (
          <article className="cbl-prose">
            <p className="cbl-lede">{article.excerpt}</p>
            <p>2022년 첫 입주가 시작된 뒤로 창원 의창구의 거래 지형은 눈에 띄게 달라졌다. 대규모 신도시가 만들어낸 학군·상권·교통의 삼각 구도가 서북부 전체의 기준선을 끌어올린 것이다.</p>
            <figure className="cbl-figure">
              <img src={D.img[article.img] || D.img.aptA} alt="" />
              <figcaption>사진은 이해를 돕기 위한 예시 이미지입니다.</figcaption>
            </figure>
            <p>실거래 데이터를 3년 치로 늘려 보면 흐름은 더 분명해진다. 신고가는 특정 평형에서 먼저 터지고, 인접 단지로 시차를 두고 번졌다. 아래 <b>관련 단지</b>에서 그래프로 직접 확인해 보자.</p>
            <blockquote className="cbl-quote">“동네를 이해하면 숫자가 보이고, 숫자를 이해하면 타이밍이 보인다.”</blockquote>
          </article>
        )}

        {related.length > 0 && (
          <section className="cbl-related-wrap">
            <div className="cbl-section-kicker">관련 단지</div>
            <div className="cbl-related-list">
              {related.map((r) => {
                const found = priceByName[r];
                return <RelatedComplex key={r} name={r} price={found?.price} chg={found?.chg} />;
              })}
            </div>
          </section>
        )}

        {/* Subscribe CTA */}
        <section className="cbl-cta-inline">
          <div>
            <div className="cbl-cta-inline-title">이번 주 창원·김해, 놓치지 마세요</div>
            <div className="cbl-cta-inline-sub">매주 월요일 아침, 우리 동네 실거래가와 분석을 메일로.</div>
          </div>
          <button className="cbl-btn cbl-btn-orange" onClick={onSubscribe}>무료 구독하기</button>
        </section>
      </div>
    </div>
  );
}
window.CblArticle = CblArticle;
window.Sparkline = Sparkline;
