// The two reads the front page makes, both straight from the chain.
//
// Caller: `app/page.tsx`. The event cache in Postgres is not consulted for any
// of this — DESIGN.md §7: *"Every number on the site is a cache of an on-chain
// read and is labelled with its slot."* A page that renders a row a job wrote
// is telling the reader what we recorded, and the reader is specifically the
// person who did not send the transaction.

import { decodeSettled, ownEventPayloads, type SettledEvent } from './events.ts'
import { decodeBase58, encodeBase58 } from '../solana/base58.ts'

export interface LatestOptions {
  rpcUrl: string
  programId: string
  config?: string
  /** How far back to look before giving up. Each page is one RPC round trip. */
  maxPages?: number
}

/**
 * The most recent settlement, found by walking signatures backwards.
 *
 * Deliberately not `fetchIssuanceSettled`, which pages the program's whole
 * history: that is right for a verification and wrong for a page render. This
 * stops at the first match, which is one or two round trips in the ordinary
 * case.
 */
export async function fetchLatestSettled(options: LatestOptions): Promise<SettledEvent | null> {
  if (decodeBase58(options.programId).length !== 32) throw new RangeError('programId is not an address')
  let before: string | undefined
  for (let page = 0; page < (options.maxPages ?? 8); page += 1) {
    const signatures = (await rpc(options.rpcUrl, 'getSignaturesForAddress', [
      options.programId,
      { limit: 100, ...(before === undefined ? {} : { before }) },
    ])) as { signature: string; err: unknown }[]
    if (signatures.length === 0) return null

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
        if (options.config !== undefined && encodeBase58(decoded.config) !== options.config) continue
        return { ...decoded, signature: row.signature, txSlot: BigInt(tx.slot ?? 0) }
      }
    }
    before = signatures[signatures.length - 1]!.signature
  }
  return null
}

export interface Balance {
  /** Raw, in the mint's smallest unit. */
  amount: bigint
  decimals: number
  /** The slot the read was answered at. Every figure on the site carries one. */
  slot: bigint
  accounts: number
}

/**
 * What an address holds of a mint, at the slot the node answered at.
 *
 * `getTokenAccountsByOwner` with a mint filter rather than a derived
 * associated-token address, because **`$PUMP` is a Token-2022 mint**
 * (`docs/references.md`, read 2026-09-01) and an ATA derived with the SPL Token
 * program id is a different, empty account. Deriving the address would produce
 * a confident zero.
 *
 * Balances across several accounts are summed, so a second account cannot hide
 * part of the holding.
 */
export async function readBalance(args: {
  rpcUrl: string
  owner: string
  mint: string
}): Promise<Balance | null> {
  if (decodeBase58(args.owner).length !== 32) throw new RangeError('owner is not an address')
  if (decodeBase58(args.mint).length !== 32) throw new RangeError('mint is not an address')
  const response = (await rpc(args.rpcUrl, 'getTokenAccountsByOwner', [
    args.owner,
    { mint: args.mint },
    { encoding: 'jsonParsed' },
  ])) as {
    context?: { slot: number }
    value?: { account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number } } } } } }[]
  }
  if (response.context === undefined || response.value === undefined) {
    // An empty result and a broken query look identical otherwise (CLAUDE.md).
    throw new Error('the RPC returned no context; the query shape is wrong, not the chain')
  }
  if (response.value.length === 0) return null
  let amount = 0n
  let decimals = 0
  for (const { account } of response.value) {
    const token = account.data.parsed.info.tokenAmount
    amount += BigInt(token.amount)
    decimals = token.decimals
  }
  return { amount, decimals, slot: BigInt(response.context.slot), accounts: response.value.length }
}

/** `1234567` at 6 decimals reads as `1.234567`, with no float anywhere. */
export function formatAmount(amount: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals)
  const whole = (amount / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (decimals === 0) return whole
  return `${whole}.${(amount % unit).toString().padStart(decimals, '0')}`
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
