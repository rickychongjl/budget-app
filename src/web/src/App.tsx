import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Hammer } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { NetworkError, ProblemError } from './api/client'
import { SessionGate } from './features/auth/SessionGate'
import { Categories } from './features/categories/Categories'
import { CycleDetail } from './features/cycles/CycleDetail'
import { Cycles } from './features/cycles/Cycles'
import { Home } from './features/home/Home'
import { Settings } from './features/settings/Settings'
import { CategoryTransactions } from './features/transactions/CategoryTransactions'
import { OutboxSync } from './offline/OutboxSync'
import { AppShell } from './shell/AppShell'
import { Screen } from './shell/Screen'
import { EmptyState } from './ui/EmptyState'
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
        {/* Signed out, every path shows the sign-in screen; the routes below exist only for someone signed in. */}
        <SessionGate>
          <OutboxSync />
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="cycles" element={<Cycles />} />
                <Route path="cycles/:id" element={<CycleDetail />} />
                <Route path="cycles/:cycleId/categories/:categoryId" element={<CategoryTransactions />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/categories" element={<Categories />} />
                <Route path="onboarding" element={<ComingSoon title="Set up" />} />
              </Route>
              {/* /signin once signed in, and anything unknown, goes Home. The server has already answered /api and /auth. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SessionGate>
      </ToastProvider>
    </QueryClientProvider>
  )
}

// A routed screen that a later M6 slice fills in.
function ComingSoon({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <EmptyState icon={Hammer}>This screen is still being built.</EmptyState>
    </Screen>
  )
}
