import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Card.module.css'

type Props = {
  children: ReactNode
  // A tappable card is a real button and shows a trailing chevron, so it does not rely on a pointer cursor to look tappable.
  onClick?: () => void
}

export function Card({ children, onClick }: Props) {
  if (!onClick) {
    return <div className={styles.card}>{children}</div>
  }

  return (
    <button type="button" className={`${styles.card} ${styles.tappable}`} onClick={onClick}>
      <span className={styles.content}>{children}</span>
      <ChevronRight aria-hidden="true" className={styles.chevron} />
    </button>
  )
}
