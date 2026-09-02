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

/**
 * The mint's supply, read at or after `minContextSlot`.
 *
 * **The scan's slot and the node's slot are two different clocks now.** The DAS
 * index answers with `last_indexed_slot`, which can be AHEAD of the RPC node
 * serving `getAccountInfo` — measured 2026-09-02, where the supply read failed
 * with *"Minimum context slot has not been reached"* against a slot the index
 * had already passed. Waiting is correct and bounded; giving up on the control
 * because the node is a second behind would throw away the check that catches a
 * partial scan.
 *
 * It waits and does not widen the check: the supply is still read at or after
 * the scan's slot, never before it.
 */
async function readSupply(rpcUrl: string, mint: string, minContextSlot: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await readSupplyOnce(rpcUrl, mint, minContextSlot)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/Minimum context slot has not been reached/i.test(message)) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  throw new Error(
    `the node never reached slot ${minContextSlot}, which the index had already passed. ` +
      'Refusing to compare a supply read before the scan against it.',
  )
}

async function readSupplyOnce(rpcUrl: string, mint: string, minContextSlot: bigint): Promise<bigint> {
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

/** One page of Helius's DAS `getTokenAccounts`. The shape was read from a real
 *  response on 2026-09-02, not from documentation. */
interface TokenAccountsPage {
  last_indexed_slot?: number
  total?: number
  limit?: number
  token_accounts?: { owner: string; amount: number | string }[]
}

/**
 * The holder set, by mint, paginated — which is what **D17 decided on
 * 2026-09-01** and the code never did: *"The read is paginated (DAS /
 * `getTokenAccounts`), and an incomplete page set is a skipped hour, never a
 * partial tree."* It kept using an unpaginated `getProgramAccounts` until
 * Helius started refusing that outright, mid-run, on 2026-09-02.
 *
 * **Indexed by mint, so it is O(holders) and not O(the token program).** The
 * V2 pagination Helius points at in its error walks the whole program and
 * applies the filter per page: against devnet's SPL Token program that is
 * millions of accounts and did not finish in ten minutes. Same answer, wrong
 * axis.
 *
 * **It is an INDEX and it says so.** `last_indexed_slot` is where Helius has
 * read to, not a consensus slot, so the caller's `minContextSlot` check is what
 * keeps a lagging indexer from producing a stale eligible set — and the supply
 * control below is what catches one that is merely incomplete.
 *
 * Returns `null` when the endpoint does not implement it, so the public
 * endpoints still work through the single-shot path they have always used.
 */
async function scanPaged(
  args: { rpcUrl: string; mint: string; minContextSlot?: bigint },
): Promise<HoldingsAtSlot | null> {
  const holdings: { owner: Uint8Array; balance: bigint }[] = []
  const LIMIT = 1_000
  let slot: number | undefined
  let total: number | undefined

  for (let page = 1; page <= 10_000; page += 1) {
    let response: TokenAccountsPage
    try {
      // **DAS takes its params as an OBJECT, not the JSON-RPC array every
      // other method here uses.** Wrapping it in an array sends
      // `params: [{...}]`, which this endpoint rejects -- and the rejection
      // looks exactly like "the method is not implemented", so the code falls
      // back to the unpaginated path and fails there instead. Cast rather than
      // widen `rpc`: one method is odd, the helper is not.
      response = (await rpc(
        args.rpcUrl,
        'getTokenAccounts',
        { mint: args.mint, limit: LIMIT, page } as unknown as unknown[],
      )) as TokenAccountsPage
    } catch (error) {
      // Only on the FIRST page. A method that vanished halfway through a walk
      // is a partial scan, and a partial scan must never become a fallback
      // that looks complete.
      if (page === 1) return null
      throw error
    }

    const rows = response.token_accounts
    if (rows === undefined || response.last_indexed_slot === undefined) {
      throw new Error('getTokenAccounts returned no accounts field; the query shape is wrong')
    }
    slot ??= response.last_indexed_slot
    total ??= response.total

    for (const row of rows) {
      // **A u64 through JSON is a precision hazard.** Above 2^53 a JSON number
      // is already wrong before it reaches us, and a balance that is quietly
      // rounded is a weight that is quietly wrong. Refusing is the only honest
      // answer, and a string amount is parsed exactly.
      if (typeof row.amount === 'number' && !Number.isSafeInteger(row.amount)) {
        throw new Error(
          `a balance came back as the JSON number ${row.amount}, which is past 2^53 and ` +
            'therefore already rounded. Refusing to weight an issuance by it.',
        )
      }
      holdings.push({
        owner: decodeBase58(row.owner),
        balance: BigInt(row.amount),
      })
    }

    // Page numbers, not a cursor: the walk ends on a short page, and the count
    // is checked against the index's own total rather than assumed.
    if (rows.length < LIMIT) {
      if (total !== undefined && holdings.length !== total) {
        throw new Error(
          `the index says ${total} token accounts and the pages returned ${holdings.length}. ` +
            'D17: an incomplete page set is a skipped hour, never a partial tree.',
        )
      }
      return { slot: BigInt(slot), holdings }
    }
  }
  throw new Error('getTokenAccounts did not terminate; refusing a partial holder set')
}

async function scanHolders(
  args: { rpcUrl: string; mint: string; minContextSlot?: bigint },
  programId: string,
): Promise<HoldingsAtSlot> {
  // **Paginated, and the pagination is not optional any more.** Helius began
  // refusing an unpaginated `getProgramAccounts` over a program the size of
  // SPL Token: *"Too many accounts requested (Large number of pubkeys), Please
  // use getProgramAccountsV2 with pagination"*. Measured 2026-09-02, mid-run:
  // the cranker's snapshot step failed on two consecutive hours and neither
  // reached the program. The filter is applied per page, so the pre-filter set
  // is what trips the limit, not our eight holders.
  //
  // **A page can be empty and there can still be more.** Verified against the
  // rig's own mint the same day: the first V2 page returned `count: 0` and a
  // NON-NULL `paginationKey`. Stopping at the first empty page would build a
  // snapshot over nothing and a root that verifies -- the same silent shape
  // D30 fixed in the size filter. The loop runs to a null key, and the supply
  // control below is what catches it if it does not.
  const paged = await scanPaged(args)
  if (paged !== null) return paged

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
