import { CloudOff, RefreshCw } from 'lucide-react'
import styles from './ConnectivityBanner.module.css'
import { useOnline } from './useOnline'

type Props = {
  // How many changes are in the outbox.
  waiting: number
}

// MASTER 9: information, not an error, so it is muted and never red. The live region is always in the page and only
// its content changes, so going offline is announced.
export function ConnectivityBanner({ waiting }: Props) {
  const online = useOnline()
  const queued = waiting > 0 ? `${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting to sync.` : null
  const text = online ? queued : `Offline. ${queued ?? "Changes will sync when you're back online."}`
  const Icon = online ? RefreshCw : CloudOff

  return (
    <div role="status" className={text ? styles.banner : undefined}>
      {text && (
        <>
          <Icon aria-hidden="true" className={styles.icon} />
          {text}
        </>
      )}
    </div>
  )
}
