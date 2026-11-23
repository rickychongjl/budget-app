import { Check, CircleAlert, CloudOff, Gauge, Shapes, TrendingUp, TriangleAlert, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { CategoryRollup, CycleRollup } from '../../api/types'
import { cycleDay, cycleElapsed, formatRange, todayIn } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { InstallHint } from '../../pwa/InstallHint'
import { Screen } from '../../shell/Screen'
import buttonStyles from '../../ui/Button.module.css'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { ProgressBar } from '../../ui/ProgressBar'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Skeleton } from '../../ui/Skeleton'
import { useSession } from '../auth/useSession'
import { categoryStatus } from './categoryStatus'
import { CategoryRow } from './CategoryRow'
import rowStyles from './CategoryRow.module.css'
import styles from './Home.module.css'
import { useCurrentCycle } from './useCurrentCycle'

// The app's name heads Home; the tab under it still says "Home" (MASTER 9, "App shell").
const TITLE = 'Tightarse'

const TABS = [
  { value: 'spending', label: 'Spending' },
  { value: 'income', label: 'Income' },
] as const
type Tab = (typeof TABS)[number]['value']

const STATUS_ICONS = { 'triangle-alert': TriangleAlert, 'circle-alert': CircleAlert, check: Check, 'trending-up': TrendingUp, gauge: Gauge }

export function Home() {
  const { me } = useSession()
  const current = useCurrentCycle()
  const [tab, setTab] = useState<Tab>('spending')

  if (current.isPending) {
    return (
      <Screen title={TITLE}>
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
      <Screen title={TITLE}>
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
      <Screen title={TITLE}>
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
  const elapsed = cycleElapsed(cycle.startDate, cycle.endDate, today)
  const isSpending = tab === 'spending'

  return (
    <Screen title={TITLE}>
      {/* Only once there is a budget to come back to: the invitation to install is not the first thing a new user sees. */}
      <InstallHint />
      <header className={styles.header}>
        <p className={styles.caption}>
          {formatRange(cycle.startDate, cycle.endDate, today)} · day {day} of {length}
        </p>
        <SegmentedControl label="Show" options={TABS} value={tab} onChange={setTab} />
        <CycleOverview tab={tab} rollup={rollup} currency={me.currency} daysLeft={length - day + 1} elapsed={elapsed} />
      </header>

      {rollup.categories.length === 0 && <EmptyState icon={Shapes}>This cycle has no categories yet.</EmptyState>}
      <CategorySection
        id={tab}
        title={isSpending ? 'Spending' : 'Income'}
        rows={rollup.categories.filter((row) => row.type === (isSpending ? 'Debit' : 'Credit'))}
        currency={me.currency}
        cycleId={cycle.id}
        today={elapsed}
      />
    </Screen>
  )
}

type OverviewProps = {
  tab: Tab
  rollup: CycleRollup
  currency: string
  // Today included: on the last day there is still one day to spend in.
  daysLeft: number
  elapsed: number
}

// MASTER 9, "Cycle header (Home)": the hero, one bar and a few stat tiles for the chosen tab. Bars and tiles, not a chart.
function CycleOverview({ tab, rollup, currency, daysLeft, elapsed }: OverviewProps) {
  const money = (amount: number) => formatMoney(amount, currency)
  const isSpending = tab === 'spending'
  const budgeted = isSpending ? rollup.debitsBudgeted : rollup.creditsBudgeted
  const actual = isSpending ? rollup.debitsActual : rollup.creditsActual
  const remaining = Math.round((budgeted - actual) * 100) / 100
  // The cycle as one category, so the totals take the same status rules as a row. Over and Ahead are decided here only
  // because the totals may include queued rows the server has not counted. spreadEvenly is on because the totals are
  // spending, not a bill (off would read "Paid" / "still due"); no elapsed is passed, so a bill paid in one go never makes
  // the whole cycle read as ahead of pace.
  const status = categoryStatus(
    {
      categoryId: '',
      name: '',
      icon: '',
      colour: '',
      type: isSpending ? 'Debit' : 'Credit',
      budgeted,
      actual,
      remaining,
      percentUsed: budgeted === 0 ? null : (actual / budgeted) * 100,
      status: actual > budgeted ? (isSpending ? 'Over' : 'Ahead') : 'OnTrack',
      spreadEvenly: true,
      autoPay: false,
    },
    currency,
  )
  const StatusIcon = status.icon && STATUS_ICONS[status.icon]
  const incomeRows = rollup.categories.filter((row) => row.type === 'Credit')
  const received = incomeRows.filter((row) => row.budgeted > 0 && row.actual >= row.budgeted).length

  const tiles = isSpending
    ? [
        ['Left to spend', money(remaining)],
        ['Days left', String(daysLeft)],
        ['Per day left', money(Math.max(remaining, 0) / daysLeft)],
      ]
    : [
        ['Still to come', money(Math.max(remaining, 0))],
        ['Received', `${received} of ${incomeRows.length}`],
      ]

  return (
    <div role="group" aria-label="Cycle overview" className={styles.overview}>
      <div>
        {/* The one display-size number on the screen (MASTER 4). */}
        <p className={`${styles.hero} num`}>{money(actual)}</p>
        <p className={`${styles.sub} num`}>{isSpending ? `spent of ${money(budgeted)} budgeted` : `received of ${money(budgeted)} expected`}</p>
      </div>
      <div className={styles.bar}>
        <ProgressBar
          value={budgeted === 0 ? null : actual / budgeted}
          tone={status.tone}
          label={`${isSpending ? 'Spent' : 'Received'} ${money(actual)} of ${money(budgeted)}, ${status.word}`}
          // Spending is paced by the calendar; income lands when it lands.
          today={isSpending ? elapsed : undefined}
        />
        <p className={`${rowStyles.status} ${rowStyles[status.tone]} num`}>
          {StatusIcon && <StatusIcon aria-hidden="true" className={rowStyles.statusIcon} />}
          {status.word}
        </p>
      </div>
      <dl className={styles.tiles}>
        {tiles.map(([label, value]) => (
          <div key={label} className={styles.tile}>
            <dt className={styles.tileLabel}>{label}</dt>
            <dd className={`${styles.tileValue} num`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

type SectionProps = {
  id: string
  title: string
  rows: CategoryRollup[]
  currency: string
  cycleId: string
  // Draws the "today" line on every bar. Only for the cycle being lived in.
  today?: number
}

export function CategorySection({ id, title, rows, currency, cycleId, today }: SectionProps) {
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
            <CategoryRow key={row.categoryId} row={row} currency={currency} to={`/activity?cycle=${cycleId}&category=${row.categoryId}`} today={today} />
          ))}
        </ul>
      </Card>
    </section>
  )
}
