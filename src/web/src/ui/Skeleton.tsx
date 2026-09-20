import styles from './Skeleton.module.css'

type Props = {
  // The size of what will replace it, so nothing jumps when the data arrives (MASTER 6).
  width?: string
  height: string
}

// Decorative: the screen that shows skeletons says "Loading" once, in words.
export function Skeleton({ width = '100%', height }: Props) {
  return <span aria-hidden="true" className={styles.skeleton} style={{ width, height }} />
}
