import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Download, LogOut, Trash2 } from 'lucide-react'
import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api, NetworkError } from '../../api/client'
import type { Cycle, Me } from '../../api/types'
import { addDays, formatDate, todayIn } from '../../format/dates'
import { Screen } from '../../shell/Screen'
import { useOnline } from '../../shell/useOnline'
import { getPreference, setPreference, type ThemePreference } from '../../theme/theme'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Dialog } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import { useCurrentCycle } from '../home/useCurrentCycle'
import { PlanSection } from '../plans/PlanSection'
import styles from './Settings.module.css'
import { saveFile } from './saveFile'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

export function Settings() {
  const { me, signOut } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const current = useCurrentCycle()
  const [theme, setTheme] = useState<ThemePreference>(getPreference)
  const [leaving, setLeaving] = useState(false)
  const exportId = useId()

  async function leave() {
    setLeaving(true)
    try {
      await signOut()
    } catch {
      setLeaving(false)
      toast.show({ message: "Couldn't sign out. Check your connection and try again.", tone: 'error' })
    }
  }

  const cycle = current.data?.cycle

  return (
    <Screen title="Settings">
      <section className={styles.section}>
        <h2 className={styles.heading}>Appearance</h2>
        <SegmentedControl
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={(next) => {
            setTheme(next)
            setPreference(next)
          }}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Budget</h2>
        <Card onClick={() => void navigate('/settings/categories')}>
          {/* Spans: the tappable card is a button, which may only hold phrasing content. */}
          <span className={styles.name}>Categories and budgets</span>
          <span className={styles.detail}>For the current cycle and the ones after it.</span>
        </Card>
      </section>

      <PlanSection />

      {/* Only the current cycle's start can move (story "Settings 3"), and only once it is confirmed. Remounts when the
          saved date changes, so the field never shows a stale one. */}
      {cycle?.status === 'Confirmed' && <StartDate key={`${cycle.id}:${cycle.startDate}`} cycle={cycle} me={me} />}

      <Profile key={`${me.displayName}:${me.timeZone}`} me={me} />

      <section aria-labelledby="account" className={styles.section}>
        <h2 id="account" className={styles.heading}>
          Account
        </h2>
        <ExportData id={exportId} />
        <Button variant="secondary" icon={LogOut} pending={leaving} onClick={leave}>
          Sign out
        </Button>
        <DeleteAccount exportId={exportId} />
      </section>
    </Screen>
  )
}

// A download, not a write, but it needs the server: disabled offline and says so (CLAUDE.md "needs a connection"). Fetched
// through the API client rather than a plain link, so a refusal (rate limit, signed out) is a toast here instead of a broken
// file in the browser's downloads.
function ExportData({ id }: { id: string }) {
  const toast = useToast()
  const online = useOnline()

  const exportData = useMutation({
    mutationFn: () => api.download('/api/me/export'),
    onSuccess: ({ blob, fileName }) => {
      saveFile(blob, fileName ?? 'tightarse-export.zip')
      toast.show({ message: 'Export downloaded' })
    },
    onError: (error: Error) =>
      toast.show({ message: error instanceof NetworkError ? "Couldn't export. Check your connection and try again." : error.message, tone: 'error' }),
  })

  return (
    <>
      <Button id={id} variant="secondary" icon={Download} pending={exportData.isPending} disabled={!online} onClick={() => exportData.mutate()}>
        Export my data
      </Button>
      <p className={styles.detail}>{online ? 'A ZIP with a spreadsheet (CSV) of your cycles, categories and transactions, and one JSON file with everything.' : 'Needs a connection.'}</p>
    </>
  )
}

// What the server checks for (DeleteAccount.Confirmation).
const CONFIRMATION = 'DELETE'

