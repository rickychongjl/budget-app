import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import styles from './Screen.module.css'

type Props = {
  // The screen's one h1, in the top bar.
  title: string
  // At most one action, on the right (MASTER 9).
  action?: ReactNode
  // A screen reached from another one, not from a tab: it gets a Back button, so the edge swipe is not the only way.
  back?: boolean
  children: ReactNode
}

// Every routed page wraps itself in this: the top bar, then the content that scrolls under it.
export function Screen({ title, action, back = false, children }: Props) {
  const navigate = useNavigate()

  return (
    <>
      <header className={styles.topBar}>
        {back && (
          <button type="button" className={styles.back} aria-label="Back" onClick={() => void navigate(-1)}>
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <h1 className={styles.title}>{title}</h1>
        {action}
      </header>
      <div className={styles.content}>{children}</div>
    </>
  )
}
