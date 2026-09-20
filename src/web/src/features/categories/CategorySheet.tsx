import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Trash2 } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
import { api } from '../../api/client'
import type { CategoryRollup, CategoryType, EditCategoryRequest } from '../../api/types'
import { parseMoney } from '../../format/money'
import { enqueue } from '../../offline/outbox'
import { Button } from '../../ui/Button'
import { CATEGORY_ICONS } from '../../ui/categoryIcons'
import { Dialog } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Sheet } from '../../ui/Sheet'
import { SLOTS, toSlot } from '../../ui/slots'
import { useToast } from '../../ui/useToast'
import styles from './CategorySheet.module.css'

const TYPES = [
  { value: 'Debit', label: 'Spending' },
  { value: 'Credit', label: 'Income' },
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
  // A new category takes the next unused slot; after eight they repeat and the icon tells them apart (MASTER 3.4).
  const [colour, setColour] = useState<string>(() => (editing ? toSlot(editing.colour) : (SLOTS.find((slot) => !rows.some((row) => row.colour === slot)) ?? SLOTS[rows.length % SLOTS.length])))
  const [errors, setErrors] = useState<{ name?: string; budget?: string }>({})
  const [problem, setProblem] = useState<string>()
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const done = async () => {
    await client.invalidateQueries({ queryKey: ['cycles'] })
    onClose()
  }
  const add = useMutation({
    mutationFn: (budgetAmount: number) => api.post(`/api/cycles/${cycleId}/categories`, { type, name: name.trim(), icon, colour, sortOrder: rows.length, budgetAmount }),
    onSuccess: done,
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
    if (Object.keys(category).length > 0) {
      await enqueue({ type: 'category.edit', cycleId, categoryId: editing.categoryId, category })
      toast.show({ message: 'Saved' })
    }
    onClose()
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
    </Sheet>
  )
}