// Decision D5: everything goes at once, after the word is typed. The demo is shared and the server refuses it
// (demo.account.undeletable), so it is not offered there.
function DeleteAccount({ exportId }: { exportId: string }) {
  const { me } = useSession()
  const online = useOnline()
  const [open, setOpen] = useState(false)

  // The sheet closes first, which returns focus to the button that opened it; then focus moves on to Export.
  function exportFirst() {
    setOpen(false)
    setTimeout(() => document.getElementById(exportId)?.focus())
  }

  if (me.isDemo) {
    return <p className={styles.detail}>The demo is shared, so it can't be deleted.</p>
  }

  return (
    <>
      <Button variant="destructive" icon={Trash2} disabled={!online} onClick={() => setOpen(true)}>
        Delete account
      </Button>
      {!online && <p className={styles.detail}>Deleting your account needs a connection.</p>}
      {/* Mounted only while open, so the typed word never survives a close. */}
      {open && <DeleteAccountSheet onClose={() => setOpen(false)} onExportFirst={exportFirst} />}
    </>
  )
}

// A Sheet rather than a Dialog because it holds a field (MASTER 9: a Dialog is for confirmations only).
function DeleteAccountSheet({ onClose, onExportFirst }: { onClose: () => void; onExportFirst: () => void }) {
  const { signOut } = useSession()
  const toast = useToast()
  const online = useOnline()
  const field = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string>()
  const confirmed = typed.trim() === CONFIRMATION

  // Straight to the API: deleting is the server's job and cannot be queued. The server has signed the session out by the
  // time it answers, so this device is cleared the way sign-out clears it, without asking the server again. The toast
  // lives above the session gate, so it is still showing on the sign-in screen.
  const remove = useMutation({
    mutationFn: () => api.delete('/api/me', { confirm: CONFIRMATION }),
    onSuccess: async () => {
      toast.show({ message: 'Your account and all its data have been deleted.' })
      await signOut({ accountDeleted: true })
    },
    onError: (error: Error) => {
      setProblem(error instanceof NetworkError ? "Couldn't delete your account. Check your connection and try again." : error.message)
      field.current?.focus()
    },
  })

  const canDelete = confirmed && online && !remove.isPending

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canDelete) {
      setProblem(undefined)
      remove.mutate()
    }
  }

  return (
    <Sheet
      open
      title="Delete your account?"
      // Once the request is in flight the answer decides what happens next, so the sheet stays until it comes.
      onClose={() => !remove.isPending && onClose()}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" disabled={remove.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="delete-account" variant="destructive" icon={Trash2} pending={remove.isPending} disabled={!confirmed || !online}>
            Delete account
          </Button>
        </div>
      }
    >
      <form id="delete-account" className={styles.sheetBody} onSubmit={submit} noValidate>
        {problem && (
          <p role="alert" className={styles.problem}>
            <CircleAlert aria-hidden="true" className={styles.problemIcon} />
            {problem}
          </p>
        )}
        <p>
          This deletes your account and everything in it straight away: every cycle, category and transaction, and your profile. It can't be undone.
        </p>
        <p className={styles.detail}>Copies in our backups are gone within 7 days.</p>
        <div className={styles.exportFirst}>
          <p className={styles.detail}>Want a copy first? Export your data before you delete.</p>
          <Button variant="ghost" icon={Download} onClick={onExportFirst}>
            Export my data first
          </Button>
        </div>
        <Field
          ref={field}
          label={`Type ${CONFIRMATION} to confirm`}
          value={typed}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          hint={online ? undefined : 'Deleting your account needs a connection.'}
          onChange={(event) => setTyped(event.target.value)}
        />
      </form>
    </Sheet>
  )
}

