import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import styles from './IconChip.module.css'
import { toSlot } from './slots'

type Props = {
  icon: LucideIcon
  // The category's stored Colour: a slot name.
  colour: string
}

export function IconChip({ icon: Icon, colour }: Props) {
  return (
    <span className={styles.chip} style={{ '--chip': `var(--cat-${toSlot(colour)})` } as CSSProperties}>
      <Icon aria-hidden="true" />
    </span>
  )
}
