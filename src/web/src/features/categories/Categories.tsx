import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CloudOff, GripVertical, Plus, Shapes, Star, Trash2 } from 'lucide-react'
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
import { Dialog } from '../../ui/Dialog'
import { categoryIcon } from '../../ui/categoryIcons'
import { EmptyState } from '../../ui/EmptyState'
import { IconChip } from '../../ui/IconChip'
import { Skeleton } from '../../ui/Skeleton'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import { useCycle } from '../cycles/useCycle'
import { categoriesLeft, limitsOf } from '../plans/plan'
import { PremiumNote } from '../plans/PremiumNote'
import styles from './Categories.module.css'
import { CategorySheet } from './CategorySheet'
import { readFavourites, toggleFavourite } from './favourites'

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

// One cycle's categories: edit, pin, reorder, add, remove. Onboarding uses it too, against the draft cycle.
export function CategoryList({ cycleId, online }: { cycleId: string; online: boolean }) {
  const { me } = useSession()
  const cycle = useCycle(cycleId)
  const [editing, setEditing] = useState<CategoryRollup | 'new' | null>(null)
  const rows = cycle.data?.rollup.categories ?? []
  // The Free plan's limit is per cycle; the server refuses the next one (plan.limit.categories), this only says so first.
  // A cycle already over it (a downgraded user) keeps every row, and editing and removing them still work.
  const max = limitsOf(me).maxCategoriesPerCycle
  const full = categoriesLeft(me, rows.length) === 0

  // Per device, not per cycle: pinning is instant and never queued, so it works offline.
  const [favourites, setFavourites] = useState(readFavourites)
  // Removing goes straight to the API: "only if it has no transactions" cannot be checked against a queue the server
  // has not seen (design section 7). A refusal keeps the dialog open and says why in the server's words.
  const client = useQueryClient()
  const toast = useToast()
  const [removing, setRemoving] = useState<CategoryRollup>()
  const remove = useMutation({
    mutationFn: (row: CategoryRollup) => api.delete(`/api/cycles/${cycleId}/categories/${row.categoryId}`),
    onSuccess: async () => {
      navigator.vibrate?.(10)
      toast.show({ message: 'Removed from this cycle' })
      setRemoving(undefined)
      await client.invalidateQueries({ queryKey: ['cycles'] })
    },
  })
  const closeRemove = () => {
    setRemoving(undefined)
    remove.reset()
  }

  // A drag in progress: the dragged row and its section's order as it stands under the finger. Kept until the queued
  // edits land, so the list does not flash back to the old order in between.
  const [drag, setDrag] = useState<{ type: CategoryType; id: string; ids: string[]; dropped: boolean } | null>(null)

  // The rollup is in sort order but does not carry the numbers, so a move renumbers the whole cycle to its new order.
  // That is exact whatever the stored values were. Through the outbox: reordering works offline (design section 7).
  // ponytail: one queued edit per category per move (at most 20). Send only the rows whose number changed once the
  // API returns sortOrder.
  async function renumber(type: CategoryType, ids: string[]) {
    const queue = [...ids]
    const order = rows.map((row) => (row.type === type ? queue.shift()! : row.categoryId))
    for (const [sortOrder, categoryId] of order.entries()) {
      await enqueue({ type: 'category.edit', cycleId, categoryId, category: { sortOrder } })
    }
  }

  const idsOf = (type: CategoryType) => rows.filter((row) => row.type === type).map((row) => row.categoryId)

  function startDrag(event: React.PointerEvent<HTMLElement>, row: CategoryRollup) {
    if (drag) return
    // Captured, so the moves keep coming to the handle when the finger leaves it.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ type: row.type, id: row.categoryId, ids: idsOf(row.type), dropped: false })
  }

  // The dragged row goes after every other row whose middle is above the finger.
  function dragTo(event: React.PointerEvent<HTMLElement>) {
    if (!drag || drag.dropped) return
    const items = [...(event.currentTarget.closest('ul')?.children ?? [])]
    const others = items.filter((_, index) => drag.ids[index] !== drag.id)
    const at = others.filter((item) => {
      const box = item.getBoundingClientRect()
      return box.top + box.height / 2 < event.clientY
    }).length
    const ids = drag.ids.filter((id) => id !== drag.id)
    ids.splice(at, 0, drag.id)
    if (ids.join() !== drag.ids.join()) setDrag({ ...drag, ids })
  }

  async function drop() {
    if (!drag || drag.dropped) return
    setDrag({ ...drag, dropped: true })
    try {
      if (drag.ids.join() !== idsOf(drag.type).join()) await renumber(drag.type, drag.ids)
    } finally {
      setDrag(null)
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
        const ofType = drag?.type === type ? drag.ids.map((id) => rows.find((row) => row.categoryId === id)!) : rows.filter((row) => row.type === type)
        const title = type === 'Debit' ? 'Spending' : 'Income'
        return ofType.length === 0 ? null : (
          <section key={type} aria-labelledby={`categories-${type}`} className={styles.section}>
            <h2 id={`categories-${type}`} className={styles.sectionTitle}>
              {title}
            </h2>
            <Card>
              <ul className={styles.list}>
                {ofType.map((row) => (
                  <li key={row.categoryId} className={`${styles.row} ${drag?.id === row.categoryId ? styles.dragging : ''}`}>
                    <div className={styles.main}>
                      <IconChip icon={categoryIcon(row.icon)} colour={row.colour} />
                      <div className={styles.text}>
                        <h3 className={styles.name}>{row.name}</h3>
                        <span className={`${styles.budget} num`}>{formatMoney(row.budgeted, me.currency)}</span>
                      </div>
                      {/* Covers the chip and the text, so the whole left of the row opens the editor. */}
                      <button type="button" className={styles.edit} aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)} />
                    </div>
                    {/* A toggle: the name stays, the pressed state and the gold fill change (MASTER 9). */}
                    <button
                      type="button"
                      className={styles.action}
                      aria-label={`Favourite ${row.name}`}
                      aria-pressed={favourites.includes(row.categoryId)}
                      onClick={() => setFavourites(toggleFavourite(row.categoryId))}
                    >
                      <Star aria-hidden="true" />
                    </button>
                    <button type="button" className={`${styles.action} ${styles.remove}`} aria-label={`Remove ${row.name}`} disabled={!online} onClick={() => setRemoving(row)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                    {/* Only the handle drags, so a drag never fights the page's scrolling. Pointer only: reordering has no keyboard or
                        screen-reader way (MASTER 14 asks for a button alternative; dropped by choice, see PR #57). */}
                    <span
                      className={styles.handle}
                      aria-hidden="true"
                      data-testid={`drag ${row.name}`}
                      onPointerDown={(event) => startDrag(event, row)}
                      onPointerMove={dragTo}
                      onPointerUp={() => void drop()}
                      onPointerCancel={() => void drop()}
                    >
                      <GripVertical />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )
      })}

      {cycle.data && (
        <Button variant="secondary" icon={Plus} disabled={!online || full} onClick={() => setEditing('new')}>
          Add category
        </Button>
      )}
      {cycle.data && max !== null && !full && (
        <p className={styles.reason}>
          {rows.length} of {max} categories on the Free plan.
        </p>
      )}
      {cycle.data && max !== null && full && (
        <PremiumNote title={`Up to ${max} categories in a cycle`}>
          {rows.length > max ? `This cycle has ${rows.length}, more than the ${max} the Free plan allows.` : `This cycle has all ${max} the Free plan allows.`} Every category stays
          and can still be edited or removed. Premium has no limit.
        </PremiumNote>
      )}
      {/* Said plainly, not hidden and not left to fail on tap (design section 7). */}
      {!online && <p className={styles.reason}>Adding or removing a category needs a connection.</p>}

      {editing && <CategorySheet cycleId={cycleId} rows={rows} editing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}

      <Dialog
        open={removing !== undefined}
        title={`Remove ${removing?.name}?`}
        onClose={closeRemove}
        actions={
          <>
            <Button variant="secondary" onClick={closeRemove}>
              Cancel
            </Button>
            <Button variant="destructive" pending={remove.isPending} disabled={!online} onClick={() => remove.mutate(removing!)}>
              Remove
            </Button>
          </>
        }
      >
        {remove.error ? (
          <span role="alert" className={styles.problem}>
            <CircleAlert aria-hidden="true" className={styles.problemIcon} />
            {remove.error.message}
          </span>
        ) : (
          'It is removed from this cycle only. A category with transactions in this cycle cannot be removed.'
        )}
      </Dialog>
    </>
  )
}
