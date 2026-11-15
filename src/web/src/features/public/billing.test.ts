import { describe, expect, test } from 'vitest'
import type { PlanCatalogue } from '../../api/types'
import { offers, yearlyPerMonth, yearlySaving } from './billing'
import { CATALOGUE, FREE_CTA, PREMIUM_CTA, price } from './catalogue'

const custom: PlanCatalogue = {
  free: { maxCategoriesPerCycle: 10, pastCyclesInReports: 3, trendChart: false },
  premium: { maxCategoriesPerCycle: null, pastCyclesInReports: null, trendChart: true },
  premiumPrice: { currency: 'AUD', monthly: 5, yearly: 48, trialDays: 7 },
}

describe('yearly price per month', () => {
  test('is rounded up to the cent, so the page never quotes less than the store charges', () => {
    expect(yearlyPerMonth(29.99)).toBe(2.5)
    expect(yearlyPerMonth(12.01)).toBe(1.01)
    expect(yearlyPerMonth(29.95)).toBe(2.5)
  })

  test('is exact when the year divides evenly, with no floating-point creep', () => {
    expect(yearlyPerMonth(36)).toBe(3)
    expect(yearlyPerMonth(48)).toBe(4)
    expect(yearlyPerMonth(0.12)).toBe(0.01)
  })
})

describe('yearly saving', () => {
  test('is against twelve monthly payments, rounded down so it never claims more than there is', () => {
    expect(yearlySaving(3.99, 29.99)).toBe(37)
    expect(yearlySaving(3, 30)).toBe(16)
    expect(yearlySaving(10, 60)).toBe(50)
  })

  test('is zero when a year costs as much as twelve months or more', () => {
    expect(yearlySaving(10, 120)).toBe(0)
    expect(yearlySaving(10, 130)).toBe(0)
  })
})

describe('offers', () => {
  test('yearly by default puts Premium first and highlighted, priced per month from the yearly price', () => {
    const [premium, free] = offers(CATALOGUE, 'yearly')

    expect(premium.plan).toBe('premium')
    expect(premium.badge).toBe('Best value')
    expect(premium.amount).toBe(yearlyPerMonth(CATALOGUE.premiumPrice.yearly))
    expect(premium.billed).toBe(`${price(CATALOGUE.premiumPrice.yearly)} billed yearly`)
    expect(premium.trial).toContain(`${CATALOGUE.premiumPrice.trialDays}-day free trial`)
    expect(free.plan).toBe('free')
    expect(free.badge).toBeUndefined()
    expect(free.amount).toBe(0)
  })

  test('monthly prices Premium at the monthly price', () => {
    const [premium, free] = offers(CATALOGUE, 'monthly')

    expect(premium.amount).toBe(CATALOGUE.premiumPrice.monthly)
    expect(premium.billed).toBe('Billed monthly')
    expect(free.amount).toBe(0)
  })

  test('the bullets say outcomes, worked out from the plan limits', () => {
    const [premium, free] = offers(CATALOGUE, 'yearly')

    expect(premium.bullets).toEqual(['Unlimited categories', 'Every past cycle and the trend chart', 'Everything in Free'])
    expect(free.bullets).toEqual([
      `Up to ${CATALOGUE.free.maxCategoriesPerCycle} categories per cycle`,
      'Works offline',
      'Export or delete your data any time',
    ])
  })

  test('follow the catalogue rather than any number typed into the page', () => {
    const [yearly, free] = offers(custom, 'yearly')
    const [monthly] = offers(custom, 'monthly')

    expect(yearly.amount).toBe(4)
    expect(yearly.billed).toBe('A$48.00 billed yearly')
    expect(yearly.trial).toContain('7-day free trial')
    expect(monthly.amount).toBe(5)
    expect(free.bullets[0]).toBe('Up to 10 categories per cycle')
    expect(yearlySaving(custom.premiumPrice.monthly, custom.premiumPrice.yearly)).toBe(20)
  })

  test('both buttons go to sign-in, and Premium promises no purchase or trial while billing is not live', () => {
    const [premium, free] = offers(CATALOGUE, 'yearly')

    expect(free.cta).toEqual(FREE_CTA)
    expect(free.cta).toEqual({ label: 'Start free', to: '/signin' })
    expect(premium.cta).toEqual(PREMIUM_CTA)
    expect(premium.cta.to).toBe('/signin')
    expect(premium.cta.label).not.toMatch(/trial|buy|subscribe|upgrade now/i)
    expect(premium.note).toBe('Premium is coming with the mobile apps.')
  })
})
