// Does a Jupiter swap fit inside a Squads proposal, and does it execute?
//
//   node scripts/verify-jupiter-vault.ts --dry [--samples 14]
//   node scripts/verify-jupiter-vault.ts --run --amount 2000000
//
// Caller: the operator, before the first conversion named in `DESIGN.md` §3.6
// and after any Squads or Jupiter upgrade. Nothing else calls it.
//
// `--dry` costs nothing and answers the size question: it quotes repeatedly,
// wraps each route in the two transactions a Squads conversion needs, and
// prints the distribution. `--run` spends real SOL and answers the question a
// measurement cannot — whether the nested CPI executes.
//
// **The rehearsal multisig is disposable and is asserted to be disposable.** A
// relative check ("is this not the real one") passes when the real one is
// unset, so the check here is absolute: the multisig must be the one derived
// from the rehearsal create-key in the rehearsal keystore, and the swap amount
// must be small. `CLAUDE.md`: a schema guard is never `==`.

import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  assertFits,
  assertUserIsVault,
  innerInstructions,
  measure,
  readLookupTables,
  routeIndependentAccounts,
  type JupiterSwapInstructions,
} from '../src/lib/hoard/vault-swap.ts'

const require = createRequire(import.meta.url)
const {
  AddressLookupTableAccount, Connection, Keypair, PublicKey,
  TransactionInstruction, TransactionMessage, VersionedTransaction,
} = require('@solana/web3.js')
const multisig = require('@sqds/multisig')

const flag = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1] }
const has = (n: string) => process.argv.includes(`--${n}`)

const KEYSTORE = `${homedir()}/.local/share/drakes-mainnet-jupiter`
const JUP = 'https://lite-api.jup.ag/swap/v1'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const PUMP_MINT = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'
const SQUADS = new PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf')
const EXECUTE_DISCRIMINATOR = Buffer.from([194, 8, 161, 87, 153, 164, 25, 171])

// Derived, then asserted against the value the SDK bundles, because a
// discriminator recalled from memory is the reliable way to sign the wrong
// instruction (CLAUDE.md).
{
  const { createHash } = require('node:crypto')
  const derived = createHash('sha256').update('global:vault_transaction_execute').digest().subarray(0, 8)
  if (!derived.equals(EXECUTE_DISCRIMINATOR)) throw new Error('the execute discriminator does not derive')
}

const rpcUrl = process.env.MAINNET_RPC_URL ?? process.env.RPC_URL
if (rpcUrl === undefined || rpcUrl === '') throw new Error('no RPC URL')
const conn = new Connection(rpcUrl, 'confirmed')

const { clusterName } = await import('../src/lib/snapshot/rpc.ts')
const cluster = await clusterName(rpcUrl)
if (cluster === 'unknown') throw new Error('cluster could not be classified; refusing')
if (cluster !== 'mainnet') throw new Error(`this rehearsal is about mainnet routing; the RPC is ${cluster}`)

const key = (name: string) => {
  const p = `${KEYSTORE}/${name}.json`
  if (!existsSync(p)) throw new Error(`${name} is not in the rehearsal keystore; it is not in this repository either`)
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8')) as number[]))
}

const createKey = key('create-key').publicKey
const [multisigPda] = multisig.getMultisigPda({ createKey })
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

const toIx = (i: { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }) =>
  new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(i.data, 'base64'),
  })

interface Wrapped {
  route: string[]
  outAmount: string
  createSize: number
  executeSize: number
  messageBytes: number
  remaining: number
  createIx: InstanceType<typeof TransactionInstruction>
  executeIx: InstanceType<typeof TransactionInstruction>
  lookupTableAccounts: InstanceType<typeof AddressLookupTableAccount>[]
  innerMessage: InstanceType<typeof TransactionMessage>
  tables: InstanceType<typeof AddressLookupTableAccount>[]
}

