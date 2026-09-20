import type { CategoryRollup, CycleSummary } from '../../api/types'
import { formatDate } from '../../format/dates'
import { formatMoney } from '../../format/money'

// The trend chart's arithmetic, with no React and no Recharts in it: what to plot, what to call it, and what the
// sentence above it says (MASTER 10, story "Reporting 3").

export type TrendFilter =
  | { kind: 'spending' }
  | { kind: 'accrued' }
  | { kind: 'category'; categoryId: string; name?: string }

export type TrendPoint = {
  cycleId: string
  label: string
  start: string
  end: string
  // null is a gap, not a zero: accrued before a closing balance is entered, or a category a cycle did not have.
  value: number | null
  // The cycle being lived in. It is drawn, because it is the number people most want, but it is never compared:
  // three days of spending against a finished cycle would read as a crash.
  partial: boolean
}

// Confirmed cycles that have been lived in. An upcoming cycle has spent nothing and would drag the line to zero;
// a Draft is not a cycle yet.
const plotted = (report: CycleSummary[]) =>
  report.filter(({ cycle }) => cycle.status === 'Confirmed' && cycle.phase !== 'Future')

function valueOf(summary: CycleSummary, filter: TrendFilter): number | null {
  if (filter.kind === 'spending') {
    return summary.rollup.debitsActual
  }
  if (filter.kind === 'accrued') {
    return summary.rollup.accrued
  }
  return summary.rollup.categories.find((row) => row.categoryId === filter.categoryId)?.actual ?? null
}

export function toSeries(report: CycleSummary[], filter: TrendFilter, today: string): TrendPoint[] {
  return plotted(report)
    .slice()
    .sort((a, b) => a.cycle.startDate.localeCompare(b.cycle.startDate))
    .map((summary) => ({
      cycleId: summary.cycle.id,
      label: formatDate(summary.cycle.startDate, today),
      start: summary.cycle.startDate,
      end: summary.cycle.endDate,
      value: valueOf(summary, filter),
      partial: summary.cycle.phase === 'Current',
    }))
}

export type TrendCategory = { id: string; name: string; colour: string; type: CategoryRollup['type'] }

// The chips under the Category filter. Named and coloured by the newest cycle that had the category, because that is
// what the person calls it now; GET /api/categories would be a second request and carries no colour for the line.
export function categoriesOf(report: CycleSummary[]): TrendCategory[] {
  const seen = new Map<string, TrendCategory>()
  for (const summary of plotted(report).slice().sort((a, b) => a.cycle.startDate.localeCompare(b.cycle.startDate))) {
    for (const row of summary.rollup.categories) {
      seen.set(row.categoryId, { id: row.categoryId, name: row.name, colour: row.colour, type: row.type })
    }
  }

  // Spending before income, the order the rest of the app uses.
  return [...seen.values()].sort((a, b) => Number(a.type === 'Credit') - Number(b.type === 'Credit'))
}

const noun = (filter: TrendFilter) => (filter.kind === 'spending' ? 'Spending' : filter.kind === 'accrued' ? 'Money accrued' : (filter.name ?? 'This category'))

// MASTER 10: every chart has a one-sentence summary above it. Finished cycles only.
export function summarise(series: TrendPoint[], filter: TrendFilter, currency: string): string {
  const finished = series.filter((point) => !point.partial && point.value !== null).map((point) => point.value!)
  if (finished.length < 2) {
    return 'Not enough finished cycles to compare yet.'
  }

  const first = finished[0]
  const last = finished[finished.length - 1]
  const change = last - first
  if (Math.abs(change) < 0.005) {
    return `${noun(filter)} held steady over the last ${finished.length} cycles.`
  }

  const direction = change > 0 ? 'rose' : 'fell'
  // A percentage of a negative or of nothing says nothing, and accrued crosses zero by nature, so those are money.
  const percent = filter.kind !== 'accrued' && first > 0 ? Math.round((change / first) * 100) : null
  const size = percent !== null && percent !== 0 ? `${Math.abs(percent)}%` : formatMoney(Math.abs(change), currency)

  return `${noun(filter)} ${direction} ${size} over the last ${finished.length} cycles.`
}

// A step people read easily: 1, 2, 2.5 or 5 times a power of ten.
function step(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude
  return (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) * magnitude
}

// At most four ticks (MASTER 10). The axis fits the data rather than starting at zero: four cycles of household
// spending sit in a narrow band well above nothing, and anchoring at zero squashes them into a flat line, which is
// the one thing a trend chart must not do. Zero still appears whenever the series crosses it, and `includeZero`
// forces it for money accrued, whose baseline MASTER 10 requires.
export function niceTicks(min: number, max: number, { includeZero = false } = {}): number[] {
  let low = includeZero ? Math.min(0, min) : min
  let high = includeZero ? Math.max(0, max) : max

  if (low === high) {
    // A category billed the same every cycle (rent) is a flat line. With no range there is no axis, so it gets a
    // band around itself and sits in the middle, rather than being pinned to the top of an axis that reads "$0".
    if (low === 0) {
      return [0]
    }
    const padding = Math.abs(low) / 10
    low -= padding
    high += padding
  }

  let size = step((high - low) / 3)
  let ticks: number[] = []
  // Three intervals can still round to five ticks once both ends are widened to a whole step; doubling brings it back.
  for (let guard = 0; guard < 8; guard++) {
    // Rounded first: 640 / 250 is 2.5600000000000005 in binary, and a bare ceil would add a tick nobody needs.
    const round = (value: number) => Math.round(value * 1e6) / 1e6
    const first = Math.floor(round(low / size))
    const last = Math.ceil(round(high / size))
    ticks = []
    for (let multiple = first; multiple <= last; multiple++) {
      // Steps of 2.5 drift in binary, so each tick is put back on cents.
      ticks.push(Math.round(multiple * size * 100) / 100)
    }
    if (ticks.length <= 4) {
      break
    }
    size *= 2
  }

  return ticks
}
