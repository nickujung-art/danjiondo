---
phase: 16-ad-platform
plan: "02"
subsystem: ads
tags: [server-action, resend, email, form, public-page, tdd]
dependency_graph:
  requires: []
  provides: [ads-inquiry-flow, /ads-page]
  affects: [src/lib/auth, src/components/ads, src/app/ads]
tech_stack:
  added: []
  patterns: [server-action, zod-v4-validation, resend-email, client-form]
key_files:
  created:
    - src/lib/auth/ad-inquiry-action.ts
    - src/components/ads/AdInquiryForm.tsx
    - src/app/ads/page.tsx
    - src/__tests__/ad-inquiry-action.test.ts
  modified: []
decisions:
  - "zod v4 uses `issues` not `errors` for validation errors — fixed inline (Rule 1 bug)"
  - "submitAdInquiry takes single FormData arg (not two-arg useActionState pattern) — matches TDD test spec"
  - "RESEND_API_KEY/OPERATOR_EMAIL missing → explicit error (not silent success) — matches plan test spec"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-26"
  tasks_completed: 3
  files_created: 4
---

# Phase 16 Plan 02: 광고 문의 페이지 + Resend 이메일 액션 Summary

광고주 문의 Server Action (zod v4 검증 + Resend 이메일) + 클라이언트 폼 컴포넌트 + `/ads` 공개 페이지 신설.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TDD RED — submitAdInquiry 테스트 스캐폴드 | f07fb7d | src/__tests__/ad-inquiry-action.test.ts |
| 2 | Server Action + AdInquiryForm 구현 (GREEN) | e6c88e8 | src/lib/auth/ad-inquiry-action.ts, src/components/ads/AdInquiryForm.tsx |
| 3 | /ads 페이지 + 빌드 검증 | 056cefb | src/app/ads/page.tsx |

## Test Results

```
src/__tests__/ad-inquiry-action.test.ts — 5 passed

- 업체명 누락 → error 반환              PASS
- 연락처 없음 → error 반환              PASS
- OPERATOR_EMAIL 미설정 → 설정 오류 반환 PASS
- RESEND_API_KEY 미설정 → 설정 오류 반환 PASS
- 유효한 입력 + 환경변수 → resend.send 호출 + { error: null }  PASS
```

## TypeScript Check

`npx tsc --noEmit` — 출력 없음 (0 errors)

## Build Result

`npm run build` — 성공

```
○ /ads  1.83 kB  179 kB  (Static)
```

## Environment Variables Required

| Variable | Purpose | Status |
|----------|---------|--------|
| `RESEND_API_KEY` | Resend 발송 키 | 기존 설정 (프로젝트에서 이미 사용) |
| `OPERATOR_EMAIL` | 운영자 수신 이메일 | 신규 필요 — Vercel 환경변수에 추가 필요 |
| `RESEND_FROM_EMAIL` | 발신 주소 | 기존 설정 (기본값: danjiondo <onboarding@resend.dev>) |

**주의:** `OPERATOR_EMAIL`이 설정되지 않으면 광고 문의 제출 시 에러 메시지가 표시됩니다. Vercel 대시보드에서 추가 필요.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] zod v4 `errors` → `issues` 속성명 변경**
- **Found during:** Task 2 GREEN 실행 중 테스트 실패
- **Issue:** zod v4에서 validation 오류 배열이 `.errors` 아닌 `.issues` 속성에 있음. `parsed.error.errors[0]` → `TypeError: Cannot read properties of undefined`
- **Fix:** `parsed.error.issues[0]?.message`로 변경
- **Files modified:** src/lib/auth/ad-inquiry-action.ts
- **Commit:** e6c88e8

## Known Stubs

None — 문의 폼은 실제 Resend API를 호출하고, 환경변수 미설정 시 에러를 반환함. 가격은 "문의 후 안내" 방식으로 의도적으로 숨김.

## TDD Gate Compliance

- RED commit: f07fb7d (test(16-02): submitAdInquiry 단위 테스트 스캐폴드 (RED))
- GREEN commit: e6c88e8 (feat(16-02): submitAdInquiry Server Action + AdInquiryForm 구현 (GREEN))
- REFACTOR: 불필요 (구현이 충분히 명확함)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/app/ads/page.tsx | FOUND |
| src/lib/auth/ad-inquiry-action.ts | FOUND |
| src/components/ads/AdInquiryForm.tsx | FOUND |
| src/__tests__/ad-inquiry-action.test.ts | FOUND |
| Commit f07fb7d (RED test) | FOUND |
| Commit e6c88e8 (GREEN impl) | FOUND |
| Commit 056cefb (ads page) | FOUND |
