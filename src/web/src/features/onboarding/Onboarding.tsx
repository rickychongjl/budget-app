import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CloudOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../../api/client'
import type { Cycle } from '../../api/types'
import { addDays, formatDate, todayIn } from '../../format/dates'
import { parseMoney } from '../../format/money'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { Screen } from '../../shell/Screen'
import { useOnline } from '../../shell/useOnline'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Field } from '../../ui/Field'
import { Skeleton } from '../../ui/Skeleton'
import { useSession } from '../auth/useSession'
import { CategoryList } from '../categories/Categories'
import { useCycle } from '../cycles/useCycle'
import styles from './Onboarding.module.css'

// /onboarding: stories "Onboarding 1 to 5". The first cycle is a Draft until it is confirmed, and takes no transactions
// until then. The draft has to exist before a category can be added to it, so the start date and opening balance come
// first; the draft is saved on the server at each step, so leaving and coming back picks up where it was left.
// Everything here needs a connection: there is no cycle id to queue anything against until the server has made one.
export function Onboarding() {
  const cycles = useCachedQuery<Cycle[]>(['cycles', 'list'], () => api.get<Cycle[]>('/api/cycles'))

  if (cycles.isError) {
    return (
      <Screen title="Set up your budget">
        <EmptyState icon={CloudOff} action={<Button onClick={() => cycles.refetch()}>Try again</Button>}>
          Setting up needs a connection.
        </EmptyState>
      </Screen>
    )
  }

  if (!cycles.data) {
    return (
      <Screen title="Set up your budget">
        <Skeleton height="14rem" />
      </Screen>
    )
  }

  // Onboarding is only for the first cycle. Every later one is made by the rollover.
  if (cycles.data.some((cycle) => cycle.status === 'Confirmed')) {
    return <Navigate to="/" replace />
  }

  const draft = cycles.data.find((cycle) => cycle.status === 'Draft')
  return (
    <Screen title="Set up your budget">
      {/* Remounts when the draft first appears, so the form starts from what the server saved. */}
      <Start key={draft?.id ?? 'new'} draft={draft} />
      {draft && <Finish draft={draft} />}
    </Screen>
  )
}

type Errors = { startDate?: string; openingBalance?: string }

