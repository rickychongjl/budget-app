import { CalendarOff, ChevronRight, CloudOff } from 'lucide-react'
import { Link } from 'react-router'
import type { Cycle } from '../../api/types'
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
import { useCycleReport } from './useCycleReport'

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
