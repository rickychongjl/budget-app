import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../../api/client'
import type { CategoryRollup, Cycle, CycleSummary, Me } from '../../api/types'
import { addDays } from '../../format/dates'
import { db } from '../../offline/db'
import { configureOutbox, stopOutbox } from '../../offline/outbox'
import { server } from '../../test/server'
import { ToastProvider } from '../../ui/Toast'
import { SessionGate } from '../auth/SessionGate'
import { Onboarding } from './Onboarding'

test.each([
  ['2026-09-20', 29, '2026-10-19'],
  ['2026-12-15', 29, '2027-01-13'],
  ['2028-02-01', 29, '2028-03-01'],
  ['2026-09-20', -1, '2026-09-19'],
])('addDays(%s, %i) is %s', (date, days, expected) => expect(addDays(date, days)).toBe(expected))

const ME: Me = { id: 'u1', displayName: 'Ricky', timeZone: 'Australia/Sydney', currency: 'AUD', isDemo: false, cycleLengthDays: 30 }
const DRAFT: Cycle = { id: 'd1', startDate: '2026-09-20', endDate: '2026-10-19', status: 'Draft', phase: 'Current', openingBalance: 3000, closingBalance: null }
const FOOD: CategoryRollup = { categoryId: 'food', name: 'Groceries', icon: 'tag', colour: 'blue', type: 'Debit', budgeted: 700, actual: 0, remaining: 700, percentUsed: 0, status: 'OnTrack', spreadEvenly: true }

// A tiny in-memory server: what onboarding creates, it then reads back.
function backend({ cycles = [] as Cycle[], categories = [] as CategoryRollup[], me = ME } = {}) {
  const state = { cycles, categories, me, meReads: 0, profile: null as unknown, created: null as unknown, patched: null as unknown, confirmed: false }
  const summary = (cycle: Cycle): CycleSummary => ({
    cycle,
    rollup: { categories: state.categories, debitsBudgeted: 0, debitsActual: 0, creditsBudgeted: 0, creditsActual: 0, net: 0, accrued: null },
  })
  server.use(
    http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
    http.get('/api/me', () => {
      state.meReads++
      return HttpResponse.json(state.me)
    }),
    http.patch('/api/me', async ({ request }) => {
      state.profile = await request.json()
      state.me = { ...state.me, ...(state.profile as object) }
      return HttpResponse.json(state.me)
    }),
    http.get('/api/cycles', () => HttpResponse.json(state.cycles)),
    http.get('/api/cycles/:id', ({ params }) => HttpResponse.json(summary(state.cycles.find((c) => c.id === params.id)!))),
    http.post('/api/cycles', async ({ request }) => {
      state.created = await request.json()
      const body = state.created as { startDate: string; openingBalance: number }
      state.cycles = [{ ...DRAFT, startDate: body.startDate, endDate: addDays(body.startDate, 29), openingBalance: body.openingBalance }]
      return HttpResponse.json(state.cycles[0], { status: 201 })
    }),
    http.patch('/api/cycles/d1', async ({ request }) => {
      state.patched = await request.json()
      state.cycles = [{ ...state.cycles[0], ...(state.patched as object) }]
      return HttpResponse.json(state.cycles[0])
    }),
    http.post('/api/cycles/d1/confirm', () => {
      state.confirmed = true
      state.cycles = [{ ...state.cycles[0], status: 'Confirmed' }]
      return HttpResponse.json(state.cycles[0])
    }),
  )
  return state
}

async function renderOnboarding() {
  await configureOutbox({ userId: 'u1', refresh: async () => undefined })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionGate>
        <ToastProvider>
          <MemoryRouter initialEntries={['/onboarding']}>
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/" element={<p>Home screen</p>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionGate>
    </QueryClientProvider>,
  )
}

// What Intl reports as this device's zone. restoreMocks puts the real one back after each test.
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
function deviceZone(zone: string | undefined) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: zone as string }
  })
}

// The first-run step, as a user who accepts what it suggests.
async function acceptAboutYou() {
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await screen.findByLabelText('Start date')
}

beforeEach(async () => {
  deviceZone('Australia/Sydney')
  vi.useFakeTimers({ toFake: ['Date'] })
  // The evening of the 19th in UTC is already the 20th in Sydney.
  vi.setSystemTime(new Date('2026-09-19T21:30:00Z'))
  resetCsrf()
  stopOutbox()
  await db.outbox.clear()
  await db.cache.clear()
  return () => vi.useRealTimers()
})

