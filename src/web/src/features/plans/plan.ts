import type { Me, PlanLimits } from '../../api/types'

// The plan as GET /api/me reported it. The server enforces every limit; these only decide what the screens draw locked.
// An answer with no plan fields (cached by the service worker before plans existed) locks nothing.
const UNLIMITED: PlanLimits = { maxCategoriesPerCycle: null, pastCyclesInReports: null, trendChart: true }

export function limitsOf(me: Me): PlanLimits {
  return me.limits ?? UNLIMITED
}

export function isFree(me: Me) {
  return me.plan === 'free'
}

// How many more categories this cycle may take, or null when there is no limit.
export function categoriesLeft(me: Me, inCycle: number): number | null {
  const max = limitsOf(me).maxCategoriesPerCycle
  return max === null ? null : Math.max(0, max - inCycle)
}

// Said wherever something is locked: there is nothing to buy yet (the store billing comes with the native app).
export const PREMIUM_SOON = 'Premium is coming soon in the app.'

// The code the API gives a refused category add (Entitlement.EnsureCanAddCategory).
export const CATEGORY_LIMIT_CODE = 'plan.limit.categories'
