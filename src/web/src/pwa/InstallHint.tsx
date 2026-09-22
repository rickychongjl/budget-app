import { Download, Share } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { useInstallOffer } from './install'
import styles from './InstallHint.module.css'

// Design section 7, "Install": offered on Home, once, until it is dismissed or the app is installed. A card, not a
// dialog or a toast: it is an invitation, and it must not take the tap that was meant for the budget underneath.
export function InstallHint() {
  const { offer, install, dismiss } = useInstallOffer()

  if (!offer) {
    return null
  }

  return (
    <Card>
      <section aria-labelledby="install-hint" className={styles.hint}>
        <div className={styles.text}>
          <h2 id="install-hint" className={styles.title}>
            Add Budget to your Home Screen
          </h2>
          <p className={styles.detail}>
            {offer === 'ios' ? (
              <>
                Tap <Share aria-hidden="true" className={styles.inlineIcon} /> Share, then "Add to Home Screen". It opens full screen and works offline.
              </>
            ) : (
              'It opens full screen and works offline.'
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={dismiss}>
            {offer === 'ios' ? 'Got it' : 'Not now'}
          </Button>
          {offer === 'prompt' && (
            <Button variant="secondary" icon={Download} onClick={() => void install()}>
              Install
            </Button>
          )}
        </div>
      </section>
    </Card>
  )
}
