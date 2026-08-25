import { describe, it, expect } from 'vitest'
import { normalizeKaptAddr } from './kapt-address'

/**
 * 실측 응답(2026-08-25)을 그대로 케이스로 박는다. K-apt 는 kaptAddr 에
 * **단지명을 붙이고 창원 시군구에서 '시' 를 빠뜨린다.** 그대로 쓰면 표기가 섞여,
 * 이 값을 문자열로 읽어 동·시군구를 판정하는 감사 도구(audit-wholesale-mislink 등)가 어긋난다.
 */
describe('normalizeKaptAddr', () => {
  it('창원 시군구의 누락된 "시" 를 복원하고 단지명을 뗀다', () => {
    const r = normalizeKaptAddr(
      '경상남도 창원의창구 명서동 27 창원두산위브아파트', '창원두산위브아파트', '48121',
    )
    expect(r.ok).toBe(true)
    expect(r.address).toBe('경남 창원시 의창구 명서동 27')
    expect(r.dong).toBe('명서동')
  })

  it('마산합포구도 같은 기형을 갖는다', () => {
    const r = normalizeKaptAddr(
      '경상남도 창원마산합포구 월영동 48 씨티해오름', '씨티해오름', '48125',
    )
    expect(r.address).toBe('경남 창원시 마산합포구 월영동 48')
  })

  it('김해시는 시군구가 정상이라 접두만 경남으로 통일된다', () => {
    const r = normalizeKaptAddr(
      '경상남도 김해시 율하동 1370 율하2차e편한세상', '율하2차e편한세상', '48250',
    )
    expect(r.address).toBe('경남 김해시 율하동 1370')
  })

  it('🔴 이름에 공백이 있어도 통째로 떼어낸다 — 한 토큰씩 떼면 앞부분이 남는다', () => {
    const r = normalizeKaptAddr(
      '경상남도 김해시 봉황동 886 e편한세상 봉황역아파트', 'e편한세상 봉황역아파트', '48250',
    )
    expect(r.ok).toBe(true)
    expect(r.address).toBe('경남 김해시 봉황동 886')
    expect(r.address).not.toContain('e편한세상')
  })

  it('읍+리가 겹쳐도 첫 토큰부터 잡아 온전히 남긴다', () => {
    const r = normalizeKaptAddr(
      '경상남도 김해시 진영읍 여래리 233-8 진영아파트', '진영아파트', '48250',
    )
    expect(r.address).toBe('경남 김해시 진영읍 여래리 233-8')
    expect(r.dong).toBe('진영읍')
  })

  it('부산 "○○동4가" 같은 표기도 동으로 인식한다', () => {
    const r = normalizeKaptAddr(
      '부산광역시 중구 부평동4가 20-11 다사랑빌', '다사랑빌', '26110',
    )
    expect(r.address).toBe('부산 중구 부평동4가 20-11')
  })

  it('단지명이 안 붙어 있어도 정상 처리한다', () => {
    const r = normalizeKaptAddr('경상남도 김해시 삼계동 301', '김해삼계명지세인트빌아파트', '48250')
    expect(r.address).toBe('경남 김해시 삼계동 301')
  })

  it('🔴 부번 없는 지번의 끝 하이픈을 떼어낸다 — K-apt 표기 버릇', () => {
    const r = normalizeKaptAddr('경상남도 김해시 삼계동 1564- 쌍용더플래티넘삼계', '쌍용더플래티넘삼계', '48250')
    expect(r.ok).toBe(true)
    expect(r.address).toBe('경남 김해시 삼계동 1564')
  })

  it('부번이 있으면 그대로 둔다', () => {
    const r = normalizeKaptAddr('경상남도 김해시 신문동 530-2 장유쌍용예가1차아파트', '장유쌍용예가1차아파트', '48250')
    expect(r.address).toBe('경남 김해시 신문동 530-2')
  })

  it('🔴 지번으로 끝나지 않으면 실패로 돌려준다 — 이상한 주소를 조용히 쓰지 않는다', () => {
    const r = normalizeKaptAddr('경상남도 김해시 율하동 율하마을', '알수없는이름', '48250')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/지번으로 끝나지 않는다/)
  })

  it('동을 못 찾으면 실패로 돌려준다', () => {
    const r = normalizeKaptAddr('경상남도 김해시 12-3', '이름', '48250')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/동을 못 찾았다/)
  })

  it('접두가 정의되지 않은 시군구는 실패로 돌려준다 — 권역 밖을 조용히 처리하지 않는다', () => {
    const r = normalizeKaptAddr('경상남도 진주시 하대동 111 도운아파트', '도운아파트', '48170')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/시군구 접두 미정의/)
  })
})
