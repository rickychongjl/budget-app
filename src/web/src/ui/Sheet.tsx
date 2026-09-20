import { X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import styles from './Sheet.module.css'
import { useModalDialog } from './useModalDialog'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  // Sticky at the bottom, above the safe area: where the Save button goes.
  footer?: ReactNode
}

// ponytail: no drag-to-dismiss (plan, out of scope). Close, scrim and Escape cover it; add the drag on the handle and
// header only (MASTER 9, Gestures) if it is missed on a real phone.
export function Sheet({ open, title, onClose, children, footer }: Props) {
  const modal = useModalDialog(open, onClose)
  const titleId = useId()

  if (!open) {
    return null
  }

  return (
    <dialog {...modal} className={styles.sheet} aria-labelledby={titleId}>
      <div className={styles.panel}>
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  )
}
