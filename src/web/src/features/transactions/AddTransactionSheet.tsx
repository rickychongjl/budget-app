import { Check, SearchX, ShieldCheck } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { CategoryType } from '../../api/types'
import { todayIn } from '../../format/dates'
import { enqueue } from '../../offline/outbox'
import { Button } from '../../ui/Button'
import { categoryIcon } from '../../ui/categoryIcons'
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
import { amountOf, press } from './amountInput'

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

// The form lives in its own component so that it unmounts with the sheet: every open starts from a blank entry.
export function AddTransactionSheet({ open, onClose }: Props) {
  return open ? <Form onClose={onClose} /> : null
}

function Form({ onClose }: { onClose: () => void }) {
  const { me } = useSession()
  const current = useCurrentCycle()
  const toast = useToast()
  const amountId = useId()

  const [type, setType] = useState<CategoryType>('Debit')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(() => todayIn(me.timeZone))
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const summary = current.data
  const categories = useMemo(() => {
    const lastUsed = readLastUsed(type)
    const ofType = (summary?.rollup.categories ?? []).filter((row) => row.type === type)
    // Last used first, then the cycle's own order.
    return [...ofType.filter((row) => row.categoryId === lastUsed), ...ofType.filter((row) => row.categoryId !== lastUsed)]
  }, [summary, type])
  const matches = categories.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()))

  const amount = amountOf(text)
  const symbol = useMemo(
    () => new Intl.NumberFormat('en-AU', { style: 'currency', currency: me.currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? '',
    [me.currency],
  )

  if (current.isPending) {
    return (
      <Sheet open title="Add transaction" onClose={onClose}>
        <div aria-busy="true" className={styles.form}>
          <span className="visually-hidden">Loading</span>
          <Skeleton height="3rem" />
          <Skeleton height="15.5rem" />
        </div>
      </Sheet>
    )
  }

  // Transactions need a Confirmed cycle (CLAUDE.md). Said plainly here rather than left to fail on Save.
  if (!summary || summary.cycle.status !== 'Confirmed') {
    return (
      <Sheet open title="Add transaction" onClose={onClose}>
        <EmptyState icon={ShieldCheck}>Confirm your budget before adding transactions.</EmptyState>
      </Sheet>
    )
  }

  const cycleId = summary.cycle.id

  async function save() {
    if (!categoryId || amount <= 0 || !date) {
      return
    }
    setSaving(true)
    const clientId = crypto.randomUUID()
    // Into the outbox, never straight to the API: it is on Home at once and reaches the server when it can. It carries
    // the cycle it was entered against, so a rollover while offline does not move it.
    await enqueue({ type: 'transaction.create', create: { clientId, cycleId, categoryId, amount, occurredOn: date, note: note.trim() || null } })
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
      title="Add transaction"
      onClose={onClose}
      footer={
        <Button fullWidth pending={saving} disabled={amount <= 0 || !categoryId || !date} onClick={save}>
          Save
        </Button>
      }
    >
      {/* The key listener serves the whole form; the div is not itself a control. */}
      <div className={styles.form} onKeyDown={onKeyDown}>
        <SegmentedControl
          label="Type"
          options={TYPES}
          value={type}
          onChange={(next) => {
            setType(next)
            setCategoryId(null)
          }}
        />

        <p id={amountId} aria-label="Amount" className={`${styles.amount} num`}>
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

        <Button variant="ghost" aria-expanded={noteOpen} onClick={() => setNoteOpen((now) => !now)}>
          Add note
        </Button>
        {noteOpen && <Field label="Note" value={note} maxLength={me.isDemo ? 200 : 280} onChange={(event) => setNote(event.target.value)} />}
      </div>
    </Sheet>
  )
}
