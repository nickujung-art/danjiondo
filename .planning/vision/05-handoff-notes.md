# 실거래이야기 — Handoff 노트 (2026-07-15)

> Antigravity에서 `realtrade-story` 폴더 열고 `/new-project` 실행하기 직전 시점의 전체 상태 스냅샷.
> 제품 기획: `02-realtrade-story.md` · 디자인: `03-realtrade-story-design-system.md` · 인프라 연결정보: `04-infra-integration.md`

---

## 1. 크론잡 현황 — 전부 bds(danjiondo) GitHub Actions에서 돈다

**결론: 그렇다.** 실거래이야기 관련 크론은 하나도 없고(아직 기능 자체가 없으니 당연), 기존 danjiondo 크론이 전부 `bds` 저장소의 `.github/workflows/*.yml`에서 스케줄 실행된다. 실거래이야기 저장소(`realtrade-story`)엔 크론 워크플로가 없고, **앞으로도 만들 필요 없다** — 데이터 수집·알림 발송은 계속 bds가 전담하고, 실거래이야기는 그 결과(Supabase 테이블)를 읽기만 하는 구조.

### 실행 방식이 두 가지로 나뉜다
- **A. GitHub Actions 안에서 직접 스크립트 실행** (예: `molit-daily.yml` → `npx tsx scripts/backfill-realprice.ts`) — Vercel 배포와 무관하게 GitHub Actions 러너 안에서 끝남
- **B. GitHub Actions가 트리거만 하고, 실제 로직은 Vercel에 배포된 API Route 안에 있음** (예: `notify-worker.yml` → `POST {NEXT_PUBLIC_SITE_URL}/api/worker/notify`, `x-cron-secret` 헤더로 인증) — 이 경우 로직 수정은 `src/app/api/worker/*` + 그게 부르는 `src/lib/` 코드를 고쳐야 하고, 반영되려면 danjiondo Vercel 프로젝트에 재배포까지 필요

### 전체 크론 목록 (`bds/.github/workflows/`)
| 파일 | 주기 | 역할 |
|---|---|---|
| `molit-daily.yml` | 매일 04:00 KST | 국토부 실거래가 전월+당월 수집 |
| `notify-worker.yml` | 5분마다 | **알림 생성·발송** — 실거래이야기 조건부 가격알림과 직결(§2 참고) |
| `rankings-cron.yml` | 매시 | 랭킹 집계 |
| `compute-predictions.yml` / `-ai.yml` | 매일 02:00/03:00 KST | AI 예측·코멘트 |
| `geocode-new-listings.yml` | 매일 05:30 KST | 신규 매물 지오코딩 |
| `cafe-ingest.yml` / `cafe-code-weekly.yml` | 매일/매주 | 카페 크롤링 |
| `db-backup.yml` | 매주 토요일 | DB 백업 |
| `naver-listings-biweekly.yml` / `naver-area-types-monthly.yml` | 격주/매월 | 네이버 매물·평형 갱신 |
| `weekly-digest.yml` / `weekly-generate.yml` / `custom-cardnews.yml` | 매주 | 카드뉴스·다이제스트(창부레터 계열) |
| `fetch-regional-unsold.yml` / `sgis-stats.yml` / `update-regional-income.yml` | 월/분기/연 | 지역 통계 |
| `molit-backfill-once.yml` / `kapt-*-once.yml` / `map-naver-complexes-once.yml` / `link-transactions-once.yml` / `embed-complexes-once.yml` | 수동(workflow_dispatch) | 1회성 백필류 — Phase 34(부산 확장) 관련, 진행 중 |

---

## 2. 조건부 가격알림 크론 — 지금 당장은 없음, 나중에 bds 쪽 수정 필요

**중요한 발견 (2026-07-15)**: `02-realtrade-story.md` §4는 "절대가 조건은 기존 `favorites.price_alert_threshold` 재사용 가능"이라고 적었었는데, 실제 코드(`bds/src/lib/notifications/generate-alerts.ts`, `notify-worker` 크론이 5분마다 호출)를 열어보니 **이 컬럼을 전혀 읽지 않는다.** 지금 로직은:

```
관심단지(favorites, alert_enabled=true) 중 최근 7일 신고가 갱신된 게 있으면
→ 가격 조건 확인 없이 무조건 "신고가 갱신" 알림 발송
```

즉 `price_alert_threshold`("X억 이하로")도, 이번에 새로 추가한 `price_drop_rate_threshold`("전고점 대비 -10%")·`area_type_id`(평형 스코프)도 **컬럼만 있고 체크 로직 자체가 없다.** 그리고 이 쿼리엔 `site_id` 필터도 없어서, 실거래이야기가 즐겨찾기 쓰기 시작하면 이 크론이 두 사이트 구분 없이 섞어서 처리한다.

