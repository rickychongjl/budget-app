import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { api } from '../../api/client'
import type { AuthOptions } from '../../api/types'
import { BrandMark } from '../../ui/BrandMark'
import { Button } from '../../ui/Button'
import styles from './SignIn.module.css'

// A refused Microsoft sign-in comes back as /signin?error=<code> (EntraSignIn.OnRemoteFailure). The codes are the
// server's; anything not listed gets the general message, so a new code never shows up as raw text.
const REFUSALS: Record<string, string> = {
  'auth.not-allowed': "This account isn't allowed to use this app.",
}
const REFUSED = "The sign-in didn't complete. Please try again."

type Props = { onSignedIn: () => Promise<void> }

export function SignIn({ onSignedIn }: Props) {
  const options = useQuery({ queryKey: ['auth-options'], queryFn: () => api.get<AuthOptions>('/auth/options'), staleTime: Infinity })
  const demo = useMutation({ mutationFn: () => api.post('/auth/demo'), onSuccess: onSignedIn })

  const refusal = new URLSearchParams(location.search).get('error')
  const problem = demo.error?.message ?? (refusal ? (REFUSALS[refusal] ?? REFUSED) : null)

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <BrandMark size="lg" />
        <h1 className={styles.title}>Tight Arse</h1>
        <p className={styles.lead}>A 30-day budget you can keep up with from your phone.</p>
      </header>

      {problem && (
        <p role="alert" className={styles.problem}>
          <CircleAlert aria-hidden="true" className={styles.problemIcon} />
          {problem}
        </p>
      )}

      <div className={styles.actions}>
        <Button fullWidth pending={demo.isPending} onClick={() => demo.mutate()}>
          Try the demo
        </Button>
        {options.data?.signIn.includes('entra') && (
          // A real navigation, not a fetch: the server redirects to Microsoft and back, and sets the cookie on the way.
          <a href="/auth/login" className={styles.microsoft}>
            <MicrosoftLogo />
            Sign in with Microsoft
          </a>
        )}
      </div>

      <p className={styles.note}>The demo is shared and resets every night. Nothing you enter there is kept.</p>
    </main>
  )
}

// MASTER 8: Microsoft's own logo and wording, unmodified, and the only third-party brand asset in the app. The four
// fills are Microsoft's brand colours, which is why they are not design tokens.
function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
