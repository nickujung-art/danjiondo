# 실거래이야기 — 디자인 시스템

> 버전 v0.1 · 2026년 7월 기준
> 제품 기획은 `02-realtrade-story.md` 참고. 이 문서는 디자인 원칙·토큰·컴포넌트 스펙만 다룸

---

## 1. 디자인 원칙

**"증권앱처럼 가볍게, 정보만 정직하게"**

- 참고 스타일: 신한 SOL증권 모바일 (완전 플랫, 굵은 숫자, 여백 넉넉, 액센트 컬러 1개)
- CLAUDE.md 기존 UI 금지 규칙 계승: `backdrop-blur`·`gradient-text`·glow 애니메이션·"Powered by AI" 배지·보라/인디고 브랜드색·gradient orb 전부 금지
- 애니메이션은 compositor 속성만(`transform`·`opacity`·`clip-path`), `width/height/top/margin` 등 layout 속성 애니메이션 금지 (기존 규칙 동일 적용)
- Semantic HTML 우선, 의미없는 div 스택 금지 (기존 규칙 동일 적용)
- 장식적 효과·파티클·과한 그라데이션 금지 (토스 그래픽 가이드 원칙에서 채택, CLAUDE.md 규칙과 일치)
- 그래픽/아이콘은 문맥 설명 목적으로만, 화면당 핵심 그래픽 1개 이하

---

## 2. 컬러 시스템

**OKLCH 색공간 기반** (토스 TDS 7년만의 컬러 개편 사례 참고 — `toss.tech/article/tds-color-system-update`). 이유:
- 밝기(lightness)만 조정해도 색상(hue)·채도가 안 틀어짐 → 지각적으로 균일한 스케일 생성 가능
- 라이트/다크 모드 전환 시에도 토큰 간 상대적 밝기 일관성 유지 쉬움
- 브랜드 블루와 하락표시 블루처럼 "같은 계열이지만 확실히 구별돼야 하는" 색을 hue/lightness 좌표로 명확히 분리 가능 (헥스값 직감 대신 구조적으로 해결)

### Base 토큰

```css
/* 브랜드 */
--blue-brand: oklch(62% 0.19 254);   /* 액센트 — 토스(#3182f6)보다 밝고 시원한 톤, 구별되는 브랜드 컬러 */

/* 등락 (한국 증권 컨벤션: 상승=빨강, 하락=파랑) */
--red-up:     oklch(58% 0.22 25);    /* 상승 */
--blue-down:  oklch(52% 0.16 240);   /* 하락 — brand blue와 다른 hue/lightness로 명확히 구별 */

/* 그레이스케일 (hue 0, chroma 0 — 명도만 단계별 변화) */
--grey-950: oklch(15% 0 0);   /* 텍스트 최상위 */
--grey-700: oklch(35% 0 0);   /* 본문 텍스트 */
--grey-500: oklch(55% 0 0);   /* 보조 텍스트 */
--grey-200: oklch(90% 0 0);   /* 보더/구분선 */
--grey-100: oklch(96% 0 0);   /* 서피스(카드 배경 등) */
--white:    oklch(100% 0 0);  /* 기본 배경 */
```

### Semantic 토큰

```css
--fill-brand:      var(--blue-brand);
--fill-surface:     var(--grey-100);
--text-primary:     var(--grey-950);
--text-secondary:   var(--grey-700);
--text-muted:       var(--grey-500);
--text-up:          var(--red-up);
--text-down:        var(--blue-down);
--border-default:   var(--grey-200);
--bg-page:           var(--white);
```

### Component 토큰 (예시, 구현 단계에서 확장)

```css
--button-primary-bg:   var(--fill-brand);
--badge-up-bg:          oklch(from var(--red-up) l c h / 0.12);   /* 알약뱃지 배경 — 저채도 톤 */
--badge-down-bg:        oklch(from var(--blue-down) l c h / 0.12);
```

**등락 표시 접근성 규칙**: 색상만으로 상승/하락을 구분하지 않는다. 항상 **▲/▼ 삼각형 글리프를 색상과 함께 병기** (토스 UX 가이드·업계 관행 — 색맹 사용자 고려, 색상만 쓰는 건 접근성 위반이 아니라 그냥 안 좋은 관행).

