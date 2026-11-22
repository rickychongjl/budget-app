import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, CircleAlert, Star, Trash2 } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
import { api } from '../../api/client'
import type { CategoryRollup, CategoryType, EditCategoryRequest } from '../../api/types'
import { todayIn } from '../../format/dates'
import { formatMoney, parseMoney } from '../../format/money'
import { enqueue } from '../../offline/outbox'
import { Button } from '../../ui/Button'
import { CATEGORY_ICONS } from '../../ui/categoryIcons'
import { Dialog } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Sheet } from '../../ui/Sheet'
import { SLOTS, toSlot } from '../../ui/slots'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import { useCycle } from '../cycles/useCycle'
import { useTransactions } from '../transactions/useTransactions'
import styles from './CategorySheet.module.css'
import { isFavourite, toggleFavourite } from './favourites'

const TYPES = [
  { value: 'Debit', label: 'Spending' },
  { value: 'Credit', label: 'Income' },
] as const

const SPENT = [
  { value: 'spread', label: 'Over the cycle' },
  { value: 'once', label: 'In one go' },
] as const

type Props = {
  cycleId: string
  // Every category in the cycle: for the next unused colour and the end of the sort order.
  rows: CategoryRollup[]
  // Absent when adding.
  editing?: CategoryRollup
  online: boolean
  onClose: () => void
}

