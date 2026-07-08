# Phase 34: 전국 DB 확장 2단계 — 인접 광역시(부산·울산) 지역 확장 기반 구축 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 34-db-2
**Areas discussed:** 대상 범위, Supabase Pro 전환 결정 타이밍, 네이버 매핑 크롤러 실행 방식, 중복 Golden Record 행 재발 방지

---

## 대상 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 부산 먼저, 울산은 후속 (권장) | 경남→부산→울산 순차, 단계별 리스크 검증 후 진행 | ✓ |
| 부산+울산 동시 진행 | 한 번의 phase로 둘 다 처리, 효율은 높지만 용량 리스크 조기 노출 | |

**User's choice:** 부산 먼저, 울산은 후속
**Notes:** 부산 단독으로도 경남 전체와 맞먹는 인구 규모라 동시 진행 시 리스크 진단이 어려워진다는 점이 결정적이었음.

---

## Supabase Pro 전환 결정 타이밍

| Option | Description | Selected |
|--------|-------------|----------|
| 착수 전 미리 Pro로 전환 (권장) | 420MB로 이미 84% 사용 중이라 재초과 가능성 높음 | |
| 이번도 백필 후 실측 기반으로 결정 | 33-08 패턴 반복 | ✓ |

**User's choice:** 이번도 백필 후 실측 기반으로 결정 (33-08 패턴 반복)

| Option | Description | Selected |
|--------|-------------|----------|
| 주기적 용량 체크 태스크를 plan에 명시 (권장) | 450MB 도달 시 경고, VACUUM FULL/Pro전환 중 결정 | ✓ |
| 별도 안전장치 없이 진행 | 문제 생기면 그때 대응 | |

**User's choice:** 주기적 용량 체크 태스크를 plan에 명시

---

## 네이버 매핑 크롤러 실행 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 포함 — BBOX 튜닝 + 실행까지 이번 phase에 | 경남과 동일한 완성도 | ✓ |
| 이번에도 defer | 확장 파이프라인만, 네이버는 다음으로 | |

**User's choice:** 포함 — BBOX 튜닝 + 실행까지 이번 phase에

| Option | Description | Selected |
|--------|-------------|----------|
| 구조적 해결 시도하지 않음 | 기존 restart-loop 운영으로 계속 진행 | |
| 이번 phase에서 근본 원인 재조사 | self-hosted runner 검토 등 | ✓ |

**User's choice:** 이번 phase에서 근본 원인 재조사

| Option | Description | Selected |
|--------|-------------|----------|
| 조사는 하되 실패 시 restart-loop로 폴백 (권장) | 이 문제 하나로 phase 진행이 막히지 않게 함 | ✓ |
| 해결될 때까지 네이버 매핑 작업 blocking | | |

**User's choice:** 조사는 하되 실패 시 restart-loop로 폴백

| Option | Description | Selected |
|--------|-------------|----------|
| 재사용 — 부산 BBOX 확정 후 동일한 진단 1회 실행 (권장) | 실제 매핑 실행 전에 문제 규모 파악 | ✓ |
| 생략 — 바로 실제 매핑만 진행 | | |

**User's choice:** 재사용 — 부산 BBOX 확정 후 동일한 진단 1회 실행

| Option | Description | Selected |
|--------|-------------|----------|
| 포함 — 작업 시작 전 쿠키 유효성 확인 태스크 추가 (권장) | | ✓ |
| 생략 — 문제 생기면 그때 대응 | | |

**User's choice:** 포함 — 작업 시작 전 쿠키 유효성 확인 태스크 추가

---

## 중복 Golden Record 행 재발 방지

| Option | Description | Selected |
|--------|-------------|----------|
| 정리 포함 — 111쌍 병합 + 부산 신규 중복 방지 로직 | | |
| 이번에도 defer — 부산도 일단 자연 매칭률로 진행, 병합은 별도 후속 phase | | ✓ |

**User's choice:** 이번에도 defer — 부산도 일단 자연 매칭률로 진행, 병합은 별도 후속 phase

| Option | Description | Selected |
|--------|-------------|----------|
| 탐지 로그만 추가 (권장) | 시딩 스크립트에 좌표-일치 감지 쿼리 추가, 병합은 안 함 | ✓ |
| 아무것도 하지 않음 | | |

**User's choice:** 탐지 로그만 추가

---

## Claude's Discretion

- 부산 16개 구·군의 정확한 법정동코드(sgg_code) 조사 방법 — RESEARCH.md에서 처리
- 하드코딩 지역 필터 재스윕의 정확한 범위 — Phase 33 sweep 방법론 재사용
- 학군 랭킹/`seo-hierarchy.ts`의 부산 대응 여부 확인 — RESEARCH.md 확인 후 판단

## Deferred Ideas

- 울산광역시 확장 — 부산 완료 후 별도 phase(35)로 진행 여부 결정
- 전국 확장(3단계) — 별도 phase
- 경남 기존 111쌍/303건 중복 Golden Record 행 병합 — 별도 후속 phase
- `naver-cafe.ts` 지역별 카페 소스 다중화 — 기존과 동일하게 defer
- 학군 랭킹/`seo-hierarchy.ts` 전국형 일반화 — 부산 케이스 확인 후 필요 시 별도 범위
