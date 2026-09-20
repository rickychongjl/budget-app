import { Delete } from 'lucide-react'
import styles from './Keypad.module.css'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const

type Props = { onKey: (key: string) => void }

// The app's own keypad, not the system keyboard, so the sheet's layout does not jump when the amount is focused
// (MASTER 9). A hardware keyboard still works: the sheet listens for digits, the point and Backspace.
export function Keypad({ onKey }: Props) {
  return (
    <div className={styles.keypad}>
      {KEYS.map((key) => (
        <button key={key} type="button" className={styles.key} aria-label={key === '.' ? 'Decimal point' : key === 'back' ? 'Backspace' : undefined} onClick={() => onKey(key)}>
          {key === 'back' ? <Delete aria-hidden="true" /> : key}
        </button>
      ))}
    </div>
  )
}
