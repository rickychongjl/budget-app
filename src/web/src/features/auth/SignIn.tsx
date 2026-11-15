import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { api } from '../../api/client'
import type { AuthOptions } from '../../api/types'
import { BrandMark } from '../../ui/BrandMark'
import { Button } from '../../ui/Button'
import styles from './SignIn.module.css'

// A refused Google sign-in comes back as /signin?error=<code> (OidcSignIn.OnRemoteFailure). The codes are the
// server's; anything not listed gets the general message, so a new code never shows up as raw text.
const REFUSALS: Record<string, string> = {
  'auth.email-unverified': "Your Google account's email address isn't verified yet. Verify it with Google, then try again.",
}
const REFUSED = "The sign-in didn't complete. Please try again."

type Props = { onSignedIn: () => Promise<void> }

export function SignIn({ onSignedIn }: Props) {
  const options = useQuery({ queryKey: ['auth-options'], queryFn: () => api.get<AuthOptions>('/auth/options'), staleTime: Infinity })
  const demo = useMutation({ mutationFn: () => api.post('/auth/demo'), onSuccess: onSignedIn })

  const refusal = new URLSearchParams(location.search).get('error')
  const problem = demo.error?.message ?? (refusal ? (REFUSALS[refusal] ?? REFUSED) : null)
  const google = options.data?.signIn.includes('google') ?? false

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
        {google && (
          // A real navigation, not a fetch: the server redirects to Google and back, and sets the cookie on the way.
          <a href="/auth/login" className={styles.google}>
            <GoogleMark />
            Continue with Google
          </a>
        )}
        {/* Signing up is the main way in when Google is offered; the demo is then the secondary choice beside it. */}
        <Button fullWidth variant={google ? 'secondary' : 'primary'} pending={demo.isPending} onClick={() => demo.mutate()}>
          Try the demo
        </Button>
      </div>

      <p className={styles.note}>The demo is shared and resets every night. Nothing you enter there is kept.</p>
    </main>
  )
}

// MASTER 8: Google's own "G" and wording ("Continue with Google"), unmodified, per Google's sign-in branding guidelines.
// The four fills are Google's brand colours, which is why they are not design tokens.
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
