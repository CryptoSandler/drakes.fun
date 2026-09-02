// Wrapping a Jupiter swap in a Squads vault transaction, and refusing to send
// one that will not fit in a packet.
//
// Caller: `scripts/verify-jupiter-vault.ts` (the rehearsal) and, from Phase 2
// onward, whatever builds the monthly conversion proposal named in
// `DESIGN.md` §3.6. Nothing in the site or the cranker calls it.
//
// **Why this exists as a guard rather than as a comment.** A Squads conversion
// is two transactions and each has its own ceiling:
//
//   1. `vaultTransactionCreate` carries the *whole inner message* as
//      instruction data, so it grows with the route.
//   2. `vaultTransactionExecute` carries *every account* the inner
//      instructions touch, so it grows with the route too, in a different
//      currency.
//
// Measured against mainnet on 2026-09-01, a SOL→$PUMP swap of 0.002 came back
// on five different routes in fourteen quotes — one to three hops — and the
// create transaction ranged from 672 to 1098 bytes against a 1232-byte packet.
// **The margin at the worst observed route is one hop.** Jupiter picks the
// route; we do not, and a route that is one hop longer than any we have seen
// produces a transaction that cannot be sent.
//
// Jupiter's `maxAccounts` looks like the bound and is not: at `maxAccounts=24`
// the wrapped transaction measured *larger* than at `maxAccounts=48`, because
// that parameter bounds Jupiter's own transaction and not one wrapped in a
// Squads message. The only honest bound is to build both transactions and
// measure them, which is what `assertFits` does.

import type {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js'

/** 1280-byte IPv6 MTU less a 48-byte header. Solana's hard transaction ceiling. */
export const PACKET_LIMIT = 1232

/**
 * How close to the ceiling we are willing to sail.
 *
 * A transaction that fits at quote time and not at send time is the failure
 * this reserve is for: the blockhash changes, and an address that was in a
 * lookup table can be absent from the next one Jupiter names. 64 bytes is one
 * extra static account key plus change.
 */
export const HEADROOM = 64

export interface Sizes {
  create: number
  execute: number
  /** Bytes to spare on the tighter of the two, after `HEADROOM`. */
  spare: number
  fits: boolean
}

export function measure(createTxBytes: number, executeTxBytes: number): Sizes {
  const spare = Math.min(PACKET_LIMIT - createTxBytes, PACKET_LIMIT - executeTxBytes) - HEADROOM
  return { create: createTxBytes, execute: executeTxBytes, spare, fits: spare >= 0 }
}

/**
 * Refuse a route that does not fit, and say by how much.
 *
 * The caller's answer to this is to quote again — the route changes on its own
 * every few seconds — not to raise the limit, which is not ours to raise.
 */
export function assertFits(sizes: Sizes, route: string[]): void {
  if (sizes.fits) return
  throw new Error(
    `refusing to build the proposal: route ${route.join(' > ')} produces ` +
      `create=${sizes.create}B execute=${sizes.execute}B against a ${PACKET_LIMIT}B packet ` +
      `(${HEADROOM}B reserved); over by ${-sizes.spare}B. Re-quote — the route changes.`,
  )
}

export interface JupiterInstruction {
  programId: string
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]
  data: string
}

export interface JupiterSwapInstructions {
  setupInstructions?: JupiterInstruction[]
  swapInstruction: JupiterInstruction
  cleanupInstruction?: JupiterInstruction
  addressLookupTableAddresses?: string[]
}

/**
 * The instructions that go *inside* the vault transaction.
 *
 * Jupiter's `computeBudgetInstructions` are deliberately dropped: a compute
 * budget set inside a CPI does nothing, and the budget that matters belongs on
 * the outer execute transaction where the caller puts it.
 */
export function innerInstructions(
  swap: JupiterSwapInstructions,
  toInstruction: (i: JupiterInstruction) => TransactionInstruction,
): TransactionInstruction[] {
  return [
    ...(swap.setupInstructions ?? []).map(toInstruction),
    toInstruction(swap.swapInstruction),
    ...(swap.cleanupInstruction === undefined ? [] : [toInstruction(swap.cleanupInstruction)]),
  ]
}

/**
 * The destination assertion, restated for a swap.
 *
 * `docs/moneypath-devnet.md` records an SDK helper that silently sent an entire
 * fee to the operator with a successful transaction. The lesson generalises:
 * before a proposal is created, the account Jupiter named as the user must be
 * the vault, on every instruction that carries it as a signer.
 */
export function assertUserIsVault(
  instructions: TransactionInstruction[],
  vault: PublicKey,
): void {
  for (const ix of instructions) {
    for (const key of ix.keys) {
      if (key.isSigner && !key.pubkey.equals(vault)) {
        throw new Error(
          `refusing to build the proposal: ${ix.programId.toBase58()} wants a signature from ` +
            `${key.pubkey.toBase58()}, which is not the vault ${vault.toBase58()}`,
        )
      }
    }
  }
}

/**
 * The accounts a conversion touches that are known *before* a route is quoted.
 *
 * These are what a project-owned lookup table can hold, and the reason it can
 * only be worth so much: the proposal and transaction PDAs move with every
 * conversion index, and the pool accounts *are* the route. Measured at a
 * consistent 90 bytes off the execute transaction (`DESIGN.md` §3.7).
 *
 * An address lookup table cannot be extended and used in the same slot, so
 * this list is deliberately the stable one — a table that needed extending per
 * conversion would be a table that is not ready when the conversion is.
 */
export function routeIndependentAccounts(args: {
  multisig: string
  vault: string
  quoteMint: string
  hoardMint: string
}): string[] {
  return [
    args.multisig,
    args.vault,
    args.quoteMint,
    args.hoardMint,
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022, which $PUMP is
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // associated token
    '11111111111111111111111111111111', // system
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
    'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf', // Squads v4
  ]
}

export interface LookupTableReader {
  getMultipleAccountsInfo: Connection['getMultipleAccountsInfo']
}

/** Address lookup tables named by a quote, read from the chain. */
export async function readLookupTables(
  conn: LookupTableReader,
  addresses: string[],
  make: (key: PublicKey, data: Buffer) => AddressLookupTableAccount,
  toKey: (s: string) => PublicKey,
): Promise<AddressLookupTableAccount[]> {
  if (addresses.length === 0) return []
  const keys = addresses.map(toKey)
  const infos = await conn.getMultipleAccountsInfo(keys)
  const tables: AddressLookupTableAccount[] = []
  keys.forEach((key, i) => {
    const info = infos[i]
    // A table Jupiter named but the chain does not have is not a table we can
    // silently drop: every address it held would fall back to a static key and
    // the transaction would silently grow past the packet.
    if (info == null) throw new Error(`lookup table ${key.toBase58()} named by the quote does not exist`)
    tables.push(make(key, info.data))
  })
  return tables
}
