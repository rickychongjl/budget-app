import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { TrendSection } from './TrendSection'
import type { TrendFilter, TrendPoint } from './trend'

const TODAY = '2026-09-20'

const point = (label: string, start: string, value: number | null, partial = false): TrendPoint => ({
  cycleId: label, label, start, end: start, value, partial,
})

const SERIES = [
  point('13 Jun', '2026-06-13', 500),
  point('13 Jul', '2026-07-13', 640),
  point('12 Aug', '2026-08-12', 460),
  point('11 Sep', '2026-09-11', 120, true),
]

const SPENDING: TrendFilter = { kind: 'spending' }

const show = (series: TrendPoint[], filter: TrendFilter = SPENDING) =>
  render(<TrendSection series={series} filter={filter} currency="AUD" today={TODAY} />)

// The chart is a lazy chunk, and the first import of Recharts here is transformed from source, which takes several
// seconds on a cold run. In a browser it is a fetch; the wait is the test runner's, not the product's.
const findChart = () => screen.findByRole('img', { name: /Spending/ }, { timeout: 30_000 })

describe('TrendSection', () => {
  test('says in one sentence what the chart shows (MASTER 10)', () => {
    show(SERIES)

    expect(screen.getByText('Spending fell 8% over the last 3 cycles.')).toBeInTheDocument()
  })

  test('the chart is an image with a name, for anyone who cannot see it', async () => {
    show(SERIES)

    expect(await findChart()).toBeInTheDocument()
  })

  test('with fewer than three points there is no line to read, so the values are cards', () => {
    show(SERIES.slice(0, 2))

    expect(screen.getByText('$500.00')).toBeInTheDocument()
    expect(screen.getByText('$640.00')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Spending/ })).not.toBeInTheDocument()
  })

  test('a filter with only two known values is cards even when another filter would have a line', () => {
    show([point('13 Jun', '2026-06-13', 120), point('13 Jul', '2026-07-13', null), point('12 Aug', '2026-08-12', 80)])

    expect(screen.queryByRole('img', { name: /Spending/ })).not.toBeInTheDocument()
  })

  test('the same data can be read as a table, and the toggle says which it is', async () => {
    show(SERIES)
    const toggle = screen.getByRole('button', { name: 'View as table' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('13 Jun to 13 Jun')
    expect(within(rows[0]).getByRole('cell')).toHaveTextContent('$500.00')
  })

  test('the cycle still being spent is marked, so its smaller number is not read as a fall', async () => {
    show(SERIES)

    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[3]).toHaveTextContent('so far')
    expect(rows[2]).not.toHaveTextContent('so far')
  })

  test('money accrued keeps its sign in the table, and a cycle without a closing balance is a dash', async () => {
    show([point('13 Jun', '2026-06-13', 120), point('13 Jul', '2026-07-13', -50), point('12 Aug', '2026-08-12', null)], { kind: 'accrued' })

    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByRole('cell')).toHaveTextContent('+$120.00')
    expect(within(rows[1]).getByRole('cell')).toHaveTextContent('−$50.00')
    expect(within(rows[2]).getByRole('cell')).toHaveTextContent('—')
  })

  test('nothing to plot says so rather than drawing an empty axis', () => {
    show([])

    expect(screen.getByText('No finished cycles to chart yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View as table' })).not.toBeInTheDocument()
  })

  test('the chart is only loaded when it is shown', async () => {
    show(SERIES)
    await findChart()

    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))

    await waitFor(() => expect(screen.queryByRole('img', { name: /Spending/ })).not.toBeInTheDocument())
  })
})
