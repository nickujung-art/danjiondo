/**
 * 청약홈 API (api.odcloud.kr) 응답 타입 정의
 * 필드명: UPPER_SNAKE_CASE (odcloud.kr 표준)
 * 분양정보: ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail
 * 경쟁률:   ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet
 */
import { z } from 'zod/v4'

// ── 분양정보 응답 스키마 ─────────────────────────────────────────

export const CheongyakItemSchema = z.object({
  PBLANC_NO:              z.string(),                        // 공고번호 (upsert key)
  HOUSE_NM:               z.string().optional(),             // 주택명
  SUBSCRPT_AREA_CODE_NM:  z.string().optional(),             // 공급지역명 (예: "경남")
  HSSPLY_ADRES:           z.string().optional(),             // 공급위치 주소
  TOT_SUPLY_HSHLDCO:      z.coerce.number().optional(),      // 총 공급 세대수
  RCEPT_BGNDE:            z.string().optional(),             // 청약접수시작일 (YYYY-MM-DD)
  RCEPT_ENDDE:            z.string().optional(),             // 청약접수종료일 (YYYY-MM-DD)
  PRZWNER_PRESNATN_DE:    z.string().optional(),             // 당첨자발표일 (YYYY-MM-DD)
  MVN_PREARNGE_YM:        z.string().optional(),             // 입주예정월 (YYYYMM)
  HOUSE_SECD:             z.string().optional(),             // 주택구분 (01=아파트)
  SUBSCRPT_AREA_CODE:     z.string().optional(),             // 지역코드 (예: '621' = 경남)
})

export type CheongyakItem = z.infer<typeof CheongyakItemSchema>

// ── 잔여세대·무순위 응답 스키마 ──────────────────────────────────
// getRemndrLttotPblancDetail — 청약 접수 끝난 후 잔여/무순위 분양 공고

export const CheongyakRemndrItemSchema = z.object({
  PBLANC_NO:              z.string(),                        // 공고번호 (upsert key)
  HOUSE_NM:               z.string().optional(),             // 주택명
  SUBSCRPT_AREA_CODE_NM:  z.string().optional(),             // 공급지역명
  SUBSCRPT_AREA_CODE:     z.string().optional(),             // 지역코드
  HSSPLY_ADRES:           z.string().optional(),             // 공급위치 주소
  TOT_SUPLY_HSHLDCO:      z.coerce.number().optional(),      // 총 공급 세대수
  SUBSCRPT_RCEPT_BGNDE:   z.string().optional(),             // 청약접수시작일
  SUBSCRPT_RCEPT_ENDDE:   z.string().optional(),             // 청약접수종료일
  GNRL_RCEPT_BGNDE:       z.string().optional(),             // 일반청약시작일 (무순위 등)
  GNRL_RCEPT_ENDDE:       z.string().optional(),             // 일반청약종료일
  CNTRCT_CNCLS_BGNDE:     z.string().optional(),             // 계약시작일
  CNTRCT_CNCLS_ENDDE:     z.string().optional(),             // 계약종료일 (is_active 기준)
  PRZWNER_PRESNATN_DE:    z.string().optional(),             // 당첨자발표일
  MVN_PREARNGE_YM:        z.string().optional(),             // 입주예정월
  HOUSE_SECD_NM:          z.string().optional(),             // 주택구분명 (무순위/잔여세대 등)
})

export type CheongyakRemndrItem = z.infer<typeof CheongyakRemndrItemSchema>

// ── 경쟁률 응답 스키마 ───────────────────────────────────────────

export const CompetitionRateItemSchema = z.object({
  PBLANC_NO:              z.string(),                        // 공고번호 (join key)
  CMPET_RATE:             z.coerce.number().optional(),      // 경쟁률 (예: "5.27" → 5.27)
  HOUSE_TY:               z.string().optional(),             // 주택형 (예: "84A")
  SUPLY_HSHLDCO:          z.coerce.number().optional(),      // 공급세대수
  SUBSCRPT_RANK_CODE:     z.coerce.number().optional(),      // 청약순위코드 (1=1순위)
})

export type CompetitionRateItem = z.infer<typeof CompetitionRateItemSchema>

// ── new_listings 테이블 행 인터페이스 ────────────────────────────

export interface NewListingCheongyakRow {
  name:                string        // 주택명 (표시용)
  region:              string        // 공급지역명 (표시용)
  pblanc_no:           string        // 공고번호 (upsert key)
  pblanc_nm:           string | null // 주택명
  sgg_code:            string | null // 지역코드 (예: '621')
  supply_region:       string | null // 공급지역명
  supply_count:        number | null // 총 공급 세대수
  rcept_bgnde:         string | null // 청약접수시작일 (ISO YYYY-MM-DD)
  rcept_endde:         string | null // 청약접수종료일 (ISO YYYY-MM-DD)
  przwner_presnatn_de: string | null // 당첨자발표일 (ISO YYYY-MM-DD)
  mvn_prearnge_ym:     string | null // 입주예정월 (YYYYMM)
  hssply_adres:        string | null // 공급위치 주소
  is_active:           boolean       // 활성 여부 (마감 시 false)
  fetched_at:          string        // ISO 타임스탬프
}
