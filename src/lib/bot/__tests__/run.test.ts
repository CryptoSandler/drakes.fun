// The pass, driven through its own interface, with a sink that can misbehave in
// each of the ways a real one does.

import { describe, expect, it } from 'vitest'
import { runPass, type Cursor, type Settled } from '../run.ts'
import { AlreadyPosted, PublishFailed, RateLimited, type Sink } from '../sink.ts'
import { buildPost } from '../post.ts'

const settled = (hour: number): Settled => ({
  hour: BigInt(hour),
  post: buildPost(
    {
      hour: BigInt(hour), issued: true, pieceId: 1000 + hour,
      recipient: '2B7taMK2LvaJx7Rsf3cX4vUQAJbXbkX6FFH7Ud1ZfxHu',
      snapshotSlot: 491_686_001n, settled: true,
    },
    { cluster: 'mainnet', siteUrl: 'https://drakes.fun' },
  ),
})

function memoryCursor(start: bigint | null): Cursor & { writes: bigint[] } {
  let at = start
  const writes: bigint[] = []
  return {
    writes,
    read: async () => at,
    write: async (hour) => {
      at = hour
      writes.push(hour)
    },
  }
}

const okSink = (taken: string[]): Sink => ({
  name: 'test',
  publish: async (post) => {
    taken.push(post.hour.toString())
    return { via: 'test', id: `id-${post.hour}` }
  },
})

const noSleep = async () => {}

// The scan a fetch returns. `scannedThrough` defaults to the last hour in the
// list, which is what a fetch that found everything it looked at would say.
const scan = (pending: Settled[], scannedThrough?: bigint) => ({
  pending,
  scannedThrough: scannedThrough ?? pending[pending.length - 1]?.hour ?? null,
})

