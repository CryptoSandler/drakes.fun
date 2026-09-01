// The claim is "it fires every hour, in the window, and retries inside it".
// A single successful run is not evidence of that (CLAUDE.md), and waiting 24
// hours in CI is not an option, so the clock is injected and the whole day
// runs in milliseconds.

import { describe, expect, it } from 'vitest'
import { DEFAULT_RETRY_DELAYS_MS, hourAt, runLoop, type HourReport } from '../loop.ts'
import { consoleSink, fallbackSink, render, telegramSink } from '../alert.ts'
import type { Schedule } from '../../protocol/schedule.ts'

const schedule: Schedule = { genesisUnix: 1_700_000_000, periodSeconds: 3_600 }

/**
 * A clock that jumps straight to whatever the loop is waiting for, and records
 * how long it slept. Nothing here takes real time.
 */
function fakeClock(startMs: number) {
  let now = startMs
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += Math.max(0, ms)
    },
    advance: (ms: number) => {
      now += ms
    },
    set: (ms: number) => {
      now = ms
    },
  }
}

function harness(overrides: {
  startMs: number
  settle: (hour: number, clock: ReturnType<typeof fakeClock>) => Promise<void>
  hours: number
  retryDelaysMs?: number[]
}) {
  const clock = fakeClock(overrides.startMs)
  const reports: HourReport[] = []
  const missed: HourReport[] = []
  return {
    clock,
    reports,
    missed,
    run: () =>
      runLoop({
        schedule,
        hours: overrides.hours,
        retryDelaysMs: overrides.retryDelaysMs,
        deps: {
          now: clock.now,
          sleep: clock.sleep,
          settle: (hour) => overrides.settle(hour, clock),
          onHour: (r) => {
            reports.push(r)
          },
          onMissed: (r) => {
            missed.push(r)
          },
        },
      }),
  }
}

describe('hourAt', () => {
  it('derives the index from the clock, exactly as the program does', () => {
    expect(hourAt(schedule, schedule.genesisUnix)).toBe(0)
    expect(hourAt(schedule, schedule.genesisUnix + 3_599)).toBe(0)
    expect(hourAt(schedule, schedule.genesisUnix + 3_600)).toBe(1)
    expect(hourAt(schedule, schedule.genesisUnix + 24 * 3_600)).toBe(24)
  })
})

describe('the loop over a full day', () => {
  it('fires 24 consecutive hours with zero jitter against the schedule', async () => {
    // Started 12 minutes into hour 100, which is the ordinary case: a deploy
    // does not land on a boundary.
    const start = (schedule.genesisUnix + 100 * 3_600 + 720) * 1_000
    const h = harness({ startMs: start, hours: 24, settle: async () => {} })
    await h.run()

    expect(h.reports).toHaveLength(24)
    // It starts at 101, not 100: the hour it launched inside had already opened.
    expect(h.reports.map((r) => r.hour)).toEqual(
      Array.from({ length: 24 }, (_, i) => 101 + i),
    )
    expect(h.reports.every((r) => r.settled)).toBe(true)
    expect(h.reports.map((r) => r.jitterMs)).toEqual(new Array(24).fill(0))
    expect(h.missed).toEqual([])
  })

  it('does not slide when one hour takes longer than a period', async () => {
    // The failure a `hour += 1` loop has: an overrun makes it fall one behind
    // and stay behind forever, cranking an index the program has already closed.
    const start = (schedule.genesisUnix + 200 * 3_600) * 1_000
    const h = harness({
      startMs: start,
      hours: 4,
      settle: async (hour, clock) => {
        if (hour === 202) clock.advance(2.5 * 3_600 * 1_000)
      },
    })
    await h.run()
    // 201 runs, 202 overruns into hour 204, so 203 and 204 are gone and the
    // loop resumes at 205 rather than serving a stale index.
    expect(h.reports.map((r) => r.hour)).toEqual([201, 202, 205, 206])
    expect(h.reports.every((r) => r.settled)).toBe(true)
  })
})

