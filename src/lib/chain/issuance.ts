// One hour, read off the chain by itself.
//
// Caller: `app/verify/[hour]/page.tsx` (the permalink) and
// `src/lib/bot/run.ts`, which puts the permalink's URL in every post.
//
// **Why this is not `fetchIssuanceSettled` with a filter.** That function pages
// the program's entire signature history, which is right for a full replay and
// absurd for one row: at 4,000 issuances it is ~8,000 RPC calls to answer a
// question about one. This is two calls and does not get slower as the
// collection fills.
//
// **Why the account and the event, and not either alone.** The account carries
// the settled facts — recipient, piece, point, eligible supply — and is the
// cheapest thing to find, because `hour` sits at a fixed offset and a `memcmp`
// picks it out in one call. It does **not** carry the revealed randomness: the
// program stores the oracle's ACCOUNT, not the 32 bytes it revealed. So the one
// claim the page exists to make — *the recipient was derived, not chosen* —
// needs the event, and the event lives in the settle transaction's logs. Two
// reads, both from the chain, neither from us.

import { HOLDER_DOMAIN, uniformIndex } from '../protocol/survivors.ts'
import { decodeBase58, encodeBase58 } from '../solana/base58.ts'
import { decodeSettled, ownEventPayloads, type SettledEvent } from './events.ts'
import { rpc } from './rpc.ts'

/**
 * `Issuance`, from `programs/issuance/src/lib.rs`. 8 discriminator bytes and
 * then the struct, in declaration order.
 *
 * The offsets are written out rather than computed from a schema, and they were
 * checked against a real devnet account on **2026-09-02** — hour 378, piece
 * 2951, `point` inside `eligible_supply` — before a line of the page was
 * written. A layout guessed from a struct reads plausibly and is wrong in
 * exactly the way nothing catches.
 */
export const ISSUANCE_SIZE = 184
const AT = {
  bump: 8,
  hour: 9,
  pieceIndex: 17,
  snapshotSlot: 21,
  root: 29,
  commitment: 61,
  eligibleSupply: 93,
  randomness: 101,
  requestedAt: 133,
  settled: 141,
  recipient: 142,
  point: 174,
  pieceId: 182,
} as const

export interface IssuanceAccount {
  /** The account's own address, which is what the signature walk needs. */
  address: string
  hour: bigint
  /** Which piece this hour would issue. It does not advance on a skipped hour. */
  pieceIndex: number
  snapshotSlot: bigint
  root: string
  commitment: string
  eligibleSupply: bigint
  /** The randomness ACCOUNT, not the value. */
  randomness: string
  requestedAt: bigint
  settled: boolean
  recipient: string
  point: bigint
  /** `0xffff` when nothing was issued. */
  pieceId: number
}

export function decodeIssuance(address: string, data: Uint8Array): IssuanceAccount {
  if (data.length !== ISSUANCE_SIZE) {
    throw new Error(`${data.length} bytes, not ${ISSUANCE_SIZE}: this is not an issuance account`)
  }
  const view = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  const settled = view[AT.settled]!
  // Borsh admits 0 and 1. A third value means the layout moved under us, and a
  // decoder that shrugs at that publishes a confident wrong answer.
  if (settled > 1) throw new Error(`settled byte was ${settled}; the layout has changed`)
  const key = (at: number) => encodeBase58(data.subarray(at, at + 32))
  const hex = (at: number) => Buffer.from(data.subarray(at, at + 32)).toString('hex')
  return {
    address,
    hour: view.readBigUInt64LE(AT.hour),
    pieceIndex: view.readUInt32LE(AT.pieceIndex),
    snapshotSlot: view.readBigUInt64LE(AT.snapshotSlot),
    root: hex(AT.root),
    commitment: hex(AT.commitment),
    eligibleSupply: view.readBigUInt64LE(AT.eligibleSupply),
    randomness: key(AT.randomness),
    requestedAt: view.readBigInt64LE(AT.requestedAt),
    settled: settled === 1,
    recipient: key(AT.recipient),
    point: view.readBigUInt64LE(AT.point),
    pieceId: view.readUInt16LE(AT.pieceId),
  }
}

/** The program's marker for "this hour issued nothing". */
export const NOTHING_ISSUED = 0xffff

