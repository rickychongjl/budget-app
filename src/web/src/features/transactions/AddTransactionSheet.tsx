import { Check, ChevronDown, SearchX, ShieldCheck, Star, Trash2 } from 'lucide-react'
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { CategoryRollup, CategoryType, CycleSummary, EditTransactionRequest, Transaction } from '../../api/types'
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
import { toSlot } from '../../ui/slots'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import { readFavourites } from '../categories/favourites'
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

// How often each category was picked on this device, by id: orders the chips after the pinned ones. Same footing as
// the last-used key above.
const USES_KEY = 'budget.categoryUses'
const readUses = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(USES_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

// Enough for the usual picks to be one tap, few enough to sit in two rows above the keypad at 360px.
const CHIPS = 6

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
  const [note, setNote] = useState(editing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Read once, when the sheet opens: pinning happens on the Categories screen, never while this sheet is up.
  const [favourites] = useState(readFavourites)
  const [uses] = useState(readUses)
  const [more, setMore] = useState(false)

  const ofType = useMemo(() => (summary?.rollup.categories ?? []).filter((row) => row.type === type), [summary, type])

  // Pinned categories lead, in the order they were pinned. A pin remembers an id, not a cycle, and the ids are this
  // cycle's own rows, so a pin left over from a removed category simply matches nothing.
  const pinned = useMemo(() => favourites.flatMap((id) => ofType.find((row) => row.categoryId === id) ?? []), [ofType, favourites])
  const unpinned = useMemo(() => ofType.filter((row) => !favourites.includes(row.categoryId)), [ofType, favourites])

  // The full list behind More: last used first, then the cycle's own order.
  const rest = useMemo(() => {
    const lastUsed = readLastUsed(type)
    return [...unpinned.filter((row) => row.categoryId === lastUsed), ...unpinned.filter((row) => row.categoryId !== lastUsed)]
  }, [unpinned, type])

  // The chips: pinned, then most used, then the cycle's own order (the sort is stable, so equal counts keep it).
  const top = useMemo(
    () => [...pinned, ...unpinned.toSorted((a, b) => (Number(uses[b.categoryId]) || 0) - (Number(uses[a.categoryId]) || 0))].slice(0, CHIPS),
    [pinned, unpinned, uses],
  )
  // A pick from More, or the category being edited, stays in view as the selected chip.
  const picked = ofType.find((row) => row.categoryId === categoryId)
  const chips = picked && !top.includes(picked) ? [...top, picked] : top

  const searchTerm = search.trim().toLowerCase()
  const matching = (rows: CategoryRollup[]) => rows.filter((row) => row.name.toLowerCase().includes(searchTerm))
  const pinnedMatches = matching(pinned)
  const restMatches = matching(rest)
  const matches = [...pinnedMatches, ...restMatches]

  // A negative amount is a reversal. The keypad has no minus key, so a reversal keeps its sign while it is edited.
  // ponytail: a reversal cannot be entered from here, only kept. Add a +/- key if reversals turn out to be entered by hand.
  const sign = editing && editing.amount < 0 ? -1 : 1
  const amount = sign * amountOf(text)
  const symbol = useMemo(
    () => new Intl.NumberFormat('en-AU', { style: 'currency', currency: me.currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? '',
    [me.currency],
  )
  const before = editing && { cycleId, categoryId: editing.categoryId, amount: editing.amount }

  // The bare icon in the category's slot colour, not the 40px icon chip, so that six fit in two or three rows at 360px.
  // When selected the tick takes the icon's place: the pill keeps its width and nothing rewraps under the finger.
  const chip = (row: CategoryRollup) => {
    const Icon = categoryIcon(row.icon)
    return (
      <label key={row.categoryId} className={styles.chip} style={{ '--chip': `var(--cat-${toSlot(row.colour)})` } as CSSProperties}>
        <input type="radio" name="category" className={styles.radio} checked={row.categoryId === categoryId} onChange={() => setCategoryId(row.categoryId)} />
        <Icon aria-hidden="true" className={styles.chipIcon} />
        <Check aria-hidden="true" className={styles.chipTick} />
        <span className={styles.chipName}>{row.name}</span>
      </label>
    )
  }

  const categoryRow = (row: CategoryRollup) => (
    <label key={row.categoryId} className={styles.category}>
      <input
        type="radio"
        name="category-all"
        className={styles.radio}
        checked={row.categoryId === categoryId}
        onChange={() => {
          setCategoryId(row.categoryId)
          setMore(false)
          setSearch('')
        }}
      />
      <IconChip icon={categoryIcon(row.icon)} colour={row.colour} />
      <span className={styles.categoryName}>{row.name}</span>
      {favourites.includes(row.categoryId) && <Star aria-hidden="true" className={styles.star} />}
      <Check aria-hidden="true" className={styles.check} />
    </label>
  )

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
      const now = readUses()
      localStorage.setItem(USES_KEY, JSON.stringify({ ...now, [categoryId]: (Number(now[categoryId]) || 0) + 1 }))
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

        {/* Above the keypad, so the usual entry is amount, one tap, Save, with nothing to scroll (MASTER 9). */}
        {ofType.length === 0 ? (
          <EmptyState icon={SearchX}>{`This cycle has no ${type === 'Debit' ? 'spending' : 'income'} categories.`}</EmptyState>
        ) : (
          <div role="radiogroup" aria-label="Category" className={styles.chips}>
            {chips.map(chip)}
            {ofType.length > top.length && (
              <button type="button" className={styles.chip} aria-expanded={more} onClick={() => setMore((open) => !open)}>
                <span className={styles.chipName}>More</span>
                <ChevronDown aria-hidden="true" className={styles.chevron} />
              </button>
            )}
          </div>
        )}

        {more && (
          <div className={styles.picker}>
            <Field label="Search categories" type="search" value={search} onChange={(event) => setSearch(event.target.value)} enterKeyHint="search" />
            {matches.length === 0 ? (
              <EmptyState icon={SearchX}>{`No category matches "${search.trim()}".`}</EmptyState>
            ) : (
              <div role="radiogroup" aria-label="All categories" className={styles.categories}>
                {pinnedMatches.length > 0 && <p className={styles.groupLabel}>Favourites</p>}
                {pinnedMatches.map(categoryRow)}
                {pinnedMatches.length > 0 && restMatches.length > 0 && <p className={styles.groupLabel}>All categories</p>}
                {restMatches.map(categoryRow)}
              </div>
            )}
          </div>
        )}

        <Keypad onKey={(key) => setText((now) => press(now, key))} />

        <Field label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        {/* Always on screen (MASTER 9): optional, not hidden behind a button. Full width rather than beside the date,
            so a note has room to be read back while it is typed. */}
        <Field label="Note" value={note} maxLength={me.isDemo ? 200 : 280} onChange={(event) => setNote(event.target.value)} />

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
