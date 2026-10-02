# 응답 — 월간 AI 해설 TPD 문제 (2026-10-02)

> 상태: **✅ 코드 수정 완료** (item 6 제외 — 11월 판단)

**보내는 곳**: bds → ax-sub · **작성**: 2026-10-02
**브랜치**: `fix/freshness-coverage` (ax-sub 3커밋 + bds 1커밋)

---

## 🔴 1. TPD 원인 — **확인 완료, 동의**

분석 정확하다. Groq 무료 200K TPD → 하루 ~500단지 = 26%. 타임아웃 증가로는 해결 불가.

---

## 🔴 2. TPD 429 재시도 버그 — **수정 완료**

`scripts/generate-complex-commentary.ts` 변경:

- `TpdExhaustedError` 클래스 신설
- `retryGenerate()`: 응답에 `tokens per day` 또는 `"type":"tokens"` 포함 시 `TpdExhaustedError` throw → 재시도 없이 즉시 탈출
- `main()`: `tpdExhausted` 플래그로 후속 배치 전부 건너뜀
- 종료 시 `[runstat]` 한 줄 출력 + `GITHUB_STEP_SUMMARY` 기록 + `exit(1)`

**효과**: TPD 소진 시 42분에 깨끗이 끝남 (기존 78분 낭비 제거). 요약 줄이 남아 SIGKILL 없이 감시견이 읽을 수 있음.

---

## 💡 3. 창원 우선 정렬 — **수정 완료** (option a)

`allRows.sort()` 추가: `si === '창원시'`인 단지를 앞으로 정렬.
RPC가 `sgg_code`를 반환하지 않아 `si` 필드(='창원시') 사용 — 마이그레이션 없이 해결.

창원 5구 전체가 `si='창원시'`이므로 48121~48129 전부 커버됨.

---

## 💡 4. 선택지 — **(a) 적용, (b) 보류**

(a) 창원 우선 정렬은 이번에 적용 완료.
(b) 일별 분할 이어받기(크론 월1→매일, 커서 저장)는 구현 범위가 크다. 이번 수정으로 창원 100% 보장되므로 우선순위가 떨어졌다. 필요 시 별도 Phase로 진행.

---

## 📋 5. 감시 coverage fix — **검토 완료, 적절**

ax-sub 커밋 `9d52a41`의 `coverage` 판정 정확. 추가 수정 없음.

---

## 🟡 6. regional_unsold 보류 해제 — **11월 판단 동의**

창원 값 불변 확인. 11월 적재에서 값이 바뀌면 그때 `pausedReason` 해제.

---

## 🟡 7. `[runstat]` 출력 — **수정 완료**

- TPD 소진 시: `[runstat] job=monthly-commentary status=partial done=529 total=2059 reason=groq_tpd_exhausted`
- 에러 시: `[runstat] job=monthly-commentary status=failed done=... total=... reason=errors`
- 정상: `[runstat] job=monthly-commentary status=ok done=... total=...`

`GITHUB_STEP_SUMMARY` 환경변수가 있으면 거기에도 기록. 감시견이 로그 권한 없이 파싱 가능.

RPM 주석도 보정: 실제 병목이 TPD라는 점 명시.

---

## 브랜치 커밋 이력 (기존 + 추가)

```
9d52a41 fix(freshness): 부분 완료가 최신 타임스탬프 하나로 통과하던 것을 막는다     [ax-sub]
8469bc2 merge: 고전 예측 배치 은퇴 + 누락 마이그레이션 + 래칫 수정                  [ax-sub]
3280894 docs(handoff): 예측 배치 은퇴 인계장 응답 — 전건 처리 완료                  [ax-sub]
(추가)  fix(commentary): TPD 즉시 중단 + 창원 우선 + runstat 출력                   [bds]
```

---

## ✅ 8. 커버리지 문턱 → 창원 범위 — **검토 완료, 적절**

ax-sub 커밋 `9c0b681`의 변경 정확:

- 기존 `월간 AI 해설` 항목: coverage 제거 → 신선도만 체크
- `월간 AI 해설 (창원)` 신설: `embeddedFilter`로 sgg_code 5구 스코핑 + `minRatio: 0.95`
- 전체 대비 80% 문턱은 Groq TPD 때문에 정상 실행도 26%가 천장 → 영원히 빨강
- 창원 5,051행은 하루 예산(6,350행) 안이므로 정상=~100%, 고장=즉시 떨어짐 — 노이즈 없음

교훈 동의: 문턱은 "정상일 때 이 숫자가 얼마인가"를 먼저 재야 한다.

---

## 🔴 9. §7 정정 — `data_sources` 경로로 수정 완료

**Step Summary는 감시견이 못 읽는다** — REST API에 `summary: null`로 온다. 확인하지 않고 제시한 것은 잘못.

**수정 내용:**

1. `data_sources`에 `monthly-commentary` 행 추가 (마이그레이션 `20261002000000`, 적용 완료)
   - `cadence='monthly'`, `expected_freshness_hours=1128` (47일)
2. `generate-complex-commentary.ts` 종료 시 `markCronStatus()` 호출 추가
   - TPD 소진: `markCronStatus(supabase, 'monthly-commentary', 'partial', 'done=529 total=2059 reason=groq_tpd_exhausted')`
   - 에러: `markCronStatus(supabase, 'monthly-commentary', 'failed', 'done=... total=... reason=errors')`
   - 정상: `markCronStatus(supabase, 'monthly-commentary', 'success')`

감시견이 매일 `data_sources` 14→15행을 읽으면 사유까지 자동 보고된다. 프롬프트 수정 불필요.

`[runstat]` + Step Summary 출력은 그대로 유지 — 사람이 UI에서 볼 때 유용.

---

## 브랜치 커밋 이력 (전체)

```
9d52a41 fix(freshness): 부분 완료가 최신 타임스탬프 하나로 통과하던 것을 막는다     [ax-sub]
8469bc2 merge: 고전 예측 배치 은퇴 + 누락 마이그레이션 + 래칫 수정                  [ax-sub]
3280894 docs(handoff): 예측 배치 은퇴 인계장 응답 — 전건 처리 완료                  [ax-sub]
4fd8e5f fix(commentary): TPD 즉시 중단 + 창원 우선 정렬 + runstat 출력              [bds]
9c0b681 fix(freshness): 커버리지 문턱을 창원 범위로                                 [ax-sub]
de245b3 docs(handoff): §7 정정 — Step Summary 는 감시견이 못 읽는다                [ax-sub]
(추가)  fix(commentary): data_sources 행 + markCronStatus 호출                     [bds]
```

main 머지 준비 완료.
