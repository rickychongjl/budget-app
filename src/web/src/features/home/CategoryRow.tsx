import { Check, ChevronRight, CircleAlert, Gauge, TrendingUp, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import type { CategoryRollup } from '../../api/types'
import { formatMoney } from '../../format/money'
import { categoryIcon } from '../../ui/categoryIcons'
import { IconChip } from '../../ui/IconChip'
import { ProgressBar } from '../../ui/ProgressBar'
import styles from './CategoryRow.module.css'
import { categoryStatus } from './categoryStatus'

const STATUS_ICONS = { 'triangle-alert': TriangleAlert, 'circle-alert': CircleAlert, check: Check, 'trending-up': TrendingUp, gauge: Gauge }

type Props = {
  row: CategoryRollup
  currency: string
  // Where a tap goes: this category's transactions in this cycle.
  to: string
  // How far through the cycle today is, for the current cycle only: draws the today line and allows "ahead of pace".
  today?: number
}

// MASTER 9, "Category row". Home and cycle detail are lists of these; there is no chart.
export function CategoryRow({ row, currency, to, today }: Props) {
  const status = categoryStatus(row, currency, today)
  const StatusIcon = status.icon && STATUS_ICONS[status.icon]
  const actual = formatMoney(row.actual, currency)
  const budgeted = formatMoney(row.budgeted, currency)

  return (
    <li>
      {/* The whole row is the link, and the chevron says so without relying on a pointer cursor. */}
      <Link to={to} className={styles.row}>
      <IconChip icon={categoryIcon(row.icon)} colour={row.colour} />
      <div className={styles.body}>
        <div className={styles.top}>
          <h3 className={styles.name}>{row.name}</h3>
          <span className={`${styles.amount} num`}>
            {actual} / {budgeted}
          </span>
        </div>
        <ProgressBar
          value={row.percentUsed === null ? null : row.percentUsed / 100}
          tone={status.tone}
          label={`${row.name}: ${actual} of ${budgeted}, ${status.word}`}
          today={today}
        />
        <p className={`${styles.status} ${styles[status.tone]} num`}>
          {StatusIcon && <StatusIcon aria-hidden="true" className={styles.statusIcon} />}
          {status.word}
        </p>
      </div>
      <ChevronRight aria-hidden="true" className={styles.chevron} />
      </Link>
    </li>
  )
}
