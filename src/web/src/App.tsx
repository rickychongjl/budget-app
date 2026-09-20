import { lazy, Suspense } from 'react'

// Dev only. import.meta.env.DEV is replaced with `false` in a production build, so the page and everything only it
// imports are dropped from the bundle.
const Kit = import.meta.env.DEV ? lazy(() => import('./dev/Kit')) : null

// Placeholder until the shell arrives (M6 slice 5). It proves the build, the host and the test tooling end to end.
export default function App() {
  if (Kit && location.pathname === '/kit') {
    return (
      <Suspense>
        <Kit />
      </Suspense>
    )
  }

  return (
    <main>
      <h1>Budget</h1>
    </main>
  )
}
