import { CalendarOff, ChevronRight, CloudOff } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import type { Cycle } from '../../api/types'
import { formatRange, todayIn } from '../../format/dates'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { Screen } from '../../shell/Screen'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { StatusBadge } from '../../ui/StatusBadge'
import { useSession } from '../auth/useSession'
import { Accrued } from './Accrued'
import styles from './Cycles.module.css'

const CYCLE_LIST = ['cycles', 'list']

// Draft wins over the phase: a first cycle that has not been confirmed is not really "current" yet.
const badge = (cycle: Cycle) =>
  cycle.status === 'Draft' ? <StatusBadge>Draft</StatusBadge> : cycle.phase === 'Current' ? <StatusBadge tone="primary">Current</StatusBadge> : <StatusBadge>{cycle.phase === 'Past' ? 'Past' : 'Upcoming'}</StatusBadge>

// MASTER 9, "Cycle list row". Spent against budgeted is not here yet: GET /api/cycles has no totals, and the endpoint
// that does (GET /api/reports/cycles) arrives in M7 with the trend chart that sits above this list.
export function Cycles() {
  const { me } = useSession()
  const cycles = useCachedQuery<Cycle[]>(CYCLE_LIST, () => api.get<Cycle[]>('/api/cycles'))
  const today = todayIn(me.timeZone)

  if (cycles.isError) {
    return (
      <Screen title="Cycles">
        <EmptyState icon={CloudOff} action={<Button onClick={() => cycles.refetch()}>Try again</Button>}>
          Couldn't load your cycles.
        </EmptyState>
      </Screen>
    )
  }

  if (!cycles.data) {
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
  const newestFirst = [...cycles.data].sort((a, b) => b.startDate.localeCompare(a.startDate))

  return (
    <Screen title="Cycles">
      {newestFirst.length === 0 ? (
        <EmptyState icon={CalendarOff}>No cycles yet.</EmptyState>
      ) : (
        <ul className={styles.list}>
          {newestFirst.map((cycle) => (
            <li key={cycle.id}>
              <Link to={`/cycles/${cycle.id}`} className={styles.row}>
                <span className={styles.text}>
                  <span className={styles.top}>
                    <h2 className={styles.range}>{formatRange(cycle.startDate, cycle.endDate, today)}</h2>
                    {badge(cycle)}
                  </span>
                  <Accrued opening={cycle.openingBalance} closing={cycle.closingBalance} currency={me.currency} />
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
