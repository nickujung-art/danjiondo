# 실거래이야기 — 인프라 연계 정보

> 2026-07-15 작성. `/new-project` 등 신규 하네스 셋업 도구가 "이미 결정된 연동"을 다시 새로 만들지 않도록 정리한 참고 문서.
> 제품 기획은 `02-realtrade-story.md`, 디자인 시스템은 `03-realtrade-story-design-system.md` 참고.

---

## 핵심 원칙

**이 프로젝트는 새 백엔드를 만들지 않는다.** danjiondo(단지온도)가 이미 쓰고 있는 Supabase 프로젝트를 그대로 재사용한다 (`02-realtrade-story.md` §6, §10 참고). 신규 프로젝트 셋업 도구가 "Supabase 프로젝트 새로 만들기"를 제안하면 **거부하고 아래 기존 프로젝트를 연결**해야 한다.

---

## Supabase

- **프로젝트**: `danjiondo` (기존, 신규 생성 아님)
- **project ref**: `auoravdadyzvuoxunogh`
- **URL**: `https://auoravdadyzvuoxunogh.supabase.co`
- **리전**: ap-southeast-2
- **anon/publishable key**: Supabase 대시보드 또는 `mcp__supabase__get_publishable_keys`로 조회(문서에 값 자체는 적지 않음 — 회전 가능성 있어 원본 참조가 안전)

### 스키마
- 기존 danjiondo 테이블을 그대로 조회한다. 신규 테이블 생성 없음(MVP 기준).
- **site_id 분리 완료**: `favorites`·`ad_campaigns`에 `site_id` 컬럼 추가됨 (`'danjiondo' | 'realtrade-story'`), 신규 insert 시 반드시 `site_id: 'realtrade-story'` 지정해야 danjiondo 데이터와 안 섞임.
- `favorites`에 `area_type_id`(평형 단위 알림 스코프), `price_drop_rate_threshold`(전고점 대비 하락률 알림) 컬럼 추가됨.
- 마이그레이션 히스토리는 **bds 저장소에서만 관리**: `bds/supabase/migrations/`. 실거래이야기 저장소엔 별도 `supabase/migrations/` 폴더를 만들지 않는다 — 같은 DB를 가리키는 마이그레이션 이력이 두 곳으로 나뉘면 어느 쪽이 최신인지 헷갈리게 된다. 신규 스키마 변경이 필요하면 bds 쪽에 마이그레이션 파일을 추가하고 Supabase MCP(`apply_migration`)로 적용.
- DB 타입(`database.ts`)은 `mcp__supabase__generate_typescript_types`로 생성 — 이것도 실거래이야기 저장소 안에 독립적으로 두되(클라이언트 코드가 참조해야 하니), 스키마가 바뀔 때마다 bds/realtrade-story 양쪽에서 재생성 필요.

### 계정/인증
- 기존 Naver OAuth + 이메일 Magic Link OTP 설정 그대로 재사용 — Supabase Auth 프로바이더 신규 등록 불필요.
- `auth.users`/`profiles`도 공유 — danjiondo 계정 보유자는 실거래이야기에 별도 가입 없이 로그인됨(의도된 동작).

---

## .env 변수

실거래이야기 앱은 **클라이언트/조회용 키만 필요**하다. danjiondo가 쓰는 크론·백필·서비스롤 관련 시크릿(`MOLIT_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` 등)은 이 앱에 넣지 않는다 — 그건 bds에서만 쓰는 것들이고, 실거래이야기는 데이터를 읽기만 하는 프론트엔드다.

```
NEXT_PUBLIC_SUPABASE_URL=https://auoravdadyzvuoxunogh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase 대시보드 또는 MCP로 조회>
```

`.env.local`은 커밋 안 함, `.env.example`만 커밋(변수명만, 값 없이).

---

## GitHub

- **repo**: `nickujung-art/realtrade-story` (private) — 2026-07-15 생성했다가 `/new-project` 셋업을 위해 삭제 예정/삭제됨. `/new-project` 스킬이 새로 만들 수도 있고, 같은 이름으로 재생성해도 됨.
- 소유자 계정: `nickujung-art` (bds와 동일 계정)
- bds와는 **완전히 별개 저장소** — 코드 히스토리 공유 없음.

---

## Vercel

- **아직 미설정.** danjiondo는 기존 Vercel 프로젝트(`danjiondo`)로 배포 중이지만, 실거래이야기는 **신규 Vercel 프로젝트**로 별도 배포해야 한다(도메인도 별도, `02-realtrade-story.md` §2 참고 — 도메인 미등록 상태).
- 크론잡(molit-daily 등)은 danjiondo Vercel 프로젝트에만 존재 — 실거래이야기 Vercel 프로젝트엔 크론 설정 불필요(데이터 수집은 bds가 계속 전담).

---

## 스택 (참고: `03-realtrade-story-design-system.md`, bds `CLAUDE.md`)

- Next.js 15 App Router · TypeScript strict · Tailwind **3.4**(v4 아님, danjiondo와 통일) · Pretendard Variable 폰트
- `@supabase/ssr` + `@supabase/supabase-js` — 클라이언트(`src/lib/supabase/client.ts`)는 실시간 구독 전용, 일반 조회는 서버(`src/lib/supabase/server.ts`)에서

---

*문서: `.planning/vision/04-infra-integration.md`*