describe('a pass', () => {
  it('primes on an empty cursor and publishes nothing', async () => {
    // The property that keeps a first run from posting the whole history.
    const taken: string[] = []
    const cursor = memoryCursor(null)
    const report = await runPass({
      fetchAfter: async () => scan([settled(300)]),
      sink: okSink(taken), cursor, limit: 24, sleep: noSleep,
    })
    expect(report.stop).toBe('primed')
    expect(taken).toEqual([])
    expect(await cursor.read()).toBe(300n)
  })

  it('publishes in ascending order and leaves the cursor on the last one', async () => {
    const taken: string[] = []
    const cursor = memoryCursor(9n)
    const report = await runPass({
      fetchAfter: async () => scan([settled(12), settled(10), settled(11)]),
      sink: okSink(taken), cursor, limit: 24, sleep: noSleep,
    })
    expect(taken).toEqual(['10', '11', '12'])
    expect(report.posted).toBe(3)
    expect(await cursor.read()).toBe(12n)
  })

  it('writes the cursor after every post, not once at the end', async () => {
    // The restart property: a crash after the second post must not re-publish
    // the first. Falsified by moving the write out of the loop — this fails.
    const cursor = memoryCursor(0n)
    const sink: Sink = {
      name: 'test',
      publish: async (post) => {
        if (post.hour === 3n) throw new PublishFailed('gone', false)
        return { via: 'test' }
      },
    }
    const report = await runPass({
      fetchAfter: async () => scan([settled(1), settled(2), settled(3)]),
      sink, cursor, limit: 24, sleep: noSleep,
    })
    expect(report.stop).toBe('failed')
    expect(report.posted).toBe(2)
    expect(cursor.writes).toEqual([1n, 2n])
    expect(await cursor.read()).toBe(2n)
  })

  it('treats a duplicate as landed and moves past it', async () => {
    // Otherwise a bot that crashed between publishing and writing its cursor
    // is stuck on that hour forever.
    const cursor = memoryCursor(4n)
    const report = await runPass({
      fetchAfter: async () => scan([settled(5)]),
      sink: { name: 'test', publish: async () => { throw new AlreadyPosted() } },
      cursor, limit: 24, sleep: noSleep,
    })
    expect(report.stop).toBe('done')
    expect(report.repeats).toBe(1)
    expect(await cursor.read()).toBe(5n)
  })

  it('stops on a rate limit with the cursor on the last post that landed', async () => {
    const cursor = memoryCursor(0n)
    const sink: Sink = {
      name: 'test',
      publish: async (post) => {
        if (post.hour === 2n) throw new RateLimited(1_788_281_174)
        return { via: 'test' }
      },
    }
    const report = await runPass({
      fetchAfter: async () => scan([settled(1), settled(2), settled(3)]),
      sink, cursor, limit: 24, sleep: noSleep,
    })
    expect(report.stop).toBe('rate-limited')
    expect(report.resetAtUnix).toBe(1_788_281_174)
    expect(report.posted).toBe(1)
    expect(await cursor.read()).toBe(1n)
  })

  it('retries a retryable failure and gives up after the last attempt', async () => {
    let calls = 0
    const flaky: Sink = {
      name: 'test',
      publish: async () => {
        calls += 1
        if (calls < 3) throw new PublishFailed('503', true)
        return { via: 'test' }
      },
    }
    const slept: number[] = []
    const report = await runPass({
      fetchAfter: async () => scan([settled(1)]),
      sink: flaky, cursor: memoryCursor(0n), limit: 24,
      sleep: async (ms) => { slept.push(ms) },
    })
    expect(report.posted).toBe(1)
    expect(calls).toBe(3)
    expect(slept).toEqual([2000, 4000])

    const always: Sink = { name: 'test', publish: async () => { throw new PublishFailed('503', true) } }
    const gaveUp = await runPass({
      fetchAfter: async () => scan([settled(1)]),
      sink: always, cursor: memoryCursor(0n), limit: 24, attempts: 2, sleep: noSleep,
    })
    expect(gaveUp.stop).toBe('failed')
    expect(gaveUp.posted).toBe(0)
  })

  it('never publishes an hour at or behind the cursor', async () => {
    const taken: string[] = []
    const report = await runPass({
      fetchAfter: async () => scan([settled(5), settled(6)]),
      sink: okSink(taken), cursor: memoryCursor(5n), limit: 24, sleep: noSleep,
    })
    expect(taken).toEqual(['6'])
    expect(report.posted).toBe(1)
  })

  it('says so when there is nothing to publish', async () => {
    const report = await runPass({
      fetchAfter: async () => scan([]),
      sink: okSink([]), cursor: memoryCursor(5n), limit: 24, sleep: noSleep,
    })
    expect(report.stop).toBe('nothing-to-do')
    expect(report.cursor).toBe(5n)
  })

  it('moves the cursor past hours the cranker never opened', async () => {
    // The stall this exists to prevent: the cranker is down for longer than one
    // window, so every hour in that window is permanently absent. Without this
    // the bot rescans the same dead hours forever and never reaches the ones
    // that settled after the outage.
    const cursor = memoryCursor(100n)
    const report = await runPass({
      fetchAfter: async () => scan([], 124n),
      sink: okSink([]), cursor, limit: 24, sleep: noSleep,
    })
    expect(report.stop).toBe('nothing-to-do')
    expect(await cursor.read()).toBe(124n)
  })

  it('never moves the cursor backwards', async () => {
    const cursor = memoryCursor(100n)
    await runPass({
      fetchAfter: async () => scan([], 50n),
      sink: okSink([]), cursor, limit: 24, sleep: noSleep,
    })
    expect(await cursor.read()).toBe(100n)
  })

  it('accounts for an empty tail after the last post it published', async () => {
    const taken: string[] = []
    const cursor = memoryCursor(0n)
    const report = await runPass({
      fetchAfter: async () => scan([settled(1)], 24n),
      sink: okSink(taken), cursor, limit: 24, sleep: noSleep,
    })
    expect(taken).toEqual(['1'])
    expect(report.cursor).toBe(24n)
    expect(await cursor.read()).toBe(24n)
  })

  it('passes the limit down, so a backlog cannot become a burst', async () => {
    let asked = -1
    await runPass({
      fetchAfter: async (_after, limit) => { asked = limit; return scan([]) },
      sink: okSink([]), cursor: memoryCursor(1n), limit: 6, sleep: noSleep,
    })
    expect(asked).toBe(6)
  })
})
