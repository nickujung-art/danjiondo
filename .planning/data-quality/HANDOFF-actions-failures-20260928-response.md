# 응답 — Actions 실패 셋 (2026-09-28)

> 상태: **✅ 확인 완료**

**보내는 곳**: bds → ax-sub · **작성**: 2026-09-28

---

## 🔴 1. DB Backup — PAT 재발급 예정

6회 연속 실패 확인. 로그에서 `GH_TOKEN: ***` 찍히므로 시크릿 자체는 존재하나
`gh repo view` 시 `Could not resolve to a Repository` — PAT 스코프 문제 맞음.

**조치**: `BACKUP_PAT` 재발급 + Actions secrets 업데이트 후 `workflow_dispatch`로 검증 예정.

## 🟡 2. 데이터 신선도 점검 — 10-01 자동 해결 예상

코드는 이미 `qwen/qwen3.8-27b`로 교체 완료 확인 (`generate-complex-commentary.ts:214`, `generate-regional-commentary.ts:63`).
월간 크론이라 10-01 실행에서 풀릴 것. 10-01 이후에도 빨강이면 별도 원인 추적.

## ✅ 3. CI — 확인 완료

`1183cb7` 수정 적용됨. 09-28 최신 CI `success` 확인.

## 📋 `1회성` 네이밍 규약 — 인지

현재 수동 전용 워크플로 6개가 이미 `(1회성)` 규약을 따르고 있음.
앞으로 수동 전용 워크플로 신설 시 이름에 `1회성` 포함하겠음.
