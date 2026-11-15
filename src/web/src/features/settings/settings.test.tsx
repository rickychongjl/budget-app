import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CycleSummary, Me } from '../../api/types'
import { db } from '../../offline/db'
import { stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionContext, type Session } from '../auth/useSession'
import { Settings } from './Settings'

const RICKY: Me = { id: 'u1', displayName: 'Ricky', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: false, cycleLengthDays: 30 }
const SUMMARY: CycleSummary = {
  cycle: { id: 'cur', startDate: '2026-09-10', endDate: '2026-10-09', status: 'Confirmed', phase: 'Current', openingBalance: 3000, closingBalance: null },
  rollup: { categories: [], debitsBudgeted: 0, debitsActual: 0, creditsBudgeted: 0, creditsActual: 0, net: 0, accrued: null },
}

function renderSettings(me: Me = RICKY, signOut: Session['signOut'] = async () => undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionContext value={{ me, signOut }}>
        <ToastProvider>
          <MemoryRouter>
            <Settings />
          </MemoryRouter>
        </ToastProvider>
      </SessionContext>
    </QueryClientProvider>,
  )
  return client
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'))
  resetCsrf()
  // An offline test's 'offline' event also tells TanStack's global onlineManager, which then pauses every later mutation
  // in this file until an 'online' event that never comes.
  onlineManager.setOnline(true)
  stopOutbox()
  await db.outbox.clear()
  await db.cache.clear()
  server.use(http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })), http.get('/api/cycles/current', () => HttpResponse.json(SUMMARY)))
  return () => vi.useRealTimers()
})

describe('profile', () => {
  test('sends only what changed, then refreshes who you are', async () => {
    let body: unknown
    server.use(http.patch('/api/me', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...RICKY, displayName: 'Ricky C' })
    }))
    const client = renderSettings()
    const invalidated = vi.spyOn(client, 'invalidateQueries')
    const profile = within(screen.getByRole('region', { name: 'Profile' }))

    await userEvent.clear(profile.getByLabelText('Display name'))
    await userEvent.type(profile.getByLabelText('Display name'), 'Ricky C')
    await userEvent.click(profile.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(body).toEqual({ displayName: 'Ricky C' }))
    await waitFor(() => expect(invalidated).toHaveBeenCalledWith({ queryKey: ['me'] }))
    expect(await screen.findByText('Profile saved')).toBeInTheDocument()
  })

  test('the time zone is chosen from the real list, and is what decides "today"', async () => {
    let body: unknown
    server.use(http.patch('/api/me', async ({ request }) => ((body = await request.json()), HttpResponse.json(RICKY))))
    renderSettings()
    const profile = within(screen.getByRole('region', { name: 'Profile' }))

    expect(profile.getByLabelText('Time zone')).toHaveValue('Australia/Sydney')
    await userEvent.selectOptions(profile.getByLabelText('Time zone'), 'Australia/Perth')
    await userEvent.click(profile.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(body).toEqual({ timeZone: 'Australia/Perth' }))
  })

  test('an empty name is caught at the field', async () => {
    renderSettings()
    const profile = within(screen.getByRole('region', { name: 'Profile' }))

    await userEvent.clear(profile.getByLabelText('Display name'))
    await userEvent.click(profile.getByRole('button', { name: 'Save profile' }))

    expect(profile.getByLabelText('Display name')).toHaveAccessibleDescription('Enter a name.')
    expect(profile.getByLabelText('Display name')).toHaveFocus()
  })

  test('nothing to save until something changes', () => {
    renderSettings()

    expect(within(screen.getByRole('region', { name: 'Profile' })).getByRole('button', { name: 'Save profile' })).toBeDisabled()
  })

  test('the shared demo profile is read-only, and says so', () => {
    renderSettings({ ...RICKY, displayName: 'Demo', isDemo: true })
    const profile = within(screen.getByRole('region', { name: 'Profile' }))

    expect(profile.getByLabelText('Display name')).toBeDisabled()
    expect(profile.getByLabelText('Time zone')).toBeDisabled()
    expect(profile.getByText('The demo profile is shared, so it cannot be changed.')).toBeInTheDocument()
    expect(profile.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument()
  })
})