function Start({ draft }: { draft?: Cycle }) {
  const { me } = useSession()
  const client = useQueryClient()
  const online = useOnline()
  const today = todayIn(me.timeZone)
  const summary = useRef<HTMLDivElement>(null)
  const startField = useRef<HTMLInputElement>(null)
  const balanceField = useRef<HTMLInputElement>(null)
  const focus = (key: keyof Errors) => (key === 'startDate' ? startField : balanceField).current?.focus()

  const [startDate, setStartDate] = useState(draft?.startDate ?? today)
  const [openingBalance, setOpeningBalance] = useState(draft?.openingBalance == null ? '' : draft.openingBalance.toFixed(2))
  const [errors, setErrors] = useState<Errors>({})
  const [problem, setProblem] = useState<string>()

  const save = useMutation({
    mutationFn: (body: { startDate?: string; openingBalance?: number }) => (draft ? api.patch(`/api/cycles/${draft.id}`, body) : api.post('/api/cycles', body)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cycles'] }),
    onError: (error: Error) => setProblem(error.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const amount = parseMoney(openingBalance)
    const found: Errors = {
      startDate: startDate ? undefined : 'Choose a start date.',
      openingBalance: amount === null ? 'Enter your opening balance, like 3000.00' : undefined,
    }
    setErrors(found)
    setProblem(undefined)

    const wrong = (Object.keys(found) as (keyof Errors)[]).filter((key) => found[key])
    if (wrong.length > 1) {
      // Several fields: a summary at the top that links to each, and the focus goes to it (MASTER 9). The effect below
      // does that, because the summary does not exist until this render is done.
      return
    }
    if (wrong.length === 1 || amount === null) {
      return focus(wrong[0] ?? 'openingBalance')
    }

    // A draft only sends what changed; a new one sends both.
    const body = draft
      ? { ...(startDate !== draft.startDate && { startDate }), ...(amount !== draft.openingBalance && { openingBalance: amount }) }
      : { startDate, openingBalance: amount }
    if (Object.keys(body).length > 0) {
      save.mutate(body)
    }
  }

  const failed = (Object.keys(errors) as (keyof Errors)[]).filter((key) => errors[key])
  // `errors` is a new object on every submit, so this runs once per attempt, after the summary has been drawn.
  useEffect(() => {
    if (Object.values(errors).filter(Boolean).length > 1) {
      summary.current?.focus()
    }
  }, [errors])

  return (
    <form className={styles.section} onSubmit={submit} noValidate>
      <h2 className={styles.heading}>1. When it starts and what you have</h2>

      {(failed.length > 1 || problem) && (
        <div ref={summary} role="alert" tabIndex={-1} className={styles.summary}>
          <CircleAlert aria-hidden="true" className={styles.summaryIcon} />
          {problem ?? (
            <ul className={styles.summaryList}>
              {failed.map((key) => (
                <li key={key}>
                  <a
                    href={`#onboarding-${key}`}
                    onClick={(event) => {
                      event.preventDefault()
                      focus(key)
                    }}
                  >
                    {errors[key]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Field
        ref={startField}
        id="onboarding-startDate"
        label="Start date"
        type="date"
        value={startDate}
        error={errors.startDate}
        // The end date is shown and cannot be set: a cycle is fixed at 30 days (CLAUDE.md decision 10).
        hint={startDate ? `Ends ${formatDate(addDays(startDate, me.cycleLengthDays - 1), today)}. A cycle is always ${me.cycleLengthDays} days.` : undefined}
        onChange={(event) => setStartDate(event.target.value)}
      />
      <Field
        ref={balanceField}
        id="onboarding-openingBalance"
        label="Opening balance"
        inputMode="decimal"
        value={openingBalance}
        error={errors.openingBalance}
        hint="What you have in your account at the start of the cycle."
        onChange={(event) => setOpeningBalance(event.target.value)}
      />

      <Button type="submit" variant={draft ? 'secondary' : 'primary'} pending={save.isPending} disabled={!online}>
        {draft ? 'Save changes' : 'Continue'}
      </Button>
      {!online && <p className={styles.reason}>Setting up needs a connection.</p>}
    </form>
  )
}

function Finish({ draft }: { draft: Cycle }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const online = useOnline()
  const cycle = useCycle(draft.id)
  const [problem, setProblem] = useState<string>()

  const confirm = useMutation({
    mutationFn: () => api.post(`/api/cycles/${draft.id}/confirm`),
    onSuccess: async () => {
      navigator.vibrate?.(10)
      await client.invalidateQueries({ queryKey: ['cycles'] })
      void navigate('/', { replace: true })
    },
    onError: (error: Error) => setProblem(error.message),
  })

  // The API will confirm anything; these are the story's conditions ("once the categories, budgets, start date and
  // opening balance are set"), and the reason is shown rather than the button just being dead.
  const blocked = !cycle.data
    ? 'Loading your categories.'
    : cycle.data.rollup.categories.length === 0
      ? 'Add at least one category first.'
      : draft.openingBalance === null
        ? 'Enter your opening balance first.'
        : !online
          ? 'Confirming needs a connection.'
          : null

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.heading}>2. Categories and budgets</h2>
        <p className={styles.lead}>A spending category has a limit. An income category has the amount you expect.</p>
        <CategoryList cycleId={draft.id} online={online} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>3. Confirm</h2>
        <p className={styles.lead}>You can record transactions once the budget is confirmed. Categories and budgets can still be changed afterwards.</p>
        {problem && (
          <p role="alert" className={styles.summary}>
            <CircleAlert aria-hidden="true" className={styles.summaryIcon} />
            {problem}
          </p>
        )}
        <Button fullWidth pending={confirm.isPending} disabled={blocked !== null} onClick={() => confirm.mutate()}>
          Confirm budget
        </Button>
        {blocked && <p className={styles.reason}>{blocked}</p>}
      </section>
    </>
  )
}
