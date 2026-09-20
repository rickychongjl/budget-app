import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatMoney } from '../../format/money'
import styles from './Accrued.module.css'

type Props = { amount: number | null; currency: string }

// Money accrued in a cycle: closing balance minus opening balance (story "Reporting 3.2"), worked out by the server and
// null until both balances are known. Status is colour plus icon plus word, and the sign is a character, never colour
// alone (MASTER 11).
export function Accrued({ amount, currency }: Props) {
  if (amount === null) {
    return null
  }

  const tone = amount > 0 ? styles.positive : amount < 0 ? styles.negative : styles.level
  const Icon = amount < 0 ? TrendingDown : TrendingUp

  return (
    <span className={`${styles.accrued} ${tone} num`}>
      {amount !== 0 && <Icon aria-hidden="true" className={styles.icon} />}
      {formatMoney(amount, currency, { sign: true })} accrued
    </span>
  )
}
