// 창부레터 — 변형 A · 매거진 에디토리얼 홈 피드
function RankStrip({ title, rows, onMore }) {
  return (
    <div className="cbl-rankstrip">
      <div className="cbl-rankstrip-head">
        <span className="cbl-rankstrip-title"><span className="cbl-fire">🔥</span>{title}</span>
        <button className="cbl-link" onClick={onMore}>전체 랭킹 →</button>
      </div>
      <div className="cbl-rankstrip-row">
        {rows.map((r) => (
          <a key={r.rank} href="#" onClick={(e) => e.preventDefault()} className="cbl-rankchip">
            <span className="cbl-rankchip-no">{r.rank}</span>
            <span className="cbl-rankchip-body">
              <span className="cbl-rankchip-name">{r.name}</span>
              <span className="cbl-rankchip-sub">{r.area} · {r.cnt}건</span>
            </span>
            <span className={"cbl-chg " + (r.chg >= 0 ? "up" : "down")}>{r.chg >= 0 ? "▲" : "▼"} {Math.abs(r.chg)}%</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function HomeA({ onOpen, onSubscribe, onNav }) {
  const D = window.CBL_DATA;
  const cardnews = { ...D.cardnews };

  return (
    <div className="cbl-home">
      {/* HERO */}
      <section className="cbl-heroA">
        <div className="cbl-container cbl-heroA-inner">
          <div className="cbl-heroA-copy">
            <span className="cbl-badge">주간 리포트 · {D.weekly.period}</span>
            <h1 className="cbl-heroA-title">이번 주,<br />창원·김해가 움직였다.</h1>
            <p className="cbl-heroA-sub">평균 <b>{D.weekly.avgRise}</b> · 거래 <b>{D.weekly.volume}</b> · 가장 뜨거운 동네는 <b>{D.weekly.hotArea}</b>.</p>
            <div className="cbl-heroA-actions">
              <button className="cbl-btn cbl-btn-orange" onClick={() => onOpen(cardnews)}>이번 주 리포트 읽기 →</button>
              <button className="cbl-btn cbl-btn-ghost-light" onClick={onSubscribe}>뉴스레터 구독</button>
            </div>
          </div>
          <button className="cbl-cnhero" onClick={() => onOpen(cardnews)} aria-label="주간 실거래가 카드뉴스 열기">
            <div className="cbl-cnstack">
              <div className="cbl-cncard back2" aria-hidden="true"><span className="cbl-cncard-strip" /></div>
              <div className="cbl-cncard back1" aria-hidden="true"><span className="cbl-cncard-strip" /></div>
              <div className="cbl-cncard front">
                <div className="cbl-cncard-head">
                  <span className="cbl-cncard-brand">창부레터<b>.</b></span>
                  <span className="cbl-cncard-week">6월 3주차 리포트</span>
                </div>
                <div className="cbl-cncard-hl">
                  <span className="cbl-cncard-hl-tag">이번 주 신고가 ▲</span>
                  <span className="cbl-cncard-hl-name">중동 유니시티 4단지 · 84㎡</span>
                  <span className="cbl-cncard-hl-price">8억 9,000<em>만원</em></span>
                </div>
                <div className="cbl-cncard-rows">
                  {D.volumeRank.slice(1, 4).map((r) => (
                    <div className="cbl-cncard-row" key={r.rank}>
                      <span className="cbl-cncard-row-name">{r.name}</span>
                      <span className="cbl-cncard-row-price">{r.price}</span>
                      <span className={"cbl-chg " + (r.chg >= 0 ? "up" : "down")}>{r.chg >= 0 ? "▲" : "▼"} {Math.abs(r.chg)}%</span>
                    </div>
                  ))}
                </div>
                <div className="cbl-cncard-foot"><span>주간 실거래가 카드뉴스</span><span>1 / 3 →</span></div>
              </div>
            </div>
            <span className="cbl-cnhero-hint">클릭하면 카드뉴스 3장 넘겨보기</span>
          </button>
        </div>
      </section>

      {/* RANKING STRIP */}
      <div className="cbl-container">
        {/* 2026-07-29: "더보기"는 창부레터 내부(지도)가 아니라 실거래이야기 랭킹
            페이지로 나가는 외부 링크 — onNav 대신 실제 구현 시 <a href="https://실거래이야기 도메인/ranking"> 등으로 교체 */}
        <RankStrip title="이번 주 거래량 TOP 5" rows={D.volumeRank} onMore={() => onNav('실거래이야기 랭킹 →')} />
      </div>

      {/* MAIN + SIDEBAR */}
      <section className="cbl-container cbl-mainrow">
        <div className="cbl-main">
          <div className="cbl-section-kicker">이번 주 콘텐츠</div>
          <button className="cbl-feature-lead" onClick={() => onOpen(D.features[0])}>
            <div className="cbl-feature-lead-media"><img src={D.img[D.features[0].img]} alt="" /></div>
            <div className="cbl-feature-lead-body">
              <span className="cbl-cat">{D.features[0].cat}</span>
              <h3 className="cbl-feature-lead-title">{D.features[0].title}</h3>
              <p className="cbl-feature-lead-ex">{D.features[0].excerpt}</p>
              <span className="cbl-meta">{D.features[0].date} · 읽는 시간 {D.features[0].read}</span>
            </div>
          </button>
          <div className="cbl-feed-list">
            {D.features.slice(1).map((f) => (
              <button key={f.id} className="cbl-feed-item" onClick={() => onOpen(f)}>
                <div className="cbl-feed-item-media"><img src={D.img[f.img]} alt="" /></div>
                <div className="cbl-feed-item-body">
                  <span className="cbl-cat">{f.cat}</span>
                  <h4 className="cbl-feed-item-title">{f.title}</h4>
                  <span className="cbl-meta">{f.date} · {f.read}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="cbl-side">
          <div className="cbl-section-kicker">지금 뜨는</div>
          {D.side.map((s, i) => (
            <button key={i} className="cbl-side-item" onClick={() => onOpen({ cat: s.cat, title: s.title, date: "6.19", read: "4분", img: s.img })}>
              <div className="cbl-side-item-media"><img src={D.img[s.img]} alt="" /><span className="cbl-side-tag">{s.tag}</span></div>
              <div className="cbl-side-item-body">
                <span className="cbl-cat">{s.cat}</span>
                <h4 className="cbl-side-item-title">{s.title}</h4>
              </div>
            </button>
          ))}
          <div className="cbl-side-sub">
            <div className="cbl-side-sub-title">구독자 <b>4,820</b>명이<br />매주 월요일 받아봅니다</div>
            <button className="cbl-btn cbl-btn-orange cbl-btn-block" onClick={onSubscribe}>무료로 받아보기</button>
          </div>
        </aside>
      </section>

      {/* 기획기사 3열 그리드 */}
      <section className="cbl-container cbl-gridsec">
        <div className="cbl-gridsec-head">
          <h2 className="cbl-h2">기획기사 · 동네 분석</h2>
          <button className="cbl-link" onClick={() => onNav('콘텐츠')}>콘텐츠 전체 →</button>
        </div>
        <div className="cbl-grid3">
          {D.features.map((f) => (
            <button key={f.id} className="cbl-card" onClick={() => onOpen(f)}>
              <div className="cbl-card-media"><img src={D.img[f.img]} alt="" /><span className="cbl-card-cat">{f.cat}</span></div>
              <div className="cbl-card-body">
                <h3 className="cbl-card-title">{f.title}</h3>
                <p className="cbl-card-ex">{f.excerpt}</p>
                <span className="cbl-meta">{f.date} · {f.read}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* NEWSLETTER CTA BAR */}
      <NewsletterBar onSubscribe={onSubscribe} />
    </div>
  );
}

function NewsletterBar({ onSubscribe }) {
  const [email, setEmail] = React.useState("");
  return (
    <section className="cbl-ctabar">
      <div className="cbl-container cbl-ctabar-inner">
        <div className="cbl-ctabar-copy">
          <h2 className="cbl-ctabar-title">창원·김해 부동산, 매주 월요일 아침 메일함으로.</h2>
          <p className="cbl-ctabar-sub">실거래가·랭킹·동네 분석을 5분 안에. 광고 없이, 무료로.</p>
        </div>
        <form className="cbl-ctabar-form" onSubmit={(e) => { e.preventDefault(); onSubscribe(email); }}>
          <input className="cbl-input" type="email" placeholder="이메일 주소" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="cbl-btn cbl-btn-orange" type="submit">구독하기</button>
        </form>
      </div>
    </section>
  );
}
window.HomeA = HomeA;
window.NewsletterBar = NewsletterBar;
window.RankStrip = RankStrip;
