// Does the holder scan see every holder of a Token-2022 mint?
//
//   node scripts/verify-holder-scan.ts            # plant a mint on devnet and check
//   node scripts/verify-holder-scan.ts --mint <m> # check an existing mint anywhere
//
// Caller: the operator, before launch and after any change to
// `src/lib/snapshot/rpc.ts`. Nothing else calls it.
//
// **The incident.** `fetchHoldings` filtered on `dataSize: 165` — a token
// account with no extensions. A Token-2022 associated account carries
// `ImmutableOwner` and is **170** bytes. Measured against a real pump.fun mint
// on mainnet 2026-09-02: the old filter matched **10** accounts holding **zero**
// between them, out of 626 holding the entire supply. The scan SUCCEEDED. A
// snapshot built from it would have produced a Merkle root that verifies
// perfectly over an empty or near-empty holder set.
//
// So this plants the exact shape that broke — a Token-2022 mint with an
// associated account — and asserts both halves: that the new scan finds it and
// balances to the supply, and that **the old filter does not**. A fix whose
// falsification is not run is a fix nobody has seen fail.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fetchHoldings, tokenProgramOf, TOKEN_2022_PROGRAM_ID } from '../src/lib/snapshot/rpc.ts'
import { clusterName } from '../src/lib/snapshot/rpc.ts'

const require = createRequire(import.meta.url)
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } =
  require('@solana/web3.js')
const T = require('@solana/spl-token')

const flag = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1] }

const rpcUrl = process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('RPC_URL is not set')
const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') throw new Error('cluster could not be classified; refusing')

/** The old filter, reproduced exactly, so the falsification is the real thing. */
async function oldScan(mint: string, programId: string) {
  const res = await fetch(rpcUrl!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'getProgramAccounts',
      params: [programId, {
        encoding: 'base64', withContext: true,
        dataSlice: { offset: 32, length: 40 },
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
      }],
    }),
  })
  const body = (await res.json()) as { result: { value: { account: { data: [string, string] } }[] } }
  const rows = body.result.value
  const held = rows.reduce((sum, r) => sum + Buffer.from(r.account.data[0], 'base64').readBigUInt64LE(32), 0n)
  return { accounts: rows.length, held }
}

let mint = flag('mint')
let expectedSupply: bigint | undefined

if (mint === undefined) {
  if (cluster !== 'devnet') throw new Error('planting a mint is devnet-only; pass --mint to check one')
  const keypairPath = `${homedir()}/.local/share/solana-devnet-moneypath/payer.json`
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[]))
  const conn = new Connection(rpcUrl, 'confirmed')
  process.stdout.write(`planting a Token-2022 mint on devnet, payer ${payer.publicKey.toBase58()}\n`)

  const mintKp = Keypair.generate()
  const lamports = await conn.getMinimumBalanceForRentExemption(T.MINT_SIZE)
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: mintKp.publicKey,
      space: T.MINT_SIZE, lamports, programId: new PublicKey(TOKEN_2022_PROGRAM_ID),
    }),
    T.createInitializeMint2Instruction(mintKp.publicKey, 6, payer.publicKey, null, new PublicKey(TOKEN_2022_PROGRAM_ID)),
  )
  await sendAndConfirmTransaction(conn, tx, [payer, mintKp])

  // The associated account is the shape that broke: Token-2022 gives it
  // `ImmutableOwner`, which makes it 170 bytes rather than 165.
  const ata = await T.getOrCreateAssociatedTokenAccount(
    conn, payer, mintKp.publicKey, payer.publicKey, false, undefined, undefined,
    new PublicKey(TOKEN_2022_PROGRAM_ID),
  )
  await T.mintTo(conn, payer, mintKp.publicKey, ata.address, payer, 1_000_000_000n,
    [], undefined, new PublicKey(TOKEN_2022_PROGRAM_ID))

  const size = (await conn.getAccountInfo(ata.address))!.data.length
  process.stdout.write(`  mint ${mintKp.publicKey.toBase58()}\n  associated account ${ata.address.toBase58()} is ${size} bytes\n`)
  if (size === 165) throw new Error('the planted account is 165 bytes; it is not the shape that broke')
  mint = mintKp.publicKey.toBase58()
  expectedSupply = 1_000_000_000n
}

if (mint === undefined) throw new Error('no mint to check')
const target: string = mint
const programId = await tokenProgramOf(rpcUrl, target)
process.stdout.write(`\nmint ${target}\n  token program ${programId}\n`)

const { holdings, slot } = await fetchHoldings({ rpcUrl, mint: target })
const total = holdings.reduce((sum, h) => sum + h.balance, 0n)
process.stdout.write(`  NEW scan: ${holdings.length} accounts, ${total} held, slot ${slot}\n`)
if (expectedSupply !== undefined && total !== expectedSupply) {
  throw new Error(`the new scan found ${total} of ${expectedSupply}`)
}

const old = await oldScan(target, programId)
process.stdout.write(`  OLD filter (dataSize 165): ${old.accounts} accounts, ${old.held} held\n`)

if (old.held >= total && total > 0n) {
  throw new Error(
    'the old filter found as much as the new one, so this mint does not reproduce the defect ' +
      'and this run proves nothing. Plant one, or pass a mint with associated accounts.',
  )
}
process.stdout.write(
  `\nthe old filter would have missed ${total - old.held} of ${total} ` +
    `(${total === 0n ? 'n/a' : `${Number(((total - old.held) * 10000n) / total) / 100}%`})\n`,
)
