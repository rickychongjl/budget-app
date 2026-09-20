import { useId, type ReactNode } from 'react'
import styles from './Dialog.module.css'
import { useModalDialog } from './useModalDialog'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  // One or two sentences.
  children: ReactNode
  // Two buttons, the safe choice first (MASTER 9).
  actions?: ReactNode
}

// Confirmations only. Anything with a form in it is a Sheet.
export function Dialog({ open, title, onClose, children, actions }: Props) {
  const modal = useModalDialog(open, onClose)
  const titleId = useId()

  if (!open) {
    return null
  }

  return (
    <dialog {...modal} className={styles.dialog} aria-labelledby={titleId}>
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div className={styles.body}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </dialog>
  )
}
