/* 창부레터 — shared mock content (real Changwon·Gimhae places & complexes)
 *
 * 2026-07-29 수정 (BRIEF.md §13 반영):
 * - nav에서 "단지 검색"·"지도" 제거 — 창부레터는 콘텐츠 전용 사이트
 * - weekly / volumeRank / riseRank / cardnews 는 실제 구현 시 창부레터 자체
 *   집계가 아니라, bds·실거래이야기와 공유하는 Supabase 프로젝트의
 *   complexes/transactions 테이블을 직접 조회해서 채운다. 세 프로젝트가
 *   같은 DB를 쓰므로 complex_id가 동일한 값 — 별도 API 계약 불필요.
 */
window.CBL_DATA = {
  // Free stock imagery (city / apartments)
  img: {
    heroApt:  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80&auto=format&fit=crop",
    skyline:  "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80&auto=format&fit=crop",
    aptA:     "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=900&q=80&auto=format&fit=crop",
    aptB:     "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=80&auto=format&fit=crop",
    aptC:     "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&q=80&auto=format&fit=crop",
    aptD:     "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=900&q=80&auto=format&fit=crop",
    interior: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=80&auto=format&fit=crop",
    street:   "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=900&q=80&auto=format&fit=crop"
  },

  // Weekly transaction ranking (거래량 TOP)
  volumeRank: [
    { rank: 1, name: "중동 유니시티 4단지", area: "창원 의창구 중동", cnt: 14, price: "8억 9,000", chg: +2.3 },
    { rank: 2, name: "용지더샵레이크파크", area: "창원 성산구 용지동", cnt: 11, price: "10억 2,000", chg: +1.1 },
    { rank: 3, name: "율하자이힐스테이트", area: "김해 율하동", cnt: 9,  price: "5억 4,500", chg: +0.8 },
    { rank: 4, name: "창원더샵센트럴파크", area: "창원 마산회원구", cnt: 8,  price: "6억 1,000", chg: -0.4 },
    { rank: 5, name: "장유 대동피렌체", area: "김해 장유", cnt: 7,  price: "4억 3,000", chg: +1.6 }
  ],

  // Rising rate ranking (상승률 TOP)
  riseRank: [
    { rank: 1, name: "중동 유니시티 1단지", area: "창원 의창구", chg: +4.1, price: "8억 4,000" },
    { rank: 2, name: "성원토월그랜드타운", area: "창원 성산구", chg: +3.2, price: "3억 8,500" },
    { rank: 3, name: "율하이엘린 더힐", area: "김해 율하", chg: +2.9, price: "5억 1,000" },
    { rank: 4, name: "삼계 푸르지오", area: "김해 삼계동", chg: +2.4, price: "3억 6,000" },
    { rank: 5, name: "트리비앙", area: "창원 성산구 반림동", chg: +1.9, price: "4억 9,000" }
  ],

  // Weekly headline metrics
  weekly: {
    period: "6월 3주차 (6.16–6.22)",
    avgRise: "+1.4%",
    volume: "312건",
    hotArea: "창원 의창구 중동",
    hotPrice: "8억 9,000"
  },

  // 기획기사 (planned features)
  features: [
    {
      id: "f1", cat: "동네 분석",
      title: "왜 중동이 올랐나 — 유니시티가 바꾼 창원 서북부 지형도",
      excerpt: "1만 세대 신도시가 들어서자 의창구의 무게중심이 통째로 옮겨졌다. 데이터로 본 3년간의 변화.",
      date: "6.20", read: "8분", img: "aptA",
      related: ["중동 유니시티 4단지", "중동 유니시티 1단지"]
    },
    {
      id: "f2", cat: "동네 분석",
      title: "장유 신도시, 김해의 강남이 될 수 있을까",
      excerpt: "율하·장유 학군과 교통 호재를 짚어봤다. 실수요자가 지금 봐야 할 3개 단지.",
      date: "6.18", read: "6분", img: "aptB",
      related: ["율하자이힐스테이트", "장유 대동피렌체"]
    },
    {
      id: "f3", cat: "기획",
      title: "삼성·포스코 임직원이 몰리는 창원 동네 TOP 3",
      excerpt: "회사와 가깝고 학군 좋은 곳. 이전 직원들이 실제로 계약한 단지를 추렸다.",
      date: "6.16", read: "5분", img: "aptC",
      related: ["용지더샵레이크파크", "창원더샵센트럴파크"]
    }
  ],

  // 사이드 아이템 (분양 / 동네분석 / 랭킹)
  side: [
    { cat: "분양 뉴스", title: "김해 삼계 재개발 6월 분양가 공개… 84㎡ 5억 초반", tag: "분양", img: "aptD" },
    { cat: "동네 분석", title: "마산 회원구, 재건축 연한 도래 단지 한눈에", tag: "재건축", img: "street" },
    { cat: "랭킹", title: "이번 주 전세가율 TOP — 김해 내외동 82%", tag: "랭킹", img: "interior" }
  ],

  // 카드뉴스 slides (for viewer)
  cardnews: {
    cat: "주간 실거래가",
    title: "6월 3주차 창원·김해 실거래가 리포트",
    date: "2025.6.23",
    slides: [
      { kicker: "이번 주 요약", big: "312건", label: "창원·김해 아파트 매매 거래", sub: "전주 대비 +18건" },
      { kicker: "가장 뜨거운 동네", big: "중동", label: "창원 의창구", sub: "유니시티 84㎡ 8.9억 신고가" },
      { kicker: "상승률 1위", big: "+4.1%", label: "중동 유니시티 1단지", sub: "한 주 만에 3,400만원 ↑" }
    ]
  },

  // 2026-07-29 수정: "단지 검색"·"지도" 제거 — 창부레터는 콘텐츠 전용 사이트로
  // 결정됨(BRIEF.md §11/§12). 데이터 조회는 별도 사이트 "실거래이야기"가 전담.
  nav: ["홈", "콘텐츠", "지역 가이드", "마이페이지"]
};
