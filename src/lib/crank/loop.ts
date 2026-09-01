// The cranker's scheduler, with no network and no chain in it.
//
// Caller: `scripts/crank-loop.ts`, which supplies the real `settle`. The tests
// drive this module with a fake clock, which is the only way to assert a claim
// about an hourly job without waiting an hour (CLAUDE.md, "verify behaviour,
// not state").
//
// **Why this is a loop and not a cron entry.** The schedule is anchored on
// chain: `issue_at(n) = genesis + n * period`, and the program derives the hour
// itself. Nothing a host does to the trigger time can make the protocol drift.
// What a late trigger costs is the *window* — an hour may only be requested
// before the next one opens, and there is no re-request. So the property worth
// buying is not trigger precision, it is: wake at the boundary, and if the
// first attempt fails, have enough of the window left to try again.
//
// A process that schedules itself against the on-chain genesis gets that for
// free and makes the host's own cron precision irrelevant. The host's remaining
// job is to keep this process running, which is what `Restart=always` is for.
// `docs/crank-hosting.md` has the evaluation.

import { issueAt, requestWindow, type Schedule } from '../protocol/schedule.ts'

export interface Attempt {
  /** Unix ms the attempt began. */
  at: number
  ok: boolean
  why?: string
}

export interface HourReport {
  hour: number
  /** Unix ms the loop woke for this hour. */
  firedAt: number
  /**
   * `firedAt` minus the instant the schedule names, in ms. This is the number
   * the hosting rehearsal reports.
   *
   * Usually positive, and **occasionally -1**: `setTimeout` is allowed to fire a
   * fraction early and the devnet run of 2026-09-01 recorded it doing so. That
   * is harmless here — the program's own time check is in seconds and the
   * request lands slots later — but a comment claiming it can never happen was
   * in this file until the data said otherwise.
   */
  jitterMs: number
  settled: boolean
  attempts: Attempt[]
  /** Set when the hour was abandoned, and it is what the alert says. */
  why?: string
}

export interface LoopDeps {
  /** Unix ms. Injected so the tests do not wait. */
  now: () => number
  sleep: (ms: number) => Promise<void>
  /** Does the whole on-chain unit for one hour. Throws to mean "not settled". */
  settle: (hour: number) => Promise<void>
  onHour: (report: HourReport) => void | Promise<void>
  /** Called once per hour that closed without a settlement. */
  onMissed: (report: HourReport) => void | Promise<void>
}

export interface LoopOptions {
  schedule: Schedule
  deps: LoopDeps
  /** Stop after this many hours have been attempted. Omit to run forever. */
  hours?: number
  /**
   * How long to wait after a failed attempt before trying again. The loop stops
   * retrying when the window would close mid-attempt, so a long list is safe.
   */
  retryDelaysMs?: number[]
  /** How long a single attempt is allowed to run before it counts as failed. */
  attemptTimeoutMs?: number
  signal?: { aborted: boolean }
}

/** Two quick retries, then spaced out. Tuned for a 3,600 s window. */
export const DEFAULT_RETRY_DELAYS_MS = [15_000, 45_000, 120_000, 300_000, 600_000]

/**
 * The hour the clock is in, derived from the schedule and never by incrementing
 * the last one.
 *
 * This is the whole anti-drift argument in one function. A loop that does
 * `hour += 1` after a unit that overran by more than a period silently falls
 * behind by one and stays behind; a loop that asks the clock catches up by
 * skipping, which is what the protocol does too.
 */
export function hourAt(schedule: Schedule, nowUnixSeconds: number): number {
  return Math.floor((nowUnixSeconds - schedule.genesisUnix) / schedule.periodSeconds)
}

export async function runLoop(options: LoopOptions): Promise<HourReport[]> {
  const { schedule, deps } = options
  const retries = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const reports: HourReport[] = []

  // Start at the next boundary. A cranker that starts mid-hour does not get to
  // renumber the hours; the index it would have served has already opened, and
  // requesting it late eats the window it might need for a retry.
  let hour = hourAt(schedule, Math.floor(deps.now() / 1000)) + 1

  while (options.hours === undefined || reports.length < options.hours) {
    if (options.signal?.aborted) break

    const opensAtMs = issueAt(schedule, hour) * 1000
    const closesAtMs = requestWindow(schedule, hour).closesAt * 1000
    const wait = opensAtMs - deps.now()
    if (wait > 0) await deps.sleep(wait)
    if (options.signal?.aborted) break

    const firedAt = deps.now()
    const report: HourReport = {
      hour,
      firedAt,
      jitterMs: firedAt - opensAtMs,
      settled: false,
      attempts: [],
    }

    for (let i = 0; ; i += 1) {
      const at = deps.now()
      try {
        await withTimeout(deps.settle(hour), options.attemptTimeoutMs, deps)
        report.attempts.push({ at, ok: true })
        report.settled = true
        break
      } catch (error) {
        report.attempts.push({ at, ok: false, why: message(error) })
      }
      const delay = retries[i]
      if (delay === undefined) {
        report.why = `no attempt succeeded in ${report.attempts.length} tries`
        break
      }
      // Refusing to start an attempt that cannot finish inside the window is the
      // point of retrying at all. Past `closesAt` the next hour has opened and
      // this index can never be requested again.
      if (deps.now() + delay >= closesAtMs) {
        report.why = `the window closed after ${report.attempts.length} attempts`
        break
      }
      await deps.sleep(delay)
      if (options.signal?.aborted) break
    }

    reports.push(report)
    await deps.onHour(report)
    if (!report.settled) await deps.onMissed(report)

    // Derived from the clock, not from `hour + 1`.
    hour = Math.max(hour + 1, hourAt(schedule, Math.floor(deps.now() / 1000)) + 1)
  }
  return reports
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number | undefined,
  deps: Pick<LoopDeps, 'sleep'>,
): Promise<T> {
  if (timeoutMs === undefined) return work
  const timeout = deps.sleep(timeoutMs).then(() => {
    throw new Error(`attempt exceeded ${timeoutMs} ms`)
  })
  return Promise.race([work, timeout]) as Promise<T>
}

function message(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.split('\n')[0]!.slice(0, 200)
}
