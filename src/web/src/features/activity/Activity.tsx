import { CloudOff, ReceiptText, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { CategoryType, CycleSummary, Transaction } from '../../api/types'
import { formatDay, formatRange, todayIn } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { Screen } from '../../shell/Screen'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { categoryIcon } from '../../ui/categoryIcons'
import { ChipGroup } from '../../ui/ChipGroup'
import { EmptyState } from '../../ui/EmptyState'
import { IconChip } from '../../ui/IconChip'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Skeleton } from '../../ui/Skeleton'
import { useSession } from '../auth/useSession'
import { useCycle } from '../cycles/useCycle'
import { useCurrentCycle } from '../home/useCurrentCycle'
import { EditTransactionSheet } from '../transactions/AddTransactionSheet'
import { useTransactions } from '../transactions/useTransactions'
import styles from './Activity.module.css'

const KINDS = [
  { value: 'Debit', label: 'Spending' },
  { value: 'Credit', label: 'Income' },
] as const

type CycleQuery = { data: CycleSummary | null | undefined; isError: boolean; refetch: () => unknown }

// /activity: a cycle's transactions by day. The tab shows the current cycle. A category row (Home, a cycle's page) links
// here with ?cycle=&category=, which is how a past cycle's transactions are reached to fix one (story "Transactions 4").
export function Activity() {
  const [params] = useSearchParams()
  const cycleId = params.get('cycle')
  return cycleId ? <CycleActivity cycleId={cycleId} /> : <CurrentActivity />
}

function CurrentActivity() {
  return <ActivityScreen cycle={useCurrentCycle()} back={false} />
}

function CycleActivity({ cycleId }: { cycleId: string }) {
  return <ActivityScreen cycle={useCycle(cycleId)} back />
}

function ActivityScreen({ cycle, back }: { cycle: CycleQuery; back: boolean }) {
  if (cycle.isError) {
    return (
      <Screen title="Activity" back={back}>
        <EmptyState icon={CloudOff} action={<Button onClick={() => void cycle.refetch()}>Try again</Button>}>
          Couldn't load your activity.
        </EmptyState>
      </Screen>
    )
  }

  if (cycle.data === undefined) {
    return (
      <Screen title="Activity" back={back}>
        <Loading />
      </Screen>
    )
  }

  // Transactions need a Confirmed cycle, so a new user has nothing here until onboarding is done.
  if (cycle.data === null || cycle.data.cycle.status === 'Draft') {
    return (
      <Screen title="Activity" back={back}>
        <EmptyState icon={Wallet}>Nothing yet. Transactions show here once your first cycle is set up.</EmptyState>
      </Screen>
    )
  }

  return (
    <Screen title="Activity" back={back}>
      <Transactions summary={cycle.data} />
    </Screen>
  )
}

function Loading() {
  return (
    <Card>
      <div className={styles.rows} aria-busy="true">
        <span className="visually-hidden">Loading</span>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height="2.75rem" />
        ))}
      </div>
    </Card>
  )
}

type Day = { date: string; total: number; transactions: Transaction[] }

// The list is newest first already (useTransactions), so each day's group is met in order.
function byDay(transactions: Transaction[]) {
  const days = new Map<string, Day>()
  for (const transaction of transactions) {
    const day = days.get(transaction.occurredOn) ?? { date: transaction.occurredOn, total: 0, transactions: [] }
    day.total += transaction.amount
    day.transactions.push(transaction)
    days.set(day.date, day)
  }
  return [...days.values()]
}

function Transactions({ summary }: { summary: CycleSummary }) {
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const transactions = useTransactions(summary.cycle.id)
  const [editing, setEditing] = useState<Transaction | null>(null)

  // The filter lives in the URL, so a category row can link straight to it and Back returns to the same view.
  const categories = summary.rollup.categories
  const category = categories.find((row) => row.categoryId === params.get('category'))
  const kind: CategoryType = category?.type ?? (params.get('kind') === 'Credit' ? 'Credit' : 'Debit')
  const ofKind = categories.filter((row) => row.type === kind)
  const byId = new Map(categories.map((row) => [row.categoryId, row]))

  function filter(next: { kind: CategoryType; category?: string }) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.set('kind', next.kind)
        if (next.category) updated.set('category', next.category)
        else updated.delete('category')
        return updated
      },
      { replace: true },
    )
  }

  if (transactions.isError) {
    return (
      <EmptyState icon={CloudOff} action={<Button onClick={() => void transactions.refetch()}>Try again</Button>}>
        Couldn't load your activity.
      </EmptyState>
    )
  }

  const today = todayIn(me.timeZone)
  const shown = transactions.data?.filter((transaction) => (category ? transaction.categoryId === category.categoryId : byId.get(transaction.categoryId)?.type === kind))
  const what = kind === 'Debit' ? 'spending' : 'income'

  return (
    <div className={styles.page}>
      <p className={styles.range}>{formatRange(summary.cycle.startDate, summary.cycle.endDate, today)}</p>
      <SegmentedControl label="Type" options={KINDS} value={kind} onChange={(next) => filter({ kind: next })} />
      <ChipGroup
        label="Category"
        options={[{ value: '', label: 'All' }, ...ofKind.map((row) => ({ value: row.categoryId, label: row.name, colour: row.colour }))]}
        value={category?.categoryId ?? ''}
        onChange={(id) => filter({ kind, category: id })}
      />

      {!shown ? (
        <Loading />
      ) : shown.length === 0 ? (
        <EmptyState icon={ReceiptText}>{category ? `No transactions in ${category.name} this cycle.` : `No ${what} this cycle.`}</EmptyState>
      ) : (
        byDay(shown).map((day) => (
          <section key={day.date} aria-labelledby={`day-${day.date}`} className={styles.day}>
            <h2 id={`day-${day.date}`} className={styles.dayHeading}>
              <span>{formatDay(day.date, today)}</span>
              <span className="num">{formatMoney(day.total, me.currency)}</span>
            </h2>
            <Card>
              <ul className={styles.rows}>
                {day.transactions.map((transaction) => {
                  const row = byId.get(transaction.categoryId)
                  return (
                    <li key={transaction.clientId}>
                      {/* Edit and delete are reached by tapping the row; there are no swipe actions (MASTER 9, Gestures). */}
                      <button type="button" className={styles.row} onClick={() => setEditing(transaction)}>
                        <IconChip icon={categoryIcon(row?.icon ?? '')} colour={row?.colour ?? ''} />
                        <span className={styles.text}>
                          <span className={styles.name}>{row?.name ?? 'Category'}</span>
                          {transaction.note && <span className={styles.note}>{transaction.note}</span>}
                        </span>
                        <span className={`${styles.amount} num`}>{formatMoney(transaction.amount, me.currency)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </section>
        ))
      )}

      {editing && <EditTransactionSheet transaction={editing} summary={summary} onClose={() => setEditing(null)} />}
    </div>
  )
}
