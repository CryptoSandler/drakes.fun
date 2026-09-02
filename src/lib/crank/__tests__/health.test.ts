// The healthcheck is the only thing that notices a cranker that died quietly,
// so its failure case is the one that has to be exercised. A guard is not a
// guard until it has been seen to fail.

import { describe, expect, it } from 'vitest'
import { STALL_PERIODS, healthState, serveHealth } from '../health.ts'

const PERIOD = 3_600
const base = { periodSeconds: PERIOD, hoursFired: 0, hoursSettled: 0, startedAtMs: 0 }
const minutes = (n: number) => n * 60_000

describe('the health verdict', () => {
  it('is starting while it waits for its first boundary', () => {
    // A cranker deployed one minute past the hour waits 59 of them. Judging it
    // on "has it fired" would fail every fresh deploy.
    const state = healthState({ ...base, nowMs: minutes(59), lastFiredAtMs: undefined })
    expect(state.status).toBe('starting')
    expect(state.ok).toBe(true)
  })

  it('stalls when it never reaches a boundary at all', () => {
    const state = healthState({ ...base, nowMs: minutes(150), lastFiredAtMs: undefined })
    expect(state.status).toBe('stalled')
    expect(state.ok).toBe(false)
    expect(state.why).toMatch(/has not reached a boundary/)
  })

  it('is live within two periods of the last fire', () => {
    const now = minutes(600)
    const state = healthState({ ...base, nowMs: now, lastFiredAtMs: now - minutes(90) })
    expect(state.status).toBe('live')
    expect(state.ok).toBe(true)
    expect(state.staleForSeconds).toBe(5_400)
  })

  it('tolerates one hour spent entirely on retries', () => {
    // The reason the window is two periods and not one: an hour may legitimately
    // spend all of itself failing and retrying, and restarting the cranker in
    // the middle of that is worse than waiting.
    const now = minutes(600)
    const state = healthState({ ...base, nowMs: now, lastFiredAtMs: now - minutes(119) })
    expect(state.ok).toBe(true)
  })

  it('goes stalled past two periods', () => {
    const now = minutes(600)
    const state = healthState({ ...base, nowMs: now, lastFiredAtMs: now - minutes(121) })
    expect(state.status).toBe('stalled')
    expect(state.ok).toBe(false)
    expect(state.why).toMatch(/over 2 periods/)
  })

  it('scales with the schedule rather than a hardcoded hour', () => {
    // The devnet rig runs a 60-second period. A fixed two-hour tolerance would
    // call a rig that had been dead for an hour perfectly healthy.
    const now = minutes(600)
    const devnet = { ...base, periodSeconds: 60, nowMs: now, lastFiredAtMs: now - 121_000 }
    expect(healthState(devnet).ok).toBe(false)
    expect(healthState({ ...devnet, lastFiredAtMs: now - 119_000 }).ok).toBe(true)
    expect(STALL_PERIODS).toBe(2)
  })
})

describe('the endpoint', () => {
  const listen = async (input: Parameters<typeof healthState>[0]) => {
    const server = serveHealth(0, () => input)
    await new Promise((r) => server.server.once('listening', r))
    const address = server.server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    // Bound. `close: server.close` hands out a detached method: calling it
    // throws on `this`, the `finally` that closes the server fails, and the
    // server leaks for the rest of the run. Suspected in a one-off red where
    // this file's last test saw 200 where it asserts 404 — not reproduced, so
    // this is the defect that was actually found rather than a claimed cause.
    return { port: address.port, close: () => server.close() }
  }

  it('answers 200 when live and 503 when stalled', async () => {
    const now = minutes(600)
    const live = await listen({ ...base, nowMs: now, lastFiredAtMs: now - minutes(10) })
    try {
      const res = await fetch(`http://127.0.0.1:${live.port}/healthz`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await res.json()).toMatchObject({ ok: true, status: 'live' })
    } finally {
      await live.close()
    }

    const dead = await listen({ ...base, nowMs: now, lastFiredAtMs: now - minutes(300) })
    try {
      // The status code is the whole contract: a host that restarts on a bad
      // healthcheck does not read the body.
      const res = await fetch(`http://127.0.0.1:${dead.port}/healthz`)
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ ok: false, status: 'stalled' })
    } finally {
      await dead.close()
    }
  })

  it('answers nothing else', async () => {
    const now = minutes(600)
    const s = await listen({ ...base, nowMs: now, lastFiredAtMs: now })
    try {
      expect((await fetch(`http://127.0.0.1:${s.port}/`)).status).toBe(404)
      expect((await fetch(`http://127.0.0.1:${s.port}/metrics`)).status).toBe(404)
    } finally {
      await s.close()
    }
  })
})
