import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import App from './App'
import { server } from './test/server'

test('a visitor with no session lands on the sign-in screen', async () => {
  server.use(
    http.get('/api/me', () => HttpResponse.json({ status: 401, code: 'http.401' }, { status: 401 })),
    http.get('/auth/options', () => HttpResponse.json({ signIn: ['demo'] })),
  )

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Tight Arse' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument()
})
