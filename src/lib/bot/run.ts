// One pass of the bot: read what has settled since last time, post it in order,
// and move the cursor exactly as far as the posts that actually landed.
//
// Caller: `scripts/xbot.ts`, run hourly on the crank host
// (`docs/crank-hosting.md`). Nothing else calls it, and the crank does not: a
// poster that shares a process with the cranker is a poster whose backoff can
// cost an issuance window.
//
// **The cursor is a watermark, not a set.** Hours only ever increase and the
// program settles each one once, so "the last hour posted" is the whole state.
// It advances after a publish returns and never before, which makes the failure
// mode a repeat rather than a hole — and a repeat is caught by the platform's
// own duplicate rejection, which this treats as success.
//
// **An empty cursor does not backfill.** A first run against a program with 300
// settlements behind it would publish 300 posts. So an unprimed bot records
// where it is and posts nothing, and a backfill is a thing an operator asks for
// with a flag and a sink they chose.

import type { Post } from './post.ts'
import { AlreadyPosted, PublishFailed, RateLimited, type Published, type Sink } from './sink.ts'

export interface Cursor {
  /** The last hour that was published, or null when the bot has never run. */
  read: () => Promise<bigint | null>
  write: (hour: bigint) => Promise<void>
}

export interface Settled {
  hour: bigint
  post: Post
}

export interface Scan {
  /** Settlements after the cursor, oldest first, at most `limit`. */
  pending: Settled[]
  /**
   * The highest hour the scan actually looked at and can account for — posted,
   * skipped, or definitively absent.
   *
   * **This is what stops the bot stalling.** An hour the cranker never requested
   * has no account and never will, and a window made entirely of those would be
   * rescanned forever while newer hours piled up behind it. The cursor moves to
   * here when there is nothing to publish, so absence advances the watermark and
   * a settlement never does so without being published first.
   */
  scannedThrough: bigint | null
}

export interface RunDeps {
  fetchAfter: (afterHour: bigint | null, limit: number) => Promise<Scan>
  sink: Sink
  cursor: Cursor
  /**
   * The most a single pass will publish. It bounds the burst after an outage:
   * an hourly job that was down for a week should not wake up and post 168
   * times into a rate limit.
   */
  limit: number
  /** Attempts per post, including the first. */
  attempts?: number
  sleep: (ms: number) => Promise<void>
  onPost?: (row: { post: Post; published: Published; repeat: boolean }) => void
  onNote?: (note: string) => void
}

export type Stop = 'done' | 'rate-limited' | 'failed' | 'primed' | 'nothing-to-do'

export interface PassReport {
  stop: Stop
  posted: number
  /** Posts the platform said it already had. Counted, because a run that is all
   *  repeats means the cursor is not being written. */
  repeats: number
  /** Where the cursor ended up. */
  cursor: bigint | null
  /** Set when `stop` is `rate-limited`. */
  resetAtUnix?: number | null
  why?: string
}

export async function runPass(deps: RunDeps): Promise<PassReport> {
  const note = deps.onNote ?? (() => {})
  const attempts = deps.attempts ?? 3
  const from = await deps.cursor.read()

  if (from === null) {
    // Prime, do not backfill. The newest settled hour becomes the watermark and
    // nothing is published: the next pass posts what happens after this moment.
    const latest = await deps.fetchAfter(null, 1)
    const at = latest.pending[latest.pending.length - 1]?.hour ?? latest.scannedThrough
    if (at === null || at === undefined) {
      return { stop: 'nothing-to-do', posted: 0, repeats: 0, cursor: null }
    }
    await deps.cursor.write(at)
    note(`primed at hour ${at}; nothing published. Pass --from to backfill deliberately.`)
    return { stop: 'primed', posted: 0, repeats: 0, cursor: at }
  }

  const scan = await deps.fetchAfter(from, deps.limit)
  const pending = [...scan.pending].sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0))
  if (pending.length === 0) {
    const to = scan.scannedThrough
    if (to !== null && to > from) {
      note(`nothing settled between ${from + 1n} and ${to}; moving the cursor past them`)
      await deps.cursor.write(to)
      return { stop: 'nothing-to-do', posted: 0, repeats: 0, cursor: to }
    }
    return { stop: 'nothing-to-do', posted: 0, repeats: 0, cursor: from }
  }

  let posted = 0
  let repeats = 0
  let cursor = from

  for (const settled of pending) {
    if (settled.hour <= cursor) {
      // The fetch handed back something at or behind the watermark. Posting it
      // would be a duplicate we caused ourselves.
      note(`skipping hour ${settled.hour}: at or behind the cursor`)
      continue
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        const published = await deps.sink.publish(settled.post)
        posted += 1
        cursor = settled.hour
        await deps.cursor.write(cursor)
        deps.onPost?.({ post: settled.post, published, repeat: false })
        break
      } catch (error) {
        if (error instanceof AlreadyPosted) {
          // It is already out. Move the watermark past it or every future pass
          // starts here.
          repeats += 1
          cursor = settled.hour
          await deps.cursor.write(cursor)
          deps.onPost?.({ post: settled.post, published: { via: deps.sink.name }, repeat: true })
          break
        }
        if (error instanceof RateLimited) {
          return {
            stop: 'rate-limited', posted, repeats, cursor,
            resetAtUnix: error.resetAtUnix,
            why: error.message,
          }
        }
        const retryable = error instanceof PublishFailed && error.retryable
        if (!retryable || attempt >= attempts) {
          return {
            stop: 'failed', posted, repeats, cursor,
            why: error instanceof Error ? error.message : String(error),
          }
        }
        // Linear, not exponential: the next pass is an hour away, so there is
        // no value in waiting longer than the outage-shaped few seconds.
        note(`hour ${settled.hour}: attempt ${attempt} failed, retrying`)
        await deps.sleep(attempt * 2000)
      }
    }
  }

  // Everything the scan accounted for is behind us now, including any hour it
  // found nothing in after the last one published.
  if (scan.scannedThrough !== null && scan.scannedThrough > cursor) {
    cursor = scan.scannedThrough
    await deps.cursor.write(cursor)
  }
  return { stop: 'done', posted, repeats, cursor }
}