function StartDate({ cycle, me }: { cycle: Cycle; me: Me }) {
  const client = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const today = todayIn(me.timeZone)
  const [startDate, setStartDate] = useState(cycle.startDate)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string>()

  // Straight to the API: the server re-dates every upcoming cycle with it and checks the overlap with the previous one,
  // neither of which a queued change could show.
  const move = useMutation({
    mutationFn: () => api.patch<Cycle>(`/api/cycles/${cycle.id}`, { startDate }),
    onSuccess: async () => {
      setAsking(false)
      toast.show({ message: 'Start date moved' })
      await client.invalidateQueries({ queryKey: ['cycles'] })
    },
    onError: (problem: Error) => {
      setAsking(false)
      setError(problem.message)
    },
  })

  return (
    <section aria-labelledby="current-cycle" className={styles.section}>
      <h2 id="current-cycle" className={styles.heading}>
        Current cycle
      </h2>
      <Field
        label="Start date"
        type="date"
        value={startDate}
        error={error}
        // The end date is shown, never asked for: a cycle is fixed at 30 days (CLAUDE.md decision 10).
        hint={startDate ? `Ends ${formatDate(addDays(startDate, me.cycleLengthDays - 1), today)}. A cycle is always ${me.cycleLengthDays} days.` : undefined}
        onChange={(event) => {
          setStartDate(event.target.value)
          setError(undefined)
        }}
      />
      <Button variant="secondary" disabled={!online || !startDate || startDate === cycle.startDate} onClick={() => setAsking(true)}>
        Move start date
      </Button>
      {!online && <p className={styles.detail}>Needs a connection.</p>}

      {/* MASTER 9, required use of a dialog. The safe choice is on the left. Transactions keep their cycle whatever the
          new dates are (story "Settings 6"), so nothing is said about them moving. */}
      <Dialog
        open={asking}
        title="Move the start date?"
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button pending={move.isPending} onClick={() => move.mutate()}>
              Move
            </Button>
          </>
        }
      >
        This also moves every upcoming cycle. Past cycles stay as they are.
      </Dialog>
    </section>
  )
}

function Profile({ me }: { me: Me }) {
  const client = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const zoneId = useId()
  const nameField = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(me.displayName)
  const [timeZone, setTimeZone] = useState(me.timeZone)
  const [nameError, setNameError] = useState<string>()
  const [problem, setProblem] = useState<string>()

  // The platform's own list (about 400), with the saved one kept even if this browser does not know it.
  const zones = useMemo(() => [...new Set([me.timeZone, ...Intl.supportedValuesOf('timeZone')])].sort(), [me.timeZone])

  const save = useMutation({
    mutationFn: (body: { displayName?: string; timeZone?: string }) => api.patch<Me>('/api/me', body),
    onSuccess: async () => {
      toast.show({ message: 'Profile saved' })
      await client.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (error: Error) => setProblem(error.message),
  })

  const changed = displayName.trim() !== me.displayName || timeZone !== me.timeZone

  function submit(event: FormEvent) {
    event.preventDefault()
    setProblem(undefined)
    if (!displayName.trim()) {
      setNameError('Enter a name.')
      return nameField.current?.focus()
    }
    setNameError(undefined)
    // Only what changed: a null field is left as it is on the server.
    save.mutate({ ...(displayName.trim() !== me.displayName && { displayName: displayName.trim() }), ...(timeZone !== me.timeZone && { timeZone }) })
  }

  return (
    <section aria-labelledby="profile" className={styles.section}>
      <h2 id="profile" className={styles.heading}>
        Profile
      </h2>
      <form className={styles.section} onSubmit={submit} noValidate>
        {/* Every visitor shares the demo's one User row, so the API refuses changes to it (demo.profile.readonly). */}
        <Field ref={nameField} label="Display name" value={displayName} maxLength={100} disabled={me.isDemo} error={nameError ?? problem} onChange={(event) => setDisplayName(event.target.value)} />
        <div className={styles.zone}>
          <label htmlFor={zoneId} className={styles.zoneLabel}>
            Time zone
          </label>
          <select id={zoneId} className={styles.select} value={timeZone} disabled={me.isDemo} onChange={(event) => setTimeZone(event.target.value)}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className={styles.detail}>Decides which day is "today", and so which cycle is current.</p>
        </div>
        <p className={styles.detail}>Currency: {me.currency}</p>

        {me.isDemo ? (
          <p className={styles.detail}>The demo profile is shared, so it cannot be changed.</p>
        ) : (
          <>
            <Button type="submit" variant="secondary" pending={save.isPending} disabled={!changed || !online}>
              Save profile
            </Button>
            {!online && <p className={styles.detail}>Needs a connection.</p>}
          </>
        )}
      </form>
    </section>
  )
}
