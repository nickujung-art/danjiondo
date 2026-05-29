---
phase: 21
name: 투자 분석 통합 페이지
slug: invest-analysis
gathered: 2026-05-29
status: Ready for research → planning
source: 대화 분석 + 리치고 AI 조사 결과 반영
---

# Phase 21: 투자 분석 통합 페이지 — Context

<domain>
## Phase Boundary

실거래 2년 시세 흐름 차트 + 갭투자 랭킹을 하나의 `/invest` 페이지로 통합.
"AI 예측"이 아닌 "실거래 흐름 기반 참고 지수"로 포지셔닝.

**범위 내:**
- 새 `/invest` 통합 페이지 (시세 차트 + 갭투자 랭킹)
- 단지별 타입(59㎡/84㎡ 등)별 2년 매매 실거래 컬러 영역 차트
- 기존 `/gap-analysis` 갭투자 랭킹 테이블을 `/invest`로 통합
- `/complex/[id]` 단지 상세 페이지에 시세 차트 섹션 추가
- 법적 면책 고지 문구

**범위 밖 (이 Phase에서 다루지 않음):**
- 미래 예측선 / AI 가격 예측 (조사 결과: 신뢰도 낮음, 법적 리스크)
- 전세 차트 (매매만 우선)
- 기간 선택 UI (2년 고정 제공)
- 지역별 시세 비교 (단지 단위 집중)

</domain>

<decisions>
## Implementation Decisions

### D-01: 포지셔닝 (확정)
"AI 예측" 아닌 **"실거래 흐름 기반 참고 지수"** 로 표현.
- 법적 면책 고지 필수: "투자 결정에 직접 활용 금지 — 참고용 데이터"
- 근거: 리치고 조사 결과 MAPE ~20%(미검증), 창원·김해 지방 시장 데이터 스파시티, 공간적 자기상관 과대평가 위험

### D-02: 노출 위치 (확정)
- **새 `/invest` 페이지** — 갭투자 + 시세 흐름 통합 페이지
- 기존 `/gap-analysis` 는 `/invest` 로 301 redirect
- `/complex/[id]` 단지 상세 페이지에도 시세 차트 섹션 추가 (GapAnalysisCard 아래)

### D-03: /invest 페이지 구성 (확정)
```
/invest
├── 상단: 지역 전체 집계 시세 흐름 차트
│   ├── 지역 필터 (sgg_code — 기존 gap-analysis 필터 패턴 재사용)
│   ├── 타입 탭 (전체 | 59㎡ | 84㎡) — 고정 버킷
│   └── 2년 컬러 영역 차트 (선택 지역 전체 아파트 매매 월별 평균가)
│       예: "성산구 전체 84㎡ 아파트 시세 흐름"
└── 하단: 갭투자 랭킹 테이블 (기존 getGapRankings 재사용)
    └── 단지 클릭 → /complex/[id] 기존 상세 페이지로 이동
```

### D-09: 시세 차트 집계 단위 (확정)
- **지역 전체 집계** — 선택 sgg_code의 전체 아파트 월별 평균 매매가
- 타입 탭으로 59㎡/84㎡/전체 필터링 (고정 버킷, 동적 생성 아님)
- 신규 RPC 필요: `invest_regional_price_history(sgg_code, area_bucket, months)`

### D-04: 차트 스펙 (확정)
- **기간**: 최근 24개월 고정 (기간 선택 UI 없음)
- **거래 유형**: 매매(`deal_type = 'sale'`)만
- **집계**: 월별 평균 거래가 (computePriceHistory 패턴)
- **차트 타입**: 컬러 영역 차트 — 전월 대비 상승=초록, 하락=빨강 영역 채우기
  - Recharts `AreaChart` + 동적 색상 계산
- **미래 흐름선**: 없음 — 실거래 데이터만 표시

### D-05: 타입 선택 UI (확정)
- **탭 방식**: `전체 | 59㎡ | 84㎡ | ...`
- 단지별 실제 존재하는 exclusive_area 타입 기반으로 동적 생성
- 거래 건수 < 3인 타입은 탭 비활성화 또는 숨김

### D-06: 단지 클릭 시 이동 (확정)
- `/complex/[id]` 기존 단지 상세 페이지로 이동 (별도 투자 상세 페이지 없음)
- 단지 상세 내 시세 차트 섹션이 존재해야 함

### D-07: 미래 흐름선 (확정)
- 없음 — 실거래 2년치 데이터만 표시
- 법적 리스크 + 신뢰도 한계로 배제

