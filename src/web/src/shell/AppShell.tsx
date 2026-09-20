import { CalendarRange, House, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Sheet } from '../ui/Sheet'
import styles from './AppShell.module.css'
import { ConnectivityBanner } from './ConnectivityBanner'

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)

// MASTER 9, "App shell": connectivity banner, the routed screen (its own top bar, then scrolling content), tab bar.
// ponytail: tabs do not keep their own scroll position and history (MASTER 9). Every screen so far is one short list;
// add per-tab scroll restoration when a screen is long enough for it to be missed.
export function AppShell() {
  const [adding, setAdding] = useState(false)

  return (
    <div className={styles.shell}>
      {/* The outbox count arrives with the offline store (M6 slice 7). */}
      <ConnectivityBanner waiting={0} />

      <main className={styles.scroll}>
        <Outlet />
      </main>

      <nav aria-label="Main" className={styles.tabBar}>
        {/* NavLink sets aria-current="page" on the active tab. */}
        <NavLink to="/" end className={tabClass}>
          <House aria-hidden="true" />
          Home
        </NavLink>
        {/* Not a route: adding happens over whatever screen you are on. */}
        <button type="button" className={styles.tab} onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add
        </button>
        <NavLink to="/cycles" className={tabClass}>
          <CalendarRange aria-hidden="true" />
          Cycles
        </NavLink>
        <NavLink to="/settings" className={tabClass}>
          <Settings aria-hidden="true" />
          Settings
        </NavLink>
      </nav>

      <Sheet open={adding} title="Add transaction" onClose={() => setAdding(false)}>
        <p className={styles.placeholder}>The keypad and category picker arrive in M6 slice 8.</p>
      </Sheet>
    </div>
  )
}
