import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resetCsrf } from '../api/client'
import type { SyncItem, SyncItemResult } from '../api/types'
import { server } from '../test/server'
import { db } from './db'
import { configureOutbox, drain, enqueue, onOutbox, stopOutbox, type OutboxEvent } from './outbox'

const create = (clientId: string, amount = 10): SyncItem => ({
  type: 'transaction.create',
  create: { clientId, cycleId: 'c1', categoryId: 'food', amount, occurredOn: '2026-09-20', note: null },
})
const BEFORE = { cycleId: 'c1', categoryId: 'food', amount: 10 }

// Records every batch posted and answers each item `ok` unless `refuse` names its clientId.
function syncEndpoint({ refuse = {} as Record<string, string> } = {}) {
  const batches: SyncItem[][] = []
  server.use(
    http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
    http.post('/api/sync', async ({ request }) => {
      const { items } = (await request.json()) as { items: SyncItem[] }
      batches.push(items)
      return HttpResponse.json(
        items.map((item, index): SyncItemResult => {
          const clientId = item.type === 'transaction.create' ? item.create.clientId : 'clientId' in item ? item.clientId : ''
          return refuse[clientId] ? { index, ok: false, code: refuse[clientId], detail: `Refused: ${refuse[clientId]}` } : { index, ok: true, result: { clientId } }
        }),
      )
    }),
  )
  return batches
}

const pendingIds = async () => (await db.outbox.orderBy('seq').toArray()).map((row) => (row.item.type === 'transaction.create' ? row.item.create.clientId : row.item.type))

let refresh: ReturnType<typeof vi.fn<() => Promise<void>>>
let events: OutboxEvent[]
let unsubscribe: () => void

beforeEach(async () => {
  resetCsrf()
  await db.outbox.clear()
  await db.cache.clear()
  refresh = vi.fn(async () => undefined)
  events = []
  unsubscribe = onOutbox((event) => events.push(event))
  await configureOutbox({ userId: 'u1', refresh, retryDelays: [20, 40] })
})

afterEach(() => {
  unsubscribe()
  stopOutbox()
})

describe('enqueue and drain', () => {
  test('a change is stored, sent in order, and gone once the server has it and the screen has been refreshed', async () => {
    const batches = syncEndpoint()

    await enqueue(create('a'))
    await enqueue(create('b'))
    await drain()

    expect(batches.flat().map((item) => (item.type === 'transaction.create' ? item.create.clientId : ''))).toEqual(['a', 'b'])
    expect(await pendingIds()).toEqual([])
    expect(refresh).toHaveBeenCalled()
    expect(events.filter((event) => event.type === 'synced')).toHaveLength(2)
  })

  test('only the sync item is sent; the local "before" stays on the device', async () => {
    const batches = syncEndpoint()

    await enqueue({ type: 'transaction.delete', clientId: 'server-tx' }, BEFORE)
    await drain()

    expect(batches.flat()).toEqual([{ type: 'transaction.delete', clientId: 'server-tx' }])
  })

  test('a refusal is final: the item is dropped and reported with the server\'s reason, and the rest go through', async () => {
    syncEndpoint({ refuse: { b: 'demo.cap.transactions' } })

    await enqueue(create('a'))
    await enqueue(create('b'))
    await enqueue(create('c'))
    await drain()

    expect(await pendingIds()).toEqual([])
    const refused = events.filter((event) => event.type === 'refused')
    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({ code: 'demo.cap.transactions', detail: 'Refused: demo.cap.transactions', item: create('b') })
  })

  test('two drains at once post once', async () => {
    const batches = syncEndpoint()
    await db.outbox.add({ userId: 'u1', item: create('a') })

    await Promise.all([drain(), drain(), drain()])

    expect(batches).toHaveLength(1)
  })

  test('a change queued while a drain is in flight is picked up by that same drain', async () => {
    const batches: SyncItem[][] = []
    server.use(
      http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
      http.post('/api/sync', async ({ request }) => {
        const { items } = (await request.json()) as { items: SyncItem[] }
        batches.push(items)
        if (batches.length === 1) {
          await db.outbox.add({ userId: 'u1', item: create('late') })
        }
        return HttpResponse.json(items.map((_, index) => ({ index, ok: true })))
      }),
    )
    await db.outbox.add({ userId: 'u1', item: create('a') })

    await drain()

    expect(batches).toHaveLength(2)
    expect(await pendingIds()).toEqual([])
  })
})

