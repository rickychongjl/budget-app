import { CircleAlert } from 'lucide-react'
import { useId, useMemo, type Ref } from 'react'
import { AUSTRALIAN_ZONES, otherZones } from './timeZones'
import styles from './TimeZoneField.module.css'

type Props = {
  ref?: Ref<HTMLSelectElement>
  value: string
  // Kept in the list even if this browser does not know them: the device's zone and the one already saved.
  keep: string[]
  hint?: string
  error?: string
  disabled?: boolean
  onChange: (zone: string) => void
}

// A native select, laid out like Field: the phone's own picker is searchable by typing on a keyboard, scrolls well on a
// wheel, and is announced properly. The Australian zones come first by city; the rest are IANA names.
export function TimeZoneField({ ref, value, keep, hint, error, disabled, onChange }: Props) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  const others = useMemo(() => otherZones([value, ...keep]), [value, keep])

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Time zone
      </label>
      <select
        ref={ref}
        id={id}
        className={styles.select}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <optgroup label="Australia">
          {AUSTRALIAN_ZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Everywhere else">
          {others.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </optgroup>
      </select>
      {note && (
        <p id={noteId} className={error ? styles.error : styles.hint}>
          {error && <CircleAlert aria-hidden="true" className={styles.icon} />}
          {note}
        </p>
      )}
    </div>
  )
}
