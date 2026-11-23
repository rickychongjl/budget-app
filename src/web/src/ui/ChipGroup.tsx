import { useId } from 'react'
import styles from './ChipGroup.module.css'
import { toSlot } from './slots'

type Props = {
  // Names the group for a screen reader; not drawn.
  label: string
  // A colour is a category's palette slot, drawn as the selected chip's ring; without one the ring is the primary colour.
  options: readonly { value: string; label: string; colour?: string }[]
  value: string
  onChange: (value: string) => void
}

// MASTER 9: more options than a segmented control can hold, so a row of chips that scrolls inside its own container.
// Native radios under the paint, like SegmentedControl.
export function ChipGroup({ label, options, value, onChange }: Props) {
  const name = useId()

  return (
    <div role="radiogroup" aria-label={label} className={styles.chips}>
      {options.map((option) => (
        <label key={option.value} className={styles.chip} data-slot={option.colour && toSlot(option.colour)}>
          <input type="radio" name={name} className={styles.input} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} />
          <span className={styles.text}>{option.label}</span>
        </label>
      ))}
    </div>
  )
}
