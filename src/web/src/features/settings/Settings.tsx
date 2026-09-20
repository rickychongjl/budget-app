import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Screen } from '../../shell/Screen'
import { getPreference, setPreference, type ThemePreference } from '../../theme/theme'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { useToast } from '../../ui/useToast'
import { useSession } from '../auth/useSession'
import styles from './Settings.module.css'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

// The profile, the cycle start date and the categories link join in M6 slices 11 and 13.
export function Settings() {
  const { me, signOut } = useSession()
  const toast = useToast()
  const [theme, setTheme] = useState<ThemePreference>(getPreference)
  const [leaving, setLeaving] = useState(false)

  async function leave() {
    setLeaving(true)
    try {
      await signOut()
    } catch {
      setLeaving(false)
      toast.show({ message: "Couldn't sign out. Check your connection and try again.", tone: 'error' })
    }
  }

  return (
    <Screen title="Settings">
      <section className={styles.section}>
        <h2 className={styles.heading}>Appearance</h2>
        <SegmentedControl
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={(next) => {
            setTheme(next)
            setPreference(next)
          }}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Account</h2>
        <Card>
          <p className={styles.name}>{me.displayName}</p>
          <p className={styles.detail}>
            {me.isDemo ? 'Shared demo. It resets every night.' : `${me.timeZone} · ${me.currency}`}
          </p>
        </Card>
        <Button variant="secondary" icon={LogOut} pending={leaving} onClick={leave}>
          Sign out
        </Button>
      </section>
    </Screen>
  )
}
