import type { PlanCatalogue } from '../../api/types'
import plansJson from './plans.json?raw'

// GET /api/plans as it stood when this build was made. Kept in the bundle, not fetched, so /pricing renders signed out
// and offline. PublicPagesTests (Budget.Api.Tests) fails if this file and the server's Plans ever disagree, so the
// page only ever prints the numbers the server enforces.
export const CATALOGUE: PlanCatalogue = JSON.parse(plansJson) as PlanCatalogue

// "A$3.99": the price list is read by people outside Australia too, so the dollar is named.
export function price(amount: number, currency = CATALOGUE.premiumPrice.currency) {
  const prefix = currency === 'AUD' ? 'A$' : `${currency} `
  return `${prefix}${amount.toFixed(2)}`
}

// Said wherever Premium is priced: nothing can be bought yet.
export const BILLING_SOON = 'Premium is coming with the mobile apps, billed through the App Store and Google Play. It cannot be bought yet.'
