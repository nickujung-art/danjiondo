/**
 * 청약홈 API (data.go.kr B552555) 응답 타입 정의
 * API 3: /getAPTLttotPblancList (분양정보 조회)
 * API 2: /getAPTRcritPblancList (청약경쟁률 조회)
 * 응답 필드명: camelCase (공공데이터포털 표준 — CONTEXT.md 확인)
 */
import { z } from 'zod/v4'

// ── API 3: 분양정보 조회 응답 스키마 ────────────────────────────

export const CheongyakItemSchema = z.object({
  pblancNo:             z.string(),                        // 공고번호 (upsert key)
  pblancNm:             z.string().optional(),             // 주택명
  subscrptAreaCodeNm:   z.string().optional(),             // 공급지역명 (예: "경상남도 창원시")
  hssplyAdres:          z.string().optional(),             // 공급위치 주소
  gnrlSuplyHshldco:     z.coerce.number().optional(),      // 일반공급 세대수
  rcptbgnde:            z.string().optional(),             // 청약접수시작일 (YYYYMMDD)
  rcptendde:            z.string().optional(),             // 청약접수종료일 (YYYYMMDD)
  przwnerPresnatnDe:    z.string().optional(),             // 당첨자발표일 (YYYYMMDD)
  mvnPrearngeMntdy:     z.string().optional(),             // 입주예정월 (YYYYMM)
  houseSecd:            z.string().optional(),             // 주택구분 (01=아파트)
  subscrptAreaCode:     z.string().optional(),             // 지역코드 (법정동코드 10자리 — 앞 5자리가 sgg_code)
})

export type CheongyakItem = z.infer<typeof CheongyakItemSchema>

// ── API 2: 청약경쟁률 조회 응답 스키마 ──────────────────────────

export const CompetitionRateItemSchema = z.object({
  pblancNo:               z.string(),                      // 공고번호 (join key)
  gnrlRnk1CrsplApplCnt:   z.coerce.number().optional(),    // 1순위 경쟁률
  houseTy:                z.string().optional(),           // 주택형 (예: "84A")
  suplyHshldco:           z.coerce.number().optional(),    // 공급세대수
  subscrptRankCode:       z.string().optional(),           // 청약순위코드
})

export type CompetitionRateItem = z.infer<typeof CompetitionRateItemSchema>

// ── new_listings 테이블 행 인터페이스 (Wave 1·2 contract) ────────

export interface NewListingCheongyakRow {
  name:                string        // 주택명 (표시용)
  region:              string        // 공급지역명 (표시용)
  pblanc_no:           string        // 공고번호 (upsert key)
  pblanc_nm:           string | null // 주택명
  sgg_code:            string | null // 법정동코드 5자리 (subscrptAreaCode 앞 5자리)
  supply_region:       string | null // 공급지역명
  supply_count:        number | null // 일반공급 세대수
  rcept_bgnde:         string | null // 청약접수시작일 (ISO YYYY-MM-DD)
  rcept_endde:         string | null // 청약접수종료일 (ISO YYYY-MM-DD)
  przwner_presnatn_de: string | null // 당첨자발표일 (ISO YYYY-MM-DD)
  mvn_prearnge_ym:     string | null // 입주예정월 (YYYYMM)
  hssply_adres:        string | null // 공급위치 주소
  is_active:           boolean       // 활성 여부 (마감 시 false)
  fetched_at:          string        // ISO 타임스탬프
}
