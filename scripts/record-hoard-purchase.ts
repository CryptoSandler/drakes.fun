// A hoard purchase, indexed from its own transaction.
//
//   node scripts/record-hoard-purchase.ts --signature <sig> --vault <addr> \
//     --quote-mint <addr> --hoard-mint <addr> [--no-write]
//
// Caller: the operator, after a purchase proposal executes. `/verify` lists what
// this writes.
//
// **The operator supplies a signature and nothing else.** The amounts come from
// the transaction's own pre/post token balances, so a row cannot overstate a
// purchase — and the signature travels with the row so a reader can fetch the
// same transaction and get the same numbers. Typing the amounts in by hand
// would make this table a claim; reading them makes it an index.

import { connect } from '../src/lib/db/client.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'
import { rpc } from '../src/lib/chain/rpc.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const need = (name: string): string => {
  const v = flag(name)
  if (v === undefined) throw new Error(`--${name} is required`)
  return v
}

const rpcUrl = process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
const signature = need('signature')
const vault = need('vault')
const quoteMint = need('quote-mint')
const hoardMint = need('hoard-mint')

const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') throw new Error('the cluster could not be classified; refusing')

interface Balance { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } }
const tx = (await rpc(rpcUrl, 'getTransaction', [
  signature,
  { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
])) as {
  slot: number
  blockTime?: number
  meta: { err: unknown; preTokenBalances: Balance[]; postTokenBalances: Balance[] }
} | null

if (tx === null) throw new Error('the endpoint does not have that transaction; try one with more history')
if (tx.meta.err !== null) throw new Error('that transaction failed on chain; nothing was purchased')

/** The vault's delta for one mint, from the transaction's own balances. */
function delta(mint: string): bigint {
  const pick = (rows: Balance[]) =>
    rows.filter((b) => b.mint === mint && b.owner === vault).reduce((sum, b) => sum + BigInt(b.uiTokenAmount.amount), 0n)
  const pre = pick(tx!.meta.preTokenBalances)
  const post = pick(tx!.meta.postTokenBalances)
  return post - pre
}

const quoteDelta = delta(quoteMint)
const hoardDelta = delta(hoardMint)

// A purchase spends the quote and receives the hoard token. Anything else is a
// different event and must not be filed as a purchase.
if (quoteDelta >= 0n) throw new Error(`the vault did not spend ${quoteMint} in that transaction (delta ${quoteDelta})`)
if (hoardDelta <= 0n) throw new Error(`the vault did not receive ${hoardMint} in that transaction (delta ${hoardDelta})`)

const row = {
  signature,
  cluster,
  vault,
  solSpent: (-quoteDelta).toString(),
  pumpReceived: hoardDelta.toString(),
  slot: tx.slot,
  blockTime: tx.blockTime === undefined ? null : new Date(tx.blockTime * 1000).toISOString(),
}
process.stdout.write(`${JSON.stringify(row, null, 1)}\n`)

if (process.argv.includes('--no-write')) process.exit(0)
const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl === '') throw new Error('DATABASE_URL is not set')
const db = await connect(databaseUrl)
try {
  await db.query(
    `insert into hoard_purchases (signature, cluster, vault, sol_spent, pump_received, slot, block_time)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (signature) do nothing`,
    [row.signature, row.cluster, row.vault, row.solSpent, row.pumpReceived, row.slot, row.blockTime],
  )
  process.stdout.write('recorded\n')
} finally {
  await db.end()
}
