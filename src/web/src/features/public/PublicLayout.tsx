import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { BrandMark } from '../../ui/BrandMark'
import styles from './Public.module.css'

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
]

// The frame of the signed-out pages (decision D4): the mark and name, the page, and the four links. No tab bar: these
// pages are outside the app shell. The links are real anchors, so they work with JavaScript off for the parts that can.
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}>
          <BrandMark />
          Tight Arse
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <nav aria-label="About Tight Arse">
          <ul className={styles.links}>
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end className={styles.link}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </footer>
    </div>
  )
}
