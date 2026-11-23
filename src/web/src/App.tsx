import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { NetworkError, ProblemError } from './api/client'
import { Activity } from './features/activity/Activity'
import { SessionGate } from './features/auth/SessionGate'
import { Categories } from './features/categories/Categories'
import { CycleDetail } from './features/cycles/CycleDetail'
import { Cycles } from './features/cycles/Cycles'
import { Home } from './features/home/Home'
import { Onboarding } from './features/onboarding/Onboarding'
import { Privacy, Terms } from './features/public/Legal'
import { Pricing } from './features/public/Pricing'
import { Settings } from './features/settings/Settings'
import { OutboxSync } from './offline/OutboxSync'
import { UpdatePrompt } from './pwa/UpdatePrompt'
import { AppShell } from './shell/AppShell'
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
        <UpdatePrompt />
        <BrowserRouter>
          <Routes>
            {/* Public pages (decision D4): they need no session and no server, so they render for anyone, signed in or
                out, and offline from the precached app shell. "/" is public too, but only signed out (SessionGate). */}
            <Route path="pricing" element={<Pricing />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="*" element={<SignedInApp />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

// Signed out, "/" is the landing page and every other path the sign-in screen; the routes below exist only for someone
// signed in.
function SignedInApp() {
  return (
    <SessionGate>
      <OutboxSync />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="activity" element={<Activity />} />
          <Route path="cycles" element={<Cycles />} />
          <Route path="cycles/:id" element={<CycleDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/categories" element={<Categories />} />
          <Route path="onboarding" element={<Onboarding />} />
        </Route>
        {/* /signin once signed in, and anything unknown, goes Home. The server has already answered /api and /auth. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionGate>
  )
}
