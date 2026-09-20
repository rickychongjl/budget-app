import { CalendarOff, ChevronRight, CloudOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Cycle, CycleSummary } from '../../api/types'
import { formatRange, todayIn } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { Screen } from '../../shell/Screen'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { StatusBadge } from '../../ui/StatusBadge'
import { useSession } from '../auth/useSession'
import { Accrued } from './Accrued'
import styles from './Cycles.module.css'
import { categoriesOf, toSeries, type TrendFilter } from './trend'
import { readFilter, SPENDING, writeFilter } from './chartFilter'
import { TrendFilterControl } from './TrendFilter'
import { TrendSection } from './TrendSection'
import { useCycleReport } from './useCycleReport'

// The trend across cycles (story "Reporting 3"): the filter, then the chart or the table, from the same report the
// list below is drawn from.
function Trend({ report, currency, today }: { report: CycleSummary[]; currency: string; today: string }) {
  const categories = useMemo(() => categoriesOf(report), [report])
  // Read once, when the categories are first known, so a later refetch cannot pull the choice back.
  const [filter, setFilter] = useState<TrendFilter | null>(null)
  const chosen = filter ?? (categories.length > 0 ? readFilter(categories) : SPENDING)
  const series = useMemo(() => toSeries(report, chosen, today), [report, chosen, today])
  const colour = chosen.kind === 'category' ? (categories.find((one) => one.id === chosen.categoryId)?.colour ?? 'primary') : 'primary'

  return (
    <>
      <TrendFilterControl
        filter={chosen}
        categories={categories}
        onChange={(next) => {
          setFilter(next)
          writeFilter(next)
        }}
      />
      <TrendSection series={series} filter={chosen} currency={currency} today={today} colour={colour} />
    </>
  )
}

// Draft wins over the phase: a first cycle that has not been confirmed is not really "current" yet.
const badge = (cycle: Cycle) =>
  cycle.status === 'Draft' ? <StatusBadge>Draft</StatusBadge> : cycle.phase === 'Current' ? <StatusBadge tone="primary">Current</StatusBadge> : <StatusBadge>{cycle.phase === 'Past' ? 'Past' : 'Upcoming'}</StatusBadge>

// MASTER 9, "Cycle list row". Everything a row shows comes from the report, so the list and the chart above it are
// drawn from one answer and a queued transaction moves both.
export function Cycles() {
  const { me } = useSession()
  const report = useCycleReport()
  const today = todayIn(me.timeZone)

  if (report.isError) {
    return (
      <Screen title="Cycles">
        <EmptyState icon={CloudOff} action={<Button onClick={() => report.refetch()}>Try again</Button>}>
          Couldn't load your cycles.
        </EmptyState>
      </Screen>
    )
  }

  if (!report.data) {
    return (
      <Screen title="Cycles">
        <div className={styles.list} aria-busy="true">
          <span className="visually-hidden">Loading</span>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} height="5rem" />
          ))}
        </div>
      </Screen>
    )
  }

  // The API lists oldest first; the one being lived in, and what comes next, belong at the top.
  const newestFirst = [...report.data].sort((a, b) => b.cycle.startDate.localeCompare(a.cycle.startDate))

  return (
    <Screen title="Cycles">
      {/* The chart is above the list, which grows for ever and would otherwise push it off the screen. */}
      {newestFirst.length > 0 && <Trend report={report.data} currency={me.currency} today={today} />}

      {newestFirst.length === 0 ? (
        <EmptyState icon={CalendarOff}>No cycles yet.</EmptyState>
      ) : (
        <ul className={styles.list}>
          {newestFirst.map(({ cycle, rollup }) => (
            <li key={cycle.id}>
              <Link to={`/cycles/${cycle.id}`} className={styles.row}>
                <span className={styles.text}>
                  <span className={styles.top}>
                    <h2 className={styles.range}>{formatRange(cycle.startDate, cycle.endDate, today)}</h2>
                    {badge(cycle)}
                  </span>
                  <span className={`${styles.spent} num`}>
                    {formatMoney(rollup.debitsActual, me.currency)} of {formatMoney(rollup.debitsBudgeted, me.currency)} spent
                  </span>
                  <Accrued amount={rollup.accrued} currency={me.currency} />
                </span>
                <ChevronRight aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
