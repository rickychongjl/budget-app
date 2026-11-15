import { Check, Minus } from 'lucide-react'
import { Link } from 'react-router'
import type { PlanLimits } from '../../api/types'
import buttonStyles from '../../ui/Button.module.css'
import { Card } from '../../ui/Card'
import { BILLING_SOON, CATALOGUE, price } from './catalogue'
import styles from './Public.module.css'
import { PublicLayout } from './PublicLayout'
import { usePageMeta } from './usePageMeta'

const { free, premium, premiumPrice } = CATALOGUE

const DESCRIPTION = `Free for up to ${free.maxCategoriesPerCycle} categories in a cycle. Premium is ${price(premiumPrice.monthly)} a month or ${price(premiumPrice.yearly)} a year, with a ${premiumPrice.trialDays}-day free trial.`

const categories = (limits: PlanLimits) => (limits.maxCategoriesPerCycle === null ? 'Unlimited' : `Up to ${limits.maxCategoriesPerCycle}`)

const pastCycles = (limits: PlanLimits) =>
  limits.pastCyclesInReports === null ? 'Every past cycle' : limits.pastCyclesInReports === 1 ? 'The most recent one' : `The last ${limits.pastCyclesInReports}`

// Every row is worked out from the plan numbers the server enforces (catalogue.ts), never typed in.
const ROWS: { feature: string; free: string | boolean; premium: string | boolean }[] = [
  { feature: 'Categories in a cycle', free: categories(free), premium: categories(premium) },
  { feature: 'Past cycles on the Cycles page', free: pastCycles(free), premium: pastCycles(premium) },
  { feature: 'Trend chart across cycles', free: free.trendChart, premium: premium.trendChart },
  { feature: 'Works offline', free: true, premium: true },
  { feature: 'Export your data', free: true, premium: true },
  { feature: 'Delete your account', free: true, premium: true },
]

// Status as icon plus word (MASTER 1.4); neutral colours, because not having a feature is not a warning.
function Cell({ value }: { value: string | boolean }) {
  if (typeof value === 'string') {
    return <>{value}</>
  }
  const Icon = value ? Check : Minus
  return (
    <span className={styles.included}>
      <Icon aria-hidden="true" className={styles.includedIcon} />
      {value ? 'Included' : 'Not included'}
    </span>
  )
}

export function Pricing() {
  usePageMeta({ title: 'Pricing', description: DESCRIPTION, path: '/pricing' })

  return (
    <PublicLayout>
      <h1 className={styles.title}>Pricing</h1>

      <ul className={styles.plans}>
        <li>
          <Card>
            <div className={styles.plan}>
              <h2 className={styles.heading}>Free</h2>
              <p className={`${styles.amount} num`}>{price(0)}</p>
              <p className={styles.text}>Everything you need for this cycle, up to {free.maxCategoriesPerCycle} categories.</p>
            </div>
          </Card>
        </li>
        <li>
          <Card>
            <div className={styles.plan}>
              <h2 className={styles.heading}>Premium</h2>
              <p className={styles.amount}>
                <span className="num">{price(premiumPrice.monthly)}</span> a month
              </p>
              <p className={styles.text}>
                or <span className="num">{price(premiumPrice.yearly)}</span> a year, with a {premiumPrice.trialDays}-day free trial.
              </p>
            </div>
          </Card>
        </li>
      </ul>

      <div className={styles.tableScroll} tabIndex={0} role="region" aria-labelledby="compare">
        <table className={styles.compare}>
          <caption id="compare">What each plan includes</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Free</th>
              <th scope="col">Premium</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.feature}>
                <th scope="row">{row.feature}</th>
                <td>
                  <Cell value={row.free} />
                </td>
                <td>
                  <Cell value={row.premium} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>Prices are in Australian dollars and include GST. {BILLING_SOON}</p>
      <p className={styles.note}>Going down to Free never deletes anything: categories over the limit stay and can still be edited.</p>

      <div className={styles.actions}>
        <Link to="/signin" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.fullWidth}`}>
          Start free
        </Link>
      </div>
    </PublicLayout>
  )
}
