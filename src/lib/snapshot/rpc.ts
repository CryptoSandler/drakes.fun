// Reading holdings off the chain, over plain JSON-RPC with no dependency.
//
// Caller: `scripts/snapshot.ts` (live mode), and the cranker in B4.
//
// **What this can and cannot do, because DESIGN.md §4 overstates it.** There is
// no standard RPC that returns program accounts as they stood at a past slot.
// An archival RPC keeps blocks and transactions, not account state at an
// arbitrary slot. So:
//
//   - The snapshot is built at the CURRENT slot, and the slot it was actually
//     read at comes back in the response context. That is the slot that goes on
//     chain. It is exact, not approximate.
//   - A stranger checking us later verifies the arithmetic from the published
//     leaf set in seconds and with no RPC at all. Verifying that the leaf set
//     matches chain state at that slot needs either their own indexer running
//     from launch, or a replay of token transfers up to that slot.
//
// Publishing the full leaf set for every issuance is what keeps the first of
// those cheap, and the verify page says which of the two claims it is making.

import { decodeBase58, encodeBase58 } from '../solana/base58.ts'
import type { Holding } from './build.ts'

export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

const MINT_OFFSET = 0
const OWNER_OFFSET = 32
const AMOUNT_OFFSET = 64
/** Mint layout, identical in both programs: COption authority (36), then supply. */
const MINT_SUPPLY_OFFSET = 36

/**
 * Verified against `api.devnet.solana.com` on 2026-09-01: a `getProgramAccounts`
 * scan over a mint with a large holder set is refused outright with JSON-RPC
 * error -32012, "scan aborted: The accumulated scan results exceeded the
 * limit". It does not truncate — it fails, which is the correct behaviour and
 * the one this code depends on.
 *
 * A partial snapshot is the dangerous outcome, because it produces a root that
 * verifies perfectly while quietly leaving holders out of the tree. So the scan
 * either returns everything or this throws, and the cranker skips the hour
 * rather than committing something plausible.
 */
export class ScanAbortedError extends Error {
  constructor(message: string) {
    super(
      `${message}\n\nThe RPC refused to return the whole holder set. Use a provider ` +
        'that supports large getProgramAccounts scans; do NOT commit a partial snapshot.',
    )
    this.name = 'ScanAbortedError'
  }
}

export interface HoldingsAtSlot {
  slot: bigint
  holdings: Holding[]
}

/**
 * The token program a mint belongs to, read from the mint rather than assumed.
 *
 * **This is not a convenience.** `fetchHoldings` used to default to SPL Token
 * and take an override that neither of its two callers passed. A pump.fun token
 * is **Token-2022** (`docs/references.md`, read 2026-09-02), so both callers
 * would have scanned the wrong program and found nothing — or, with the size
 * filter that was also there, found a handful and called it the holder set.
 * The mint account's owner is the authoritative answer and it costs one read.
 */
export async function tokenProgramOf(rpcUrl: string, mint: string): Promise<string> {
  const account = (await rpc(rpcUrl, 'getAccountInfo', [mint, { encoding: 'base64' }])) as {
    value?: { owner: string; data: [string, string] } | null
  }
  const value = account.value
  if (value == null) throw new Error(`the mint ${mint} does not exist on this cluster`)
  if (value.owner !== TOKEN_PROGRAM_ID && value.owner !== TOKEN_2022_PROGRAM_ID) {
    throw new Error(`${mint} is owned by ${value.owner}, which is not a token program`)
  }
  return value.owner
}

export async function fetchHoldings(args: {
  rpcUrl: string
  mint: string
  /** Read from the mint when absent, which is the only reliable source. */
  tokenProgramId?: string
  /** Refuses to read older than this, so a lagging node cannot answer quietly. */
  minContextSlot?: bigint
}): Promise<HoldingsAtSlot> {
  if (decodeBase58(args.mint).length !== 32) throw new RangeError('mint is not an address')
  const programId = args.tokenProgramId ?? (await tokenProgramOf(args.rpcUrl, args.mint))

  // Two attempts, because the control below compares two reads and a real burn
  // between them looks exactly like a filter bug. A burn is transient; a filter
  // bug is not. One retry separates them without hiding either.
  let last: PartialScanError | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const scan = await scanHolders(args, programId)
    // Read the supply AT OR AFTER the slot the scan was answered at, so the two
    // numbers cannot be compared across a gap in the wrong direction.
    const supply = await readSupply(args.rpcUrl, args.mint, scan.slot)
    const scanned = scan.holdings.reduce((sum, h) => sum + h.balance, 0n)
    // **Zero equals zero, and that is not agreement.** Measured on devnet
    // 2026-09-02: seconds after a mint was created the `getProgramAccounts`
    // index had not caught up, the scan returned no accounts, the supply read
    // at that slot was also 0, and the control passed — a vacuous pass, which
    // is the exact shape CLAUDE.md warns a verification returning nothing
    // takes. An empty holder set is never a snapshot this project may build on.
    if (scan.holdings.length === 0) {
      last = new PartialScanError(0n, supply, 0)
      continue
    }
    if (scanned === supply) return scan
    last = new PartialScanError(scanned, supply, scan.holdings.length)
  }
  throw last
}

