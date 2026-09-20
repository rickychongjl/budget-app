import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  // One primary per screen (MASTER 9).
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  icon?: LucideIcon
  // A request is in flight: disabled, and the spinner takes the icon's place so the width does not change.
  pending?: boolean
  fullWidth?: boolean
}

export function Button({ variant = 'primary', icon: Icon, pending = false, fullWidth = false, disabled, children, className, ...rest }: Props) {
  const Leading = pending ? LoaderCircle : Icon

  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={[styles.button, styles[variant], fullWidth && styles.fullWidth, className].filter(Boolean).join(' ')}
    >
      {Leading && <Leading aria-hidden="true" className={pending ? styles.spinner : styles.icon} />}
      {children}
    </button>
  )
}