export interface HourOptions {
  rpcUrl: string
  programId: string
}

/**
 * The issuance account for one hour, or `null` when that hour was never
 * requested.
 *
 * `memcmp` on the hour at its fixed offset, with the size filter beside it so
 * the config and the survivors account are never candidates. One call.
 */
export async function fetchIssuanceByHour(
  options: HourOptions & { hour: bigint },
): Promise<IssuanceAccount | null> {
  if (decodeBase58(options.programId).length !== 32) throw new RangeError('programId is not an address')
  if (options.hour < 0n) throw new RangeError('an hour is not negative')

  const seed = Buffer.alloc(8)
  seed.writeBigUInt64LE(options.hour)
  const accounts = (await rpc(options.rpcUrl, 'getProgramAccounts', [
    options.programId,
    {
      encoding: 'base64',
      filters: [
        { dataSize: ISSUANCE_SIZE },
        { memcmp: { offset: AT.hour, bytes: encodeBase58(seed) } },
      ],
    },
  ])) as { pubkey: string; account: { data: [string, string] } }[]

  if (accounts.length === 0) return null
  if (accounts.length > 1) {
    // The hour seeds the PDA, so the program cannot produce two. Seeing two
    // means the filter is not selecting what this function claims it selects.
    throw new Error(`${accounts.length} accounts for hour ${options.hour}; the filter is wrong`)
  }
  const row = accounts[0]!
  const decoded = decodeIssuance(row.pubkey, new Uint8Array(Buffer.from(row.account.data[0], 'base64')))
  if (decoded.hour !== options.hour) {
    // The absolute assertion: we asked for an hour and we check we got it,
    // rather than trusting that the filter did what it was told.
    throw new Error(`asked for hour ${options.hour}, the account says ${decoded.hour}`)
  }
  return decoded
}

/**
 * The settlement event for an issuance account, found through the account's own
 * signatures rather than the program's.
 *
 * An issuance account is touched twice in its life — requested, then settled —
 * so this is a short list whatever the collection's size.
 */
export async function fetchSettledFor(
  options: HourOptions & { account: string },
): Promise<SettledEvent | null> {
  const signatures = (await rpc(options.rpcUrl, 'getSignaturesForAddress', [
    options.account,
    { limit: 25 },
  ])) as { signature: string; err: unknown }[]

  for (const row of signatures) {
    if (row.err !== null) continue
    const tx = (await rpc(options.rpcUrl, 'getTransaction', [
      row.signature,
      { maxSupportedTransactionVersion: 0, encoding: 'json' },
    ])) as { slot?: number; meta?: { err: unknown; logMessages?: string[] } } | null
    if (tx?.meta == null || tx.meta.err !== null) continue
    for (const payload of ownEventPayloads(tx.meta.logMessages ?? [], options.programId)) {
      const decoded = decodeSettled(payload)
      if (decoded === null) continue
      return { ...decoded, signature: row.signature, txSlot: BigInt(tx.slot ?? 0) }
    }
  }
  return null
}

export interface Permalink {
  account: IssuanceAccount
  /** Absent when the hour was requested and never settled. */
  event: SettledEvent | null
  /** The point recomputed here from the revealed value and the eligible supply. */
  derived: bigint | null
  /** `derived === account.point`. Null when there is no event to derive from. */
  agrees: boolean | null
}

/**
 * Everything `/verify/<hour>` renders, read in this request, from the chain.
 *
 * The derivation is recomputed rather than read: `point` is a pure function of
 * the revealed value and the eligible supply, and the whole claim of the page
 * is that a stranger gets the same answer we did.
 */
export async function fetchPermalink(options: HourOptions & { hour: bigint }): Promise<Permalink | null> {
  const account = await fetchIssuanceByHour(options)
  if (account === null) return null
  const event = account.settled
    ? await fetchSettledFor({ ...options, account: account.address })
    : null
  const derived =
    event !== null && event.eligibleSupply > 0n
      ? uniformIndex(event.randomnessValue, event.eligibleSupply, HOLDER_DOMAIN)
      : null
  return {
    account,
    event,
    derived,
    agrees: derived === null ? null : derived === account.point,
  }
}