### D-08: UI 원칙 (CLAUDE.md 준수)
- AI 슬롭 금지: backdrop-blur, gradient-text, glow, 보라/인디고, gradient orb 없음
- RSC-first: 차트만 `'use client'`, 나머지는 RSC
- Supabase 쿼리는 서버 컴포넌트/Server Action에서만
- 가격 표시: `formatPrice()` 억/만원 단위 (src/lib/format.ts)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 데이터
- `transactions` 테이블: `deal_type`, `deal_amount`, `complex_id`, `deal_date`, `cancel_date`, `superseded_by`, `exclusive_area`
- `complexes` 테이블: `id`, `canonical_name`, `sgg_code`, `dong`
- `complex_gap_stats` 테이블: Phase 20에서 생성 (갭 분석 캐시)

### 재사용 가능 코드 (반드시 확인)
- `src/lib/data/compare.ts` — `computePriceHistory()` 월별 집계 로직
- `src/lib/data/gap-analysis.ts` — `getGapRankings()`, `getComplexGapStats()` (갭투자 랭킹)
- `src/app/compare/CompareChart.tsx` — Recharts AreaChart/LineChart 패턴
- `src/lib/format.ts` — `formatPrice()` 억/만원 포맷
- `src/app/gap-analysis/page.tsx` — 필터 탭 + 테이블 레이아웃 패턴 (통합 대상)
- `src/app/complex/[id]/page.tsx` 또는 `src/app/complexes/[id]/page.tsx` — 단지 상세 페이지 (차트 섹션 추가 위치)

### 참조 규칙
- `CLAUDE.md` — AI 슬롭 금지, RSC-first, Supabase 쿼리 서버에서만
- 거래 데이터 조회: `WHERE cancel_date IS NULL AND superseded_by IS NULL` 항상 포함

</canonical_refs>

<specifics>
## Specific Ideas

### /invest 페이지 레이아웃 스케치
```
/invest — 투자 분석

[지역 필터 탭: 전체 | 창원 의창 | 창원 성산 | ... | 김해]

──── 시세 흐름 ─────────────────────────────────────
타입: [전체] [59㎡] [84㎡] ...

  4.5억 ┤                    ╱▔▔▔╲
  4.0억 ┤            ╱▔▔▔▔▔╱     ╲
  3.5억 ┤╱▔▔▔╲      ╱               ╲
  3.0억 ┼──────╲────╱─────────────────╲─────▶
         24.01  24.06  24.12  25.06   25.12

        상승 구간 = 초록 영역 / 하락 구간 = 빨강 영역
        * 최근 24개월 매매 실거래 월평균 기준
        * 투자 결정에 직접 활용 금지 — 참고용 데이터

──── 갭투자 랭킹 ─────────────────────────────────
[위험도 필터: 전체 | 안전 | 주의 | 위험]

# 단지명           갭 비율  갭 금액   위험도
1 래미안 창원…     72.3%   2.1억    ● 위험
2 힐스테이트…      58.4%   1.8억    ● 주의
3 두산위브…        38.2%   0.9억    ● 안전
```

### 컬러 영역 차트 구현 포인트
```typescript
// 월별 데이터에서 전월 대비 방향 계산
// 상승 구간: fill="#dcfce7" (초록 계열, 연하게)
// 하락 구간: fill="#fee2e2" (빨강 계열, 연하게)
// Recharts: <defs><linearGradient>로 구간별 색상 구현 or
//           전월/현재 비교하여 영역 분할 렌더링
```

### 타입 탭 동적 생성
```sql
-- 단지의 실제 거래 타입 조회 (exclusive_area 기준)
SELECT DISTINCT
  CASE
    WHEN exclusive_area < 50 THEN '소형'
    WHEN exclusive_area < 66 THEN '59㎡'
    WHEN exclusive_area < 95 THEN '84㎡'
    ELSE '대형'
  END as area_type,
  COUNT(*) as cnt
FROM transactions
WHERE complex_id = $1 AND deal_type='sale'
  AND cancel_date IS NULL AND superseded_by IS NULL
GROUP BY area_type
HAVING COUNT(*) >= 3  -- 최소 3건 이상인 타입만
```

### 법적 면책 문구 (하단 고정)
```
* 본 데이터는 국토교통부 실거래가 공개시스템 기반입니다.
* 투자 결정에 직접 활용하지 마세요. 부동산 전문가와 상담하시기 바랍니다.
```

</specifics>

<deferred>
## Deferred Ideas (이 Phase에서 다루지 않음)

- 전세 시세 차트 추가 (매매와 분리 표시)
- 기간 선택 UI (1년/3년/5년)
- AI 가격 예측선 (법적 리스크 + 데이터 신뢰도 문제로 장기 보류)
- 단지별 투자 전용 상세 페이지 (/invest/[id])
- 시세 변동 알림 (특정 % 변동 시 push)
- 지역별 평균 vs 단지 비교 오버레이
- 공급물량 차트 연동

</deferred>

---

*Phase: 21-invest-analysis*
*Context gathered: 2026-05-29*
*Source: 리치고 AI 조사 결과 + 사용자 결정*