// Editing works offline through the outbox and is last-write-wins per field. Adding and removing go straight to the
// API: a new category has no server id for queued transactions to point at, and "only if it has no transactions"
// cannot be checked against a queue the server has not seen (design section 7).
export function CategorySheet({ cycleId, rows, editing, online, onClose }: Props) {
  const client = useQueryClient()
  const toast = useToast()
  const nameField = useRef<HTMLInputElement>(null)
  const budgetField = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<CategoryType>(editing?.type ?? 'Debit')
  const [name, setName] = useState(editing?.name ?? '')
  const [budget, setBudget] = useState(editing ? editing.budgeted.toFixed(2) : '')
  const [icon, setIcon] = useState(editing?.icon ?? 'tag')
  const [spent, setSpent] = useState<'spread' | 'once'>(editing?.spreadEvenly === false ? 'once' : 'spread')
  // Whether the person touched "How is it spent?". An answer that leaves spreadEvenly out must not be read as
  // "it is a spread cost", which would turn a bill into one the moment anything else on the sheet was saved.
  const [spentEdited, setSpentEdited] = useState(false)
  const [autoPay, setAutoPay] = useState(editing?.autoPay ?? false)
  // Only a spending bill paid in one go can be auto-paid (the server refuses anything else), so moving it back to
  // "Over the cycle" switches auto-pay off with it.
  const autoPaid = type === 'Debit' && spent === 'once' && autoPay
  // Rollover pays from the next cycle on. Turning auto-pay on in the current one offers to pay it too, but only for a
  // bill with no transactions there yet. The list is read while the toggle is on, so it is to hand by Save; offline
  // with nothing stored, nobody is asked.
  const { me } = useSession()
  const cycle = useCycle(cycleId).data?.cycle
  const offerPay = autoPaid && !editing?.autoPay && cycle?.phase === 'Current' && cycle.status === 'Confirmed'
  const transactions = useTransactions(cycleId, { enabled: offerPay && editing !== undefined })
  const [paying, setPaying] = useState<{ categoryId: string; amount: number }>()
  // A new category takes the next unused slot; after eight they repeat and the icon tells them apart (MASTER 3.4).
  const [colour, setColour] = useState<string>(() => (editing ? toSlot(editing.colour) : (SLOTS.find((slot) => !rows.some((row) => row.colour === slot)) ?? SLOTS[rows.length % SLOTS.length])))
  const [errors, setErrors] = useState<{ name?: string; budget?: string }>({})
  const [problem, setProblem] = useState<string>()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  // Per device, not per cycle: pinning is instant and never queued, so it needs no Save and works offline.
  const [favourite, setFavourite] = useState(() => (editing ? isFavourite(editing.categoryId) : false))

  const done = async () => {
    await client.invalidateQueries({ queryKey: ['cycles'] })
    onClose()
  }
  const add = useMutation({
    mutationFn: (budgetAmount: number) =>
      api.post<{ categoryId: string }>(`/api/cycles/${cycleId}/categories`, {
        type,
        name: name.trim(),
        icon,
        colour,
        sortOrder: rows.length,
        budgetAmount,
        // Income has no pace, so it is not asked and not sent.
        ...(type === 'Debit' && { spreadEvenly: spent === 'spread', autoPay: autoPaid }),
      }),
    // A new category has no transactions, so the only question is whether to pay this cycle.
    onSuccess: async ({ categoryId }, budgetAmount) => (offerPay && budgetAmount > 0 ? setPaying({ categoryId, amount: budgetAmount }) : done()),
    onError: (error: Error) => setProblem(error.message),
  })
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/cycles/${cycleId}/categories/${editing!.categoryId}`),
    onSuccess: async () => {
      navigator.vibrate?.(10)
      toast.show({ message: 'Removed from this cycle' })
      await done()
    },
    onError: (error: Error) => {
      setConfirmingRemove(false)
      setProblem(error.message)
    },
  })

  async function save() {
    const budgetAmount = parseMoney(budget)
    const found = {
      name: name.trim() ? undefined : 'Give the category a name.',
      budget: budgetAmount === null ? `Enter an amount, like ${(editing?.budgeted ?? 100).toFixed(2)}` : budgetAmount < 0 ? 'A budget cannot be negative.' : undefined,
    }
    setErrors(found)
    // Focus goes to the first field that is wrong; the messages stay until fixed (MASTER 9).
    if (found.name) return nameField.current?.focus()
    if (found.budget || budgetAmount === null) return budgetField.current?.focus()
    setProblem(undefined)

    if (!editing) {
      return add.mutate(budgetAmount)
    }

    // Only what changed: an edit is last-write-wins per field, so an untouched field must not be overwritten.
    const category: EditCategoryRequest = {}
    if (name.trim() !== editing.name) category.name = name.trim()
    if (budgetAmount !== editing.budgeted) category.budgetAmount = budgetAmount
    if (icon !== editing.icon) category.icon = icon
    if (colour !== editing.colour) category.colour = colour
    if (type === 'Debit' && spentEdited && (spent === 'spread') !== editing.spreadEvenly) category.spreadEvenly = spent === 'spread'
    if (autoPaid !== (editing.autoPay ?? false)) category.autoPay = autoPaid
    if (Object.keys(category).length > 0) {
      await enqueue({ type: 'category.edit', cycleId, categoryId: editing.categoryId, category })
      toast.show({ message: 'Saved' })
    }
    if (offerPay && budgetAmount > 0 && transactions.data && !transactions.data.some((t) => t.categoryId === editing.categoryId)) {
      return setPaying({ categoryId: editing.categoryId, amount: budgetAmount })
    }
    onClose()
  }

  // An ordinary queued transaction, like one typed in, so it works offline and can be edited or deleted.
  async function payThisCycle() {
    await enqueue({ type: 'transaction.create', create: { clientId: crypto.randomUUID(), cycleId, categoryId: paying!.categoryId, amount: paying!.amount, occurredOn: todayIn(me.timeZone), note: 'Auto-paid' } })
    await done()
  }

  const title = editing ? `Edit ${editing.name}` : 'Add category'

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      footer={
        <Button fullWidth pending={add.isPending} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className={styles.form}>
        {problem && (
          <p role="alert" className={styles.problem}>
            <CircleAlert aria-hidden="true" className={styles.problemIcon} />
            {problem}
          </p>
        )}

        {/* Debit or credit is fixed for the life of the category, so it is only asked when adding. */}
        {!editing && <SegmentedControl label="Type" options={TYPES} value={type} onChange={setType} />}

        <Field ref={nameField} label="Name" value={name} maxLength={60} error={errors.name} onChange={(event) => setName(event.target.value)} />
        <Field
          ref={budgetField}
          label="Budget"
          inputMode="decimal"
          value={budget}
          error={errors.budget}
          hint={type === 'Debit' ? 'The most you plan to spend this cycle.' : 'What you expect to receive this cycle.'}
          onChange={(event) => setBudget(event.target.value)}
        />

        {type === 'Debit' && (
          <div className={styles.group}>
            {/* Drawn as well as announced: the segments alone ("In one go") do not say what is being asked. */}
            <p className={styles.legend} aria-hidden="true">
              How is it spent?
            </p>
            <SegmentedControl label="How is it spent?" options={SPENT} value={spent} onChange={(next) => {
              setSpent(next)
              setSpentEdited(true)
            }} />
            <p className={styles.hint}>{spent === 'spread' ? 'Home says when spending runs ahead of the days gone.' : 'A bill paid in one go is never ahead of pace.'}</p>
          </div>
        )}

        {type === 'Debit' && spent === 'once' && (
          <div className={styles.group}>
            {/* A toggle like Favourite: the label stays, the pressed state changes (MASTER 9). */}
            <Button variant="secondary" icon={CalendarCheck} aria-pressed={autoPay} onClick={() => setAutoPay(!autoPay)}>
              Mark as paid when a new cycle starts
            </Button>
            <p className={styles.hint}>Adds the full budget as paid on the first day of each new cycle. Edit it if the bill differs.</p>
          </div>
        )}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Colour</legend>
          <div className={styles.swatches}>
            {SLOTS.map((slot) => (
              <label key={slot} className={styles.swatch} style={{ '--chip': `var(--cat-${slot})` } as CSSProperties}>
                <input type="radio" name="colour" className={styles.radio} aria-label={slot} checked={colour === slot} onChange={() => setColour(slot)} />
                <span className={styles.dot} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Icon</legend>
          <div className={styles.icons}>
            {Object.entries(CATEGORY_ICONS).map(([iconName, Icon]) => (
              <label key={iconName} className={styles.iconChoice}>
                <input type="radio" name="icon" className={styles.radio} aria-label={iconName} checked={icon === iconName} onChange={() => setIcon(iconName)} />
                <Icon aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>

        {editing && (
          <div className={styles.group}>
            {/* A toggle, so it is announced as one; the label never changes, the pressed state does (MASTER 9). */}
            <Button variant="secondary" icon={Star} aria-pressed={favourite} onClick={() => setFavourite(toggleFavourite(editing.categoryId).includes(editing.categoryId))}>
              Favourite
            </Button>
            <p className={styles.hint}>Listed first when you add a transaction. Saved on this device.</p>
          </div>
        )}

        {editing && (
          <>
            <Button variant="destructive" icon={Trash2} disabled={!online} onClick={() => setConfirmingRemove(true)}>
              Remove from this cycle
            </Button>
            {!online && <p className={styles.reason}>Removing a category needs a connection.</p>}
          </>
        )}
      </div>

      <Dialog
        open={confirmingRemove}
        title={`Remove ${editing?.name}?`}
        onClose={() => setConfirmingRemove(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" pending={remove.isPending} onClick={() => remove.mutate()}>
              Remove
            </Button>
          </>
        }
      >
        It is removed from this cycle only. A category with transactions in this cycle cannot be removed.
      </Dialog>

      <Dialog
        open={paying !== undefined}
        title={`Mark ${name.trim()} as paid for this cycle too?`}
        onClose={() => void done()}
        actions={
          <>
            <Button variant="secondary" onClick={() => void done()}>
              Not now
            </Button>
            <Button onClick={() => void payThisCycle()}>Mark as paid</Button>
          </>
        }
      >
        From the next cycle it is paid when the cycle starts. This adds {formatMoney(paying?.amount ?? 0, me.currency)} as paid today.
      </Dialog>
    </Sheet>
  )
}
