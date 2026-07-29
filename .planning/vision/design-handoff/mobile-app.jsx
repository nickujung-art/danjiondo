// 창부레터 — 모바일 앱 (홈 피드 + 콘텐츠 상세), 아이폰 프레임 안에서 동작
const I = {
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  star: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z",
  back: "M15 18l-6-6 6-6",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13",
  home: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  user: "M4 20a8 8 0 0 1 16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  // 2026-07-29 추가 (BRIEF.md §13): "단지검색" 탭 대체용 — Lucide map-pin
  mapPin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0ZM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
};
function Ic({ d, size = 22, sw = 1.8, fill = "none" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function MTopBar({ title, onBack, onShare, onBell, onStar }) {
  return (
    <div className="m-topbar">
      {onBack
        ? <button className="m-icon" onClick={onBack} aria-label="뒤로"><Ic d={I.back} /></button>
        : <div className="m-logo">창부레터<b>.</b></div>}
      {title && <div className="m-topbar-title">{title}</div>}
      <div className="m-topbar-right">
        {onShare && <button className="m-icon" onClick={onShare} aria-label="공유"><Ic d={I.share} size={20} /></button>}
        {onBell && <button className="m-icon" onClick={onBell} aria-label="알림"><Ic d={I.bell} size={20} /></button>}
        {onStar && <button className="m-icon" onClick={onStar} aria-label="즐겨찾기"><Ic d={I.star} size={20} /></button>}
      </div>
    </div>
  );
}

function MTabBar({ active, onTab }) {
  // 2026-07-29 수정 (BRIEF.md §13): "단지검색" → "지역가이드"로 교체 —
  // 창부레터는 데이터 조회 기능이 없음(실거래이야기 소유), 데스크톱 4개
  // 네비(홈/콘텐츠/지역가이드/마이페이지)와 맞춤
  const tabs = [["홈", I.home], ["콘텐츠", I.doc], ["지역가이드", I.mapPin], ["마이", I.user]];
  return (
    <div className="m-tabbar">
      {tabs.map(([label, d]) => (
        <button key={label} className={"m-tab" + (active === label ? " on" : "")} onClick={() => onTab(label)}>
          <Ic d={d} size={22} sw={active === label ? 2.1 : 1.7} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function MHome({ onOpen, onSubscribe, onTab, toast }) {
  const D = window.CBL_DATA, w = D.weekly;
  const cardnews = { ...D.cardnews };
  return (
    <div className="m-screen">
      <MTopBar onBell={() => toast("알림이 없어요")} onStar={() => toast("즐겨찾기 준비 중")} />
      <div className="m-scroll">
        {/* Hero card */}
        <button className="m-hero" onClick={() => onOpen(cardnews)}>
          <span className="m-badge">주간 리포트 · {w.period}</span>
          <div className="m-hero-title">이번 주,<br />창원·김해가 움직였다.</div>
          <div className="m-hero-stats">
            <div><span className="m-hs-num up">{w.avgRise}</span><span className="m-hs-label">평균 상승률</span></div>
            <div className="m-hs-div" />
            <div><span className="m-hs-num">{w.volume}</span><span className="m-hs-label">매매 거래량</span></div>
          </div>
          <span className="m-hero-cta">이번 주 리포트 보기 →</span>
        </button>

        {/* 랭킹 mini */}
        <section className="m-sec">
          {/* "전체" 더보기는 창부레터 내부 탭이 아니라 실거래이야기 랭킹 화면으로
              나가는 외부 링크 — 실제 구현 시 외부 URL로 교체 */}
          <div className="m-sec-head"><span className="m-sec-title"><span>🔥</span> 이번 주 거래량 TOP</span><button className="m-more" onClick={(e) => { e.stopPropagation(); onTab('실거래이야기 랭킹 →'); }}>전체</button></div>
          <div className="m-ranklist">
            {D.volumeRank.slice(0, 3).map((r) => (
              <a key={r.rank} className="m-rankrow" onClick={(e) => e.preventDefault()} href="#">
                <span className="m-rno">{r.rank}</span>
                <span className="m-rbody"><b>{r.name}</b><em>{r.area} · {r.cnt}건</em></span>
                <span className={"cbl-chg " + (r.chg >= 0 ? "up" : "down")}>{r.chg >= 0 ? "▲" : "▼"} {Math.abs(r.chg)}%</span>
              </a>
            ))}
          </div>
        </section>

        {/* 최신 콘텐츠 가로 스크롤 */}
        <section className="m-sec">
          <div className="m-sec-head"><span className="m-sec-title">최신 콘텐츠</span></div>
          <div className="m-hscroll">
            <button className="m-hcard" onClick={() => onOpen(cardnews)}>
              <div className="m-hcard-media"><img src={D.img.heroApt} alt="" /><span className="m-hcard-tag">카드뉴스</span></div>
              <span className="m-cat">{D.cardnews.cat}</span>
              <div className="m-hcard-title">{D.cardnews.title}</div>
            </button>
            {D.features.map((f) => (
              <button key={f.id} className="m-hcard" onClick={() => onOpen(f)}>
                <div className="m-hcard-media"><img src={D.img[f.img]} alt="" /></div>
                <span className="m-cat">{f.cat}</span>
                <div className="m-hcard-title">{f.title}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 기획기사 리스트 */}
        <section className="m-sec">
          <div className="m-sec-head"><span className="m-sec-title">기획기사 · 동네 분석</span></div>
          <div className="m-feed">
            {D.features.map((f) => (
              <button key={f.id} className="m-feeditem" onClick={() => onOpen(f)}>
                <div className="m-feeditem-media"><img src={D.img[f.img]} alt="" /></div>
                <div className="m-feeditem-body">
                  <span className="m-cat">{f.cat}</span>
                  <div className="m-feeditem-title">{f.title}</div>
                  <span className="cbl-meta">{f.date} · {f.read}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 구독 CTA */}
        <section className="m-sec">
          <div className="m-subcard">
            <div className="m-subcard-title">매주 월요일 아침,<br />메일로 받아보기</div>
            <div className="m-subcard-sub">구독자 4,820명 · 광고 없음</div>
            <button className="m-btn m-btn-orange" onClick={() => onSubscribe()}>무료 구독하기</button>
          </div>
        </section>
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

function MCardNews({ data }) {
  const [i, setI] = React.useState(0);
  const ref = React.useRef(null);
  const onScroll = () => { if (ref.current) setI(Math.round(ref.current.scrollLeft / ref.current.clientWidth)); };
  return (
    <div className="m-cardnews">
      <div className="m-cn-track" ref={ref} onScroll={onScroll}>
        {data.slides.map((s, k) => (
          <div className="m-cn-slide" key={k}>
            <div className="m-cn-card">
              <div className="m-cn-brand">창부레터<span style={{ color: 'var(--orange)' }}>.</span></div>
              <div className="m-cn-kicker">{s.kicker}</div>
              <div className="m-cn-big">{s.big}</div>
              <div className="m-cn-label">{s.label}</div>
              <div className="m-cn-sub">{s.sub}</div>
              <div className="m-cn-foot">{data.title} · {k + 1}/{data.slides.length}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="m-cn-dots">{data.slides.map((_, k) => <span key={k} className={"m-cn-dot" + (k === i ? " on" : "")} />)}</div>
    </div>
  );
}

function MArticle({ article, onBack, onSubscribe, toast }) {
  const D = window.CBL_DATA;
  const isCN = !!article.slides;
  const related = article.related || (isCN ? ["중동 유니시티 4단지", "용지더샵레이크파크"] : []);
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [article]);
  return (
    <div className="m-screen">
      <MTopBar onBack={onBack} onShare={() => toast("공유 링크 복사됨")} title="콘텐츠" />
      <div className="m-scroll" ref={ref}>
        <header className="m-art-hero">
          <span className="m-badge">{article.cat}</span>
          <h1 className="m-art-title">{article.title}</h1>
          <div className="m-art-meta">{article.date} · {isCN ? "카드뉴스" : `읽는 시간 ${article.read}`} · 창부레터 편집팀</div>
        </header>
        <div className="m-art-body">
          {isCN ? <MCardNews data={article} /> : (
            <article className="m-prose">
              <p className="m-lede">{article.excerpt}</p>
              <p>2022년 첫 입주가 시작된 뒤로 창원 의창구의 거래 지형은 눈에 띄게 달라졌다. 대규모 신도시가 만들어낸 학군·상권·교통의 삼각 구도가 서북부 전체의 기준선을 끌어올렸다.</p>
              <figure className="m-figure"><img src={D.img[article.img] || D.img.aptA} alt="" /><figcaption>사진은 이해를 돕기 위한 예시입니다.</figcaption></figure>
              <p>실거래 데이터를 3년 치로 늘려 보면 흐름은 더 분명해진다. 신고가는 특정 평형에서 먼저 터지고, 인접 단지로 시차를 두고 번졌다.</p>
              <blockquote className="m-quote">“동네를 이해하면 숫자가 보이고, 숫자를 이해하면 타이밍이 보인다.”</blockquote>
            </article>
          )}

          {related.length > 0 && (
            <section className="m-related-wrap">
              <div className="m-sec-title" style={{ marginBottom: 10 }}>관련 단지</div>
              {related.map((r) => (
                <a key={r} className="m-related" href="#" onClick={(e) => { e.preventDefault(); toast("단지 상세 준비 중"); }}>
                  <div><b>{r}</b><em>실거래가 · 학군 · 관리비 · AI 예측</em></div>
                  <span className="m-related-arrow">→</span>
                </a>
              ))}
            </section>
          )}
        </div>
        <div style={{ height: 84 }} />
      </div>
      <div className="m-sticky-cta">
        <button className="m-btn m-btn-orange m-btn-block" onClick={() => onSubscribe()}>무료 구독하고 매주 받아보기</button>
      </div>
    </div>
  );
}

function MSheet({ open, onClose }) {
  const [done, setDone] = React.useState(false);
  const [v, setV] = React.useState("");
  React.useEffect(() => { if (open) { setDone(false); setV(""); } }, [open]);
  if (!open) return null;
  return (
    <div className="m-sheet-scrim" onClick={onClose}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-grip" />
        {done ? (
          <div className="m-sheet-done">
            <div className="m-check">✓</div>
            <div className="m-sheet-title">구독 완료!</div>
            <div className="m-sheet-sub">매주 월요일 아침, 우리 동네 소식을 보내드릴게요.</div>
            <button className="m-btn m-btn-green m-btn-block" onClick={onClose}>확인</button>
          </div>
        ) : (
          <>
            <div className="m-sheet-kicker">무료 뉴스레터</div>
            <div className="m-sheet-title">우리 동네 부동산, 매주 월요일에.</div>
            <div className="m-sheet-sub">실거래가·랭킹·동네 분석을 5분 안에. 광고 없이.</div>
            <form onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
              <input className="m-input" type="email" required placeholder="이메일 주소" value={v} onChange={(e) => setV(e.target.value)} />
              <button className="m-btn m-btn-orange m-btn-block" type="submit" style={{ marginTop: 10 }}>무료로 구독하기</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function MobileApp({ initialRoute = "home", initialArticleKey }) {
  const D = window.CBL_DATA;
  const seed = initialArticleKey === "feature" ? D.features[0] : { ...D.cardnews };
  const [route, setRoute] = React.useState(initialRoute);
  const [article, setArticle] = React.useState(seed);
  const [sheet, setSheet] = React.useState(false);
  const [toastMsg, setToastMsg] = React.useState(null);
  const [tab, setTab] = React.useState(initialRoute === "article" ? "콘텐츠" : "홈");

  const toast = (m) => { setToastMsg(m); clearTimeout(window["__mt" + initialRoute]); window["__mt" + initialRoute] = setTimeout(() => setToastMsg(null), 1600); };
  const open = (a) => { setArticle(a); setRoute("article"); setTab("콘텐츠"); };
  const onTab = (t) => {
    setTab(t);
    if (t === "홈") setRoute("home");
    else if (t === "콘텐츠") { setArticle(seed); setRoute("article"); }
    else toast(`‘${t}’ 화면은 준비 중이에요`);
  };

  return (
    <div className="m-app">
      {route === "article"
        ? <MArticle article={article} onBack={() => { setRoute("home"); setTab("홈"); }} onSubscribe={() => setSheet(true)} toast={toast} />
        : <MHome onOpen={open} onSubscribe={() => setSheet(true)} onTab={onTab} toast={toast} />}
      <MTabBar active={tab} onTab={onTab} />
      <MSheet open={sheet} onClose={() => setSheet(false)} />
      {toastMsg && <div className="m-toast">{toastMsg}</div>}
    </div>
  );
}
window.MobileApp = MobileApp;
