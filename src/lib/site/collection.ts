// The whole collection's state, in one round trip, read from the chain.
//
// Caller: every direction's `app/page.tsx`. The three B6 directions differ in
// how they draw this; none of them differs in where it comes from.
//
// **Two accounts, one `getMultipleAccounts`.** The config carries the schedule
// and the counters; the survivor array carries which of the 4,000 are still
// unissued. That second one is the useful trick: the array is stored so that
// positions `[0, remaining)` hold the ids that have NOT gone out, so the issued
// set is its complement — exact, and without replaying 4,000 events or trusting
// a database. `scripts/snapshot.ts pieces` replays the events instead, because a
// verifier must not read an account we wrote; a page rendering the current
// state has no such duty and one RPC call is the right cost.

import { decodeBase58 } from '../solana/base58.ts'

// `Config`, read from `programs/issuance/src/lib.rs`: 8 discriminator,
// `bump: u8`, five Pubkeys, then the fields below. Confirmed against the devnet
// config on 2026-09-01, which reads genesis 1788281174 and period 60.
const CONFIG_GENESIS = 8 + 1 + 32 * 5
const CONFIG_PERIOD = CONFIG_GENESIS + 8
const CONFIG_SIZE = CONFIG_PERIOD + 8
const CONFIG_ISSUED = CONFIG_SIZE + 4
const CONFIG_LIVE = CONFIG_ISSUED + 4

// `Survivors`: 8 discriminator, `remaining: u16`, `bump: u8`, five pad bytes.
const SURVIVORS_REMAINING = 8
const SURVIVORS_SLOTS = 16

export interface CollectionState {
  genesisUnix: number
  periodSeconds: number
  collectionSize: number
  issuedCount: number
  liveSupply: number
  remaining: number
  /** Exactly the ids that have gone out. Size equals `issuedCount`. */
  issued: Set<number>
  /** The slot both accounts were read at. Every figure on the site carries one. */
  slot: number
}

export async function readCollectionState(args: {
  rpcUrl: string
  config: string
  survivors: string
}): Promise<CollectionState> {
  for (const [label, value] of [['config', args.config], ['survivors', args.survivors]] as const) {
    if (decodeBase58(value).length !== 32) throw new RangeError(`${label} is not an address`)
  }
  const response = (await rpc(args.rpcUrl, 'getMultipleAccounts', [
    [args.config, args.survivors],
    { encoding: 'base64' },
  ])) as { context?: { slot: number }; value?: ({ data: [string, string] } | null)[] }

  if (response.context === undefined || response.value === undefined) {
    // An empty result and a broken query look identical otherwise (CLAUDE.md).
    throw new Error('the RPC returned no context; the query shape is wrong, not the chain')
  }
  const [configAccount, survivorsAccount] = response.value
  if (!configAccount || !survivorsAccount) {
    throw new Error('config or survivors account not found; wrong cluster or wrong address')
  }

  const config = Buffer.from(configAccount.data[0], 'base64')
  const genesisUnix = Number(config.readBigInt64LE(CONFIG_GENESIS))
  const periodSeconds = Number(config.readBigInt64LE(CONFIG_PERIOD))
  const collectionSize = config.readUInt32LE(CONFIG_SIZE)
  // Positive assertions rather than a shrug: a zero period divides by zero in
  // the countdown, and a zero size renders an empty collection as a finished one.
  if (periodSeconds <= 0) throw new Error('the config carries no period')
  if (genesisUnix <= 0) throw new Error('the config carries no genesis instant')
  if (collectionSize <= 0 || collectionSize > 0xffff) throw new Error('collection size out of range')

  const survivorsData = Buffer.from(survivorsAccount.data[0], 'base64')
  const remaining = survivorsData.readUInt16LE(SURVIVORS_REMAINING)
  if (remaining > collectionSize) throw new Error('remaining exceeds the collection')

  // Slots are stored one-based so a zeroed account reads as the identity
  // permutation: 0 means "never written, so this position still holds its own
  // index" (`src/lib/protocol/survivors.ts`).
  const surviving = new Set<number>()
  for (let i = 0; i < remaining; i += 1) {
    const raw = survivorsData.readUInt16LE(SURVIVORS_SLOTS + i * 2)
    surviving.add(raw === 0 ? i : raw - 1)
  }
  const issued = new Set<number>()
  for (let id = 0; id < collectionSize; id += 1) if (!surviving.has(id)) issued.add(id)

  const issuedCount = config.readUInt32LE(CONFIG_ISSUED)
  // The two accounts are written by the same instruction, so they cannot
  // disagree on chain. If they do here, the layout drifted — and a page that
  // renders a plausible wrong count is worse than one that refuses.
  if (issued.size !== issuedCount) {
    throw new Error(
      `the survivor array says ${issued.size} issued and the config says ${issuedCount}; ` +
        'one of the two account layouts has drifted',
    )
  }

  return {
    genesisUnix,
    periodSeconds,
    collectionSize,
    issuedCount,
    liveSupply: config.readUInt32LE(CONFIG_LIVE),
    remaining,
    issued,
    slot: response.context.slot,
  }
}

/** Unix seconds of the next boundary at or after `now`. */
export function nextIssuanceAt(state: Pick<CollectionState, 'genesisUnix' | 'periodSeconds'>, nowUnix: number): number {
  const elapsed = nowUnix - state.genesisUnix
  if (elapsed < 0) return state.genesisUnix
  return state.genesisUnix + (Math.floor(elapsed / state.periodSeconds) + 1) * state.periodSeconds
}

/**
 * The placeholder tier table.
 *
 * **The real one does not exist yet.** Tiers are fixed by the manifest whose
 * hash `initialize` commits (`DESIGN.md` §9.3, D13), and the manifest is a B1/B2
 * output — no art, no manifest. This is a deterministic stand-in so the gallery
 * can be *designed*, and every direction that uses it labels it as a placeholder
 * on the same screen. Publishing a tier a stranger could check against the
 * manifest, when there is no manifest, would be the exact dishonesty the verify
 * page exists to make impossible.
 */
export const TIERS = [
  { name: 'Whelp', count: 2400 },
  { name: 'Wyrm', count: 1000 },
  { name: 'Elder', count: 480 },
  { name: 'Ancient', count: 110 },
  { name: 'Sovereign', count: 10 },
] as const

export type TierName = (typeof TIERS)[number]['name']

/**
 * Exact counts, deterministically shuffled — never a hash into a bucket.
 *
 * The first version of this hashed each id into a cumulative range and produced
 * 3,195 Whelps and 3 Sovereigns against D13's 2,400 and 10. That is not a
 * rounding error, it is the wrong shape: **"exact counts, not probabilities"**
 * is the property D13 exists to state, and a placeholder that gets it wrong
 * teaches the reader the opposite of the thing the real manifest will prove.
 * So the table is built with exactly the right number of each tier and then
 * permuted, which is also what B1 will do.
 */
let table: TierName[] | null = null

function buildTable(size: number): TierName[] {
  const out: TierName[] = []
  for (const tier of TIERS) for (let i = 0; i < tier.count; i += 1) out.push(tier.name)
  while (out.length < size) out.push('Whelp')
  out.length = size

  // mulberry32 on a fixed seed: the same table every render, every machine,
  // every direction — so three previews of the same piece agree.
  let seed = 0x44524b53
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function placeholderTier(id: number, size = 4000): TierName {
  table ??= buildTable(size)
  return table[id] ?? 'Whelp'
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`)
  const body = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  if (!('result' in body)) throw new Error(`${method}: no result field`)
  return body.result
}
