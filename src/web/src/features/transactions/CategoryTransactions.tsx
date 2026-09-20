import { ChevronRight, CloudOff, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import type { Transaction } from '../../api/types'
import { formatDate, todayIn } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { Screen } from '../../shell/Screen'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Skeleton } from '../../ui/Skeleton'
import { useSession } from '../auth/useSession'
import { useCycle } from '../cycles/useCycle'
import { EditTransactionSheet } from './AddTransactionSheet'
import styles from './CategoryTransactions.module.css'
import { useTransactions } from './useTransactions'

// /cycles/:cycleId/categories/:categoryId. Reached by tapping a category row on Home or on a cycle's page; works for a
// past cycle too, which is where a forgotten transaction gets added, edited or deleted (story "Transactions 4").
export function CategoryTransactions() {
  const { cycleId = '', categoryId = '' } = useParams()
  const { me } = useSession()
  const cycle = useCycle(cycleId)
  const transactions = useTransactions(cycleId)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const category = cycle.data?.rollup.categories.find((row) => row.categoryId === categoryId)
  const title = category?.name ?? 'Transactions'

  if (cycle.isError || transactions.isError) {
    return (
      <Screen title={title} back>
        <EmptyState icon={CloudOff} action={<Button onClick={() => void Promise.all([cycle.refetch(), transactions.refetch()])}>Try again</Button>}>
          Couldn't load these transactions.
        </EmptyState>
      </Screen>
    )
  }

  if (!cycle.data || !transactions.data) {
    return (
      <Screen title={title} back>
        <Card>
          <div className={styles.list} aria-busy="true">
            <span className="visually-hidden">Loading</span>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} height="2.75rem" />
            ))}
          </div>
        </Card>
      </Screen>
    )
  }

  const today = todayIn(me.timeZone)
  const rows = transactions.data.filter((transaction) => transaction.categoryId === categoryId)

  return (
    <Screen title={title} back>
      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText}>No transactions in {title} this cycle.</EmptyState>
      ) : (
        <Card>
          <ul className={styles.list}>
            {rows.map((transaction) => (
              <li key={transaction.clientId}>
                {/* Edit and delete are reached by tapping the row; there are no swipe actions (MASTER 9, Gestures). */}
                <button type="button" className={styles.row} onClick={() => setEditing(transaction)}>
                  <span className={styles.text}>
                    <span className={styles.date}>{formatDate(transaction.occurredOn, today)}</span>
                    {transaction.note && <span className={styles.note}>{transaction.note}</span>}
                  </span>
                  <span className={`${styles.amount} num`}>{formatMoney(transaction.amount, me.currency)}</span>
                  <ChevronRight aria-hidden="true" className={styles.chevron} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && <EditTransactionSheet transaction={editing} summary={cycle.data} onClose={() => setEditing(null)} />}
    </Screen>
  )
}
