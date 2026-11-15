import { Check, ChevronDown, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { categories, pastCycles, yearlyPerMonth } from './billing'
import { BILLING_SOON, CATALOGUE, price } from './catalogue'
import { PlanPicker } from './PlanCards'
import styles from './Public.module.css'
import { PublicLayout } from './PublicLayout'
import { usePageMeta } from './usePageMeta'

const { free, premium, premiumPrice } = CATALOGUE

const DESCRIPTION = `Free for up to ${free.maxCategoriesPerCycle} categories in a cycle, no card needed. Premium is ${price(yearlyPerMonth(premiumPrice.yearly))} a month billed yearly (${price(premiumPrice.yearly)}), or ${price(premiumPrice.monthly)} billed monthly, and is coming with the mobile apps.`

// Every row is worked out from the plan numbers the server enforces (catalogue.ts), never typed in.
const ROWS: { feature: string; free: string | boolean; premium: string | boolean }[] = [
  { feature: 'Categories in a cycle', free: categories(free), premium: categories(premium) },
  { feature: 'Past cycles to look back on', free: pastCycles(free), premium: pastCycles(premium) },
  { feature: 'Trend chart', free: free.trendChart, premium: premium.trendChart },
  { feature: 'Works offline', free: true, premium: true },
  { feature: 'Export your data', free: true, premium: true },
  { feature: 'Delete your account', free: true, premium: true },
]

const freePast = free.pastCyclesInReports === 1 ? 'your most recent past cycle' : `your ${free.pastCyclesInReports} most recent past cycles`

// Each answer is checked against the code and docs/legal (terms "Plans and payment", privacy "Where your data is stored").
const FAQ: { question: string; answer: ReactNode }[] = [
  {
    question: 'Is Free really free?',
    answer: `Yes. Free is a plan, not a trial, and there is no time limit on it. It covers up to ${free.maxCategoriesPerCycle} categories in a cycle, ${freePast}, adding spending offline, and exporting or deleting your data.`,
  },
  {
    question: 'Do I need a card?',
    answer: 'No. You sign in with Google and that is all. We never collect card or payment details: when Premium launches, Apple or Google take the payment.',
  },
  {
    question: 'What happens if I go back to Free?',
    answer: `Nothing is deleted. You keep every category and can still edit or remove them, but you can't add more than ${free.maxCategoriesPerCycle} in a cycle. Older past cycles and the trend chart are left off the Cycles page until you upgrade again; the cycles stay in your account and your export.`,
  },
  {
    question: 'Where is my data stored?',
    answer: (
      <>
        In Australia: Microsoft Azure's Australia East region (Sydney), backups included. The{' '}
        <Link to="/privacy" className={styles.inlineLink}>
          privacy policy
        </Link>{' '}
        has the detail.
      </>
    ),
  },
  {
    question: 'Why does it cost less than other budgeting apps?',
    answer:
      'It never connects to your bank, so there are no bank-data fees to pass on. You type in what you spend, by design: it takes a few seconds, and it is how you notice where the money goes.',
  },
  { question: 'When can I buy Premium?', answer: `${BILLING_SOON} Until then, Free is yours to use as long as you like.` },
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
      <div className={styles.section}>
        <h1 className={styles.title}>Pricing</h1>
        <p className={styles.muted}>Free is a plan, not a trial, and needs no card. Premium adds unlimited categories, every past cycle and the trend chart.</p>
      </div>

      <PlanPicker headingLevel={2} primaryCta />

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

      <section aria-labelledby="faq" className={styles.section}>
        <h2 id="faq" className={styles.heading}>
          Questions
        </h2>
        <div className={styles.faq}>
          {FAQ.map(({ question, answer }) => (
            <details key={question} className={styles.faqItem}>
              <summary className={styles.faqQuestion}>
                <span>{question}</span>
                <ChevronDown aria-hidden="true" className={styles.faqIcon} />
              </summary>
              <p className={styles.faqAnswer}>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </PublicLayout>
  )
}
