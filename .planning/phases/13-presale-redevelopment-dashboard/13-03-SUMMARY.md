---
phase: 13-presale-redevelopment-dashboard
plan: "03"
subsystem: redevelopment-admin
tags: [server-action, zod, tdd, admin, complexes, status]
dependency_graph:
  requires:
    - 13-01 (RED 테스트 스캐폴드: redevelopment-actions.test.ts 7개 todo)
  provides:
    - setComplexRedevelopmentStatus Server Action (REDV-01)
    - complexes.status active ↔ in_redevelopment 전환 UI
    - /admin/redevelopment 단지 status 변경 카드
  affects:
    - 13-04: /presale Tier 2 섹션의 in_redevelopment 단지 데이터 입력 경로 완성
tech_stack:
  added: []
  patterns:
    - requireAdmin guard FIRST → Zod safeParse 순서 (payload shape leak 방지)
    - z.string().uuid().nullable() (predecessor/successor 선택적 연결)
    - createSupabaseAdminClient (RLS 우회, complexes 테이블 직접 UPDATE)
    - revalidatePath 3경로 (/admin/redevelopment, /presale, /complexes/[id])
    - formData → Server Action 래퍼 패턴 (listing-price-actions 동일 패턴)
key_files:
  created: []
  modified:
    - src/lib/actions/redevelopment-actions.ts
    - src/lib/actions/redevelopment-actions.test.ts
    - src/app/admin/redevelopment/page.tsx
decisions:
  - "setComplexRedevelopmentStatus와 upsertRedevelopmentProject 분리 유지: 각각 다른 테이블(complexes vs redevelopment_projects)을 대상으로 하는 독립적 책임"
  - "complexes.status enum 전환 범위를 active|in_redevelopment로 제한: demolished/merged 등 다른 상태는 별도 마이그레이션·UI 역할"
metrics:
  duration: "약 20분"
  completed_date: "2026-05-20"
  tasks_completed: 2
  files_created: 0
  files_modified: 3
---

# Phase 13 Plan 03: setComplexRedevelopmentStatus Admin Action Summary

**한 줄 요약:** REDV-01 Server Action (complexes status 전환 + predecessor/successor 연결) 구현 + 7개 test GREEN + /admin/redevelopment 단지 재건축 지정 카드 추가

## Task 1 결과: setComplexRedevelopmentStatus Server Action + 7개 test GREEN

### 구현 시그니처

```typescript
export async function setComplexRedevelopmentStatus(input: {
  complexId:     string                       // UUID
  status:        'active' | 'in_redevelopment'
  predecessorId: string | null                // UUID or null
  successorId:   string | null                // UUID or null
}): Promise<{ error: string | null }>
```

### Zod 스키마 (인라인 화이트리스트)

```typescript
const complexStatusSchema = z.object({
  complexId:     z.string().uuid('유효한 단지 ID가 아닙니다'),
  status:        z.enum(['active', 'in_redevelopment'], { message: '유효한 상태가 아닙니다' }),
  predecessorId: z.string().uuid('유효한 이전 단지 ID가 아닙니다').nullable(),
  successorId:   z.string().uuid('유효한 신규 단지 ID가 아닙니다').nullable(),
})
```

- `z.enum(['active', 'in_redevelopment'])`: demolished/merged 등 위험 상태로의 잘못된 전환 차단
- `z.string().uuid().nullable()`: predecessor/successor는 선택적 연결, null 허용
- guard → Zod 순서: 인증 먼저, payload shape는 admin만 확인 가능

### 보안 흐름 (T-13-09, T-13-10 미티게이션)

1. `requireAdmin()` FIRST — 비인증·비admin 즉시 차단
2. `complexStatusSchema.safeParse(input)` — UUID 검증 + enum 검증
3. `createSupabaseAdminClient().from('complexes').update(...)` — RLS 우회 UPDATE
4. `revalidatePath` 3경로 — 즉시 캐시 무효화

### 기존 함수와의 분리 근거

