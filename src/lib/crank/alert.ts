// "An hour passed with no settlement" has to reach a human, not a log file
// nobody opens.
//
// Caller: `scripts/crank-loop.ts` wires `ntfySink` (or `consoleSink` when no
// topic is configured) into the loop's `onMissed`.
//
// **ntfy.sh, and the reason is the no-doxx guard as much as the simplicity.**
// One HTTPS POST, no dependency, no SMTP, no deliverability question, and it
// arrives on a phone. It also needs **no account of any kind** — nothing to sign
// up for, nothing to link to a person, nothing that shows an operator's identity
// to a third party. That is a stronger position than a messaging account the
// project would otherwise have to own.
//
// **The topic is a password and is treated as one.** ntfy's own documentation is
// blunt about it: *"Since there is no sign-up, the topic is essentially a
// password, so pick something that's not easily guessable"* (read 2026-09-01).
// Anyone who knows it can read every alert and publish forgeries into the same
// channel. So it is generated with `openssl rand -hex 16`, it lives only in
// `.env.local`, it is never committed, and **nothing in this file ever puts it
// in a message, a log line or an error string** — including the failure paths,
// which is where a URL usually leaks.

export interface Alert {
  /** One line, the subject. */
  title: string
  /** Lines of detail. Kept short: this is read on a lock screen. */
  lines: string[]
}

export type Sink = (alert: Alert) => Promise<void>

export function render(alert: Alert): string {
  return [alert.title, ...alert.lines].join('\n')
}

/** ntfy accepts letters, numbers, underscore and dash, up to 64 characters. */
const TOPIC = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Sixteen random bytes is what `openssl rand -hex 16` produces. Enforced as a
 * minimum rather than trusted, because a short topic is not a weak secret, it
 * is a public channel — and the failure is silent in both directions: alerts
 * readable by anyone who guesses it, and forged alerts we would believe.
 */
const MIN_TOPIC_LENGTH = 32

/**
 * Publishes to an ntfy topic. Returns normally on success and **throws on
 * failure**, so a caller can fall back rather than believe an alert was
 * delivered because nothing complained.
 */
export function ntfySink(args: {
  topic: string
  /** Defaults to the public server. */
  server?: string
  fetchImpl?: typeof fetch
}): Sink {
  if (!TOPIC.test(args.topic)) {
    // Deliberately does not echo the value: a rejected topic is still a secret.
    throw new Error('NTFY_TOPIC is not a valid ntfy topic (letters, numbers, _ and -, max 64)')
  }
  if (args.topic.length < MIN_TOPIC_LENGTH) {
    throw new Error(
      `NTFY_TOPIC is ${args.topic.length} characters; at least ${MIN_TOPIC_LENGTH} are required. ` +
        'The topic is the only secret protecting this channel — generate it with ' +
        '`openssl rand -hex 16`.',
    )
  }
  const server = args.server ?? 'https://ntfy.sh'
  const doFetch = args.fetchImpl ?? fetch

  return async (alert) => {
    const res = await doFetch(`${server}/${args.topic}`, {
      method: 'POST',
      // Header values must be Latin-1; a stray character throws inside fetch and
      // would lose the alert to an encoding bug rather than to the outage it is
      // reporting.
      headers: { Title: asciiOnly(alert.title) },
      body: alert.lines.join('\n'),
    })
    // The URL is never in the error, only the status.
    if (!res.ok) throw new Error(`ntfy: HTTP ${res.status}`)

    // **A 200 is not a delivery.** The publish endpoint answers with the message
    // it stored; anything else on a 200 — an HTML page from a captive portal, a
    // proxy's interstitial, the ntfy front page — is a request that went
    // somewhere else and said so only in its body. Verified against the real
    // service 2026-09-01: a successful publish returns
    // `{"id","time","expires","event":"message","topic","title","message"}` as
    // `application/json`, and `GET https://ntfy.sh/` returns 200 with `text/html`.
    let body: { id?: string; event?: string; topic?: string }
    try {
      body = (await res.json()) as typeof body
    } catch {
      throw new Error('ntfy: answered 200 with a body that is not the published message')
    }
    if (body.event !== 'message' || typeof body.id !== 'string' || body.id === '') {
      throw new Error('ntfy: answered 200 without publishing a message')
    }
    // The strongest of the three: it proves the message landed on OUR topic and
    // not on one a rewritten URL chose.
    if (body.topic !== args.topic) {
      throw new Error('ntfy: the message was published to a different topic')
    }
  }
}

/** ntfy header values are Latin-1; anything else is transliterated away. */
function asciiOnly(value: string): string {

  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
}

/** Where alerts go when no channel is configured. Never silent. */
export function consoleSink(write: (s: string) => void = (s) => process.stderr.write(s)): Sink {
  return async (alert) => {
    write(`\n=== ALERT ===\n${render(alert)}\n=============\n`)
  }
}

/**
 * Tries each sink in order and stops at the first that succeeds.
 *
 * The console sink belongs last in that list, always. An alerting path whose
 * only channel can fail silently is worse than no alerting, because it is
 * trusted.
 */
export function fallbackSink(sinks: Sink[]): Sink {
  return async (alert) => {
    const failures: string[] = []
    for (const sink of sinks) {
      try {
        await sink(alert)
        return
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    throw new Error(`every alert channel failed: ${failures.join('; ')}`)
  }
}
