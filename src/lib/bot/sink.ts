// Where a post goes. Three of them, and the default is the one that needs no
// account.
//
// Caller: `scripts/xbot.ts` chooses a sink from the environment;
// `src/lib/bot/run.ts` only knows the interface.
//
// **The console and file sinks are not a stub.** Until an X account exists
// (launch runbook O5) they are the product: the same text, in the same order,
// with the same cursor advancing, so the thing that gets exercised for months
// is the thing that will publish. A publisher first run on launch day is a
// publisher whose defects are discovered in public.
//
// **Nothing here ever puts a credential in a message, a log line or an error**,
// including the failure paths — which is where they usually leak
// (`src/lib/crank/alert.ts` makes the same promise about the ntfy topic).

import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { authorization, type Credentials } from './oauth1.ts'
import type { Post } from './post.ts'

export interface Published {
  /** The platform's id, when there is a platform. */
  id?: string
  /** Where a person can see it, when that is knowable. */
  url?: string
  /** Which sink took it, for the log. */
  via: string
}

export interface Sink {
  name: string
  publish: (post: Post) => Promise<Published>
}

/** The rate limit was hit. The pass stops; the cursor is not advanced past it. */
export class RateLimited extends Error {
  // Written out rather than a parameter property: node runs these files by
  // stripping types, and `constructor(readonly x)` is syntax it refuses. vitest
  // transpiles it happily, so the tests pass and the script does not start.
  readonly resetAtUnix: number | null

  constructor(resetAtUnix: number | null) {
    super(
      resetAtUnix === null
        ? 'rate limited, with no reset time in the response'
        : `rate limited until ${new Date(resetAtUnix * 1000).toISOString()}`,
    )
    this.name = 'RateLimited'
    this.resetAtUnix = resetAtUnix
  }
}

/**
 * The platform says this text is already there.
 *
 * **This is a success, not a failure, and treating it as one is what makes the
 * bot safe to restart.** The cursor advances only after a publish returns, so a
 * crash in the gap between the two re-offers the same post — and the only
 * honest reading of "duplicate" is that the earlier attempt landed.
 */
export class AlreadyPosted extends Error {
  constructor() {
    super('the platform reports this post already exists')
    this.name = 'AlreadyPosted'
  }
}

/** Something else went wrong. `retryable` separates a 503 from a 401. */
export class PublishFailed extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'PublishFailed'
    this.retryable = retryable
  }
}

/** One JSON object per line on stdout, which is the crank's idiom too. */
export function consoleSink(write: (s: string) => void = (s) => process.stdout.write(s)): Sink {
  return {
    name: 'console',
    publish: async (post) => {
      write(`${JSON.stringify({ t: new Date().toISOString(), hour: post.hour.toString(), kind: post.kind, url: post.url, text: post.text })}\n`)
      return { via: 'console' }
    },
  }
}

/** The same, appended to a file, so a rehearsal leaves something to diff. */
export function fileSink(path: string): Sink {
  return {
    name: `file:${path}`,
    publish: async (post) => {
      appendFileSync(path, `${JSON.stringify({ t: new Date().toISOString(), hour: post.hour.toString(), kind: post.kind, url: post.url, text: post.text })}\n`)
      return { via: 'file' }
    },
  }
}

const ENDPOINT = 'https://api.x.com/2/tweets'

/**
 * Posts to X as the account the credentials belong to.
 *
 * **Unverified against the live service**, and it says so here rather than in a
 * commit message: this project has no X account yet (O5), so the request has
 * never been answered by X. What *is* verified is the half that is ours — the
 * OAuth 1.0a signing, against RFC 5849's published vector — and the response
 * handling, against recorded shapes in the test.
 *
 * **The rate limit is read from the response, never remembered.** X's published
 * per-tier caps change, and a number hard-coded here would be a number that goes
 * quietly wrong; `x-rate-limit-reset` is what the server says right now. The
 * pass stops on a 429 and the cursor stays where it is, so the next run resumes
 * without a gap.
 */
export function xSink(credentials: Credentials, fetchImpl: typeof fetch = fetch): Sink {
  for (const [name, value] of Object.entries(credentials)) {
    // A blank credential produces a signature that verifies nowhere and an
    // error that says 401. Refusing here names the actual problem.
    if (value === '') throw new Error(`X credential ${name} is empty`)
  }
  return {
    name: 'x',
    publish: async (post) => {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: authorization({
            method: 'POST',
            url: ENDPOINT,
            credentials,
            nonce: randomBytes(16).toString('hex'),
            timestamp: Math.floor(Date.now() / 1000),
          }),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: post.text }),
      })

      if (response.status === 429) {
        const reset = Number(response.headers.get('x-rate-limit-reset') ?? '')
        throw new RateLimited(Number.isFinite(reset) && reset > 0 ? reset : null)
      }

      const body = await response.text()
      if (!response.ok) {
        // A duplicate is the platform telling us the earlier attempt landed.
        // Matched on the text because the code for it has moved before; the
        // consequence of a miss is one repeated post, not a lost one.
        if (/duplicate/i.test(body)) throw new AlreadyPosted()
        throw new PublishFailed(
          `X answered ${response.status}: ${body.slice(0, 200)}`,
          response.status >= 500,
        )
      }

      // A 2xx is not a publish (`alert.ts` learned this against ntfy). The
      // create endpoint answers with the post it made; anything else on a 2xx
      // went somewhere that is not X.
      let parsed: { data?: { id?: string; text?: string } }
      try {
        parsed = JSON.parse(body) as typeof parsed
      } catch {
        throw new PublishFailed('X answered 2xx with a body that is not JSON', false)
      }
      const id = parsed.data?.id
      if (typeof id !== 'string' || id === '') {
        throw new PublishFailed('X answered 2xx without an id; nothing was published', false)
      }
      if (typeof parsed.data?.text === 'string' && parsed.data.text !== post.text) {
        // Not fatal — X normalises links — but it is worth seeing in the log
        // rather than assuming the text that went out is the text we built.
        process.stderr.write(`note: X returned different text for hour ${post.hour}\n`)
      }
      return { id, url: `https://x.com/i/status/${id}`, via: 'x' }
    },
  }
}
