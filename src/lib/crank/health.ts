// A liveness endpoint, so that "the process is still running" is something a
// host can check rather than something we assume.
//
// Caller: `scripts/crank-loop.ts`, when `PORT` is set (Railway sets it) or
// `--health-port` is passed. Railway's `healthcheckPath` points at `/healthz`.
//
// **Why this exists.** The devnet run of 2026-09-01 established that the
// scheduler fires on the boundary and nothing about a process that dies quietly
// at 03:00 — which is the failure the hosting batch is actually buying against.
// `Restart=always` and Railway's restart policy both need something to notice
// first.
//
// **The health verdict is derived, never set.** There is no `healthy = true`
// anywhere: the endpoint compares the last time the loop fired against the
// schedule's own period. A flag would keep reporting healthy from inside a loop
// that had stopped looping, which is precisely the state worth catching.

import { createServer, type Server } from 'node:http'

export interface HealthInput {
  nowMs: number
  /** When the loop last woke for an hour. `undefined` before the first one. */
  lastFiredAtMs?: number
  /** When the process started, so a fresh boot is not reported as stalled. */
  startedAtMs: number
  periodSeconds: number
  hoursFired: number
  hoursSettled: number
}

export interface HealthState {
  ok: boolean
  status: 'starting' | 'live' | 'stalled'
  why: string
  staleForSeconds: number | null
}

/**
 * Two periods of slack, and the reason for two rather than one is the retry
 * policy: a single hour may legitimately spend most of its window failing and
 * retrying, and reporting that as a dead process would restart a cranker in the
 * middle of the work it is doing.
 *
 * Three would be too kind — the whole point is to notice inside an hour or two,
 * not after a morning.
 */
export const STALL_PERIODS = 2

export function healthState(input: HealthInput): HealthState {
  const periodMs = input.periodSeconds * 1000
  const limit = periodMs * STALL_PERIODS

  if (input.lastFiredAtMs === undefined) {
    // Before the first boundary the loop is asleep on purpose, and a cranker
    // that starts one minute past the hour waits 59 of them. Judging it against
    // "has it fired" would fail every fresh deploy.
    const waiting = input.nowMs - input.startedAtMs
    return waiting < limit
      ? { ok: true, status: 'starting', why: 'waiting for the first boundary', staleForSeconds: null }
      : {
          ok: false,
          status: 'stalled',
          why: `up for ${Math.round(waiting / 1000)}s and has not reached a boundary`,
          staleForSeconds: Math.round(waiting / 1000),
        }
  }

  const stale = input.nowMs - input.lastFiredAtMs
  return stale < limit
    ? {
        ok: true,
        status: 'live',
        why: `last fired ${Math.round(stale / 1000)}s ago`,
        staleForSeconds: Math.round(stale / 1000),
      }
    : {
        ok: false,
        status: 'stalled',
        why: `last fired ${Math.round(stale / 1000)}s ago, over ${STALL_PERIODS} periods`,
        staleForSeconds: Math.round(stale / 1000),
      }
}

export interface HealthServer {
  server: Server
  close: () => Promise<void>
}

/**
 * Serves `/healthz`. 200 when live, **503 when stalled**, because a host that
 * restarts on a bad healthcheck needs a status code and not a field in a body
 * it does not read.
 *
 * Anything else is 404: this is a liveness endpoint on a process that holds a
 * signing key, and it answers exactly one question.
 */
export function serveHealth(port: number, read: () => HealthInput): HealthServer {
  const server = createServer((req, res) => {
    if (req.url !== '/healthz' && req.url !== '/healthz/') {
      res.writeHead(404).end()
      return
    }
    const state = healthState(read())
    const body = JSON.stringify({ ...state, checkedAt: new Date().toISOString() })
    res.writeHead(state.ok ? 200 : 503, {
      'content-type': 'application/json',
      // The answer is about this instant and must never be cached by anything
      // between the host and the process.
      'cache-control': 'no-store',
    })
    res.end(body)
  })
  server.listen(port)
  return {
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
