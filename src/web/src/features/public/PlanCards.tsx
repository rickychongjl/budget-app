import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import buttonStyles from '../../ui/Button.module.css'
import { BillingToggle } from './BillingToggle'
import { offers, TRUST, type Billing, type Offer } from './billing'
import { CATALOGUE, price } from './catalogue'
import styles from './Public.module.css'

type Level = 2 | 3

type CardsProps = {
  billing: Billing
  // The plan names sit one level under the page's heading for this section.
  headingLevel: Level
  // One primary button per screen (MASTER 9). On "/" the hero already has it, so every card button is secondary there.
  primaryCta: boolean
}

// Stacked in the one centred column (MASTER 6 caps it at 480px, with no desktop layout), Premium first and highlighted.
export function PlanCards({ billing, headingLevel, primaryCta }: CardsProps) {
  return (
    <ul className={styles.planCards}>
      {offers(CATALOGUE, billing).map((offer) => (
        <li key={offer.plan}>
          <PlanCard offer={offer} headingLevel={headingLevel} primary={primaryCta && offer.badge !== undefined} />
        </li>
      ))}
    </ul>
  )
}

function PlanCard({ offer, headingLevel, primary }: { offer: Offer; headingLevel: Level; primary: boolean }) {
  const id = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const button = `${buttonStyles.button} ${primary ? buttonStyles.primary : buttonStyles.secondary} ${buttonStyles.fullWidth} ${styles.planButton}`

  return (
    <article aria-labelledby={id} className={offer.badge ? `${styles.planCard} ${styles.planHighlighted}` : styles.planCard}>
      <div className={styles.planHead}>
        <Heading id={id} className={styles.heading}>
          {offer.name}
        </Heading>
        {offer.badge && <span className={styles.planBadge}>{offer.badge}</span>}
      </div>
      <div>
        <p className={styles.planPrice}>
          <span className={`${styles.amount} num`}>{price(offer.amount)}</span>{' '}
          <span aria-hidden="true" className={styles.planPer}>
            / month
          </span>
          <span className="visually-hidden">a month</span>
        </p>
        <p className={styles.note}>
          <span className="num">{offer.billed}</span>
        </p>
        <p className={styles.note}>{offer.trial}</p>
      </div>
      <ul className={styles.planBullets}>
        {offer.bullets.map((bullet) => (
          <li key={bullet}>
            <Check aria-hidden="true" className={styles.planBulletIcon} />
            {bullet}
          </li>
        ))}
      </ul>
      <Link to={offer.cta.to} className={button}>
        {offer.cta.label}
      </Link>
      {offer.note && <p className={styles.note}>{offer.note}</p>}
    </article>
  )
}

type PickerProps = Omit<CardsProps, 'billing'>

// The toggle, the two cards and the lines a buyer looks for next to the buttons. Shared by "/" and /pricing.
export function PlanPicker({ headingLevel, primaryCta }: PickerProps) {
  const [billing, setBilling] = useState<Billing>('yearly')

  return (
    <div className={styles.picker}>
      <BillingToggle value={billing} onChange={setBilling} />
      <PlanCards billing={billing} headingLevel={headingLevel} primaryCta={primaryCta} />
      <ul className={styles.trust}>
        {TRUST.map((line) => (
          <li key={line}>
            <Check aria-hidden="true" className={styles.planBulletIcon} />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
