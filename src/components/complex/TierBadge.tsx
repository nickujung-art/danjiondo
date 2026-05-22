import { getTierLabel, getTierBadgeText, getTierColorClass } from '@/lib/data/member-tier'
import type { MemberTier } from '@/lib/data/member-tier'

interface TierBadgeProps {
  tier:  MemberTier
  size?: 'sm' | 'md'
}

export function TierBadge({ tier, size = 'sm' }: TierBadgeProps) {
  const colorClass = getTierColorClass(tier)
  const label      = getTierLabel(tier)
  const badge      = getTierBadgeText(tier)
  const isSmall = size === 'sm'

  return (
    <span
      className={colorClass}
      title={label}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          3,
        padding:      isSmall ? '1px 5px' : '2px 8px',
        borderRadius: 4,
        border:       '1px solid currentColor',
        font:         `700 ${isSmall ? '10px' : '12px'}/1.4 var(--font-sans)`,
        letterSpacing: '0.04em',
        whiteSpace:   'nowrap',
      }}
    >
      {badge}
      {!isSmall && <span style={{ fontWeight: 500 }}>{label}</span>}
    </span>
  )
}
