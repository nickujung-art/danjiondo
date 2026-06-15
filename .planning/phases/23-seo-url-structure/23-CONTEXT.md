# Phase 23: SEO URL 구조 최적화 - Context

**Gathered:** 2026-06-09
**Status:** Ready for research + planning
**Source:** 사용자 대화 결정 (2026-06-09 세션)

<domain>
## Phase Boundary

이 Phase는 네이버 검색 노출 최대화를 위한 URL 구조 전면 개편이다.
현재 `/complexes/[uuid]` URL을 `/창원시/성산구/내동/대우2차` 형태의 한글 계층 URL로 전환하고,
시·구·동·단지 4개 계층 페이지를 SSR로 구현한다.
네이버 Yeti 크롤러 기준 최적화 (SSR 필수, BreadcrumbList JSON-LD, 사이트맵 등).

**포함 범위:**
- DB: `complexes.url_slug` 컬럼 추가 + 사전 계산 backfill 스크립트
- 라우팅: Next.js catch-all `[...slug]` + 계층별 `[si]`, `[si]/[gu]`, `[si]/[gu]/[dong]` pages
- 301 리다이렉트: `/complexes/[id]` → 새 한글 URL
- 메타데이터: 계층별 title/description, BreadcrumbList JSON-LD, FAQ JSON-LD
- 사이트맵: `/sitemap.xml` (단지별 lastmod + 계층 URL)
- RSS: `/feed.xml` (최근 거래 50건)
- robots.txt 최적화 + 네이버 서치어드바이저 소유권 인증 경로

**제외 범위:**
- 네이버 서치어드바이저 실제 등록 (수동 작업, 코드 외부)
- 구글 Search Console 등록
- 11월 진학률 업데이트 (별도 Phase)

</domain>

<decisions>
## Implementation Decisions

### D-01: URL 구조 — 한글 URL 확정
창원시/성산구/내동/대우2차 형태의 한글 경로 사용.
로마자 변환(romanization) 없음. 한글 그대로 path segment.
**Why:** 네이버는 URL 경로의 한글 키워드를 검색 순위 신호로 사용. 영문 변환 시 키워드 매칭 손실.

### D-02: 창원 4단계 / 김해 3단계 (해결책 A)
- 창원시: `/창원시/[구]/[동]/[단지명]` (4단계)
- 김해시: `/김해시/[동]/[단지명]` (3단계, 구 없음)
Next.js `src/app/[...slug]/page.tsx` catch-all로 두 깊이 모두 처리.
**Why:** 김해시는 행정구 없음. 별도 라우트 분기보다 catch-all이 유지보수 단순.

### D-03: 계층별 독립 페이지 전부 구현
시 페이지, 구 페이지(창원 전용), 동 페이지, 단지 상세 페이지 — 모두 SSR.
시/구 페이지: 하위 구/동 목록 + 평균 시세 테이블.
동 페이지: 해당 동 아파트 목록 + 평균가.
**Why:** 네이버는 계층 중간 페이지도 인덱싱. 중간 페이지 없으면 해당 키워드 ("창원시 성산구 아파트") 노출 없음.

### D-04: SEO 최적화 최우선, 사용자 경험은 2순위
URL 가독성이나 단순함보다 네이버 크롤링 친화성 우선.
따라서 한글 URL 인코딩 문제보다 크롤링 성공이 더 중요.

### D-05: 실거래 데이터 SSR 필수
Yeti 크롤러는 JavaScript를 렌더하지 않음. 모든 실거래 데이터는 서버 컴포넌트에서 fetch.
클라이언트 fetch로 전환 금지.

### D-06: 메타데이터 포맷
- title: `[동] [단지명] 아파트 매매·전세 실거래가 | 단지온도` (≤40자)
- description: `[창원시 성산구 내동] [대우2차] 최근 실거래가 X억원. 평형별 시세·관리비 확인.` (≤80자)
- `<meta http-equiv="content-language" content="ko-kr">` 모든 페이지

### D-07: BreadcrumbList JSON-LD 최우선
네이버 검색결과에서 URL 대신 경로(단지온도 > 창원시 > 성산구 > 내동 > 대우2차)가 표시됨.
눈에 보이는 `<nav>` 브레드크럼 HTML도 필수 (JSON-LD만 있으면 안 됨).

