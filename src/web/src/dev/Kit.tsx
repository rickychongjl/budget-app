import { Car, Check, Gauge, House, Inbox, Plus, ShoppingCart, Trash2, TrendingUp, TriangleAlert, Utensils, Wallet, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { getPreference, setPreference, type ThemePreference } from '../theme/theme'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { IconChip } from '../ui/IconChip'
import { ProgressBar } from '../ui/ProgressBar'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Sheet } from '../ui/Sheet'
import { Skeleton } from '../ui/Skeleton'
import { SLOTS } from '../ui/slots'
import { StatusBadge } from '../ui/StatusBadge'
import { ToastProvider } from '../ui/Toast'
import { useToast } from '../ui/useToast'
import styles from './Kit.module.css'

// Dev only (see App.tsx): every ui/ component in every state, to run MASTER section 14 against before screens depend on
// them. Open http://localhost:5173/kit at phone width and flip the theme.
const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

const ICONS = [Utensils, House, Car, ShoppingCart, Zap, Wallet, TrendingUp, Inbox]

type Row = { name: string; value: number; tone: 'normal' | 'warning' | 'negative' | 'positive'; word: string; amount: string; icon?: LucideIcon; pace?: boolean }

// MASTER 3.3, one row each.
const STATUS_ROWS: Row[] = [
  { name: 'Food', value: 0.5, tone: 'normal', word: '$200.00 left', amount: '$200.00 / $400.00' },
  // Past the today line (0.4 on /kit) and under 80%: muted, with its icon. Only with the line on.
  { name: 'Groceries', value: 0.55, tone: 'normal', word: '$60.00 ahead of pace', amount: '$220.00 / $400.00', icon: Gauge, pace: true },
  { name: 'Transport', value: 0.85, tone: 'warning', word: '$30.00 left', amount: '$170.00 / $200.00', icon: TriangleAlert },
  { name: 'Eating out with a very long category name that must truncate', value: 1.05, tone: 'negative', word: 'Over by $20.00', amount: '$420.00 / $400.00' },
  { name: 'Salary', value: 0.5, tone: 'normal', word: '$2,500.00 to go', amount: '$2,500.00 / $5,000.00' },
  { name: 'Rent received', value: 1, tone: 'positive', word: 'Received', amount: '$800.00 / $800.00', icon: Check },
  { name: 'Interest', value: 1.2, tone: 'positive', word: 'Ahead by $4.00', amount: '$24.00 / $20.00', icon: TrendingUp },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

function Toasts() {
  const toast = useToast()
  return (
    <div className={styles.row}>
      <Button variant="secondary" onClick={() => toast.show({ message: 'Saved', action: { label: 'Undo', onAction: () => toast.show({ message: 'Undone' }) } })}>
        Saved + Undo
      </Button>
      <Button variant="secondary" onClick={() => toast.show({ message: "Couldn't save $30.00 Food: the demo is limited to 500 transactions.", tone: 'error' })}>
        Error
      </Button>
    </div>
  )
}

export default function Kit() {
  const [theme, setTheme] = useState<ThemePreference>(getPreference)
  const [type, setType] = useState<'debit' | 'credit'>('debit')
  const [sheet, setSheet] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [pending, setPending] = useState(false)
  // The current cycle's bars carry a today line; a past cycle's do not.
  const [todayLine, setTodayLine] = useState(true)

  return (
    <ToastProvider>
      <main className={styles.page}>
        <h1 className={styles.title}>UI kit</h1>

        <Section title="Theme">
          <SegmentedControl
            label="Theme"
            options={THEMES}
            value={theme}
            onChange={(next) => {
              setTheme(next)
              setPreference(next)
            }}
          />
        </Section>

        <Section title="Type">
          <p className={`${styles.display} num`}>$1,234.56</p>
          <p className={styles.textTitle}>Screen title</p>
          <p className={styles.heading}>Card heading</p>
          <p>Body text at 16px.</p>
          <p className={styles.label}>Label, secondary row text</p>
          <p className={styles.caption}>Caption: nothing is smaller</p>
        </Section>

        <Section title="Buttons">
          <Button icon={Plus} fullWidth pending={pending} onClick={() => { setPending(true); setTimeout(() => setPending(false), 1500) }}>
            Primary (tap: pending)
          </Button>
          <div className={styles.row}>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className={styles.row}>
            <Button variant="destructive" icon={Trash2}>Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Fields">
          <Field label="Opening balance" inputMode="decimal" placeholder="0.00" hint="What you have at the start of the cycle." />
          <Field label="Start date" type="date" />
          <Field label="Budget" inputMode="decimal" defaultValue="abc" error="Enter an amount, like 400.00" />
          <Field label="Disabled" disabled defaultValue="Read only in the demo" />
        </Section>

        <Section title="Segmented control">
          <SegmentedControl label="Type" options={[{ value: 'debit', label: 'Spending' }, { value: 'credit', label: 'Income' }]} value={type} onChange={setType} />
        </Section>

        <Section title="Category rows (status, MASTER 3.3)">
          <Button variant="secondary" aria-pressed={todayLine} onClick={() => setTodayLine(!todayLine)}>
            Today line (current cycle): {todayLine ? 'on' : 'off'}
          </Button>
          <Card>
            <div className={styles.rows}>
              {STATUS_ROWS.filter((row) => todayLine || !row.pace).map((row, index) => (
                <div key={row.name} className={styles.categoryRow}>
                  <IconChip icon={ICONS[index]} colour={SLOTS[index]} />
                  <div className={styles.categoryBody}>
                    <div className={styles.categoryTop}>
                      <span className={styles.categoryName}>{row.name}</span>
                      <span className={`${styles.amount} num`}>{row.amount}</span>
                    </div>
                    <ProgressBar value={row.value} tone={row.tone} label={`${row.name}: ${row.amount}, ${row.word}`} today={todayLine ? 0.4 : undefined} />
                    {row.tone === 'normal' ? (
                      <span className={styles.statusNormal}>
                        {row.icon && <row.icon aria-hidden="true" className={styles.statusIcon} />}
                        {row.word}
                      </span>
                    ) : (
                      <StatusBadge tone={row.tone} icon={row.icon}>
                        {row.word}
                      </StatusBadge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="App mark (top bar, Home tab, sign-in)">
          <div className={styles.row}>
            <BrandMark />
            <BrandMark size="lg" />
          </div>
        </Section>

        <Section title="Palette slots">
          <div className={styles.row}>
            {SLOTS.map((slot, index) => (
              <IconChip key={slot} icon={ICONS[index]} colour={slot} />
            ))}
          </div>
        </Section>

        <Section title="Badges">
          <div className={styles.row}>
            <StatusBadge tone="primary">Current</StatusBadge>
            <StatusBadge>Past</StatusBadge>
            <StatusBadge>Upcoming</StatusBadge>
            <StatusBadge>Draft</StatusBadge>
            <StatusBadge tone="positive">Ahead by $4.00</StatusBadge>
            <StatusBadge tone="negative">Over by $20.00</StatusBadge>
          </div>
        </Section>

        <Section title="Cards">
          <Card>A plain card.</Card>
          <Card onClick={() => undefined}>A tappable card has a chevron.</Card>
        </Section>

        <Section title="Loading and empty">
          <Card>
            <div className={styles.rows}>
              <Skeleton height="1.5rem" width="60%" />
              <Skeleton height="0.5rem" />
            </div>
          </Card>
          <EmptyState icon={Inbox} action={<Button>Set up your first cycle</Button>}>
            No budget yet. Set up your first cycle.
          </EmptyState>
        </Section>

        <Section title="Sheet, dialog, toast">
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
            <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
          </div>
          <Toasts />
        </Section>

        <Sheet open={sheet} title="Add transaction" onClose={() => setSheet(false)} footer={<Button fullWidth onClick={() => setSheet(false)}>Save</Button>}>
          <div className={styles.rows}>
            <Field label="Note" placeholder="Optional" />
            {Array.from({ length: 12 }, (_, index) => (
              <p key={index}>Row {index + 1}: the sheet scrolls inside itself, the page behind does not.</p>
            ))}
          </div>
        </Sheet>

        <Dialog
          open={dialog}
          title="Move the start date?"
          onClose={() => setDialog(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setDialog(false)}>Cancel</Button>
              <Button onClick={() => setDialog(false)}>Move</Button>
            </>
          }
        >
          This also moves every upcoming cycle. Past cycles stay as they are.
        </Dialog>
      </main>
    </ToastProvider>
  )
}
