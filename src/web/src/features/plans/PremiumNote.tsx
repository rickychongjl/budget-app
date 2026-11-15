import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '../../ui/Card'
import { StatusBadge } from '../../ui/StatusBadge'
import styles from './PremiumNote.module.css'
import { PREMIUM_SOON } from './plan'

type Props = {
  // What is locked, as a short phrase ("Trend across every cycle").
  title: string
  // One sentence on what Premium adds here.
  children: ReactNode
}

// Something the Free plan does not include. A lock badge with the word, never colour alone, and in neutral tones: being
// on Free is not a warning. There is no purchase yet, so it says Premium is coming rather than offering a button.
export function PremiumNote({ title, children }: Props) {
  return (
    <Card>
      <div className={styles.note}>
        <StatusBadge icon={Lock}>Premium</StatusBadge>
        <p className={styles.title}>{title}</p>
        <p className={styles.text}>
          {children} {PREMIUM_SOON}
        </p>
      </div>
    </Card>
  )
}
