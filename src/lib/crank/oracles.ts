// Choosing which Switchboard oracle serves an hour.
//
// **On-chain liveness is not gateway liveness, and that was measured rather
// than argued.** In the 2026-09-01 devnet rehearsal, seven of forty-eight hours
// were lost to one oracle that was in the queue's `oracle_keys`, reported
// `is_on_queue == 1`, and had heartbeated inside `node_timeout` — while its
// gateway answered 503 to every reveal. Its share of a six-member round-robin
// was every sixth hour, so it cost 15% of the collection's issuances.
//
// The program cannot help: the oracle is named at `request_issuance` and there
// is no re-request (T11). So the check has to happen **before** the request is
// sent, in the crank, and it has to be a real request to the gateway.
//
// Caller: `scripts/crank.ts`.

/** What the queue publishes about itself, decoded from the account. */
export interface QueueView {
  oracleKeys: string[]
  nodeTimeoutSeconds: number
}

/** What one oracle publishes about itself. */
export interface OracleView {
  address: string
  queue: string
  isOnQueue: boolean
  lastHeartbeat: number
  gatewayUri: string
}

export interface Candidate extends OracleView {
  heartbeatAge: number
}

/** A gateway probe: true when the oracle answered inside the timeout. */
export type Probe = (gatewayUri: string) => Promise<boolean>

export type Rejection = 'not-on-queue' | 'wrong-queue' | 'stale-heartbeat' | 'gateway-silent'

export interface Selection {
  chosen: Candidate | null
  rejected: { address: string; why: Rejection }[]
}

/**
 * The on-chain half: everything the program itself will assert in
 * `request_issuance` (T12). Checking it here too is not redundant — it turns a
 * failed transaction into a skipped candidate.
 */
export function eligible(oracles: OracleView[], queue: QueueView, nowSeconds: number): {
  candidates: Candidate[]
  rejected: { address: string; why: Rejection }[]
} {
  const members = new Set(queue.oracleKeys)
  const candidates: Candidate[] = []
  const rejected: { address: string; why: Rejection }[] = []
  for (const o of oracles) {
    const heartbeatAge = nowSeconds - o.lastHeartbeat
    if (!members.has(o.address)) rejected.push({ address: o.address, why: 'not-on-queue' })
    else if (!o.isOnQueue) rejected.push({ address: o.address, why: 'not-on-queue' })
    else if (heartbeatAge > queue.nodeTimeoutSeconds)
      rejected.push({ address: o.address, why: 'stale-heartbeat' })
    else candidates.push({ ...o, heartbeatAge })
  }
  return { candidates, rejected }
}

/**
 * Round-robin from `startIndex`, skipping anything in `avoid`, and **probing
 * each gateway before committing to it**. The first oracle that answers is the
 * one the hour is requested with.
 *
 * Returns `chosen: null` when nobody answers. That is a real outcome and the
 * caller records the hour as having no oracle available — it does not send a
 * request it knows will strand the hour.
 */
export async function selectOracle(args: {
  candidates: Candidate[]
  startIndex: number
  probe: Probe
  /** Addresses that failed recently; tried last rather than never. */
  avoid?: ReadonlySet<string>
}): Promise<Selection> {
  const { candidates, startIndex, probe } = args
  const avoid = args.avoid ?? new Set<string>()
  const rejected: { address: string; why: Rejection }[] = []
  if (candidates.length === 0) return { chosen: null, rejected }

  const rotated = Array.from({ length: candidates.length }, (_, i) => {
    const idx = ((startIndex % candidates.length) + candidates.length + i) % candidates.length
    return candidates[idx]!
  })
  // Anything that just failed goes to the back of the queue instead of being
  // dropped: a gateway that was down a minute ago may be the only one up now.
  const ordered = [...rotated.filter((c) => !avoid.has(c.address)), ...rotated.filter((c) => avoid.has(c.address))]

  for (const c of ordered) {
    if (await probe(c.gatewayUri)) return { chosen: c, rejected }
    rejected.push({ address: c.address, why: 'gateway-silent' })
  }
  return { chosen: null, rejected }
}

/**
 * The default probe: Switchboard's own gateway `ping`.
 *
 * **The route is not invented.** It is `POST /gateway/api/v1/ping` with
 * `{"api_version":"1.0.0"}`, read from `@switchboard-xyz/common`'s Gateway
 * client rather than guessed — the first version of this function guessed a
 * `gateway_health` path, every gateway answered 404, and the crank concluded
 * that all six oracles were dead and refused to issue anything. A probe that
 * fails closed on its own bug halts the collection.
 *
 * A short timeout on purpose: the crank has an hour, but an oracle that needs
 * seconds to answer a ping will not serve a reveal inside a single slot.
 */
export function httpProbe(timeoutMs = 2_500): Probe {
  return async (gatewayUri) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // Concatenated, not resolved: the gateway URI carries a path segment
      // (`.../devnet`) and `new URL(path, base)` would throw it away, which
      // makes every probe fail against a URL nobody serves.
      const res = await fetch(`${gatewayUri.replace(/\/$/, '')}/gateway/api/v1/ping`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_version: '1.0.0' }),
        signal: controller.signal,
      })
      return res.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
}
