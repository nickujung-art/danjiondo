/**
 * LH(한국토지주택공사) 공급정보 API 응답 타입
 * https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1
 * 환경변수: LH_API_KEY (data.go.kr B552555 전용 키 — MOLIT_API_KEY와 별도 신청)
 */
import { z } from 'zod/v4'
import type { NewListingCheongyakRow } from '../cheongyak/types'

// ── 공고 목록 응답 ────────────────────────────────────────────────

export const LhNoticeItemSchema = z.object({
  PAN_ID:          z.string(),                      // 공고ID (upsert key)
  CCR_CNNT_SYS_DS_CD: z.string().optional(),        // 시스템 구분코드
  SPL_INF_TP_CD:   z.string().optional(),           // 공급유형코드 (060=분양, 061=임대 등)
  PAN_NM:          z.string().optional(),           // 공고명
  PAN_DT:          z.string().optional(),           // 공고일 (YYYY-MM-DD or YYYYMMDD)
  CNP_CD_NM:       z.string().optional(),           // 지역명
  AIS_TP_CD_NM:    z.string().optional(),           // 주택유형명
  CLSG_DT:         z.string().optional(),           // 마감일
  DTL_URL:         z.string().optional(),           // 상세 URL
})

export type LhNoticeItem = z.infer<typeof LhNoticeItemSchema>

// ── 공고 상세 응답 (세대수/입주예정월) ────────────────────────────

export const LhDetailSubdSchema = z.object({
  LCC_NT_NM:    z.string().optional(),              // 단지명
  HSH_CNT:      z.coerce.number().optional(),       // 세대수
  DDO_AR:       z.string().optional(),              // 면적범위
  MVIN_XPC_YM:  z.string().optional(),              // 입주예정월 (YYYYMM)
})

export type LhDetailSubd = z.infer<typeof LhDetailSubdSchema>

// ── new_listings 행으로 재사용 ────────────────────────────────────
export type { NewListingCheongyakRow as NewListingRow }