describe('when the server cannot be reached', () => {
  test('nothing is lost, and a timer tries again until it works', async () => {
    let attempts = 0
    server.use(
      http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
      http.post('/api/sync', async ({ request }) => {
        if (++attempts < 3) {
          return HttpResponse.error()
        }
        const { items } = (await request.json()) as { items: SyncItem[] }
        return HttpResponse.json(items.map((_, index) => ({ index, ok: true })))
      }),
    )

    await enqueue(create('a'))
    await drain()
    expect(await pendingIds()).toEqual(['a'])

    await vi.waitFor(async () => expect(await pendingIds()).toEqual([]), { timeout: 2000 })
    expect(attempts).toBe(3)
  })

  test('a 5xx is treated the same way', async () => {
    server.use(http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })), http.post('/api/sync', () => HttpResponse.json({ status: 503 }, { status: 503 })))

    await enqueue(create('a'))
    await drain()

    expect(await pendingIds()).toEqual(['a'])
    expect(events).toEqual([])
  })

  test('a 401 keeps the queue for after sign-in and does not hammer the server', async () => {
    let attempts = 0
    server.use(
      http.get('/auth/csrf', () => HttpResponse.json({ token: 't' })),
      http.post('/api/sync', () => {
        attempts++
        return HttpResponse.json({ status: 401, code: 'http.401' }, { status: 401 })
      }),
    )

    await enqueue(create('a'))
    await drain()
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(await pendingIds()).toEqual(['a'])
    expect(attempts).toBe(1)
  })

  test('offline, nothing is posted at all', async () => {
    const batches = syncEndpoint()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await enqueue(create('a'))
    await drain()

    expect(batches).toEqual([])
    expect(await pendingIds()).toEqual(['a'])
  })

  test('the timer stops once the queue is empty', async () => {
    const batches = syncEndpoint()
    await enqueue(create('a'))
    await drain()

    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(batches).toHaveLength(1)
  })
})

describe('after the server has accepted a change', () => {
  test('if the refresh fails the row stays (so the screen still shows it) but is never sent again', async () => {
    const batches = syncEndpoint()
    refresh.mockRejectedValueOnce(new Error('offline again'))

    await enqueue(create('a'))
    await drain()

    const [row] = await db.outbox.toArray()
    expect(row.syncedAt).toBeTypeOf('number')

    await drain()
    expect(batches).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('undo before it was sent', () => {
  test('deleting a transaction whose create is still queued cancels both, and its edits', async () => {
    const batches = syncEndpoint()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await enqueue(create('a'))
    await enqueue({ type: 'transaction.edit', clientId: 'a', edit: { amount: 12 } }, BEFORE)
    await enqueue(create('b'))

    await enqueue({ type: 'transaction.delete', clientId: 'a' }, BEFORE)

    expect(await pendingIds()).toEqual(['b'])
    expect(batches).toEqual([])
  })

  test('deleting one the server already has is queued like any other change', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await enqueue({ type: 'transaction.delete', clientId: 'server-tx' }, BEFORE)

    expect(await pendingIds()).toEqual(['transaction.delete'])
  })
})

describe('whose queue it is', () => {
  test('signing in as the same person keeps their queue; anyone else\'s is discarded, cache included', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await enqueue(create('mine'))
    await db.outbox.add({ userId: 'someone-else', item: create('theirs') })
    await db.cache.bulkAdd([
      { key: 'u1:me', userId: 'u1', json: {}, at: 1 },
      { key: 'x:me', userId: 'someone-else', json: {}, at: 1 },
    ])

    await configureOutbox({ userId: 'u1', refresh, retryDelays: [20] })

    expect(await pendingIds()).toEqual(['mine'])
    expect((await db.cache.toArray()).map((row) => row.key)).toEqual(['u1:me'])
  })

  test('only the signed-in user\'s rows are ever sent', async () => {
    const batches = syncEndpoint()
    await db.outbox.add({ userId: 'someone-else', item: create('theirs') })
    await enqueue(create('mine'))

    await drain()

    expect(batches.flat()).toEqual([create('mine')])
  })
})
