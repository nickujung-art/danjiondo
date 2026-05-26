'use client'

import { CustomOverlayMap } from 'react-kakao-maps-sdk'
import { memo, useState, useCallback, useRef, useEffect } from 'react'
import type { PresaleMapPin } from '@/lib/data/presale-pins'

const ACCENT = '#7C3AED'  // violet-700

function formatMoveInYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}` : ym
}

export const PresalePin = memo(function PresalePin({
  id, name, lat, lng, move_in_ym, supply_count, hssply_adres,
}: PresaleMapPin) {
  const [hover, setHover] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    setHover(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHover(false), 150)
  }, [])

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }, [])

  const moveIn = formatMoveInYm(move_in_ym)

  return (
    <CustomOverlayMap position={{ lat, lng }} xAnchor={0.5} yAnchor={1.0} zIndex={hover ? 15 : 5}>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {hover && (
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              position:    'absolute',
              bottom:      '100%',
              left:        '50%',
              transform:   'translateX(-50%)',
              marginBottom: 6,
              background:  'white',
              border:      '1px solid #E5E7EB',
              borderRadius: 8,
              padding:     '10px 12px',
              boxShadow:   '0 4px 16px rgba(0,0,0,0.12)',
              pointerEvents: 'auto',
              whiteSpace:  'nowrap',
              minWidth:    160,
              zIndex:      100,
              fontFamily:  'system-ui, -apple-system, sans-serif',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 4 }}>
              {name}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              marginBottom: 6, padding: '3px 7px',
              background: '#F5F3FF', border: '1px solid #DDD6FE',
              borderRadius: 4, fontSize: 10, color: '#6D28D9', fontWeight: 600,
            }}>
              {moveIn} 입주예정
            </div>
            {supply_count !== null && (
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
                공급 {supply_count.toLocaleString()}세대
              </div>
            )}
            {hssply_adres && (
              <div style={{
                fontSize: 10, color: '#9CA3AF',
                maxWidth: 200, whiteSpace: 'normal', wordBreak: 'keep-all',
              }}>
                {hssply_adres}
              </div>
            )}
          </div>
        )}

        {/* 핀 본체 */}
        <div
          style={{
            display:       'inline-flex',
            flexDirection: 'column',
            alignItems:    'center',
            filter:        'drop-shadow(0 1px 4px rgba(0,0,0,0.18))',
            userSelect:    'none',
          }}
          aria-label={`${name} ${moveIn} 입주예정`}
          role="img"
        >
          <div
            style={{
              border:       `1.5px solid ${ACCENT}`,
              borderRadius: 4,
              overflow:     'hidden',
              background:   '#F5F3FF',
            }}
          >
            <div
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           5,
                paddingTop:    5,
                paddingBottom: 5,
                paddingLeft:   4,
                paddingRight:  8,
              }}
            >
              <div
                style={{
                  width:        3,
                  alignSelf:    'stretch',
                  background:   ACCENT,
                  borderRadius: 1,
                  flexShrink:   0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{
                  fontSize:      11,
                  fontWeight:    700,
                  color:         ACCENT,
                  lineHeight:    1,
                  letterSpacing: '-0.3px',
                  fontFamily:    'system-ui, -apple-system, sans-serif',
                  whiteSpace:    'nowrap',
                }}>
                  {moveIn}
                </span>
                <span style={{
                  fontSize:   9,
                  fontWeight: 500,
                  color:      '#7C3AED',
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}>
                  입주예정
                </span>
              </div>
            </div>
          </div>
          {/* 핀 줄기 + 점 */}
          <div style={{ width: 1.5, height: 5, background: ACCENT }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT }} />
        </div>
      </div>
    </CustomOverlayMap>
  )
})
