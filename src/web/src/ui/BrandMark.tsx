import styles from './BrandMark.module.css'

type Props = { size?: 'md' | 'lg' }

// The app icon itself (public/favicon.svg, which the PWA icons are rasterised from), so the mark in the app is never a
// second drawing that can drift from the one on the home screen. Always decorative: it sits beside a name that says it.
export function BrandMark({ size = 'md' }: Props) {
  return <img src="/favicon.svg" alt="" className={`${styles.mark} ${styles[size]}`} />
}
