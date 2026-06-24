# 창원부동산랩 카드뉴스 자동 생성기 — PLAN.md

## 목표

매주 Supabase 실거래가 DB에서 데이터를 자동으로 집계하여  
CARDDESIGN.md 규격의 인스타그램 카드뉴스(1080×1080px PNG 4장)를 생성한다.

---

## 시스템 구조

```
bds/card-news/
├── scripts/
│   ├── fetch-data.js       # Supabase에서 주간 실거래가 집계
│   ├── render-html.js      # 데이터 → HTML 렌더링 (템플릿 채우기)
│   ├── capture.js          # Puppeteer로 HTML → 1080×1080 PNG 캡처
│   └── generate.js         # 오케스트레이터 (fetch → render → capture)
├── templates/
│   ├── cover.html          # 1p: 표지 (Cover B)
│   ├── highlight.html      # 2p: TOP 3 하이라이트
│   ├── ranking.html        # 3p: 전체 순위 1~10위
│   └── closing.html        # 4p: 클로징 CTA
├── fonts/
│   └── Pretendard-*.woff   # 로컬 폰트 (Puppeteer용 — 외부 CDN 불가)
├── assets/
│   ├── logo.png            # 창원부동산랩 로고
│   └── location.svg        # 위치 핀 아이콘
├── output/
│   └── YYYY-WW/            # 주차별 PNG 출력 폴더
│       ├── 01-cover.png
│       ├── 02-highlight.png
│       ├── 03-ranking.png
│       └── 04-closing.png
├── CARDDESIGN.md           # 디자인 사양서 (원본 복사)
├── PLAN.md                 # 이 파일
├── package.json
└── .env.example
```

---

## 생성 카드뉴스 시리즈 (매주)

### 시리즈 A — 구별 84㎡ 실거래가 TOP 10 (핵심)
> 매주 각 구별로 생성. 6개 구 × 1세트 = 최대 6세트/주

| 지역 | 평형 | 비고 |
|------|------|------|
| 창원 성산구 | 84㎡ | 용지호수공원 단지들 |
| 창원 의창구 | 84㎡ | |
| 창원 마산합포구 | 84㎡ | |
| 창원 마산회원구 | 84㎡ | |
| 창원 진해구 | 84㎡ | |
| 김해시 | 84㎡ | |

> 거래 없으면 해당 주는 스킵 (4위 이하 자동 회색 플레이스홀더)

### 시리즈 B — 주간 최고가 1건 포커스 (단독 스토리형)
> 이번 주 창원+김해 통틀어 가장 비싼 거래 1건
> 스토리 형식 (1080×1920) 또는 피드 정사각형
> 생성: 주 1회

### 시리즈 C — 가성비 랭킹 (평당가 기준)
> 84㎡ 기준 평당가 저렴한 순 TOP 10
> 투자자·실수요자 타겟
> 생성: 격주 또는 월 1회

### 시리즈 D — 거래량 랭킹
> 이번 주 가장 많이 팔린 단지 TOP 10
> 시장 활성도 체크
> 생성: 주 1회

---

## 주간 생성 스케줄 (제안)

| 시간 | 작업 |
|------|------|
| 월요일 00:00 | 지난 주 거래 데이터 집계 (GitHub Actions) |
| 월요일 00:10 | 카드뉴스 HTML → PNG 생성 |
| 월요일 09:00 | 인스타그램 업로드 (Phase 2) |

---

## 구현 단계

### Phase 1 — 카드 생성 (현재)
- [ ] Pretendard 폰트 파일 수집 (woff)
- [ ] 로고 파일 준비 (창원부동산랩)
- [ ] 4개 HTML 템플릿 작성 (CARDDESIGN.md 규격)
- [ ] fetch-data.js — Supabase 주간 집계 쿼리
- [ ] capture.js — Puppeteer 1080×1080 캡처
- [ ] generate.js — 오케스트레이터
- [ ] 로컬 테스트 (샘플 데이터로 PNG 출력 확인)

### Phase 2 — 자동화 (다음 단계)
- [ ] GitHub Actions 주간 cron
- [ ] Instagram Graph API 연동
- [ ] 업로드 전 미리보기/승인 단계 (선택)

---

## 기술 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 엔진 | HTML/Puppeteer | 한글 100% 정확, 무료, 수정 즉시 반영 |
| 캔버스 | 1080×1080px | 인스타 피드 정사각형 |
| DPR | 2× (deviceScaleFactor: 2) | 레티나 품질 |
| 폰트 | 로컬 woff | Puppeteer는 외부 CDN 폰트 미적용 가능성 |
| 데이터 | Supabase 직접 쿼리 | service_role key 사용 (서버 전용) |
| 출력 | output/YYYY-WW/*.png | Git 제외, 로컬 보관 |

---

## 논의 필요 사항

1. **로고 파일**: CARDDESIGN.md에 `uploads/logo-1782283539218.png` 참조 — 파일 제공 필요
2. **브랜드명**: 인스타 계정명 `창원부동산랩` — 단지온도와 별개 계정으로 운영?
3. **대상 지역 범위**: 창원 5개 구 + 김해 외 추가 지역 여부 (양산, 거제 등)
4. **평형 기준**: 84㎡만? 59㎡, 115㎡ 시리즈도?
5. **업로드 방식**: 자동 즉시 업로드 vs 생성 후 확인 후 수동 업로드
6. **Instagram 계정**: Meta Business Suite 설정 여부 (앱 심사 2~4주 소요)
