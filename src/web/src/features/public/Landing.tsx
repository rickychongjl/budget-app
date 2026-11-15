import { useMutation } from '@tanstack/react-query'
import { CalendarRange, CircleAlert, Gauge, WifiOff, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { useOnline } from '../../shell/useOnline'
import { Button } from '../../ui/Button'
import buttonStyles from '../../ui/Button.module.css'
import { Card } from '../../ui/Card'
import { CATALOGUE } from './catalogue'
import styles from './Public.module.css'
import { PublicLayout } from './PublicLayout'
import { usePageMeta } from './usePageMeta'

const DESCRIPTION = 'A 30-day budget you can keep up with from your phone. Works offline, installs on your home screen, free to start.'

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarRange,
    title: 'Budget in 30-day cycles',
    text: 'Start a cycle on payday, set what each category may spend, and the next cycle carries your categories forward.',
  },
  {
    icon: Gauge,
    title: 'See what is left at a glance',
    text: 'Every category shows what you have spent and what is left, and says so in words when you go over.',
  },
  {
    icon: WifiOff,
    title: 'Works with no signal',
    text: 'Add spending in the shop with no reception. It syncs when you are back online.',
  },
]

type Props = { onSignedIn: () => Promise<void> }

// "/" for someone signed out: what it is, three features, and the two ways in. "Start free" goes to the sign-in screen,
// which carries Google's own button (MASTER 8), rather than a second Google button here.
export function Landing({ onSignedIn }: Props) {
  usePageMeta({ title: 'Tight Arse', description: DESCRIPTION, path: '/' })
  const online = useOnline()
  const demo = useMutation({ mutationFn: () => api.post('/auth/demo'), onSuccess: onSignedIn })

  return (
    <PublicLayout>
      <section aria-labelledby="landing-title" className={styles.hero}>
        <h1 id="landing-title" className={styles.display}>
          Tight Arse
        </h1>
        <p className={styles.lead}>A 30-day budget you can keep up with from your phone.</p>
      </section>

      {demo.error && (
        <p role="alert" className={styles.problem}>
          <CircleAlert aria-hidden="true" className={styles.problemIcon} />
          {demo.error.message}
        </p>
      )}

      <div className={styles.actions}>
        <Link to="/signin" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.fullWidth}`}>
          Start free
        </Link>
        <Button fullWidth variant="secondary" pending={demo.isPending} disabled={!online} onClick={() => demo.mutate()}>
          Try the demo
        </Button>
        <p className={styles.note}>
          {online
            ? 'The demo is one shared account that everyone trying it can see, and it resets every night. Don’t enter anything real.'
            : 'Signing in and the demo need a connection.'}
        </p>
      </div>

      <section aria-labelledby="features" className={styles.section}>
        <h2 id="features" className={styles.heading}>
          What it does
        </h2>
        <ul className={styles.features}>
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card>
                <div className={styles.feature}>
                  <Icon aria-hidden="true" className={styles.featureIcon} />
                  <h3 className={styles.featureTitle}>{title}</h3>
                  <p className={styles.featureText}>{text}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.text}>
        Free for up to {CATALOGUE.free.maxCategoriesPerCycle} categories in a cycle, with export and account deletion always included.{' '}
        <Link to="/pricing" className={styles.inlineLink}>
          See pricing
        </Link>
      </p>
    </PublicLayout>
  )
}