### 나중에 bds 쪽에 요청해야 할 내용 (실거래이야기 4단계 "즐겨찾기+조건부 가격알림" 작업 시점)

다른 CLI 창(Antigravity, `realtrade-story`)에서 이 기능을 만들다가 "가격알림이 실제로 안 옴" 같은 문제에 부딪히면, **이 저장소는 실거래이야기 쪽에서 직접 못 고친다** — bds 쪽(이 Claude Code 세션이나 별도 bds 작업)에 아래 내용으로 요청하면 된다:

> `bds/src/lib/notifications/generate-alerts.ts`의 `generatePriceAlerts()` 함수를 수정해서:
> 1. `favorites` 조회에 `.eq('site_id', 'realtrade-story')` 필터 추가(또는 danjiondo/realtrade-story 분기 처리)
> 2. `price_alert_threshold`(절대가) 조건 체크 추가 — 신고가가 아니라 "이 값 이하로 떨어졌을 때"
> 3. `price_drop_rate_threshold`(전고점 대비 하락률) 조건 체크 추가 — 전고점은 스냅샷이 아니라 `transactions` 테이블에서 매번 재계산(`02-realtrade-story.md` §10 항목3 참고)
> 4. `area_type_id`가 설정된 경우 해당 평형(면적타입)의 거래만 비교 대상으로 필터링

이건 **DB 마이그레이션(§9 0단계)과 달리 지금 미리 해둘 수 없는 작업**이다 — 실거래이야기의 즐겨찾기 UI/저장 로직이 먼저 나와야 이 크론이 뭘 읽어야 하는지 확정되기 때문. 4단계 착수 시점에 처리.

---

## 3. 이전에 만들었던 코드는 사라졌다 (의도된 리셋)

`realtrade-story` GitHub repo(`nickujung-art/realtrade-story`)는 삭제 완료 확인됨(`gh repo view` 404). 그 안에 있던 **Next.js 15 스캐폴딩 + 검색 탭 기능(자동완성, 최근/인기 검색어, 하단 탭바) 코드는 이제 실물로 남아있지 않다** — 이 대화 기록에만 설명이 남아있고, 로컬 폴더도 비웠기 때문에 복원본이 없다. `/new-project`로 다시 시작하면 검색 기능은 처음부터 다시 만들어야 한다(단, 이번엔 `bds/src/lib/data/complex-search.ts` 등 재사용 대상 코드 자체는 bds에 그대로 있으니 다시 포팅하는 건 어렵지 않음).

DB 쪽(마이그레이션 적용분: `site_id`·`area_type_id`·`price_drop_rate_threshold` 컬럼)은 **살아있다** — Supabase 프로젝트에 실제로 적용된 스키마 변경이라 로컬/GitHub repo 삭제와 무관하게 유지됨.

---

## 4. 현재 상태 스냅샷 (2026-07-15)

| 항목 | 상태 |
|---|---|
| `realtrade-story` 로컬 폴더 | 코드 없음 + `.planning/vision/`에 문서 4개(`02-realtrade-story.md`, `03-realtrade-story-design-system.md`, `04-infra-integration.md`, `05-handoff-notes.md` — 이 파일 자신도 포함) |
| `realtrade-story` GitHub repo | 삭제됨 — `/new-project`가 재생성하거나 수동 생성 필요 |
| Supabase | free 플랜, 470MB/500MB(2026-07-15 재확인, 어제와 거의 동일 — **Pro 전환 여전히 미반영**) |
| Supabase 스키마 변경 | 적용 완료(`site_id`, `area_type_id`, `price_drop_rate_threshold`) |
| Vercel | 실거래이야기용 프로젝트 없음 — 신규 필요 |
| 도메인 | 미등록 |
| bds(danjiondo) | 무관하게 정상 운영 중, 오늘 변경분은 마이그레이션+문서뿐 |

---

## 5. `/new-project` 실행 시 같이 알려줄 것 (요약)

1. `.planning/vision/02-realtrade-story.md`, `03-realtrade-story-design-system.md`, `04-infra-integration.md`, 이 파일(`05-handoff-notes.md`) 전부 읽고 시작
2. 새 Supabase 프로젝트 만들지 말 것 — 기존 `auoravdadyzvuoxunogh` 재사용(`04` 참고)
3. 크론/알림 로직은 이 저장소에 안 만듦 — bds가 계속 전담(§1·§2 참고)
4. Tailwind는 3.4로 (v4 아님)
5. `02-realtrade-story.md` §10(리스크 점검)에 "기존 재사용 가능"이라던 기획이 실제 코드 확인 결과 아니었던 것 8건이 정리돼 있음(동/호수·site_id·알림스키마·Supabase용량·급등락·법적문서·알림크론·AI코멘트) — 새로 뭔가를 "기존 거 그대로 쓰면 됨"이라고 판단하기 전에 이 표부터 확인할 것

---

*문서: `.planning/vision/05-handoff-notes.md`*