| 함수 | 대상 테이블 | 목적 |
|------|------------|------|
| `upsertRedevelopmentProject` | `redevelopment_projects` | 재건축 단계(rumor~completed) 기록 |
| `setComplexRedevelopmentStatus` | `complexes` | status 플래그 + predecessor/successor 연결 |

두 함수는 독립적인 DB 테이블을 다루므로 분리 유지. 한 단지가 `in_redevelopment` 지정과 `committee_formed` 단계를 동시에 가질 수 있음.

### revalidatePath 3개 경로

| 경로 | 이유 |
|------|------|
| `/admin/redevelopment` | admin 관리 페이지 즉시 갱신 |
| `/presale` | Tier 2 섹션 표시 즉시 갱신 (CONTEXT.md D-3 결정) |
| `/complexes/${complexId}` | 단지 상세 페이지 status 배지 즉시 갱신 |

### 테스트 결과 (7개 GREEN)

| # | 테스트 | 결과 |
|---|--------|------|
| 1 | setComplexRedevelopmentStatus: 비로그인 → 로그인 에러 | PASS |
| 2 | setComplexRedevelopmentStatus: 일반 사용자 → 관리자 권한 에러 | PASS |
| 3 | setComplexRedevelopmentStatus: 비UUID complexId → 유효성 에러 | PASS |
| 4 | setComplexRedevelopmentStatus: 유효 입력 + null → update 호출 확인 | PASS |
| 5 | setComplexRedevelopmentStatus: predecessorId UUID → payload 포함 | PASS |
| 6 | setComplexRedevelopmentStatus: successorId UUID → payload 포함 | PASS |
| 7 | setComplexRedevelopmentStatus: 성공 → revalidatePath 3경로 호출 | PASS |

## Task 2 결과: /admin/redevelopment 페이지 단지 status 변경 카드 추가

### 페이지 레이아웃 (카드 2개 공존)

```
재건축 단계 관리 (h1)
├── [NEW] 단지 재건축 지정 카드
│   ├── 대상 단지 select (active + in_redevelopment 500개)
│   ├── 상태 변경 dropdown (in_redevelopment / active)
│   ├── 기존 단지 predecessor select (선택, null 허용)
│   ├── 신규 단지 successor select (선택, null 허용)
│   └── [상태 변경] btn-orange
├── [기존] 단계 입력 카드 (redevelopment_projects 기록)
└── [기존] 재건축 단지 목록 테이블
```

### allComplexes 쿼리

```typescript
const { data: activeComplexes } = await (adminClient as any)
  .from('complexes')
  .select('id, canonical_name, si, gu, status')
  .in('status', ['active', 'in_redevelopment'])
  .order('canonical_name')
  .limit(500)
```

- admin-only 페이지이므로 N+1 없음 (단일 쿼리, limit 500으로 안전)
- 서버 컴포넌트에서 createSupabaseAdminClient() 사용 (CLAUDE.md 준수)

## Commits

| 태스크 | 커밋 | 내용 |
|--------|------|------|
| Task 1 (TDD GREEN) | 8b45f51 | setComplexRedevelopmentStatus Server Action + 7개 test GREEN |
| Task 2 | 717ff41 | /admin/redevelopment 단지 status 변경 카드 추가 |

## Deviations from Plan

없음 — plan executed exactly as written.

## Known Stubs

없음 — Server Action + Admin UI 구현 완료. 실제 DB UPDATE 동작.

## Threat Flags

없음 — 신규 네트워크 엔드포인트 없음. Server Action은 기존 `requireAdmin` 패턴으로 보호됨.

## Self-Check: PASSED

- `src/lib/actions/redevelopment-actions.ts` — `setComplexRedevelopmentStatus` export 존재
- `src/lib/actions/redevelopment-actions.test.ts` — it.todo 0개, 7개 test GREEN
- `src/app/admin/redevelopment/page.tsx` — 단지 재건축 지정 카드 추가 + 기존 카드 보존
- 커밋 8b45f51, 717ff41 git log에서 확인
