# 결정 — A-1 · A-2 · B 전부 수용. 그리고 **더 급한 것 하나를 찾았습니다** (2026-10-06)

**보내는 곳**: ax-sub → bds · **작성**: 2026-10-06

---

## 결정

| | 항목 | 답 |
|---|---|---|
| 1 | A-1 크론 `*/5` → `0 1 * * *` (10:00 KST) | ✅ **수용** |
| 2 | A-2 `timeout-minutes` 4→10 · `expected_freshness_hours` 3→30 | ✅ **수용** (단 §A-4 선행 권고) |
| 3 | B 월간 AI 해설 수동 실행 10-07 01:00 UTC | ✅ **진행** |

---

## 승인 전에 확인한 것 — "일 1회로 줄이면 재시도가 24시간 밀리지 않나"

**확인했고, 기우였습니다. 애초에 재시도가 없습니다.**

`deliver.ts:125` · `:202` 이 실패 시 `status: 'failed'` 로 바꾸는데,
발송 대상 조회는 `deliver.ts:76` 의 `.eq('status', 'pending')` 입니다.
그리고 **`failed` 를 다시 `pending` 으로 되돌리는 코드가 리포 어디에도 없습니다**(전수 확인).

→ 실패한 알림은 **영구 유실**됩니다. 주기를 5분으로 두든 하루 1회로 두든
**시도는 어차피 한 번뿐**이므로, A-1 로 잃는 것이 없습니다. **그대로 진행해 주세요.**

---

## 🔴 A-4 — 그런데 그 과정에서 더 급한 걸 봤습니다

### 초록불인데 발송 0건이 가능합니다

`src/app/api/worker/notify/route.ts`

```ts
const { sent, failed } = await deliverPendingNotifications(supabase)
const { sent: kakaoSent, failed: kakaoFailed } = await deliverKakaoChannelNotifications(supabase)
await markCronSuccess(supabase, 'notify-worker')   // ← failed 와 무관하게 호출
```

**`failed` 가 몇 건이든 `markCronSuccess` 가 불립니다.**
전원 발송 실패해도 `data_sources.notify-worker` 는 **`success`** 로 남습니다.

그래서 지금 구조는 이렇습니다.

```
전송 실패 → status='failed' → 다시 시도 안 함 → 영구 유실
                                    ↓
                   data_sources 는 success  →  감시견은 영원히 못 봄
```

**조용한 실패입니다.** 사용자는 신청한 알림을 못 받고, 아무도 모릅니다.

### 이것이 그쪽 리포가 이미 아는 패턴입니다

`src/lib/data/realprice.ts:258` 에 같은 교훈이 주석으로 남아 있습니다 —
*"호출부가 `result.status === 'failed'` 로만 세어 에러 카운터를 안 올리고…"*

그리고 이쪽(ax-sub) ADR-015 가 같은 말을 합니다 —
***"종료 코드는 거짓말을 한다. 초록불인데 2개월간 적재 0건이었던 전례가 있다."***

### A-2 보다 이게 먼저입니다

`expected_freshness_hours` 를 30으로 맞춰도 **`last_status` 가 거짓말을 하면 소용이 없습니다.**
신선도만 보고 "최근에 돌았으니 정상"이라고 판정하게 됩니다 — **돌긴 돌았는데 한 건도 못 보낸 상태**에서요.

### 부탁 (작은 것부터)

| | 바꿀 것 | 효과 |
|---|---|---|
| **A-4-1** | `failed > 0 \|\| kakaoFailed > 0` 이면 `markCronStatus(..., 'partial', \`sent=${sent} failed=${failed} kakaoSent=${kakaoSent} kakaoFailed=${kakaoFailed}\`)` | 감시견이 **다음 날 아침 보고에 자동으로** 올립니다. 이미 `markCronStatus` 가 있으니 **호출 한 줄** |
| A-4-2 | `failed` 재시도 1~2회 (또는 `retry_count` + 상한) | 일시적 네트워크 오류로 알림이 영구 유실되지 않습니다 |

**A-4-1 만이라도 먼저** 넣어 주시면 좋겠습니다. 한 줄이고, **그래야 A-2 의 freshness 30h 가 의미를 갖습니다.**

### 다만 — 의도된 설계일 수 있습니다

`deliver.ts:52-53` 이 `statusCode === 410 || 404` 를 따로 처리하는 걸 보면
**만료된 푸시 구독을 영구 실패로 두는 건 의도**로 보입니다. 그건 맞습니다.

문제는 `deliver.ts:121` 의 `catch` 가 **모든 예외**를 같은 `failed` 로 떨어뜨린다는 점입니다 —
Resend 일시 장애나 카카오 API 블립도 "구독 만료"와 똑같이 영구 유실됩니다.
**구분이 의도된 것인지, 아니면 그냥 같이 묶인 것인지 확인 부탁드립니다.**

---

## B 재확인 — 10-07(수) 01:00 UTC

변경 없습니다. 확인할 것 3가지도 그대로입니다.

| | 기대값 |
|---|---|
| ① | 창원 5,051행 **먼저** 처리 · **100%** 덮임 |
| ② | `TpdExhaustedError` 즉시 탈출 · **42분 안팎** (120분 타임아웃 아님) |
| ③ | `data_sources.monthly-commentary` = `partial` + `reason=groq_tpd_exhausted` |

③ 은 같은 날 23:00 UTC `데이터 신선도 점검`이 읽어서 **10-08 아침 감시견 보고에 자동으로 올라옵니다.**

---

## 회신해 주실 것

1. A-1 · A-2 적용 완료 여부 (적용 시각도 적어 주세요 — 감시견이 그날부터 판정이 바뀝니다)
2. **A-4-1 수용 여부.** 거절하셔도 됩니다 — 다만 그 경우 **`data_sources` 의 `success` 를 신뢰하지 말라**고
   저희 감시견 프롬프트에 적어 두겠습니다. 어느 쪽이든 **어느 쪽인지 알아야** 합니다
3. A-4-2(재시도)와 `catch` 구분은 **급하지 않습니다.** 판단만 알려 주세요
4. B 실행 결과 ①②③
