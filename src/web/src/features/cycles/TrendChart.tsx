import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatRange } from '../../format/dates'
import { formatCompactMoney, formatMoney } from '../../format/money'
import { cssColour, useThemeChange } from '../../theme/cssColour'
import { toSlot } from '../../ui/slots'
import styles from './Trend.module.css'
import { niceTicks, type TrendFilter, type TrendPoint } from './trend'

// MASTER 3.4: a slot's line style, so four lines would still be told apart without colour. One line today, but the
// style is applied now so adding more is a loop rather than a redesign.
const DASH: Record<string, string | undefined> = {
  blue: undefined, pink: undefined,
  orange: '6 4', teal: '6 4',
  violet: '1 4', ochre: '1 4',
  cyan: '8 4 1 4', slate: '8 4 1 4',
}

type Props = {
  series: TrendPoint[]
  filter: TrendFilter
  currency: string
  today: string
  label: string
  colour: string
}

// Recharts, drawn as SVG (MASTER 10). Loaded only when a chart is actually shown, so the library stays out of the
// entry chunk. Everything it needs to decide has been decided in trend.ts.
export default function TrendChart({ series, filter, currency, today, label, colour }: Props) {
  // A tap, never a hover: the tooltip is state, and tapping the same point again puts it away.
  const [open, setOpen] = useState<string>()
  useThemeChange()

  const values = series.map((point) => point.value).filter((value): value is number => value !== null)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const stroke = colour === 'primary' ? cssColour('--color-primary') : cssColour(`--cat-${toSlot(colour)}`)
  const muted = cssColour('--color-text-muted')
  const selected = series.find((point) => point.cycleId === open)

  return (
    <div className={styles.chart}>
      <div role="img" aria-label={label} className={styles.canvas}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={cssColour('--color-border')} horizontal vertical={false} />
            <XAxis dataKey="label" stroke={muted} tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              ticks={ticks}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              tickFormatter={(value: number) => formatCompactMoney(value, currency)}
              stroke={muted}
              tickLine={false}
              axisLine={false}
              width={56}
              fontSize={12}
            />
            {/* Accrued goes below zero, so the baseline says which side of nothing a cycle finished on. */}
            {filter.kind === 'accrued' && <ReferenceLine y={0} stroke={cssColour('--color-border-strong')} />}
            <Line
              type="linear"
              dataKey="value"
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray={colour === 'primary' ? undefined : DASH[toSlot(colour)]}
              // A gap is a gap: joining across it would invent a cycle's worth of data.
              connectNulls={false}
              isAnimationActive={false}
              dot={({ key, cx, cy, payload }) => <Dot key={key} cx={cx} cy={cy} point={payload as TrendPoint} colour={stroke} onPick={setOpen} />}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {selected && (
        <p className={styles.tooltip} role="status">
          <span>{formatRange(selected.start, selected.end, today)}</span>
          <span className="num">
            {selected.value === null ? 'Not known yet' : formatMoney(selected.value, currency, { sign: filter.kind === 'accrued' })}
            {selected.partial && ' so far'}
          </span>
        </p>
      )}
    </div>
  )
}

// 4px of ink inside a 44px target (MASTER 10), and a real button so a keyboard reaches every point.
function Dot({ cx, cy, point, colour, onPick }: { cx?: number; cy?: number; point?: TrendPoint; colour: string; onPick: (id?: string) => void }) {
  if (cx === undefined || cy === undefined || !point || point.value === null) {
    return null
  }

  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={colour} />
      <circle
        cx={cx}
        cy={cy}
        r={22}
        fill="transparent"
        role="button"
        tabIndex={0}
        aria-label={point.label}
        onClick={() => onPick(point.cycleId)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPick(point.cycleId)
          }
        }}
      />
    </g>
  )
}
