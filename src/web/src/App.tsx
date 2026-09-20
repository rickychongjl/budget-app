import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { NetworkError, ProblemError } from './api/client'
import { SessionGate } from './features/auth/SessionGate'
import { useSession } from './features/auth/useSession'
import { Button } from './ui/Button'
import { ToastProvider } from './ui/Toast'

// Dev only. import.meta.env.DEV is replaced with `false` in a production build, so the page and everything only it
// imports are dropped from the bundle.
const Kit = import.meta.env.DEV ? lazy(() => import('./dev/Kit')) : null

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A refusal (4xx) will be the same next time; only a dropped connection or a 5xx is worth another go.
        retry: (failures, error) => failures < 2 && (error instanceof NetworkError || (error instanceof ProblemError && error.status >= 500)),
      },
    },
  })
}

export default function App() {
  const [queryClient] = useState(newQueryClient)

  if (Kit && location.pathname === '/kit') {
    return (
      <Suspense>
        <Kit />
      </Suspense>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionGate>
          <SignedIn />
        </SessionGate>
      </ToastProvider>
    </QueryClientProvider>
  )
}

// Placeholder until the shell arrives (M6 slice 5).
function SignedIn() {
  const { me, signOut } = useSession()
  return (
    <main>
      <h1>Hello {me.displayName}</h1>
      <Button variant="secondary" onClick={signOut}>
        Sign out
      </Button>
    </main>
  )
}
