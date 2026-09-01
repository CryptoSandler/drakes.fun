// Reading `IssuanceSettled` back off the chain, which is the only source the
// verifier is allowed to trust.
//
// Caller: `scripts/snapshot.ts` (`pieces` and `verify --published`), and the
// B5 event runner, which writes what this returns into Postgres as a cache.
//
// **Why this file exists.** The 2026-09-01 rehearsal replayed the survivor
// permutation from the artifacts we publish, and two of those artifacts had
// been deleted. The replay was two takes behind from its first line and
// reported 0 of 49 — a total mismatch, which is exactly what a real
// disagreement looks like. The published set is our record; the chain is
// everybody's. A verifier that reads our record is checking our arithmetic
// against our arithmetic.
//
// No dependencies, plain `fetch`, so `node scripts/snapshot.ts` still runs with
// nothing installed. That constraint is the reason the borsh decode below is
// written out by hand rather than pulled from Anchor.

import { decodeBase58, encodeBase58 } from '../solana/base58.ts'

/**
 * `sha256("event:IssuanceSettled")[0..8]`, the Anchor event discriminator.
 *
 * Written as a literal and asserted against the chain rather than computed at
 * import time: this is a positive assertion against a known value, and the
 * value was read from a real devnet settlement on 2026-09-01
 * (`docs/references.md`). If Anchor ever changes how it derives these, the
 * decode stops finding events and `pieces` says so instead of finding none and
 * calling that success.
 */
export const ISSUANCE_SETTLED_DISCRIMINATOR = 'f5ec4261d6573e31'

/** 8 discriminator bytes plus the borsh body. Anything else is not our event. */
const SETTLED_LEN = 8 + 215

export interface SettledEvent {
  /** The transaction the event was emitted in. Not part of the event body. */
  signature: string
  txSlot: bigint
  config: Uint8Array
  hour: bigint
  pieceIndex: number
  minted: boolean
  /** `0xffff` when nothing was minted, per the program. */
  pieceId: number
  snapshotSlot: bigint
  root: Uint8Array
  /** The randomness ACCOUNT. */
  randomness: Uint8Array
  /** The 32 revealed bytes. This is what the survivor replay consumes. */
  randomnessValue: Uint8Array
  revealSlot: bigint
  eligibleSupply: bigint
  point: bigint
  recipient: Uint8Array
  balance: bigint
}

/**
 * Decodes one `Program data:` payload, or returns `null` when it is somebody
 * else's event.
 *
 * Exported because the test drives it against payloads recorded from devnet,
 * which is the only way to keep this honest without a network in CI.
 */
export function decodeSettled(payload: Uint8Array): Omit<SettledEvent, 'signature' | 'txSlot'> | null {
  if (payload.length !== SETTLED_LEN) return null
  const view = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
  if (view.subarray(0, 8).toString('hex') !== ISSUANCE_SETTLED_DISCRIMINATOR) return null

  let at = 8
  const bytes = (n: number): Uint8Array => {
    const out = new Uint8Array(payload.subarray(at, at + n))
    at += n
    return out
  }
  const u64 = (): bigint => {
    const v = view.readBigUInt64LE(at)
    at += 8
    return v
  }
  const u32 = (): number => {
    const v = view.readUInt32LE(at)
    at += 4
    return v
  }
  const u16 = (): number => {
    const v = view.readUInt16LE(at)
    at += 2
    return v
  }
  const bool = (): boolean => {
    const v = payload[at]!
    at += 1
    // Borsh admits exactly 0 and 1. A third value means the layout drifted, and
    // a decoder that shrugs at that produces a plausible wrong answer.
    if (v > 1) throw new Error(`bool byte was ${v}; the event layout has changed`)
    return v === 1
  }

  const event = {
    config: bytes(32),
    hour: u64(),
    pieceIndex: u32(),
    minted: bool(),
    pieceId: u16(),
    snapshotSlot: u64(),
    root: bytes(32),
    randomness: bytes(32),
    randomnessValue: bytes(32),
    revealSlot: u64(),
    eligibleSupply: u64(),
    point: u64(),
    recipient: bytes(32),
    balance: u64(),
  }
  if (at !== SETTLED_LEN) throw new Error(`decoded ${at} of ${SETTLED_LEN} bytes`)
  return event
}

/**
 * Every `Program data:` payload emitted **by `programId` itself** in one
 * transaction's logs.
 *
 * The program stack is tracked rather than assumed. A settlement's logs also
 * contain Switchboard's and mpl-core's invocations, and either of them may emit
 * `Program data:` of its own; attributing those to us would be a decode error
 * at best and a fabricated event at worst.
 */
export function ownEventPayloads(logs: string[], programId: string): Uint8Array[] {
  const stack: string[] = []
  const out: Uint8Array[] = []
  for (const line of logs) {
    const invoke = /^Program (\S+) invoke \[\d+\]$/.exec(line)
    if (invoke) {
      stack.push(invoke[1]!)
      continue
    }
    if (/^Program \S+ (success|failed.*)$/.test(line)) {
      stack.pop()
      continue
    }
    const data = /^Program data: (\S+)$/.exec(line)
    if (data && stack[stack.length - 1] === programId) {
      out.push(new Uint8Array(Buffer.from(data[1]!, 'base64')))
    }
  }
  return out
}

