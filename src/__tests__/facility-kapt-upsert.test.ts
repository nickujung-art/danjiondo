/**
 * facility_kapt upsert 회귀 테스트 (2026-07-31)
 *
 * [왜 있는가]
 * 일배치의 K-apt 수집이 `onConflict: 'complex_id'` 로 upsert 하고 있었는데, 실제 제약은
 * `UNIQUE (complex_id, data_month)` 였다. ON CONFLICT 추론에 실패하면 Postgres 는
 * "there is no unique or exclusion constraint matching the ON CONFLICT specification" 를
 * 던지므로 **100% 실패**한다. 2026-07-30 프로덕션 로그에 이 에러가 50건 찍혔는데,
 * 그날 배치의 `.limit(50)` 대상 수와 정확히 일치했다.
 *
 * 그런데도 오래 묻혔다 — facility_kapt 최종 적재가 2026-07-06 에 멈춰 있었고
 * `data_sources.kapt.last_status` 는 null 이라 실패 기록조차 없었다.
 *
 * [무엇을 지키는가]
 * onConflict 문자열이 실제 UNIQUE 제약과 어긋나면 즉시 빨간불이 되게 한다.
 * 마이그레이션이 제약을 바꿨는데 앱 코드가 그대로 남는 상황이 이 저장소에서 반복됐다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SKEY, admin } from './helpers/db'

/** 일배치(src/app/api/cron/daily/route.ts)가 쓰는 값과 반드시 같아야 한다 */
const ON_CONFLICT = 'complex_id,data_month'

describe.skipIf(!SKEY)('facility_kapt upsert', () => {
  let complexId: string

  beforeAll(async () => {
    if (!SKEY) return
    const { data, error } = await admin
      .from('complexes')
      .insert({
        canonical_name:  '테스트K압트단지',
        name_normalized: '테스트K압트단지',
        sgg_code:        '48121',
        road_address:    '경상남도 창원시 의창구 케이압트로 1',
        status:          'active' as const,
      })
      .select('id')
      .single()
    if (error) throw new Error(`complex insert 실패: ${error.message}`)
    complexId = (data as { id: string }).id
  })

  afterAll(async () => {
    if (!SKEY) return
    if (complexId) {
      await admin.from('facility_kapt').delete().eq('complex_id', complexId)
      await admin.from('complexes').delete().eq('id', complexId)
    }
  })

  it('onConflict 가 실제 UNIQUE 제약과 일치한다 — 어긋나면 upsert 가 통째로 실패한다', async () => {
    const row = {
      complex_id:      complexId,
      kapt_code:       'A00000001',
      heat_type:       '지역난방',
      management_type: '위탁관리',
      total_area:      12345.6,
      data_month:      '2026-07-01',
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = admin.from('facility_kapt') as any
    const { error } = await table.upsert(row, { onConflict: ON_CONFLICT })
    expect(error).toBeNull()
  })

  it('같은 달 재수집은 덮어쓴다 — 행이 늘지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = admin.from('facility_kapt') as any
    const base = {
      complex_id: complexId, kapt_code: 'A00000001',
      management_type: '위탁관리', data_month: '2026-07-01',
    }
    await table.upsert({ ...base, total_area: 100 }, { onConflict: ON_CONFLICT })
    await table.upsert({ ...base, total_area: 200 }, { onConflict: ON_CONFLICT })

    const { data } = await admin
      .from('facility_kapt')
      .select('total_area')
      .eq('complex_id', complexId)
      .eq('data_month', '2026-07-01')
    expect(data).toHaveLength(1)
    expect(Number(data![0]!.total_area)).toBe(200)
  })

  it('다른 달은 새 행으로 쌓인다 — 월별 스냅샷 이력이 의도된 설계다', async () => {
    // 제약을 (complex_id) 로 되돌리고 싶은 유혹을 막는 테스트다. 월별 이력이 목적이므로
    // complex_id 단독 유니크로 바꾸면 지난달 관리비 스냅샷이 사라진다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = admin.from('facility_kapt') as any
    await table.upsert(
      { complex_id: complexId, kapt_code: 'A00000001', data_month: '2026-06-01', total_area: 300 },
      { onConflict: ON_CONFLICT },
    )

    const { data } = await admin
      .from('facility_kapt')
      .select('data_month')
      .eq('complex_id', complexId)
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })
})
