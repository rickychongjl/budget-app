import { expect, test as setup } from '@playwright/test'

// /auth/* allows five requests a minute per address, so the suite signs in once here and every spec starts from the
// saved cookie. The one spec that signs in through the screen (signin.spec.ts) starts signed out on purpose.
setup('sign in as the demo user', async ({ request }) => {
  // The request token comes in the body; the cookie half is HttpOnly and set by the same answer.
  const csrf = await request.get('/auth/csrf')
  expect(csrf.ok()).toBeTruthy()
  const { token } = (await csrf.json()) as { token: string }

  const signIn = await request.post('/auth/demo', { headers: { 'X-XSRF-TOKEN': token } })
  expect(signIn.status()).toBe(204)

  await request.storageState({ path: '.auth/demo.json' })
})
