import { useId } from 'react'
import styles from './SegmentedControl.module.css'

type Props<T extends string> = {
  // Names the group for a screen reader; not drawn.
  label: string
  // At most four (MASTER 9). More than that is a chip row.
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

// Native radios under the paint: the group role, the checked state and arrow-key movement come with them.
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  const name = useId()

  return (
    <div role="radiogroup" aria-label={label} className={styles.track}>
      {options.map((option) => (
        <label key={option.value} className={styles.segment}>
          <input
            type="radio"
            className={styles.input}
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.text}>{option.label}</span>
        </label>
      ))}
    </div>
  )
}
