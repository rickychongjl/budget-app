import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CloudOff, Shapes } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { api } from '../../api/client'
import type { Cycle } from '../../api/types'
import { formatRange, todayIn } from '../../format/dates'
import { formatMoney, parseMoney } from '../../format/money'
import { Screen } from '../../shell/Screen'
import { useOnline } from '../../shell/useOnline'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Field } from '../../ui/Field'
import { Skeleton } from '../../ui/Skeleton'
import { StatusBadge } from '../../ui/StatusBadge'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import { CategorySection } from '../home/Home'
import { Accrued } from './Accrued'
import styles from './Cycles.module.css'
import { useCycle } from './useCycle'

// /cycles/:id. Home's body for any cycle (story "Reporting 2"), plus its balances. A past cycle's categories, budgets,
// start date and opening balance are read-only; its closing balance and its transactions are not.
export function CycleDetail() {
  const { id = '' } = useParams()
  const { me } = useSession()
  const cycle = useCycle(id)
  const today = todayIn(me.timeZone)

  if (cycle.isError) {
    return (
      <Screen title="Cycle" back>
        <EmptyState icon={CloudOff} action={<Button onClick={() => cycle.refetch()}>Try again</Button>}>
          Couldn't load this cycle.
        </EmptyState>
      </Screen>
    )
  }

  if (!cycle.data) {
    return (
      <Screen title="Cycle" back>
        <div className={styles.header} aria-busy="true">
          <span className="visually-hidden">Loading</span>
          <Skeleton height="2.5rem" width="50%" />
          <Skeleton height="1.25rem" width="70%" />
        </div>
        <Skeleton height="12rem" />
      </Screen>
    )
  }

  const { cycle: details, rollup } = cycle.data
  const money = (amount: number) => formatMoney(amount, me.currency)

  return (
    <Screen title={formatRange(details.startDate, details.endDate, today)} back>
      <header className={styles.header}>
        {details.status === 'Draft' ? <StatusBadge>Draft</StatusBadge> : details.phase === 'Current' ? <StatusBadge tone="primary">Current</StatusBadge> : <StatusBadge>{details.phase === 'Past' ? 'Past' : 'Upcoming'}</StatusBadge>}
        <p className={`${styles.hero} num`}>{money(rollup.debitsActual)}</p>
        <p className={`${styles.sub} num`}>spent of {money(rollup.debitsBudgeted)} budgeted</p>
        <p className={`${styles.sub} num`}>
          {money(rollup.creditsActual)} received of {money(rollup.creditsBudgeted)} expected
        </p>
      </header>

      {/* Remounts when the saved value changes, so the field never shows a stale balance. */}
      <Balances key={`${details.id}:${details.closingBalance}`} cycle={details} accrued={rollup.accrued} currency={me.currency} />

      {rollup.categories.length === 0 && <EmptyState icon={Shapes}>This cycle has no categories.</EmptyState>}
      <CategorySection id="spending" title="Spending" rows={rollup.categories.filter((row) => row.type === 'Debit')} currency={me.currency} cycleId={details.id} />
      <CategorySection id="income" title="Income" rows={rollup.categories.filter((row) => row.type === 'Credit')} currency={me.currency} cycleId={details.id} />
    </Screen>
  )
}

function Balances({ cycle, accrued, currency }: { cycle: Cycle; accrued: number | null; currency: string }) {
  const client = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const field = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(cycle.closingBalance === null ? '' : cycle.closingBalance.toFixed(2))
  const [error, setError] = useState<string>()

  // Straight to the API, not through the outbox: the server moves the next cycle's opening balance with it, which a
  // queued change could not show. So it needs a connection, and says so.
  const save = useMutation({
    mutationFn: (closingBalance: number) => api.patch<Cycle>(`/api/cycles/${cycle.id}`, { closingBalance }),
    onSuccess: async () => {
      toast.show({ message: "Saved. It is now the next cycle's opening balance." })
      await client.invalidateQueries({ queryKey: ['cycles'] })
    },
    onError: (problem: Error) => setError(problem.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const amount = parseMoney(text)
    if (amount === null) {
      setError(`Enter an amount, like ${(cycle.closingBalance ?? cycle.openingBalance ?? 0).toFixed(2)}`)
      field.current?.focus()
      return
    }
    setError(undefined)
    save.mutate(amount)
  }

  return (
    <section aria-labelledby="balances" className={styles.section}>
      <h2 id="balances" className={styles.sectionTitle}>
        Balances
      </h2>
      <Card>
        <form className={styles.balances} onSubmit={submit} noValidate>
          <p className={styles.balance}>
            <span className={styles.balanceLabel}>Opening balance</span>
            <span className={`${styles.balanceValue} num`}>{cycle.openingBalance === null ? 'Not set' : formatMoney(cycle.openingBalance, currency)}</span>
          </p>

          {/* Entered once the cycle is under way or over; an upcoming cycle has nothing to close yet. */}
          {cycle.phase !== 'Future' && cycle.status === 'Confirmed' && (
            <>
              <Field
                ref={field}
                label="Closing balance"
                inputMode="decimal"
                value={text}
                error={error}
                hint="What is left in your account when the cycle ends."
                onChange={(event) => setText(event.target.value)}
              />
              <Accrued amount={accrued} currency={currency} />
              <Button type="submit" variant="secondary" pending={save.isPending} disabled={!online}>
                Save balance
              </Button>
              {!online && <p className={styles.reason}>Needs a connection.</p>}
            </>
          )}
        </form>
      </Card>
    </section>
  )
}
