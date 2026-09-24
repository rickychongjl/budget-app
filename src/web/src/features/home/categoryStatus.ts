import type { CategoryRollup } from '../../api/types'
import { formatMoney } from '../../format/money'

export type CategoryStatus = {
  // Picks the bar fill and the text colour. The bar shows status, never the category's own colour.
  tone: 'normal' | 'warning' | 'negative' | 'positive'
  // A Lucide name, or nothing when the status is Normal. Status is always colour plus icon plus word.
  icon?: 'triangle-alert' | 'circle-alert' | 'check' | 'trending-up' | 'gauge'
  word: string
}

// At 80% of a spending limit the bar turns amber. Presentation only: it is not a rule the server knows about.
const WARNING_AT = 80

const cents = (amount: number) => Math.round(amount * 100) / 100

// MASTER 3.3, row for row. Whether a category is Over or Ahead is the API's call (CycleRollup.Line); this only decides
// how to show it, plus the three things the API has no word for: "nearly there", "received exactly" and "ahead of pace".
// elapsed is how much of the cycle is gone by the end of today (cycleElapsed), given for the current cycle only: pace
// is about today, so it is worked out here, where today is, and not in an answer that may be yesterday's.
export function categoryStatus(row: CategoryRollup, currency: string, elapsed?: number): CategoryStatus {
  const money = (amount: number) => formatMoney(amount, currency)

  if (row.type === 'Debit') {
    if (row.status === 'Over') {
      return { tone: 'negative', icon: 'circle-alert', word: `Over by ${money(-row.remaining)}` }
    }
    const word = `${money(row.remaining)} left`
    if (row.percentUsed !== null && row.percentUsed >= WARNING_AT) {
      return { tone: 'warning', icon: 'triangle-alert', word }
    }
    // Past the today line on the bar. Muted, not amber: a nudge, not an alarm, and it goes away as the days catch up.
    const ahead = elapsed === undefined || !row.spreadEvenly ? 0 : cents(row.actual - cents(row.budgeted * elapsed))
    return ahead > 0 ? { tone: 'normal', icon: 'gauge', word: `${money(ahead)} ahead of pace` } : { tone: 'normal', word }
  }

  if (row.status === 'Ahead') {
    return { tone: 'positive', icon: 'trending-up', word: `Ahead by ${money(-row.remaining)}` }
  }
  return row.budgeted > 0 && row.remaining === 0 ? { tone: 'positive', icon: 'check', word: 'Received' } : { tone: 'normal', word: `${money(row.remaining)} to go` }
}
