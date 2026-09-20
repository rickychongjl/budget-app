import type { ReactNode } from 'react'
import styles from './Screen.module.css'

type Props = {
  // The screen's one h1, in the top bar.
  title: string
  // At most one action, on the right (MASTER 9).
  action?: ReactNode
  children: ReactNode
}

// Every routed page wraps itself in this: the top bar, then the content that scrolls under it.
export function Screen({ title, action, children }: Props) {
  return (
    <>
      <header className={styles.topBar}>
        <h1 className={styles.title}>{title}</h1>
        {action}
      </header>
      <div className={styles.content}>{children}</div>
    </>
  )
}
