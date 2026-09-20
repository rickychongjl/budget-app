import styles from './ProgressBar.module.css'

type Props = {
  // Actual over budget: 0.5 is half, 1.05 is over. Null when nothing was budgeted.
  value: number | null
  // The fill shows status, never the category's colour (MASTER 3.3, 3.4).
  tone?: 'normal' | 'warning' | 'negative' | 'positive'
  // The whole sentence, e.g. "Food: $420 of $400, over by $20". A bare percentage says nothing about money.
  label: string
}

export function ProgressBar({ value, tone = 'normal', label }: Props) {
  // Capped: an over-budget bar is full, and the status word carries the rest.
  const fraction = Math.min(Math.max(value ?? 0, 0), 1)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuetext={label}
      className={styles.track}
    >
      {/* scaleX, not width: MASTER 7 animates transform and opacity only. */}
      <div className={`${styles.fill} ${styles[tone]}`} style={{ transform: `scaleX(${fraction})` }} />
    </div>
  )
}
