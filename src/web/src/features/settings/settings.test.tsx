import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
import { SessionContext } from '../auth/useSession'
import { Settings } from './Settings'

const RICKY: Me = { id: 'u1', displayName: 'Ricky', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: false, cycleLengthDays: 30 }
const SUMMARY: CycleSummary = {
  cycle: { id: 'cur', startDate: '2026-09-10', endDate: '2026-10-09', status: 'Confirmed', phase: 'Current', openingBalance: 3000, closingBalance: null },
  rollup: { categories: [], debitsBudgeted: 0, debitsActual: 0, creditsBudgeted: 0, creditsActual: 0, net: 0, accrued: null },
}

function renderSettings(me: Me = RICKY) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionContext value={{ me, signOut: async () => undefined }}>
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