---

## 3. 타이포그래피

- **폰트**: [Pretendard](https://github.com/orioncactus/pretendard) — SIL OFL 1.1 라이선스, 상업적 이용 무료. 2026년 기준 한국 웹/핀테크 앱 사실상 표준(v1.3.9, 활발히 유지보수됨)
- **숫자**: Bold~Black weight, `font-variant-numeric: tabular-nums` 필수 (리스트에서 자릿수 정렬 안 흔들리게)
- **본문**: Regular/Medium 위주, 헤딩만 Bold
- **크기 스케일**: 구현 단계에서 Tailwind 기본 스케일 그대로 사용 (신규 스케일 정의 불필요)

---

## 4. 컴포넌트 스타일 (SOL증권 벤치마킹)

| 컴포넌트 | 스타일 |
|---|---|
| **카드형 리스트 아이템** | 좌측 아이콘/로고 + 이름, 우측 큰 숫자 + 등락 알약뱃지. 그림자 없음, `border-default` 1px로만 구분 |
| **알약뱃지** | `rounded-full`, 등락색 배경(12% 불투명도) + 등락색 텍스트 + ▲▼ 아이콘 |
| **세그먼트 토글** | 활성 탭은 `fill-brand` 채움, 비활성은 텍스트만 |
| **카드 컨테이너** | `rounded-xl`, 그림자 없음, `fill-surface` 배경 또는 흰 배경+보더 |
| **일일 브리핑 카드** | 홈 상단 고정, 카드 컨테이너 스타일 + 숫자 강조 |

---

## 5. UX 라이팅 원칙 (토스 UX 가이드 방법론 채택 — 자산 아닌 원칙만)

- **해요체 통일** — 모든 문구에 예외 없이 적용
- **능동태** — "됐어요"보다 "했어요", 수동형 지양
- **긍정형 문장** — "없어요" 대신 "~하면 할 수 있어요"
- **캐주얼한 경어** — "~시겠어요?", "~께" 같은 과도한 경어 지양, "~시" 빼기
- **명사 나열 지양** — 한자어 명사를 동사로 풀어쓰기

---

## 6. 다크패턴 방지 원칙 (토스 UX 가이드 방법론 채택)

우리 서비스(특히 광고 배치 재설계 시) 준수 원칙:

1. 진입 즉시 광고성 바텀시트 금지
2. 뒤로가기 시 알림동의 유도 바텀시트로 막지 않기
3. 항상 "닫기/나가기" 선택지 제공 — 거부 불가능한 CTA 설계 금지
4. 예상 못한 순간 전면광고 노출 금지
5. CTA 버튼 문구는 클릭 후 행동을 명확히 예측 가능하게 (모호한 반복 문구 금지)

---

## 7. 반응형 기준

- **일반 반응형 웹** 원칙 적용 — 토스 미니앱(웹뷰) 전용 "고정 논리해상도 360×640" 방식은 채택하지 않음 (우리는 일반 브라우저에서 다양한 뷰포트 대응 필요)
- 기존 danjiondo 프로젝트의 반응형 브레이크포인트 관례 재사용 (Tailwind 기본 breakpoint)

---

## 8. 참고 자료 출처

- 신한 SOL증권 모바일: https://open.shinhansec.com/mobilealpha/html/FP/easyGuide.html
- 토스 컬러 시스템 개편: https://toss.tech/article/tds-color-system-update
- 토스 UX 가이드(원칙만 채택, 자산은 라이선스상 사용 불가): 앱인토스 개발자 문서
- Pretendard: https://github.com/orioncactus/pretendard

---

## 9. 미정 항목

- [ ] 다크모드 지원 여부 (OKLCH 기반이라 추후 확장은 어렵지 않음, MVP 범위 포함 여부만 결정 필요)
- [ ] 실제 구현 시 OKLCH 값 브라우저 렌더링 확인 (구형 브라우저 fallback 필요 여부 — 대부분 모던 브라우저는 네이티브 지원)
- [ ] 컴포넌트 토큰 확장 (버튼 variant, 인풋, 토스트 등 구현 단계에서 채워짐)

---

*문서: `.planning/vision/03-realtrade-story-design-system.md`*
*작성: 2026-07-14 메인 세션 논의 기반*
