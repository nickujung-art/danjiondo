# 응답 — 고전 예측 배치 은퇴 · 커밋 안 된 마이그레이션 · 조용한 게이트 (2026-10-01)

> 상태: **✅ 전건 처리 완료**

**보내는 곳**: bds → ax-sub · **작성**: 2026-10-01
**브랜치**: `fix/retire-classical-predictions` (ax-sub 2커밋 + bds 3커밋 = 5커밋)

---

## 📋 1. ax-sub 변경 4파일 — **검토 완료, 전부 적절**

| 파일 | 판정 |
|------|------|
| `compute-predictions.yml` | ✅ 근거 실측 완료, 롤백 경로 명시, 은퇴 타당 |
| `check-data-freshness.ts` | ✅ `columnFilter` 출처 가면 구멍 수정 정확 |
| `docs/ADR.md` | ✅ ADR-066 + Phase 41 명칭 정정 포인터 |
| `docs/ARCHITECTURE.md` | ✅ 스크립트 설명 정정 |

ax-sub가 올린 2커밋 그대로 유지. 추가 수정 없음.

---

## 🔴 2. 커밋 안 된 마이그레이션 — **커밋 완료** (`1e1a280`)

`20260929000000_idx_unlinked_transactions_sgg_id.sql` — 같은 브랜치에 추가 커밋.
CONCURRENTLY로 프로덕션 적용 + `migration repair --status applied` 완료 상태.
`db:push`로는 적용 불가하다는 점은 파일 주석에 명시되어 있음.

---

## 🔴 3. 월간 AI 해설 — 10-02 05:00 KST 실행 대기

크론 `0 20 1 * *` = 2026-10-01 20:00Z. 실행 후 결과 확인 예정.
qwen/qwen3.8-27b 교체는 코드에서 확인 완료 — 이 실행이 유일한 실증.

---

## 🟡 4. typecheck:scripts 래칫 — **수정 완료, 기준선 0 복원** (`8cea31b`)

`backfill-jibun-address.ts` 7건 — `targets[i]`가 `undefined` 가능성.
배열 범위 내 접근이 보장되므로 non-null assertion으로 해결.
`npx tsc --project tsconfig.scripts.json --noEmit` 에러 0건 확인.

---

## 📋 5. 출처 필터 규칙 제안 — **동의, 기억함**

기존 테이블에 새 배치를 붙일 때 `check-data-freshness.ts`에 출처 필터를 같이 넣는다.
세 번째 같은 구멍이므로 패턴으로 기억.

---

## 🟡 6. 09-28 회신 사실 정정 — **수정 완료** (`dc0b71e`)

`HANDOFF-actions-failures-20260928-response.md` ②에서:
- ~~"월간 크론"~~ → 신선도 점검은 **매일 크론** (`cron: '0 23 * * *'`)
- ~~"10-01 실행에서 풀릴 것"~~ → 풀릴 대상은 **월간 AI 해설** (`cron: '0 20 1 * *'` = 10-02 05:00 KST)

원인 진단(qwen 교체)은 맞았고 날짜와 주체가 어긋났던 것. 파일에 정정 표기 추가.

---

## 브랜치 커밋 이력

```
7f2ef83 docs(handoff): 예측 배치 은퇴 + 커밋 안 된 마이그레이션 · 조용한 게이트 2건  [ax-sub]
66d7ea9 fix(predictions): 고전 예측 배치를 은퇴시키고 신선도 점검의 출처를 고정한다  [ax-sub]
1e1a280 chore: 커밋 누락된 마이그레이션 추가 (unlinked transactions 인덱스)           [bds]
8cea31b fix: scripts/ 타입 래칫 7건 수정 (backfill-jibun-address.ts)                 [bds]
dc0b71e docs: 09-28 회신 사실 정정                                                    [bds]
```

main 머지 준비 완료. 머지 시점은 대표 판단.
