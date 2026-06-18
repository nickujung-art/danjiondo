// NEIS 학원 추천 시스템 타입 계약
// CLAUDE.md: 외부 API 타입은 src/services/ 어댑터에 정의

export type AgeGroup = '유아' | '유치' | '초등저' | '초등고' | '중등' | '고등'
export type SubjectCategory =
  | 'exam_prep'      // 입시
  | 'korean'         // 국어
  | 'math'           // 수학
  | 'english'        // 영어
  | 'arts'           // 미술·예체능
  | 'sports'         // 스포츠·운동
  | 'other_language' // 기타 외국어
export type TeachingStyle = 'exam_prep' | 'enrichment' | 'tutoring'
export type FeeTier = 'premium' | 'standard' | 'budget'

export interface HagwonResult {
  id:               string
  name:             string
  address:          string | null
  distance_m:       number
  realm_sc_nm:      string | null
  le_crse_nm:       string | null
  fee_tier:         FeeTier | null
  popularity_score: number | null
  age_groups:       AgeGroup[]
  subject_category: SubjectCategory | null
  score:            number
}

export interface RecommendInput {
  lat:           number
  lng:           number
  ageGroup?:     AgeGroup
  subjects?:     SubjectCategory[]
  feeTierPref?:  FeeTier[]
  schoolLat?:    number
  schoolLng?:    number
  schoolName?:   string
  schoolAddress?: string
}

export interface ChildProfile {
  id:            string
  user_id:       string
  nickname:      string
  age_group:     AgeGroup
  subject_prefs: string[]
  fee_tier_pref: FeeTier[] | null
  created_at:    string
  updated_at:    string
}

// UI에서 학교 선택용 (SchoolItem에서 파생)
export interface SchoolOption {
  name:         string
  school_type:  'elementary' | 'middle' | 'high'
  road_address: string | null
  distance_m:   number | null
}

export const SUBJECT_LABELS: Record<SubjectCategory, string> = {
  exam_prep:      '입시',
  korean:         '국어',
  math:           '수학',
  english:        '영어',
  arts:           '미술·예체능',
  sports:         '스포츠·운동',
  other_language: '기타 외국어',
}

export const FEE_LABELS: Record<FeeTier, string> = {
  premium:  '프리미엄',
  standard: '보통',
  budget:   '합리적',
}
