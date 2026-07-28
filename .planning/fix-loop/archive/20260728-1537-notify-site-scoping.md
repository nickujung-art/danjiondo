# 활성 수정 — bds 알림 크론에 site_id 분리 + realtrade-story 조건부 가격알림

## 문제 정의

`src/lib/notifications/generate-alerts.ts`의 `generatePriceAlerts()`(5분마다 도는
`notify-worker` 크론이 호출)가 두 가지 문제를 안고 있다.

1. `favorites` 조회에 `site_id` 필터가 없어 danjiondo·realtrade-story 즐겨찾기가
   섞여 처리된다 (realtrade-story가 즐겨찾기 기능을 실사용하기 시작한 시점).
2. `price_alert_threshold`(절대가)·`price_drop_rate_threshold`(전고점 대비 하락률)·
   `area_type_id`(평형 스코프) 컬럼이 전혀 읽히지 않는다 — 무조건 "관심단지 신고가
   갱신"만 발송한다. realtrade-story의 조건부 가격알림 기능이 요구하는 체크 로직
   자체가 존재하지 않는다.

근거: `.planning/vision/05-handoff-notes.md` §2, `.planning/vision/02-realtrade-story.md`
§10 항목7, `supabase/migrations/20260715000001_realtrade_story_site_scoping.sql`

## 수정 범위 (파일 목록)

1. `src/lib/notifications/generate-alerts.ts` — 로직 분리 + 신규 조건부 알림 추가
2. `src/__tests__/notify-worker.test.ts` — site_id 격리 + 조건부 알림 신규 테스트 추가

DB 마이그레이션 불필요(컬럼은 이미 존재), 신규 API 라우트 불필요(`route.ts`는
`generatePriceAlerts()` 시그니처를 그대로 호출하므로 무변경).

## 해결 접근법

`generatePriceAlerts()`를 오케스트레이터로 남기고, 사이트별 로직을 두 헬퍼로 분리한다.

**1. `generateNewHighAlerts()` — danjiondo, 기존 동작 100% 보존**
기존 로직 그대로 두되 `favorites` 조회에 `.eq('site_id', 'danjiondo')`만 추가한다.
"관심단지 최근 7일 신고가 갱신 → 무조건 알림" 동작은 변경 없음.

**2. `generateConditionalAlerts()` — realtrade-story, 신규**
- 대상: `site_id = 'realtrade-story'` AND `alert_enabled = true` AND
  (`price_alert_threshold IS NOT NULL` OR `price_drop_rate_threshold IS NOT NULL`)
- 각 즐겨찾기 행마다 최근 7일 내 최저가 거래 1건을 조회한다(`area_type_id` 설정 시
  해당 평형만 필터) — "이번 주 가장 낮게 찍힌 가격"이 임계값 조건을 가장 잘
  대표하기 때문.
  - **절대가 조건**: 그 최저가가 `price_alert_threshold` 이하이면 알림
    (`event_type: 'price_below_threshold'`)
  - **하락률 조건**: 별도 쿼리로 전고점(해당 단지, `area_type_id` 스코프 시 해당
    평형의 역대 최고 실거래가 — 스냅샷 없이 매번 재계산)을 구하고, 최저가가 전고점
    대비 `price_drop_rate_threshold`% 이상 하락했으면 알림
    (`event_type: 'price_drop_rate'`)
- dedupe: `dedupe_key = ${deal_date}:${area_type_id ?? 'any'}` — `target_id`가
  `complex_id`뿐이라 area_type_id를 안 섞으면, 한 유저가 같은 단지에 평형이 다른
  알림 조건 행을 여러 개 갖고 있을 때(전체즐겨찾기 행 + 평형별 알림 행 — 실제로
  `20260723000001_fix_favorites_area_type_unique.sql`이 이 다중 행 구조를 위해
  만들어짐) 같은 날 두 조건이 동시에 만족되면 `UNIQUE(user_id, event_type,
  target_id, dedupe_key)` 충돌로 둘 중 하나가 조용히 유실된다 — 서로 다른 정당한
  알림인데 "중복"으로 오판되는 버그. area_type_id를 dedupe_key에 포함시켜 방지.
- `price_drop_rate_threshold IS NULL`인 행은 전고점 쿼리 자체를 스킵(절대가 조건만
  있는 행이 불필요한 쿼리를 태우지 않도록)
- **알려진 한계(이번 수정 범위 밖)**: `area_type_id`가 NULL인 거래(면적 애매성 가드로
  분류 보류된 건, `20260707000000_area_type_ambiguity_guard.sql`)는 평형 스코프
  쿼리에서 제외된다 — 전고점이 실제보다 낮게 잡혀 하락률 조건이 늦게 트리거될 수
  있음(과다알림이 아닌 과소알림 방향이라 안전 측 오차). 기존 UI도 동일 한계를 그대로
  안고 있는 이미 수용된 트레이드오프라 이번 수정에서 별도 대응하지 않음.

두 헬퍼 모두 알림 insert는 공통 `insertAlertIfNew()` 함수로 통합(중복 제거).

## 예상 변경 사항

- `generatePriceAlerts()`: `generateNewHighAlerts(supabase) + generateConditionalAlerts(supabase)` 합산 리턴 (외부 시그니처 무변경)
- 신규 헬퍼: `getScopedRecentLow()`, `getHistoricalPeak()`, `insertAlertIfNew()`
- 테스트: 기존 3케이스(신고가 갱신·dedup) 그대로 통과해야 함(favorite insert가
  site_id 미지정 → 기본값 'danjiondo'이므로 영향 없음) + realtrade-story 신규 케이스
  (절대가 알림, 하락률 알림, area_type_id 스코프, site_id 격리로 danjiondo 로직이
  realtrade-story 즐겨찾기를 건드리지 않음 확인) 추가

## 루프 카운터: 0
