import { Check, SearchX, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { CategoryType, CycleSummary, EditTransactionRequest, Transaction } from '../../api/types'
import { todayIn } from '../../format/dates'
import { enqueue } from '../../offline/outbox'
import { Button } from '../../ui/Button'
import { categoryIcon } from '../../ui/categoryIcons'
import { Dialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/EmptyState'
import { Field } from '../../ui/Field'
import { IconChip } from '../../ui/IconChip'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import { useCurrentCycle } from '../home/useCurrentCycle'
import styles from './AddTransactionSheet.module.css'
import { Keypad } from './Keypad'
import { amountOf, press, textOf } from './amountInput'

const TYPES = [
  { value: 'Debit', label: 'Spending' },
  { value: 'Credit', label: 'Income' },
] as const

// Per device and per type: a convenience, so it is not stored on the server.
const lastUsedKey = (type: CategoryType) => `budget.lastCategory.${type}`
const readLastUsed = (type: CategoryType) => {
  try {
    return localStorage.getItem(lastUsedKey(type))
  } catch {
    return null
  }
}

type Props = { open: boolean; onClose: () => void }

// A new transaction goes into the current cycle (story "Transactions 3"). The form is its own component so that it
// unmounts with the sheet: every open starts from a blank entry.
export function AddTransactionSheet({ open, onClose }: Props) {
  return open ? <AddToCurrentCycle onClose={onClose} /> : null
}

function AddToCurrentCycle({ onClose }: { onClose: () => void }) {
  const current = useCurrentCycle()
  // One Form, and so one dialog, through loading and loaded: swapping sheets would replay the slide-up every time.
  return <Form summary={current.data ?? null} loading={current.isPending} onClose={onClose} />
}

// The same sheet, filled in, for a transaction of any cycle. `summary` is that transaction's own cycle, because a past
// cycle has its own categories.
export function EditTransactionSheet({ transaction, summary, onClose }: { transaction: Transaction; summary: CycleSummary; onClose: () => void }) {
  return <Form summary={summary} loading={false} editing={transaction} onClose={onClose} />
}

function Form({ summary, loading, editing, onClose }: { summary: CycleSummary | null; loading: boolean; editing?: Transaction; onClose: () => void }) {
  const { me } = useSession()
  const toast = useToast()
  // Transactions need a Confirmed cycle (CLAUDE.md). Said plainly in the sheet rather than left to fail on Save.
  const ready = summary?.cycle.status === 'Confirmed'
  const cycleId = summary?.cycle.id ?? ''

  const [type, setType] = useState<CategoryType>(() => summary?.rollup.categories.find((row) => row.categoryId === editing?.categoryId)?.type ?? 'Debit')
  const [text, setText] = useState(() => (editing ? textOf(Math.abs(editing.amount)) : ''))
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null)
  const [date, setDate] = useState(() => editing?.occurredOn ?? todayIn(me.timeZone))
  const [noteOpen, setNoteOpen] = useState(Boolean(editing?.note))
  const [note, setNote] = useState(editing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const categories = useMemo(() => {
    const lastUsed = readLastUsed(type)
    const ofType = (summary?.rollup.categories ?? []).filter((row) => row.type === type)
    // Last used first, then the cycle's own order.
    return [...ofType.filter((row) => row.categoryId === lastUsed), ...ofType.filter((row) => row.categoryId !== lastUsed)]
  }, [summary, type])
  const matches = categories.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()))

  // A negative amount is a reversal. The keypad has no minus key, so a reversal keeps its sign while it is edited.
  // ponytail: a reversal cannot be entered from here, only kept. Add a +/- key if reversals turn out to be entered by hand.
  const sign = editing && editing.amount < 0 ? -1 : 1
  const amount = sign * amountOf(text)
  const symbol = useMemo(
    () => new Intl.NumberFormat('en-AU', { style: 'currency', currency: me.currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? '',
    [me.currency],
  )
  const before = editing && { cycleId, categoryId: editing.categoryId, amount: editing.amount }

  // Into the outbox, never straight to the API: the change is on screen at once and reaches the server when it can.
  async function save() {
    if (!ready || !categoryId || amount === 0 || !date) {
      return
    }
    setSaving(true)
    const trimmed = note.trim() || null

    if (editing) {
      // Only what changed is sent: an edit is last-write-wins per field, so an untouched field must not be overwritten.
      const edit: EditTransactionRequest = {}
      if (amount !== editing.amount) edit.amount = amount
      if (categoryId !== editing.categoryId) edit.categoryId = categoryId
      if (date !== editing.occurredOn) edit.occurredOn = date
      if (trimmed !== editing.note) edit.note = trimmed ?? ''
      if (Object.keys(edit).length > 0) {
        await enqueue({ type: 'transaction.edit', clientId: editing.clientId, edit }, before)
        navigator.vibrate?.(10)
        toast.show({ message: 'Saved' })
      }
      return onClose()
    }

    const clientId = crypto.randomUUID()
    // It carries the cycle it was entered against, so a rollover while offline does not move it.
    await enqueue({ type: 'transaction.create', create: { clientId, cycleId, categoryId, amount, occurredOn: date, note: trimmed } })
    try {
      localStorage.setItem(lastUsedKey(type), categoryId)
    } catch {
      // Private mode: the list just keeps the cycle's order.
    }
    navigator.vibrate?.(10)
    onClose()
    toast.show({
      message: 'Saved',
      action: { label: 'Undo', onAction: () => void enqueue({ type: 'transaction.delete', clientId }, { cycleId, categoryId, amount }) },
    })
  }

  async function remove() {
    if (!editing) {
      return
    }
    await enqueue({ type: 'transaction.delete', clientId: editing.clientId }, before)
    navigator.vibrate?.(10)
    onClose()
    toast.show({ message: 'Deleted' })
  }

  // A hardware keyboard types into the amount too, unless the focus is in a real field.
  function onKeyDown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement && event.target.type !== 'radio') {
      return
    }
    if (/^[\d.]$/.test(event.key) || event.key === 'Backspace') {
      setText((now) => press(now, event.key === 'Backspace' ? 'back' : event.key))
    }
  }

  return (
    <Sheet
      open
      title={editing ? 'Edit transaction' : 'Add transaction'}
      onClose={onClose}
      footer={
        ready && (
          <Button fullWidth pending={saving} disabled={amount === 0 || !categoryId || !date} onClick={save}>
            Save
          </Button>
        )
      }
    >
      {loading && (
        <div aria-busy="true" className={styles.form}>
          <span className="visually-hidden">Loading</span>
          <Skeleton height="3rem" />
          <Skeleton height="15.5rem" />
        </div>
      )}
      {!loading && !ready && <EmptyState icon={ShieldCheck}>Confirm your budget before adding transactions.</EmptyState>}

      {/* The key listener serves the whole form; the div is not itself a control. */}
      <div className={styles.form} onKeyDown={onKeyDown} hidden={!ready}>
        <SegmentedControl
          label="Type"
          options={TYPES}
          value={type}
          onChange={(next) => {
            setType(next)
            setCategoryId(null)
          }}
        />

        <p aria-label="Amount" className={`${styles.amount} num`}>
          {sign < 0 && '−'}
          <span className={styles.symbol}>{symbol}</span>
          {text || '0'}
        </p>
        <Keypad onKey={(key) => setText((now) => press(now, key))} />

        <div className={styles.picker}>
          <Field label="Search categories" type="search" value={search} onChange={(event) => setSearch(event.target.value)} enterKeyHint="search" />
          {matches.length === 0 ? (
            <EmptyState icon={SearchX}>{search.trim() ? `No category matches "${search.trim()}".` : `This cycle has no ${type === 'Debit' ? 'spending' : 'income'} categories.`}</EmptyState>
          ) : (
            <div role="radiogroup" aria-label="Category" className={styles.categories}>
              {matches.map((row) => (
                <label key={row.categoryId} className={styles.category}>
                  <input type="radio" name="category" className={styles.radio} checked={row.categoryId === categoryId} onChange={() => setCategoryId(row.categoryId)} />
                  <IconChip icon={categoryIcon(row.icon)} colour={row.colour} />
                  <span className={styles.categoryName}>{row.name}</span>
                  <Check aria-hidden="true" className={styles.check} />
                </label>
              ))}
            </div>
          )}
        </div>

        <Field label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        {!editing?.note && (
          <Button variant="ghost" aria-expanded={noteOpen} onClick={() => setNoteOpen((now) => !now)}>
            Add note
          </Button>
        )}
        {noteOpen && <Field label="Note" value={note} maxLength={me.isDemo ? 200 : 280} onChange={(event) => setNote(event.target.value)} />}

        {editing && (
          <Button variant="destructive" icon={Trash2} onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {/* Inside the sheet so that it stacks above it: both are modal dialogs. Safe choice on the left (MASTER 9). */}
      <Dialog
        open={confirmingDelete}
        title="Delete this transaction?"
        onClose={() => setConfirmingDelete(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </>
        }
      >
        It will be removed from this cycle's totals.
      </Dialog>
    </Sheet>
  )
}
