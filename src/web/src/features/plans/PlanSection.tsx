import { api } from '../../api/client'
import type { Me, PlanCatalogue, PremiumSource } from '../../api/types'
import { formatMoney } from '../../format/money'
import { useCachedQuery } from '../../offline/useCachedQuery'
import { Card } from '../../ui/Card'
import { useSession } from '../auth/useSession'
import styles from './PlanSection.module.css'
import { PremiumNote } from './PremiumNote'
import { limitsOf } from './plan'

const WHY: Record<PremiumSource, string> = {
  demo: 'The demo shows every Premium feature.',
  complimentary: 'Complimentary on this account.',
  subscription: 'Through your subscription.',
}

// Settings, "Plan": which plan this account is on and, on Free, what Premium adds. Read-only: there is nothing to buy
// until the store billing lands with the native app, and managing a subscription comes with it.
export function PlanSection() {
  const { me } = useSession()

  // An answer cached before plans existed says nothing about the plan, so neither does this.
  if (!me.plan) {
    return null
  }

  return (
    <section aria-labelledby="plan" className={styles.section}>
      <h2 id="plan" className={styles.heading}>
        Plan
      </h2>
      {me.plan === 'premium' ? (
        <Card>
          <span className={styles.name}>Premium</span>
          <span className={styles.detail}>{me.planSource ? WHY[me.planSource] : 'Unlimited categories and every past cycle.'}</span>
        </Card>
      ) : (
        <FreePlan me={me} />
      )}
    </section>
  )
}

function FreePlan({ me }: { me: Me }) {
  // The same numbers the server enforces (GET /api/plans). Without an answer the prices are simply left out.
  const catalogue = useCachedQuery<PlanCatalogue>(['plans'], () => api.get<PlanCatalogue>('/api/plans'))
  const limits = limitsOf(me)
  const price = catalogue.data?.premiumPrice

  return (
    <>
      <Card>
        <span className={styles.name}>Free</span>
        <span className={styles.detail}>
          Up to {limits.maxCategoriesPerCycle} categories in a cycle, and your most recent past cycle in reports. Export and account deletion are always
          free.
        </span>
      </Card>
      <PremiumNote title="Unlimited categories and every past cycle">
        Premium also charts the trend across all your cycles.
        {price && (
          <>
            {' '}
            <span className="num">{formatMoney(price.monthly, price.currency)}</span> a month or{' '}
            <span className="num">{formatMoney(price.yearly, price.currency)}</span> a year, with a {price.trialDays}-day free trial.
          </>
        )}
      </PremiumNote>
    </>
  )
}