async function readSupply(rpcUrl: string, mint: string, minContextSlot: bigint): Promise<bigint> {
  const account = (await rpc(rpcUrl, 'getAccountInfo', [
    mint,
    {
      encoding: 'base64',
      dataSlice: { offset: MINT_SUPPLY_OFFSET, length: 8 },
      minContextSlot: Number(minContextSlot),
    },
  ])) as { value?: { data: [string, string] } | null }
  if (account.value == null) throw new Error(`the mint ${mint} does not exist`)
  return Buffer.from(account.value.data[0], 'base64').readBigUInt64LE(0)
}

async function scanHolders(
  args: { rpcUrl: string; mint: string; minContextSlot?: bigint },
  programId: string,
): Promise<HoldingsAtSlot> {
  const response = await rpc(args.rpcUrl, 'getProgramAccounts', [
    programId,
    {
      encoding: 'base64',
      withContext: true,
      // Only the owner and the amount are needed, so only those 40 bytes are
      // asked for. On a collection-sized holder set this is the difference
      // between a few megabytes and a few hundred kilobytes.
      dataSlice: { offset: OWNER_OFFSET, length: AMOUNT_OFFSET - OWNER_OFFSET + 8 },
      // **No `dataSize` filter.** It used to pin 165, the size of a token
      // account with no extensions. A Token-2022 associated account carries
      // `ImmutableOwner` and is 170. Measured against a real pump.fun mint on
      // 2026-09-02: `dataSize: 165` matched **10** accounts — holding **zero**
      // between them — while no filter matched 626 holding the entire supply.
      // The scan succeeded either way. The mint at offset 0 is what identifies
      // a token account; its length is an implementation detail of which
      // extensions it happens to carry.
      filters: [{ memcmp: { offset: MINT_OFFSET, bytes: args.mint } }],
      ...(args.minContextSlot === undefined
        ? {}
        : { minContextSlot: Number(args.minContextSlot) }),
    },
  ])

  const { context, value } = response as {
    context?: { slot: number }
    value?: { account: { data: [string, string] } }[]
  }
  if (context === undefined || value === undefined) {
    // An empty result and a broken query look identical otherwise, and this is
    // the shape a broken check takes most often (CLAUDE.md).
    throw new Error('the RPC returned no context; the query shape is wrong, not the chain')
  }

  const holdings = value.map(({ account }) => {
    const raw = Buffer.from(account.data[0], 'base64')
    if (raw.length !== 40) throw new Error(`expected a 40-byte slice, got ${raw.length}`)
    return {
      owner: new Uint8Array(raw.subarray(0, 32)),
      balance: raw.readBigUInt64LE(32),
    }
  })
  return { slot: BigInt(context.slot), holdings }
}

/**
 * The scan returned, and it returned the wrong set.
 *
 * Separate from `ScanAbortedError` because it is the opposite failure: that one
 * is the RPC refusing, which is loud. This one is the RPC succeeding over a
 * filter that excluded holders, which is silent and produces a root that
 * verifies.
 */
export class PartialScanError extends Error {
  constructor(scanned: bigint, supply: bigint, accounts: number) {
    super(
      `the scan found ${accounts} accounts holding ${scanned} of a supply of ${supply} ` +
        `(${supply - scanned} unaccounted for). The scan SUCCEEDED, so this is a filter ` +
        'that excluded holders, not an endpoint that refused. Do NOT commit this snapshot.',
    )
    this.name = 'PartialScanError'
  }
}

/** The cluster a URL is pointed at, asked of the node rather than guessed. */
export async function genesisHash(rpcUrl: string): Promise<string> {
  return String(await rpc(rpcUrl, 'getGenesisHash', []))
}

export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'

/**
 * Classified to a name, never a URL fragment, and "unknown" is a real answer
 * (CLAUDE.md, showing the network before a signature).
 */
export async function clusterName(rpcUrl: string): Promise<'mainnet' | 'devnet' | 'unknown'> {
  const hash = await genesisHash(rpcUrl)
  if (hash === MAINNET_GENESIS) return 'mainnet'
  if (hash === DEVNET_GENESIS) return 'devnet'
  return 'unknown'
}

export function assertAddress(value: string, label: string): string {
  if (decodeBase58(value).length !== 32) throw new RangeError(`${label} is not an address`)
  return encodeBase58(decodeBase58(value))
}

// Returns `unknown`: JSON-RPC has no shape until a caller that knows the method
// checks it, and every caller here does exactly that before touching a field.
async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`)
  const body = (await res.json()) as {
    result?: unknown
    error?: { code?: number; message: string }
  }
  if (body.error) {
    if (body.error.code === -32012 || /scan aborted/i.test(body.error.message)) {
      throw new ScanAbortedError(`${method}: ${body.error.message}`)
    }
    throw new Error(`${method}: ${body.error.message}`)
  }
  if (body.result === undefined) throw new Error(`${method}: no result`)
  return body.result
}
