import { CloudOff, Shapes, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import type { CategoryRollup } from '../../api/types'
import { cycleDay, formatRange, todayIn } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { Screen } from '../../shell/Screen'
import buttonStyles from '../../ui/Button.module.css'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { useSession } from '../auth/useSession'
import { CategoryRow } from './CategoryRow'
import styles from './Home.module.css'
import { useCurrentCycle } from './useCurrentCycle'

export function Home() {
  const { me } = useSession()
  const current = useCurrentCycle()

  if (current.isPending) {
    return (
      <Screen title="Home">
        {/* Blocks the size of what replaces them, so nothing jumps when the data lands. */}
        <div className={styles.header} aria-busy="true">
          <span className="visually-hidden">Loading</span>
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="2.5rem" width="50%" />
          <Skeleton height="1.25rem" width="70%" />
        </div>
        <Card>
          <div className={styles.rows}>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} height="4.5rem" />
            ))}
          </div>
        </Card>
      </Screen>
    )
  }

  if (current.isError) {
    return (
      <Screen title="Home">
        <EmptyState icon={CloudOff} action={<Button onClick={() => current.refetch()}>Try again</Button>}>
          Couldn't load your budget.
        </EmptyState>
      </Screen>
    )
  }

  // No cycle, or a first cycle that has not been confirmed: transactions need a Confirmed cycle, so there is nothing
  // to show until onboarding is finished.
  if (!current.data || current.data.cycle.status === 'Draft') {
    return (
      <Screen title="Home">
        <EmptyState
          icon={Wallet}
          action={
            <Link to="/onboarding" className={`${buttonStyles.button} ${buttonStyles.primary}`}>
              Set up your first cycle
            </Link>
          }
        >
          No budget yet. Set up your first cycle.
        </EmptyState>
      </Screen>
    )
  }

  const { cycle, rollup } = current.data
  const today = todayIn(me.timeZone)
  const { day, length } = cycleDay(cycle.startDate, cycle.endDate, today)
  const money = (amount: number) => formatMoney(amount, me.currency)
  const spending = rollup.categories.filter((row) => row.type === 'Debit')
  const income = rollup.categories.filter((row) => row.type === 'Credit')

  return (
    <Screen title="Home">
      <header className={styles.header}>
        <p className={styles.caption}>
          {formatRange(cycle.startDate, cycle.endDate, today)} · day {day} of {length}
        </p>
        {/* The one display-size number on the screen (MASTER 4). */}
        <p className={`${styles.hero} num`}>{money(rollup.debitsActual)}</p>
        <p className={`${styles.sub} num`}>spent of {money(rollup.debitsBudgeted)} budgeted</p>
        <p className={`${styles.sub} num`}>
          {money(rollup.creditsActual)} received of {money(rollup.creditsBudgeted)} expected
        </p>
      </header>

      {rollup.categories.length === 0 && <EmptyState icon={Shapes}>This cycle has no categories yet.</EmptyState>}
      <CategorySection id="spending" title="Spending" rows={spending} currency={me.currency} />
      <CategorySection id="income" title="Income" rows={income} currency={me.currency} />
    </Screen>
  )
}

function CategorySection({ id, title, rows, currency }: { id: string; title: string; rows: CategoryRollup[]; currency: string }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      <Card>
        <ul className={styles.rows}>
          {rows.map((row) => (
            <CategoryRow key={row.categoryId} row={row} currency={currency} />
          ))}
        </ul>
      </Card>
    </section>
  )
}