// Stories "Settings 3 to 5": only the current cycle's start moves; the system says it also moves every upcoming cycle
// and asks first; past cycles never move.
describe('current cycle start date', () => {
  const section = async () => within(await screen.findByRole('region', { name: 'Current cycle' }))

  test('shows the start and the end it implies; the end is never a field', async () => {
    renderSettings()
    const cycle = await section()

    expect(cycle.getByLabelText('Start date')).toHaveValue('2026-09-10')
    expect(cycle.getByText('Ends 9 Oct. A cycle is always 30 days.')).toBeInTheDocument()
    expect(cycle.queryByLabelText(/End/)).not.toBeInTheDocument()
    expect(cycle.getByRole('button', { name: 'Move start date' })).toBeDisabled()
  })

  test('asks before anything is sent, and Cancel sends nothing', async () => {
    let sent = false
    server.use(http.patch('/api/cycles/cur', () => ((sent = true), HttpResponse.json(SUMMARY.cycle))))
    renderSettings()
    const cycle = await section()

    await userEvent.clear(cycle.getByLabelText('Start date'))
    await userEvent.type(cycle.getByLabelText('Start date'), '2026-09-12')
    await userEvent.click(cycle.getByRole('button', { name: 'Move start date' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Move the start date?' }))
    expect(dialog.getByText('This also moves every upcoming cycle. Past cycles stay as they are.')).toBeInTheDocument()
    expect(sent).toBe(false)

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent).toBe(false)
  })

  test('Move sends just the new start date', async () => {
    let body: unknown
    server.use(http.patch('/api/cycles/cur', async ({ request }) => ((body = await request.json()), HttpResponse.json({ ...SUMMARY.cycle, startDate: '2026-09-12' }))))
    renderSettings()
    const cycle = await section()

    await userEvent.clear(cycle.getByLabelText('Start date'))
    await userEvent.type(cycle.getByLabelText('Start date'), '2026-09-12')
    await userEvent.click(cycle.getByRole('button', { name: 'Move start date' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move' }))

    await waitFor(() => expect(body).toEqual({ startDate: '2026-09-12' }))
    expect(await screen.findByText('Start date moved')).toBeInTheDocument()
  })

  test('an overlap is refused by the server, and its reason is shown at the field', async () => {
    server.use(http.patch('/api/cycles/cur', () => HttpResponse.json({ status: 422, code: 'cycle.start.overlap', detail: 'A cycle must start after the previous cycle ends.' }, { status: 422 })))
    renderSettings()
    const cycle = await section()

    await userEvent.clear(cycle.getByLabelText('Start date'))
    await userEvent.type(cycle.getByLabelText('Start date'), '2026-09-01')
    await userEvent.click(cycle.getByRole('button', { name: 'Move start date' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move' }))

    await waitFor(() => expect(cycle.getByLabelText('Start date')).toHaveAccessibleDescription('A cycle must start after the previous cycle ends.'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('there is nothing to move until a cycle is confirmed', async () => {
    server.use(http.get('/api/cycles/current', () => HttpResponse.json({ status: 404, code: 'cycle.none' }, { status: 404 })))
    renderSettings()

    await screen.findByRole('region', { name: 'Profile' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Current cycle' })).not.toBeInTheDocument())
  })
})

// Settings → Account: the export is a download from the server, so it needs a connection.
describe('export my data', () => {
  const account = () => within(screen.getByRole('region', { name: 'Account' }))

  function stubDownloads() {
    const saved: { href: string; download: string }[] = []
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ href: this.href, download: this.download })
    })
    return saved
  }

  test('downloads the ZIP under the name the server gave it', async () => {
    const saved = stubDownloads()
    server.use(
      http.get('/api/me/export', () =>
        new HttpResponse(new Uint8Array([80, 75, 3, 4]), {
          headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="tightarse-export-2026-09-20.zip"' },
        }),
      ),
    )
    renderSettings()

    await userEvent.click(account().getByRole('button', { name: 'Export my data' }))

    expect(await screen.findByText('Export downloaded')).toBeInTheDocument()
    expect(saved).toEqual([{ href: 'blob:export', download: 'tightarse-export-2026-09-20.zip' }])
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ size: 4, type: 'application/zip' }))
  })

  test('a refusal is said in a toast and nothing is saved', async () => {
    const saved = stubDownloads()
    server.use(http.get('/api/me/export', () => HttpResponse.json({ status: 429, code: 'rate-limited', detail: 'Too many requests. Try again shortly.' }, { status: 429 })))
    renderSettings()

    await userEvent.click(account().getByRole('button', { name: 'Export my data' }))

    expect(await screen.findByText('Too many requests. Try again shortly.')).toBeInTheDocument()
    expect(saved).toEqual([])
  })

  test('works for the demo too', () => {
    renderSettings({ ...RICKY, displayName: 'Demo', isDemo: true })

    expect(account().getByRole('button', { name: 'Export my data' })).toBeEnabled()
  })

  test('offline, it cannot start and the reason is on screen', () => {
    renderSettings()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))

    expect(account().getByRole('button', { name: 'Export my data' })).toBeDisabled()
    expect(account().getByText('Needs a connection.')).toBeInTheDocument()
  })
})

// Settings → Account: decision D5, an immediate hard delete once the word is typed. The sheet says what goes, offers the
// export first, and signs this device out the way sign-out does once the server has done it.
describe('delete my account', () => {
  const account = () => within(screen.getByRole('region', { name: 'Account' }))
  const sheet = async () => within(await screen.findByRole('dialog', { name: 'Delete your account?' }))

  async function open() {
    await userEvent.click(account().getByRole('button', { name: 'Delete account' }))
    return sheet()
  }

  test('explains what is deleted, and Delete stays off until DELETE is typed', async () => {
    renderSettings()
    const dialog = await open()

    expect(dialog.getByText(/every cycle, category and transaction, and your profile/)).toBeInTheDocument()
    expect(dialog.getByText(/can't be undone/)).toBeInTheDocument()
    expect(dialog.getByText('Copies in our backups are gone within 7 days.')).toBeInTheDocument()
    const confirm = dialog.getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'delete')
    expect(confirm).toBeDisabled()

    await userEvent.clear(dialog.getByLabelText('Type DELETE to confirm'))
    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELETE')
    expect(confirm).toBeEnabled()
  })

  test('Cancel sends nothing and the typed word does not survive a reopen', async () => {
    let sent = false
    server.use(http.delete('/api/me', () => ((sent = true), new HttpResponse(null, { status: 204 }))))
    renderSettings()
    const dialog = await open()

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await open()).getByLabelText('Type DELETE to confirm')).toHaveValue('')
    expect(sent).toBe(false)
  })

  test('sends the confirmation with the anti-forgery token, then signs out locally and says it is done', async () => {
    let request: { body: unknown; token: string | null } | undefined
    server.use(
      http.delete('/api/me', async ({ request: sent }) => {
        request = { body: await sent.json(), token: sent.headers.get('X-XSRF-TOKEN') }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const signOut = vi.fn(async () => undefined)
    renderSettings(RICKY, signOut)
    const dialog = await open()

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete account' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ accountDeleted: true }))
    expect(request).toEqual({ body: { confirm: 'DELETE' }, token: 't' })
    expect(await screen.findByText('Your account and all its data have been deleted.')).toBeInTheDocument()
  })

  test('Enter in the field submits once the word is right', async () => {
    let sent = 0
    server.use(http.delete('/api/me', () => ((sent += 1), new HttpResponse(null, { status: 204 }))))
    renderSettings()
    const dialog = await open()

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELET{Enter}')
    expect(sent).toBe(0)

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'E{Enter}')
    await waitFor(() => expect(sent).toBe(1))
  })

  test('a refusal is shown in the sheet and nothing is signed out', async () => {
    server.use(http.delete('/api/me', () => HttpResponse.json({ status: 422, code: 'account.delete.unconfirmed', detail: 'Type DELETE to confirm.' }, { status: 422 })))
    const signOut = vi.fn(async () => undefined)
    renderSettings(RICKY, signOut)
    const dialog = await open()

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete account' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Type DELETE to confirm.')
    expect(signOut).not.toHaveBeenCalled()
  })

  test('a dropped connection says so and keeps the sheet open to try again', async () => {
    server.use(http.delete('/api/me', () => HttpResponse.error()))
    renderSettings()
    const dialog = await open()

    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete account' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent("Couldn't delete your account. Check your connection and try again.")
    expect(dialog.getByRole('button', { name: 'Delete account' })).toBeEnabled()
  })

  test('"Export my data first" closes the sheet and moves to the export button', async () => {
    renderSettings()
    const dialog = await open()

    await userEvent.click(dialog.getByRole('button', { name: 'Export my data first' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(account().getByRole('button', { name: 'Export my data' })).toHaveFocus())
  })

  test('offline, it cannot be opened and the reason is on screen', () => {
    renderSettings()

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))

    expect(account().getByRole('button', { name: 'Delete account' })).toBeDisabled()
    expect(account().getByText('Deleting your account needs a connection.')).toBeInTheDocument()
  })

  test('losing the connection with the sheet open turns Delete off and says why', async () => {
    renderSettings()
    const dialog = await open()
    await userEvent.type(dialog.getByLabelText('Type DELETE to confirm'), 'DELETE')

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))

    expect(dialog.getByRole('button', { name: 'Delete account' })).toBeDisabled()
    expect(dialog.getByLabelText('Type DELETE to confirm')).toHaveAccessibleDescription('Deleting your account needs a connection.')
  })

  test('the shared demo is not offered it, and is told why', () => {
    renderSettings({ ...RICKY, displayName: 'Demo', isDemo: true })

    expect(account().queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(account().getByText("The demo is shared, so it can't be deleted.")).toBeInTheDocument()
  })
})
