import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// The reset-demo job, through the same image the stack runs. `--empty` leaves the demo as a first sign-in finds it.
export function resetDemo(mode: 'fixture' | 'empty' = 'fixture') {
  const job = ['dotnet', 'jobs/Budget.Jobs.dll', 'reset-demo', ...(mode === 'empty' ? ['--empty'] : [])].join(' ')
  execFileSync('docker', ['compose', 'run', '--rm', '--entrypoint', job, 'migrate'], { cwd: repoRoot, stdio: 'inherit' })
}

// Every run starts from the fixture. The specs share one demo user, so what one leaves behind the next would see.
export default function globalSetup() {
  resetDemo()
}
