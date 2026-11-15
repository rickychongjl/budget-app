import type { PlanCatalogue, PlanLimits, PlanName } from '../../api/types'
import { FREE_CTA, PREMIUM_CTA, PREMIUM_NOTE, premiumTrial, price } from './catalogue'

export type Billing = 'yearly' | 'monthly'

export type Offer = {
  plan: PlanName
  name: string
  badge?: string
  // Per month, in the catalogue's currency.
  amount: number
  billed: string
  trial: string
  bullets: string[]
  cta: { label: string; to: string }
  note?: string
}

// Whole cents, so the sums below are integer sums and 36 / 12 is 3, not 3.0000000000000004.
const cents = (amount: number) => Math.round(amount * 100)

// Rounded up to the cent, so the page never quotes less a month than the store will charge a year.
export function yearlyPerMonth(yearly: number) {
  return Math.ceil(cents(yearly) / 12) / 100
}

// Against twelve monthly payments, as a whole percentage rounded down, so it never claims more saving than there is.
export function yearlySaving(monthly: number, yearly: number) {
  const twelveMonths = cents(monthly) * 12
  return Math.max(0, Math.floor(((twelveMonths - cents(yearly)) * 100) / twelveMonths))
}

export const categories = (limits: PlanLimits) => (limits.maxCategoriesPerCycle === null ? 'Unlimited' : `Up to ${limits.maxCategoriesPerCycle}`)

export const pastCycles = (limits: PlanLimits) =>
  limits.pastCyclesInReports === null ? 'Every past cycle' : limits.pastCyclesInReports === 1 ? 'The most recent one' : `The last ${limits.pastCyclesInReports}`

// The two plan cards, Premium first (it is the one highlighted, and comes first on a phone). Every number comes from the
// catalogue the server enforces; only the words are written here.
export function offers({ free, premium, premiumPrice }: PlanCatalogue, billing: Billing): Offer[] {
  const yearly = billing === 'yearly'

  return [
    {
      plan: 'premium',
      name: 'Premium',
      badge: 'Best value',
      amount: yearly ? yearlyPerMonth(premiumPrice.yearly) : premiumPrice.monthly,
      billed: yearly ? `${price(premiumPrice.yearly, premiumPrice.currency)} billed yearly` : 'Billed monthly',
      trial: premiumTrial(premiumPrice.trialDays),
      bullets: [
        premium.maxCategoriesPerCycle === null ? 'Unlimited categories' : `Up to ${premium.maxCategoriesPerCycle} categories per cycle`,
        premium.trendChart ? `${pastCycles(premium)} and the trend chart` : pastCycles(premium),
        'Everything in Free',
      ],
      cta: PREMIUM_CTA,
      note: PREMIUM_NOTE,
    },
    {
      plan: 'free',
      name: 'Free',
      amount: 0,
      billed: 'Nothing to pay',
      trial: 'A plan, not a trial',
      bullets: [
        free.maxCategoriesPerCycle === null ? 'Unlimited categories' : `Up to ${free.maxCategoriesPerCycle} categories per cycle`,
        'Works offline',
        'Export or delete your data any time',
      ],
      cta: FREE_CTA,
    },
  ]
}

export const TRUST = ['Prices are in Australian dollars and include GST.', 'No card needed for Free.', 'Going back to Free never deletes anything.']
