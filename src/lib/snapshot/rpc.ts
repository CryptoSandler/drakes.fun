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

/** SPL Token. A Token-2022 mint needs the 2022 program id here instead. */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

const TOKEN_ACCOUNT_SIZE = 165
const MINT_OFFSET = 0
const OWNER_OFFSET = 32
const AMOUNT_OFFSET = 64

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

export async function fetchHoldings(args: {
  rpcUrl: string
  mint: string
  tokenProgramId?: string
  /** Refuses to read older than this, so a lagging node cannot answer quietly. */
  minContextSlot?: bigint
}): Promise<HoldingsAtSlot> {
  if (decodeBase58(args.mint).length !== 32) throw new RangeError('mint is not an address')
  const response = await rpc(args.rpcUrl, 'getProgramAccounts', [
    args.tokenProgramId ?? TOKEN_PROGRAM_ID,
    {
      encoding: 'base64',
      withContext: true,
      // Only the owner and the amount are needed, so only those 40 bytes are
      // asked for. On a collection-sized holder set this is the difference
      // between a few megabytes and a few hundred kilobytes.
      dataSlice: { offset: OWNER_OFFSET, length: AMOUNT_OFFSET - OWNER_OFFSET + 8 },
      filters: [
        { dataSize: TOKEN_ACCOUNT_SIZE },
        { memcmp: { offset: MINT_OFFSET, bytes: args.mint } },
      ],
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
