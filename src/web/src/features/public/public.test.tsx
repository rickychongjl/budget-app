import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import App from '../../App'
import { resetCsrf } from '../../api/client'
import { server } from '../../test/server'
import { yearlyPerMonth, yearlySaving } from './billing'
import { CATALOGUE, PREMIUM_CTA, price } from './catalogue'
import { Landing } from './Landing'
import { parse, publishable } from './legalText'
import { Markdown } from './Markdown'
import { usePageMeta } from './usePageMeta'

const signedOut = () => http.get('/api/me', () => HttpResponse.json({ status: 401, code: 'http.401' }, { status: 401 }))
const og = (property: string) => document.head.querySelector(`meta[property="${property}"]`)?.getAttribute('content')
const { monthly, yearly, trialDays } = CATALOGUE.premiumPrice
const saving = yearlySaving(monthly, yearly)
// The hero's "Start free" comes first; the Free card further down has its own.
const heroStartFree = () => screen.getAllByRole('link', { name: 'Start free' })[0]

function visit(path: string) {
  history.replaceState(null, '', path)
  render(<App />)
}

beforeEach(() => {
  resetCsrf()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

describe('landing page', () => {
  test('signed out, "/" says what it is, shows three features and both ways in', async () => {
    server.use(signedOut())
    visit('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Tight Arse' })).toBeInTheDocument()
    const features = within(screen.getByRole('region', { name: 'What it does' }))
    expect(features.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    expect(heroStartFree()).toHaveAttribute('href', '/signin')
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled()
    expect(screen.getByText(/shared account that everyone trying it can see, and it resets every night/)).toBeInTheDocument()
    expect(document.title).toBe('Tight Arse')
    expect(og('og:url')).toBe(`${location.origin}/`)
    expect(og('og:description')).toContain(`Premium from ${price(yearlyPerMonth(yearly))} a month`)
  })

  test('the pricing section comes after "What it does" and replaces the old one-line mention', async () => {
    server.use(signedOut())
    visit('/')

    const pricing = await screen.findByRole('region', { name: 'Free to start. Cheap to keep.' })
    const features = screen.getByRole('region', { name: 'What it does' })
    expect(features.compareDocumentPosition(pricing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(pricing).getByText(/Free is a plan, not a trial, and needs no card/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See pricing' })).not.toBeInTheDocument()
    expect(within(pricing).getByRole('link', { name: 'Compare plans in detail' })).toHaveAttribute('href', '/pricing')
  })

  test('billing defaults to yearly, with the saving and the per-month price worked out from the catalogue', async () => {
    server.use(signedOut())
    visit('/')

    const pricing = within(await screen.findByRole('region', { name: 'Free to start. Cheap to keep.' }))
    const group = within(pricing.getByRole('radiogroup', { name: 'Billing period' }))
    expect(group.getByRole('radio', { name: `Yearly Save ${saving}%` })).toBeChecked()
    expect(group.getByRole('radio', { name: 'Monthly' })).not.toBeChecked()
    expect(saving).toBe(37)

    const premium = within(pricing.getByRole('article', { name: 'Premium' }))
    expect(premium.getByText(price(yearlyPerMonth(yearly)))).toBeInTheDocument()
    expect(price(yearlyPerMonth(yearly))).toBe('A$2.50')
    expect(premium.getByText(`${price(yearly)} billed yearly`)).toBeInTheDocument()
    expect(premium.getByText(new RegExp(`${trialDays}-day free trial`))).toBeInTheDocument()
  })

  test('switching to monthly shows the monthly price, by pointer or by arrow key', async () => {
    server.use(signedOut())
    visit('/')

    const pricing = within(await screen.findByRole('region', { name: 'Free to start. Cheap to keep.' }))
    await userEvent.click(pricing.getByRole('radio', { name: 'Monthly' }))

    const premium = within(pricing.getByRole('article', { name: 'Premium' }))
    expect(pricing.getByRole('radio', { name: 'Monthly' })).toBeChecked()
    expect(premium.getByText(price(monthly))).toBeInTheDocument()
    expect(premium.getByText('Billed monthly')).toBeInTheDocument()
    expect(premium.queryByText(price(yearlyPerMonth(yearly)))).not.toBeInTheDocument()

    pricing.getByRole('radio', { name: 'Monthly' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(pricing.getByRole('radio', { name: `Yearly Save ${saving}%` })).toBeChecked()
    expect(premium.getByText(price(yearlyPerMonth(yearly)))).toBeInTheDocument()
  })

  test('Premium comes first and is highlighted; each card has its own honest button', async () => {
    server.use(signedOut())
    visit('/')

    const pricing = within(await screen.findByRole('region', { name: 'Free to start. Cheap to keep.' }))
    const cards = pricing.getAllByRole('article')
    expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Premium',
      'Free',
    ])
    const [premium, free] = cards.map((card) => within(card))
    expect(premium.getByText('Best value')).toBeInTheDocument()
    expect(free.queryByText('Best value')).not.toBeInTheDocument()

    expect(premium.getByRole('link', { name: PREMIUM_CTA.label })).toHaveAttribute('href', '/signin')
    expect(premium.getByRole('link').textContent).not.toMatch(/trial/i)
    expect(premium.getByText('Premium is coming with the mobile apps.')).toBeInTheDocument()
    expect(free.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signin')
    expect(free.getByText(`Up to ${CATALOGUE.free.maxCategoriesPerCycle} categories per cycle`)).toBeInTheDocument()
    expect(premium.getByText('Unlimited categories')).toBeInTheDocument()
    // One primary button per screen (MASTER 9): on "/" it is the hero's "Start free", so the cards' buttons are secondary.
    expect(document.querySelectorAll('main a[class*="primary"], main button[class*="primary"]')).toHaveLength(1)
  })

  test('trust lines sit under the cards', async () => {
    server.use(signedOut())
    visit('/')

    const pricing = within(await screen.findByRole('region', { name: 'Free to start. Cheap to keep.' }))
    expect(pricing.getByText('Prices are in Australian dollars and include GST.')).toBeInTheDocument()
    expect(pricing.getByText('No card needed for Free.')).toBeInTheDocument()
    expect(pricing.getByText('Going back to Free never deletes anything.')).toBeInTheDocument()
  })

  test('"Start free" opens the sign-in screen', async () => {
    server.use(signedOut(), http.get('/auth/options', () => HttpResponse.json({ signIn: ['demo', 'google'] })))
    visit('/')

    await screen.findByRole('heading', { level: 1, name: 'Tight Arse' })
    await userEvent.click(heroStartFree())

    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/auth/login')
    expect(location.pathname).toBe('/signin')
  })

  test('"Try the demo" signs in with the anti-forgery token', async () => {
    const tokens: (string | null)[] = []
    server.use(
      http.get('/auth/csrf', () => HttpResponse.json({ token: 'token-1' })),
      http.post('/auth/demo', ({ request }) => {
        tokens.push(request.headers.get('X-XSRF-TOKEN'))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const onSignedIn = vi.fn(async () => undefined)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Landing onSignedIn={onSignedIn} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Try the demo' }))

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce())
    expect(tokens).toEqual(['token-1'])
  })

  test('with no connection "/" still shows the landing page, and says signing in needs one', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    server.use(http.get('/api/me', () => HttpResponse.error()))
    visit('/')

    // After the query's two retries on a network error (App's QueryClient), as before this page existed.
    expect(await screen.findByRole('heading', { level: 1, name: 'Tight Arse' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeDisabled()
    expect(screen.getByText('Signing in and the demo need a connection.')).toBeInTheDocument()
  })

  test('other signed-out paths still show the sign-in screen', async () => {
    server.use(signedOut(), http.get('/auth/options', () => HttpResponse.json({ signIn: ['demo'] })))
    visit('/cycles')

    expect(await screen.findByText('A 30-day budget you can keep up with from your phone.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Start free' })).not.toBeInTheDocument()
  })
})

// None of these declares a handler: an undeclared request fails the test, which proves they render with no server.
describe('pricing', () => {
  test('prints the plans from the same numbers the server enforces', async () => {
    visit('/pricing')

    expect(await screen.findByRole('heading', { level: 1, name: 'Pricing' })).toBeInTheDocument()
    const table = within(screen.getByRole('table', { name: 'What each plan includes' }))
    expect(table.getByRole('row', { name: /Categories in a cycle/ })).toHaveTextContent(`Up to ${CATALOGUE.free.maxCategoriesPerCycle}Unlimited`)
    expect(table.getByRole('row', { name: /Trend chart/ })).toHaveTextContent('Not includedIncluded')
    expect(table.getByRole('row', { name: /Export your data/ })).toHaveTextContent('IncludedIncluded')
    expect(document.title).toBe('Pricing · Tight Arse')
    expect(og('og:description')).toContain(`${price(yearlyPerMonth(yearly))} a month billed yearly (${price(yearly)}), or ${price(monthly)} billed monthly`)
  })

  test("reuses the toggle and the cards, with Premium's button as the one primary", async () => {
    visit('/pricing')

    await screen.findByRole('heading', { level: 1, name: 'Pricing' })
    expect(screen.getByRole('radio', { name: `Yearly Save ${saving}%` })).toBeChecked()
    const [premium, free] = screen.getAllByRole('article').map((card) => within(card))
    expect(premium.getByRole('heading', { level: 2, name: 'Premium' })).toBeInTheDocument()
    expect(premium.getByText(price(yearlyPerMonth(yearly)))).toBeInTheDocument()
    expect(premium.getByRole('link', { name: PREMIUM_CTA.label }).className).toMatch(/primary/)
    expect(free.getByRole('link', { name: 'Start free' }).className).toMatch(/secondary/)
    expect(document.querySelectorAll('main a[class*="primary"], main button[class*="primary"]')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Compare plans in detail' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Monthly' }))
    expect(premium.getByText(price(monthly))).toBeInTheDocument()
  })

  test('answers the common questions in a short FAQ that opens and closes', async () => {
    visit('/pricing')

    const faq = within(await screen.findByRole('region', { name: 'Questions' }))
    const questions = faq.getAllByRole('group')
    expect(questions).toHaveLength(6)
    expect(questions.map((details) => details.querySelector('summary')?.textContent)).toEqual([
      'Is Free really free?',
      'Do I need a card?',
      'What happens if I go back to Free?',
      'Where is my data stored?',
      'Why does it cost less than other budgeting apps?',
      'When can I buy Premium?',
    ])
    const where = questions[3] as HTMLDetailsElement
    expect(where.open).toBe(false)
    await userEvent.click(faq.getByText('Where is my data stored?'))
    expect(where.open).toBe(true)
    expect(within(where).getByText(/Australia East region \(Sydney\)/)).toBeInTheDocument()
    expect(within(where).getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
    expect(within(questions[0]).getByText(new RegExp(`up to ${CATALOGUE.free.maxCategoriesPerCycle} categories`), { exact: false })).toBeInTheDocument()
    expect(within(questions[5]).getByText(/cannot be bought yet/)).toBeInTheDocument()
  })

  test('matches decision D3', () => {
    expect(CATALOGUE.free.maxCategoriesPerCycle).toBe(6)
    expect(CATALOGUE.premiumPrice).toEqual({ currency: 'AUD', monthly: 3.99, yearly: 29.99, trialDays: 14 })
    expect(price(3.99)).toBe('A$3.99')
  })

  test('the footer links move between the public pages and mark the current one', async () => {
    visit('/pricing')
    const nav = within(await screen.findByRole('navigation', { name: 'About Tight Arse' }))
    expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(nav.getByRole('link', { name: 'Terms' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Tight Arse terms of use' })).toBeInTheDocument()
    expect(location.pathname).toBe('/terms')
  })
})

describe('privacy and terms', () => {
  test('privacy renders the draft and leaves out the notes for Ricky', async () => {
    visit('/privacy')

    expect(await screen.findByRole('heading', { level: 1, name: 'Tight Arse privacy policy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Cookies' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'budget.session' })).toBeInTheDocument()
    expect(screen.queryByText(/Claims and where they are true/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Things in the code that cut against this policy/)).not.toBeInTheDocument()
    expect(document.title).toBe('Privacy policy · Tight Arse')
  })

  test('terms render', async () => {
    visit('/terms')

    expect(await screen.findByRole('heading', { level: 1, name: 'Tight Arse terms of use' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Not financial advice' })).toBeInTheDocument()
    expect(document.title).toBe('Terms of use · Tight Arse')
  })
})

describe('legal text', () => {
  test('headings, lists, tables, bold and code', () => {
    expect(parse('# Title\n\nOne\nline.\n\n- a\n- b\n  more\n\n1. x\n2. y\n\n| A | B |\n|---|---|\n| `c` | **d** |\n\n---')).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'One line.' },
      { kind: 'list', ordered: false, items: ['a', 'b more'] },
      { kind: 'list', ordered: true, items: ['x', 'y'] },
      { kind: 'table', head: ['A', 'B'], rows: [['`c`', '**d**']] },
      { kind: 'rule' },
    ])
  })

  test('stops before the notes for Ricky and the rule above them', () => {
    expect(publishable('# P\n\nText.\n\n---\n\n## Claims and where they are true\n\n| a |')).toBe('# P\n\nText.')
    expect(publishable('# P\n\nText.')).toBe('# P\n\nText.')
  })

  test('text that looks like markup stays text', () => {
    const { container } = render(<Markdown source={'Hello <img src=x onerror=alert(1)> **bold** `<b>`'} />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('code')).toHaveTextContent('<b>')
  })
})

describe('page meta', () => {
  function Page() {
    usePageMeta({ title: 'Pricing', description: 'About prices', path: '/pricing' })
    return null
  }

  test('is put back as it was when the page goes', () => {
    document.title = 'Before'
    const { unmount } = render(<Page />)
    expect(document.title).toBe('Pricing · Tight Arse')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'About prices')

    act(() => unmount())

    expect(document.title).toBe('Before')
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
    expect(og('og:title')).toBeUndefined()
  })
})
