import { lazy, Suspense, useState } from 'react'
import { formatRange } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { Card } from '../../ui/Card'
import { Skeleton } from '../../ui/Skeleton'
import styles from './Trend.module.css'
import { summarise, type TrendFilter, type TrendPoint } from './trend'

// Recharts is about a third of the bundle and most visits never open this tab, so it is fetched only when a line is
// actually drawn. Reading the same data as a table costs nothing extra.
const TrendChart = lazy(() => import('./TrendChart'))

type Props = { series: TrendPoint[]; filter: TrendFilter; currency: string; today: string; colour?: string }

// The trend across cycles (story "Reporting 3"), with the summary sentence and table view MASTER 10 requires of
// every chart. Under three points a line says nothing, so the values are shown as cards instead.
export function TrendSection({ series, filter, currency, today, colour = 'primary' }: Props) {
  const [asTable, setAsTable] = useState(false)
  const known = series.filter((point) => point.value !== null)
  const summary = summarise(series, filter, currency)
  const sign = filter.kind === 'accrued'
  const money = (value: number) => formatMoney(value, currency, { sign })

  if (known.length === 0) {
    return (
      <section aria-labelledby="trend" className={styles.section}>
        <h2 id="trend" className={styles.title}>
          Trend
        </h2>
        <p className={styles.summary}>No finished cycles to chart yet.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="trend" className={styles.section}>
      <h2 id="trend" className={styles.title}>
        Trend
      </h2>
      <p className={styles.summary}>{summary}</p>

      {asTable ? (
        <table className={styles.table}>
          <caption className="visually-hidden">{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.cycleId}>
                <th scope="row">{formatRange(point.start, point.end, today)}</th>
                <td className="num">
                  {point.value === null ? '—' : money(point.value)}
                  {point.partial && point.value !== null && <span className={styles.partial}> so far</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : known.length < 3 ? (
        // MASTER 10: fewer than three points is stat cards, not a line between two dots.
        <ul className={styles.stats}>
          {series.map((point) => (
            <li key={point.cycleId}>
              <Card>
                <p className={styles.statLabel}>
                  {formatRange(point.start, point.end, today)}
                  {point.partial && ' so far'}
                </p>
                <p className={`${styles.statValue} num`}>{point.value === null ? '—' : money(point.value)}</p>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Suspense fallback={<Skeleton height="220px" />}>
          <TrendChart series={series} filter={filter} currency={currency} today={today} label={summary} colour={colour} />
        </Suspense>
      )}

      <button type="button" className={styles.toggle} aria-pressed={asTable} onClick={() => setAsTable((on) => !on)}>
        View as table
      </button>
    </section>
  )
}
