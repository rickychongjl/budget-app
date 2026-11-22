import { CalendarRange, Plus, ReceiptText, Settings } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { AddTransactionSheet } from '../features/transactions/AddTransactionSheet'
import { ClosingBalancePrompt } from '../features/transactions/ClosingBalancePrompt'
import { countWaiting, useOutbox } from '../offline/useOutbox'
import { BrandMark } from '../ui/BrandMark'
import styles from './AppShell.module.css'
import { ConnectivityBanner } from './ConnectivityBanner'

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)

// MASTER 9, "App shell": connectivity banner, the routed screen (its own top bar, then scrolling content), tab bar.
// ponytail: tabs do not keep their own scroll position and history (MASTER 9). Every screen so far is one short list;
// add per-tab scroll restoration when a screen is long enough for it to be missed.
export function AppShell() {
  const [adding, setAdding] = useState(false)
  const waiting = countWaiting(useOutbox())

  return (
    <div className={styles.shell}>
      <ConnectivityBanner waiting={waiting} />

      <main className={styles.scroll}>
        <Outlet />
      </main>

      <nav aria-label="Main" className={styles.tabBar}>
        {/* NavLink sets aria-current="page" on the active tab. */}
        <NavLink to="/" end className={tabClass}>
          {/* The app mark stands in for a house: Home is the app's front page. */}
          <span className={styles.mark}>
            <BrandMark />
          </span>
          Home
        </NavLink>
        <NavLink to="/activity" className={tabClass}>
          <ReceiptText aria-hidden="true" />
          Activity
        </NavLink>
        {/* Not a route: adding happens over whatever screen you are on. The one tab without a caption: the raised
            circle is the label, and the accessible name says what it does. */}
        <div className={styles.addCell}>
          <button type="button" className={styles.add} aria-label="Add transaction" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
          </button>
        </div>
        <NavLink to="/cycles" className={tabClass}>
          <CalendarRange aria-hidden="true" />
          Cycles
        </NavLink>
        <NavLink to="/settings" className={tabClass}>
          <Settings aria-hidden="true" />
          Settings
        </NavLink>
      </nav>

      <AddTransactionSheet open={adding} onClose={() => setAdding(false)} />
      <ClosingBalancePrompt />
    </div>
  )
}