describe('retry inside the window', () => {
  it('retries a failing hour and settles on the third attempt', async () => {
    const start = (schedule.genesisUnix + 300 * 3_600) * 1_000
    let calls = 0
    const h = harness({
      startMs: start,
      hours: 1,
      settle: async () => {
        calls += 1
        if (calls < 3) throw new Error('gateway 503')
      },
    })
    await h.run()
    expect(calls).toBe(3)
    const report = h.reports[0]!
    expect(report.settled).toBe(true)
    expect(report.attempts.map((a) => a.ok)).toEqual([false, false, true])
    expect(report.attempts[0]!.why).toBe('gateway 503')
    // The third attempt began 15 s + 45 s after the first.
    expect(report.attempts[2]!.at - report.attempts[0]!.at).toBe(60_000)
    expect(h.missed).toEqual([])
  })

  it('never starts an attempt that cannot finish before the window closes', async () => {
    const start = (schedule.genesisUnix + 400 * 3_600) * 1_000
    const h = harness({
      startMs: start,
      hours: 1,
      // Each attempt burns 20 minutes and fails.
      settle: async (_hour, clock) => {
        clock.advance(20 * 60 * 1_000)
        throw new Error('rpc timeout')
      },
    })
    await h.run()
    const report = h.reports[0]!
    expect(report.settled).toBe(false)
    expect(report.why).toMatch(/window closed/)
    // Three 20-minute attempts fit in the hour; a fourth cannot start. Measured
    // from `firedAt`, not from `start`: the loop waits for the next boundary
    // before it serves anything, which is hour 401 here and not 400.
    expect(report.attempts).toHaveLength(3)
    expect(report.firedAt).toBe(start + 3_600_000)
    const window = { opens: report.firedAt, closes: report.firedAt + 3_600_000 }
    expect(report.attempts.every((a) => a.at >= window.opens && a.at < window.closes)).toBe(true)
  })

  it('alerts exactly once for an hour that closed without a settlement', async () => {
    const start = (schedule.genesisUnix + 500 * 3_600) * 1_000
    const h = harness({
      startMs: start,
      hours: 3,
      retryDelaysMs: [1_000],
      settle: async (hour) => {
        if (hour === 502) throw new Error('every gateway silent')
      },
    })
    await h.run()
    expect(h.reports.filter((r) => r.settled).map((r) => r.hour)).toEqual([501, 503])
    expect(h.missed.map((r) => r.hour)).toEqual([502])
    expect(h.missed[0]!.attempts).toHaveLength(2)
    expect(h.missed[0]!.why).toMatch(/no attempt succeeded/)
  })

  it('counts an attempt that hangs past the timeout as a failure', async () => {
    const start = (schedule.genesisUnix + 600 * 3_600) * 1_000
    const clock = fakeClock(start)
    const reports: HourReport[] = []
    await runLoop({
      schedule,
      hours: 1,
      retryDelaysMs: [],
      attemptTimeoutMs: 90_000,
      deps: {
        now: clock.now,
        sleep: clock.sleep,
        // Never resolves. Without the timeout the loop would hang forever, and
        // a cranker that hangs looks identical to one that is merely waiting.
        settle: () => new Promise(() => {}),
        onHour: (r) => {
          reports.push(r)
        },
        onMissed: () => {},
      },
    })
    expect(reports[0]!.settled).toBe(false)
    expect(reports[0]!.attempts[0]!.why).toMatch(/exceeded 90000 ms/)
  })
})

describe('alerts', () => {
  it('renders a message meant for a lock screen', () => {
    expect(render({ title: 'DRAKES: hour 502 not settled', lines: ['devnet', 'every gateway silent'] }))
      .toBe('DRAKES: hour 502 not settled\ndevnet\nevery gateway silent')
  })

  it('treats a Telegram 200 with ok:false as a failure', async () => {
    // The likeliest misconfiguration is a wrong chat id, and Telegram answers
    // that with HTTP 200. A sink that only checks the status reports a
    // delivered alert that nobody received.
    const sink = telegramSink({
      token: 't',
      chatId: 'wrong',
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ ok: false, description: 'chat not found' }),
      })) as unknown as typeof fetch,
    })
    await expect(sink({ title: 'x', lines: [] })).rejects.toThrow(/chat not found/)
  })

  it('falls back to the console when the channel is down', async () => {
    const written: string[] = []
    const broken = async () => {
      throw new Error('network down')
    }
    await fallbackSink([broken, consoleSink((s) => written.push(s))])({
      title: 'DRAKES: hour 7 not settled',
      lines: [],
    })
    expect(written.join('')).toMatch(/hour 7 not settled/)
  })

  it('throws when every channel fails, rather than reporting success', async () => {
    const broken = async () => {
      throw new Error('network down')
    }
    await expect(fallbackSink([broken, broken])({ title: 'x', lines: [] })).rejects.toThrow(
      /every alert channel failed/,
    )
  })

  it('refuses to build a sink with half its configuration', () => {
    expect(() => telegramSink({ token: 'abc', chatId: '' })).toThrow(/token and a chat id/)
  })
})

describe('the defaults', () => {
  it('fits several retries inside a mainnet hour', () => {
    const total = DEFAULT_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)
    expect(total).toBeLessThan(3_600_000)
    expect(DEFAULT_RETRY_DELAYS_MS[0]).toBeLessThanOrEqual(30_000)
  })
})
