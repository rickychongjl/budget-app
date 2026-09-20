import { setupServer } from 'msw/node'

// Starts empty: each test adds the handlers it needs with server.use(...).
export const server = setupServer()
