import { ArrowDown, ArrowUp, CloudOff, Plus, Shapes } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client'
import type { CategoryRollup, CategoryType, Cycle } from '../../api/types'
import { formatRange, todayIn } from '../../format/dates'
import { formatMoney } from '../../format/money'
import { enqueue } from '../../offline/outbox'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { Screen } from '../../shell/Screen'
import { useOnline } from '../../shell/useOnline'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { categoryIcon } from '../../ui/categoryIcons'
import { EmptyState } from '../../ui/EmptyState'
import { IconChip } from '../../ui/IconChip'
import { Skeleton } from '../../ui/Skeleton'
import { useSession } from '../auth/useSession'
import { useCycle } from '../cycles/useCycle'
import styles from './Categories.module.css'
import { CategorySheet } from './CategorySheet'

// /settings/categories. Categories and budgets are a snapshot of one cycle (story "Settings 7"), so the screen is always
// about one cycle: the current one, or an upcoming one. A past cycle's are read-only and are not offered.
export function Categories() {
  const { me } = useSession()
  const online = useOnline()
  const today = todayIn(me.timeZone)
  const cycles = useCachedQuery<Cycle[]>(['cycles', 'list'], () => api.get<Cycle[]>('/api/cycles'))
  const editable = (cycles.data ?? []).filter((cycle) => cycle.phase !== 'Past')
  const [chosen, setChosen] = useState<string>()
  const cycleId = chosen ?? editable.find((cycle) => cycle.phase === 'Current')?.id ?? editable[0]?.id

  if (cycles.isError) {
    return (
      <Screen title="Categories" back>
        <EmptyState icon={CloudOff} action={<Button onClick={() => cycles.refetch()}>Try again</Button>}>
          Couldn't load your cycles.
        </EmptyState>
      </Screen>
    )
  }

  if (!cycles.data) {
    return (
      <Screen title="Categories" back>
        <Skeleton height="12rem" />
      </Screen>
    )
  }

  if (!cycleId) {
    return (
      <Screen title="Categories" back>
        <EmptyState icon={Shapes}>Set up your first cycle to add categories.</EmptyState>
      </Screen>
    )
  }

  return (
    <CycleCategories
      key={cycleId}
      cycleId={cycleId}
      online={online}
      picker={
        <label className={styles.picker}>
          <span className={styles.pickerLabel}>Cycle</span>
          {/* The platform's own picker: on a phone it is a wheel in thumb reach, for free. */}
          <select className={styles.select} value={cycleId} onChange={(event) => setChosen(event.target.value)}>
            {editable.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {formatRange(cycle.startDate, cycle.endDate, today)}
                {cycle.phase === 'Current' ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
      }
    />
  )
}

function CycleCategories({ cycleId, online, picker }: { cycleId: string; online: boolean; picker: React.ReactNode }) {
  return (
    <Screen title="Categories" back>
      {picker}
      <CategoryList cycleId={cycleId} online={online} />
    </Screen>
  )
}

// One cycle's categories: edit, reorder, add, remove. Onboarding uses it too, against the draft cycle.
export function CategoryList({ cycleId, online }: { cycleId: string; online: boolean }) {
  const { me } = useSession()
  const cycle = useCycle(cycleId)
  const [editing, setEditing] = useState<CategoryRollup | 'new' | null>(null)
  const rows = cycle.data?.rollup.categories ?? []

  // The rollup is in sort order but does not carry the numbers, so a move renumbers the whole cycle to its new order.
  // That is exact whatever the stored values were. Through the outbox: reordering works offline (design section 7).
  // ponytail: one queued edit per category per move (at most 20). Send only the rows whose number changed once the
  // API returns sortOrder.
  async function move(row: CategoryRollup, by: -1 | 1) {
    const sameType = rows.filter((other) => other.type === row.type)
    const neighbour = sameType[sameType.indexOf(row) + by]
    const order = [...rows]
    const from = order.indexOf(row)
    const to = order.indexOf(neighbour)
    ;[order[from], order[to]] = [order[to], order[from]]
    for (const [sortOrder, category] of order.entries()) {
      await enqueue({ type: 'category.edit', cycleId, categoryId: category.categoryId, category: { sortOrder } })
    }
  }

  return (
    <>
      {cycle.isError && (
        <EmptyState icon={CloudOff} action={<Button onClick={() => cycle.refetch()}>Try again</Button>}>
          Couldn't load this cycle's categories.
        </EmptyState>
      )}
      {!cycle.data && !cycle.isError && <Skeleton height="12rem" />}
      {cycle.data && rows.length === 0 && <EmptyState icon={Shapes}>No categories in this cycle yet.</EmptyState>}

      {(['Debit', 'Credit'] as CategoryType[]).map((type) => {
        const ofType = rows.filter((row) => row.type === type)
        const title = type === 'Debit' ? 'Spending' : 'Income'
        return ofType.length === 0 ? null : (
          <section key={type} aria-labelledby={`categories-${type}`} className={styles.section}>
            <h2 id={`categories-${type}`} className={styles.sectionTitle}>
              {title}
            </h2>
            <Card>
              <ul className={styles.list}>
                {ofType.map((row, index) => (
                  <li key={row.categoryId} className={styles.row}>
                    <div className={styles.main}>
                      <IconChip icon={categoryIcon(row.icon)} colour={row.colour} />
                      <div className={styles.text}>
                        <h3 className={styles.name}>{row.name}</h3>
                        <span className={`${styles.budget} num`}>{formatMoney(row.budgeted, me.currency)}</span>
                      </div>
                      {/* Covers the chip and the text, so the whole left of the row opens the editor. */}
                      <button type="button" className={styles.edit} aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)} />
                    </div>
                    {/* Buttons, not a drag: every reorder has a button alternative, and here it is the only way. */}
                    <button type="button" className={styles.move} aria-label={`Move ${row.name} up`} disabled={index === 0} onClick={() => void move(row, -1)}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className={styles.move} aria-label={`Move ${row.name} down`} disabled={index === ofType.length - 1} onClick={() => void move(row, 1)}>
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )
      })}

      {cycle.data && (
        <Button variant="secondary" icon={Plus} disabled={!online} onClick={() => setEditing('new')}>
          Add category
        </Button>
      )}
      {/* Said plainly, not hidden and not left to fail on tap (design section 7). */}
      {!online && <p className={styles.reason}>Adding or removing a category needs a connection.</p>}

      {editing && <CategorySheet cycleId={cycleId} rows={rows} editing={editing === 'new' ? undefined : editing} online={online} onClose={() => setEditing(null)} />}
    </>
  )
}