export interface FetchOptions {
  rpcUrl: string
  /** The issuance program. */
  programId: string
  /**
   * When given, events whose `config` is not this address are dropped. A single
   * program can hold more than one config over its life — the devnet rehearsal
   * rig and a later one, say — and replaying two permutations into one survivor
   * set produces a "piece issued twice" that is not a defect.
   */
  config?: string
  /** Stop paginating once this signature is reached, for incremental reads. */
  until?: string
  onProgress?: (note: string) => void
}

/**
 * Every settlement the program has emitted, oldest first.
 *
 * **Paginated, always.** `getSignaturesForAddress` returns at most 1,000 and
 * gives no indication that it truncated — the shape a broken check takes most
 * often (CLAUDE.md). The loop walks `before` cursors to the end of history and
 * refuses to guess.
 */
export async function fetchIssuanceSettled(options: FetchOptions): Promise<SettledEvent[]> {
  if (decodeBase58(options.programId).length !== 32) throw new RangeError('programId is not an address')
  if (options.config !== undefined && decodeBase58(options.config).length !== 32) {
    throw new RangeError('config is not an address')
  }
  const note = options.onProgress ?? (() => {})

  const signatures = await allSignatures(options, note)
  note(`${signatures.length} signatures over the program`)

  const events: SettledEvent[] = []
  // ponytail: one getTransaction per signature, five at a time. At 4,000
  // issuances that is ~8,000 calls and a few minutes -- fine for a one-shot
  // public verification, and the site never runs it. If it needs to be
  // continuous, that is the B5 event runner's job, which reads forward from the
  // last signature it stored rather than replaying history.
  for (let i = 0; i < signatures.length; i += 5) {
    const batch = signatures.slice(i, i + 5)
    const txs = await Promise.all(batch.map((s) => rpcWithRetry(options.rpcUrl, 'getTransaction', [
      s,
      { maxSupportedTransactionVersion: 0, encoding: 'json' },
    ])))
    txs.forEach((tx, k) => {
      const parsed = tx as { slot?: number; meta?: { err: unknown; logMessages?: string[] } } | null
      if (parsed === null || parsed.meta == null) return
      // A failed transaction's logs can still contain a `Program data:` line
      // from before the failure. Nothing it emitted happened.
      if (parsed.meta.err !== null) return
      for (const payload of ownEventPayloads(parsed.meta.logMessages ?? [], options.programId)) {
        const decoded = decodeSettled(payload)
        if (decoded === null) continue
        if (options.config !== undefined && encodeBase58(decoded.config) !== options.config) continue
        events.push({ ...decoded, signature: batch[k]!, txSlot: BigInt(parsed.slot ?? 0) })
      }
    })
    if (i % 200 === 0 && i > 0) note(`  ${i}/${signatures.length} transactions read`)
  }

  events.sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0))
  const hours = new Set(events.map((e) => e.hour.toString()))
  if (hours.size !== events.length) {
    // The program seeds the issuance account with the hour, so two settlements
    // for one hour is impossible on chain. Seeing it means two configs got
    // mixed, and replaying that would corrupt the permutation silently.
    throw new Error('two settlements for the same hour; pass --config to pick one rig')
  }
  return events
}

async function allSignatures(options: FetchOptions, note: (s: string) => void): Promise<string[]> {
  const PAGE = 1000
  const out: string[] = []
  let before: string | undefined
  for (let page = 0; page < 5000; page += 1) {
    const result = (await rpcWithRetry(options.rpcUrl, 'getSignaturesForAddress', [
      options.programId,
      { limit: PAGE, ...(before === undefined ? {} : { before }) },
    ])) as { signature: string; err: unknown }[]
    for (const row of result) {
      if (options.until !== undefined && row.signature === options.until) return out.reverse()
      if (row.err === null) out.push(row.signature)
    }
    if (result.length < PAGE) return out.reverse()
    before = result[result.length - 1]!.signature
    note(`  ${out.length} signatures paged`)
  }
  throw new Error('signature pagination did not terminate; refusing a partial history')
}

async function rpcWithRetry(url: string, method: string, params: unknown[]): Promise<unknown> {
  let last: Error | undefined
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (res.status === 429 || res.status >= 500) throw new Error(`${method}: HTTP ${res.status}`)
      if (!res.ok) throw new FatalRpcError(`${method}: HTTP ${res.status}`)
      const body = (await res.json()) as { result?: unknown; error?: { code?: number; message: string } }
      if (body.error) {
        // Helius answers a rate limit as JSON-RPC -32429 with HTTP 200, so the
        // status check above never sees it. Read from the chain 2026-09-01
        // while recording the rehearsal fixture: a retry loop that only watches
        // the HTTP status gives up on the one error it exists to survive.
        if (body.error.code === -32429) throw new Error(`${method}: ${body.error.message}`)
        throw new FatalRpcError(`${method}: ${body.error.message}`)
      }
      // `getTransaction` answers `null` for a signature the node has pruned,
      // and that is a real answer rather than an error.
      if (!('result' in body)) throw new FatalRpcError(`${method}: no result field`)
      return body.result
    } catch (error) {
      if (error instanceof FatalRpcError) throw error
      last = error as Error
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
  throw new Error(`${method}: gave up after 5 attempts (${last?.message})`)
}

class FatalRpcError extends Error {}
