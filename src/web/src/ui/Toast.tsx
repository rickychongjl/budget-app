import { CircleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import styles from './Toast.module.css'
import { ToastContext, type ToastOptions } from './useToast'

const LIFETIME_MS = 4000

// One at a time: a new toast replaces the one showing. The live region is always in the page and only its content
// changes, which is what makes a screen reader announce it.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null)
  const dismiss = useCallback(() => setToast(null), [])
  const context = useMemo(() => ({ show: setToast }), [])

  useEffect(() => {
    if (toast && toast.tone !== 'error') {
      const timer = setTimeout(dismiss, LIFETIME_MS)
      return () => clearTimeout(timer)
    }
  }, [toast, dismiss])

  return (
    <ToastContext value={context}>
      {children}
      <div role="status" aria-live="polite" className={styles.region}>
        {toast && (
          <div className={`${styles.toast} ${toast.tone === 'error' ? styles.error : ''}`}>
            {toast.tone === 'error' && <CircleAlert aria-hidden="true" className={styles.icon} />}
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  const { onAction } = toast.action as { onAction: () => void }
                  dismiss()
                  onAction()
                }}
              >
                {toast.action.label}
              </button>
            )}
            {toast.tone === 'error' && (
              <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={dismiss}>
                <X aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext>
  )
}
