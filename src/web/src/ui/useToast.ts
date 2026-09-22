import { createContext, useContext } from 'react'

export type ToastOptions = {
  message: string
  // An error stays until dismissed; anything else leaves after four seconds (MASTER 9).
  tone?: 'info' | 'error'
  // Stays until dismissed without being an error: an update that is waiting for a tap.
  sticky?: boolean
  action?: { label: string; onAction: () => void } | false
}

export const ToastContext = createContext<{ show: (toast: ToastOptions) => void } | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast needs a ToastProvider above it')
  }
  return context
}