### D-08: url_slug 사전 계산
런타임에 si+gu+dong+canonical_name을 조합하는 대신 `complexes.url_slug` 컬럼에 미리 저장.
배치 스크립트로 backfill. 이후 신규 단지는 ingest 시 자동 계산.
**Why:** 매 요청마다 slug 생성 로직 실행 방지. 캐싱 단순화.

### D-09: 위치 데이터 없는 143개 단지 처리
si/dong=null인 143개 단지는 url_slug=null로 두고 `/complexes/[id]` 유지.
리다이렉트 없음 (slug 없으면 원래 URL 그대로).

### D-10: 동일 단지명 충돌 없음 확인
SQL 쿼리 결과: si+gu+dong+canonical_name 조합으로 0건 충돌.
disambiguation suffix 불필요.

### D-11: RSS 피드 전략
`/feed.xml` — 최근 거래 50건. 당일 크롤링 유도 목적.
Atom 아닌 RSS 2.0 포맷 (네이버 호환성).

### D-12: FAQ JSON-LD 적용 범위
시 레벨, 동 레벨 페이지에만 FAQ JSON-LD 추가.
단지 상세에는 불필요 (이미 구체적 데이터가 있음).
예시: "창원시 아파트 평균 매매가는?" → DB 데이터 기반 동적 답변.

### Claude's Discretion
- url_slug 충돌 시 suffix 전략 (현재 충돌 없으므로 일단 생략, 향후 단지 추가 시 검토)
- catch-all route에서 404 처리 방식
- 사이트맵 분할 전략 (단지 1,849개 + 계층 페이지 → 50,000 이하면 단일 sitemap.xml)
- ISR revalidate 시간 (계층 페이지: 1시간, 단지 페이지: 24시간 권장)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 아키텍처
- `CLAUDE.md` — 스택, 아키텍처 규칙, UI 규칙 (아키텍처 위반 금지 사항)
- `.planning/ROADMAP.md` — Phase 23 요구사항 상세

### DB 스키마
- `supabase/migrations/` — 기존 마이그레이션 패턴 (새 마이그레이션 작성 시 참고)

### 기존 단지 상세 페이지 (리다이렉트 소스)
- `src/app/complexes/[id]/page.tsx` — 현재 단지 상세 페이지 (리다이렉트 대상)

### 데이터 레이어 패턴
- `src/lib/data/` — 기존 데이터 함수 패턴
- `src/lib/supabase/` — Supabase 클라이언트 패턴

</canonical_refs>

<specifics>
## Specific Ideas

### 계층별 URL 예시
```
/창원시                          # 시 페이지
/창원시/성산구                   # 구 페이지 (창원 전용)
/창원시/성산구/내동              # 동 페이지
/창원시/성산구/내동/대우2차      # 단지 상세
/김해시                          # 시 페이지
/김해시/내동                     # 동 페이지 (구 없음)
/김해시/내동/리버사이드팰리스    # 단지 상세
```

### BreadcrumbList JSON-LD 예시 (단지 상세)
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "단지온도", "item": "https://danjiondo.vercel.app"},
    {"@type": "ListItem", "position": 2, "name": "창원시", "item": "https://danjiondo.vercel.app/창원시"},
    {"@type": "ListItem", "position": 3, "name": "성산구", "item": "https://danjiondo.vercel.app/창원시/성산구"},
    {"@type": "ListItem", "position": 4, "name": "내동", "item": "https://danjiondo.vercel.app/창원시/성산구/내동"},
    {"@type": "ListItem", "position": 5, "name": "대우2차"}
  ]
}
```

### 핵심 DB 현황
- complexes: 1,849개 위치 데이터 있음 / 143개 null
- si+gu+dong+canonical_name 충돌: 0건
- 창원시: 1,290개 / 김해시: 562개

</specifics>

<deferred>
## Deferred Ideas

- 네이버 서치어드바이저 실제 등록 (수동 작업, 코드 완료 후 사용자가 직접)
- 네이버 블로그 연동 (SEO 보조 — 별도 운영 작업)
- 구글 Search Console 등록 (네이버 최우선이므로 나중에)
- 진학률 업데이트 (11월 공시 후 별도)

</deferred>

---

*Phase: 23-seo-url-structure*
*Context gathered: 2026-06-09 (대화 결정 기반)*
