import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, watchSystem } from './theme/theme.ts'

// index.html has already set the theme before first paint; this keeps it live when the system setting changes.
applyTheme()
watchSystem()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
