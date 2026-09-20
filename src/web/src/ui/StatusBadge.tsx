import { Check, CircleAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './StatusBadge.module.css'

type Tone = 'neutral' | 'primary' | 'positive' | 'warning' | 'negative'

// Status is always colour plus icon plus word (MASTER 1.4), so a status tone comes with its icon unless one is given.
const ICONS: Partial<Record<Tone, LucideIcon>> = { positive: Check, warning: TriangleAlert, negative: CircleAlert }

type Props = {
  tone?: Tone
  icon?: LucideIcon
  // The word. Never empty: the badge is not a coloured dot.
  children: ReactNode
}

export function StatusBadge({ tone = 'neutral', icon, children }: Props) {
  const Icon = icon ?? ICONS[tone]

  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {Icon && <Icon aria-hidden="true" className={styles.icon} />}
      {children}
    </span>
  )
}
