import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type Props = {
  icon: LucideIcon
  // One sentence.
  children: ReactNode
  // One action.
  action?: ReactNode
}

export function EmptyState({ icon: Icon, children, action }: Props) {
  return (
    <div className={styles.empty}>
      <Icon aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>{children}</p>
      {action}
    </div>
  )
}
