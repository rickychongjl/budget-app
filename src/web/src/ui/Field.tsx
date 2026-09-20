import { CircleAlert } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'
import styles from './Field.module.css'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  // Always visible, above the input. A placeholder is never the label (MASTER 9).
  label: string
  hint?: string
  error?: string
}

export function Field({ label, hint, error, id, className, ...rest }: Props) {
  const generated = useId()
  const inputId = id ?? generated
  const noteId = `${inputId}-note`
  const note = error ?? hint

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
      />
      {note && (
        <p id={noteId} className={error ? styles.error : styles.hint}>
          {error && <CircleAlert aria-hidden="true" className={styles.icon} />}
          {note}
        </p>
      )}
    </div>
  )
}