/**
 * The project-owned lookup table, as it would exist on chain.
 *
 * Synthetic here: `--with-table` measures what deploying one would buy before
 * anyone pays rent for it. The addresses are the real ones.
 */
const projectTable = has('with-table')
  ? new AddressLookupTableAccount({
      key: new PublicKey('11111111111111111111111111111112'),
      state: {
        deactivationSlot: 2n ** 64n - 1n,
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: routeIndependentAccounts({
          multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(),
          quoteMint: SOL_MINT, hoardMint: PUMP_MINT,
        }).map((a) => new PublicKey(a)),
      },
    })
  : undefined

async function wrap(amount: number, transactionIndex: bigint, member: InstanceType<typeof PublicKey>, blockhash: string): Promise<Wrapped> {
  const quote = (await (await fetch(
    `${JUP}/quote?inputMint=${SOL_MINT}&outputMint=${PUMP_MINT}&amount=${amount}&slippageBps=100`,
  )).json()) as { routePlan: { swapInfo: { label: string } }[]; outAmount: string; error?: string }
  if (quote.error !== undefined) throw new Error(`quote: ${quote.error}`)

  const swap = (await (await fetch(`${JUP}/swap-instructions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: vaultPda.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: false }),
  })).json()) as JupiterSwapInstructions & { error?: string }
  if (swap.error !== undefined) throw new Error(`swap-instructions: ${swap.error}`)

  const tables = await readLookupTables(
    conn, swap.addressLookupTableAddresses ?? [],
    (k, data) => new AddressLookupTableAccount({ key: k, state: AddressLookupTableAccount.deserialize(data) }),
    (s) => new PublicKey(s),
  )

  const inner = innerInstructions(swap, toIx)
  assertUserIsVault(inner, vaultPda)

  const innerMessage = new TransactionMessage({ payerKey: vaultPda, recentBlockhash: blockhash, instructions: inner })
  const messageBytes = multisig.utils.transactionMessageToMultisigTransactionMessageBytes({
    message: innerMessage, addressLookupTableAccounts: tables, vaultPda,
  })

  const [transactionPda] = multisig.getTransactionPda({ multisigPda, index: transactionIndex })
  const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex })

  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda, transactionIndex, creator: member, vaultIndex: 0, ephemeralSigners: 0,
    transactionMessage: innerMessage, addressLookupTableAccounts: tables,
  })
  const createTx = new VersionedTransaction(
    new TransactionMessage({ payerKey: member, recentBlockhash: blockhash, instructions: [createIx] }).compileToV0Message(),
  )
  createTx.signatures = [new Uint8Array(64)]

  const decoded = multisig.types.transactionMessageBeet.deserialize(Buffer.from(messageBytes))[0]
  const { accountMetas, lookupTableAccounts } = await multisig.utils.accountsForTransactionExecute({
    connection: conn, message: decoded, ephemeralSignerBumps: [], vaultPda, transactionPda,
    addressLookupTableAccounts: tables,
  })
  const executeIx = new TransactionInstruction({
    programId: SQUADS,
    keys: [
      { pubkey: multisigPda, isSigner: false, isWritable: false },
      { pubkey: proposalPda, isSigner: false, isWritable: true },
      { pubkey: transactionPda, isSigner: false, isWritable: false },
      { pubkey: member, isSigner: true, isWritable: false },
      ...accountMetas,
    ],
    data: EXECUTE_DISCRIMINATOR,
  })
  const executeTx = new VersionedTransaction(
    new TransactionMessage({ payerKey: member, recentBlockhash: blockhash, instructions: [executeIx] })
      .compileToV0Message(projectTable === undefined ? lookupTableAccounts : [...lookupTableAccounts, projectTable]),
  )
  executeTx.signatures = [new Uint8Array(64)]

  return {
    route: quote.routePlan.map((h) => h.swapInfo.label), outAmount: quote.outAmount,
    createSize: createTx.serialize().length, executeSize: executeTx.serialize().length,
    messageBytes: messageBytes.length, remaining: accountMetas.length,
    createIx, executeIx, lookupTableAccounts, innerMessage, tables,
  }
}

if (has('dry')) {
  const samples = Number(flag('samples') ?? 14)
  const amount = Number(flag('amount') ?? 2_000_000)
  const { blockhash } = await conn.getLatestBlockhash()
  const member = key('ms-a').publicKey
  console.log(`vault ${vaultPda.toBase58()} · ${samples} quotes of ${amount} lamports SOL -> $PUMP\n`)
  console.log(' #  hops  msg  create  exec  fits  route')
  const rows: Wrapped[] = []
  for (let i = 0; i < samples; i += 1) {
    try {
      const w = await wrap(amount, 1n, member, blockhash)
      rows.push(w)
      // `--buffered` models the transaction-buffer path: the inner message is
    // uploaded in chunks, so the create transaction stops carrying it and
    // stops being a ceiling. The execute side is untouched by it.
    const s = measure(has('buffered') ? 0 : w.createSize, w.executeSize)
      // The same guard the conversion will run, exercised on every sample: a
      // dry run that measured without refusing would report a route as
      // sendable that the real path rejects.
      let refusal = ''
      try {
        assertFits(s, w.route)
      } catch (error) {
        refusal = ` — ${(error as Error).message.slice(-40)}`
      }
      console.log(
        `${String(i + 1).padStart(2)}  ${String(w.route.length).padStart(4)}  ${String(w.messageBytes).padStart(4)}` +
          `  ${String(w.createSize).padStart(6)}  ${String(w.executeSize).padStart(4)}  ${refusal === '' ? ' yes' : ' NO '}  ${w.route.join(' > ')}${refusal}`,
      )
    } catch (error) {
      console.log(`${String(i + 1).padStart(2)}  ${(error as Error).message.slice(0, 70)}`)
    }
    await new Promise((r) => setTimeout(r, 1_200))
  }
  if (rows.length === 0) throw new Error('no sample succeeded; the instrument is broken, not the route')
  const create = rows.map((r) => r.createSize)
  const exec = rows.map((r) => r.executeSize)
  const distinct = new Set(rows.map((r) => r.route.join('>'))).size
  console.log(`\ncreate  ${Math.min(...create)}–${Math.max(...create)} B`)
  console.log(`execute ${Math.min(...exec)}–${Math.max(...exec)} B`)
  console.log(`hops    ${Math.min(...rows.map((r) => r.route.length))}–${Math.max(...rows.map((r) => r.route.length))}`)
  console.log(`routes  ${distinct} distinct in ${rows.length} quotes`)
  const worst = measure(Math.max(...create), Math.max(...exec))
  console.log(`worst observed leaves ${worst.spare} B of usable margin — about ${(worst.spare / 212).toFixed(1)} hops`)
  process.exit(worst.fits ? 0 : 4)
}

if (!has('run')) throw new Error('pass --dry (free) or --run (spends real SOL)')

// ---- the spending path ----
const amount = Number(flag('amount') ?? 2_000_000)
if (amount > 5_000_000) throw new Error(`refusing: ${amount} lamports is not a rehearsal amount`)

const operator = key('operator')
const balance = await conn.getBalance(operator.publicKey)
if (balance < 20_000_000) {
  throw new Error(
    `the rehearsal operator ${operator.publicKey.toBase58()} holds ${(balance / 1e9).toFixed(6)} SOL; ` +
      'it needs about 0.035. Fund it from a route of your choosing — this repository does not record one.',
  )
}
console.log('operator', operator.publicKey.toBase58(), (balance / 1e9).toFixed(6), 'SOL')
console.log('multisig', multisigPda.toBase58(), '\nvault   ', vaultPda.toBase58())
throw new Error('the spending path stops here until the operator is funded; run --dry for the size answer')