describe('first run: your name and time zone, before the first cycle', () => {
  test("suggests this device's time zone and the name from sign-in, and asks before anything else", async () => {
    deviceZone('Australia/Perth')
    backend()
    await renderOnboarding()

    expect(await screen.findByRole('heading', { level: 2, name: 'First, about you' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveValue('Ricky')
    const zone = screen.getByLabelText('Time zone')
    expect(zone).toHaveValue('Australia/Perth')
    expect(zone).toHaveAccessibleDescription(/This device's time zone/)
    // The cycle cannot be started until this is saved.
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument()
  })

  test('offers the Australian zones first, then every other zone', async () => {
    backend()
    await renderOnboarding()

    const zone = await screen.findByLabelText('Time zone')
    const groups = within(zone).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(['Australia', 'Everywhere else'])
    expect(within(groups[0]).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Perth, Western Australia',
      'Darwin, Northern Territory',
      'Adelaide, South Australia',
      'Brisbane, Queensland',
      'Sydney, New South Wales and ACT',
      'Melbourne, Victoria',
      'Hobart, Tasmania',
      'Lord Howe Island',
    ])
    expect(within(groups[1]).getByRole('option', { name: 'Europe/London' })).toHaveValue('Europe/London')
  })

  test('both can be changed, are saved together, and "today" then follows the saved zone', async () => {
    // 3pm UTC on the 19th: already the 20th in Sydney, still the 19th in Perth.
    vi.setSystemTime(new Date('2026-09-19T15:00:00Z'))
    const state = backend()
    await renderOnboarding()
    const reads = state.meReads

    await userEvent.clear(await screen.findByLabelText('Your name'))
    await userEvent.type(screen.getByLabelText('Your name'), '  Sam ')
    await userEvent.selectOptions(screen.getByLabelText('Time zone'), 'Australia/Perth')
    expect(screen.getByLabelText('Time zone')).not.toHaveAccessibleDescription(/This device's time zone/)
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-09-19')
    expect(state.profile).toEqual({ displayName: 'Sam', timeZone: 'Australia/Perth' })
    // The cached profile is fetched again, so the service worker's copy is the new one too.
    await waitFor(() => expect(state.meReads).toBeGreaterThan(reads))
    expect(state.created).toBeNull()
  })

  test('a device that cannot say where it is starts from the saved zone', async () => {
    deviceZone(undefined)
    backend({ me: { ...ME, timeZone: 'Australia/Brisbane' } })
    await renderOnboarding()

    const zone = await screen.findByLabelText('Time zone')
    expect(zone).toHaveValue('Australia/Brisbane')
    expect(zone).not.toHaveAccessibleDescription(/This device's time zone/)
  })

  test('a zone the browser does not list is still offered when the device reports it', async () => {
    deviceZone('Asia/Calcutta')
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Kolkata', 'Europe/London'])
    backend()
    await renderOnboarding()

    expect(await screen.findByLabelText('Time zone')).toHaveValue('Asia/Calcutta')
  })

  test('a blank name is refused at the field, and nothing is sent', async () => {
    const state = backend()
    await renderOnboarding()

    await userEvent.clear(await screen.findByLabelText('Your name'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText('Your name')).toHaveFocus()
    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription('Enter your name.')
    expect(state.profile).toBeNull()
  })

  test('a zone the server does not know is shown at the zone field', async () => {
    backend()
    server.use(
      http.patch('/api/me', () =>
        HttpResponse.json({ status: 422, code: 'user.timezone.unknown', detail: "'Australia/Sydney' is not a known IANA time zone." }, { status: 422 }),
      ),
    )
    await renderOnboarding()

    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    const zone = screen.getByLabelText('Time zone')
    await waitFor(() => expect(zone).toHaveAccessibleDescription("The server doesn't recognise this time zone. Choose a nearby city."))
    expect(zone).toHaveFocus()
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument()
  })

  test('any other refusal is shown above the form', async () => {
    backend()
    server.use(http.patch('/api/me', () => HttpResponse.json({ status: 400, code: 'validation', detail: 'Something was wrong.' }, { status: 400 })))
    await renderOnboarding()

    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something was wrong.')
  })

  test('needs a connection: offline, Continue is disabled and says why', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const state = backend()
    await renderOnboarding()

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.getByText('Saving this needs a connection.')).toBeInTheDocument()
    expect(state.profile).toBeNull()
  })

  test('the shared demo profile is read-only, so the demo goes straight to the cycle', async () => {
    const state = backend({ me: { ...ME, isDemo: true } })
    await renderOnboarding()

    expect(await screen.findByLabelText('Start date')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First, about you' })).not.toBeInTheDocument()
    expect(state.profile).toBeNull()
  })

  test('someone who already has a draft cycle is not asked again', async () => {
    const state = backend({ cycles: [DRAFT] })
    await renderOnboarding()

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-09-20')
    expect(screen.queryByLabelText('Time zone')).not.toBeInTheDocument()
    expect(state.profile).toBeNull()
  })
})

describe('step 1: when it starts and what you have', () => {
  test('starts today where the user lives, and shows the end date it cannot change', async () => {
    backend()
    await renderOnboarding()
    await acceptAboutYou()

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-09-20')
    expect(screen.getByText('Ends 19 Oct. A cycle is always 30 days.')).toBeInTheDocument()
    // Nothing else is offered until the cycle exists.
    expect(screen.queryByRole('button', { name: 'Confirm budget' })).not.toBeInTheDocument()
  })

  test('the end date follows the start date', async () => {
    backend()
    await renderOnboarding()
    await acceptAboutYou()
    const start = await screen.findByLabelText('Start date')

    await userEvent.clear(start)
    await userEvent.type(start, '2026-12-15')

    expect(screen.getByText('Ends 13 Jan 2027. A cycle is always 30 days.')).toBeInTheDocument()
  })

  test('with more than one field wrong, a summary at the top links to each and takes the focus', async () => {
    const state = backend()
    await renderOnboarding()
    await acceptAboutYou()
    await userEvent.clear(await screen.findByLabelText('Start date'))

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const summary = screen.getByRole('alert')
    expect(summary).toHaveFocus()
    expect(within(summary).getAllByRole('link').map((link) => link.textContent)).toEqual(['Choose a start date.', 'Enter your opening balance, like 3000.00'])
    // And each message is also at its field.
    expect(screen.getByLabelText('Opening balance')).toHaveAccessibleDescription('Enter your opening balance, like 3000.00')
    expect(state.created).toBeNull()

    await userEvent.click(within(summary).getByRole('link', { name: /opening balance/ }))
    expect(screen.getByLabelText('Opening balance')).toHaveFocus()
  })

  test('with one field wrong, the focus goes straight to it', async () => {
    backend()
    await renderOnboarding()
    await acceptAboutYou()
    await screen.findByLabelText('Start date')

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Opening balance')).toHaveFocus()
  })

  test('Continue creates the draft cycle, and the next steps appear', async () => {
    const state = backend()
    await renderOnboarding()
    await acceptAboutYou()

    await userEvent.type(await screen.findByLabelText('Opening balance'), '3,000')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(state.created).toEqual({ startDate: '2026-09-20', openingBalance: 3000 }))
    expect(await screen.findByRole('button', { name: 'Add category' })).toBeInTheDocument()
  })
})

describe('coming back to a draft', () => {
  test('picks up where it was left: values filled in, categories listed', async () => {
    backend({ cycles: [DRAFT], categories: [FOOD] })
    await renderOnboarding()

    expect(await screen.findByLabelText('Start date')).toHaveValue('2026-09-20')
    expect(screen.getByLabelText('Opening balance')).toHaveValue('3000.00')
    expect(await screen.findByRole('heading', { level: 3, name: 'Groceries' })).toBeInTheDocument()
  })

  test('changing the date or balance updates the draft rather than making another', async () => {
    const state = backend({ cycles: [DRAFT] })
    await renderOnboarding()
    const balance = await screen.findByLabelText('Opening balance')

    await userEvent.clear(balance)
    await userEvent.type(balance, '3500')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(state.patched).toEqual({ openingBalance: 3500 }))
    expect(state.created).toBeNull()
  })

  test('cannot be confirmed without a category, and says why', async () => {
    backend({ cycles: [DRAFT] })
    await renderOnboarding()

    expect(await screen.findByText('Add at least one category first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm budget' })).toBeDisabled()
  })

  test('Confirm finishes onboarding and goes Home', async () => {
    const state = backend({ cycles: [DRAFT], categories: [FOOD] })
    await renderOnboarding()

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm budget' }))

    expect(await screen.findByText('Home screen')).toBeInTheDocument()
    expect(state.confirmed).toBe(true)
  })
})

test('someone who already has a confirmed cycle is sent Home', async () => {
  backend({ cycles: [{ ...DRAFT, status: 'Confirmed' }] })
  await renderOnboarding()

  expect(await screen.findByText('Home screen')).toBeInTheDocument()
})
