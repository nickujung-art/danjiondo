// 창부레터 — 변형 B · 데이터 포워드 홈 피드
//
// ⚠️ 2026-07-29 폐기 (BRIEF.md §13): 변형 A(매거진형)로 최종 확정됨에 따라
// 이 변형은 사용하지 않음. index.html도 이 파일을 더 이상 로드하지 않음.
// 참고용으로만 보존 — "우리 단지 얼마야?" 데이터 중심 포지셔닝이 실거래이야기
// 사이트와 브랜드 구분을 흐릴 수 있다는 이유로 제외됨.
function RankTable({ onNav }) {
  const D = window.CBL_DATA;
  const [tab, setTab] = React.useState("volume");
  const rows = tab === "volume" ? D.volumeRank : D.riseRank;
  return (
    <div className="cbl-ranktable">
      <div className="cbl-ranktable-head">
        <div className="cbl-tabs">
          <button className={"cbl-tab" + (tab === "volume" ? " on" : "")} onClick={() => setTab("volume")}>거래량 TOP</button>
          <button className={"cbl-tab" + (tab === "rise" ? " on" : "")} onClick={() => setTab("rise")}>상승률 TOP</button>
        </div>
        <button className="cbl-link" onClick={() => onNav('지도')}>지도에서 보기 →</button>
      </div>
      <table className="cbl-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th><th>단지</th><th>지역</th>
            <th className="num">{tab === "volume" ? "거래" : "실거래가"}</th><th className="num">변동</th><th className="num" style={{ width: 96 }}>추이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} onClick={(e) => e.preventDefault()}>
              <td><span className="cbl-tno">{r.rank}</span></td>
              <td className="cbl-tname">{r.name}</td>
              <td className="cbl-tarea">{r.area}</td>
              <td className="num">{tab === "volume" ? `${r.cnt}건` : `${r.price}`}</td>
              <td className={"num cbl-chg " + (r.chg >= 0 ? "up" : "down")}>{r.chg >= 0 ? "▲" : "▼"} {Math.abs(r.chg)}%</td>
              <td className="num"><div style={{ display: 'flex', justifyContent: 'flex-end' }}><window.Sparkline up={r.chg >= 0} w={72} h={22} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HomeB({ onOpen, onSubscribe, onNav }) {
  const D = window.CBL_DATA;
  const cardnews = { ...D.cardnews };
  const w = D.weekly;

  return (
    <div className="cbl-home">
      {/* HERO — split, number-forward */}
      <section className="cbl-heroB">
        <div className="cbl-container cbl-heroB-inner">
          <div className="cbl-heroB-copy">
            <span className="cbl-badge">주간 리포트 · {w.period}</span>
            <h1 className="cbl-heroB-title">숫자로 먼저 보는<br />우리 동네 부동산.</h1>
            <p className="cbl-heroB-sub">호갱노노가 못 만드는 창원·김해 로컬 데이터. 매주 정리해 드립니다.</p>
            <div className="cbl-heroB-actions">
              <button className="cbl-btn cbl-btn-orange" onClick={() => onOpen(cardnews)}>주간 리포트 →</button>
              <button className="cbl-btn cbl-btn-ghost-light" onClick={() => onNav('단지 검색')}>단지 검색</button>
            </div>
          </div>
          <div className="cbl-statpanel">
            <div className="cbl-statpanel-head">이번 주 창원·김해</div>
            <div className="cbl-statgrid">
              <div className="cbl-stat"><div className="cbl-stat-label">평균 상승률</div><div className="cbl-stat-num up">{w.avgRise}</div></div>
              <div className="cbl-stat"><div className="cbl-stat-label">매매 거래량</div><div className="cbl-stat-num">{w.volume}</div></div>
              <div className="cbl-stat cbl-stat-wide">
                <div className="cbl-stat-label">최고 신고가 · {w.hotArea}</div>
                <div className="cbl-stat-num accent">{w.hotPrice}<span className="cbl-stat-unit">만원</span></div>
                <div className="cbl-stat-spark"><window.Sparkline up w={220} h={40} /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RANK TABLE + SIDEBAR */}
      <section className="cbl-container cbl-mainrow">
        <div className="cbl-main">
          <div className="cbl-section-kicker">주간 랭킹</div>
          <RankTable onNav={onNav} />

          <div className="cbl-section-kicker" style={{ marginTop: 34 }}>최신 콘텐츠</div>
          <div className="cbl-feed-list">
            <button className="cbl-feed-item" onClick={() => onOpen(cardnews)}>
              <div className="cbl-feed-item-media"><img src={D.img.heroApt} alt="" /><span className="cbl-side-tag">카드뉴스</span></div>
              <div className="cbl-feed-item-body">
                <span className="cbl-cat">{D.cardnews.cat}</span>
                <h4 className="cbl-feed-item-title">{D.cardnews.title}</h4>
                <span className="cbl-meta">{D.cardnews.date} · 3장</span>
              </div>
            </button>
            {D.features.map((f) => (
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
          <div className="cbl-side-sub cbl-side-sticky">
            <div className="cbl-side-sub-title">매주 월요일 아침,<br />메일로 받아보기</div>
            <p className="cbl-side-sub-desc">구독자 4,820명 · 광고 없음</p>
            <button className="cbl-btn cbl-btn-orange cbl-btn-block" onClick={onSubscribe}>무료 구독하기</button>
          </div>

          <div className="cbl-side-box">
            <div className="cbl-side-box-title">지금 뜨는 동네</div>
            {[["창원 의창구 중동", "+4.1%"], ["김해 율하동", "+2.9%"], ["창원 성산구 반림동", "+1.9%"], ["김해 삼계동", "+2.4%"]].map(([n, c]) => (
              <a key={n} href="#" onClick={(e) => e.preventDefault()} className="cbl-hood">
                <span>{n}</span><span className="cbl-chg up">{c}</span>
              </a>
            ))}
          </div>

          <div className="cbl-side-box">
            <div className="cbl-side-box-title">분양 캘린더</div>
            {[["6월 4주", "김해 삼계 재개발", "84㎡ 5억 초반"], ["7월 1주", "창원 마산 회원2구역", "미정"]].map(([d, n, p]) => (
              <a key={n} href="#" onClick={(e) => e.preventDefault()} className="cbl-cal">
                <span className="cbl-cal-date">{d}</span>
                <span className="cbl-cal-body"><b>{n}</b><em>{p}</em></span>
              </a>
            ))}
          </div>
        </aside>
      </section>

      <window.NewsletterBar onSubscribe={onSubscribe} />
    </div>
  );
}
window.HomeB = HomeB;
